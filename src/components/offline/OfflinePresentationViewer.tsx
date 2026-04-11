// src/components/offline/OfflinePresentationViewer.tsx
// Part 41.7 — Full offline export: local asset resolution before capture.
//
// CHANGES from the earlier Part 41.7 rewrite (bottom export bar):
//   1. resolveLocalAssets() called at mount time (async, non-blocking) to load
//      the asset manifest and patch all slide block URLs to local file:// paths.
//   2. captureAllSlides() uses the patched `resolvedPresentation` (not the raw
//      `presentation` prop) so SlideExportRenderer renders local images/SVGs.
//   3. A thin "Resolving assets…" indicator shown briefly while manifest loads.
//   4. All layout, design, header, thumbnail strip, export bar, nav, notes
//      remain IDENTICAL to the earlier Part 41.7 rewrite.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  PanResponder,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlideCard } from '../research/SlideCard';

import {
  SlideExportRenderer,
  type SlideExportRendererRef,
} from '../research/SlideExportRenderer';

import {
  generatePPTXFromImages,
  exportAsSlidePDFFromImages,
  exportAsHTMLSlidesFromImages,
} from '../../services/slideCaptureExport';

import {
  getThemeTokens,
  generatePPTX,
  exportAsSlidePDF,
  exportAsHTMLSlides,
} from '../../services/pptxExport';

// Part 41.7: local asset resolution
import { resolveLocalAssets } from '../../lib/presentationAssetCache';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { GeneratedPresentation, PresentationSlide, PresentationThemeTokens } from '../../types';
import type { CacheEntry } from '../../types/cache';

// ─── Layout dimensions ────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDE_W     = SCREEN_W - SPACING.lg * 2;
const SLIDE_SCALE = SLIDE_W / 320;
const SLIDE_H     = Math.round(180 * SLIDE_SCALE);

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
  slide:       PresentationSlide;
  tokens:      PresentationThemeTokens;
  fontFamily?: string;
  isActive:    boolean;
  index:       number;
  onPress:     () => void;
}) {
  const ac = slide.accentColor ?? tokens.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginRight:  8,
        borderRadius: 6,
        overflow:     'hidden',
        borderWidth:  isActive ? 2 : 1,
        borderColor:  isActive ? ac : COLORS.border,
      }}
    >
      <View style={{ width: THUMB_W, height: THUMB_H, overflow: 'hidden' }}>
        <SlideCard
          slide={slide}
          tokens={tokens}
          scale={THUMB_SCALE}
          fontFamily={fontFamily}
        />
      </View>
      <View style={{
        backgroundColor:   isActive ? `${ac}22` : COLORS.backgroundElevated,
        paddingVertical:   3,
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
  onExport:     () => void;
  exporting:    boolean;
}

export function OfflinePresentationViewer({
  presentation,
  entry,
  onClose,
}: OfflinePresentationViewerProps) {
  const insets   = useSafeAreaInsets();
  const thumbRef = useRef<FlatList>(null);

  const [currentIndex,      setCurrentIndex]     = useState(0);
  const [showNotes,         setShowNotes]         = useState(false);
  const [exportingFmt,      setExportingFmt]      = useState<ExportFormat | null>(null);
  const [captureProgress,   setCaptureProgress]   = useState<{ done: number; total: number } | null>(null);

  // Part 41.7: resolved presentation with local file paths patched in
  const [resolvedPresentation, setResolvedPresentation] = useState<GeneratedPresentation>(presentation);
  const [assetsReady,          setAssetsReady]           = useState(false);

  // Off-screen renderer for screenshot-based export
  const rendererRef = useRef<SlideExportRendererRef>(null);

  // Resolve local assets on mount (async, non-blocking for the viewer)
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const patched = await resolveLocalAssets(presentation);
        if (!cancelled) {
          setResolvedPresentation(patched);
        }
      } catch (err) {
        console.warn('[OfflinePresentationViewer] resolveLocalAssets error:', err);
      } finally {
        if (!cancelled) setAssetsReady(true);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [presentation.id]);

  // Derive theme tokens
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

  // ── Part 41.7: Screenshot-based export using resolved (local) presentation ─

  const captureAllSlides = useCallback(async (): Promise<(string | null)[]> => {
    const renderer = rendererRef.current;
    if (!renderer) {
      console.warn('[OfflinePresentationViewer] renderer not mounted — vector fallback');
      return new Array(resolvedPresentation.slides.length).fill(null);
    }
    setCaptureProgress({ done: 0, total: resolvedPresentation.slides.length });
    const images = await renderer.captureAll();
    setCaptureProgress(null);
    return images;
  }, [resolvedPresentation.slides.length]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (exportingFmt) return;
    setExportingFmt(format);

    try {
      // Use resolvedPresentation so local file paths are in the blocks
      const images    = await captureAllSlides();
      const allFailed = images.every(i => i === null);

      if (allFailed) {
        // Vector fallback also uses resolvedPresentation (local images for pptxExport)
        switch (format) {
          case 'pptx':
            try {
              await generatePPTX(resolvedPresentation);
            } catch {
              await exportAsSlidePDF(resolvedPresentation);
              Alert.alert('Note', 'PPTX export fell back to PDF.');
            }
            break;
          case 'pdf':  await exportAsSlidePDF(resolvedPresentation);   break;
          case 'html': await exportAsHTMLSlides(resolvedPresentation); break;
        }
      } else {
        switch (format) {
          case 'pptx': await generatePPTXFromImages(images, resolvedPresentation);       break;
          case 'pdf':  await exportAsSlidePDFFromImages(images, resolvedPresentation);   break;
          case 'html': await exportAsHTMLSlidesFromImages(images, resolvedPresentation); break;
        }
      }
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setExportingFmt(null);
      setCaptureProgress(null);
    }
  }, [resolvedPresentation, exportingFmt, captureAllSlides]);

  // ── Button label helpers ──────────────────────────────────────────────────

  function exportLabel(format: ExportFormat, defaultLabel: string): string {
    if (!exportingFmt || exportingFmt !== format) return defaultLabel;
    if (captureProgress) {
      return `Capturing ${captureProgress.done}/${captureProgress.total}…`;
    }
    return 'Exporting…';
  }

  if (!slide) return null;

  const noteText = slide.speakerNotes || 'No speaker notes for this slide.';
  const ac       = slide.accentColor ?? tokens.primary;

  return (
    <View style={{ flex: 1, backgroundColor: '#04040E' }}>

      {/*
        Off-screen renderer — uses resolvedPresentation so local images/SVGs
        are rendered instead of remote URLs when capturing for export.
      */}
      <SlideExportRenderer
        ref={rendererRef}
        presentation={resolvedPresentation}
        onProgress={(done, total) => setCaptureProgress({ done, total })}
      />

      {/* ── HEADER — Back + title/badges + Notes toggle only ── */}
      <View style={{
        paddingTop:        insets.top + SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingBottom:     SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        flexDirection:     'row',
        alignItems:        'center',
        gap:               10,
        backgroundColor:   'rgba(5,5,20,0.97)',
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
            <View style={{
              backgroundColor:   `${COLORS.info}20`,
              borderRadius:      RADIUS.sm,
              paddingHorizontal: 6,
              paddingVertical:   1,
            }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            {/* Asset ready indicator */}
            {assetsReady && (
              <View style={{
                backgroundColor:   `${COLORS.success}18`,
                borderRadius:      RADIUS.sm,
                paddingHorizontal: 6,
                paddingVertical:   1,
              }}>
                <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>
                  EXPORT READY
                </Text>
              </View>
            )}
            {!assetsReady && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ActivityIndicator size="small" color={COLORS.textMuted} style={{ transform: [{ scale: 0.6 }] }} />
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>Resolving assets…</Text>
              </View>
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {total} slides
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
        style={{
          flex:              1,
          alignItems:        'center',
          justifyContent:    'center',
          paddingHorizontal: SPACING.lg,
          paddingVertical:   SPACING.md,
        }}
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
          position:          'absolute',
          bottom:            SPACING.md + 8,
          right:             SPACING.lg + 8,
          backgroundColor:   `${ac}22`,
          borderRadius:      RADIUS.full,
          paddingHorizontal: 10,
          paddingVertical:   3,
          borderWidth:       1,
          borderColor:       `${ac}40`,
        }}>
          <Text style={{ color: ac, fontSize: 9, fontWeight: '700' }}>
            {LAYOUT_LABELS[slide.layout] ?? slide.layout}
          </Text>
        </View>
      </View>

      {/* ── SPEAKER NOTES ── */}
      {showNotes && (
        <View style={{
          backgroundColor:   'rgba(8,8,24,0.97)',
          borderTopWidth:    1,
          borderTopColor:    COLORS.border,
          maxHeight:         110,
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

      {/* ── EXPORT BAR — matches online slide-preview.tsx layout ── */}
      <View style={{
        paddingHorizontal: SPACING.lg,
        paddingTop:        SPACING.sm,
        paddingBottom:     SPACING.sm,
        backgroundColor:   'rgba(5,5,20,0.97)',
        borderTopWidth:    1,
        borderTopColor:    COLORS.border,
        gap:               SPACING.sm,
      }}>
        {/* Primary export row: PPTX (gradient) + PDF */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>

          {/* PPTX */}
          <Pressable
            onPress={() => handleExport('pptx')}
            disabled={!!exportingFmt}
            style={{
              flex:    1.6,
              opacity: exportingFmt && exportingFmt !== 'pptx' ? 0.5 : 1,
            }}
          >
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius:    RADIUS.lg,
                paddingVertical: 13,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             8,
                ...SHADOWS.medium,
              }}
            >
              {exportingFmt === 'pptx' ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="desktop-outline" size={17} color="#FFF" />
              )}
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                {exportLabel('pptx', 'Export PPTX')}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* PDF */}
          <Pressable
            onPress={() => handleExport('pdf')}
            disabled={!!exportingFmt}
            style={{
              flex:    1,
              opacity: exportingFmt && exportingFmt !== 'pdf' ? 0.5 : 1,
            }}
          >
            <View style={{
              borderRadius:    RADIUS.lg,
              paddingVertical: 13,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             7,
              backgroundColor: COLORS.backgroundElevated,
              borderWidth:     1.5,
              borderColor:     COLORS.border,
            }}>
              {exportingFmt === 'pdf' ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : (
                <Ionicons name="document-outline" size={17} color={COLORS.textSecondary} />
              )}
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                {exportLabel('pdf', 'PDF')}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Secondary row: HTML + Prev + counter + Next */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>

          {/* HTML */}
          <Pressable
            onPress={() => handleExport('html')}
            disabled={!!exportingFmt}
            style={[
              {
                flex:            1,
                paddingVertical: 10,
                borderRadius:    RADIUS.lg,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             7,
                backgroundColor: COLORS.backgroundElevated,
                borderWidth:     1,
                borderColor:     COLORS.border,
              },
              exportingFmt && exportingFmt !== 'html' ? { opacity: 0.5 } : {},
            ]}
          >
            {exportingFmt === 'html' ? (
              <ActivityIndicator size="small" color={COLORS.textMuted} />
            ) : (
              <Ionicons name="globe-outline" size={15} color={COLORS.textMuted} />
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {exportLabel('html', 'HTML')}
            </Text>
          </Pressable>

          {/* Prev */}
          <TouchableOpacity
            onPress={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            style={{
              flex:            1,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             6,
              paddingVertical: 10,
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

          {/* Counter */}
          <View style={{
            alignItems:        'center',
            justifyContent:    'center',
            paddingHorizontal: 12,
            borderRadius:      RADIUS.lg,
            backgroundColor:   `${ac}1A`,
            borderWidth:       1,
            borderColor:       `${ac}35`,
            minWidth:          56,
          }}>
            <Text style={{ color: ac, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              {currentIndex + 1}/{total}
            </Text>
          </View>

          {/* Next */}
          <TouchableOpacity
            onPress={() => goTo(currentIndex + 1)}
            disabled={currentIndex === total - 1}
            style={{
              flex:            1,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             6,
              paddingVertical: 10,
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

        {/* Quality note + safe area padding */}
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          gap:            5,
          justifyContent: 'center',
          paddingBottom:  insets.bottom,
        }}>
          <Ionicons name="camera-outline" size={11} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {assetsReady
              ? 'Exports capture slides exactly as shown · Offline mode'
              : 'Resolving local assets for export…'}
          </Text>
        </View>
      </View>

    </View>
  );
}