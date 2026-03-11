// src/components/research/SlideCard.tsx
// Part 5 — Renders a single PresentationSlide in miniature (thumbnail)
// or expanded (full) mode, matching all 11 layout types and all 4 themes.

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PresentationSlide, PresentationThemeTokens } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideCardProps {
  slide: PresentationSlide;
  tokens: PresentationThemeTokens;
  /** Scale factor — 1.0 means the card fills its container exactly */
  scale?: number;
  /** Whether to show speaker notes at the bottom */
  showNotes?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Canonical slide dimensions at scale=1  (16:9 in dp units)
const SLIDE_W = 320;
const SLIDE_H = 180;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accent(slide: PresentationSlide, tokens: PresentationThemeTokens): string {
  return slide.accentColor ?? tokens.primary;
}

/** Truncate text to maxLen characters */
function trunc(s: string | undefined, maxLen: number): string {
  if (!s) return '';
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

// ─── Per-layout renderers ────────────────────────────────────────────────────

function TitleLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Deco circle */}
      <View style={{
        position: 'absolute', width: SLIDE_W * 0.5, height: SLIDE_W * 0.5,
        borderRadius: SLIDE_W * 0.25, right: -SLIDE_W * 0.06, top: -SLIDE_W * 0.15,
        backgroundColor: ac, opacity: 0.12,
      }} />
      {/* Top accent strip */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 * sc, backgroundColor: ac }} />
      {/* Badge */}
      {slide.badgeText && (
        <View style={{
          position: 'absolute', top: 10 * sc, left: 12 * sc,
          backgroundColor: `${ac}22`, borderRadius: 20,
          borderWidth: 0.5, borderColor: `${ac}55`,
          paddingHorizontal: 6 * sc, paddingVertical: 2 * sc,
        }}>
          <Text style={{ color: ac, fontSize: 5 * sc, fontWeight: '700', letterSpacing: 0.5 }}>
            {trunc(slide.badgeText?.toUpperCase(), 30)}
          </Text>
        </View>
      )}
      {/* Title */}
      <View style={{ position: 'absolute', top: 30 * sc, left: 12 * sc, right: SLIDE_W * 0.22 }}>
        <Text numberOfLines={3} style={{ color: tokens.textPrimary, fontSize: 13 * sc, fontWeight: '900', lineHeight: 15 * sc }}>
          {trunc(slide.title, 70)}
        </Text>
      </View>
      {/* Accent line */}
      <View style={{ position: 'absolute', top: 108 * sc, left: 12 * sc, width: 28 * sc, height: 2 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {/* Subtitle */}
      {slide.subtitle && (
        <View style={{ position: 'absolute', top: 115 * sc, left: 12 * sc, right: SLIDE_W * 0.22 }}>
          <Text numberOfLines={2} style={{ color: tokens.textSecondary, fontSize: 6 * sc }}>
            {trunc(slide.subtitle, 60)}
          </Text>
        </View>
      )}
      {/* Brand */}
      <Text style={{ position: 'absolute', bottom: 6 * sc, right: 10 * sc, color: tokens.textMuted, fontSize: 5 * sc, fontWeight: '700' }}>
        DeepDive AI
      </Text>
    </View>
  );
}

function SectionLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Right side accent */}
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: SLIDE_W * 0.15, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      {/* Section tag */}
      {slide.sectionTag && (
        <Text style={{ position: 'absolute', top: 44 * sc, left: 16 * sc, color: 'rgba(255,255,255,0.75)', fontSize: 5 * sc, fontWeight: '700', letterSpacing: 1.5 }}>
          {trunc(slide.sectionTag.toUpperCase(), 28)}
        </Text>
      )}
      {/* Big title */}
      <View style={{ position: 'absolute', top: 56 * sc, left: 16 * sc, right: SLIDE_W * 0.18 }}>
        <Text numberOfLines={3} style={{ color: '#FFFFFF', fontSize: 17 * sc, fontWeight: '900', lineHeight: 19 * sc }}>
          {trunc(slide.title, 50)}
        </Text>
      </View>
      {/* Slide number */}
      <Text style={{ position: 'absolute', bottom: 8 * sc, right: SLIDE_W * 0.18 + 8 * sc, color: 'rgba(255,255,255,0.55)', fontSize: 5 * sc }}>
        {slide.slideNumber}
      </Text>
    </View>
  );
}

function AgendaLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  const items = (slide.bullets ?? []).slice(0, 6);
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Header */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 8 * sc, left: 12 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 30)}
      </Text>
      <View style={{ position: 'absolute', top: 30 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {/* Col 1 */}
      {col1.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * 20) * sc, left: 10 * sc, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 4 * sc, flex: 1 }}>
            {trunc(item, 22)}
          </Text>
        </View>
      ))}
      {/* Col 2 */}
      {col2.map((item, i) => (
        <View key={i} style={{ position: 'absolute', top: (36 + i * 20) * sc, left: SLIDE_W * 0.5, flexDirection: 'row', alignItems: 'center', width: SLIDE_W * 0.43 }}>
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{half + i + 1}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 4 * sc, flex: 1 }}>
            {trunc(item, 22)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ContentLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Left accent bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={2} style={{ position: 'absolute', top: 10 * sc, left: 10 * sc, right: 10 * sc, color: tokens.textPrimary, fontSize: 9.5 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 50)}
      </Text>
      <View style={{ position: 'absolute', top: 36 * sc, left: 10 * sc, right: 10 * sc, height: 1 * sc, backgroundColor: tokens.border }} />
      {slide.body && (
        <Text numberOfLines={6} style={{ position: 'absolute', top: 42 * sc, left: 10 * sc, right: 10 * sc, color: tokens.textSecondary, fontSize: 5.5 * sc, lineHeight: 8.5 * sc }}>
          {trunc(slide.body, 280)}
        </Text>
      )}
    </View>
  );
}

function BulletsLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  const bullets = (slide.bullets ?? []).slice(0, 5);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 32)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {bullets.map((bullet, i) => (
        <View key={i} style={{ position: 'absolute', top: (33 + i * 26) * sc, left: 10 * sc, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 7 * sc, height: 7 * sc, borderRadius: 4 * sc, backgroundColor: ac, marginTop: 1 * sc, flexShrink: 0 }} />
          <Text numberOfLines={2} style={{ color: tokens.textSecondary, fontSize: 5.5 * sc, marginLeft: 5 * sc, flex: 1, lineHeight: 8 * sc }}>
            {trunc(bullet, 65)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatsLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  const stats = (slide.stats ?? []).slice(0, 4);
  const cardW = stats.length === 4 ? 68 * sc : 80 * sc;
  const cardH = 88 * sc;
  const totalW = stats.length * cardW + (stats.length - 1) * 6 * sc;
  const startX = (SLIDE_W - totalW / sc) / 2 * sc;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Text numberOfLines={1} style={{ position: 'absolute', top: 12 * sc, left: 0, right: 0, color: tokens.textPrimary, fontSize: 9.5 * sc, fontWeight: '800', textAlign: 'center' }}>
        {trunc(slide.title, 35)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: SLIDE_W / 2 - 20 * sc, width: 40 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
      {stats.map((stat, i) => {
        const cardColor = stat.color ?? ac;
        return (
          <View key={i} style={{
            position: 'absolute',
            left: startX + i * (cardW + 6 * sc),
            top: 38 * sc,
            width: cardW,
            height: cardH,
            backgroundColor: tokens.surface,
            borderRadius: 5 * sc,
            borderTopWidth: 2.5 * sc,
            borderTopColor: cardColor,
          }}>
            <Text numberOfLines={1} style={{ color: cardColor, fontSize: 14 * sc, fontWeight: '900', textAlign: 'center', marginTop: 12 * sc }}>
              {trunc(stat.value, 8)}
            </Text>
            <Text numberOfLines={2} style={{ color: tokens.textMuted, fontSize: 4.5 * sc, textAlign: 'center', marginTop: 4 * sc, paddingHorizontal: 4 * sc, lineHeight: 6.5 * sc }}>
              {trunc(stat.label, 28)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function QuoteLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Text style={{ position: 'absolute', top: -4 * sc, left: 6 * sc, color: 'rgba(255,255,255,0.18)', fontSize: 60 * sc, fontWeight: '900' }}>
        {'\u201C'}
      </Text>
      <View style={{ position: 'absolute', top: 25 * sc, left: 14 * sc, right: 14 * sc, bottom: 30 * sc, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={5} style={{ color: '#FFFFFF', fontSize: 7.5 * sc, fontWeight: '700', textAlign: 'center', lineHeight: 11 * sc }}>
          {trunc(slide.quote, 180)}
        </Text>
      </View>
      {slide.quoteAttribution && (
        <Text numberOfLines={1} style={{ position: 'absolute', bottom: 10 * sc, left: 0, right: 0, color: 'rgba(255,255,255,0.65)', fontSize: 5 * sc, textAlign: 'center', fontStyle: 'italic' }}>
          {`— ${trunc(slide.quoteAttribution, 50)}`}
        </Text>
      )}
    </View>
  );
}

function ChartRefLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2 * sc, backgroundColor: ac }} />
      <Text numberOfLines={2} style={{ position: 'absolute', top: 10 * sc, left: 10 * sc, right: 10 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 50)}
      </Text>
      {/* Chart placeholder box */}
      <View style={{
        position: 'absolute', top: 34 * sc, left: 10 * sc,
        width: 130 * sc, height: 110 * sc,
        backgroundColor: tokens.surface, borderRadius: 4 * sc,
        borderWidth: 0.5, borderColor: tokens.border,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="bar-chart-outline" size={18 * sc} color={tokens.textMuted} />
        <Text style={{ color: tokens.textMuted, fontSize: 4 * sc, marginTop: 4 * sc, textAlign: 'center' }}>
          {'Chart\nin app'}
        </Text>
      </View>
      {slide.body && (
        <Text numberOfLines={7} style={{ position: 'absolute', top: 34 * sc, left: 148 * sc, right: 8 * sc, color: tokens.textSecondary, fontSize: 5 * sc, lineHeight: 7.5 * sc }}>
          {trunc(slide.body, 200)}
        </Text>
      )}
    </View>
  );
}

function PredictionsLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  const preds = (slide.bullets ?? []).slice(0, 5);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 32)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {preds.map((pred, i) => (
        <View key={i} style={{ position: 'absolute', top: (32 + i * 27) * sc, left: 10 * sc, right: 10 * sc, flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Connector line */}
          {i < preds.length - 1 && (
            <View style={{ position: 'absolute', left: 5 * sc, top: 12 * sc, width: 1 * sc, height: 16 * sc, backgroundColor: tokens.border }} />
          )}
          <View style={{ width: 11 * sc, height: 11 * sc, borderRadius: 6 * sc, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: '#FFF', fontSize: 5 * sc, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <Text numberOfLines={2} style={{ color: tokens.textSecondary, fontSize: 5 * sc, marginLeft: 5 * sc, flex: 1, lineHeight: 7.5 * sc }}>
            {trunc(pred, 65)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReferencesLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  const refs = (slide.bullets ?? []).slice(0, 6);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 * sc, backgroundColor: tokens.surface }} />
      <Text numberOfLines={1} style={{ position: 'absolute', top: 7 * sc, left: 12 * sc, color: tokens.textPrimary, fontSize: 9 * sc, fontWeight: '800' }}>
        {trunc(slide.title, 30)}
      </Text>
      <View style={{ position: 'absolute', top: 28 * sc, left: 0, right: 0, height: 1.5 * sc, backgroundColor: ac }} />
      {refs.map((ref, i) => (
        <View key={i} style={{ position: 'absolute', top: (32 + i * 22) * sc, left: 10 * sc, right: 8 * sc, flexDirection: 'row' }}>
          <Text style={{ color: ac, fontSize: 5 * sc, fontWeight: '700', marginRight: 3 * sc, flexShrink: 0 }}>[{i + 1}]</Text>
          <Text numberOfLines={2} style={{ color: tokens.textSecondary, fontSize: 5 * sc, flex: 1, lineHeight: 7.5 * sc }}>
            {trunc(ref, 70)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ClosingLayout({ slide, tokens, sc }: { slide: PresentationSlide; tokens: PresentationThemeTokens; sc: number }) {
  const ac = accent(slide, tokens);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Circle deco */}
      <View style={{
        position: 'absolute',
        width: 110 * sc, height: 110 * sc,
        borderRadius: 55 * sc,
        borderWidth: 1, borderColor: `${ac}55`,
        top: SLIDE_H / 2 - 55 * sc, left: SLIDE_W / 2 - 55 * sc,
      }} />
      <Text style={{ position: 'absolute', top: 40 * sc, left: 0, right: 0, color: ac, fontSize: 5.5 * sc, fontWeight: '700', letterSpacing: 2, textAlign: 'center' }}>
        DEEPDIVE AI
      </Text>
      <Text numberOfLines={2} style={{ position: 'absolute', top: 70 * sc, left: 16 * sc, right: 16 * sc, color: tokens.textPrimary, fontSize: 18 * sc, fontWeight: '900', textAlign: 'center', lineHeight: 20 * sc }}>
        {trunc(slide.title, 30)}
      </Text>
      {slide.subtitle && (
        <Text numberOfLines={1} style={{ position: 'absolute', top: 120 * sc, left: 16 * sc, right: 16 * sc, color: tokens.textSecondary, fontSize: 6 * sc, textAlign: 'center' }}>
          {trunc(slide.subtitle, 55)}
        </Text>
      )}
      <View style={{ position: 'absolute', bottom: 18 * sc, left: SLIDE_W / 2 - 28 * sc, width: 56 * sc, height: 1.5 * sc, backgroundColor: ac, borderRadius: 1 }} />
    </View>
  );
}

// ─── Background colour/gradient for each layout ────────────────────────────────

function SlideBackground({ slide, tokens }: { slide: PresentationSlide; tokens: PresentationThemeTokens }) {
  const ac = accent(slide, tokens);
  const isSection = slide.layout === 'section';
  const isQuote   = slide.layout === 'quote';
  const isClosing = slide.layout === 'closing';

  if (isSection || isQuote) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ac }]} />
    );
  }

  if (isClosing) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.background }]} />;
  }

  return <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.background }]} />;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const SlideCard = memo(function SlideCard({
  slide,
  tokens,
  scale = 1,
  showNotes = false,
}: SlideCardProps) {
  const sc = scale;

  function renderLayout() {
    switch (slide.layout) {
      case 'title':       return <TitleLayout       slide={slide} tokens={tokens} sc={sc} />;
      case 'section':     return <SectionLayout     slide={slide} tokens={tokens} sc={sc} />;
      case 'agenda':      return <AgendaLayout      slide={slide} tokens={tokens} sc={sc} />;
      case 'content':     return <ContentLayout     slide={slide} tokens={tokens} sc={sc} />;
      case 'bullets':     return <BulletsLayout     slide={slide} tokens={tokens} sc={sc} />;
      case 'stats':       return <StatsLayout       slide={slide} tokens={tokens} sc={sc} />;
      case 'quote':       return <QuoteLayout       slide={slide} tokens={tokens} sc={sc} />;
      case 'chart_ref':   return <ChartRefLayout    slide={slide} tokens={tokens} sc={sc} />;
      case 'predictions': return <PredictionsLayout slide={slide} tokens={tokens} sc={sc} />;
      case 'references':  return <ReferencesLayout  slide={slide} tokens={tokens} sc={sc} />;
      case 'closing':     return <ClosingLayout     slide={slide} tokens={tokens} sc={sc} />;
      default:            return <ContentLayout     slide={slide} tokens={tokens} sc={sc} />;
    }
  }

  return (
    <View style={{ width: SLIDE_W * sc, height: SLIDE_H * sc }}>
      <View style={{
        width: SLIDE_W * sc,
        height: SLIDE_H * sc,
        overflow: 'hidden',
        borderRadius: 5 * sc,
        position: 'relative',
      }}>
        <SlideBackground slide={slide} tokens={tokens} />
        {renderLayout()}
      </View>

      {showNotes && slide.speakerNotes && (
        <View style={{
          backgroundColor: tokens.surface,
          borderRadius: 4,
          marginTop: 6,
          padding: 8,
        }}>
          <Text style={{ color: tokens.textMuted, fontSize: 9, fontWeight: '600', marginBottom: 2 }}>
            SPEAKER NOTES
          </Text>
          <Text style={{ color: tokens.textSecondary, fontSize: 10, lineHeight: 14 }}>
            {slide.speakerNotes}
          </Text>
        </View>
      )}
    </View>
  );
});