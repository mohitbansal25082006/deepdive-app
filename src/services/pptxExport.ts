// src/services/pptxExport.ts
// Part 5 — AI Slide Generator: PPTX + PDF + HTML export
//
// ─── PDF BLACK-PADDING FIX (root cause + solution) ───────────────────────────
//
//  SYMPTOM: PDF pages have black padding on the right (~25%) and bottom, and
//           black gaps appear between slides.
//
//  ROOT CAUSE 1 — Viewport/point mismatch:
//    expo-print's `width` / `height` params are in CSS points (72 dpi).
//    iOS WKWebView renders at 96 dpi, so:
//      1280 pt × (96/72) = 1706 CSS-px rendered viewport width.
//    A `1280px`-wide body fills only 1280/1706 ≈ 75% → 25% black gap on right.
//
//  ROOT CAUSE 2 — Body background bleeds:
//    `body { background: #000 }` shows between slides if the page size doesn't
//    perfectly match the slide height, and between the last slide and the PDF
//    page edge.
//
//  ROOT CAUSE 3 — @page margin not fully suppressed:
//    Without `!important`, some WebKit print drivers re-apply a default margin
//    over the CSS @page rule, pushing content away from page edges.
//
//  FIX — three cooperating changes in buildPDFHTML:
//    1. Add <meta name="viewport" content="width=1280"> → forces the WKWebView
//       CSS viewport to exactly 1280px regardless of dpi scaling.
//    2. @page { size: 1280px 720px; margin: 0 !important; } → PDF page = slide.
//    3. body { background: transparent } → no bleed colour between slides.
//    4. Remove `width` / `height` from printToFileAsync → let @page rule own it.
//
// ─────────────────────────────────────────────────────────────────────────────

import {
  documentDirectory,
  writeAsStringAsync,
  moveAsync,
  EncodingType,
} from 'expo-file-system/legacy';          // SDK ≥ 54: classic API lives here
import * as Sharing from 'expo-sharing';
import * as Print   from 'expo-print';
import pptxgen      from 'pptxgenjs';

import {
  GeneratedPresentation,
  PresentationSlide,
  PresentationThemeTokens,
  SlideLayout,
} from '../types';

// ─── Shape name string literals (pptxgenjs TS types don't expose .shapes) ────

const RECT = 'rect'    as const;
const OVAL = 'ellipse' as const;

// ─── Theme tokens ─────────────────────────────────────────────────────────────

export function getThemeTokens(theme: GeneratedPresentation['theme']): PresentationThemeTokens {
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

function px(hex: string) { return hex.replace(/^#/, ''); }

function safeFileName(title: string) {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

const W = 10;
const H = 5.625;
const makeShadow = () => ({ type: 'outer' as const, color: '000000', blur: 8, offset: 2, angle: 135, opacity: 0.18 });

// ═══════════════════════════════════════════════════════════════════════════════
// PPTX BUILDERS  (unchanged — all layout functions)
// ═══════════════════════════════════════════════════════════════════════════════

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

function buildAgendaSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.5,y:0.15,w:9,h:0.75, fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const items = (d.bullets ?? []).slice(0, 8);
  const half = Math.ceil(items.length / 2);
  const col2On = items.length > 4;
  const colW = col2On ? W/2 - 0.6 : W - 1;
  items.slice(0, half).forEach((item, i) => {
    const y = 1.3 + i * 0.7;
    slide.addShape(OVAL, { x:0.5,y,w:0.38,h:0.38, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(i+1), { x:0.5,y,w:0.38,h:0.38, fontSize:11,bold:true,color:'FFFFFF',align:'center',valign:'middle' });
    slide.addText(item, { x:1.05,y:y+0.02,w:colW,h:0.36, fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle' });
  });
  items.slice(half).forEach((item, i) => {
    const y = 1.3 + i * 0.7;
    const xO = W/2 + 0.1;
    slide.addShape(OVAL, { x:xO,y,w:0.38,h:0.38, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(half+i+1), { x:xO,y,w:0.38,h:0.38, fontSize:11,bold:true,color:'FFFFFF',align:'center',valign:'middle' });
    slide.addText(item, { x:xO+0.55,y:y+0.02,w:colW,h:0.36, fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle' });
  });
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

function buildChartRefSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:0.06,h:H, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.4,y:0.25,w:W-0.8,h:0.65, fontSize:26,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0.4,y:1.0,w:4.5,h:3.5, fill:{color:px(t.surface)}, line:{color:px(t.border),width:1}, shadow:makeShadow() });
  slide.addText('[ Interactive Chart\nAvailable in App ]', { x:0.4,y:1.0,w:4.5,h:3.5, fontSize:13,color:px(t.textMuted),align:'center',valign:'middle',italic:true });
  if (d.body) slide.addText(d.body, { x:5.2,y:1.0,w:4.5,h:3.5, fontSize:13,color:px(t.textSecondary),align:'left',valign:'top',lineSpacingMultiple:1.4,fontFace:'Arial' });
}

function buildPredictionsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.5,y:0.15,w:W-1,h:0.75, fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const preds = (d.bullets ?? []).slice(0, 5);
  preds.forEach((pred, i) => {
    const y = 1.3 + i * 0.77;
    if (i < preds.length - 1) slide.addShape(RECT, { x:0.68,y:y+0.38,w:0.04,h:0.4, fill:{color:px(t.border)}, line:{color:px(t.border),width:0} });
    slide.addShape(OVAL, { x:0.5,y,w:0.4,h:0.4, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(i+1), { x:0.5,y,w:0.4,h:0.4, fontSize:10,bold:true,color:'FFFFFF',align:'center',valign:'middle' });
    slide.addText(pred, { x:1.1,y:y+0.02,w:W-1.5,h:0.36, fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle',fontFace:'Arial' });
  });
}

function buildReferencesSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  const slide = pres.addSlide();
  slide.background = { color: px(t.background) };
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, { x:0.5,y:0.15,w:W-1,h:0.75, fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' });
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const refs = (d.bullets ?? []).slice(0, 7);
  if (refs.length > 0) {
    slide.addText(
      refs.flatMap((ref, i) => [{ text: ref, options: { bullet:{type:'number' as const}, color:px(t.textSecondary), fontSize:11, breakLine:i<refs.length-1, paraSpaceAfter:5, fontFace:'Arial' } }]),
      { x:0.5,y:1.25,w:W-1,h:H-1.55, valign:'top', lineSpacingMultiple:1.2 }
    );
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

function addSlideToPresentation(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens) {
  switch (d.layout as SlideLayout) {
    case 'title':       buildTitleSlide(pres, d, t);       break;
    case 'section':     buildSectionSlide(pres, d, t);     break;
    case 'agenda':      buildAgendaSlide(pres, d, t);      break;
    case 'content':     buildContentSlide(pres, d, t);     break;
    case 'bullets':     buildBulletsSlide(pres, d, t);     break;
    case 'stats':       buildStatsSlide(pres, d, t);       break;
    case 'quote':       buildQuoteSlide(pres, d, t);       break;
    case 'chart_ref':   buildChartRefSlide(pres, d, t);    break;
    case 'predictions': buildPredictionsSlide(pres, d, t); break;
    case 'references':  buildReferencesSlide(pres, d, t);  break;
    case 'closing':     buildClosingSlide(pres, d, t);     break;
    default:            buildContentSlide(pres, d, t);     break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: PPTX EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePPTX(presentation: GeneratedPresentation): Promise<void> {
  const t = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const pres = new pptxgen();
  pres.layout  = 'LAYOUT_16x9';
  pres.author  = 'DeepDive AI';
  pres.company = 'DeepDive AI';
  pres.title   = presentation.title;
  pres.subject = presentation.subtitle;
  for (const slide of presentation.slides) addSlideToPresentation(pres, slide, t);
  const base64 = await pres.write({ outputType: 'base64' }) as string;
  const fileName = `${safeFileName(presentation.title)}_slides.pptx`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      dialogTitle: `Share: ${presentation.title}`,
      UTI: 'com.microsoft.powerpoint.pptx',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF PIXEL-PERFECT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════
//
// Canvas: 1280 × 720 px  (16 : 9)
// pp(inch) converts PPTX inches → pixels at 128 px/inch
// hx() ensures colours always have a leading #
//
// ─────────────────────────────────────────────────────────────────────────────

const PW = 1280;
const PH = 720;
const pp = (inch: number) => Math.round(inch * 128);
const hx = (hex: string) => hex.startsWith('#') ? hex : `#${hex}`;

// ── Per-layout slide HTML ─────────────────────────────────────────────────────

function pdfTitleSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const bg = hx(t.background);
  return `
    <div style="position:absolute;inset:0;background:${bg}"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:8px;background:${ac}"></div>
    <div style="position:absolute;left:${pp(6.5)}px;top:${pp(-1.5)}px;width:${pp(5)}px;height:${pp(5)}px;border-radius:50%;background:${ac};opacity:0.12"></div>
    ${d.badgeText ? `<div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.55)}px;padding:0 ${pp(0.1)}px;height:${pp(0.32)}px;display:inline-flex;align-items:center;background:${ac}22;border:1.5px solid ${ac}66;border-radius:${pp(0.32)}px">
      <span style="color:${ac};font-size:${pp(0.085)}px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap">${d.badgeText}</span>
    </div>` : ''}
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(1.1)}px;width:${pp(7.5)}px;height:${pp(1.8)}px;overflow:hidden">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.38)}px;font-weight:900;line-height:1.1;display:block">${d.title}</span>
    </div>
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(3.0)}px;width:${pp(1.2)}px;height:8px;background:${ac};border-radius:4px"></div>
    ${d.subtitle ? `<div style="position:absolute;left:${pp(0.5)}px;top:${pp(3.15)}px;width:${pp(7.5)}px">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.15)}px;line-height:1.45">${d.subtitle}</span>
    </div>` : ''}
    <div style="position:absolute;right:${pp(0.2)}px;bottom:${pp(0.08)}px;color:${hx(t.textMuted)};font-size:${pp(0.09)}px;font-weight:700;letter-spacing:1px">DeepDive AI</div>
  `;
}

function pdfSectionSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  return `
    <div style="position:absolute;inset:0;background:${ac}"></div>
    <div style="position:absolute;right:0;top:0;width:${pp(2)}px;height:${PH}px;background:rgba(0,0,0,0.25)"></div>
    ${d.sectionTag ? `<div style="position:absolute;left:${pp(0.7)}px;top:${pp(1.5)}px;color:rgba(255,255,255,0.8);font-size:${pp(0.11)}px;font-weight:700;letter-spacing:3px;text-transform:uppercase">${d.sectionTag}</div>` : ''}
    <div style="position:absolute;left:${pp(0.7)}px;top:${pp(2.0)}px;width:${pp(7.5)}px;height:${pp(1.8)}px;overflow:hidden">
      <span style="color:#fff;font-size:${pp(0.42)}px;font-weight:900;line-height:1.05">${d.title}</span>
    </div>
    <div style="position:absolute;right:${pp(0.18)}px;bottom:${pp(0.12)}px;color:rgba(255,255,255,0.55);font-size:${pp(0.1)}px">${d.slideNumber ?? ''}</div>
  `;
}

function pdfAgendaSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const items = (d.bullets ?? []).slice(0, 8);
  const half  = Math.ceil(items.length / 2);
  const col2  = items.length > 4;
  const colW  = pp(col2 ? W/2 - 0.6 : W - 1);
  const makeItem = (item: string, num: number, x: number, y: number) => `
    <div style="position:absolute;left:${x}px;top:${y}px;width:${pp(0.38)}px;height:${pp(0.38)}px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:${pp(0.11)}px;font-weight:700">${num}</span>
    </div>
    <div style="position:absolute;left:${x+pp(0.55)}px;top:${y+pp(0.02)}px;width:${colW}px;height:${pp(0.36)}px;display:flex;align-items:center;overflow:hidden">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px;line-height:1.3">${item}</span>
    </div>`;
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div>
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15)}px;height:${pp(0.75)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>
    ${items.slice(0, half).map((item, i) => makeItem(item, i+1, pp(0.5), pp(1.3 + i*0.7))).join('')}
    ${col2 ? items.slice(half).map((item, i) => makeItem(item, half+i+1, pp(W/2+0.1), pp(1.3 + i*0.7))).join('') : ''}
  `;
}

function pdfContentSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;width:8px;height:${PH}px;background:${ac}"></div>
    <div style="position:absolute;left:${pp(0.4)}px;top:${pp(0.25)}px;height:${pp(0.7)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.0)}px;width:${pp(W-0.8)}px;height:2px;background:${hx(t.border)}"></div>
    ${d.body ? `<div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.1)}px;width:${pp(W-0.85)}px;height:${pp(H-1.5)}px;overflow:hidden">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px;line-height:1.7">${d.body}</span>
    </div>` : ''}
  `;
}

function pdfBulletsSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const bullets = (d.bullets ?? []).slice(0, 6);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div>
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15)}px;height:${pp(0.75)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>
    ${bullets.map((b, i) => `
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(1.3 + i*0.67)}px;display:flex;align-items:flex-start;gap:${pp(0.08)}px;width:${pp(W-1)}px">
      <div style="width:${pp(0.1)}px;height:${pp(0.1)}px;min-width:${pp(0.1)}px;border-radius:50%;background:${ac};margin-top:${pp(0.035)}px;flex-shrink:0"></div>
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px;line-height:1.45">${b}</span>
    </div>`).join('')}
  `;
}

function pdfStatsSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac  = hx(d.accentColor ?? t.primary);
  const stats = (d.stats ?? []).slice(0, 4);
  if (!stats.length) return pdfContentSlide(d, t);
  const cW = pp(2.0), cH = pp(2.4), gap = pp(0.25);
  const total  = stats.length * cW + (stats.length - 1) * gap;
  const startX = (PW - total) / 2;
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:${pp(0.25)}px;left:0;right:0;text-align:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;left:${PW/2-pp(1)}px;top:${pp(0.95)}px;width:${pp(2)}px;height:5px;background:${ac};border-radius:3px"></div>
    ${stats.map((stat, i) => {
      const x   = startX + i * (cW + gap);
      const col = hx(stat.color ?? d.accentColor ?? t.primary);
      return `
      <div style="position:absolute;left:${x}px;top:${pp(1.3)}px;width:${cW}px;height:${cH}px;background:${hx(t.surface)};border-radius:${pp(0.08)}px;border:1px solid ${col};box-shadow:0 4px 20px rgba(0,0,0,0.2);overflow:hidden">
        <div style="height:${pp(0.07)}px;background:${col}"></div>
        <div style="padding:${pp(0.12)}px ${pp(0.08)}px 0;text-align:center">
          <div style="color:${col};font-size:${pp(0.28)}px;font-weight:900;line-height:1">${stat.value}</div>
          <div style="color:${hx(t.textMuted)};font-size:${pp(0.11)}px;margin-top:${pp(0.1)}px;line-height:1.3;text-transform:uppercase;letter-spacing:0.5px">${stat.label}</div>
        </div>
      </div>`;
    }).join('')}
  `;
}

function pdfQuoteSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  return `
    <div style="position:absolute;inset:0;background:${ac}"></div>
    <div style="position:absolute;left:${pp(0.3)}px;top:${pp(-0.2)}px;font-size:${pp(0.9)}px;font-weight:900;color:rgba(255,255,255,0.18);line-height:0.8">\u201C</div>
    <div style="position:absolute;left:${pp(0.7)}px;right:${pp(0.7)}px;top:${pp(1.1)}px;bottom:${pp(0.8)}px;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:${pp(0.2)}px;font-weight:700;text-align:center;line-height:1.5">${d.quote ?? ''}</span>
    </div>
    ${d.quoteAttribution ? `
    <div style="position:absolute;bottom:${pp(0.1)}px;left:0;right:0;text-align:center">
      <div style="display:inline-block;width:${pp(1.5)}px;height:2px;background:rgba(255,255,255,0.45);border-radius:1px;vertical-align:middle;margin-bottom:4px"></div>
      <div style="color:rgba(255,255,255,0.75);font-size:${pp(0.11)}px;font-style:italic;margin-top:4px">\u2014 ${d.quoteAttribution}</div>
    </div>` : ''}
  `;
}

function pdfChartRefSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;width:8px;height:${PH}px;background:${ac}"></div>
    <div style="position:absolute;left:${pp(0.4)}px;top:${pp(0.25)}px;height:${pp(0.65)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.0)}px;width:${pp(4.5)}px;height:${pp(3.5)}px;background:${hx(t.surface)};border:1px solid ${hx(t.border)};border-radius:${pp(0.07)}px;display:flex;align-items:center;justify-content:center">
      <span style="color:${hx(t.textMuted)};font-size:${pp(0.13)}px;font-style:italic;text-align:center;line-height:1.5">[ Interactive Chart<br>Available in App ]</span>
    </div>
    ${d.body ? `<div style="position:absolute;left:${pp(5.2)}px;top:${pp(1.0)}px;width:${pp(4.5)}px;height:${pp(3.5)}px;overflow:hidden">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px;line-height:1.65">${d.body}</span>
    </div>` : ''}
  `;
}

function pdfPredictionsSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const preds = (d.bullets ?? []).slice(0, 5);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div>
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15)}px;height:${pp(0.75)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>
    ${preds.map((pred, i) => `
    ${i < preds.length-1 ? `<div style="position:absolute;left:${pp(0.68)}px;top:${pp(1.3+i*0.77+0.38)}px;width:5px;height:${pp(0.4)}px;background:${hx(t.border)}"></div>` : ''}
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(1.3+i*0.77)}px;width:${pp(0.4)}px;height:${pp(0.4)}px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:${pp(0.1)}px;font-weight:700">${i+1}</span>
    </div>
    <div style="position:absolute;left:${pp(1.1)}px;top:${pp(1.3+i*0.77+0.02)}px;width:${pp(W-1.5)}px">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px;line-height:1.4">${pred}</span>
    </div>`).join('')}
  `;
}

function pdfReferencesSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const refs = (d.bullets ?? []).slice(0, 7);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div>
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15)}px;height:${pp(0.75)}px;display:flex;align-items:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span>
    </div>
    <div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>
    ${refs.map((ref, i) => `
    <div style="position:absolute;left:${pp(0.5)}px;top:${pp(1.28+i*0.5)}px;display:flex;align-items:flex-start;gap:${pp(0.08)}px;width:${pp(W-1)}px">
      <span style="color:${ac};font-size:${pp(0.11)}px;font-weight:700;min-width:${pp(0.22)}px;flex-shrink:0">[${i+1}]</span>
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.11)}px;line-height:1.4">${ref}</span>
    </div>`).join('')}
  `;
}

function pdfClosingSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  const ac = hx(d.accentColor ?? t.primary);
  const cx = PW/2 - pp(1.5);
  const cy = PH/2 - pp(1.6);
  return `
    <div style="position:absolute;inset:0;background:${hx(t.background)}"></div>
    <div style="position:absolute;left:${cx}px;top:${cy}px;width:${pp(3)}px;height:${pp(3)}px;border-radius:50%;background:${ac};opacity:0.1"></div>
    <div style="position:absolute;left:${cx}px;top:${cy}px;width:${pp(3)}px;height:${pp(3)}px;border-radius:50%;border:2px solid ${ac};opacity:0.3"></div>
    <div style="position:absolute;top:${pp(1.3)}px;left:0;right:0;text-align:center">
      <span style="color:${ac};font-size:${pp(0.14)}px;font-weight:700;letter-spacing:3px;text-transform:uppercase">DeepDive AI</span>
    </div>
    <div style="position:absolute;top:${pp(2.0)}px;left:${pp(0.5)}px;width:${pp(W-1)}px;text-align:center">
      <span style="color:${hx(t.textPrimary)};font-size:${pp(0.4)}px;font-weight:900;line-height:1.1">${d.title}</span>
    </div>
    ${d.subtitle ? `<div style="position:absolute;top:${pp(3.25)}px;left:${pp(0.5)}px;width:${pp(W-1)}px;text-align:center">
      <span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px">${d.subtitle}</span>
    </div>` : ''}
    <div style="position:absolute;bottom:${pp(0.1)}px;left:${PW/2-pp(1.5)}px;width:${pp(3)}px;height:5px;background:${ac};border-radius:3px"></div>
  `;
}

function renderPDFSlide(d: PresentationSlide, t: PresentationThemeTokens): string {
  let inner = '';
  switch (d.layout as SlideLayout) {
    case 'title':       inner = pdfTitleSlide(d, t);       break;
    case 'section':     inner = pdfSectionSlide(d, t);     break;
    case 'agenda':      inner = pdfAgendaSlide(d, t);      break;
    case 'content':     inner = pdfContentSlide(d, t);     break;
    case 'bullets':     inner = pdfBulletsSlide(d, t);     break;
    case 'stats':       inner = pdfStatsSlide(d, t);       break;
    case 'quote':       inner = pdfQuoteSlide(d, t);       break;
    case 'chart_ref':   inner = pdfChartRefSlide(d, t);    break;
    case 'predictions': inner = pdfPredictionsSlide(d, t); break;
    case 'references':  inner = pdfReferencesSlide(d, t);  break;
    case 'closing':     inner = pdfClosingSlide(d, t);     break;
    default:            inner = pdfContentSlide(d, t);     break;
  }
  return `<div class="slide" style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif">${inner}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPDFHTML — THE KEY FIX IS HERE
// ─────────────────────────────────────────────────────────────────────────────
//
// THREE cooperating techniques eliminate all black padding:
//
//  1. <meta name="viewport" content="width=1280">
//     Forces WKWebView's CSS viewport = exactly 1280px regardless of device
//     dpi or what width/height was passed to printToFileAsync.
//     Without this, iOS renders at 96dpi and the 1280pt page = 1706 CSS-px
//     wide, so our 1280px body fills only 75% → 25% black on the right.
//
//  2. @page { size: 1280px 720px; margin: 0 !important; }
//     Sets the PDF page to precisely 1280 × 720 (16:9). The `!important`
//     overrides any user-agent default margin that some WebKit builds
//     re-inject over a bare `margin: 0` rule.
//
//  3. html, body { background: transparent; margin: 0; padding: 0; }
//     Removes the black bleed colour. Because each .slide div has its own
//     full-bleed background via `position:absolute;inset:0`, the body colour
//     is only visible in the inter-page gutter (which is now zero) and past
//     the last slide — both transparent, so no visible black.
//
//  4. printToFileAsync called WITHOUT width/height params.
//     The @page CSS owns page sizing. Passing explicit width/height to
//     printToFileAsync overrides @page in some expo versions, so we omit
//     them entirely and let CSS be the single source of truth.
//
// ─────────────────────────────────────────────────────────────────────────────

function buildPDFHTML(presentation: GeneratedPresentation): string {
  const t = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const slidesHTML = presentation.slides.map(s => renderPDFSlide(s, t)).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<!-- FIX 1: Lock CSS viewport = 1280px; prevents the 72dpi→96dpi scaling mismatch
     that makes body content fill only ~75% of the page width on iOS WebKit. -->
<meta name="viewport" content="width=1280, initial-scale=1.0, maximum-scale=1.0"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* FIX 2: PDF page = exactly 1280×720. !important stops WebKit re-injecting
     a default margin after our rule. */
  @page {
    size: 1280px 720px;
    margin: 0 !important;
  }

  /* FIX 3: Transparent background — no black bleed between pages or after
     the last slide. Each slide sets its own full-bleed background colour. */
  html {
    margin: 0 !important;
    padding: 0 !important;
    width: 1280px;
    background: transparent;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: 1280px;
    background: transparent;   /* ← was #000 — that caused the black gaps */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Each slide is exactly one page.
     ─── BLANK PAGE FIX ──────────────────────────────────────────────────────
     DO NOT use page-break-after / break-after here.
     In WKWebView (expo-print), when a block exactly fills a @page (720px in
     a 720px-tall page), adding page-break-after:always still inserts an
     *additional* empty page after that block — so every slide produces two
     PDF pages: the slide content + a blank white page.
     Because @page { size: 1280px 720px } and every .slide is exactly 720px
     tall, the natural document flow already breaks at exactly the right point.
     No explicit page-break directives are needed or wanted.
     ─────────────────────────────────────────────────────────────────────── */
  .slide {
    position: relative;
    width: 1280px;
    height: 720px;
    overflow: hidden;
    /* page-break-after / break-after intentionally omitted — see above */
  }
</style>
</head>
<body>${slidesHTML}</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
//
// FIX 4: Do NOT pass width / height to printToFileAsync.
//   Passing them (e.g. width: 1280) sets the page size in CSS points (72 dpi).
//   On some expo versions that overrides our @page CSS rule, causing the
//   viewport mismatch described above. Omitting them lets @page own it.
//
// ─────────────────────────────────────────────────────────────────────────────

export async function exportAsSlidePDF(presentation: GeneratedPresentation): Promise<void> {
  const html = buildPDFHTML(presentation);

  // ← width / height intentionally omitted — @page CSS handles page sizing
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const fileName = `${safeFileName(presentation.title)}_slides.pdf`;
  const destUri  = `${documentDirectory}${fileName}`;
  await moveAsync({ from: uri, to: destUri });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(destUri, {
      mimeType:    'application/pdf',
      dialogTitle: `Share: ${presentation.title}`,
      UTI:         'com.adobe.pdf',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIVE HTML VIEWER
// ═══════════════════════════════════════════════════════════════════════════════
//
// Full single-page presentation viewer:
//   • Scale-to-fit 16:9 stage (auto-resizes to any screen)
//   • Smooth slide transitions (translate)
//   • Keyboard: ← → Space Home End  |  F = fullscreen  |  N = notes  |  T = thumbs
//   • Touch / swipe support
//   • Thumbnail sidebar with active highlight + auto-scroll
//   • Speaker notes drawer
//   • Progress bar + dot strip + counter
//   • Layout badge
//   • Print-friendly @media print
//
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlideHTML(presentation: GeneratedPresentation): string {
  const t = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const ac = t.primary;
  const TOTAL = presentation.totalSlides;

  const slideMeta = JSON.stringify(
    presentation.slides.map(s => ({
      notes:  s.speakerNotes ?? '',
      title:  s.title,
      layout: s.layout,
    }))
  );

  const framesHTML = presentation.slides
    .map((s, i) => `<div class="slide-frame" data-idx="${i}">${renderPDFSlide(s, t)}</div>`)
    .join('\n');

  const thumbsHTML = presentation.slides.map((s, i) => `
    <div class="thumb-wrap${i === 0 ? ' active' : ''}" data-idx="${i}" onclick="goTo(${i})" title="${s.title.replace(/"/g, '&quot;')}">
      <div class="thumb-clip">
        <div class="thumb-slide">${renderPDFSlide(s, t)}</div>
      </div>
      <div class="thumb-label">${i + 1}</div>
    </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>${presentation.title}</title>
<style>
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg:   ${t.background};
    --surf: ${t.surface};
    --ac:   ${ac};
    --tp:   ${t.textPrimary};
    --ts:   ${t.textSecondary};
    --tm:   ${t.textMuted};
    --bdr:  ${t.border};
  }
  html, body { width:100%; height:100%; overflow:hidden; background:#04040E; font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; color:var(--tp); -webkit-font-smoothing:antialiased; }

  /* ── App shell ── */
  #app { display:flex; flex-direction:column; height:100vh; }

  /* ── Top bar ── */
  #topbar {
    flex-shrink:0; display:flex; align-items:center; gap:8px;
    height:44px; padding:0 12px;
    background:rgba(5,5,20,0.96); border-bottom:1px solid rgba(255,255,255,0.07);
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); z-index:30;
  }
  #tb-title { flex:1; min-width:0; }
  #tb-title h1 { font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--tp); }
  #tb-title p  { font-size:10px; color:var(--tm); margin-top:1px; }
  .tb-btn {
    display:flex; align-items:center; gap:4px; padding:5px 10px; border-radius:7px;
    border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04);
    color:var(--ts); font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;
    transition:background 0.15s, color 0.15s, border-color 0.15s;
    -webkit-tap-highlight-color:transparent;
  }
  .tb-btn:hover { background:rgba(255,255,255,0.1); color:var(--tp); }
  .tb-btn.on    { background:${ac}20; border-color:${ac}55; color:${ac}; }
  .tb-sep { width:1px; height:22px; background:rgba(255,255,255,0.09); margin:0 2px; }

  /* ── Progress bar ── */
  #prog-track { flex-shrink:0; height:3px; background:rgba(255,255,255,0.06); }
  #prog-fill  { height:100%; background:${ac}; border-radius:0 2px 2px 0; width:0; transition:width 0.35s cubic-bezier(0.4,0,0.2,1); }

  /* ── Main area ── */
  #main { flex:1; display:flex; overflow:hidden; min-height:0; }

  /* ── Thumbnail sidebar ── */
  #sidebar {
    flex-shrink:0; width:140px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin;
    background:rgba(5,5,20,0.9); border-right:1px solid rgba(255,255,255,0.07);
    padding:10px 8px; display:flex; flex-direction:column; gap:6px;
    transition:width 0.25s ease, padding 0.25s ease, opacity 0.25s ease;
  }
  #sidebar.closed { width:0; padding:0; opacity:0; pointer-events:none; }
  #sidebar::-webkit-scrollbar { width:3px; }
  #sidebar::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:2px; }

  .thumb-wrap {
    flex-shrink:0; border-radius:6px; overflow:hidden; cursor:pointer;
    border:2px solid transparent; transition:border-color 0.18s, box-shadow 0.18s, transform 0.15s;
  }
  .thumb-wrap:hover  { transform:scale(1.025); border-color:rgba(255,255,255,0.25); }
  .thumb-wrap.active { border-color:${ac}; box-shadow:0 0 12px ${ac}50; }
  .thumb-clip  { width:124px; height:70px; overflow:hidden; position:relative; }
  .thumb-slide { width:1280px; height:720px; transform:scale(0.097); transform-origin:top left; pointer-events:none; }
  .thumb-label { font-size:9px; font-weight:600; color:rgba(255,255,255,0.45); text-align:center; padding:2px 0 3px; background:rgba(0,0,0,0.5); }

  /* ── Stage ── */
  #stage-wrap {
    flex:1; display:flex; align-items:center; justify-content:center;
    background:#04040E; overflow:hidden; min-width:0; position:relative; padding:16px;
  }
  #stage {
    position:relative; border-radius:10px; overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07);
  }
  #track {
    display:flex; position:absolute; top:0; left:0; height:720px;
    transition:transform 0.38s cubic-bezier(0.4,0,0.2,1);
    will-change:transform;
  }
  .slide-frame {
    flex-shrink:0; width:1280px; height:720px;
    position:relative; overflow:hidden;
    font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;
  }

  /* ── Nav arrows ── */
  .nav-btn {
    position:absolute; top:50%; transform:translateY(-50%);
    width:42px; height:42px; border-radius:50%;
    background:rgba(0,0,0,0.55); border:1px solid rgba(255,255,255,0.14);
    color:rgba(255,255,255,0.85); font-size:20px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; z-index:10;
    opacity:0; pointer-events:none;
    transition:opacity 0.2s, background 0.18s, transform 0.18s;
    -webkit-tap-highlight-color:transparent;
  }
  #stage-wrap:hover .nav-btn   { opacity:1; pointer-events:all; }
  #stage-wrap .nav-btn:hover   { background:${ac}; border-color:${ac}; transform:translateY(-50%) scale(1.1); }
  .nav-btn:disabled            { opacity:0!important; pointer-events:none!important; }
  #nav-prev { left:10px; }
  #nav-next { right:10px; }

  /* ── Notes drawer ── */
  #notes-panel {
    flex-shrink:0; overflow:hidden;
    background:rgba(8,8,24,0.97); border-top:1px solid rgba(255,255,255,0.07);
    height:0; transition:height 0.26s ease;
  }
  #notes-panel.open { height:108px; }
  #notes-inner { padding:10px 16px; height:100%; display:flex; flex-direction:column; gap:5px; }
  #notes-lbl  { font-size:10px; font-weight:700; color:${ac}; letter-spacing:1.2px; text-transform:uppercase; }
  #notes-body { font-size:12px; color:var(--ts); line-height:1.6; flex:1; overflow-y:auto; }
  #notes-body::-webkit-scrollbar { width:3px; }
  #notes-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:2px; }

  /* ── Bottom bar ── */
  #botbar {
    flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px;
    height:46px; padding:0 12px;
    background:rgba(5,5,20,0.97); border-top:1px solid rgba(255,255,255,0.07);
  }
  .bot-nav {
    display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px;
    border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04);
    color:var(--ts); font-size:12px; font-weight:700; cursor:pointer;
    transition:background 0.15s, color 0.15s;
    -webkit-tap-highlight-color:transparent;
  }
  .bot-nav:hover:not(:disabled) { background:rgba(255,255,255,0.1); color:var(--tp); }
  .bot-nav:disabled { opacity:0.25; cursor:default; }

  #dot-strip { display:flex; align-items:center; gap:4px; flex-wrap:nowrap; }
  .dot { width:6px; height:6px; border-radius:3px; background:rgba(255,255,255,0.18); cursor:pointer; transition:width 0.22s, background 0.22s; }
  .dot.on { width:18px; background:${ac}; }
  .dot:hover { background:rgba(255,255,255,0.5); }

  #counter    { font-size:12px; font-weight:800; color:${ac}; background:${ac}1A; border:1px solid ${ac}35; border-radius:7px; padding:4px 12px; min-width:64px; text-align:center; }
  #layout-tag { font-size:10px; color:var(--tm); background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:3px 9px; }

  /* ── Print ── */
  @media print {
    #topbar, #botbar, #sidebar, #notes-panel, .nav-btn, #prog-track { display:none!important; }
    #app, #main, #stage-wrap { height:auto; overflow:visible; display:block; }
    #stage { box-shadow:none; border-radius:0; width:100%!important; height:auto!important; }
    #track { flex-direction:column; transform:none!important; transition:none; width:100%!important; height:auto!important; position:static; }
    .slide-frame { width:100%!important; height:auto!important; aspect-ratio:16/9; page-break-after:always; }
  }
</style>
</head>
<body>
<div id="app">

  <div id="topbar">
    <button class="tb-btn on" id="btn-sidebar" title="Thumbnails (T)">&#9776;&nbsp;Slides</button>
    <div class="tb-sep"></div>
    <div id="tb-title">
      <h1>${presentation.title}</h1>
      <p>${TOTAL} slides &middot; ${presentation.theme} theme</p>
    </div>
    <div class="tb-sep"></div>
    <button class="tb-btn" id="btn-notes" title="Speaker notes (N)">&#128196;&nbsp;Notes</button>
    <button class="tb-btn" id="btn-print" title="Print" onclick="window.print()">&#128438;&nbsp;Print</button>
    <button class="tb-btn" id="btn-fs"    title="Fullscreen (F)">&#x26F6;&nbsp;Full</button>
  </div>

  <div id="prog-track"><div id="prog-fill"></div></div>

  <div id="main">
    <div id="sidebar">${thumbsHTML}</div>
    <div id="stage-wrap">
      <button class="nav-btn" id="nav-prev" onclick="prev()" disabled>&#8249;</button>
      <div id="stage">
        <div id="track">${framesHTML}</div>
      </div>
      <button class="nav-btn" id="nav-next" onclick="next()">&#8250;</button>
    </div>
  </div>

  <div id="notes-panel">
    <div id="notes-inner">
      <div id="notes-lbl">&#127908;&nbsp;Speaker Notes</div>
      <div id="notes-body">No notes for this slide.</div>
    </div>
  </div>

  <div id="botbar">
    <button class="bot-nav" id="bb-prev" onclick="prev()" disabled>&#8592; Prev</button>
    <div id="dot-strip"></div>
    <div id="layout-tag"></div>
    <div id="counter">1 / ${TOTAL}</div>
    <button class="bot-nav" id="bb-next" onclick="next()">Next &#8594;</button>
  </div>

</div>
<script>
(function(){
  var META    = ${slideMeta};
  var TOTAL   = ${TOTAL};
  var current = 0;
  var sidebarOpen = true;
  var notesOpen   = false;
  var SCALE   = 1;

  var stageWrap  = document.getElementById('stage-wrap');
  var stage      = document.getElementById('stage');
  var track      = document.getElementById('track');
  var progFill   = document.getElementById('prog-fill');
  var counter    = document.getElementById('counter');
  var dotStrip   = document.getElementById('dot-strip');
  var notesPan   = document.getElementById('notes-panel');
  var notesBody  = document.getElementById('notes-body');
  var layoutTag  = document.getElementById('layout-tag');
  var sidebar    = document.getElementById('sidebar');
  var thumbs     = document.querySelectorAll('.thumb-wrap');
  var btnSidebar = document.getElementById('btn-sidebar');
  var btnNotes   = document.getElementById('btn-notes');
  var bbPrev     = document.getElementById('bb-prev');
  var bbNext     = document.getElementById('bb-next');
  var navPrev    = document.getElementById('nav-prev');
  var navNext    = document.getElementById('nav-next');

  var LAYOUT_LABELS = {
    title:'Title Slide', agenda:'Agenda', section:'Section',
    content:'Content', bullets:'Key Points', stats:'Statistics',
    quote:'Pull Quote', chart_ref:'Chart & Analysis',
    predictions:'Future Outlook', references:'References', closing:'Closing'
  };

  function scale(){
    var aw = stageWrap.clientWidth  - 32;
    var ah = stageWrap.clientHeight - 32;
    SCALE = Math.min(aw / 1280, ah / 720);
    var sw = Math.floor(1280 * SCALE);
    var sh = Math.floor(720  * SCALE);
    stage.style.width  = sw + 'px';
    stage.style.height = sh + 'px';
    track.style.width  = (1280 * TOTAL) + 'px';
    track.style.height = '720px';
    track.style.transformOrigin = 'top left';
    var prev = track.style.transition;
    track.style.transition = 'none';
    applyTransform();
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ track.style.transition = prev; });
    });
  }

  function applyTransform(){
    track.style.transform = 'scale('+SCALE+') translateX('+ (-current * 1280) +'px)';
  }

  function goTo(idx){
    current = Math.max(0, Math.min(idx, TOTAL - 1));
    track.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1)';
    applyTransform();
    refresh();
  }
  function next(){ goTo(current + 1); }
  function prev(){ goTo(current - 1); }

  function refresh(){
    progFill.style.width = ((current + 1) / TOTAL * 100) + '%';
    counter.textContent  = (current + 1) + ' / ' + TOTAL;
    var lay = (META[current] || {}).layout || '';
    layoutTag.textContent = LAYOUT_LABELS[lay] || lay;
    dotStrip.innerHTML = '';
    if(TOTAL <= 15){
      for(var i = 0; i < TOTAL; i++){
        var d = document.createElement('div');
        d.className = 'dot' + (i === current ? ' on' : '');
        (function(ii){ d.onclick = function(){ goTo(ii); }; })(i);
        dotStrip.appendChild(d);
      }
    }
    var n = (META[current] || {}).notes || '';
    notesBody.textContent = n || 'No speaker notes for this slide.';
    thumbs.forEach(function(th, i){
      th.classList.toggle('active', i === current);
      if(i === current) th.scrollIntoView({ block:'nearest', behavior:'smooth' });
    });
    bbPrev.disabled  = current === 0;
    bbNext.disabled  = current === TOTAL - 1;
    navPrev.disabled = current === 0;
    navNext.disabled = current === TOTAL - 1;
  }

  btnSidebar.onclick = function(){
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('closed', !sidebarOpen);
    btnSidebar.classList.toggle('on', sidebarOpen);
    setTimeout(scale, 270);
  };

  btnNotes.onclick = function(){
    notesOpen = !notesOpen;
    notesPan.classList.toggle('open', notesOpen);
    btnNotes.classList.toggle('on', notesOpen);
    setTimeout(scale, 290);
  };

  document.getElementById('btn-fs').onclick = function(){
    if(!document.fullscreenElement){
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
  };
  document.addEventListener('fullscreenchange',       function(){ setTimeout(scale, 100); });
  document.addEventListener('webkitfullscreenchange', function(){ setTimeout(scale, 100); });

  document.addEventListener('keydown', function(e){
    if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); prev(); }
    else if(e.key==='Home'){ e.preventDefault(); goTo(0); }
    else if(e.key==='End') { e.preventDefault(); goTo(TOTAL-1); }
    else if(e.key==='f'||e.key==='F') document.getElementById('btn-fs').click();
    else if(e.key==='n'||e.key==='N') btnNotes.click();
    else if(e.key==='t'||e.key==='T') btnSidebar.click();
  });

  var tx0 = 0;
  stage.addEventListener('touchstart', function(e){ tx0 = e.touches[0].clientX; }, { passive:true });
  stage.addEventListener('touchend',   function(e){
    var dx = e.changedTouches[0].clientX - tx0;
    if(Math.abs(dx) > 45){ dx < 0 ? next() : prev(); }
  });

  window.addEventListener('resize', scale);
  scale();
  refresh();

  window.goTo = goTo;
  window.next = next;
  window.prev = prev;
})();
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: HTML FILE EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function exportAsHTMLSlides(presentation: GeneratedPresentation): Promise<void> {
  const html     = buildSlideHTML(presentation);
  const fileName = `${safeFileName(presentation.title)}_slides.html`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, html, { encoding: EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'text/html',
      dialogTitle: `Share: ${presentation.title}`,
    });
  }
}