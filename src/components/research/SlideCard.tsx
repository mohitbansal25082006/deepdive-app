// src/components/research/SlideCard.tsx
// Part 28 — Fixed: background color, font family, spacing density, no-truncate
// ─────────────────────────────────────────────────────────────────────────────
//
// NEW PROPS added in Part 28:
//   fontFamily?   — deck-wide font override (system | serif | mono | rounded | condensed)
//   noTruncate?   — when true, removes numberOfLines limits (used in editor canvas preview)
//
// INTERNAL reads from (slide as any).editorData at runtime:
//   editorData.backgroundColor — overrides theme background for this slide
//   editorData.spacing         — 'compact' | 'default' | 'spacious' multiplier
//
// These changes are backward-compatible: all existing code that passes only
// {slide, tokens, scale?, showNotes?} continues to work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PresentationSlide, PresentationThemeTokens } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideCardProps {
  slide:        PresentationSlide;
  tokens:       PresentationThemeTokens;
  /** Scale factor — 1.0 means the card fills its container exactly */
  scale?:       number;
  /** Show speaker notes below the card */
  showNotes?:   boolean;
  /**
   * Deck-wide font family ID (from useSlideEditor state.fontFamily).
   * Maps to platform-appropriate font: 'serif' → Georgia/notoserif, etc.
   */
  fontFamily?:  string;
  /**
   * When true, removes all numberOfLines truncation.
   * Set to true in the editor canvas preview (scale ~1.0) so content shows in full.
   */
  noTruncate?:  boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLIDE_W = 320;
const SLIDE_H = 180;

/** Map font family IDs to platform-safe font names */
function resolveFontFamily(id: string | undefined): string | undefined {
  if (!id || id === 'system') return undefined;
  switch (id) {
    case 'serif':
      return Platform.OS === 'android' ? 'notoserif' : 'Georgia';
    case 'mono':
      return Platform.OS === 'android' ? 'monospace' : 'Courier New';
    case 'rounded':
      // Trebuchet MS on iOS, sans-serif-medium on Android
      return Platform.OS === 'android' ? 'sans-serif-medium' : 'Trebuchet MS';
    case 'condensed':
      return Platform.OS === 'android' ? 'sans-serif-condensed' : undefined;
    default:
      return undefined;
  }
}

// ─── Spacing multiplier from editorData ───────────────────────────────────────

function getSpacingMultiplier(slide: PresentationSlide): number {
  const ed = (slide as any).editorData;
  if (!ed?.spacing) return 1.0;
  switch (ed.spacing) {
    case 'compact':  return 0.75;
    case 'spacious': return 1.35;
    default:         return 1.0;
  }
}

// ─── Background override from editorData ─────────────────────────────────────

function getBgOverride(slide: PresentationSlide): string | undefined {
  return (slide as any).editorData?.backgroundColor;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accent(slide: PresentationSlide, tokens: PresentationThemeTokens): string {
  return slide.accentColor ?? tokens.primary;
}

function trunc(s: string | undefined, maxLen: number, noTruncate: boolean): string {
  if (!s) return '';
  if (noTruncate) return s;
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

function nl(n: number, noTruncate: boolean): number | undefined {
  return noTruncate ? undefined : n;
}

// ─── Shared context object passed down to every layout ────────────────────────

interface LayoutCtx {
  slide:       PresentationSlide;
  tokens:      PresentationThemeTokens;
  sc:          number;   // scale factor
  sm:          number;   // spacing multiplier
  ff:          string | undefined; // fontFamily
  nt:          boolean;  // noTruncate
}

// ─── Background Component ─────────────────────────────────────────────────────

function SlideBackground({ slide, tokens }: { slide: PresentationSlide; tokens: PresentationThemeTokens }) {
  const ac        = accent(slide, tokens);
  const bgOverride = getBgOverride(slide);
  const isSection  = slide.layout === 'section';
  const isQuote    = slide.layout === 'quote';

  if (isSection || isQuote) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: bgOverride ?? ac }]} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: bgOverride ?? tokens.background }]} />;
}

// ─── Layout Components ────────────────────────────────────────────────────────

function TitleLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm; // spacing multiplier applied to padding values
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', width: SLIDE_W * 0.5 * sc, height: SLIDE_W * 0.5 * sc, borderRadius: SLIDE_W * 0.25 * sc, right: -SLIDE_W * 0.06 * sc, top: -SLIDE_W * 0.15 * sc, backgroundColor: ac, opacity: 0.12 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 * sc, backgroundColor: ac }} />
      {slide.badgeText && (
        <View style={{ position: 'absolute', top: 10 * sc * p, left: 12 * sc * p, backgroundColor: `${ac}22`, borderRadius: 20, borderWidth: 0.5, borderColor: `${ac}55`, paddingHorizontal: 6 * sc, paddingVertical: 2 * sc }}>
          <Text style={{ color: ac, fontSize: 5 * sc, fontWeight: '700', letterSpacing: 0.5, fontFamily: ff }}>
            {trunc(slide.badgeText?.toUpperCase(), 30, nt)}
          </Text>
        </View>
      )}
      <View style={{ position: 'absolute', top: 30 * sc * p, left: 12 * sc * p, right: SLIDE_W * 0.22 }}>
        <Text numberOfLines={nl(3, nt)} style={{ color: tokens.textPrimary, fontSize: 13 * sc, fontWeight: '900', lineHeight: 15 * sc, fontFamily: ff }}>
          {trunc(slide.title, 70, nt)}
        </Text>
      </View>
      <View style={{ position: 'absolute', top: 108 * sc * p, left: 12 * sc * p, width: 28 * sc, height: 2 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {slide.subtitle && (
        <View style={{ position: 'absolute', top: 115 * sc * p, left: 12 * sc * p, right: SLIDE_W * 0.22 }}>
          <Text numberOfLines={nl(2, nt)} style={{ color: tokens.textSecondary, fontSize: 6 * sc, fontFamily: ff }}>
            {trunc(slide.subtitle, 60, nt)}
          </Text>
        </View>
      )}
      <Text style={{ position: 'absolute', bottom: 6 * sc, right: 10 * sc, color: tokens.textMuted, fontSize: 5 * sc, fontWeight: '700' }}>
        DeepDive AI
      </Text>
    </View>
  );
}

function SectionLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const p = sm;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: SLIDE_W * 0.15, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      {slide.sectionTag && (
        <Text style={{ position: 'absolute', top: 44 * sc * p, left: 16 * sc * p, color: 'rgba(255,255,255,0.75)', fontSize: 5 * sc, fontWeight: '700', letterSpacing: 1.5, fontFamily: ff }}>
          {trunc(slide.sectionTag.toUpperCase(), 28, nt)}
        </Text>
      )}
      <View style={{ position: 'absolute', top: 56 * sc * p, left: 16 * sc * p, right: SLIDE_W * 0.18 }}>
        <Text numberOfLines={nl(3, nt)} style={{ color: '#FFFFFF', fontSize: 17 * sc, fontWeight: '900', lineHeight: 19 * sc, fontFamily: ff }}>
          {trunc(slide.title, 50, nt)}
        </Text>
      </View>
      <Text style={{ position: 'absolute', bottom: 8 * sc, right: SLIDE_W * 0.18 + 8 * sc, color: 'rgba(255,255,255,0.55)', fontSize: 5 * sc }}>
        {slide.slideNumber}
      </Text>
    </View>
  );
}

function AgendaLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac    = accent(slide, tokens);
  const p     = sm;
  const items = (slide.bullets ?? []).slice(0, nt ? undefined : 6);
  const half  = Math.ceil(items.length / 2);
  const col1  = items.slice(0, half);
  const col2  = items.slice(half);
  const rowH  = nt ? 24 * sc * p : 20 * sc * p;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 8 * sc, left: 12 * sc * p, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 30, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 30 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {col1.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * rowH / sc) * sc, left: 10 * sc * p, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={nl(1, nt)} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 4 * sc, flex: 1, fontFamily: ff }}>
            {trunc(item, 22, nt)}
          </Text>
        </View>
      ))}
      {col2.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * rowH / sc) * sc, left: SLIDE_W * 0.5, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{half + i + 1}</Text>
          </View>
          <Text numberOfLines={nl(1, nt)} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 4 * sc, flex: 1, fontFamily: ff }}>
            {trunc(item, 22, nt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ContentLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 10 * sc * p, left: 10 * sc * p, right: 10 * sc, color: tokens.textPrimary, fontSize: 9.5 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 50, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 36 * sc, left: 10 * sc * p, right: 10 * sc, height: 1 * sc, backgroundColor: tokens.border }} />
      {slide.body && (
        <Text numberOfLines={nl(6, nt)} style={{ position: 'absolute', top: 42 * sc, left: 10 * sc * p, right: 10 * sc, color: tokens.textSecondary, fontSize: 5.5 * sc, lineHeight: 8.5 * sc, fontFamily: ff }}>
          {trunc(slide.body, 280, nt)}
        </Text>
      )}
    </View>
  );
}

function BulletsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac      = accent(slide, tokens);
  const p       = sm;
  const bullets = (slide.bullets ?? []).slice(0, nt ? undefined : 5);
  const rowH    = nt ? 30 * sc * p : 26 * sc * p;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 32, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {bullets.map((bullet, i) => (
        <View key={i} style={{ position: 'absolute', top: 33 * sc + i * rowH, left: 10 * sc * p, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 7 * sc, height: 7 * sc, borderRadius: 4 * sc, backgroundColor: ac, marginTop: 1 * sc, flexShrink: 0 }} />
          <Text numberOfLines={nl(2, nt)} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 5 * sc, flex: 1, lineHeight: 8 * sc, fontFamily: ff }}>
            {trunc(bullet, 65, nt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac    = accent(slide, tokens);
  const p     = sm;
  const stats = (slide.stats ?? []).slice(0, 4);
  const cardW = stats.length === 4 ? 68 * sc : 80 * sc;
  const cardH = 88 * sc * p;
  const totalW = stats.length * cardW + (stats.length - 1) * 6 * sc;
  const startX = (SLIDE_W - totalW / sc) / 2 * sc;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Text numberOfLines={1} style={{ position: 'absolute', top: 12 * sc * p, left: 0, right: 0, color: tokens.textPrimary, fontSize: 9.5 * sc, fontWeight: '800', textAlign: 'center', fontFamily: ff }}>
        {trunc(slide.title, 35, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: SLIDE_W / 2 - 20 * sc, width: 40 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {stats.map((stat, i) => {
        const cardColor = stat.color ?? ac;
        return (
          <View key={i} style={{ position: 'absolute', left: startX + i * (cardW + 6 * sc), top: 38 * sc, width: cardW, height: cardH, backgroundColor: tokens.surface, borderRadius: 5 * sc, borderTopWidth: 2.5 * sc, borderTopColor: cardColor }}>
            <Text numberOfLines={1} style={{ color: cardColor, fontSize: 14 * sc, fontWeight: '900', textAlign: 'center', marginTop: 12 * sc, fontFamily: ff }}>
              {trunc(stat.value, 8, nt)}
            </Text>
            <Text numberOfLines={nl(2, nt)} style={{ color: tokens.textMuted, fontSize: 4.5 * sc, textAlign: 'center', marginTop: 4 * sc, paddingHorizontal: 4 * sc, lineHeight: 6.5 * sc, fontFamily: ff }}>
              {trunc(stat.label, 28, nt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function QuoteLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const p = sm;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Text style={{ position: 'absolute', top: -4 * sc, left: 6 * sc * p, color: 'rgba(255,255,255,0.18)', fontSize: 60 * sc, fontWeight: '900' }}>
        {'\u201C'}
      </Text>
      <View style={{ position: 'absolute', top: 25 * sc * p, left: 14 * sc * p, right: 14 * sc * p, bottom: 30 * sc, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={nl(5, nt)} style={{ color: '#FFFFFF', fontSize: 7.5 * sc, fontWeight: '700', textAlign: 'center', lineHeight: 11 * sc, fontFamily: ff }}>
          {trunc(slide.quote, 180, nt)}
        </Text>
      </View>
      {slide.quoteAttribution && (
        <Text numberOfLines={1} style={{ position: 'absolute', bottom: 10 * sc, left: 0, right: 0, color: 'rgba(255,255,255,0.65)', fontSize: 5 * sc, textAlign: 'center', fontStyle: 'italic', fontFamily: ff }}>
          {`— ${trunc(slide.quoteAttribution, 50, nt)}`}
        </Text>
      )}
    </View>
  );
}

function ChartRefLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 10 * sc * p, left: 10 * sc * p, right: 10 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 50, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 34 * sc, left: 10 * sc * p, width: 130 * sc, height: 110 * sc, backgroundColor: tokens.surface, borderRadius: 4 * sc, borderWidth: 0.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="bar-chart-outline" size={18 * sc} color={tokens.textMuted} />
        <Text style={{ color: tokens.textMuted, fontSize: 4 * sc, marginTop: 4 * sc, textAlign: 'center' }}>{'Chart\nin app'}</Text>
      </View>
      {slide.body && (
        <Text numberOfLines={nl(7, nt)} style={{ position: 'absolute', top: 34 * sc, left: 148 * sc, right: 8 * sc, color: tokens.textSecondary, fontSize: 5 * sc, lineHeight: 7.5 * sc, fontFamily: ff }}>
          {trunc(slide.body, 200, nt)}
        </Text>
      )}
    </View>
  );
}

function PredictionsLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac    = accent(slide, tokens);
  const p     = sm;
  const preds = (slide.bullets ?? []).slice(0, nt ? undefined : 5);
  const rowH  = nt ? 32 * sc * p : 27 * sc * p;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 32, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {preds.map((pred, i) => (
        <View key={i} style={{ position: 'absolute', top: 32 * sc + i * rowH, left: 10 * sc * p, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          {i < preds.length - 1 && (
            <View style={{ position: 'absolute', left: 5 * sc, top: 12 * sc, width: 1 * sc, height: 16 * sc, backgroundColor: tokens.border }} />
          )}
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={nl(2, nt)} style={{ color: tokens.textSecondary, fontSize: 5 * sc, marginLeft: 5 * sc, flex: 1, lineHeight: 7.5 * sc, fontFamily: ff }}>
            {trunc(pred, 65, nt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReferencesLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac   = accent(slide, tokens);
  const p    = sm;
  const refs = (slide.bullets ?? []).slice(0, nt ? undefined : 6);
  const rowH = nt ? 26 * sc * p : 22 * sc * p;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc * p, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800', fontFamily: ff }}>
        {trunc(slide.title, 30, nt)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {refs.map((ref, i) => (
        <View key={i} style={{ position: 'absolute', top: 32 * sc + i * rowH, left: 10 * sc * p, right: 8 * sc, flexDirection: 'row' }}>
          <Text style={{ color: ac, fontSize: 5 * sc, fontWeight: '700', marginRight: 3 * sc, flexShrink: 0 }}>[{i + 1}]</Text>
          <Text numberOfLines={nl(2, nt)} style={{ color: tokens.textSecondary, fontSize: 5 * sc, flex: 1, lineHeight: 7.5 * sc, fontFamily: ff }}>
            {trunc(ref, 70, nt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ClosingLayout({ ctx }: { ctx: LayoutCtx }) {
  const { slide, tokens, sc, sm, ff, nt } = ctx;
  const ac = accent(slide, tokens);
  const p  = sm;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', width: 110 * sc, height: 110 * sc, borderRadius: 55 * sc, borderWidth: 1, borderColor: `${ac}55`, top: SLIDE_H / 2 - 55 * sc, left: SLIDE_W / 2 - 55 * sc }} />
      <Text style={{ position: 'absolute', top: 40 * sc * p, left: 0, right: 0, color: ac, fontSize: 5.5 * sc, fontWeight: '700', letterSpacing: 2, textAlign: 'center' }}>
        DEEPDIVE AI
      </Text>
      <Text numberOfLines={nl(2, nt)} style={{ position: 'absolute', top: 70 * sc * p, left: 16 * sc * p, right: 16 * sc * p, color: tokens.textPrimary, fontSize: 18 * sc, fontWeight: '900', textAlign: 'center', lineHeight: 20 * sc, fontFamily: ff }}>
        {trunc(slide.title, 30, nt)}
      </Text>
      {slide.subtitle && (
        <Text numberOfLines={nl(1, nt)} style={{ position: 'absolute', top: 120 * sc * p, left: 16 * sc * p, right: 16 * sc * p, color: tokens.textSecondary, fontSize: 6 * sc, textAlign: 'center', fontFamily: ff }}>
          {trunc(slide.subtitle, 55, nt)}
        </Text>
      )}
      <View style={{ position: 'absolute', bottom: 18 * sc, left: SLIDE_W / 2 - 28 * sc, width: 56 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
    </View>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const SlideCard = memo(function SlideCard({
  slide,
  tokens,
  scale    = 1,
  showNotes = false,
  fontFamily,
  noTruncate = false,
}: SlideCardProps) {
  const sc = scale;
  const sm = getSpacingMultiplier(slide);
  const ff = resolveFontFamily(fontFamily);
  const nt = noTruncate;

  const ctx: LayoutCtx = { slide, tokens, sc, sm, ff, nt };

  // Background: use editorData.backgroundColor if set, otherwise layout-based colour
  const bgOverride = getBgOverride(slide);
  const ac = accent(slide, tokens);
  const isSection = slide.layout === 'section';
  const isQuote   = slide.layout === 'quote';
  const bgColor = bgOverride ?? (isSection || isQuote ? ac : tokens.background);

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
      <View style={{ width: SLIDE_W * sc, height: SLIDE_H * sc, overflow: 'hidden', borderRadius: 5 * sc, position: 'relative', backgroundColor: bgColor }}>
        {renderLayout()}
      </View>

      {showNotes && slide.speakerNotes && (
        <View style={{ backgroundColor: tokens.surface, borderRadius: 4, marginTop: 6, padding: 8 }}>
          <Text style={{ color: tokens.textMuted, fontSize: 9, fontWeight: '600', marginBottom: 2 }}>SPEAKER NOTES</Text>
          <Text style={{ color: tokens.textSecondary, fontSize: 10, lineHeight: 14, fontFamily: ff }}>
            {slide.speakerNotes}
          </Text>
        </View>
      )}
    </View>
  );
});