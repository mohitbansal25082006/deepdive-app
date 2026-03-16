// src/components/offline/OfflinePresentationViewer.tsx
// Part 23 — Full offline presentation viewer.
//
// Renders the complete slide deck from cache — shows all slides with their
// actual rendered content (title, bullets, stats, quotes, etc.) identical
// to the online SlidePreviewPanel. Includes swipe navigation, thumbnail strip,
// speaker notes, and PDF/PPTX export working fully offline.

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// ✅ STATIC import — prevents "could not load bundle" from pptxgenjs lazy chunks
import { exportPresentationAsPPTX } from '../../services/offlinePptxExport';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { GeneratedPresentation, PresentationSlide } from '../../types';
import type { CacheEntry } from '../../types/cache';

const { width: SCREEN_W } = Dimensions.get('window');
const SLIDE_ASPECT = 16 / 9;
const SLIDE_W = SCREEN_W - SPACING.lg * 2;
const SLIDE_H = Math.round(SLIDE_W / SLIDE_ASPECT);
const THUMB_W = 100;
const THUMB_H = Math.round(THUMB_W / SLIDE_ASPECT);

// ─── Layout badge config ──────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<string, string> = {
  title: 'Title', agenda: 'Agenda', section: 'Section', content: 'Content',
  bullets: 'Key Points', stats: 'Statistics', quote: 'Pull Quote',
  chart_ref: 'Chart', predictions: 'Predictions', references: 'References', closing: 'Closing',
};

// ─── Slide renderer (mini version of the online SlideCard) ───────────────────

function SlideContent({ slide, t, scale = 1 }: {
  slide: GeneratedPresentation['slides'][0];
  t: any;
  scale?: number;
}) {
  const ac = slide.accentColor ?? t.primary;
  const fs = (base: number) => Math.round(base * scale);

  switch (slide.layout) {
    case 'title':
      return (
        <View style={{ flex: 1, backgroundColor: t.background, padding: SPACING.lg * scale, justifyContent: 'center' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 * scale, backgroundColor: ac }} />
          {slide.badgeText ? (
            <View style={{ backgroundColor: `${ac}22`, borderRadius: 99, paddingHorizontal: 10 * scale, paddingVertical: 3 * scale, alignSelf: 'flex-start', marginBottom: 10 * scale, borderWidth: 1, borderColor: `${ac}44` }}>
              <Text style={{ color: ac, fontSize: fs(9), fontWeight: '700', letterSpacing: 1 }}>{slide.badgeText.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={{ color: t.textPrimary, fontSize: fs(22), fontWeight: '900', lineHeight: fs(26), marginBottom: 8 * scale }}>{slide.title}</Text>
          <View style={{ width: 50 * scale, height: 3, backgroundColor: ac, borderRadius: 2, marginBottom: 8 * scale }} />
          {slide.subtitle ? <Text style={{ color: t.textSecondary, fontSize: fs(11), lineHeight: fs(17) }}>{slide.subtitle}</Text> : null}
        </View>
      );

    case 'section':
      return (
        <View style={{ flex: 1, backgroundColor: ac, padding: SPACING.lg * scale, justifyContent: 'center' }}>
          {slide.sectionTag ? <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: fs(8), fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 * scale }}>{slide.sectionTag}</Text> : null}
          <Text style={{ color: '#FFFFFF', fontSize: fs(24), fontWeight: '900', lineHeight: fs(28) }}>{slide.title}</Text>
        </View>
      );

    case 'agenda':
    case 'bullets':
      return (
        <View style={{ flex: 1, backgroundColor: t.background }}>
          <View style={{ backgroundColor: t.surface, padding: SPACING.md * scale, paddingHorizontal: SPACING.lg * scale }}>
            <Text style={{ color: t.textPrimary, fontSize: fs(14), fontWeight: '800' }}>{slide.title}</Text>
          </View>
          <View style={{ height: 3, backgroundColor: ac }} />
          <View style={{ padding: SPACING.md * scale }}>
            {(slide.bullets ?? []).slice(0, 6).map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 * scale, marginBottom: 5 * scale }}>
                <View style={{ width: 6 * scale, height: 6 * scale, borderRadius: 3 * scale, backgroundColor: ac, marginTop: 4 * scale, flexShrink: 0 }} />
                <Text style={{ color: t.textSecondary, fontSize: fs(10), lineHeight: fs(15), flex: 1 }}>{b}</Text>
              </View>
            ))}
          </View>
        </View>
      );

    case 'content':
      return (
        <View style={{ flex: 1, backgroundColor: t.background }}>
          <View style={{ width: 3, position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: ac }} />
          <View style={{ paddingLeft: SPACING.md * scale, paddingTop: SPACING.sm * scale, flex: 1 }}>
            <Text style={{ color: t.textPrimary, fontSize: fs(14), fontWeight: '800', marginBottom: 6 * scale }}>{slide.title}</Text>
            <View style={{ height: 1, backgroundColor: t.border, marginBottom: 6 * scale }} />
            {slide.body ? <Text style={{ color: t.textSecondary, fontSize: fs(10), lineHeight: fs(16) }} numberOfLines={8}>{slide.body}</Text> : null}
          </View>
        </View>
      );

    case 'stats':
      return (
        <View style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: SPACING.md * scale }}>
          <Text style={{ color: t.textPrimary, fontSize: fs(14), fontWeight: '800', textAlign: 'center', marginBottom: 6 * scale }}>{slide.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6 * scale, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(slide.stats ?? []).slice(0, 4).map((stat, i) => {
              const col = stat.color ?? ac;
              return (
                <View key={i} style={{ width: 60 * scale, backgroundColor: t.surface, borderRadius: 6 * scale, padding: 6 * scale, alignItems: 'center', borderTopWidth: 3, borderTopColor: col }}>
                  <Text style={{ color: col, fontSize: fs(16), fontWeight: '900' }}>{stat.value}</Text>
                  <Text style={{ color: t.textMuted, fontSize: fs(7), textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      );

    case 'quote':
      return (
        <View style={{ flex: 1, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg * scale }}>
          <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: fs(80), fontWeight: '900', position: 'absolute', top: -10 * scale, left: 10 * scale, lineHeight: fs(80) }}>"</Text>
          <Text style={{ color: '#FFFFFF', fontSize: fs(13), fontWeight: '700', textAlign: 'center', lineHeight: fs(20) }}>{slide.quote ?? slide.title}</Text>
          {slide.quoteAttribution ? (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fs(10), marginTop: 8 * scale, fontStyle: 'italic' }}>— {slide.quoteAttribution}</Text>
          ) : null}
        </View>
      );

    case 'closing':
      return (
        <View style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg * scale }}>
          <View style={{ width: 60 * scale, height: 60 * scale, borderRadius: 30 * scale, backgroundColor: `${ac}18`, borderWidth: 2, borderColor: `${ac}35`, alignItems: 'center', justifyContent: 'center', marginBottom: 10 * scale }}>
            <Ionicons name="sparkles-outline" size={fs(22)} color={ac} />
          </View>
          <Text style={{ color: COLORS.primary, fontSize: fs(9), fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 * scale }}>DeepDive AI</Text>
          <Text style={{ color: t.textPrimary, fontSize: fs(22), fontWeight: '900', textAlign: 'center', lineHeight: fs(26) }}>{slide.title}</Text>
          {slide.subtitle ? <Text style={{ color: t.textSecondary, fontSize: fs(10), marginTop: 6 * scale, textAlign: 'center' }}>{slide.subtitle}</Text> : null}
        </View>
      );

    default:
      return (
        <View style={{ flex: 1, backgroundColor: t.background, padding: SPACING.md * scale }}>
          <Text style={{ color: t.textPrimary, fontSize: fs(14), fontWeight: '800', marginBottom: 6 * scale }}>{slide.title}</Text>
          {slide.body ? <Text style={{ color: t.textSecondary, fontSize: fs(10), lineHeight: fs(16) }} numberOfLines={10}>{slide.body}</Text> : null}
          {(slide.bullets ?? []).slice(0, 5).map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: ac, marginTop: 4, flexShrink: 0 }} />
              <Text style={{ color: t.textSecondary, fontSize: fs(10), lineHeight: fs(15), flex: 1 }}>{b}</Text>
            </View>
          ))}
        </View>
      );
  }
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function SlideThumbnail({ slide, t, isActive, onPress }: {
  slide: PresentationSlide; t: any; isActive: boolean; onPress: () => void;
}) {
  const ac = slide.accentColor ?? t.primary;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ width: THUMB_W, marginRight: 8, borderRadius: 6, overflow: 'hidden', borderWidth: isActive ? 2 : 1, borderColor: isActive ? ac : COLORS.border }}>
      <View style={{ width: THUMB_W, height: THUMB_H, backgroundColor: t.background, overflow: 'hidden' }}>
        <View style={{ width: SLIDE_W, height: SLIDE_H, transform: [{ scale: THUMB_W / SLIDE_W }], transformOrigin: 'top left' }}>
          <SlideContent slide={slide} t={t} scale={THUMB_W / SLIDE_W} />
        </View>
      </View>
      <View style={{ backgroundColor: isActive ? `${ac}15` : COLORS.backgroundElevated, paddingVertical: 3, paddingHorizontal: 4 }}>
        <Text style={{ color: isActive ? ac : COLORS.textMuted, fontSize: 9, fontWeight: isActive ? '700' : '400', textAlign: 'center' }}>
          {slide.slideNumber}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflinePresentationViewerProps {
  presentation: GeneratedPresentation;
  entry:        CacheEntry;
  onClose:      () => void;
  onExport:     () => void;
  exporting:    boolean;
}

export function OfflinePresentationViewer({ presentation, entry, onClose, onExport, exporting }: OfflinePresentationViewerProps) {
  const insets      = useSafeAreaInsets();
  const thumbRef    = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [showNotes,    setShowNotes]       = useState(false);
  const [exporting2,   setExporting2]      = useState(false);

  const t     = presentation.themeTokens ?? { background: '#0A0A1A', surface: '#1A1A35', primary: '#6C63FF', textPrimary: '#FFFFFF', textSecondary: '#A0A0C0', textMuted: '#5A5A7A', border: '#2A2A4A' };
  const slide = presentation.slides[currentIndex];
  const total = presentation.totalSlides;

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, total - 1));
    setCurrentIndex(clamped);
    try {
      thumbRef.current?.scrollToIndex({ index: clamped, animated: true, viewPosition: 0.5 });
    } catch {}
  }, [total]);

  // Swipe gesture
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -50) goTo(currentIndex + 1);
      else if (g.dx > 50) goTo(currentIndex - 1);
    },
  })).current;

  const handleExportPPTX = useCallback(async () => {
    if (exporting2) return;
    setExporting2(true);
    try {
      // Uses the statically-imported service — no dynamic bundle loading needed
      await exportPresentationAsPPTX(presentation);
    } catch (err) {
      // PPTX failed — fall back to offline-safe PDF
      try {
        const { exportPresentationAsPDFOffline } = await import('../../services/offlinePptxExport');
        await exportPresentationAsPDFOffline(presentation);
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        Alert.alert('Export Failed', `Could not export presentation.\n\n${msg}`);
      }
    } finally {
      setExporting2(false);
    }
  }, [presentation, exporting2]);

  if (!slide) return null;

  const noteText = slide.speakerNotes || 'No speaker notes for this slide.';

  return (
    <View style={{ flex: 1, backgroundColor: '#04040E' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(5,5,20,0.97)' }}>
        <TouchableOpacity onPress={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {presentation.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {total} slides · {presentation.theme} theme
            </Text>
          </View>
        </View>

        {/* Notes toggle */}
        <TouchableOpacity onPress={() => setShowNotes(v => !v)}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: showNotes ? `${COLORS.primary}22` : COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: showNotes ? `${COLORS.primary}50` : COLORS.border }}>
          <Ionicons name="document-text-outline" size={16} color={showNotes ? COLORS.primary : COLORS.textMuted} />
        </TouchableOpacity>

        {/* PPTX export */}
        <TouchableOpacity onPress={handleExportPPTX} disabled={exporting2}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}35` }}>
          {exporting2 ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="desktop-outline" size={16} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <View style={{ width: `${((currentIndex + 1) / total) * 100}%` as any, height: '100%', backgroundColor: t.primary }} />
      </View>

      {/* Main slide */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }} {...panResponder.panHandlers}>
        <View style={{ width: SLIDE_W, height: SLIDE_H, borderRadius: 10, overflow: 'hidden', ...SHADOWS.large, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
          <SlideContent slide={slide} t={t} scale={1} />
        </View>
      </View>

      {/* Speaker notes */}
      {showNotes && (
        <View style={{ backgroundColor: 'rgba(8,8,24,0.97)', borderTopWidth: 1, borderTopColor: COLORS.border, maxHeight: 100, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
          <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Speaker Notes</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>{noteText}</Text>
          </ScrollView>
        </View>
      )}

      {/* Thumbnail strip */}
      <View style={{ backgroundColor: 'rgba(5,5,20,0.96)', borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: SPACING.sm }}>
        <FlatList
          ref={thumbRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
          data={presentation.slides}
          keyExtractor={s => s.id}
          getItemLayout={(_, index) => ({ length: THUMB_W + 8, offset: (THUMB_W + 8) * index, index })}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <SlideThumbnail slide={item} t={t} isActive={index === currentIndex} onPress={() => goTo(index)} />
          )}
        />
      </View>

      {/* Bottom nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, paddingBottom: insets.bottom + SPACING.sm, backgroundColor: 'rgba(5,5,20,0.97)', borderTopWidth: 1, borderTopColor: COLORS.border }}>
        <TouchableOpacity onPress={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, opacity: currentIndex === 0 ? 0.3 : 1 }}>
          <Ionicons name="arrow-back" size={14} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Prev</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.primary, fontSize: FONTS.sizes.sm, fontWeight: '800', backgroundColor: `${t.primary}1A`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: `${t.primary}35` }}>
            {currentIndex + 1} / {total}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>
            {LAYOUT_LABELS[slide.layout] ?? slide.layout}
          </Text>
        </View>

        <TouchableOpacity onPress={() => goTo(currentIndex + 1)} disabled={currentIndex === total - 1}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, opacity: currentIndex === total - 1 ? 0.3 : 1 }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Next</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}