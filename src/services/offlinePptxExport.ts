// src/services/offlinePptxExport.ts
// Part 23 — Fix for "could not load bundle" PPTX export error in offline mode.
//
// ROOT CAUSE:
//   pptxgenjs uses internal require() calls to load its own sub-modules at
//   runtime. When invoked via a dynamic import() chain:
//     OfflinePresentationViewer
//       → dynamic import('./pptxExport')
//         → dynamic import('./offlineExportService')
//           → dynamic import('./pptxExport')
//
//   Metro bundler resolves dynamic imports lazily. Inside an already-lazy
//   context (offline viewer screen), the secondary dynamic import of pptxgenjs
//   chunks fails because Metro cannot locate the bundle split at that call
//   depth, producing "could not load bundle".
//
// FIX:
//   Import pptxgenjs STATICALLY at the TOP LEVEL of this module.
//   This guarantees pptxgenjs is included in the main bundle and is always
//   available, regardless of how deep the call stack is.
//   This file is imported statically by OfflinePresentationViewer so the
//   entire pptxgenjs module tree is resolved at startup, never lazily.
//
// USAGE:
//   import { exportPresentationAsPPTX } from '../../services/offlinePptxExport';
//   await exportPresentationAsPPTX(presentation);

// ✅ STATIC import — must NOT be moved inside a function or made dynamic
import pptxgen from 'pptxgenjs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import type { GeneratedPresentation, PresentationSlide, PresentationThemeTokens } from '../types';

// ─── Theme helpers ────────────────────────────────────────────────────────────

function px(hex: string): string {
  return hex.replace(/^#/, '');
}

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

const makeShadow = () => ({ type: 'outer' as const, color: '000000', blur: 8, offset: 2, angle: 135, opacity: 0.18 });
const RECT = 'rect'    as const;
const OVAL = 'ellipse' as const;
const W = 10, H = 5.625;

function getThemeTokens(theme: string): PresentationThemeTokens {
  const themes: Record<string, PresentationThemeTokens> = {
    dark: {
      background: '#0A0A1A', surface: '#1A1A35', primary: '#6C63FF',
      textPrimary: '#FFFFFF', textSecondary: '#A0A0C0', textMuted: '#5A5A7A', border: '#2A2A4A',
      pptx: { background: '0A0A1A', surface: '1A1A35', primary: '6C63FF',
              textPrimary: 'FFFFFF', textSecondary: 'A0A0C0', textMuted: '5A5A7A', border: '2A2A4A' },
    },
    light: {
      background: '#F8F7FF', surface: '#FFFFFF', primary: '#6C63FF',
      textPrimary: '#1A1A35', textSecondary: '#4A4A6A', textMuted: '#8A8AAA', border: '#E0DFF5',
      pptx: { background: 'F8F7FF', surface: 'FFFFFF', primary: '6C63FF',
              textPrimary: '1A1A35', textSecondary: '4A4A6A', textMuted: '8A8AAA', border: 'E0DFF5' },
    },
    corporate: {
      background: '#F0F4F8', surface: '#FFFFFF', primary: '#0052CC',
      textPrimary: '#091E42', textSecondary: '#253858', textMuted: '#5E6C84', border: '#DFE1E6',
      pptx: { background: 'F0F4F8', surface: 'FFFFFF', primary: '0052CC',
              textPrimary: '091E42', textSecondary: '253858', textMuted: '5E6C84', border: 'DFE1E6' },
    },
    vibrant: {
      background: '#0D0D2B', surface: '#1A0A2E', primary: '#FF6584',
      textPrimary: '#FFFFFF', textSecondary: '#C4B5FD', textMuted: '#7C3AED', border: '#2D1B69',
      pptx: { background: '0D0D2B', surface: '1A0A2E', primary: 'FF6584',
              textPrimary: 'FFFFFF', textSecondary: 'C4B5FD', textMuted: '7C3AED', border: '2D1B69' },
    },
  };
  return themes[theme] ?? themes.dark;
}

// ─── Slide builders (same logic as pptxExport.ts) ────────────────────────────

function buildTitleSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:0.06, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addShape(OVAL, { x:6.5,y:-1.5,w:5,h:5, fill:{color:px(ac),transparency:88}, line:{color:px(ac),width:0} });
  if (d.badgeText) {
    slide.addShape(RECT, { x:0.5,y:0.55,w:3.2,h:0.32, fill:{color:px(ac),transparency:80}, line:{color:px(ac),width:1} });
    slide.addText(d.badgeText.toUpperCase(), { x:0.52,y:0.55,w:3.16,h:0.32, fontSize:8,bold:true,color:px(ac),charSpacing:1.5,align:'left',valign:'middle',margin:0 });
  }
  slide.addText(d.title, { x:0.5,y:1.1,w:7.5,h:1.8, fontSize:38,bold:true,color:px(t.textPrimary),align:'left',valign:'top',fontFace:'Arial' });
  slide.addShape(RECT, { x:0.5,y:3.0,w:1.2,h:0.06, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  if (d.subtitle) slide.addText(d.subtitle, { x:0.5,y:3.15,w:7.5,h:0.7, fontSize:15,color:px(t.textSecondary),align:'left',valign:'top',fontFace:'Arial' });
  slide.addText('DeepDive AI', { x:W-2.2,y:H-0.45,w:1.9,h:0.35, fontSize:9,color:px(t.textMuted),align:'right',valign:'middle',bold:true,charSpacing:0.5 });
}

function buildSectionSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  const ac = d.accentColor ?? t.primary;
  slide.background = { color: px(ac) };
  slide.addShape(RECT, { x:W-2,y:0,w:2,h:H, fill:{color:'000000',transparency:75}, line:{color:px(t.border),width:0} });
  if (d.sectionTag) slide.addText(d.sectionTag.toUpperCase(), { x:0.7,y:1.5,w:7,h:0.4, fontSize:11,bold:true,color:'FFFFFF',charSpacing:3,align:'left',valign:'middle' });
  slide.addText(d.title, { x:0.7,y:2.0,w:7.5,h:1.8, fontSize:42,bold:true,color:'FFFFFF',align:'left',valign:'top',fontFace:'Arial' });
  slide.addText(String(d.slideNumber ?? ''), { x:W-1.8,y:H-0.55,w:1.4,h:0.4, fontSize:10,color:'FFFFFF',align:'right',valign:'middle' });
}

function buildBulletsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.5,y:0.15,w:W-1,h:0.75, fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const bullets = (d.bullets ?? []).slice(0, 6);
  if (bullets.length > 0) {
    slide.addText(
      bullets.flatMap((b, i) => [{ text: b, options: { bullet:true, color:px(t.textSecondary), fontSize:14, breakLine:i<bullets.length-1, paraSpaceAfter:6, fontFace:'Arial' } }]),
      { x:0.5,y:1.25,w:W-1,h:H-1.6, valign:'top', lineSpacingMultiple:1.3 }
    );
  }
}

function buildContentSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:0.06,h:H, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.4,y:0.25,w:W-0.8,h:0.7, fontSize:26,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0.4,y:1.0,w:W-0.8,h:0.02, fill:{color:px(t.border)}, line:{color:px(t.border),width:0} });
  if (d.body) slide.addText(d.body, { x:0.4,y:1.1,w:W-0.85,h:H-1.5, fontSize:14,color:px(t.textSecondary),align:'left',valign:'top',lineSpacingMultiple:1.4,fontFace:'Arial' });
}

function buildStatsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addText(d.title, { x:0.5,y:0.25,w:W-1,h:0.65, fontSize:26,bold:true,color:px(t.textPrimary),align:'center',valign:'middle' });
  slide.addShape(RECT, { x:W/2-1,y:0.95,w:2,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const stats = (d.stats ?? []).slice(0, 4);
  if (!stats.length) return;
  const cW = 2.0, cH = 2.4, gap = 0.25;
  const total = stats.length * cW + (stats.length - 1) * gap;
  const startX = (W - total) / 2;
  stats.forEach((stat, i) => {
    const x = startX + i * (cW + gap);
    const col = px(stat.color ?? ac);
    slide.addShape(RECT, { x,y:1.3,w:cW,h:cH, fill:{color:px(t.surface)}, line:{color:col,width:1}, shadow:makeShadow() });
    slide.addShape(RECT, { x,y:1.3,w:cW,h:0.07, fill:{color:col}, line:{color:col,width:0} });
    slide.addText(stat.value, { x:x+0.08,y:1.5,w:cW-0.16,h:1.0, fontSize:28,bold:true,color:col,align:'center',valign:'middle',fontFace:'Arial' });
    slide.addText(stat.label, { x:x+0.08,y:2.6,w:cW-0.16,h:0.8, fontSize:11,color:px(t.textMuted),align:'center',valign:'top',fontFace:'Arial' });
  });
}

function buildQuoteSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  const ac = d.accentColor ?? t.primary;
  slide.background = { color: px(ac) };
  slide.addText('\u201C', { x:0.3,y:-0.2,w:2,h:2, fontSize:120,bold:true,color:'FFFFFF',align:'left',valign:'top' });
  if (d.quote) slide.addText(d.quote, { x:0.7,y:1.1,w:W-1.4,h:2.5, fontSize:20,bold:true,color:'FFFFFF',align:'center',valign:'middle',fontFace:'Arial',lineSpacingMultiple:1.5 });
  if (d.quoteAttribution) {
    slide.addShape(RECT, { x:W/2-1,y:H-0.9,w:2,h:0.03, fill:{color:'FFFFFF',transparency:50}, line:{color:'FFFFFF',width:0} });
    slide.addText(`\u2014 ${d.quoteAttribution}`, { x:0.7,y:H-0.85,w:W-1.4,h:0.5, fontSize:11,color:'FFFFFF',align:'center',valign:'middle',italic:true });
  }
}

function buildClosingSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(OVAL, { x:W/2-1.5,y:H/2-1.6,w:3,h:3, fill:{color:px(ac),transparency:90}, line:{color:px(ac),width:1} });
  slide.addText('DeepDive AI', { x:0,y:1.3,w:W,h:0.6, fontSize:14,bold:true,color:px(ac),align:'center',valign:'middle',charSpacing:3 });
  slide.addText(d.title, { x:0.5,y:2.0,w:W-1,h:1.2, fontSize:40,bold:true,color:px(t.textPrimary),align:'center',valign:'middle',fontFace:'Arial' });
  if (d.subtitle) slide.addText(d.subtitle, { x:0.5,y:3.25,w:W-1,h:0.6, fontSize:14,color:px(t.textSecondary),align:'center',valign:'middle' });
  slide.addShape(RECT, { x:W/2-1.5,y:H-0.6,w:3,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
}

function buildDefaultSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  // Use bullets layout as generic fallback
  buildBulletsSlide(pres, d, t);
}

function addSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  switch (d.layout) {
    case 'title':       buildTitleSlide(pres, d, t);    break;
    case 'section':     buildSectionSlide(pres, d, t);  break;
    case 'agenda':
    case 'bullets':     buildBulletsSlide(pres, d, t);  break;
    case 'content':     buildContentSlide(pres, d, t);  break;
    case 'stats':       buildStatsSlide(pres, d, t);    break;
    case 'quote':       buildQuoteSlide(pres, d, t);    break;
    case 'closing':     buildClosingSlide(pres, d, t);  break;
    default:            buildDefaultSlide(pres, d, t);  break;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a GeneratedPresentation as a .pptx file and open the share sheet.
 *
 * Uses a STATIC import of pptxgenjs (top of file) so Metro bundles it
 * at startup — no lazy chunk resolution needed, no "could not load bundle".
 */
export async function exportPresentationAsPPTX(presentation: GeneratedPresentation): Promise<void> {
  const t    = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const pres = new pptxgen();

  pres.layout  = 'LAYOUT_16x9';
  pres.author  = 'DeepDive AI';
  pres.company = 'DeepDive AI';
  pres.title   = presentation.title;
  pres.subject = presentation.subtitle ?? '';

  for (const slide of presentation.slides) {
    addSlide(pres, slide, t);
  }

  // Write to base64 string (synchronous-ish — pptxgenjs returns a Promise)
  const base64 = await pres.write({ outputType: 'base64' }) as string;

  const docDir   = FileSystem.documentDirectory;
  if (!docDir) throw new Error('documentDirectory is not available on this device.');

  const fileName = `${safeFileName(presentation.title)}_slides.pptx`;
  const fileUri  = `${docDir}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');

  await Sharing.shareAsync(fileUri, {
    mimeType:    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    dialogTitle: `Share: ${presentation.title}`,
    UTI:         'com.microsoft.powerpoint.pptx',
  });
}

/**
 * Export as PDF fallback — used when PPTX fails or user explicitly wants PDF.
 * Renders each slide as a styled card in a single PDF document.
 */
export async function exportPresentationAsPDFOffline(presentation: GeneratedPresentation): Promise<void> {
  const t = presentation.themeTokens ?? getThemeTokens(presentation.theme);

  const isDark   = t.background.toLowerCase().startsWith('#0') || t.background.toLowerCase().startsWith('#1');
  const bgColor  = isDark ? '#1a1a35' : '#FFFFFF';
  const txtColor = isDark ? '#FFFFFF' : '#1a1a2e';
  const mutColor = isDark ? '#A0A0C0' : '#555577';

  const slidesHtml = presentation.slides.map(slide => {
    const ac = slide.accentColor ?? t.primary;

    const bodyHtml    = slide.body ? `<p style="font-size:13px;color:${mutColor};line-height:1.7;margin-top:10px">${slide.body}</p>` : '';
    const bulletsHtml = (slide.bullets ?? []).length
      ? `<ul style="margin:10px 0 0 18px;padding:0">${(slide.bullets ?? []).map(b => `<li style="font-size:13px;color:${mutColor};line-height:1.6;margin-bottom:5px">${b}</li>`).join('')}</ul>` : '';
    const statsHtml = (slide.stats ?? []).length
      ? `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">${(slide.stats ?? []).map(s => `<div style="flex:1;min-width:80px;background:${s.color ?? ac}18;border-top:3px solid ${s.color ?? ac};border-radius:8px;padding:12px 10px;text-align:center"><div style="font-size:20px;font-weight:800;color:${s.color ?? ac}">${s.value}</div><div style="font-size:10px;color:${mutColor};margin-top:3px">${s.label}</div></div>`).join('')}</div>` : '';
    const quoteHtml   = slide.quote ? `<blockquote style="border-left:4px solid ${ac};margin:12px 0 0;padding:10px 16px;font-size:15px;font-style:italic;color:${mutColor};line-height:1.6">${slide.quote}${slide.quoteAttribution ? `<footer style="font-size:11px;margin-top:6px;font-style:normal">— ${slide.quoteAttribution}</footer>` : ''}</blockquote>` : '';
    const notesHtml   = slide.speakerNotes ? `<div style="margin-top:12px;padding:10px 12px;background:rgba(0,0,0,0.06);border-radius:6px;font-size:11px;color:${mutColor};font-style:italic">📝 ${slide.speakerNotes}</div>` : '';

    return `<div style="background:${bgColor};border:1px solid ${isDark ? '#2A2A4A' : '#e0e0e0'};border-top:5px solid ${ac};border-radius:12px;padding:28px 30px;margin-bottom:20px;page-break-inside:avoid">
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
      <p style="opacity:0.85;font-size:13px">${presentation.subtitle ?? ''} · ${presentation.totalSlides} slides · ${presentation.theme} theme</p>
    </div>
    ${slidesHtml}
    <div style="text-align:center;padding:20px;font-size:11px;color:#999">Generated by DeepDive AI</div>
  </div>
</body></html>`;

  // Strip any remote URLs before printing
  const safeHtml = html.replace(/<img[^>]*src=["']https?:\/\/[^"']*["'][^>]*\/?>/gi, '')
                       .replace(/url\(["']?https?:\/\/[^"')]*["']?\)/gi, 'url(about:blank)');

  const { uri } = await Print.printToFileAsync({ html: safeHtml, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `Share: ${presentation.title}`,
      UTI:         'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
}