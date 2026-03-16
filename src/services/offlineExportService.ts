// src/services/offlineExportService.ts
// Part 23 — Offline-safe export service.
//
// ROOT CAUSE OF "Export Error" IN OFFLINE MODE:
//
//   The original export services (pdfExport, academicPdfExport, etc.) were
//   written for online use.  When called offline they fail because:
//
//   1. pdfExport.ts embeds <img src="https://..."> URLs for source images and
//      infographic thumbnails. expo-print renders HTML in a WebView which tries
//      to fetch those URLs. Offline = network error = printToFileAsync rejects.
//
//   2. pptxExport.ts uses FileSystem.moveAsync(from: printToFileAsync_uri, to:
//      documentDirectory + filename). On some Expo SDK versions the temp uri
//      returned by printToFileAsync is a file:///tmp/... path that moveAsync
//      cannot move to documentDirectory. Also pptxgenjs .write() is synchronous
//      heavy work that occasionally throws in low-memory situations.
//
//   3. podcastExport / debateExport / academicPdfExport are actually safe
//      offline (pure HTML) but are wrapped in the same handleExport() that
//      shows "Export Error" for any throw — the real error comes from #1/#2.
//
// FIX STRATEGY:
//   • Strip ALL remote URLs (http/https) from HTML before passing to expo-print.
//   • Use printToFileAsync without moveAsync — share the temp file directly.
//   • Wrap every export in a fine-grained try/catch with a meaningful error msg.
//   • For presentations: fall back to a clean text-layout PDF if PPTX fails.
//   • Export functions in this file are the single source of truth for offline
//     exports. The online screens continue to use their original service files.

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
  PresentationSlide,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip all remote URLs from an HTML string so WebView never makes a request */
function stripRemoteUrls(html: string): string {
  // Remove <img> tags that point to http/https (replace with nothing)
  return html
    .replace(/<img[^>]*src=["']https?:\/\/[^"']*["'][^>]*\/?>/gi, '')
    .replace(/url\(["']?https?:\/\/[^"')]*["']?\)/gi, 'url(about:blank)')
    .replace(/background-image:[^;]*https?:\/\/[^;";)]*[;]/gi, '');
}

/** Safely share a PDF file, falling back to Print.printAsync if sharing unavailable */
async function sharePDF(uri: string, title: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: title,
      UTI:         'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
}

/** Write HTML to a temp PDF and return the file URI */
async function htmlToPDF(html: string): Promise<string> {
  const safeHtml = stripRemoteUrls(html);
  const result   = await Print.printToFileAsync({ html: safeHtml, base64: false });
  return result.uri;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── 1. Research Report ───────────────────────────────────────────────────────

export async function exportReportOffline(report: ResearchReport): Promise<void> {
  const sectionsHTML = report.sections.map(s => `
    <div style="margin-bottom:24px;padding:20px;border:1px solid #ebe9ff;border-radius:10px;border-left:4px solid #6C63FF">
      <h2 style="color:#1a1a2e;font-size:16px;margin-bottom:12px;margin-top:0">${s.title}</h2>
      <p style="color:#444;line-height:1.8;font-size:13px;margin:0">${s.content}</p>
      ${s.bullets?.length ? `<ul style="margin-top:10px;padding-left:20px">${s.bullets.map(b => `<li style="color:#444;font-size:13px;line-height:1.7;margin-bottom:4px">${b}</li>`).join('')}</ul>` : ''}
    </div>`).join('');

  const findingsHTML = report.keyFindings.map((f, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;background:#f8f7ff;border-radius:8px;padding:14px;margin-bottom:10px;border-left:3px solid #6C63FF">
      <span style="background:#6C63FF;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${i + 1}</span>
      <span style="color:#333;font-size:13px;line-height:1.7">${f}</span>
    </div>`).join('');

  const citationsHTML = report.citations.map((c, i) => `
    <div style="margin-bottom:14px;padding:12px;background:#f8f8f8;border-radius:8px;font-size:12px">
      <strong style="color:#1a1a2e">[${i + 1}] ${c.title}</strong><br/>
      <span style="color:#6C63FF">${c.source}${c.date ? ' · ' + c.date : ''}</span><br/>
      <span style="color:#888">${c.snippet}</span>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${report.title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;background:#fff}</style>
</head><body>
  <div style="background:linear-gradient(135deg,#6C63FF,#8B5CF6);color:white;padding:52px 48px">
    <h1 style="font-size:26px;font-weight:800;margin-bottom:10px;line-height:1.3">${report.title}</h1>
    <p style="opacity:0.85;font-size:13px">${formatDate(report.createdAt)} · ${report.sourcesCount} sources · Reliability: ${report.reliabilityScore}/10 · Offline Export</p>
  </div>
  <div style="padding:40px 48px">
    <div style="background:#f8f7ff;border-left:4px solid #6C63FF;border-radius:8px;padding:22px;margin-bottom:32px">
      <h2 style="font-size:14px;color:#6C63FF;margin-bottom:10px">Executive Summary</h2>
      <p style="color:#444;line-height:1.8;font-size:13px">${report.executiveSummary}</p>
    </div>
    ${sectionsHTML}
    ${report.keyFindings.length ? `<h2 style="font-size:18px;font-weight:800;color:#1a1a2e;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #ebe9ff">Key Findings</h2>${findingsHTML}` : ''}
    ${report.futurePredictions.length ? `<h2 style="font-size:18px;font-weight:800;color:#1a1a2e;margin:24px 0 16px;padding-bottom:8px;border-bottom:2px solid #ebe9ff">Future Predictions</h2>${report.futurePredictions.map(p => `<div style="background:#fff8e7;border-radius:8px;padding:12px 14px;margin-bottom:8px;color:#664400;font-size:13px;border-left:3px solid #FFA726">🔭 ${p}</div>`).join('')}` : ''}
    ${report.citations.length ? `<div style="margin-top:36px;padding-top:22px;border-top:2px solid #ebe9ff"><h2 style="font-size:18px;font-weight:800;margin-bottom:16px">References (${report.citations.length})</h2>${citationsHTML}</div>` : ''}
  </div>
  <div style="background:#f8f7ff;padding:22px 48px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #ebe9ff;margin-top:32px">Generated offline by DeepDive AI</div>
</body></html>`;

  const uri = await htmlToPDF(html);
  await sharePDF(uri, `Research Report — ${report.title}`);
}

// ─── 2. Podcast ───────────────────────────────────────────────────────────────

export async function exportPodcastOffline(podcast: Podcast): Promise<void> {
  const turns   = podcast.script?.turns ?? [];
  const minutes = Math.round(podcast.durationSeconds / 60);

  const turnsHTML = turns.map((turn, i) => {
    const isHost   = turn.speaker === 'host';
    const bgColor  = isHost ? '#f0eeff' : '#fff0f4';
    const barColor = isHost ? '#6C63FF' : '#FF6584';
    const nameColor= isHost ? '#6C63FF' : '#FF6584';
    return `
    <div style="background:${bgColor};border-left:4px solid ${barColor};border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="color:${nameColor};font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">
        ${turn.speakerName} <span style="color:#aaa;font-weight:400;font-size:10px;text-transform:none"> · Turn ${i + 1}</span>
      </div>
      <div style="font-size:13px;line-height:1.7;color:#333">${turn.text}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${podcast.title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;background:#fff}</style>
</head><body>
  <div style="background:linear-gradient(135deg,#6C63FF,#FF6584);color:white;padding:48px">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.75;margin-bottom:12px">🎙 DeepDive AI Podcast</div>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:10px;line-height:1.3">${podcast.title}</h1>
    <p style="opacity:0.88;font-size:14px;margin-bottom:18px">${podcast.description}</p>
    <div style="font-size:12px;opacity:0.78">🎤 ${podcast.config.hostName} &amp; ${podcast.config.guestName} · ⏱ ~${minutes} min · 💬 ${turns.length} turns</div>
  </div>
  <div style="display:flex;background:#f8f7ff;padding:18px 48px;gap:40px;border-bottom:2px solid #ebe9ff">
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#6C63FF">${minutes}</div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Minutes</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#6C63FF">${turns.length}</div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Turns</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#6C63FF">${podcast.script?.totalWords?.toLocaleString() ?? '—'}</div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Words</div></div>
  </div>
  <div style="padding:36px 48px">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6C63FF;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #ebe9ff">Full Transcript</div>
    ${turnsHTML}
  </div>
  <div style="background:#f8f7ff;padding:20px 48px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #ebe9ff">Generated offline by DeepDive AI</div>
</body></html>`;

  const uri = await htmlToPDF(html);
  await sharePDF(uri, `Podcast Script — ${podcast.title}`);
}

// ─── 3. Debate ────────────────────────────────────────────────────────────────

export async function exportDebateOffline(session: DebateSession): Promise<void> {
  const stanceColor = (t: string) => ({ strongly_for: '#22C55E', for: '#3DAE7C', neutral: '#8888AA', against: '#F97316', strongly_against: '#EF4444' }[t] ?? '#8888AA');
  const stanceLabel = (t: string) => ({ strongly_for: 'Strongly For', for: 'For', neutral: 'Neutral', against: 'Against', strongly_against: 'Strongly Against' }[t] ?? 'Neutral');

  const perspHTML = session.perspectives.map(p => `
    <div style="border:1px solid #e0e0e0;border-top:4px solid ${p.color};border-radius:12px;padding:24px;margin-bottom:20px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:12px;background:${p.color}18;border:2px solid ${p.color}40;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <div style="width:16px;height:16px;border-radius:50%;background:${p.color}"></div>
        </div>
        <div style="flex:1">
          <div style="font-size:10px;color:${p.color};font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">${p.tagline}</div>
          <div style="font-size:16px;font-weight:800;color:#1a1a2e">${p.agentName}</div>
        </div>
        <div style="background:${stanceColor(p.stanceType)}18;border:1.5px solid ${stanceColor(p.stanceType)}50;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:700;color:${stanceColor(p.stanceType)};white-space:nowrap">${stanceLabel(p.stanceType)}</div>
      </div>
      <div style="background:${p.color}0D;border-left:3px solid ${p.color};padding:10px 14px;font-size:13px;font-weight:600;color:#1a1a2e;margin-bottom:14px;font-style:italic">"${p.stanceLabel}"</div>
      <p style="font-size:13px;color:#555;line-height:1.75;margin-bottom:16px">${p.summary}</p>
      ${p.arguments.map(a => `
        <div style="background:#fafafe;border:1px solid #e8e8f0;border-left:3px solid ${p.color};border-radius:8px;padding:12px 14px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:4px">${a.point}</div>
          <div style="font-size:12px;color:#555;line-height:1.6">${a.evidence}</div>
        </div>`).join('')}
      ${p.keyQuote ? `<div style="border:1px solid ${p.color}30;border-radius:8px;background:${p.color}06;padding:14px;margin-top:12px;font-size:13px;color:#555;font-style:italic">"${p.keyQuote}"</div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;background:#f8f8ff;border-radius:8px">
        <span style="font-size:10px;font-weight:700;color:#888;white-space:nowrap">Confidence</span>
        <div style="flex:1;height:5px;background:#e8e8f0;border-radius:3px;overflow:hidden">
          <div style="width:${Math.round((p.confidence/10)*100)}%;height:100%;background:${p.color};border-radius:3px"></div>
        </div>
        <span style="font-size:12px;font-weight:800;color:${p.color}">${p.confidence}/10</span>
      </div>
    </div>`).join('');

  const modHTML = session.moderator ? `
    <div style="border:1px solid #e0e0e0;border-top:4px solid #6C63FF;border-radius:12px;padding:28px;margin-top:8px">
      <h2 style="font-size:18px;font-weight:800;color:#1a1a2e;margin-bottom:18px">⚖️ Moderator Synthesis</h2>
      <div style="background:linear-gradient(135deg,#6C63FF10,#FF658408);border:1.5px solid #6C63FF30;border-radius:10px;padding:20px;margin-bottom:20px">
        <div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6C63FF;margin-bottom:8px">Balanced Verdict</div>
        <p style="font-size:14px;font-weight:600;color:#1a1a2e;line-height:1.65;font-style:italic">"${session.moderator.balancedVerdict}"</p>
      </div>
      <p style="font-size:13px;color:#555;line-height:1.75;margin-bottom:20px">${session.moderator.summary}</p>
      ${session.moderator.consensusPoints.length ? `<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:10px">✓ Consensus Points</div>${session.moderator.consensusPoints.map(c => `<div style="background:#edfff4;border-left:3px solid #22C55E;padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:6px;font-size:12.5px;color:#444">${c}</div>`).join('')}</div>` : ''}
      <div style="background:#eff8ff;border-left:3px solid #29B6F6;border-radius:0 8px 8px 0;padding:14px 16px;font-size:13px;color:#444;line-height:1.75">${session.moderator.neutralConclusion}</div>
    </div>` : '';

  const forCount = session.perspectives.filter(p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const againstCount = session.perspectives.filter(p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>AI Debate: ${session.topic}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
</head><body>
  <div style="background:linear-gradient(135deg,#6C63FF,#9B59FF,#FF6584);color:white;padding:50px 48px">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.75;margin-bottom:14px">🎯 DeepDive AI · Debate Report</div>
    <h1 style="font-size:28px;font-weight:800;line-height:1.3;margin-bottom:14px">${session.topic}</h1>
    <div style="background:rgba(255,255,255,0.15);border-left:4px solid rgba(255,255,255,0.6);border-radius:0 10px 10px 0;padding:12px 16px;font-size:14px;line-height:1.6;max-width:620px;margin-bottom:22px">${session.question}</div>
    <div style="font-size:12px;opacity:0.8">🤖 ${session.perspectives.length} agents · 📚 ${session.searchResultsCount} sources · ✅ ${forCount} For · ❌ ${againstCount} Against</div>
    ${session.moderator?.balancedVerdict ? `<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:16px 20px;max-width:600px;margin-top:20px"><div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;opacity:0.65;margin-bottom:7px">Moderator's Verdict</div><div style="font-size:14px;font-style:italic;line-height:1.6;opacity:0.93">"${session.moderator.balancedVerdict}"</div></div>` : ''}
  </div>
  <div style="padding:36px 48px">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6C63FF;margin-bottom:22px;padding-bottom:10px;border-bottom:2px solid #ebe9ff">🤖 Agent Perspectives (${session.perspectives.length})</div>
    ${perspHTML}
    ${modHTML}
  </div>
  <div style="background:#f8f7ff;padding:20px 48px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #ebe9ff;margin-top:24px">Generated offline by DeepDive AI</div>
</body></html>`;

  const uri = await htmlToPDF(html);
  await sharePDF(uri, `Debate — ${session.topic}`);
}

// ─── 4. Academic Paper ────────────────────────────────────────────────────────

export async function exportAcademicPaperOffline(paper: AcademicPaper): Promise<void> {
  const sectionsHtml = paper.sections.map(section => {
    if (section.type === 'abstract') {
      return `<div style="background:#f8f8ff;border:1px solid #e0e0f0;border-radius:6px;padding:22px 26px;margin-bottom:32px">
        <h2 style="text-align:center;font-family:Arial,sans-serif;font-size:13pt;font-weight:700;margin-bottom:14px;color:#1a1a2e">${section.title}</h2>
        ${section.content.split(/\n{2,}/).filter(Boolean).map(p => `<p style="font-size:11pt;line-height:1.8;color:#222;text-align:justify;margin-bottom:10px">${p}</p>`).join('')}
      </div>`;
    }
    if (section.type === 'references') {
      const refs = section.content.split('\n').filter(Boolean);
      return `<div style="margin-bottom:28px">
        <h2 style="font-family:Arial,sans-serif;font-size:13pt;font-weight:700;color:#1a1a2e;border-bottom:2px solid #6c63ff;padding-bottom:6px;margin-bottom:14px">${section.title}</h2>
        ${refs.map((ref, i) => `<p style="text-indent:-2em;padding-left:2em;margin-bottom:8px;font-size:11pt;line-height:1.6;color:#222">${ref}</p>`).join('')}
      </div>`;
    }
    return `<div style="margin-bottom:28px">
      <h2 style="font-family:Arial,sans-serif;font-size:13pt;font-weight:700;color:#1a1a2e;border-bottom:2px solid #6c63ff;padding-bottom:6px;margin-bottom:14px">${section.title}</h2>
      ${section.content ? section.content.split(/\n{2,}/).filter(Boolean).map(p => `<p style="text-align:justify;text-indent:2em;line-height:2;font-size:12pt;color:#111;margin-bottom:0">${p}</p>`).join('') : ''}
      ${(section.subsections ?? []).map(sub => `
        <h3 style="font-family:Arial,sans-serif;font-size:11pt;font-weight:700;font-style:italic;color:#2d2d50;margin-top:18px;margin-bottom:10px">${sub.title}</h3>
        ${sub.content.split(/\n{2,}/).filter(Boolean).map(p => `<p style="text-align:justify;line-height:2;font-size:12pt;color:#111;margin-bottom:0">${p}</p>`).join('')}`).join('')}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${paper.title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:2;color:#000;background:#fff;padding:0}.page{max-width:680px;margin:0 auto;padding:60px 70px 60px}</style>
</head><body><div class="page">
  <div style="font-family:Arial,sans-serif;font-size:9pt;letter-spacing:0.04em;text-transform:uppercase;color:#555;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:28px;display:flex;justify-content:space-between">
    <span>${(paper.runningHead || paper.title).slice(0, 50).toUpperCase()}</span>
    <span>DeepDive AI · Academic Research</span>
  </div>
  <div style="text-align:center;margin-bottom:40px;padding-bottom:28px;border-bottom:2px solid #1a1a2e">
    <div style="font-family:Arial,sans-serif;font-size:20pt;font-weight:700;line-height:1.3;color:#1a1a2e;margin-bottom:16px">${paper.title}</div>
    <div style="font-family:Arial,sans-serif;font-size:9pt;color:#555;margin-bottom:12px">${formatDate(paper.generatedAt)} · ${paper.citationStyle.toUpperCase()}</div>
    <div style="display:flex;gap:20px;justify-content:center;margin-bottom:14px">
      <div style="text-align:center;font-family:Arial,sans-serif"><span style="font-size:13pt;font-weight:700;color:#6c63ff;display:block">~${paper.wordCount.toLocaleString()}</span><span style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:0.05em">Words</span></div>
      <div style="text-align:center;font-family:Arial,sans-serif"><span style="font-size:13pt;font-weight:700;color:#6c63ff;display:block">~${paper.pageEstimate}</span><span style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:0.05em">Pages</span></div>
      <div style="text-align:center;font-family:Arial,sans-serif"><span style="font-size:13pt;font-weight:700;color:#6c63ff;display:block">${paper.citations.length}</span><span style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:0.05em">Citations</span></div>
    </div>
    <div style="font-family:Arial,sans-serif;font-size:10pt;color:#333;background:#f8f8ff;border-left:3px solid #6c63ff;padding:8px 14px;border-radius:0 4px 4px 0;text-align:left"><strong>Keywords: </strong>${paper.keywords.join(', ')}</div>
  </div>
  ${sectionsHtml}
  <div style="margin-top:40px;padding-top:10px;border-top:1px solid #ddd;font-family:Arial,sans-serif;font-size:8pt;color:#aaa;text-align:center">Generated offline by DeepDive AI · Academic Paper Mode</div>
</div></body></html>`;

  const uri = await htmlToPDF(html);
  await sharePDF(uri, `Academic Paper — ${paper.title}`);
}

// ─── 5. Presentation ──────────────────────────────────────────────────────────
//
// Delegates to offlinePptxExport which uses a STATIC pptxgenjs import,
// avoiding the "could not load bundle" Metro bundler error.

export async function exportPresentationOffline(presentation: GeneratedPresentation): Promise<void> {
  const { exportPresentationAsPPTX, exportPresentationAsPDFOffline } = await import('./offlinePptxExport');
  try {
    await exportPresentationAsPPTX(presentation);
  } catch (pptxErr) {
    console.warn('[offlineExport] PPTX failed, falling back to PDF:', pptxErr);
    await exportPresentationAsPDFOffline(presentation);
  }
}

async function exportPresentationAsPDFFallback(presentation: GeneratedPresentation): Promise<void> {
  const t = presentation.themeTokens ?? {
    background: '#0A0A1A', primary: '#6C63FF',
    textPrimary: '#FFFFFF', textSecondary: '#A0A0C0', textMuted: '#5A5A7A',
  };

  const slidesHtml = presentation.slides.map(slide => {
    const ac       = slide.accentColor ?? t.primary;
    const isDark   = t.background.toLowerCase().startsWith('#0') || t.background.toLowerCase().startsWith('#1');
    const bgColor  = isDark ? '#1a1a35' : '#FFFFFF';
    const txtColor = isDark ? '#FFFFFF' : '#1a1a2e';
    const mutColor = isDark ? '#A0A0C0' : '#555577';

    // Bullets / body text
    const bodyHtml = slide.body
      ? `<p style="font-size:13px;color:${mutColor};line-height:1.7;margin-top:10px">${slide.body}</p>`
      : '';

    const bulletsHtml = (slide.bullets ?? []).length
      ? `<ul style="margin:10px 0 0 18px;padding:0">${(slide.bullets ?? []).map(b => `<li style="font-size:13px;color:${mutColor};line-height:1.6;margin-bottom:5px">${b}</li>`).join('')}</ul>`
      : '';

    const statsHtml = (slide.stats ?? []).length
      ? `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">${(slide.stats ?? []).map(s => `<div style="flex:1;min-width:80px;background:${s.color ?? ac}18;border-top:3px solid ${s.color ?? ac};border-radius:8px;padding:12px 10px;text-align:center"><div style="font-size:20px;font-weight:800;color:${s.color ?? ac}">${s.value}</div><div style="font-size:10px;color:${mutColor};margin-top:3px">${s.label}</div></div>`).join('')}</div>`
      : '';

    const quoteHtml = slide.quote
      ? `<blockquote style="border-left:4px solid ${ac};margin:12px 0 0;padding:10px 16px;font-size:15px;font-style:italic;color:${mutColor};line-height:1.6">${slide.quote}${slide.quoteAttribution ? `<footer style="font-size:11px;margin-top:6px;font-style:normal">— ${slide.quoteAttribution}</footer>` : ''}</blockquote>`
      : '';

    const notesHtml = slide.speakerNotes
      ? `<div style="margin-top:12px;padding:10px 12px;background:rgba(0,0,0,0.06);border-radius:6px;font-size:11px;color:${mutColor};font-style:italic">📝 ${slide.speakerNotes}</div>`
      : '';

    return `<div style="background:${bgColor};border:1px solid ${isDark?'#2A2A4A':'#e0e0e0'};border-top:5px solid ${ac};border-radius:12px;padding:28px 30px;margin-bottom:20px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="background:${ac};color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${slide.slideNumber}</span>
        <span style="font-size:9px;color:${ac};font-weight:700;letter-spacing:1px;text-transform:uppercase">${slide.layout.replace('_', ' ')}</span>
        ${slide.badgeText ? `<span style="background:${ac}22;color:${ac};border:1px solid ${ac}44;border-radius:999px;padding:1px 8px;font-size:9px;font-weight:700">${slide.badgeText}</span>` : ''}
      </div>
      <h2 style="font-size:18px;font-weight:800;color:${txtColor};line-height:1.3;margin:0 0 4px">${slide.title}</h2>
      ${slide.subtitle ? `<p style="font-size:13px;color:${ac};font-weight:600;margin:0 0 8px">${slide.subtitle}</p>` : ''}
      ${bodyHtml}${bulletsHtml}${statsHtml}${quoteHtml}${notesHtml}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${presentation.title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#f4f4f4;padding:30px 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
</head><body>
  <div style="max-width:720px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#6C63FF,#8B5CF6);color:white;padding:36px;border-radius:14px;margin-bottom:24px">
      <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;line-height:1.3">${presentation.title}</h1>
      <p style="opacity:0.85;font-size:13px">${presentation.subtitle} · ${presentation.totalSlides} slides · ${presentation.theme} theme · Offline Export</p>
    </div>
    ${slidesHtml}
    <div style="text-align:center;padding:20px;font-size:11px;color:#999">Generated offline by DeepDive AI</div>
  </div>
</body></html>`;

  const uri = await htmlToPDF(html);
  await sharePDF(uri, `Presentation — ${presentation.title}`);
}