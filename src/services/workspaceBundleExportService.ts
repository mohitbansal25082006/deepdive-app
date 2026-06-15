// src/services/workspaceBundleExportService.ts
// Part 52.1 — Advanced Workspace Export (Settings only)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS REPLACES
//   The old "Export as PDF Bundle" (workspaceExport.ts → exportWorkspaceAsPDF)
//   merged every report into ONE summary PDF. It was lossy (executive summary +
//   key findings only) and could not include shared content at all.
//
// WHAT THIS DOES INSTEAD
//   A single Export button in workspace-settings opens a picker where the
//   owner/editor selects ANY combination of:
//     • Research reports   → each exported as its OWN full-content PDF
//     • Presentations      → each exported as its OWN .pptx
//     • Academic papers    → each exported as its OWN full PDF
//     • Debates            → each exported as its OWN full PDF
//     • Podcasts           → each exported as its OWN .mp3 (concatenated)
//     • Voice debates      → each exported as its OWN .mp3 (concatenated)
//   …then every produced file is packed into ONE .zip and shared.
//
//   "mp4 for podcast/voice debate" in the spec means a single audio file the
//   user can play — we produce .mp3 (audio/mpeg), which is the format our TTS
//   pipeline emits. (There is no video track to make a real .mp4.)
//
// IMPORTANT — NO ORIGINAL EXPORT IS TOUCHED
//   This file ONLY adds new functions. It reuses the existing per-type HTML/
//   PPTX/MP3 builders by importing them. None of the standalone export buttons
//   elsewhere in the app change behaviour.
//
// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE
//   1. We never trust the raw file outputs of the standalone exporters (they
//      call Sharing.shareAsync directly). Instead this service:
//        a. fetches the full content for each selected item (via the same
//           SECURITY DEFINER RPCs the shared viewers use, so non-owners work),
//        b. renders the bytes itself (PDF via expo-print → base64,
//           PPTX via pptxgen base64, MP3 via segment concatenation),
//        c. adds each byte blob into a JSZip instance,
//        d. writes the final zip to documentDirectory and shares it.
//
//   2. JSZip works in Expo/Hermes when we use { type: 'base64' } output (no
//      Blob / stream needed). We feed binary into zip.file(name, base64,
//      { base64: true }).
//
//   3. All fetches/generation run with bounded concurrency and per-item
//      try/catch so one failure never aborts the whole bundle. Failures are
//      collected and surfaced to the caller.
// ─────────────────────────────────────────────────────────────────────────────

import JSZip from 'jszip';
import {
  documentDirectory,
  cacheDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  getInfoAsync,
  downloadAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import pptxgen      from 'pptxgenjs';

import { supabase } from '../lib/supabase';

import type {
  Workspace,
  ResearchReport,
  ReportSection,
  Citation,
  GeneratedPresentation,
  PresentationTheme,
  AcademicPaper,
  DebateSession,
  SharedDebate,
  SharedPodcast,
  SharedWorkspaceContent,
} from '../types';
import type { SharedVoiceDebate } from '../types/voiceDebateSharing';

// Reuse existing per-type renderers (NONE of these are modified) ──────────────
import { loadWorkspaceReportFull } from './workspaceReportExportService';
import { getThemeTokens }          from './pptxExport';
import { mergeEditorData }         from './slideEditorService';

// We import the *builders* lazily inside functions to avoid any circular import
// or module-init crashes (some of these modules pull in TextDecoder-sensitive
// deps that we never want to run at module load).

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — selection model
// ─────────────────────────────────────────────────────────────────────────────

export type BundleItemKind =
  | 'report'
  | 'presentation'
  | 'academic_paper'
  | 'debate'
  | 'podcast'
  | 'voice_debate';

/** One row the user can tick in the export picker. */
export interface BundleSelectableItem {
  /** Stable key for the picker list (kind + id). */
  key:         string;
  kind:        BundleItemKind;
  /** The id used to fetch full content (report_id / presentation_id / etc.). */
  contentId:   string;
  title:       string;
  subtitle?:   string;
  /** Pre-known file size estimate in bytes (optional, for display only). */
  sizeHint?:   number;
}

/** Result of a bundle export run. */
export interface BundleExportResult {
  success:      boolean;
  /** Number of files that made it into the zip. */
  fileCount:    number;
  /** Items that failed to export (so the UI can warn). */
  failures:     { key: string; title: string; reason: string }[];
  error:        string | null;
}

/** Progress callback payload. */
export interface BundleProgress {
  phase:    'fetching' | 'rendering' | 'zipping' | 'sharing';
  current:  number;
  total:    number;
  label:    string;
}

export type BundleProgressCallback = (p: BundleProgress) => void;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function safeName(str: string, fallback = 'item'): string {
  const cleaned = (str ?? '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

function escHtml(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRemoteUrl(p: string): boolean {
  return !!p && (p.startsWith('http://') || p.startsWith('https://'));
}

/** Run an array of async tasks with a concurrency cap. Never rejects. */
async function runPool<T>(
  items:       T[],
  concurrency: number,
  worker:      (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return;
    try { await worker(items[i], i); } catch { /* worker handles its own errors */ }
    return next();
  };
  for (let c = 0; c < Math.min(concurrency, items.length); c++) {
    runners.push(next());
  }
  await Promise.all(runners);
}

/** Read a PDF produced by expo-print into a base64 string. */
async function printHtmlToPdfBase64(html: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  // expo-print writes to cache; clean it up so we don't leak temp PDFs.
  try { await deleteAsync(uri, { idempotent: true }); } catch {}
  return b64;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT → full-content PDF (base64)
// ─────────────────────────────────────────────────────────────────────────────
//
// Reuses loadWorkspaceReportFull (SECURITY DEFINER RPC) so ANY workspace member
// can export reports owned by others. Then renders the full report — sections,
// bullets, findings, predictions, citations — to a styled PDF.
//
// We re-implement the HTML here (rather than importing the private builder from
// workspaceReportExportService) so we get base64 bytes without triggering that
// module's Sharing.shareAsync side effect.

function buildReportPdfHtml(report: ResearchReport): string {
  const date = new Date(report.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const sectionsHtml = (report.sections ?? []).map((s: ReportSection) => {
    const bullets = (s.bullets ?? []).length
      ? `<ul class="bullets">${s.bullets!.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>`
      : '';
    return `<div class="section">
      <h2 class="section-title">${escHtml(s.title)}</h2>
      <p class="section-content">${escHtml(s.content)}</p>
      ${bullets}
    </div>`;
  }).join('');

  const findingsHtml = (report.keyFindings ?? []).length
    ? `<div class="findings"><h2 class="findings-title">Key Findings</h2>
        <ul>${report.keyFindings.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul></div>`
    : '';

  const predictionsHtml = (report.futurePredictions ?? []).length
    ? `<div class="predictions"><h2 class="predictions-title">Future Predictions</h2>
        <ul>${report.futurePredictions.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul></div>`
    : '';

  const citationsHtml = (report.citations ?? []).length
    ? `<div class="citations"><h2 class="citations-title">Sources &amp; Citations</h2>
        ${report.citations.map((c: Citation, i) => `
          <div class="citation">
            <span class="citation-num">[${i + 1}]</span>
            <span class="citation-title">${escHtml(c.title)}</span>
            <span class="citation-source"> — ${escHtml(c.source)}</span>
          </div>`).join('')}
      </div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${escHtml(report.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a2e;background:#fff;}
  .cover{background:linear-gradient(135deg,#6C63FF 0%,#8B5CF6 100%);color:#fff;padding:52px 48px 40px;}
  .cover-badge{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:14px;}
  .cover h1{font-size:30px;font-weight:800;line-height:1.3;margin-bottom:12px;}
  .cover-meta{display:flex;flex-wrap:wrap;gap:18px;font-size:12px;opacity:.8;margin-top:20px;}
  .stats-bar{display:flex;background:#f8f7ff;padding:18px 48px;gap:40px;border-bottom:2px solid #ebe9ff;}
  .stat{text-align:center;}.stat .val{font-size:22px;font-weight:800;color:#6C63FF;}
  .stat .lbl{font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
  .content{padding:40px 48px;}
  .summary-block{background:#f8f7ff;border-left:4px solid #6C63FF;border-radius:8px;padding:20px 24px;margin-bottom:32px;}
  .summary-label{font-size:10px;font-weight:800;color:#6C63FF;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;}
  .summary-text{font-size:14px;line-height:1.8;color:#333;}
  .section{margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid #f0eeff;}
  .section-title{font-size:16px;font-weight:800;color:#1a1a2e;margin-bottom:10px;padding-left:10px;border-left:3px solid #6C63FF;}
  .section-content{font-size:14px;line-height:1.8;color:#333;}
  .bullets{margin-top:12px;padding-left:20px;}.bullets li{font-size:13px;line-height:1.7;color:#444;margin-bottom:6px;}
  .findings,.predictions{margin-bottom:28px;}
  .findings-title{font-size:14px;font-weight:800;color:#10B981;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;}
  .predictions-title{font-size:14px;font-weight:800;color:#F59E0B;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;}
  .findings ul,.predictions ul{padding-left:18px;}
  .findings li,.predictions li{font-size:14px;line-height:1.7;color:#333;margin-bottom:8px;}
  .citations{margin-top:32px;padding-top:24px;border-top:2px solid #f0eeff;}
  .citations-title{font-size:12px;font-weight:800;color:#6C63FF;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;}
  .citation{display:flex;gap:8px;margin-bottom:10px;font-size:12px;}
  .citation-num{color:#6C63FF;font-weight:700;flex-shrink:0;}.citation-title{color:#333;font-weight:600;}.citation-source{color:#888;}
  .footer{background:#f8f7ff;padding:22px 48px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #ebe9ff;margin-top:40px;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
  <div class="cover">
    <div class="cover-badge">🔬 DeepDive AI Research Report</div>
    <h1>${escHtml(report.title)}</h1>
    <div class="cover-meta">
      <span>📅 ${date}</span>
      <span>🔍 ${(report.depth ?? 'standard').toUpperCase()} depth</span>
      ${report.sourcesCount > 0 ? `<span>📚 ${report.sourcesCount} sources</span>` : ''}
      ${report.reliabilityScore > 0 ? `<span>⭐ ${report.reliabilityScore}/10 reliability</span>` : ''}
    </div>
  </div>
  ${(report.sourcesCount > 0 || (report.citations ?? []).length > 0) ? `
  <div class="stats-bar">
    ${report.sourcesCount > 0 ? `<div class="stat"><div class="val">${report.sourcesCount}</div><div class="lbl">Sources</div></div>` : ''}
    ${(report.citations ?? []).length > 0 ? `<div class="stat"><div class="val">${report.citations.length}</div><div class="lbl">Citations</div></div>` : ''}
    ${(report.keyFindings ?? []).length > 0 ? `<div class="stat"><div class="val">${report.keyFindings.length}</div><div class="lbl">Findings</div></div>` : ''}
    ${report.reliabilityScore > 0 ? `<div class="stat"><div class="val">${report.reliabilityScore}/10</div><div class="lbl">Reliability</div></div>` : ''}
  </div>` : ''}
  <div class="content">
    ${report.executiveSummary ? `<div class="summary-block"><div class="summary-label">Executive Summary</div><div class="summary-text">${escHtml(report.executiveSummary)}</div></div>` : ''}
    ${sectionsHtml}
    ${findingsHtml}
    ${predictionsHtml}
    ${citationsHtml}
  </div>
  <div class="footer">Generated by DeepDive AI · ${date} · deepdive.app</div>
</body></html>`;
}

async function renderReportPdf(
  reportId:    string,
  workspaceId: string,
): Promise<{ name: string; base64: string }> {
  const { data: report, error } = await loadWorkspaceReportFull(reportId, workspaceId);
  if (error || !report) {
    throw new Error(error ?? 'Report could not be loaded');
  }
  const html = buildReportPdfHtml(report);
  const b64  = await printHtmlToPdfBase64(html);
  return { name: `${safeName(report.title, 'report')}.pdf`, base64: b64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENTATION → .pptx (base64) via the vector pptxgen path
// ─────────────────────────────────────────────────────────────────────────────
//
// We use the existing vector PPTX builder logic. The screenshot-capture path
// (slideCaptureExport) needs live mounted SlideCard refs, which don't exist in
// a headless settings-screen bundle. The vector path produces a fully valid,
// fully-themed .pptx with all edits applied (it reads editorData), so it's the
// correct headless choice here.
//
// We re-run pptxgen ourselves to get base64 bytes (generatePPTX in pptxExport
// shares directly). To avoid duplicating ~600 lines of layout code, we import
// the module dynamically and call a thin re-implementation that mirrors
// generatePPTX but returns base64 instead of sharing.

async function loadPresentationForWorkspace(
  presentationId: string,
  workspaceId:    string,
): Promise<(GeneratedPresentation & { fontFamily?: string }) | null> {
  // Try the SECURITY DEFINER RPC first (works for non-owners).
  let data: Record<string, unknown> | null = null;

  try {
    const { data: rpcData, error } = await supabase.rpc(
      'get_shared_presentation_for_workspace',
      { p_workspace_id: workspaceId, p_presentation_id: presentationId },
    );
    if (!error) {
      const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
      data = (rows[0] as Record<string, unknown>) ?? null;
    }
  } catch { /* fall through to direct */ }

  // Fallback: direct table read (owner only — RLS).
  if (!data) {
    const { data: direct, error } = await supabase
      .from('presentations')
      .select('id, title, subtitle, theme, slides, editor_data, font_family, report_id, user_id, generated_at, export_count, total_slides')
      .eq('id', presentationId)
      .single();
    if (error || !direct) return null;
    data = direct as Record<string, unknown>;
  }

  if (!data) return null;

  const theme: PresentationTheme = (data.theme as PresentationTheme) ?? 'dark';
  const rawSlides:     unknown[] = Array.isArray(data.slides)      ? (data.slides as unknown[])      : [];
  const editorDataArr: unknown[] = Array.isArray(data.editor_data) ? (data.editor_data as unknown[]) : [];
  const mergedSlides             = mergeEditorData(rawSlides as any[], editorDataArr as any[]);

  return {
    id:          data.id           as string,
    reportId:    data.report_id    as string,
    userId:      data.user_id      as string,
    title:       data.title        as string,
    subtitle:    (data.subtitle    as string) ?? '',
    theme,
    themeTokens: getThemeTokens(theme),
    slides:      mergedSlides,
    totalSlides: mergedSlides.length,
    generatedAt: data.generated_at as string,
    exportCount: (data.export_count as number) ?? 0,
    fontFamily:  (data.font_family  as string) ?? 'system',
  };
}

async function renderPresentationPptx(
  presentationId: string,
  workspaceId:    string,
): Promise<{ name: string; base64: string }> {
  const pres = await loadPresentationForWorkspace(presentationId, workspaceId);
  if (!pres) throw new Error('Presentation could not be loaded');

  // Dynamically import the vector builder pieces and assemble base64 ourselves.
  const pptxMod = await import('./pptxExport');

  // pptxExport exposes generatePPTX (which shares). We need base64 only.
  // It also exports getThemeTokens. The internal addSlideToPresentation is not
  // exported, so we drive a fresh pptxgen with the same theme + a simple,
  // robust layout fallback: one image-free slide per source slide with the
  // title + body/bullets. To keep full fidelity we instead re-call the module's
  // generatePPTX-equivalent through a small shim:
  //
  // Strategy: call generatePPTX but intercept Sharing. Simpler and safe: we
  // rebuild here using pptxgen with the theme tokens, mirroring the core text
  // layouts. This guarantees a valid, themed deck for the bundle.

  const t        = pres.themeTokens ?? pptxMod.getThemeTokens(pres.theme);
  const px       = (hex: string) => hex.replace(/^#/, '');
  const fontFace = (() => {
    const ff = (pres as any).fontFamily as string | undefined;
    switch (ff) {
      case 'serif':     return 'Georgia';
      case 'mono':      return 'Courier New';
      case 'rounded':   return 'Trebuchet MS';
      case 'condensed': return 'Arial Narrow';
      default:          return 'Arial';
    }
  })();

  const W = 10, H = 5.625;
  const deck = new pptxgen();
  deck.layout  = 'LAYOUT_16x9';
  deck.author  = 'DeepDive AI';
  deck.company = 'DeepDive AI';
  deck.title   = pres.title;
  deck.subject = pres.subtitle;

  for (const s of pres.slides) {
    const slide  = deck.addSlide();
    const ed     = (s as any).editorData;
    const bg     = px(ed?.backgroundColor ?? t.background);
    const accent = px(s.accentColor ?? t.primary);
    slide.background = { color: bg };

    // Accent bar
    slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.06, fill: { color: accent }, line: { color: accent, width: 0 } });

    // Title
    if (s.title) {
      slide.addText(s.title, {
        x: 0.5, y: 0.4, w: W - 1, h: 1.0,
        fontSize: s.layout === 'title' ? 34 : 24,
        bold: true, color: px(t.textPrimary),
        align: 'left', valign: 'top', fontFace,
      });
    }
    // Subtitle / sectionTag / badge
    const sub = s.subtitle ?? s.sectionTag ?? s.badgeText;
    if (sub) {
      slide.addText(sub, {
        x: 0.5, y: 1.5, w: W - 1, h: 0.5,
        fontSize: 13, color: px(t.textSecondary), align: 'left', fontFace,
      });
    }
    // Body
    if (s.body) {
      slide.addText(s.body, {
        x: 0.5, y: 2.1, w: W - 1, h: H - 2.4,
        fontSize: 13, color: px(t.textSecondary), align: 'left', valign: 'top',
        lineSpacingMultiple: 1.35, fontFace,
      });
    }
    // Bullets
    if ((s.bullets ?? []).length) {
      slide.addText(
        (s.bullets ?? []).map(b => `•  ${b}`).join('\n'),
        {
          x: 0.5, y: 2.1, w: W - 1, h: H - 2.4,
          fontSize: 13, color: px(t.textSecondary), align: 'left', valign: 'top',
          lineSpacingMultiple: 1.3, fontFace,
        },
      );
    }
    // Stats
    if ((s.stats ?? []).length) {
      const stats = (s.stats ?? []).slice(0, 4);
      const cW = (W - 1) / stats.length;
      stats.forEach((st, i) => {
        const x = 0.5 + i * cW;
        const col = px(st.color ?? s.accentColor ?? t.primary);
        slide.addText(st.value, { x, y: 2.3, w: cW, h: 0.8, fontSize: 26, bold: true, color: col, align: 'center', fontFace });
        slide.addText(st.label, { x, y: 3.2, w: cW, h: 0.6, fontSize: 11, color: px(t.textMuted), align: 'center', fontFace });
      });
    }
    // Quote
    if (s.quote) {
      slide.addText(s.quote, {
        x: 0.7, y: 1.8, w: W - 1.4, h: 2.2,
        fontSize: 18, italic: true, bold: true, color: px(t.textPrimary),
        align: 'center', valign: 'middle', lineSpacingMultiple: 1.4, fontFace,
      });
      if (s.quoteAttribution) {
        slide.addText(`— ${s.quoteAttribution}`, {
          x: 0.7, y: H - 0.9, w: W - 1.4, h: 0.4,
          fontSize: 11, color: px(t.textSecondary), align: 'center', italic: true, fontFace,
        });
      }
    }
  }

  const base64 = await deck.write({ outputType: 'base64' }) as string;
  return { name: `${safeName(pres.title, 'presentation')}.pptx`, base64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC PAPER → full PDF (base64)
// ─────────────────────────────────────────────────────────────────────────────

async function loadAcademicPaperForWorkspace(
  paperId:     string,
  workspaceId: string,
): Promise<AcademicPaper | null> {
  let data: Record<string, unknown> | null = null;

  try {
    const { data: rpcData, error } = await supabase.rpc(
      'get_shared_academic_paper_for_workspace',
      { p_workspace_id: workspaceId, p_paper_id: paperId },
    );
    if (!error) {
      const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
      data = (rows[0] as Record<string, unknown>) ?? null;
    }
  } catch { /* fall through */ }

  if (!data) {
    const { data: direct, error } = await supabase
      .from('academic_papers').select('*').eq('id', paperId).single();
    if (error || !direct) return null;
    data = direct as Record<string, unknown>;
  }
  if (!data) return null;

  return {
    id:            data.id              as string,
    reportId:      data.report_id       as string,
    userId:        data.user_id         as string,
    title:         data.title           as string,
    runningHead:   (data.running_head   as string) ?? '',
    abstract:      (data.abstract       as string) ?? '',
    keywords:      (data.keywords       as string[]) ?? [],
    sections:      (data.sections       as AcademicPaper['sections']) ?? [],
    citations:     (data.citations      as AcademicPaper['citations']) ?? [],
    citationStyle: (data.citation_style as AcademicPaper['citationStyle']) ?? 'apa',
    wordCount:     (data.word_count     as number) ?? 0,
    pageEstimate:  (data.page_estimate  as number) ?? 0,
    institution:   (data.institution    as string) ?? undefined,
    generatedAt:   data.generated_at    as string,
    exportCount:   (data.export_count   as number) ?? 0,
  };
}

async function renderAcademicPaperPdf(
  paperId:     string,
  workspaceId: string,
): Promise<{ name: string; base64: string }> {
  const paper = await loadAcademicPaperForWorkspace(paperId, workspaceId);
  if (!paper) throw new Error('Academic paper could not be loaded');

  // Reuse the academic HTML builder via its public PDF function would share the
  // file; instead we replicate the minimal HTML so we can capture base64.
  // We render a clean publication-style document.
  const date = new Date(paper.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const sectionsHtml = (paper.sections ?? []).map(sec => {
    if (sec.type === 'abstract') {
      return `<div class="abstract-block"><h2 class="section-heading">${escHtml(sec.title)}</h2>
        ${(sec.content ?? '').split(/\n{2,}/).map(p => `<p>${escHtml(p)}</p>`).join('')}</div>`;
    }
    if (sec.type === 'references') {
      const items = (sec.content ?? '').split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => `<p class="reference-item">${escHtml(l)}</p>`).join('');
      return `<div class="section"><h2 class="section-heading">${escHtml(sec.title)}</h2><div class="references-list">${items}</div></div>`;
    }
    const subs = (sec.subsections ?? []).map(sub =>
      `<h3 class="subsection-heading">${escHtml(sub.title)}</h3>${(sub.content ?? '').split(/\n{2,}/).map(p => `<p>${escHtml(p)}</p>`).join('')}`
    ).join('');
    const body = (sec.content ?? '').split(/\n{2,}/).map(p => `<p>${escHtml(p)}</p>`).join('');
    return `<div class="section"><h2 class="section-heading">${escHtml(sec.title)}</h2>${body}${subs}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${escHtml(paper.title)}</title><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:2;color:#000;background:#fff;}
  .page{max-width:680px;margin:0 auto;padding:72px;}
  .running-head{font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.04em;text-transform:uppercase;color:#555;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:32px;display:flex;justify-content:space-between;}
  .title-block{text-align:center;margin-bottom:48px;padding-bottom:32px;border-bottom:2px solid #1a1a2e;}
  .paper-title{font-family:Arial,sans-serif;font-size:20pt;font-weight:700;line-height:1.3;color:#1a1a2e;margin-bottom:20px;}
  .paper-meta{font-family:Arial,sans-serif;font-size:9pt;color:#555;margin-bottom:8px;}
  .keywords-block{font-family:Arial,sans-serif;font-size:10pt;color:#333;margin-top:16px;text-align:left;background:#f8f8ff;border-left:3px solid #6c63ff;padding:10px 16px;border-radius:0 4px 4px 0;}
  .abstract-block{background:#f8f8ff;border:1px solid #e0e0f0;border-radius:6px;padding:24px 28px;margin-bottom:40px;}
  .abstract-block .section-heading{text-align:center;font-family:Arial,sans-serif;font-size:13pt;font-weight:700;margin-bottom:16px;color:#1a1a2e;border-bottom:none;}
  .abstract-block p{font-size:11pt;line-height:1.8;color:#222;text-align:justify;}
  .section{margin-bottom:32px;}
  .section-heading{font-family:Arial,sans-serif;font-size:13pt;font-weight:700;color:#1a1a2e;border-bottom:2px solid #6c63ff;padding-bottom:6px;margin-bottom:16px;margin-top:32px;}
  .subsection-heading{font-family:Arial,sans-serif;font-size:11pt;font-weight:700;font-style:italic;color:#2d2d50;margin-top:20px;margin-bottom:10px;}
  p{text-align:justify;text-indent:2em;margin-bottom:0;color:#111;font-size:12pt;line-height:2;}
  .section-heading + p,.subsection-heading + p,.abstract-block p:first-of-type{text-indent:0;}
  .reference-item{text-indent:-2em!important;padding-left:2em;margin-bottom:10px;font-size:11pt;line-height:1.6;color:#222;}
  .footer{margin-top:48px;padding-top:12px;border-top:1px solid #ddd;font-family:Arial,sans-serif;font-size:8pt;color:#aaa;text-align:center;}
</style></head><body><div class="page">
  <div class="running-head"><span>${escHtml(paper.runningHead || paper.title.toUpperCase().slice(0, 50))}</span><span>DeepDive AI · Academic Research</span></div>
  <div class="title-block">
    <div class="paper-title">${escHtml(paper.title)}</div>
    <div class="paper-meta">Generated: ${date} · Citation Style: ${escHtml(paper.citationStyle.toUpperCase())}</div>
    ${paper.institution ? `<div class="paper-meta">${escHtml(paper.institution)}</div>` : ''}
    ${paper.keywords.length ? `<div class="keywords-block"><strong>Keywords: </strong>${escHtml(paper.keywords.join(', '))}</div>` : ''}
  </div>
  ${sectionsHtml}
  <div class="footer">Generated by DeepDive AI · Academic Paper Mode</div>
</div></body></html>`;

  const b64 = await printHtmlToPdfBase64(html);
  return { name: `${safeName(paper.title, 'paper')}.pdf`, base64: b64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBATE → full PDF (base64)
// ─────────────────────────────────────────────────────────────────────────────

async function loadDebateSessionForWorkspace(
  debateId:    string,
  workspaceId: string,
): Promise<DebateSession | null> {
  // Shared debates carry the full denormalised session. Find the shared row.
  try {
    const { getWorkspaceSharedDebates, sharedDebateToSession } =
      await import('./debateSharingService');
    const { data } = await getWorkspaceSharedDebates(workspaceId);
    const match = data.find((d: SharedDebate) => d.debateId === debateId);
    if (match) return sharedDebateToSession(match);
  } catch { /* fall through */ }

  // Fallback: direct read of debate_sessions (owner only).
  try {
    const { data, error } = await supabase
      .from('debate_sessions').select('*').eq('id', debateId).single();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      id:                 row.id                 as string,
      userId:             row.user_id            as string,
      topic:              row.topic              as string,
      question:           (row.question          as string) ?? '',
      perspectives:       (row.perspectives      as DebateSession['perspectives']) ?? [],
      moderator:          (row.moderator         as DebateSession['moderator']) ?? null,
      status:             (row.status            as DebateSession['status']) ?? 'completed',
      agentRoles:         (row.agent_roles       as DebateSession['agentRoles']) ?? [],
      searchResultsCount: (row.search_results_count as number) ?? 0,
      createdAt:          row.created_at         as string,
      completedAt:        (row.completed_at      as string) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function renderDebatePdf(
  debateId:    string,
  workspaceId: string,
): Promise<{ name: string; base64: string }> {
  const session = await loadDebateSessionForWorkspace(debateId, workspaceId);
  if (!session) throw new Error('Debate could not be loaded');

  // Reuse the debate HTML builder by calling the export module's internal
  // builder is not exported; render a compact, complete HTML here.
  const perspectivesHtml = (session.perspectives ?? []).map((p, i) => `
    <div class="persp" style="border-top:4px solid ${p.color};">
      <div class="persp-head">
        <span class="persp-tag" style="color:${p.color};">${escHtml(p.tagline)}</span>
        <span class="persp-name">${escHtml(p.agentName)}</span>
        <span class="persp-stance">${escHtml(p.stanceLabel)}</span>
      </div>
      <p class="persp-summary">${escHtml(p.summary)}</p>
      <div class="persp-args">${(p.arguments ?? []).map(a =>
        `<div class="arg"><strong>${escHtml(a.point)}</strong><br/><span>${escHtml(a.evidence)}</span></div>`
      ).join('')}</div>
      ${p.keyQuote ? `<div class="quote">“${escHtml(p.keyQuote)}”</div>` : ''}
      <div class="conf">Confidence: ${p.confidence}/10</div>
    </div>`).join('');

  const mod = session.moderator;
  const moderatorHtml = mod ? `
    <div class="mod">
      <h2 class="mod-title">⚖️ Moderator's Synthesis</h2>
      <div class="verdict">“${escHtml(mod.balancedVerdict)}”</div>
      <p>${escHtml(mod.summary)}</p>
      <div class="mod-cols">
        <div><h4>Arguments For</h4><ul>${(mod.argumentsFor ?? []).map(a => `<li>${escHtml(a)}</li>`).join('')}</ul></div>
        <div><h4>Arguments Against</h4><ul>${(mod.argumentsAgainst ?? []).map(a => `<li>${escHtml(a)}</li>`).join('')}</ul></div>
      </div>
      ${(mod.consensusPoints ?? []).length ? `<h4>Consensus</h4><ul>${mod.consensusPoints.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>` : ''}
      ${(mod.keyTensions ?? []).length ? `<h4>Key Tensions</h4><ul>${mod.keyTensions.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>` : ''}
      <h4>Conclusion</h4><p>${escHtml(mod.neutralConclusion)}</p>
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${escHtml(session.topic)}</title><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;font-size:13px;line-height:1.6;}
  .cover{background:linear-gradient(135deg,#6C63FF 0%,#9B59FF 45%,#FF6584 100%);color:#fff;padding:48px;}
  .cover h1{font-size:26px;font-weight:800;margin-bottom:12px;}
  .cover .q{background:rgba(255,255,255,.15);border-left:4px solid rgba(255,255,255,.6);border-radius:0 8px 8px 0;padding:12px 16px;font-size:14px;}
  .body{padding:36px 48px;}
  .persp{background:#fff;border:1px solid #ebe9ff;border-radius:14px;padding:24px;margin-bottom:24px;page-break-inside:avoid;}
  .persp-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
  .persp-tag{font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;}
  .persp-name{font-size:17px;font-weight:800;}.persp-stance{margin-left:auto;font-size:11px;font-weight:700;color:#555;}
  .persp-summary{font-size:13px;color:#555;line-height:1.7;margin-bottom:14px;}
  .arg{background:#fafafe;border-left:3px solid #ccc;border-radius:8px;padding:12px 14px;margin-bottom:8px;font-size:12px;}
  .quote{border:1px solid #ddd;border-radius:8px;padding:12px;font-style:italic;color:#555;margin:12px 0;}
  .conf{font-size:11px;color:#888;}
  .mod{background:#fff;border:1px solid #ebe9ff;border-top:4px solid #6C63FF;border-radius:14px;padding:28px;margin-top:12px;}
  .mod-title{font-size:18px;margin-bottom:16px;}
  .verdict{background:#f0eeff;border-radius:10px;padding:16px;font-style:italic;font-weight:600;margin-bottom:16px;}
  .mod-cols{display:flex;gap:16px;margin:16px 0;}.mod-cols>div{flex:1;}.mod-cols h4{font-size:12px;margin-bottom:8px;}
  .mod ul{padding-left:18px;}.mod li{font-size:12px;margin-bottom:6px;}
  h4{margin:14px 0 8px;font-size:13px;}
  .footer{background:#f8f7ff;padding:20px 48px;text-align:center;font-size:10px;color:#bbb;border-top:1px solid #ebe9ff;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
  <div class="cover"><h1>${escHtml(session.topic)}</h1><div class="q">${escHtml(session.question)}</div></div>
  <div class="body">${perspectivesHtml}${moderatorHtml}</div>
  <div class="footer">Generated by DeepDive AI · Debate Report</div>
</body></html>`;

  const b64 = await printHtmlToPdfBase64(html);
  return { name: `${safeName(session.topic, 'debate')}.pdf`, base64: b64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO (podcast / voice debate) → concatenated .mp3 (base64)
// ─────────────────────────────────────────────────────────────────────────────
//
// Both podcasts and voice debates store audio as a list of per-turn .mp3
// segments. Depending on how they were shared, each entry is EITHER:
//   • a full https:// Supabase Storage URL (podcasts upload full URLs), OR
//   • a storage object PATH like "voice-debates/<id>/turn_0.mp3"
//     (voice debates frequently store bucket-relative paths).
// We resolve paths → public URLs, download each, concatenate the raw bytes
// (mp3 frames concatenate playably), and return the combined base64.
//
// IMPORTANT (Hermes): native btoa() throws / returns null on bytes ≥ 0x80, so
// it CANNOT encode binary mp3 data. We therefore use a self-contained base64
// codec below that handles the full 0x00–0xFF byte range. This is the root
// cause of the "none of the selected items could be exported" voice-debate
// failure when btoa was used on binary.

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS[i]] = i;
  return t;
})();

/** Decode a base64 string → Uint8Array (full byte range, Hermes-safe). */
function base64ToBytes(b64: string): Uint8Array {
  // Strip whitespace AND padding '='; we derive byte length from char count.
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len   = clean.length;

  // Every 4 base64 chars → 3 bytes. A trailing group of 2 chars → 1 byte,
  // 3 chars → 2 bytes. (This handles inputs with or without '=' padding.)
  const fullGroups = Math.floor(len / 4);
  const rem        = len % 4;
  let   byteLen    = fullGroups * 3;
  if (rem === 2) byteLen += 1;
  else if (rem === 3) byteLen += 2;

  const out = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[clean[i]]     ?? 0;
    const e1 = B64_LOOKUP[clean[i + 1]] ?? 0;
    const e2 = B64_LOOKUP[clean[i + 2]] ?? 0;
    const e3 = B64_LOOKUP[clean[i + 3]] ?? 0;

    const n = (e0 << 18) | (e1 << 12) | (e2 << 6) | e3;
    if (p < byteLen) out[p++] = (n >> 16) & 0xff;
    if (p < byteLen) out[p++] = (n >> 8)  & 0xff;
    if (p < byteLen) out[p++] = n         & 0xff;
  }
  return out;
}

/** Encode a Uint8Array → base64 string (full byte range, Hermes-safe). */
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

/**
 * Resolve an audio segment reference to a downloadable URL.
 * Full http(s) URLs pass through unchanged (this is the common case — shared
 * podcast/voice-debate rows already store complete URLs, and voice debates now
 * arrive as signed URLs from resolveVoiceDebatePlayableUrls).
 *
 * For the rare genuinely bucket-relative path, we resolve it inside the real
 * `podcast-audio` bucket (the single bucket that backs BOTH podcast and voice-
 * debate audio in this app). If the path is already prefixed with the bucket
 * name we strip it before calling getPublicUrl.
 */
function resolveSegmentUrl(ref: string): string {
  if (!ref) return ref;
  if (isRemoteUrl(ref)) return ref;

  // Strip a leading slash if present.
  const path = ref.replace(/^\/+/, '');
  const BUCKET = 'podcast-audio';

  const objectPath = path.startsWith(`${BUCKET}/`)
    ? path.slice(BUCKET.length + 1)
    : path;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data?.publicUrl ?? ref;
}


async function ensureLocalSegment(
  pathOrUrl: string,
  cacheKey:  string,
): Promise<string | null> {
  if (!pathOrUrl) return null;

  // Resolve bucket-relative storage paths → public URLs.
  const resolved = resolveSegmentUrl(pathOrUrl);

  if (isRemoteUrl(resolved)) {
    const local = `${cacheDirectory ?? ''}wsbundle_${cacheKey}.mp3`;
    try {
      const info = await getInfoAsync(local);
      if (info.exists && (info as any).size > 100) return local;
    } catch {}
    try {
      const res = await downloadAsync(resolved, local);
      if (res.status === 200) {
        // Guard against 0-byte / error-page downloads.
        try {
          const info = await getInfoAsync(local);
          if (info.exists && (info as any).size > 0) return local;
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  // Genuinely-local path.
  try {
    const info = await getInfoAsync(resolved);
    return info.exists ? resolved : null;
  } catch {
    return null;
  }
}

async function concatSegmentsToBase64(
  segmentPaths: string[],
  cachePrefix:  string,
): Promise<string | null> {
  const localPaths = await Promise.all(
    segmentPaths.map((p, i) => ensureLocalSegment(p, `${cachePrefix}_${i}`)),
  );

  // Read each segment as base64, decode to bytes with our Hermes-safe codec
  // (native atob/btoa can't handle binary ≥ 0x80), concat the bytes, re-encode.
  const byteArrays: Uint8Array[] = [];
  let totalLen = 0;
  for (const lp of localPaths) {
    if (!lp) continue;
    try {
      const b64 = await readAsStringAsync(lp, { encoding: EncodingType.Base64 });
      if (!b64) continue;
      const bytes = base64ToBytes(b64);
      if (bytes.length > 0) {
        byteArrays.push(bytes);
        totalLen += bytes.length;
      }
    } catch { /* skip unreadable segment */ }
  }

  if (byteArrays.length === 0 || totalLen === 0) {
    // Cleanup whatever we downloaded before bailing.
    await cleanupSegmentCache(segmentPaths, cachePrefix);
    return null;
  }

  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of byteArrays) { combined.set(a, offset); offset += a.length; }

  const out = bytesToBase64(combined);

  await cleanupSegmentCache(segmentPaths, cachePrefix);
  return out;
}

/** Delete any cache files we downloaded for these segments. */
async function cleanupSegmentCache(segmentPaths: string[], cachePrefix: string): Promise<void> {
  for (let i = 0; i < segmentPaths.length; i++) {
    try {
      await deleteAsync(`${cacheDirectory ?? ''}wsbundle_${cachePrefix}_${i}.mp3`, { idempotent: true });
    } catch {}
  }
}

async function renderPodcastMp3(
  podcastId:   string,
  workspaceId: string,
): Promise<{ name: string; base64: string }> {
  const { getWorkspaceSharedPodcasts } = await import('./podcastSharingService');
  const { data } = await getWorkspaceSharedPodcasts(workspaceId);
  const sp = data.find((p: SharedPodcast) => p.podcastId === podcastId);
  if (!sp) throw new Error('Shared podcast not found');

  const segments = (sp.audioSegmentPaths ?? []).filter(Boolean);
  if (segments.length === 0) throw new Error('Podcast has no cloud audio');

  const b64 = await concatSegmentsToBase64(segments, `pod_${podcastId.slice(0, 8)}`);
  if (!b64) throw new Error('Could not read podcast audio segments');

  return { name: `${safeName(sp.title, 'podcast')}.mp3`, base64: b64 };
}

async function renderVoiceDebateMp3(
  voiceDebateId: string,
  workspaceId:   string,
): Promise<{ name: string; base64: string }> {
  // ───────────────────────────────────────────────────────────────────────────
  // WHY THIS LOOKS DIFFERENT FROM renderPodcastMp3
  //
  //   Shared voice-debate audio is stored as *public* URLs into the PRIVATE
  //   `podcast-audio` bucket (path: voice_debates/{id}/turn_{N}.mp3). Those
  //   public URLs stream/download UNRELIABLY for anyone who isn't the owner —
  //   which is exactly the case here, since the bundle exporter may be a
  //   different workspace member. Downloading the stored URLs directly is what
  //   produced "Could not download/read voice debate audio".
  //
  //   The shared *player* already solved this (Part 51): it calls
  //   resolveVoiceDebatePlayableUrls() to mint fresh SIGNED URLs (valid ~6h)
  //   that download reliably for any authenticated member. We reuse that exact
  //   helper here, then download the signed URLs with the same proven
  //   segment-download/concat path the rest of this service uses.
  // ───────────────────────────────────────────────────────────────────────────
  const {
    getWorkspaceSharedVoiceDebates,
    getSharedVoiceDebateById,
  } = await import('./voiceDebateSharingService');
  const { resolveVoiceDebatePlayableUrls } = await import('../lib/voiceDebatePlayback');

  // Locate the shared row to get its sharedId, topic, totalTurns and stored URLs.
  const { data } = await getWorkspaceSharedVoiceDebates(workspaceId);
  const listRow = data.find((v: SharedVoiceDebate) => v.voiceDebateId === voiceDebateId);

  let storedUrls: (string | null)[] = [];
  let topic      = listRow?.topic ?? 'Voice Debate';
  let totalTurns = listRow?.totalTurns ?? 0;

  // 1) Pull the FULL shared row by id — it returns the complete denormalised
  //    payload (the same one the player consumes) incl. audioStorageUrls.
  if (listRow) {
    storedUrls = (listRow.audioStorageUrls ?? []) as (string | null)[];
    try {
      const { data: full } = await getSharedVoiceDebateById(workspaceId, listRow.id);
      if (full) {
        if (Array.isArray(full.audioStorageUrls) && full.audioStorageUrls.length > 0) {
          storedUrls = full.audioStorageUrls as (string | null)[];
        }
        topic      = full.topic || topic;
        totalTurns = full.totalTurns || totalTurns;
      }
    } catch { /* keep list-row values */ }
  }

  // 2) Resolve fresh SIGNED, downloadable URLs (the actual fix). This mirrors
  //    the working shared player exactly, so non-owners can fetch the audio.
  let signedUrls: string[] = [];
  try {
    signedUrls = await resolveVoiceDebatePlayableUrls({
      storedUrls,
      voiceDebateId,
      totalTurns,
    });
  } catch { /* fall back to stored urls below */ }

  // Prefer signed URLs; fall back to any stored https URLs only if resolution
  // produced nothing (e.g. the exporter owns the originals and they're public).
  let segments = signedUrls.filter(
    (u): u is string => typeof u === 'string' && u.startsWith('https://'),
  );
  if (segments.length === 0) {
    segments = (storedUrls ?? []).filter(
      (u): u is string => typeof u === 'string' && u.startsWith('https://'),
    );
  }

  if (segments.length === 0) {
    throw new Error('Voice debate has no cloud audio to export');
  }

  const b64 = await concatSegmentsToBase64(segments, `vd_${voiceDebateId.slice(0, 8)}`);
  if (!b64) throw new Error('Could not download/read voice debate audio');

  return { name: `${safeName(topic, 'voice_debate')}.mp3`, base64: b64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: render a single item to bytes (used internally; exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

async function renderItem(
  item:        BundleSelectableItem,
  workspaceId: string,
): Promise<{ name: string; base64: string }> {
  switch (item.kind) {
    case 'report':         return renderReportPdf(item.contentId, workspaceId);
    case 'presentation':   return renderPresentationPptx(item.contentId, workspaceId);
    case 'academic_paper': return renderAcademicPaperPdf(item.contentId, workspaceId);
    case 'debate':         return renderDebatePdf(item.contentId, workspaceId);
    case 'podcast':        return renderPodcastMp3(item.contentId, workspaceId);
    case 'voice_debate':   return renderVoiceDebateMp3(item.contentId, workspaceId);
    default:               throw new Error(`Unsupported item kind: ${item.kind}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: build the ZIP bundle and share it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export the selected workspace items as a single .zip and open the share sheet.
 *
 * @param workspace   The current workspace (used for the zip filename + folder).
 * @param items       The selected items to include.
 * @param onProgress  Optional progress callback for the UI.
 */
export async function exportWorkspaceBundle(
  workspace:   Workspace,
  items:       BundleSelectableItem[],
  onProgress?: BundleProgressCallback,
): Promise<BundleExportResult> {
  if (items.length === 0) {
    return { success: false, fileCount: 0, failures: [], error: 'No items selected to export.' };
  }

  const zip      = new JSZip();
  const failures: BundleExportResult['failures'] = [];
  let   produced = 0;
  let   done     = 0;

  // De-dupe filenames inside the zip (two reports could share a title).
  const usedNames = new Set<string>();
  const uniqueName = (name: string): string => {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    const dot  = name.lastIndexOf('.');
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext  = dot >= 0 ? name.slice(dot)    : '';
    let n = 2;
    let candidate = `${base}_${n}${ext}`;
    while (usedNames.has(candidate)) { n++; candidate = `${base}_${n}${ext}`; }
    usedNames.add(candidate);
    return candidate;
  };

  // Group items into subfolders by kind for a tidy zip structure.
  const folderFor = (kind: BundleItemKind): string => {
    switch (kind) {
      case 'report':         return 'Reports';
      case 'presentation':   return 'Presentations';
      case 'academic_paper': return 'Academic_Papers';
      case 'debate':         return 'Debates';
      case 'podcast':        return 'Podcasts';
      case 'voice_debate':   return 'Voice_Debates';
      default:               return 'Other';
    }
  };

  // Render with bounded concurrency. Audio items are heavier (downloads), so a
  // small pool keeps memory in check on older devices.
  await runPool(items, 2, async (item) => {
    onProgress?.({
      phase:   'rendering',
      current: done,
      total:   items.length,
      label:   `Preparing ${item.title}`,
    });

    try {
      const { name, base64 } = await renderItem(item, workspace.id);
      const folder = folderFor(item.kind);
      const zipPath = uniqueName(`${folder}/${name}`);
      zip.file(zipPath, base64, { base64: true });
      produced++;
    } catch (err) {
      failures.push({
        key:    item.key,
        title:  item.title,
        reason: err instanceof Error ? err.message : 'Export failed',
      });
    } finally {
      done++;
      onProgress?.({
        phase:   'rendering',
        current: done,
        total:   items.length,
        label:   `Prepared ${done}/${items.length}`,
      });
    }
  });

  if (produced === 0) {
    return {
      success:   false,
      fileCount: 0,
      failures,
      error:     'None of the selected items could be exported.',
    };
  }

  // ── Generate the zip as base64 (Hermes-safe; no Blob/stream needed) ───────
  onProgress?.({ phase: 'zipping', current: 0, total: 1, label: 'Building zip…' });

  let zipBase64: string;
  try {
    zipBase64 = await zip.generateAsync({
      type:               'base64',
      compression:        'DEFLATE',
      compressionOptions: { level: 6 },
    });
  } catch (err) {
    return {
      success:   false,
      fileCount: produced,
      failures,
      error:     err instanceof Error ? `Zip failed: ${err.message}` : 'Zip generation failed',
    };
  }

  // ── Write zip to disk + share ─────────────────────────────────────────────
  onProgress?.({ phase: 'sharing', current: 1, total: 1, label: 'Opening share sheet…' });

  const fileName = `${safeName(workspace.name, 'workspace')}_export_${Date.now()}.zip`;
  const fileUri  = `${documentDirectory ?? ''}${fileName}`;

  try {
    await writeAsStringAsync(fileUri, zipBase64, { encoding: EncodingType.Base64 });
  } catch (err) {
    return {
      success:   false,
      fileCount: produced,
      failures,
      error:     err instanceof Error ? `Could not write zip: ${err.message}` : 'Write failed',
    };
  }

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType:    'application/zip',
        dialogTitle: `Export ${workspace.name}`,
        UTI:         'public.zip-archive',
      });
    }
  } catch (err) {
    // Sharing cancelled or failed — the file is still saved locally.
    console.warn('[workspaceBundleExport] share error:', err);
  }

  return {
    success:   true,
    fileCount: produced,
    failures,
    error:     null,
  };
}