// src/services/pptxExport.ts
// Part 30 — FINAL FIX
//
// Bugs fixed vs previous version:
//   1. Charts not appearing in PPTX — slide reference was obtained via
//      (pres as any).slides[last] which is unreliable. Fix: each builder
//      now RETURNS the slide object; addSlideToPresentation passes it directly.
//   2. Divider only shows one line regardless of style — PPTX now renders
//      dashed as a series of small rectangles and diamond as rotated squares.
//   3. Red dots in PPTX bullets — bullet:true adds default bullet markers.
//      Fix: use explicit bullet:{code:'2022'} with matching color, or render
//      bullets as plain text with a unicode bullet prefix so color is correct.
//   4. Black shadow boxes in PPTX and PDF — makeShadow() removed everywhere.
//   5. PDF page exactly 1280×720 per slide (already correct, kept intact).
//   6. Image apply fix — pass both uri and onlineUrl; SlideCard reads uri first.
// ─────────────────────────────────────────────────────────────────────────────

import {
  documentDirectory,
  writeAsStringAsync,
  moveAsync,
  EncodingType,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print   from 'expo-print';
import pptxgen      from 'pptxgenjs';

import type {
  GeneratedPresentation,
  PresentationSlide,
  PresentationThemeTokens,
  SlideLayout,
} from '../types';
import type {
  SlideEditorData,
  FieldFormatting,
  AdditionalBlock,
  EditableFieldKey,
} from '../types/editor';

// ─── Shape name literals ──────────────────────────────────────────────────────

const RECT = 'rect'    as const;
const OVAL = 'ellipse' as const;

// ─── Theme tokens ─────────────────────────────────────────────────────────────

export function getThemeTokens(theme: GeneratedPresentation['theme']): PresentationThemeTokens {
  const themes: Record<string, PresentationThemeTokens> = {
    dark: {
      background: '#0A0A1A', surface: '#1A1A35', primary: '#6C63FF',
      textPrimary: '#FFFFFF', textSecondary: '#A0A0C0', textMuted: '#5A5A7A', border: '#2A2A4A',
      pptx: { background: '0A0A1A', surface: '1A1A35', primary: '6C63FF', textPrimary: 'FFFFFF', textSecondary: 'A0A0C0', textMuted: '5A5A7A', border: '2A2A4A' },
    },
    light: {
      background: '#F8F7FF', surface: '#FFFFFF', primary: '#6C63FF',
      textPrimary: '#1A1A35', textSecondary: '#4A4A6A', textMuted: '#8A8AAA', border: '#E0DFF5',
      pptx: { background: 'F8F7FF', surface: 'FFFFFF', primary: '6C63FF', textPrimary: '1A1A35', textSecondary: '4A4A6A', textMuted: '8A8AAA', border: 'E0DFF5' },
    },
    corporate: {
      background: '#F0F4F8', surface: '#FFFFFF', primary: '#0052CC',
      textPrimary: '#091E42', textSecondary: '#253858', textMuted: '#5E6C84', border: '#DFE1E6',
      pptx: { background: 'F0F4F8', surface: 'FFFFFF', primary: '0052CC', textPrimary: '091E42', textSecondary: '253858', textMuted: '5E6C84', border: 'DFE1E6' },
    },
    vibrant: {
      background: '#0D0D2B', surface: '#1A0A2E', primary: '#FF6584',
      textPrimary: '#FFFFFF', textSecondary: '#C4B5FD', textMuted: '#7C3AED', border: '#2D1B69',
      pptx: { background: '0D0D2B', surface: '1A0A2E', primary: 'FF6584', textPrimary: 'FFFFFF', textSecondary: 'C4B5FD', textMuted: '7C3AED', border: '2D1B69' },
    },
  };
  return themes[theme] ?? themes.dark;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function px(hex: string): string { return hex.replace(/^#/, ''); }
function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

const W = 10;
const H = 5.625;

function resolveFontFace(fontFamily: string | undefined): string {
  if (!fontFamily || fontFamily === 'system') return 'Arial';
  switch (fontFamily) {
    case 'serif':     return 'Georgia';
    case 'mono':      return 'Courier New';
    case 'rounded':   return 'Trebuchet MS';
    case 'condensed': return 'Arial Narrow';
    default:          return 'Arial';
  }
}

function getSpacingMultiplier(ed: SlideEditorData | undefined): number {
  if (!ed?.spacing) return 1.0;
  return ed.spacing === 'compact' ? 0.82 : ed.spacing === 'spacious' ? 1.20 : 1.0;
}

function applyFieldFmt(
  base:     Record<string, any>,
  fmt:      FieldFormatting | undefined,
  fontFace: string,
): Record<string, any> {
  if (!fmt) return { ...base, fontFace };
  const out: Record<string, any> = { ...base, fontFace };
  if (fmt.bold)      out.bold      = true;
  if (fmt.italic)    out.italic    = true;
  if (fmt.color)     out.color     = px(fmt.color);
  if (fmt.alignment) out.align     = fmt.alignment;
  if (fmt.fontScale && fmt.fontScale !== 1.0) {
    out.fontSize = Math.round((base.fontSize ?? 14) * fmt.fontScale);
  }
  return out;
}

function getED(slide: PresentationSlide): SlideEditorData | undefined {
  return (slide as any).editorData as SlideEditorData | undefined;
}
function getFieldFmt(slide: PresentationSlide, field: string): FieldFormatting | undefined {
  return getED(slide)?.fieldFormats?.[field as EditableFieldKey];
}
function getOverlayBlocks(slide: PresentationSlide): AdditionalBlock[] {
  return (getED(slide)?.additionalBlocks ?? []).filter(b => b.position?.type === 'overlay');
}
function applyBgOverride(pptxSlide: ReturnType<pptxgen['addSlide']>, slide: PresentationSlide, defaultBg: string): void {
  pptxSlide.background = { color: px(getED(slide)?.backgroundColor ?? defaultBg) };
}
function fmtOpts(
  base: Record<string, any>,
  slide: PresentationSlide,
  field: string,
  fontFace: string,
  sm: number = 1.0,
): Record<string, any> {
  const out = applyFieldFmt(base, getFieldFmt(slide, field), fontFace);
  if (typeof out.y === 'number') out.y = out.y * sm;
  return out;
}

// ─── Image URL → base64 ───────────────────────────────────────────────────────

async function imageUrlToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) return url;
    if (url.startsWith('file://') || url.startsWith('/')) {
      const b64  = await readAsStringAsync(url, { encoding: EncodingType.Base64 });
      const ext  = url.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return `data:${mime};base64,${b64}`;
    }
    const resp = await fetch(url, { headers: { 'Accept': 'image/*' } });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string ?? null);
      reader.onerror   = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[pptxExport] imageUrlToBase64 failed:', url, err);
    return null;
  }
}

async function resolveAllImages(presentation: GeneratedPresentation): Promise<Map<string, string>> {
  const map  = new Map<string, string>();
  const urls: string[] = [];
  for (const slide of presentation.slides) {
    for (const block of getOverlayBlocks(slide)) {
      if (block.type === 'image') {
        const url = (block as any).onlineUrl || block.uri;
        if (url && !urls.includes(url)) urls.push(url);
      }
    }
  }
  await Promise.allSettled(urls.map(async url => {
    const b64 = await imageUrlToBase64(url);
    if (b64) map.set(url, b64);
  }));
  return map;
}

// ─── PPTX overlay blocks ──────────────────────────────────────────────────────
// FIX: takes the actual pptxSlide returned by the builder, not (pres as any).slides[last]
// FIX: chart uses correct pptxgenjs addChart API with proper data format
// FIX: divider renders dashed as dashes and diamond as rotated squares
// FIX: no shadow on any shape (shadow was causing black boxes)
// FIX: bullets use unicode prefix + plain text to avoid colored bullet dots

async function addEditorOverlaysToPPTX(
  pptxSlide: ReturnType<pptxgen['addSlide']>,
  slide:     PresentationSlide,
  t:         PresentationThemeTokens,
  fontFace:  string,
  imgMap:    Map<string, string>,
): Promise<void> {
  const blocks    = getOverlayBlocks(slide);
  const accentHex = px(slide.accentColor ?? t.primary);

  for (const block of blocks) {
    const pos   = block.position!;
    const xFrac = pos.xFrac ?? 0.05;
    const yFrac = pos.yFrac ?? 0.5;
    const wFrac = pos.wFrac ?? 0.9;
    const hFrac = pos.hFrac;
    const x = xFrac * W;
    const y = yFrac * H;
    const w = wFrac * W;

    switch (block.type) {

      // ── IMAGE ──────────────────────────────────────────────────────────────
      case 'image': {
        const rawUrl = (block as any).onlineUrl || block.uri;
        if (!rawUrl) break;
        const ar   = block.aspectRatio ?? 16 / 9;
        const h    = hFrac !== undefined ? hFrac * H : w / ar;
        const data = imgMap.get(rawUrl);
        try {
          if (data) {
            pptxSlide.addImage({ data, x, y, w, h });
          } else if (rawUrl.startsWith('http')) {
            pptxSlide.addImage({ path: rawUrl, x, y, w, h });
          }
          if (block.caption) {
            pptxSlide.addText(block.caption, { x, y: y + h, w, h: 0.22, fontSize: 8, color: 'AAAAAA', align: 'center', fontFace });
          }
        } catch (e) { console.warn('[pptxExport] image block error', e); }
        break;
      }

      // ── STAT ───────────────────────────────────────────────────────────────
      case 'stat': {
        const colHex = px((block as any).color ?? slide.accentColor ?? t.primary);
        const cardH  = hFrac !== undefined ? hFrac * H : 0.9;
        // Background — NO shadow
        pptxSlide.addShape(RECT, { x, y, w, h: cardH, fill: { color: px(t.surface) }, line: { color: colHex, width: 1 } });
        // Top accent bar
        pptxSlide.addShape(RECT, { x, y, w, h: 0.06, fill: { color: colHex }, line: { color: colHex, width: 0 } });
        pptxSlide.addText(block.value, { x, y: y + 0.08, w, h: 0.45, fontSize: 28, bold: true, color: colHex, align: 'center', fontFace });
        pptxSlide.addText(block.label, { x, y: y + 0.56, w, h: 0.28, fontSize: 10, color: px(t.textMuted), align: 'center', fontFace });
        if (block.unit) pptxSlide.addText(block.unit, { x, y: y + 0.82, w, h: 0.2, fontSize: 8, color: colHex, align: 'center', fontFace });
        break;
      }

      // ── CHART ──────────────────────────────────────────────────────────────
      // FIX: pptxgenjs addChart requires data as [{name, labels, values}]
      // The 'bar' chart type string must match pptxgenjs ChartType — use 'bar' directly.
      case 'chart': {
        const cd     = block.chart;
        const chartH = hFrac !== undefined ? hFrac * H : 1.5;
        const hasData = !!(cd.datasets?.[0]?.data?.length && cd.labels?.length);
        if (hasData) {
          try {
            const chartData = [{
              name:   cd.title || 'Data',
              labels: cd.labels as string[],
              values: cd.datasets![0].data as number[],
            }];
            // pptxgenjs accepts 'bar' as first param via ChartType enum or string
            (pptxSlide as any).addChart('bar', chartData, {
              x, y, w, h: chartH,
              barDir:        'col',
              barGrouping:   'clustered',
              showTitle:     true,
              title:         cd.title || '',
              titleFontSize: 11,
              dataLabelFontSize: 9,
              showValue:     false,
              catAxisLabelFontSize:  9,
              valAxisLabelFontSize:  9,
              chartColors:   ['6C63FF', '43E97B', 'FFA726', 'FF6584', '29B6F6', 'AB47BC'],
            });
          } catch (chartErr) {
            // Fallback: render as a styled placeholder with data labels
            console.warn('[pptxExport] addChart failed, using fallback:', chartErr);
            pptxSlide.addShape(RECT, { x, y, w, h: chartH, fill: { color: px(t.surface) }, line: { color: accentHex, width: 1 } });
            pptxSlide.addText(cd.title || 'Chart', { x, y: y + 0.1, w, h: 0.3, fontSize: 10, bold: true, color: accentHex, align: 'center', fontFace });
            // Render bars manually as narrow rectangles
            const data   = cd.datasets![0].data as number[];
            const labels = cd.labels as string[];
            const maxV   = Math.max(...data, 1);
            const barW   = (w - 0.4) / Math.min(data.length, 8);
            data.slice(0, 8).forEach((v, i) => {
              const barH  = Math.max(((v / maxV) * (chartH - 0.7)), 0.05);
              const barX  = x + 0.2 + i * barW;
              const barY  = y + chartH - 0.25 - barH;
              pptxSlide.addShape(RECT, { x: barX, y: barY, w: barW - 0.05, h: barH, fill: { color: accentHex }, line: { color: accentHex, width: 0 } });
              if (labels[i]) pptxSlide.addText(labels[i], { x: barX, y: barY + barH + 0.02, w: barW - 0.05, h: 0.18, fontSize: 7, color: px(t.textMuted), align: 'center', fontFace });
            });
          }
        }
        break;
      }

      // ── QUOTE BLOCK ────────────────────────────────────────────────────────
      case 'quote_block': {
        const qh = 0.9;
        pptxSlide.addShape(RECT, { x, y, w, h: qh, fill: { color: px(t.surface) }, line: { color: accentHex, width: 2 } });
        pptxSlide.addText('\u201C', { x: x + 0.05, y: y - 0.05, w: 0.3, h: 0.35, fontSize: 32, color: accentHex, bold: true, fontFace });
        pptxSlide.addText(block.text, { x: x + 0.15, y: y + 0.06, w: w - 0.25, h: qh - 0.3, fontSize: 11, italic: true, color: px(t.textPrimary), align: 'left', fontFace });
        if (block.attribution) {
          pptxSlide.addText(`\u2014 ${block.attribution}`, { x: x + 0.15, y: y + qh - 0.25, w: w - 0.25, h: 0.22, fontSize: 9, color: accentHex, bold: true, fontFace });
        }
        break;
      }

      // ── DIVIDER ────────────────────────────────────────────────────────────
      // FIX: render all 3 styles correctly — solid line, dashed segments, diamond dots
      case 'divider': {
        const colH = px((block as any).color ?? slide.accentColor ?? t.primary);
        const style = block.style ?? 'solid';

        if (style === 'solid') {
          pptxSlide.addShape(RECT, { x, y: y + 0.04, w, h: 0.03, fill: { color: colH }, line: { color: colH, width: 0 } });

        } else if (style === 'dashed') {
          // Render as alternating small rectangles to simulate dashes
          const dashW   = 0.18;
          const gapW    = 0.08;
          const step    = dashW + gapW;
          const count   = Math.floor(w / step);
          for (let i = 0; i < count; i++) {
            pptxSlide.addShape(RECT, {
              x: x + i * step, y: y + 0.04, w: dashW, h: 0.03,
              fill: { color: colH }, line: { color: colH, width: 0 },
            });
          }

        } else if (style === 'diamond') {
          // Render as small rotated-square shapes spaced across width
          const dotSize = 0.07;
          const dotGap  = 0.12;
          const count   = Math.floor(w / dotGap);
          for (let i = 0; i < count; i++) {
            const isAccent = i % 3 === 1;
            pptxSlide.addShape(RECT, {
              x: x + i * dotGap + dotGap / 2 - dotSize / 2,
              y: y + 0.02,
              w: dotSize,
              h: dotSize,
              fill:      { color: colH, transparency: isAccent ? 0 : 50 },
              line:      { color: colH, width: 0 },
              rotate:    45,
            });
          }
        }
        break;
      }

      // ── ICON ───────────────────────────────────────────────────────────────
      case 'icon': {
        const sz  = Math.max((block.size ?? 40) / 96, 0.2);
        const ic  = px((block as any).color ?? slide.accentColor ?? t.primary);
        const bSz = sz + 0.14;
        // Circle background — NO shadow
        pptxSlide.addShape(OVAL, { x, y, w: bSz, h: bSz, fill: { color: ic, transparency: 85 }, line: { color: ic, width: 1 } });
        // Show label or icon name as text inside the circle
        const iconLabel = block.label || '';
        if (iconLabel) {
          pptxSlide.addText(iconLabel, { x, y: y + bSz + 0.04, w: bSz + 0.5, h: 0.25, fontSize: 9, color: ic, align: 'center', fontFace });
        }
        break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PPTX LAYOUT BUILDERS
// FIX: each builder returns the pptxgen slide object so overlays can be added.
// FIX: all makeShadow() calls removed — they caused black shadow boxes.
// FIX: bullet lists use plain text with '• ' prefix to avoid colored dot issue.
// ═══════════════════════════════════════════════════════════════════════════════

type PptxSlide = ReturnType<pptxgen['addSlide']>;

function buildTitleSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:0.06, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addShape(OVAL, { x:6.5,y:-1.5,w:5,h:5, fill:{color:px(ac),transparency:88}, line:{color:px(ac),width:0} });
  if (d.badgeText) {
    slide.addShape(RECT, { x:0.5,y:0.55*sm,w:3.2,h:0.32, fill:{color:px(ac),transparency:80}, line:{color:px(ac),width:1} });
    slide.addText(d.badgeText.toUpperCase(), fmtOpts({ x:0.52,y:0.55,w:3.16,h:0.32,fontSize:8,bold:true,color:px(ac),charSpacing:1.5,align:'left',valign:'middle',margin:0 }, d, 'badgeText', fontFace, sm));
  }
  slide.addText(d.title, fmtOpts({ x:0.5,y:1.1,w:7.5,h:1.8,fontSize:38,bold:true,color:px(t.textPrimary),align:'left',valign:'top' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0.5,y:3.0*sm,w:1.2,h:0.06, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  if (d.subtitle) slide.addText(d.subtitle, fmtOpts({ x:0.5,y:3.15,w:7.5,h:0.7,fontSize:15,color:px(t.textSecondary),align:'left',valign:'top' }, d, 'subtitle', fontFace, sm));
  slide.addText('DeepDive AI', { x:W-2.2,y:H-0.45,w:1.9,h:0.35,fontSize:9,color:px(t.textMuted),align:'right',valign:'middle',bold:true,charSpacing:0.5,fontFace });
  return slide;
}

function buildSectionSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  const ac = d.accentColor ?? t.primary;
  slide.background = { color: px(getED(d)?.backgroundColor ?? ac) };
  slide.addShape(RECT, { x:W-2,y:0,w:2,h:H, fill:{color:'000000',transparency:75}, line:{color:px(t.border),width:0} });
  if (d.sectionTag) slide.addText(d.sectionTag.toUpperCase(), fmtOpts({ x:0.7,y:1.5,w:7,h:0.4,fontSize:11,bold:true,color:'FFFFFF',charSpacing:3,align:'left',valign:'middle' }, d, 'sectionTag', fontFace, sm));
  slide.addText(d.title, fmtOpts({ x:0.7,y:2.0,w:7.5,h:1.8,fontSize:42,bold:true,color:'FFFFFF',align:'left',valign:'top' }, d, 'title', fontFace, sm));
  return slide;
}

function buildAgendaSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.5,y:0.15,w:9,h:0.75,fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const items = (d.bullets ?? []).slice(0, 8);
  const half  = Math.ceil(items.length / 2);
  const col2  = items.length > 4;
  const colW  = col2 ? W/2 - 0.6 : W - 1;
  items.slice(0, half).forEach((item, i) => {
    const y = (1.3 + i * 0.7) * sm;
    slide.addShape(OVAL, { x:0.5,y,w:0.38,h:0.38, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(i+1), { x:0.5,y,w:0.38,h:0.38,fontSize:11,bold:true,color:'FFFFFF',align:'center',valign:'middle',fontFace });
    slide.addText(item, { x:1.05,y:y+0.02,w:colW,h:0.36,fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle',fontFace });
  });
  if (col2) items.slice(half).forEach((item, i) => {
    const y = (1.3 + i * 0.7) * sm;
    slide.addShape(OVAL, { x:W/2+0.1,y,w:0.38,h:0.38, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(half+i+1), { x:W/2+0.1,y,w:0.38,h:0.38,fontSize:11,bold:true,color:'FFFFFF',align:'center',valign:'middle',fontFace });
    slide.addText(item, { x:W/2+0.65,y:y+0.02,w:colW,h:0.36,fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle',fontFace });
  });
  return slide;
}

function buildContentSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:0.06,h:H, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.4,y:0.25,w:W-0.8,h:0.7,fontSize:26,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0.4,y:1.0*sm,w:W-0.8,h:0.02, fill:{color:px(t.border)}, line:{color:px(t.border),width:0} });
  if (d.body) slide.addText(d.body, fmtOpts({ x:0.4,y:1.1,w:W-0.85,h:H-1.5,fontSize:14,color:px(t.textSecondary),align:'left',valign:'top',lineSpacingMultiple:1.4 }, d, 'body', fontFace, sm));
  return slide;
}

function buildBulletsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac      = d.accentColor ?? t.primary;
  const acHex   = px(ac);
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.5,y:0.15,w:W-1,h:0.75,fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const bullets = (d.bullets ?? []).slice(0, 6);
  // FIX: use plain text with unicode bullet prefix instead of bullet:true
  // bullet:true adds a default colored dot that doesn't respect the text color
  bullets.forEach((b, i) => {
    slide.addText(`\u2022  ${b}`, {
      x: 0.5, y: (1.28 + i * 0.68) * sm, w: W-1, h: 0.58,
      fontSize: 14, color: px(t.textSecondary), align: 'left', valign: 'top',
      lineSpacingMultiple: 1.2, fontFace,
    });
  });
  return slide;
}

function buildStatsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addText(d.title, fmtOpts({ x:0.5,y:0.25,w:W-1,h:0.65,fontSize:26,bold:true,color:px(t.textPrimary),align:'center',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:W/2-1,y:0.95*sm,w:2,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const stats  = (d.stats ?? []).slice(0, 4);
  if (!stats.length) return slide;
  const cW=2.0, cH=2.4, gap=0.25;
  const total  = stats.length * cW + (stats.length - 1) * gap;
  const startX = (W - total) / 2;
  stats.forEach((stat, i) => {
    const x   = startX + i * (cW + gap);
    const col = px(stat.color ?? ac);
    // NO shadow
    slide.addShape(RECT, { x,y:1.3*sm,w:cW,h:cH, fill:{color:px(t.surface)}, line:{color:col,width:1} });
    slide.addShape(RECT, { x,y:1.3*sm,w:cW,h:0.07, fill:{color:col}, line:{color:col,width:0} });
    slide.addText(stat.value, { x:x+0.08,y:1.5*sm,w:cW-0.16,h:1.0,fontSize:28,bold:true,color:col,align:'center',valign:'middle',fontFace });
    slide.addText(stat.label, { x:x+0.08,y:2.6*sm,w:cW-0.16,h:0.8,fontSize:11,color:px(t.textMuted),align:'center',valign:'top',fontFace });
  });
  return slide;
}

function buildQuoteSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  const ac = d.accentColor ?? t.primary;
  slide.background = { color: px(getED(d)?.backgroundColor ?? ac) };
  slide.addText('\u201C', { x:0.3,y:-0.2,w:2,h:2,fontSize:120,bold:true,color:'FFFFFF',align:'left',valign:'top',fontFace });
  if (d.quote) slide.addText(d.quote, fmtOpts({ x:0.7,y:1.1,w:W-1.4,h:2.5,fontSize:20,bold:true,color:'FFFFFF',align:'center',valign:'middle',lineSpacingMultiple:1.5 }, d, 'quote', fontFace, sm));
  if (d.quoteAttribution) {
    slide.addShape(RECT, { x:W/2-1,y:H-0.9,w:2,h:0.03, fill:{color:'FFFFFF',transparency:50}, line:{color:'FFFFFF',width:0} });
    slide.addText(`\u2014 ${d.quoteAttribution}`, fmtOpts({ x:0.7,y:H-0.85,w:W-1.4,h:0.5,fontSize:11,color:'FFFFFF',align:'center',valign:'middle',italic:true }, d, 'quoteAttribution', fontFace, sm));
  }
  return slide;
}

function buildChartRefSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:0.06,h:H, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.4,y:0.25,w:W-0.8,h:0.65,fontSize:26,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  // NO shadow
  slide.addShape(RECT, { x:0.4,y:1.0*sm,w:4.5,h:3.5, fill:{color:px(t.surface)}, line:{color:px(t.border),width:1} });
  slide.addText('[ Interactive Chart\nAvailable in App ]', { x:0.4,y:1.0*sm,w:4.5,h:3.5,fontSize:13,color:px(t.textMuted),align:'center',valign:'middle',italic:true,fontFace });
  if (d.body) slide.addText(d.body, fmtOpts({ x:5.2,y:1.0,w:4.5,h:3.5,fontSize:13,color:px(t.textSecondary),align:'left',valign:'top',lineSpacingMultiple:1.4 }, d, 'body', fontFace, sm));
  return slide;
}

function buildPredictionsSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.5,y:0.15,w:W-1,h:0.75,fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const preds = (d.bullets ?? []).slice(0, 5);
  preds.forEach((pred, i) => {
    const y = (1.3 + i * 0.77) * sm;
    if (i < preds.length-1) slide.addShape(RECT, { x:0.68,y:y+0.38,w:0.04,h:0.4, fill:{color:px(t.border)}, line:{color:px(t.border),width:0} });
    slide.addShape(OVAL, { x:0.5,y,w:0.4,h:0.4, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
    slide.addText(String(i+1), { x:0.5,y,w:0.4,h:0.4,fontSize:10,bold:true,color:'FFFFFF',align:'center',valign:'middle',fontFace });
    slide.addText(pred, { x:1.1,y:y+0.02,w:W-1.5,h:0.36,fontSize:13,color:px(t.textSecondary),align:'left',valign:'middle',fontFace });
  });
  return slide;
}

function buildReferencesSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(RECT, { x:0,y:0,w:W,h:1.05, fill:{color:px(t.surface)}, line:{color:px(t.border),width:0} });
  slide.addText(d.title, fmtOpts({ x:0.5,y:0.15,w:W-1,h:0.75,fontSize:24,bold:true,color:px(t.textPrimary),align:'left',valign:'middle' }, d, 'title', fontFace, sm));
  slide.addShape(RECT, { x:0,y:1.05,w:W,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  const refs = (d.bullets ?? []).slice(0, 7);
  // FIX: plain text with [N] prefix instead of bullet:number
  refs.forEach((ref, i) => {
    slide.addText(`[${i+1}]  ${ref}`, {
      x:0.5, y:(1.28+i*0.56)*sm, w:W-1, h:0.5,
      fontSize:11, color:px(t.textSecondary), align:'left', valign:'top',
      lineSpacingMultiple:1.2, fontFace,
    });
  });
  return slide;
}

function buildClosingSlide(pres: pptxgen, d: PresentationSlide, t: PresentationThemeTokens, fontFace: string, sm: number): PptxSlide {
  const slide = pres.addSlide();
  applyBgOverride(slide, d, t.background);
  const ac = d.accentColor ?? t.primary;
  slide.addShape(OVAL, { x:W/2-1.5,y:H/2-1.6,w:3,h:3, fill:{color:px(ac),transparency:90}, line:{color:px(ac),width:1} });
  slide.addText('DeepDive AI', { x:0,y:1.3*sm,w:W,h:0.6,fontSize:14,bold:true,color:px(ac),align:'center',valign:'middle',charSpacing:3,fontFace });
  slide.addText(d.title, fmtOpts({ x:0.5,y:2.0,w:W-1,h:1.2,fontSize:40,bold:true,color:px(t.textPrimary),align:'center',valign:'middle' }, d, 'title', fontFace, sm));
  if (d.subtitle) slide.addText(d.subtitle, fmtOpts({ x:0.5,y:3.25,w:W-1,h:0.6,fontSize:14,color:px(t.textSecondary),align:'center',valign:'middle' }, d, 'subtitle', fontFace, sm));
  slide.addShape(RECT, { x:W/2-1.5,y:H-0.6,w:3,h:0.04, fill:{color:px(ac)}, line:{color:px(t.border),width:0} });
  return slide;
}

// FIX: each builder returns its slide; pass directly to addEditorOverlaysToPPTX
async function addSlideToPresentation(
  pres:     pptxgen,
  d:        PresentationSlide,
  t:        PresentationThemeTokens,
  fontFace: string,
  imgMap:   Map<string, string>,
): Promise<void> {
  const sm = getSpacingMultiplier(getED(d));
  let builtSlide: PptxSlide;

  switch (d.layout as SlideLayout) {
    case 'title':       builtSlide = buildTitleSlide(pres, d, t, fontFace, sm);       break;
    case 'section':     builtSlide = buildSectionSlide(pres, d, t, fontFace, sm);     break;
    case 'agenda':      builtSlide = buildAgendaSlide(pres, d, t, fontFace, sm);      break;
    case 'content':     builtSlide = buildContentSlide(pres, d, t, fontFace, sm);     break;
    case 'bullets':     builtSlide = buildBulletsSlide(pres, d, t, fontFace, sm);     break;
    case 'stats':       builtSlide = buildStatsSlide(pres, d, t, fontFace, sm);       break;
    case 'quote':       builtSlide = buildQuoteSlide(pres, d, t, fontFace, sm);       break;
    case 'chart_ref':   builtSlide = buildChartRefSlide(pres, d, t, fontFace, sm);    break;
    case 'predictions': builtSlide = buildPredictionsSlide(pres, d, t, fontFace, sm); break;
    case 'references':  builtSlide = buildReferencesSlide(pres, d, t, fontFace, sm);  break;
    case 'closing':     builtSlide = buildClosingSlide(pres, d, t, fontFace, sm);     break;
    default:            builtSlide = buildContentSlide(pres, d, t, fontFace, sm);     break;
  }

  // FIX: pass the directly-returned slide object — no more (pres as any).slides hack
  await addEditorOverlaysToPPTX(builtSlide, d, t, fontFace, imgMap);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: PPTX EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePPTX(presentation: GeneratedPresentation): Promise<void> {
  const t        = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const fontFace = resolveFontFace((presentation as any).fontFamily);
  const imgMap   = await resolveAllImages(presentation);

  const pres = new pptxgen();
  pres.layout  = 'LAYOUT_16x9';
  pres.author  = 'DeepDive AI';
  pres.company = 'DeepDive AI';
  pres.title   = presentation.title;
  pres.subject = presentation.subtitle;

  for (const slide of presentation.slides) {
    await addSlideToPresentation(pres, slide, t, fontFace, imgMap);
  }

  const base64   = await pres.write({ outputType: 'base64' }) as string;
  const fileName = `${safeFileName(presentation.title)}_slides.pptx`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      dialogTitle: `Share: ${presentation.title}`,
      UTI:         'com.microsoft.powerpoint.pptx',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF RENDERER
// FIX: no shadow CSS, correct @page size (1280×720px = one slide per page)
// ═══════════════════════════════════════════════════════════════════════════════

const PW = 1280;
const PH = 720;
const pp = (inch: number) => Math.round(inch * 128);
const hx = (hex: string) => hex.startsWith('#') ? hex : `#${hex}`;

function fieldStyle(slide: PresentationSlide, field: string, base: string = ''): string {
  const fmt = getFieldFmt(slide, field);
  if (!fmt) return base;
  const parts: string[] = [];
  if (fmt.bold)      parts.push('font-weight:900');
  if (fmt.italic)    parts.push('font-style:italic');
  if (fmt.color)     parts.push(`color:${hx(fmt.color)}`);
  if (fmt.alignment) parts.push(`text-align:${fmt.alignment}`);
  if (fmt.fontScale && fmt.fontScale !== 1.0) {
    const m = base.match(/font-size:(\d+)px/);
    if (m) parts.push(`font-size:${Math.round(parseInt(m[1]) * fmt.fontScale)}px`);
  }
  return parts.length > 0 ? `${base};${parts.join(';')}` : base;
}

function deckFontCSS(presentation: GeneratedPresentation): string {
  const ff = (presentation as any).fontFamily as string | undefined;
  if (!ff || ff === 'system') return `-apple-system,'Helvetica Neue',Arial,sans-serif`;
  switch (ff) {
    case 'serif':     return `Georgia,'Times New Roman',serif`;
    case 'mono':      return `'Courier New',Courier,monospace`;
    case 'rounded':   return `'Trebuchet MS','Segoe UI',Arial,sans-serif`;
    case 'condensed': return `'Arial Narrow',Arial,sans-serif`;
    default:          return `-apple-system,'Helvetica Neue',Arial,sans-serif`;
  }
}

// PDF overlay blocks — no box-shadow, base64 images
function renderOverlayBlocksHTML(slide: PresentationSlide, accentColor: string, imgMap: Map<string, string>): string {
  const blocks = getOverlayBlocks(slide);
  if (!blocks.length) return '';

  return blocks.map(block => {
    const pos   = block.position!;
    const left  = Math.round(PW * (pos.xFrac ?? 0.05));
    const top   = Math.round(PH * (pos.yFrac ?? 0.5));
    const width = Math.round(PW * (pos.wFrac ?? 0.9));
    const hFrac = pos.hFrac;
    const col   = hx((block as any).color ?? accentColor);

    switch (block.type) {

      case 'image': {
        const rawUrl = (block as any).onlineUrl || block.uri;
        if (!rawUrl) return '';
        const src  = imgMap.get(rawUrl) ?? rawUrl;
        const ar   = block.aspectRatio ?? 16/9;
        const imgH = hFrac !== undefined ? Math.round(PH * hFrac) : Math.round(width / ar);
        return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${imgH}px;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.15)"><img src="${src}" style="width:100%;height:100%;object-fit:cover" />${block.caption ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);padding:3px 8px;font-size:11px;color:#FFF">${block.caption}</div>` : ''}</div>`;
      }

      case 'stat': {
        const cardH = hFrac !== undefined ? Math.round(PH * hFrac) : 96;
        // NO box-shadow
        return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${cardH}px;background:#1A1A35;border-radius:5px;border-top:4px solid ${col};border:1px solid ${col}40;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 8px"><div style="color:${col};font-size:${pp(0.22)}px;font-weight:900;line-height:1;margin-bottom:4px">${block.value}</div><div style="color:rgba(255,255,255,0.5);font-size:${pp(0.09)}px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">${block.label}</div>${block.unit ? `<div style="color:${col}AA;font-size:${pp(0.07)}px;margin-top:2px">${block.unit}</div>` : ''}</div>`;
      }

      case 'chart': {
        const cd     = block.chart;
        const chartH = hFrac !== undefined ? Math.round(PH * hFrac) : 140;
        const hasBars = !!(cd.datasets?.[0]?.data?.length && cd.labels?.length);
        if (!hasBars) return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${chartH}px;background:#1A1A3588;border-radius:5px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:14px">${cd.title}</div>`;
        const data    = cd.datasets![0].data as number[];
        const maxV    = Math.max(...data, 1);
        const labels  = cd.labels as string[];
        const CCOLS   = [accentColor,'#43E97B','#FFA726','#FF6584','#29B6F6'];
        const barAreaH = chartH - 36;
        const barW    = Math.floor((width - 20) / Math.min(data.length, 8));
        const bars    = data.slice(0,8).map((v,i) => {
          const barH = Math.max(Math.round((v/maxV)*barAreaH), 4);
          const bc   = CCOLS[i % CCOLS.length];
          // NO box-shadow on bars
          return `<div style="display:flex;flex-direction:column;align-items:center;width:${barW-4}px;margin:0 2px"><div style="width:100%;height:${barH}px;background:${bc};border-radius:2px 2px 0 0;margin-top:${barAreaH-barH}px"></div><div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px;overflow:hidden;white-space:nowrap;max-width:${barW-4}px">${labels[i]??''}</div></div>`;
        }).join('');
        return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${chartH}px;background:#1A1A35CC;border-radius:5px;padding:8px 10px"><div style="color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;margin-bottom:6px">${cd.title}</div><div style="display:flex;align-items:flex-end;height:${barAreaH}px">${bars}</div></div>`;
      }

      case 'quote_block':
        return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;background:${col}18;border-radius:4px;border-left:4px solid ${col};padding:10px 12px"><div style="color:#FFF;font-size:36px;font-weight:900;opacity:0.2;line-height:0.6;margin-bottom:-4px">\u201C</div><div style="color:rgba(255,255,255,0.9);font-size:${pp(0.1)}px;line-height:1.5;font-style:italic">${block.text}</div>${block.attribution ? `<div style="color:${col};font-size:${pp(0.08)}px;margin-top:6px;font-weight:600">— ${block.attribution}</div>` : ''}</div>`;

      case 'divider': {
        const dc    = hx((block as any).color ?? accentColor);
        const style = block.style ?? 'solid';
        if (style === 'solid') {
          return `<div style="position:absolute;left:${left}px;top:${top+4}px;width:${width}px;height:3px;background:${dc};border-radius:2px"></div>`;
        } else if (style === 'dashed') {
          // CSS dashed border — works fine in PDF WebView
          return `<div style="position:absolute;left:${left}px;top:${top+4}px;width:${width}px;height:0;border-top:3px dashed ${dc}"></div>`;
        } else {
          // Diamond: use a series of small rotated divs
          const dotSize = 8;
          const spacing = 16;
          const count   = Math.floor(width / spacing);
          const dots    = Array.from({length: count}, (_, i) => {
            const isAccent = i % 3 === 1;
            return `<div style="width:${dotSize}px;height:${dotSize}px;background:${dc};opacity:${isAccent?1:0.4};transform:rotate(45deg);flex-shrink:0"></div>`;
          }).join(`<div style="width:${spacing-dotSize}px;flex-shrink:0"></div>`);
          return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:12px;display:flex;align-items:center;flex-direction:row">${dots}</div>`;
        }
      }

      case 'icon': {
        const sz  = (block.size ?? 40) * 0.5;
        const ic  = hx((block as any).color ?? accentColor);
        const bSz = sz + 14;
        // NO box-shadow — just a simple circle background
        return `<div style="position:absolute;left:${left}px;top:${top}px;width:${bSz}px;height:${bSz}px;border-radius:50%;background:${ic}18;border:1px solid ${ic}35;display:flex;align-items:center;justify-content:center"><div style="color:${ic};font-size:${sz*0.7}px;font-weight:700">${block.label ?? '●'}</div></div>`;
      }

      default: return '';
    }
  }).join('\n');
}

// ── Per-layout PDF renderers ───────────────────────────────────────────────────

function pdfTitleSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d));
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;right:0;height:8px;background:${ac}"></div><div style="position:absolute;left:${pp(6.5)}px;top:${pp(-1.5)}px;width:${pp(5)}px;height:${pp(5)}px;border-radius:50%;background:${ac};opacity:0.12"></div>${d.badgeText?`<div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.55*sm)}px;padding:0 8px;height:${pp(0.32)}px;display:inline-flex;align-items:center;background:${ac}22;border:1.5px solid ${ac}66;border-radius:20px"><span style="color:${ac};font-size:${pp(0.085)}px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;${fieldStyle(d,'badgeText')}">${d.badgeText}</span></div>`:''}<div style="position:absolute;left:${pp(0.5)}px;top:${pp(1.1*sm)}px;width:${pp(7.5)}px;height:${pp(1.8)}px;overflow:hidden"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.38)}px;font-weight:900;line-height:1.1;display:block;${fieldStyle(d,'title',`font-size:${pp(0.38)}px`)}">${d.title}</span></div><div style="position:absolute;left:${pp(0.5)}px;top:${pp(3.0*sm)}px;width:${pp(1.2)}px;height:8px;background:${ac};border-radius:4px"></div>${d.subtitle?`<div style="position:absolute;left:${pp(0.5)}px;top:${pp(3.15*sm)}px;width:${pp(7.5)}px"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.15)}px;line-height:1.45;${fieldStyle(d,'subtitle',`font-size:${pp(0.15)}px`)}">${d.subtitle}</span></div>`:''}<div style="position:absolute;right:${pp(0.2)}px;bottom:${pp(0.08)}px;color:${hx(t.textMuted)};font-size:${pp(0.09)}px;font-weight:700;letter-spacing:1px">DeepDive AI</div>${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfSectionSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??ac),sm=getSpacingMultiplier(getED(d));
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;right:0;top:0;width:${pp(2)}px;height:${PH}px;background:rgba(0,0,0,0.25)"></div>${d.sectionTag?`<div style="position:absolute;left:${pp(0.7)}px;top:${pp(1.5*sm)}px;color:rgba(255,255,255,0.8);font-size:${pp(0.11)}px;font-weight:700;letter-spacing:3px;text-transform:uppercase">${d.sectionTag}</div>`:''}<div style="position:absolute;left:${pp(0.7)}px;top:${pp(2.0*sm)}px;width:${pp(7.5)}px"><span style="color:#fff;font-size:${pp(0.42)}px;font-weight:900;line-height:1.05;${fieldStyle(d,'title',`font-size:${pp(0.42)}px`)}">${d.title}</span></div>${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfContentSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d));
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;width:8px;height:${PH}px;background:${ac}"></div><div style="position:absolute;left:${pp(0.4)}px;top:${pp(0.25*sm)}px;height:${pp(0.7)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800;${fieldStyle(d,'title',`font-size:${pp(0.26)}px`)}">${d.title}</span></div><div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.0*sm)}px;width:${pp(W-0.8)}px;height:2px;background:${hx(t.border)}"></div>${d.body?`<div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.1*sm)}px;width:${pp(W-0.85)}px;height:${pp(H-1.5)}px;overflow:hidden"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px;line-height:1.7;${fieldStyle(d,'body',`font-size:${pp(0.14)}px`)}">${d.body}</span></div>`:''} ${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfBulletsSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),bullets=(d.bullets??[]).slice(0,6);
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div><div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15*sm)}px;height:${pp(0.75)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800;${fieldStyle(d,'title',`font-size:${pp(0.24)}px`)}">${d.title}</span></div><div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>${bullets.map((b,i)=>`<div style="position:absolute;left:${pp(0.5)}px;top:${pp((1.3+i*0.67)*sm)}px;display:flex;align-items:flex-start;gap:${pp(0.08)}px;width:${pp(W-1)}px"><div style="width:10px;height:10px;min-width:10px;border-radius:50%;background:${ac};margin-top:5px;flex-shrink:0"></div><span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px;line-height:1.45">${b}</span></div>`).join('')}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfStatsSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),stats=(d.stats??[]).slice(0,4);
  if(!stats.length) return pdfContentSlide(d,t,ff,imgMap);
  const cW=pp(2.0),cH=pp(2.4),gap=pp(0.25),total=stats.length*cW+(stats.length-1)*gap,startX=(PW-total)/2;
  // NO box-shadow on stat cards
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:${pp(0.25*sm)}px;left:0;right:0;text-align:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800;${fieldStyle(d,'title',`font-size:${pp(0.26)}px`)}">${d.title}</span></div><div style="position:absolute;left:${PW/2-pp(1)}px;top:${pp(0.95*sm)}px;width:${pp(2)}px;height:5px;background:${ac};border-radius:3px"></div>${stats.map((stat,i)=>{const x=startX+i*(cW+gap);const col=hx(stat.color??d.accentColor??t.primary);return`<div style="position:absolute;left:${x}px;top:${pp(1.3*sm)}px;width:${cW}px;height:${cH}px;background:${hx(t.surface)};border-radius:${pp(0.08)}px;border:1px solid ${col};overflow:hidden"><div style="height:${pp(0.07)}px;background:${col}"></div><div style="padding:${pp(0.12)}px ${pp(0.08)}px 0;text-align:center"><div style="color:${col};font-size:${pp(0.28)}px;font-weight:900;line-height:1">${stat.value}</div><div style="color:${hx(t.textMuted)};font-size:${pp(0.11)}px;margin-top:${pp(0.1)}px;text-transform:uppercase;letter-spacing:0.5px">${stat.label}</div></div></div>`;}).join('')}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfQuoteSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??ac),sm=getSpacingMultiplier(getED(d));
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;left:${pp(0.3)}px;top:${pp(-0.2)}px;font-size:${pp(0.9)}px;font-weight:900;color:rgba(255,255,255,0.18);line-height:0.8">\u201C</div><div style="position:absolute;left:${pp(0.7)}px;right:${pp(0.7)}px;top:${pp(1.1*sm)}px;bottom:${pp(0.8)}px;display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:${pp(0.2)}px;font-weight:700;text-align:center;line-height:1.5;${fieldStyle(d,'quote',`font-size:${pp(0.2)}px`)}">${d.quote??''}</span></div>${d.quoteAttribution?`<div style="position:absolute;bottom:${pp(0.1)}px;left:0;right:0;text-align:center"><div style="color:rgba(255,255,255,0.75);font-size:${pp(0.11)}px;font-style:italic">\u2014 ${d.quoteAttribution}</div></div>`:''}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfAgendaSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),items=(d.bullets??[]).slice(0,8),half=Math.ceil(items.length/2),col2=items.length>4,colW=pp(col2?W/2-0.6:W-1);
  const mi=(item:string,num:number,x:number,y:number)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${pp(0.38)}px;height:${pp(0.38)}px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:${pp(0.11)}px;font-weight:700">${num}</span></div><div style="position:absolute;left:${x+pp(0.55)}px;top:${y+pp(0.02)}px;width:${colW}px;display:flex;align-items:center;overflow:hidden"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px">${item}</span></div>`;
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div><div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15*sm)}px;height:${pp(0.75)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span></div><div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>${items.slice(0,half).map((item,i)=>mi(item,i+1,pp(0.5),pp((1.3+i*0.7)*sm))).join('')}${col2?items.slice(half).map((item,i)=>mi(item,half+i+1,pp(W/2+0.1),pp((1.3+i*0.7)*sm))).join(''):''}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfChartRefSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d));
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;width:8px;height:${PH}px;background:${ac}"></div><div style="position:absolute;left:${pp(0.4)}px;top:${pp(0.25*sm)}px;height:${pp(0.65)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.26)}px;font-weight:800">${d.title}</span></div><div style="position:absolute;left:${pp(0.4)}px;top:${pp(1.0*sm)}px;width:${pp(4.5)}px;height:${pp(3.5)}px;background:${hx(t.surface)};border:1px solid ${hx(t.border)};border-radius:${pp(0.07)}px;display:flex;align-items:center;justify-content:center"><span style="color:${hx(t.textMuted)};font-size:${pp(0.13)}px;font-style:italic;text-align:center">[ Interactive Chart<br>Available in App ]</span></div>${d.body?`<div style="position:absolute;left:${pp(5.2)}px;top:${pp(1.0*sm)}px;width:${pp(4.5)}px;height:${pp(3.5)}px;overflow:hidden"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px;line-height:1.65">${d.body}</span></div>`:''}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfPredictionsSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),preds=(d.bullets??[]).slice(0,5);
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div><div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15*sm)}px;height:${pp(0.75)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span></div><div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>${preds.map((pred,i)=>`${i<preds.length-1?`<div style="position:absolute;left:${pp(0.68)}px;top:${pp((1.3+i*0.77+0.38)*sm)}px;width:5px;height:${pp(0.4*sm)}px;background:${hx(t.border)}"></div>`:''}<div style="position:absolute;left:${pp(0.5)}px;top:${pp((1.3+i*0.77)*sm)}px;width:${pp(0.4)}px;height:${pp(0.4)}px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:${pp(0.1)}px;font-weight:700">${i+1}</span></div><div style="position:absolute;left:${pp(1.1)}px;top:${pp((1.32+i*0.77)*sm)}px;width:${pp(W-1.5)}px"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.13)}px;line-height:1.4">${pred}</span></div>`).join('')}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfReferencesSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),refs=(d.bullets??[]).slice(0,7);
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;top:0;left:0;right:0;height:${pp(1.05)}px;background:${hx(t.surface)}"></div><div style="position:absolute;left:${pp(0.5)}px;top:${pp(0.15*sm)}px;height:${pp(0.75)}px;display:flex;align-items:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.24)}px;font-weight:800">${d.title}</span></div><div style="position:absolute;top:${pp(1.05)}px;left:0;right:0;height:5px;background:${ac}"></div>${refs.map((ref,i)=>`<div style="position:absolute;left:${pp(0.5)}px;top:${pp((1.28+i*0.5)*sm)}px;display:flex;align-items:flex-start;gap:${pp(0.08)}px;width:${pp(W-1)}px"><span style="color:${ac};font-size:${pp(0.11)}px;font-weight:700;min-width:${pp(0.22)}px;flex-shrink:0">[${i+1}]</span><span style="color:${hx(t.textSecondary)};font-size:${pp(0.11)}px;line-height:1.4">${ref}</span></div>`).join('')}${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}
function pdfClosingSlide(d: PresentationSlide, t: PresentationThemeTokens, ff: string, imgMap: Map<string, string>): string {
  const ac=hx(d.accentColor??t.primary),bg=hx(getED(d)?.backgroundColor??t.background),sm=getSpacingMultiplier(getED(d)),cx=PW/2-pp(1.5),cy=PH/2-pp(1.6);
  return `<div style="position:absolute;inset:0;background:${bg}"></div><div style="position:absolute;left:${cx}px;top:${cy}px;width:${pp(3)}px;height:${pp(3)}px;border-radius:50%;background:${ac};opacity:0.1"></div><div style="position:absolute;left:${cx}px;top:${cy}px;width:${pp(3)}px;height:${pp(3)}px;border-radius:50%;border:2px solid ${ac};opacity:0.3"></div><div style="position:absolute;top:${pp(1.3*sm)}px;left:0;right:0;text-align:center"><span style="color:${ac};font-size:${pp(0.14)}px;font-weight:700;letter-spacing:3px;text-transform:uppercase">DeepDive AI</span></div><div style="position:absolute;top:${pp(2.0*sm)}px;left:${pp(0.5)}px;width:${pp(W-1)}px;text-align:center"><span style="color:${hx(t.textPrimary)};font-size:${pp(0.4)}px;font-weight:900;line-height:1.1;${fieldStyle(d,'title',`font-size:${pp(0.4)}px`)}">${d.title}</span></div>${d.subtitle?`<div style="position:absolute;top:${pp(3.25*sm)}px;left:${pp(0.5)}px;width:${pp(W-1)}px;text-align:center"><span style="color:${hx(t.textSecondary)};font-size:${pp(0.14)}px">${d.subtitle}</span></div>`:''}<div style="position:absolute;bottom:${pp(0.1)}px;left:${PW/2-pp(1.5)}px;width:${pp(3)}px;height:5px;background:${ac};border-radius:3px"></div>${renderOverlayBlocksHTML(d,ac,imgMap)}`;
}

function renderPDFSlide(d: PresentationSlide, t: PresentationThemeTokens, fontFamily: string, imgMap: Map<string, string>): string {
  let inner = '';
  switch (d.layout as SlideLayout) {
    case 'title':       inner = pdfTitleSlide(d,t,fontFamily,imgMap);       break;
    case 'section':     inner = pdfSectionSlide(d,t,fontFamily,imgMap);     break;
    case 'agenda':      inner = pdfAgendaSlide(d,t,fontFamily,imgMap);      break;
    case 'content':     inner = pdfContentSlide(d,t,fontFamily,imgMap);     break;
    case 'bullets':     inner = pdfBulletsSlide(d,t,fontFamily,imgMap);     break;
    case 'stats':       inner = pdfStatsSlide(d,t,fontFamily,imgMap);       break;
    case 'quote':       inner = pdfQuoteSlide(d,t,fontFamily,imgMap);       break;
    case 'chart_ref':   inner = pdfChartRefSlide(d,t,fontFamily,imgMap);    break;
    case 'predictions': inner = pdfPredictionsSlide(d,t,fontFamily,imgMap); break;
    case 'references':  inner = pdfReferencesSlide(d,t,fontFamily,imgMap);  break;
    case 'closing':     inner = pdfClosingSlide(d,t,fontFamily,imgMap);     break;
    default:            inner = pdfContentSlide(d,t,fontFamily,imgMap);     break;
  }
  return `<div class="slide" style="font-family:${fontFamily}">${inner}</div>`;
}

function buildPDFHTML(presentation: GeneratedPresentation, imgMap: Map<string, string>): string {
  const t          = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const fontFamily = deckFontCSS(presentation);
  const slidesHTML = presentation.slides.map(s => renderPDFSlide(s, t, fontFamily, imgMap)).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1280, initial-scale=1.0, maximum-scale=1.0"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  /* One slide = one PDF page, exactly 1280×720 (16:9) */
  @page { size: 1280px 720px; margin: 0 !important; }
  html, body {
    margin: 0 !important; padding: 0 !important;
    width: 1280px; background: transparent;
    font-family: ${fontFamily};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slide {
    position: relative;
    width: 1280px;
    height: 720px;
    overflow: hidden;
    /* No page-break — natural flow breaks at exactly 720px boundary */
  }
</style>
</head>
<body>${slidesHTML}</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function exportAsSlidePDF(presentation: GeneratedPresentation): Promise<void> {
  const imgMap = await resolveAllImages(presentation);
  const html   = buildPDFHTML(presentation, imgMap);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = `${safeFileName(presentation.title)}_slides.pdf`;
  const destUri  = `${documentDirectory}${fileName}`;
  await moveAsync({ from: uri, to: destUri });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(destUri, {
      mimeType: 'application/pdf', dialogTitle: `Share: ${presentation.title}`, UTI: 'com.adobe.pdf',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: HTML EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSlideHTML(presentation: GeneratedPresentation): string {
  const imgMap     = new Map<string, string>();
  const t          = presentation.themeTokens ?? getThemeTokens(presentation.theme);
  const fontFamily = deckFontCSS(presentation);
  const ac         = t.primary;
  const TOTAL      = presentation.totalSlides;
  const slideMeta  = JSON.stringify(presentation.slides.map(s => ({ notes: s.speakerNotes ?? '', title: s.title, layout: s.layout })));
  const framesHTML = presentation.slides.map((s,i) => `<div class="slide-frame" data-idx="${i}">${renderPDFSlide(s,t,fontFamily,imgMap)}</div>`).join('\n');
  const thumbsHTML = presentation.slides.map((s,i) => `<div class="thumb-wrap${i===0?' active':''}" data-idx="${i}" onclick="goTo(${i})"><div class="thumb-clip"><div class="thumb-slide">${renderPDFSlide(s,t,fontFamily,imgMap)}</div></div><div class="thumb-label">${i+1}</div></div>`).join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><title>${presentation.title}</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}:root{--bg:${t.background};--surf:${t.surface};--ac:${ac};--tp:${t.textPrimary};--ts:${t.textSecondary};--tm:${t.textMuted};--bdr:${t.border};}html,body{width:100%;height:100%;overflow:hidden;background:#04040E;font-family:${fontFamily};color:var(--tp);-webkit-font-smoothing:antialiased;}#app{display:flex;flex-direction:column;height:100vh;}#topbar{flex-shrink:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;background:rgba(5,5,20,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(16px);z-index:30;}#tb-title{flex:1;min-width:0;}#tb-title h1{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tp);}#tb-title p{font-size:10px;color:var(--tm);margin-top:1px;}.tb-btn{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:var(--ts);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;}.tb-btn:hover{background:rgba(255,255,255,0.1);color:var(--tp);}.tb-btn.on{background:${ac}20;border-color:${ac}55;color:${ac};}.tb-sep{width:1px;height:22px;background:rgba(255,255,255,0.09);margin:0 2px;}#prog-track{flex-shrink:0;height:3px;background:rgba(255,255,255,0.06);}#prog-fill{height:100%;background:${ac};border-radius:0 2px 2px 0;width:0;transition:width 0.35s;}#main{flex:1;display:flex;overflow:hidden;min-height:0;}#sidebar{flex-shrink:0;width:140px;overflow-y:auto;overflow-x:hidden;background:rgba(5,5,20,0.9);border-right:1px solid rgba(255,255,255,0.07);padding:10px 8px;display:flex;flex-direction:column;gap:6px;transition:width 0.25s,padding 0.25s,opacity 0.25s;}#sidebar.closed{width:0;padding:0;opacity:0;pointer-events:none;}.thumb-wrap{flex-shrink:0;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color 0.18s,transform 0.15s;}.thumb-wrap:hover{transform:scale(1.025);border-color:rgba(255,255,255,0.25);}.thumb-wrap.active{border-color:${ac};box-shadow:0 0 12px ${ac}50;}.thumb-clip{width:124px;height:70px;overflow:hidden;position:relative;}.thumb-slide{width:1280px;height:720px;transform:scale(0.097);transform-origin:top left;pointer-events:none;}.thumb-label{font-size:9px;font-weight:600;color:rgba(255,255,255,0.45);text-align:center;padding:2px 0 3px;background:rgba(0,0,0,0.5);}#stage-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:#04040E;overflow:hidden;min-width:0;position:relative;padding:16px;}#stage{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.07);}#track{display:flex;position:absolute;top:0;left:0;height:720px;transition:transform 0.38s cubic-bezier(0.4,0,0.2,1);will-change:transform;}.slide-frame{flex-shrink:0;width:1280px;height:720px;position:relative;overflow:hidden;font-family:${fontFamily};}.nav-btn{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.85);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;opacity:0;pointer-events:none;transition:opacity 0.2s,background 0.18s;}#stage-wrap:hover .nav-btn{opacity:1;pointer-events:all;}#stage-wrap .nav-btn:hover{background:${ac};border-color:${ac};}.nav-btn:disabled{opacity:0!important;pointer-events:none!important;}#nav-prev{left:10px;}#nav-next{right:10px;}#notes-panel{flex-shrink:0;overflow:hidden;background:rgba(8,8,24,0.97);border-top:1px solid rgba(255,255,255,0.07);height:0;transition:height 0.26s;}#notes-panel.open{height:108px;}#notes-inner{padding:10px 16px;height:100%;display:flex;flex-direction:column;gap:5px;}#notes-lbl{font-size:10px;font-weight:700;color:${ac};letter-spacing:1.2px;text-transform:uppercase;}#notes-body{font-size:12px;color:var(--ts);line-height:1.6;flex:1;overflow-y:auto;}#botbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;height:46px;padding:0 12px;background:rgba(5,5,20,0.97);border-top:1px solid rgba(255,255,255,0.07);}.bot-nav{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:var(--ts);font-size:12px;font-weight:700;cursor:pointer;}.bot-nav:hover:not(:disabled){background:rgba(255,255,255,0.1);color:var(--tp);}.bot-nav:disabled{opacity:0.25;cursor:default;}#dot-strip{display:flex;align-items:center;gap:4px;}.dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.18);cursor:pointer;transition:width 0.22s,background 0.22s;}.dot.on{width:18px;background:${ac};}#counter{font-size:12px;font-weight:800;color:${ac};background:${ac}1A;border:1px solid ${ac}35;border-radius:7px;padding:4px 12px;min-width:64px;text-align:center;}#layout-tag{font-size:10px;color:var(--tm);background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:3px 9px;}</style>
</head><body><div id="app"><div id="topbar"><button class="tb-btn on" id="btn-sidebar">&#9776;&nbsp;Slides</button><div class="tb-sep"></div><div id="tb-title"><h1>${presentation.title}</h1><p>${TOTAL} slides &middot; ${presentation.theme} theme</p></div><div class="tb-sep"></div><button class="tb-btn" id="btn-notes">&#128196;&nbsp;Notes</button><button class="tb-btn" onclick="window.print()">&#128438;&nbsp;Print</button><button class="tb-btn" id="btn-fs">&#x26F6;&nbsp;Full</button></div><div id="prog-track"><div id="prog-fill"></div></div><div id="main"><div id="sidebar">${thumbsHTML}</div><div id="stage-wrap"><button class="nav-btn" id="nav-prev" onclick="prev()" disabled>&#8249;</button><div id="stage"><div id="track">${framesHTML}</div></div><button class="nav-btn" id="nav-next" onclick="next()">&#8250;</button></div></div><div id="notes-panel"><div id="notes-inner"><div id="notes-lbl">&#127908;&nbsp;Speaker Notes</div><div id="notes-body">No notes.</div></div></div><div id="botbar"><button class="bot-nav" id="bb-prev" onclick="prev()" disabled>&#8592; Prev</button><div id="dot-strip"></div><div id="layout-tag"></div><div id="counter">1 / ${TOTAL}</div><button class="bot-nav" id="bb-next" onclick="next()">Next &#8594;</button></div></div>
<script>(function(){var META=${slideMeta},TOTAL=${TOTAL},current=0,sidebarOpen=true,notesOpen=false,SCALE=1;var stageWrap=document.getElementById('stage-wrap'),stage=document.getElementById('stage'),track=document.getElementById('track'),progFill=document.getElementById('prog-fill'),counter=document.getElementById('counter'),dotStrip=document.getElementById('dot-strip'),notesPan=document.getElementById('notes-panel'),notesBody=document.getElementById('notes-body'),layoutTag=document.getElementById('layout-tag'),sidebar=document.getElementById('sidebar'),thumbs=document.querySelectorAll('.thumb-wrap'),btnSidebar=document.getElementById('btn-sidebar'),btnNotes=document.getElementById('btn-notes'),bbPrev=document.getElementById('bb-prev'),bbNext=document.getElementById('bb-next'),navPrev=document.getElementById('nav-prev'),navNext=document.getElementById('nav-next');var LL={title:'Title',agenda:'Agenda',section:'Section',content:'Content',bullets:'Key Points',stats:'Statistics',quote:'Pull Quote',chart_ref:'Chart',predictions:'Outlook',references:'References',closing:'Closing'};function scale(){var aw=stageWrap.clientWidth-32,ah=stageWrap.clientHeight-32;SCALE=Math.min(aw/1280,ah/720);var sw=Math.floor(1280*SCALE),sh=Math.floor(720*SCALE);stage.style.width=sw+'px';stage.style.height=sh+'px';track.style.width=(1280*TOTAL)+'px';track.style.height='720px';track.style.transformOrigin='top left';var p=track.style.transition;track.style.transition='none';applyT();requestAnimationFrame(function(){requestAnimationFrame(function(){track.style.transition=p;});});}function applyT(){track.style.transform='scale('+SCALE+') translateX('+(-current*1280)+'px)';}function goTo(idx){current=Math.max(0,Math.min(idx,TOTAL-1));track.style.transition='transform 0.38s cubic-bezier(0.4,0,0.2,1)';applyT();refresh();}function next(){goTo(current+1);}function prev(){goTo(current-1);}function refresh(){progFill.style.width=((current+1)/TOTAL*100)+'%';counter.textContent=(current+1)+' / '+TOTAL;var lay=(META[current]||{}).layout||'';layoutTag.textContent=LL[lay]||lay;dotStrip.innerHTML='';if(TOTAL<=15){for(var i=0;i<TOTAL;i++){var d=document.createElement('div');d.className='dot'+(i===current?' on':'');(function(ii){d.onclick=function(){goTo(ii);};})(i);dotStrip.appendChild(d);}}notesBody.textContent=(META[current]||{}).notes||'No notes.';thumbs.forEach(function(th,i){th.classList.toggle('active',i===current);if(i===current)th.scrollIntoView({block:'nearest',behavior:'smooth'});});bbPrev.disabled=current===0;bbNext.disabled=current===TOTAL-1;navPrev.disabled=current===0;navNext.disabled=current===TOTAL-1;}document.getElementById('btn-sidebar').onclick=function(){sidebarOpen=!sidebarOpen;sidebar.classList.toggle('closed',!sidebarOpen);document.getElementById('btn-sidebar').classList.toggle('on',sidebarOpen);setTimeout(scale,270);};document.getElementById('btn-notes').onclick=function(){notesOpen=!notesOpen;notesPan.classList.toggle('open',notesOpen);document.getElementById('btn-notes').classList.toggle('on',notesOpen);setTimeout(scale,290);};document.getElementById('btn-fs').onclick=function(){if(!document.fullscreenElement)(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen).call(document.documentElement);else(document.exitFullscreen||document.webkitExitFullscreen).call(document);};document.addEventListener('fullscreenchange',function(){setTimeout(scale,100);});document.addEventListener('webkitfullscreenchange',function(){setTimeout(scale,100);});document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){e.preventDefault();next();}else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();prev();}else if(e.key==='Home'){e.preventDefault();goTo(0);}else if(e.key==='End'){e.preventDefault();goTo(TOTAL-1);}});var tx0=0;stage.addEventListener('touchstart',function(e){tx0=e.touches[0].clientX;},{passive:true});stage.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-tx0;if(Math.abs(dx)>45){dx<0?next():prev();}});window.addEventListener('resize',scale);scale();refresh();window.goTo=goTo;window.next=next;window.prev=prev;})();</script></body></html>`;
}

export async function exportAsHTMLSlides(presentation: GeneratedPresentation): Promise<void> {
  const html     = buildSlideHTML(presentation);
  const fileName = `${safeFileName(presentation.title)}_slides.html`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, html, { encoding: EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'text/html', dialogTitle: `Share: ${presentation.title}` });
  }
}