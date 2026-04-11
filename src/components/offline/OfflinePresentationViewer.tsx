// src/components/offline/OfflinePresentationViewer.tsx
// Part 41.6 — Complete rewrite
//
// Key changes vs Part 23:
//   1. Replaced custom SlideContent with the real SlideCard component.
//      Slides now look IDENTICAL to the online viewer — all editor overlays,
//      background color overrides, spacing, font family, Iconify icons, charts,
//      stats cards, and field formatting are rendered exactly as online.
//   2. Thumbnails also use SlideCard (small scale) for pixel-perfect previews.
//   3. Full export suite: PPTX, PDF, and HTML all work fully offline.
//   4. Theme tokens derived from the presentation's theme (not hardcoded dark).
// ─────────────────────────────────────────────────────────────────────────────

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
  PanResponder,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Real slide renderer — identical to online presentation viewer
import { SlideCard } from '../research/SlideCard';

// Export functions — all work offline (PPTX: pptxgenjs pure JS,
// PDF: expo-print renders HTML locally, HTML: string write)
import {
  getThemeTokens,
  generatePPTX,
  exportAsSlidePDF,
  exportAsHTMLSlides,
} from '../../services/pptxExport';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { GeneratedPresentation, PresentationSlide, PresentationThemeTokens } from '../../types';
import type { CacheEntry } from '../../types/cache';

// ─── Layout dimensions ────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

// Main slide: full width minus horizontal padding
const SLIDE_W     = SCREEN_W - SPACING.lg * 2;
const SLIDE_SCALE = SLIDE_W / 320;          // SlideCard base width = 320
const SLIDE_H     = Math.round(180 * SLIDE_SCALE);

// Thumbnails
const THUMB_W     = 96;
const THUMB_SCALE = THUMB_W / 320;
const THUMB_H     = Math.round(180 * THUMB_SCALE);

// ─── Layout badge labels ──────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<string, string> = {
  title:       'Title',
  agenda:      'Agenda',
  section:     'Section',
  content:     'Content',
  bullets:     'Key Points',
  stats:       'Statistics',
  quote:       'Pull Quote',
  chart_ref:   'Chart',
  predictions: 'Predictions',
  references:  'References',
  closing:     'Closing',
};

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function SlideThumbnail({
  slide,
  tokens,
  fontFamily,
  isActive,
  index,
  onPress,
}: {
  slide:      PresentationSlide;
  tokens:     PresentationThemeTokens;
  fontFamily?: string;
  isActive:   boolean;
  index:      number;
  onPress:    () => void;
}) {
  const ac = slide.accentColor ?? tokens.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginRight:   8,
        borderRadius:  6,
        overflow:      'hidden',
        borderWidth:   isActive ? 2 : 1,
        borderColor:   isActive ? ac : COLORS.border,
      }}
    >
      {/* SlideCard at thumbnail scale */}
      <View style={{ width: THUMB_W, height: THUMB_H, overflow: 'hidden' }}>
        <SlideCard
          slide={slide}
          tokens={tokens}
          scale={THUMB_SCALE}
          fontFamily={fontFamily}
        />
      </View>
      {/* Slide number label */}
      <View style={{
        backgroundColor: isActive ? `${ac}22` : COLORS.backgroundElevated,
        paddingVertical: 3,
        paddingHorizontal: 4,
      }}>
        <Text style={{
          color:      isActive ? ac : COLORS.textMuted,
          fontSize:   9,
          fontWeight: isActive ? '700' : '400',
          textAlign:  'center',
        }}>
          {slide.slideNumber ?? index + 1}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Export format type ───────────────────────────────────────────────────────

type ExportFormat = 'pptx' | 'pdf' | 'html';

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflinePresentationViewerProps {
  presentation: GeneratedPresentation;
  entry:        CacheEntry;
  onClose:      () => void;
  onExport:     () => void;   // kept for OfflineScreen compatibility (PDF fallback)
  exporting:    boolean;
}

export function OfflinePresentationViewer({
  presentation,
  entry,
  onClose,
}: OfflinePresentationViewerProps) {
  const insets   = useSafeAreaInsets();
  const thumbRef = useRef<FlatList>(null);

  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [showNotes,     setShowNotes]      = useState(false);
  const [exportingFmt,  setExportingFmt]   = useState<ExportFormat | null>(null);

  // Derive theme tokens from the presentation's theme
  const tokens: PresentationThemeTokens =
    presentation.themeTokens ?? getThemeTokens(presentation.theme ?? 'dark');

  const fontFamily = (presentation as any).fontFamily as string | undefined;

  const slide = presentation.slides[currentIndex];
  const total = presentation.totalSlides ?? presentation.slides.length;

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, total - 1));
    setCurrentIndex(clamped);
    try {
      thumbRef.current?.scrollToIndex({ index: clamped, animated: true, viewPosition: 0.5 });
    } catch (_) {}
  }, [total]);

  // Swipe left/right to navigate
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 12 && Math.abs(g.dy) < 50,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -50) goTo(currentIndex + 1);
      else if (g.dx > 50) goTo(currentIndex - 1);
    },
  })).current;

  // ── Export handlers ──────────────────────────────────────────────────────

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (exportingFmt) return;
    setExportingFmt(format);
    try {
      switch (format) {
        case 'pptx': await generatePPTX(presentation);     break;
        case 'pdf':  await exportAsSlidePDF(presentation);  break;
        case 'html': await exportAsHTMLSlides(presentation); break;
      }
    } catch (err) {
      // PPTX failed → graceful PDF fallback
      if (format === 'pptx') {
        try {
          await exportAsSlidePDF(presentation);
        } catch (fallbackErr) {
          Alert.alert(
            'Export Failed',
            `Could not export presentation.\n\n${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      } else {
        Alert.alert(
          'Export Failed',
          err instanceof Error ? err.message : 'Unknown error',
        );
      }
    } finally {
      setExportingFmt(null);
    }
  }, [presentation, exportingFmt]);

  if (!slide) return null;

  const noteText = slide.speakerNotes || 'No speaker notes for this slide.';
  const ac       = slide.accentColor ?? tokens.primary;

  return (
    <View style={{ flex: 1, backgroundColor: '#04040E' }}>

      {/* ── HEADER ── */}
      <View style={{
        paddingTop:         insets.top + SPACING.sm,
        paddingHorizontal:  SPACING.lg,
        paddingBottom:      SPACING.sm,
        borderBottomWidth:  1,
        borderBottomColor:  COLORS.border,
        flexDirection:      'row',
        alignItems:         'center',
        gap:                10,
        backgroundColor:    'rgba(5,5,20,0.97)',
      }}>
        {/* Back */}
        <TouchableOpacity
          onPress={onClose}
          style={{
            width:           36,
            height:          36,
            borderRadius:    10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     COLORS.border,
            flexShrink:      0,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Title + badges */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}
          >
            {presentation.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {total} slides · {presentation.theme ?? 'dark'} theme
            </Text>
          </View>
        </View>

        {/* Speaker Notes toggle */}
        <TouchableOpacity
          onPress={() => setShowNotes(v => !v)}
          style={{
            width:           34,
            height:          34,
            borderRadius:    10,
            backgroundColor: showNotes ? `${COLORS.primary}22` : COLORS.backgroundElevated,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     showNotes ? `${COLORS.primary}50` : COLORS.border,
          }}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={showNotes ? COLORS.primary : COLORS.textMuted}
          />
        </TouchableOpacity>

        {/* PPTX export */}
        <TouchableOpacity
          onPress={() => handleExport('pptx')}
          disabled={!!exportingFmt}
          style={{
            width:           34,
            height:          34,
            borderRadius:    10,
            backgroundColor: `${COLORS.primary}18`,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     `${COLORS.primary}35`,
            opacity:         exportingFmt && exportingFmt !== 'pptx' ? 0.4 : 1,
          }}
        >
          {exportingFmt === 'pptx'
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="desktop-outline" size={16} color={COLORS.primary} />}
        </TouchableOpacity>

        {/* PDF export */}
        <TouchableOpacity
          onPress={() => handleExport('pdf')}
          disabled={!!exportingFmt}
          style={{
            width:           34,
            height:          34,
            borderRadius:    10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     COLORS.border,
            opacity:         exportingFmt && exportingFmt !== 'pdf' ? 0.4 : 1,
          }}
        >
          {exportingFmt === 'pdf'
            ? <ActivityIndicator size="small" color={COLORS.textSecondary} />
            : <Ionicons name="document-outline" size={16} color={COLORS.textSecondary} />}
        </TouchableOpacity>

        {/* HTML export */}
        <TouchableOpacity
          onPress={() => handleExport('html')}
          disabled={!!exportingFmt}
          style={{
            width:           34,
            height:          34,
            borderRadius:    10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     COLORS.border,
            opacity:         exportingFmt && exportingFmt !== 'html' ? 0.4 : 1,
          }}
        >
          {exportingFmt === 'html'
            ? <ActivityIndicator size="small" color={COLORS.textSecondary} />
            : <Ionicons name="globe-outline" size={16} color={COLORS.textSecondary} />}
        </TouchableOpacity>
      </View>

      {/* ── PROGRESS BAR ── */}
      <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <View style={{
          width:           `${((currentIndex + 1) / total) * 100}%` as any,
          height:          '100%',
          backgroundColor: ac,
          borderRadius:    1,
        }} />
      </View>

      {/* ── MAIN SLIDE ── */}
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}
        {...panResponder.panHandlers}
      >
        <View style={{
          width:        SLIDE_W,
          height:       SLIDE_H,
          borderRadius: 10,
          overflow:     'hidden',
          ...SHADOWS.large,
          borderWidth:  1,
          borderColor:  'rgba(255,255,255,0.07)',
        }}>
          {/* Real SlideCard — renders with all editor data, overlays, themes */}
          <SlideCard
            slide={slide}
            tokens={tokens}
            scale={SLIDE_SCALE}
            fontFamily={fontFamily}
            noTruncate
          />
        </View>

        {/* Layout badge overlay */}
        <View style={{
          position:        'absolute',
          bottom:          SPACING.md + 8,
          right:           SPACING.lg + 8,
          backgroundColor: `${ac}22`,
          borderRadius:    RADIUS.full,
          paddingHorizontal: 10,
          paddingVertical:   3,
          borderWidth:     1,
          borderColor:     `${ac}40`,
        }}>
          <Text style={{ color: ac, fontSize: 9, fontWeight: '700' }}>
            {LAYOUT_LABELS[slide.layout] ?? slide.layout}
          </Text>
        </View>
      </View>

      {/* ── SPEAKER NOTES ── */}
      {showNotes && (
        <View style={{
          backgroundColor: 'rgba(8,8,24,0.97)',
          borderTopWidth:  1,
          borderTopColor:  COLORS.border,
          maxHeight:       110,
          paddingHorizontal: SPACING.lg,
          paddingVertical:   SPACING.sm,
        }}>
          <Text style={{
            color:         COLORS.primary,
            fontSize:      10,
            fontWeight:    '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom:  4,
          }}>
            🎙 Speaker Notes
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
              {noteText}
            </Text>
          </ScrollView>
        </View>
      )}

      {/* ── THUMBNAIL STRIP ── */}
      <View style={{
        backgroundColor: 'rgba(5,5,20,0.96)',
        borderTopWidth:  1,
        borderTopColor:  COLORS.border,
        paddingVertical: SPACING.sm,
      }}>
        <FlatList
          ref={thumbRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
          data={presentation.slides}
          keyExtractor={(s, i) => s.id ?? String(i)}
          getItemLayout={(_, index) => ({
            length: THUMB_W + 8,
            offset: (THUMB_W + 8) * index,
            index,
          })}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <SlideThumbnail
              slide={item}
              tokens={tokens}
              fontFamily={fontFamily}
              isActive={index === currentIndex}
              index={index}
              onPress={() => goTo(index)}
            />
          )}
        />
      </View>

      {/* ── BOTTOM NAVIGATION ── */}
      <View style={{
        flexDirection:    'row',
        alignItems:       'center',
        justifyContent:   'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical:  SPACING.sm,
        paddingBottom:    insets.bottom + SPACING.sm,
        backgroundColor:  'rgba(5,5,20,0.97)',
        borderTopWidth:   1,
        borderTopColor:   COLORS.border,
      }}>
        {/* Prev */}
        <TouchableOpacity
          onPress={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             6,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius:    RADIUS.lg,
            backgroundColor: COLORS.backgroundElevated,
            borderWidth:     1,
            borderColor:     COLORS.border,
            opacity:         currentIndex === 0 ? 0.3 : 1,
          }}
        >
          <Ionicons name="arrow-back" size={14} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            Prev
          </Text>
        </TouchableOpacity>

        {/* Slide counter */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{
            color:            ac,
            fontSize:         FONTS.sizes.sm,
            fontWeight:       '800',
            backgroundColor:  `${ac}1A`,
            borderRadius:     8,
            paddingHorizontal: 14,
            paddingVertical:  6,
            borderWidth:      1,
            borderColor:      `${ac}35`,
          }}>
            {currentIndex + 1} / {total}
          </Text>
        </View>

        {/* Next */}
        <TouchableOpacity
          onPress={() => goTo(currentIndex + 1)}
          disabled={currentIndex === total - 1}
          style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             6,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius:    RADIUS.lg,
            backgroundColor: COLORS.backgroundElevated,
            borderWidth:     1,
            borderColor:     COLORS.border,
            opacity:         currentIndex === total - 1 ? 0.3 : 1,
          }}
        >
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            Next
          </Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

    </View>
  );
}