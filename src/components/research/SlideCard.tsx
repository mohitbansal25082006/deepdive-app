// src/components/research/SlideCard.tsx
// Part 41.9 — Two fixes:
//   Fix 1: noTruncate now defaults to TRUE so the viewer never clips content.
//           Only the thumbnail strip passes noTruncate={false} explicitly.
//   Fix 2: Overlay blocks now support a zIndex field for stacking order.
//           OverlayBlockCard in the editor exposes Move Up / Move Down controls.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml }   from 'react-native-svg';
import type { PresentationSlide, PresentationThemeTokens } from '../../types';
import type { AdditionalBlock, SlideEditorData, FieldFormatting, EditableFieldKey } from '../../types/editor';

// ─── The managed chart placeholder block ID ───────────────────────────────────
const CHART_REF_PLACEHOLDER_ID = '__chart_ref_placeholder__';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideCardProps {
  slide:       PresentationSlide;
  tokens:      PresentationThemeTokens;
  scale?:      number;
  showNotes?:  boolean;
  fontFamily?: string;
  /**
   * FIX 1: Default changed to TRUE.
   * Pass noTruncate={false} only for thumbnails where space is very limited.
   * The editor canvas passes noTruncate (= true) — no change needed there.
   * The preview panel and all viewers get the default = true = no clipping.
   */
  noTruncate?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLIDE_W = 320;
const SLIDE_H = 180;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveFontFamily(id: string | undefined): string | undefined {
  if (!id || id === 'system') return undefined;
  switch (id) {
    case 'serif':     return Platform.OS === 'android' ? 'notoserif' : 'Georgia';
    case 'mono':      return Platform.OS === 'android' ? 'monospace'  : 'Courier New';
    case 'rounded':   return Platform.OS === 'android' ? 'sans-serif-medium' : 'Trebuchet MS';
    case 'condensed': return Platform.OS === 'android' ? 'sans-serif-condensed' : undefined;
    default:          return undefined;
  }
}

function getSpacingMultiplier(slide: PresentationSlide): number {
  const ed = (slide as any).editorData as SlideEditorData | undefined;
  if (!ed?.spacing) return 1.0;
  switch (ed.spacing) {
    case 'compact':  return 0.75;
    case 'spacious': return 1.35;
    default:         return 1.0;
  }
}

function getBgOverride(slide: PresentationSlide): string | undefined {
  return ((slide as any).editorData as SlideEditorData | undefined)?.backgroundColor;
}

function getAdditionalBlocks(slide: PresentationSlide): AdditionalBlock[] {
  return ((slide as any).editorData as SlideEditorData | undefined)?.additionalBlocks ?? [];
}

function accent(slide: PresentationSlide, tokens: PresentationThemeTokens): string {
  return slide.accentColor ?? tokens.primary;
}

/**
 * FIX 1: trunc() only truncates when noTruncate === false.
 * Since noTruncate defaults to true, viewers see full text by default.
 */
function trunc(s: string | undefined, maxLen: number, noTruncate: boolean): string {
  if (!s) return '';
  if (noTruncate) return s;
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

function nl(n: number, noTruncate: boolean): number | undefined {
  return noTruncate ? undefined : n;
}

// ─── Formatting accessors ─────────────────────────────────────────────────────

function getEditorData(slide: PresentationSlide): SlideEditorData | undefined {
  return (slide as any).editorData as SlideEditorData | undefined;
}

function getGFS(slide: PresentationSlide): number {
  return getEditorData(slide)?.globalFontScale ?? 1.0;
}

function getGTC(slide: PresentationSlide): string | undefined {
  return getEditorData(slide)?.globalTextColor;
}

function getFmt(slide: PresentationSlide, field: EditableFieldKey): FieldFormatting {
  return getEditorData(slide)?.fieldFormats?.[field] ?? {};
}

function fcolor(base: string, fmt: FieldFormatting, gtc?: string): string {
  return fmt.color ?? gtc ?? base;
}

function fscale(fmt: FieldFormatting, gfs: number): number {
  return fmt.fontScale ?? gfs;
}

function fweight(fmt: FieldFormatting, defaultWeight: string = '400'): string {
  if (fmt.bold !== undefined) return fmt.bold ? '700' : '400';
  return defaultWeight;
}

function fstyle(fmt: FieldFormatting): 'italic' | 'normal' {
  return fmt.italic ? 'italic' : 'normal';
}

// ─── Layout context ───────────────────────────────────────────────────────────

interface LayoutCtx {
  slide: PresentationSlide;
  tokens: PresentationThemeTokens;
  sc: number;
  sm: number;
  ff: string | undefined;
  nt: boolean;
  gfs: number;
  gtc: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE BLOCK OVERLAY RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function InlineBlockOverlay({
  block,
  sc,
  accentColor,
  tokens,
  ff,
}: {
  block:       AdditionalBlock;
  sc:          number;
  accentColor: string;
  tokens:      PresentationThemeTokens;
  ff:          string | undefined;
}) {
  const pos = block.position;
  if (!pos || pos.type !== 'overlay') return null;

  const xFrac = pos.xFrac ?? 0.05;
  const yFrac = pos.yFrac ?? 0.5;
  const wFrac = pos.wFrac ?? 0.9;
  const hFrac = pos.hFrac;

  const left  = SLIDE_W * xFrac * sc;
  const top   = SLIDE_H * yFrac * sc;
  const width = SLIDE_W * wFrac * sc;

  const col = (block as any).color ?? accentColor;

  // FIX 2: Read zIndex from block for stacking order control
  const zIndex = (block as any).zIndex ?? 1;

  switch (block.type) {

    case 'image': {
      const imageUri = block.uri || (block as any).onlineUrl || null;
      if (!imageUri) return null;
      const ar   = block.aspectRatio ?? 16 / 9;
      const imgH = hFrac !== undefined ? SLIDE_H * hFrac * sc : (width / ar);
      return (
        <View style={{ position: 'absolute', left, top, width, height: imgH, borderRadius: 3 * sc, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', zIndex }}>
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {block.caption ? (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 2 * sc, paddingHorizontal: 4 * sc }}>
              <Text style={{ color: '#FFF', fontSize: 4 * sc, fontFamily: ff }} numberOfLines={1}>{block.caption}</Text>
            </View>
          ) : null}
        </View>
      );
    }

    case 'stat': {
      const defaultCardH = 38 * sc;
      const cardH = hFrac !== undefined ? SLIDE_H * hFrac * sc : defaultCardH;
      return (
        <View style={{ position: 'absolute', left, top, width, height: cardH, backgroundColor: tokens.surface, borderRadius: 4 * sc, borderTopWidth: 2.5 * sc, borderTopColor: col, borderWidth: 0.5, borderColor: `${col}40`, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 * sc, zIndex }}>
          <Text
            style={{ color: col, fontSize: 14 * sc, fontWeight: '900', lineHeight: 16 * sc, fontFamily: ff }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {block.value}
          </Text>
          <Text style={{ color: tokens.textMuted, fontSize: 4.5 * sc, marginTop: 1 * sc, textAlign: 'center', fontFamily: ff }} numberOfLines={2}>{block.label}</Text>
          {block.unit ? <Text style={{ color: `${col}AA`, fontSize: 3.5 * sc, fontFamily: ff }}>{block.unit}</Text> : null}
        </View>
      );
    }

    case 'chart': {
      const isPH  = block.id === CHART_REF_PLACEHOLDER_ID;
      const cd    = block.chart;
      const chartH = hFrac !== undefined ? SLIDE_H * hFrac * sc : 50 * sc;
      const CCOLS = [accentColor, '#43E97B', '#FFA726', '#FF6584', '#29B6F6', '#AB47BC'];

      if (isPH) {
        return (
          <View style={{ position: 'absolute', left, top, width, height: chartH, backgroundColor: tokens.surface, borderRadius: 4 * sc, borderWidth: 0.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', zIndex }}>
            <Ionicons name="bar-chart-outline" size={18 * sc} color={tokens.textMuted} />
            <Text style={{ color: tokens.textMuted, fontSize: 4 * sc, marginTop: 4 * sc, textAlign: 'center' }}>{'Chart\nin app'}</Text>
          </View>
        );
      }

      const hasBars = cd.datasets?.[0]?.data && cd.labels;
      const data    = hasBars ? cd.datasets![0].data : [];
      const maxV    = data.length > 0 ? Math.max(...data, 1) : 1;
      const labels  = cd.labels ?? [];
      return (
        <View style={{ position: 'absolute', left, top, width, height: chartH, backgroundColor: `${tokens.surface}EE`, borderRadius: 4 * sc, borderWidth: 0.5, borderColor: `${accentColor}30`, padding: 3 * sc, zIndex }}>
          <Text style={{ color: tokens.textSecondary, fontSize: 4 * sc, fontWeight: '700', marginBottom: 2 * sc, fontFamily: ff }} numberOfLines={1}>{cd.title}</Text>
          {hasBars && (
            <View style={{ flexDirection: 'row', gap: 1.5 * sc, alignItems: 'flex-end', flex: 1 }}>
              {data.slice(0, 8).map((v: number, i: number) => {
                const pct = v / maxV;
                const bc  = CCOLS[i % CCOLS.length];
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 1 * sc }}>
                    <View style={{ width: '100%', height: Math.max((chartH - 16 * sc) * pct, 2 * sc), backgroundColor: `${bc}BB`, borderRadius: 1.5 * sc, borderTopWidth: 1 * sc, borderTopColor: bc }} />
                    <Text style={{ color: tokens.textMuted, fontSize: 3 * sc, textAlign: 'center', fontFamily: ff }} numberOfLines={1}>{labels[i] ?? ''}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {!hasBars && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="bar-chart-outline" size={10 * sc} color={tokens.textMuted} /></View>}
        </View>
      );
    }

    case 'quote_block': {
      return (
        <View style={{ position: 'absolute', left, top, width, backgroundColor: `${accentColor}12`, borderRadius: 3 * sc, borderLeftWidth: 2.5 * sc, borderLeftColor: accentColor, paddingHorizontal: 5 * sc, paddingVertical: 4 * sc, borderWidth: 0.5, borderColor: `${accentColor}25`, zIndex }}>
          <Text style={{ color: '#FFF', fontSize: 14 * sc, fontWeight: '900', opacity: 0.25, lineHeight: 10 * sc, marginBottom: -4 * sc }}>{'\u201C'}</Text>
          <Text style={{ color: tokens.textPrimary, fontSize: 5 * sc, lineHeight: 7.5 * sc, fontStyle: 'italic', fontFamily: ff }} numberOfLines={3}>{block.text}</Text>
          {block.attribution ? <Text style={{ color: accentColor, fontSize: 4 * sc, marginTop: 2 * sc, fontWeight: '600', fontFamily: ff }} numberOfLines={1}>{`— ${block.attribution}`}</Text> : null}
        </View>
      );
    }

    case 'divider': {
      const dc = block.color ?? accentColor;
      return (
        <View style={{ position: 'absolute', left, top, width, height: 4 * sc, justifyContent: 'center', zIndex }}>
          {block.style === 'solid'   && <View style={{ height: 1.5 * sc, backgroundColor: dc, borderRadius: 1 }} />}
          {block.style === 'dashed'  && <View style={{ height: 0, borderTopWidth: 1.5 * sc, borderTopColor: dc, borderStyle: 'dashed' }} />}
          {block.style === 'diamond' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 * sc }}>{[0,1,2,3,4,5,6,7].map(i => <View key={i} style={{ width: 3 * sc, height: 3 * sc, backgroundColor: i % 3 === 1 ? dc : `${dc}55`, transform: [{ rotate: '45deg' }] }} />)}</View>}
        </View>
      );
    }

    case 'spacer':
      return null;

    case 'icon': {
      const sz      = (block.size ?? 40) * sc * 0.5;
      const ic      = block.color ?? accentColor;
      const bSz     = sz + 8 * sc;
      const svgData = (block as any).svgData as string | undefined;
      return (
        <View style={{ position: 'absolute', left, top, width: bSz, height: bSz, borderRadius: bSz / 2, backgroundColor: `${ic}18`, borderWidth: 0.5, borderColor: `${ic}35`, alignItems: 'center', justifyContent: 'center', zIndex }}>
          {svgData ? (
            <SvgXml xml={svgData} width={sz} height={sz} color={ic} />
          ) : (
            <Ionicons name={(block.iconName as any) || 'shapes-outline'} size={sz} color={ic} />
          )}
          {block.label ? (
            <Text style={{ position: 'absolute', bottom: -(6 * sc), left: -width, right: -width, textAlign: 'center', color: ic, fontSize: 4 * sc, fontWeight: '600', fontFamily: ff }} numberOfLines={1}>{block.label}</Text>
          ) : null}
        </View>
      );
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function TitleLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;

  const titleFmt    = getFmt(slide, 'title');
  const subtitleFmt = getFmt(slide, 'subtitle');
  const badgeFmt    = getFmt(slide, 'badgeText');

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', width: SLIDE_W * 0.5 * sc, height: SLIDE_W * 0.5 * sc, borderRadius: SLIDE_W * 0.25 * sc, right: -SLIDE_W * 0.06 * sc, top: -SLIDE_W * 0.15 * sc, backgroundColor: ac, opacity: 0.12 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 * sc, backgroundColor: ac }} />
      {slide.badgeText && (
        <View style={{ position: 'absolute', top: 10 * sc * p, left: 12 * sc * p, backgroundColor: `${ac}22`, borderRadius: 20, borderWidth: 0.5, borderColor: `${ac}55`, paddingHorizontal: 6 * sc, paddingVertical: 2 * sc }}>
          <Text style={{ color: fcolor(ac, badgeFmt), fontSize: 5 * sc * fscale(badgeFmt, gfs), fontWeight: fweight(badgeFmt, '700') as any, letterSpacing: 0.5, fontFamily: ff }}>{trunc(slide.badgeText?.toUpperCase(), 30, nt)}</Text>
        </View>
      )}
      <View style={{ position: 'absolute', top: 30 * sc * p, left: 12 * sc * p, right: SLIDE_W * 0.22 }}>
        <Text numberOfLines={nl(3, nt)} style={{ color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 13 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '900') as any, fontStyle: fstyle(titleFmt), lineHeight: 15 * sc * fscale(titleFmt, gfs), fontFamily: ff }}>{trunc(slide.title, 70, nt)}</Text>
      </View>
      <View style={{ position: 'absolute', top: 108 * sc * p, left: 12 * sc * p, width: 28 * sc, height: 2 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {slide.subtitle && (
        <View style={{ position: 'absolute', top: 115 * sc * p, left: 12 * sc * p, right: SLIDE_W * 0.22 }}>
          <Text numberOfLines={nl(2, nt)} style={{ color: fcolor(tokens.textSecondary, subtitleFmt, gtc), fontSize: 6 * sc * fscale(subtitleFmt, gfs), fontWeight: fweight(subtitleFmt) as any, fontStyle: fstyle(subtitleFmt), fontFamily: ff }}>{trunc(slide.subtitle, 60, nt)}</Text>
        </View>
      )}
      <Text style={{ position: 'absolute', bottom: 6 * sc, right: 10 * sc, color: tokens.textMuted, fontSize: 5 * sc, fontWeight: '700' }}>DeepDive AI</Text>
    </View>
  );
}

function SectionLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const p = sm;

  const titleFmt = getFmt(slide, 'title');
  const tagFmt   = getFmt(slide, 'sectionTag');

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: SLIDE_W * 0.15, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      {slide.sectionTag && (
        <Text style={{ position: 'absolute', top: 44 * sc * p, left: 16 * sc * p, color: fcolor('rgba(255,255,255,0.75)', tagFmt, gtc), fontSize: 5 * sc * fscale(tagFmt, gfs), fontWeight: fweight(tagFmt, '700') as any, letterSpacing: 1.5, fontFamily: ff }}>{trunc(slide.sectionTag.toUpperCase(), 28, nt)}</Text>
      )}
      <View style={{ position: 'absolute', top: 56 * sc * p, left: 16 * sc * p, right: SLIDE_W * 0.18 }}>
        <Text numberOfLines={nl(3, nt)} style={{ color: fcolor('#FFFFFF', titleFmt, gtc), fontSize: 17 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '900') as any, fontStyle: fstyle(titleFmt), lineHeight: 19 * sc * fscale(titleFmt, gfs), fontFamily: ff }}>{trunc(slide.title, 50, nt)}</Text>
      </View>
      <Text style={{ position: 'absolute', bottom: 8 * sc, right: SLIDE_W * 0.18 + 8 * sc, color: 'rgba(255,255,255,0.55)', fontSize: 5 * sc }}>{slide.slideNumber}</Text>
    </View>
  );
}

function AgendaLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;

  const titleFmt = getFmt(slide, 'title');

  const items = (slide.bullets ?? []).slice(0, nt ? undefined : 6);
  const half  = Math.ceil(items.length / 2);
  const col1  = items.slice(0, half);
  const col2  = items.slice(half);
  const rowH  = nt ? 24 * sc * p : 20 * sc * p;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 8 * sc, left: 12 * sc * p, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontFamily: ff }}>{trunc(slide.title, 30, nt)}</Text>
      <View style={{ position: 'absolute', top: 30 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {col1.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * rowH / sc) * sc, left: 10 * sc * p, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={nl(1, nt)} style={{ color: fcolor(tokens.textSecondary, {}, gtc), fontSize: 5.5 * sc * gfs, marginLeft: 4 * sc, flex: 1, fontFamily: ff }}>{trunc(item, 22, nt)}</Text>
        </View>
      ))}
      {col2.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * rowH / sc) * sc, left: SLIDE_W * 0.5, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{half + i + 1}</Text>
          </View>
          <Text numberOfLines={nl(1, nt)} style={{ color: fcolor(tokens.textSecondary, {}, gtc), fontSize: 5.5 * sc * gfs, marginLeft: 4 * sc, flex: 1, fontFamily: ff }}>{trunc(item, 22, nt)}</Text>
        </View>
      ))}
    </View>
  );
}

function ContentLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;

  const titleFmt = getFmt(slide, 'title');
  const bodyFmt  = getFmt(slide, 'body');

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 10 * sc * p, left: 10 * sc * p, right: 10 * sc, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9.5 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontStyle: fstyle(titleFmt), fontFamily: ff }}>{trunc(slide.title, 50, nt)}</Text>
      <View style={{ position: 'absolute', top: 36 * sc, left: 10 * sc * p, right: 10 * sc, height: 1 * sc, backgroundColor: tokens.border }} />
      {slide.body && (
        <Text numberOfLines={nl(6, nt)} style={{ position: 'absolute', top: 42 * sc, left: 10 * sc * p, right: 10 * sc, color: fcolor(tokens.textSecondary, bodyFmt, gtc), fontSize: 5.5 * sc * fscale(bodyFmt, gfs), fontWeight: fweight(bodyFmt) as any, fontStyle: fstyle(bodyFmt), lineHeight: 8.5 * sc * fscale(bodyFmt, gfs), fontFamily: ff }}>{trunc(slide.body, 280, nt)}</Text>
      )}
    </View>
  );
}

function BulletsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac      = accent(slide, tokens);
  const p       = sm;

  const titleFmt = getFmt(slide, 'title');

  const bullets = (slide.bullets ?? []).slice(0, nt ? undefined : 5);
  const rowH    = nt ? 30 * sc * p : 26 * sc * p;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontStyle: fstyle(titleFmt), fontFamily: ff }}>{trunc(slide.title, 32, nt)}</Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {bullets.map((bullet, i) => (
        <View key={i} style={{ position: 'absolute', top: 33 * sc + i * rowH, left: 10 * sc * p, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 7 * sc, height: 7 * sc, borderRadius: 4 * sc, backgroundColor: ac, marginTop: 1 * sc, flexShrink: 0 }} />
          <Text numberOfLines={nl(2, nt)} style={{ color: fcolor(tokens.textSecondary, {}, gtc), fontSize: 5.5 * sc * gfs, marginLeft: 5 * sc, flex: 1, lineHeight: 8 * sc * gfs, fontFamily: ff }}>{trunc(bullet, 65, nt)}</Text>
        </View>
      ))}
    </View>
  );
}

function StatsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac    = accent(slide, tokens);
  const p     = sm;

  const titleFmt = getFmt(slide, 'title');

  const stats = (slide.stats ?? []).slice(0, 4);
  const cardW = stats.length === 4 ? 68 * sc : 80 * sc;
  const cardH = 88 * sc * p;
  const totalW = stats.length * cardW + (stats.length - 1) * 6 * sc;
  const startX = (SLIDE_W - totalW / sc) / 2 * sc;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Text numberOfLines={1} style={{ position: 'absolute', top: 12 * sc * p, left: 0, right: 0, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9.5 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, textAlign: 'center', fontFamily: ff }}>{trunc(slide.title, 35, nt)}</Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: SLIDE_W / 2 - 20 * sc, width: 40 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {stats.map((stat, i) => {
        const cardColor = stat.color ?? ac;
        return (
          <View key={i} style={{ position: 'absolute', left: startX + i * (cardW + 6 * sc), top: 38 * sc, width: cardW, height: cardH, backgroundColor: tokens.surface, borderRadius: 5 * sc, borderTopWidth: 2.5 * sc, borderTopColor: cardColor }}>
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.45}
              style={{
                color: cardColor,
                fontSize: 14 * sc * gfs,
                fontWeight: '900',
                textAlign: 'center',
                marginTop: 10 * sc,
                paddingHorizontal: 3 * sc,
                fontFamily: ff,
                lineHeight: 15 * sc * gfs,
              }}
            >
              {trunc(stat.value, 20, nt)}
            </Text>
            <Text
              numberOfLines={nt ? undefined : 2}
              style={{
                color: fcolor(tokens.textMuted, {}, gtc),
                fontSize: 4.5 * sc * gfs,
                textAlign: 'center',
                marginTop: 4 * sc,
                paddingHorizontal: 4 * sc,
                lineHeight: 6.5 * sc * gfs,
                fontFamily: ff,
              }}
            >
              {trunc(stat.label, 28, nt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function QuoteLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const p = sm;

  const quoteFmt  = getFmt(slide, 'quote');
  const attribFmt = getFmt(slide, 'quoteAttribution');

  return (
    <View style={StyleSheet.absoluteFill}>
      <Text style={{ position: 'absolute', top: -4 * sc, left: 6 * sc * p, color: 'rgba(255,255,255,0.18)', fontSize: 60 * sc, fontWeight: '900' }}>{'\u201C'}</Text>
      <View style={{ position: 'absolute', top: 25 * sc * p, left: 14 * sc * p, right: 14 * sc * p, bottom: 30 * sc, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={nl(5, nt)} style={{ color: fcolor('#FFFFFF', quoteFmt, gtc), fontSize: 7.5 * sc * fscale(quoteFmt, gfs), fontWeight: fweight(quoteFmt, '700') as any, fontStyle: quoteFmt.italic !== undefined ? fstyle(quoteFmt) : 'italic', textAlign: 'center', lineHeight: 11 * sc * fscale(quoteFmt, gfs), fontFamily: ff }}>{trunc(slide.quote, 180, nt)}</Text>
      </View>
      {slide.quoteAttribution && (
        <Text numberOfLines={1} style={{ position: 'absolute', bottom: 10 * sc, left: 0, right: 0, color: fcolor('rgba(255,255,255,0.65)', attribFmt, gtc), fontSize: 5 * sc * fscale(attribFmt, gfs), textAlign: 'center', fontStyle: 'italic', fontFamily: ff }}>{`— ${trunc(slide.quoteAttribution, 50, nt)}`}</Text>
      )}
    </View>
  );
}

function ChartRefLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;

  const titleFmt = getFmt(slide, 'title');
  const bodyFmt  = getFmt(slide, 'body');

  const allBlocks    = getAdditionalBlocks(slide);
  const hasManagedPH = allBlocks.some(
    b => b.id === CHART_REF_PLACEHOLDER_ID && b.position?.type === 'overlay'
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 10 * sc * p, left: 10 * sc * p, right: 10 * sc, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontFamily: ff }}>{trunc(slide.title, 50, nt)}</Text>

      {!hasManagedPH && (
        <View style={{ position: 'absolute', top: 34 * sc, left: 10 * sc * p, width: 130 * sc, height: 110 * sc, backgroundColor: tokens.surface, borderRadius: 4 * sc, borderWidth: 0.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bar-chart-outline" size={18 * sc} color={tokens.textMuted} />
          <Text style={{ color: tokens.textMuted, fontSize: 4 * sc, marginTop: 4 * sc, textAlign: 'center' }}>{'Chart\nin app'}</Text>
        </View>
      )}

      {slide.body && (
        <Text
          numberOfLines={nl(7, nt)}
          style={{
            position: 'absolute',
            top: 34 * sc,
            left:  hasManagedPH ? 10 * sc * p : 148 * sc,
            right: 8 * sc,
            color: fcolor(tokens.textSecondary, bodyFmt, gtc),
            fontSize: 5 * sc * fscale(bodyFmt, gfs),
            fontWeight: fweight(bodyFmt) as any,
            fontStyle: fstyle(bodyFmt),
            lineHeight: 7.5 * sc * fscale(bodyFmt, gfs),
            fontFamily: ff,
          }}
        >
          {trunc(slide.body, 200, nt)}
        </Text>
      )}
    </View>
  );
}

function PredictionsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac    = accent(slide, tokens);
  const p     = sm;

  const titleFmt = getFmt(slide, 'title');

  const preds = (slide.bullets ?? []).slice(0, nt ? undefined : 5);
  const rowH  = nt ? 32 * sc * p : 27 * sc * p;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontFamily: ff }}>{trunc(slide.title, 32, nt)}</Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {preds.map((pred, i) => (
        <View key={i} style={{ position: 'absolute', top: 32 * sc + i * rowH, left: 10 * sc * p, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          {i < preds.length - 1 && (
            <View style={{ position: 'absolute', left: 5 * sc, top: 12 * sc, width: 1 * sc, height: 16 * sc, backgroundColor: tokens.border }} />
          )}
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={nl(2, nt)} style={{ color: fcolor(tokens.textSecondary, {}, gtc), fontSize: 5 * sc * gfs, marginLeft: 5 * sc, flex: 1, lineHeight: 7.5 * sc * gfs, fontFamily: ff }}>{trunc(pred, 65, nt)}</Text>
        </View>
      ))}
    </View>
  );
}

function ReferencesLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac   = accent(slide, tokens);
  const p    = sm;

  const titleFmt = getFmt(slide, 'title');

  const refs = (slide.bullets ?? []).slice(0, nt ? undefined : 6);
  const rowH = nt ? 26 * sc * p : 22 * sc * p;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 9 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '800') as any, fontFamily: ff }}>{trunc(slide.title, 30, nt)}</Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {refs.map((ref, i) => (
        <View key={i} style={{ position: 'absolute', top: 32 * sc + i * rowH, left: 10 * sc * p, right: 8 * sc, flexDirection: 'row' }}>
          <Text style={{ color: ac, fontSize: 5 * sc, fontWeight: '700', marginRight: 3 * sc, flexShrink: 0 }}>[{i + 1}]</Text>
          <Text numberOfLines={nl(2, nt)} style={{ color: fcolor(tokens.textSecondary, {}, gtc), fontSize: 5 * sc * gfs, flex: 1, lineHeight: 7.5 * sc * gfs, fontFamily: ff }}>{trunc(ref, 70, nt)}</Text>
        </View>
      ))}
    </View>
  );
}

function ClosingLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt, gfs, gtc } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;

  const titleFmt    = getFmt(slide, 'title');
  const subtitleFmt = getFmt(slide, 'subtitle');

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', width: 110 * sc, height: 110 * sc, borderRadius: 55 * sc, borderWidth: 1, borderColor: `${ac}55`, top: SLIDE_H / 2 - 55 * sc, left: SLIDE_W / 2 - 55 * sc }} />
      <Text style={{ position: 'absolute', top: 40 * sc * p, left: 0, right: 0, color: ac, fontSize: 5.5 * sc, fontWeight: '700', letterSpacing: 2, textAlign: 'center' }}>DEEPDIVE AI</Text>
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 70 * sc * p, left: 16 * sc * p, right: 16 * sc * p, color: fcolor(tokens.textPrimary, titleFmt, gtc), fontSize: 18 * sc * fscale(titleFmt, gfs), fontWeight: fweight(titleFmt, '900') as any, fontStyle: fstyle(titleFmt), textAlign: 'center', lineHeight: 20 * sc * fscale(titleFmt, gfs), fontFamily: ff }}>{trunc(slide.title, 30, nt)}</Text>
      {slide.subtitle && (
        <Text numberOfLines={nl(1, nt)} style={{ position: 'absolute', top: 120 * sc * p, left: 16 * sc * p, right: 16 * sc * p, color: fcolor(tokens.textSecondary, subtitleFmt, gtc), fontSize: 6 * sc * fscale(subtitleFmt, gfs), fontWeight: fweight(subtitleFmt) as any, textAlign: 'center', fontFamily: ff }}>{trunc(slide.subtitle, 55, nt)}</Text>
      )}
      <View style={{ position: 'absolute', bottom: 18 * sc, left: SLIDE_W / 2 - 28 * sc, width: 56 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const SlideCard = memo(function SlideCard({
  slide,
  tokens,
  scale      = 1,
  showNotes  = false,
  fontFamily,
  noTruncate = true,   // FIX 1: DEFAULT IS NOW TRUE — viewers show full text
}: SlideCardProps) {
  const sc  = scale;
  const sm  = getSpacingMultiplier(slide);
  const ff  = resolveFontFamily(fontFamily);
  const nt  = noTruncate;
  const gfs = getGFS(slide);
  const gtc = getGTC(slide);

  const ctx: LayoutCtx = { slide, tokens, sc, sm, ff, nt, gfs, gtc };

  const bgOverride = getBgOverride(slide);
  const ac         = accent(slide, tokens);
  const isSection  = slide.layout === 'section';
  const isQuote    = slide.layout === 'quote';
  const bgColor    = bgOverride ?? (isSection || isQuote ? ac : tokens.background);

  const allBlocks     = getAdditionalBlocks(slide);
  // FIX 2: Sort overlay blocks by zIndex (ascending) before rendering
  // so higher zIndex blocks appear on top as expected
  const overlayBlocks = allBlocks
    .filter(b => b.position?.type === 'overlay')
    .sort((a, b) => ((a as any).zIndex ?? 1) - ((b as any).zIndex ?? 1));

  function renderLayout() {
    switch (slide.layout) {
      case 'title':       return <TitleLayout       ctx={ctx} />;
      case 'section':     return <SectionLayout     ctx={ctx} />;
      case 'agenda':      return <AgendaLayout      ctx={ctx} />;
      case 'content':     return <ContentLayout     ctx={ctx} />;
      case 'bullets':     return <BulletsLayout     ctx={ctx} />;
      case 'stats':       return <StatsLayout       ctx={ctx} />;
      case 'quote':       return <QuoteLayout       ctx={ctx} />;
      case 'chart_ref':   return <ChartRefLayout    ctx={ctx} />;
      case 'predictions': return <PredictionsLayout ctx={ctx} />;
      case 'references':  return <ReferencesLayout  ctx={ctx} />;
      case 'closing':     return <ClosingLayout     ctx={ctx} />;
      default:            return <ContentLayout     ctx={ctx} />;
    }
  }

  return (
    <View style={{ width: SLIDE_W * sc, height: SLIDE_H * sc }}>
      <View style={{
        width:           SLIDE_W * sc,
        height:          SLIDE_H * sc,
        overflow:        'hidden',
        borderRadius:    5 * sc,
        position:        'relative',
        backgroundColor: bgColor,
      }}>
        {renderLayout()}
        {overlayBlocks.map(block => (
          <InlineBlockOverlay
            key={block.id}
            block={block}
            sc={sc}
            accentColor={ac}
            tokens={tokens}
            ff={ff}
          />
        ))}
      </View>

      {showNotes && slide.speakerNotes && (
        <View style={{ backgroundColor: tokens.surface, borderRadius: 4, marginTop: 6, padding: 8 }}>
          <Text style={{ color: tokens.textMuted, fontSize: 9, fontWeight: '600', marginBottom: 2 }}>SPEAKER NOTES</Text>
          <Text style={{ color: tokens.textSecondary, fontSize: 10, lineHeight: 14, fontFamily: ff }}>{slide.speakerNotes}</Text>
        </View>
      )}
    </View>
  );
});