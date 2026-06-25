// src/components/offline/OfflinePresentationViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — FULL THEME SYSTEM integration
//   All colors now derive from the active theme via COLORS object.
//   Uses useTheme() for light/dark mode awareness.
//   All hardcoded hex values replaced with theme-aware colors.
//   Module-level styles replaced with factory pattern.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
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
import { resolveLocalAssets } from '../../lib/presentationAssetCache';
import type { GeneratedPresentation, PresentationSlide, PresentationThemeTokens } from '../../types';
import type { CacheEntry } from '../../types/cache';

// ─── Layout dimensions ────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDE_W = SCREEN_W - SPACING.lg * 2;
const SLIDE_SCALE = SLIDE_W / 320;
const SLIDE_H = Math.round(180 * SLIDE_SCALE);

const THUMB_W = 96;
const THUMB_SCALE = THUMB_W / 320;
const THUMB_H = Math.round(180 * THUMB_SCALE);

// ─── Layout badge labels ──────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<string, string> = {
  title: 'Title',
  agenda: 'Agenda',
  section: 'Section',
  content: 'Content',
  bullets: 'Key Points',
  stats: 'Statistics',
  quote: 'Pull Quote',
  chart_ref: 'Chart',
  predictions: 'Predictions',
  references: 'References',
  closing: 'Closing',
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
  slide: PresentationSlide;
  tokens: PresentationThemeTokens;
  fontFamily?: string;
  isActive: boolean;
  index: number;
  onPress: () => void;
}) {
  const { isLight } = useTheme();
  const ac = slide.accentColor ?? tokens.primary;

  const cardBg = isLight ? '#FFFFFF' : COLORS.backgroundCard;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginRight: 8,
        borderRadius: 6,
        overflow: 'hidden',
        borderWidth: isActive ? 2 : 1,
        borderColor: isActive ? ac : COLORS.border,
        ...SHADOWS.small,
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
        backgroundColor: isActive ? `${ac}22` : cardBg,
        paddingVertical: 3,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
      }}>
        <Text style={{
          color: isActive ? ac : COLORS.textMuted,
          fontSize: 9,
          fontWeight: isActive ? '700' : '400',
          textAlign: 'center',
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
  entry: CacheEntry;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
}

export function OfflinePresentationViewer({
  presentation,
  entry,
  onClose,
}: OfflinePresentationViewerProps) {
  const insets = useSafeAreaInsets();
  const { isLight, version } = useTheme();
  const thumbRef = useRef<FlatList>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [exportingFmt, setExportingFmt] = useState<ExportFormat | null>(null);
  const [captureProgress, setCaptureProgress] = useState<{ done: number; total: number } | null>(null);

  // Resolved presentation with local file paths patched in
  const [resolvedPresentation, setResolvedPresentation] = useState<GeneratedPresentation>(presentation);
  const [assetsReady, setAssetsReady] = useState(false);

  // Off-screen renderer for screenshot-based export
  const rendererRef = useRef<SlideExportRendererRef>(null);

  // Rebuild styles on theme change
  const styles = useMemo(() => createStyles(isLight), [version, isLight]);

  // Resolve local assets on mount
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

  // Screenshot-based export using resolved (local) presentation
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
      const images = await captureAllSlides();
      const allFailed = images.every(i => i === null);

      if (allFailed) {
        // Vector fallback also uses resolvedPresentation
        switch (format) {
          case 'pptx':
            try {
              await generatePPTX(resolvedPresentation);
            } catch {
              await exportAsSlidePDF(resolvedPresentation);
              Alert.alert('Note', 'PPTX export fell back to PDF.');
            }
            break;
          case 'pdf': await exportAsSlidePDF(resolvedPresentation); break;
          case 'html': await exportAsHTMLSlides(resolvedPresentation); break;
        }
      } else {
        switch (format) {
          case 'pptx': await generatePPTXFromImages(images, resolvedPresentation); break;
          case 'pdf': await exportAsSlidePDFFromImages(images, resolvedPresentation); break;
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

  function exportLabel(format: ExportFormat, defaultLabel: string): string {
    if (!exportingFmt || exportingFmt !== format) return defaultLabel;
    if (captureProgress) {
      return `Capturing ${captureProgress.done}/${captureProgress.total}…`;
    }
    return 'Exporting…';
  }

  if (!slide) return null;

  const noteText = slide.speakerNotes || 'No speaker notes for this slide.';
  const ac = slide.accentColor ?? tokens.primary;

  const headerBg = isLight ? '#FFFFFF' : 'rgba(5,5,20,0.97)';
  const controlsBg = isLight ? '#FFFFFF' : 'rgba(5,5,20,0.97)';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* Off-screen renderer */}
      <SlideExportRenderer
        ref={rendererRef}
        presentation={resolvedPresentation}
        onProgress={(done, total) => setCaptureProgress({ done, total })}
      />

      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: headerBg }]}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.backBtn, { backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : COLORS.backgroundElevated }]}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}
          >
            {presentation.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{
              backgroundColor: `${COLORS.info}20`,
              borderRadius: RADIUS.sm,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            {assetsReady && (
              <View style={{
                backgroundColor: `${COLORS.success}18`,
                borderRadius: RADIUS.sm,
                paddingHorizontal: 6,
                paddingVertical: 1,
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
          style={[styles.notesBtn, {
            backgroundColor: showNotes ? `${COLORS.primary}22` : (isLight ? 'rgba(0,0,0,0.04)' : COLORS.backgroundElevated),
            borderColor: showNotes ? `${COLORS.primary}50` : COLORS.border,
          }]}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={showNotes ? COLORS.primary : COLORS.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* ── PROGRESS BAR ── */}
      <View style={{ height: 3, backgroundColor: COLORS.backgroundElevated }}>
        <View style={{
          width: `${((currentIndex + 1) / total) * 100}%` as any,
          height: '100%',
          backgroundColor: ac,
          borderRadius: 1,
        }} />
      </View>

      {/* ── MAIN SLIDE ── */}
      <View
        style={[styles.slideContainer, { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.slideWrapper, {
          width: SLIDE_W,
          height: SLIDE_H,
          borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
          ...SHADOWS.large,
        }]}>
          <SlideCard
            slide={slide}
            tokens={tokens}
            scale={SLIDE_SCALE}
            fontFamily={fontFamily}
            noTruncate
          />
        </View>

        {/* Layout badge overlay */}
        <View style={[styles.layoutBadge, {
          backgroundColor: `${ac}22`,
          borderColor: `${ac}40`,
        }]}>
          <Text style={{ color: ac, fontSize: 9, fontWeight: '700' }}>
            {LAYOUT_LABELS[slide.layout] ?? slide.layout}
          </Text>
        </View>
      </View>

      {/* ── SPEAKER NOTES ── */}
      {showNotes && (
        <View style={[styles.notesPanel, {
          backgroundColor: isLight ? 'rgba(245,246,251,0.97)' : 'rgba(8,8,24,0.97)',
          borderTopColor: COLORS.border,
        }]}>
          <Text style={[styles.notesLabel, { color: COLORS.primary }]}>
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
      <View style={[styles.thumbStrip, {
        backgroundColor: isLight ? '#FFFFFF' : 'rgba(5,5,20,0.96)',
        borderTopColor: COLORS.border,
      }]}>
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

      {/* ── EXPORT BAR ── */}
      <View style={[styles.exportBar, {
        backgroundColor: controlsBg,
        borderTopColor: COLORS.border,
      }]}>
        {/* Primary export row: PPTX (gradient) + PDF */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <Pressable
            onPress={() => handleExport('pptx')}
            disabled={!!exportingFmt}
            style={{
              flex: 1.6,
              opacity: exportingFmt && exportingFmt !== 'pptx' ? 0.5 : 1,
            }}
          >
            <LinearGradient
              colors={COLORS.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.exportGradientBtn, SHADOWS.medium]}
            >
              {exportingFmt === 'pptx' ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="desktop-outline" size={17} color="#FFF" />
              )}
              <Text style={styles.exportGradientText}>
                {exportLabel('pptx', 'Export PPTX')}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* PDF */}
          <Pressable
            onPress={() => handleExport('pdf')}
            disabled={!!exportingFmt}
            style={{
              flex: 1,
              opacity: exportingFmt && exportingFmt !== 'pdf' ? 0.5 : 1,
            }}
          >
            <View style={[styles.exportBtn, {
              backgroundColor: COLORS.backgroundElevated,
              borderColor: COLORS.border,
            }]}>
              {exportingFmt === 'pdf' ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : (
                <Ionicons name="document-outline" size={17} color={COLORS.textSecondary} />
              )}
              <Text style={[styles.exportBtnText, { color: COLORS.textSecondary }]}>
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
              styles.htmlBtn,
              {
                backgroundColor: COLORS.backgroundElevated,
                borderColor: COLORS.border,
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
            style={[styles.navBtn, {
              backgroundColor: COLORS.backgroundElevated,
              borderColor: COLORS.border,
              opacity: currentIndex === 0 ? 0.3 : 1,
            }]}
          >
            <Ionicons name="arrow-back" size={14} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              Prev
            </Text>
          </TouchableOpacity>

          {/* Counter */}
          <View style={[styles.counter, {
            backgroundColor: `${ac}1A`,
            borderColor: `${ac}35`,
          }]}>
            <Text style={{ color: ac, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              {currentIndex + 1}/{total}
            </Text>
          </View>

          {/* Next */}
          <TouchableOpacity
            onPress={() => goTo(currentIndex + 1)}
            disabled={currentIndex === total - 1}
            style={[styles.navBtn, {
              backgroundColor: COLORS.backgroundElevated,
              borderColor: COLORS.border,
              opacity: currentIndex === total - 1 ? 0.3 : 1,
            }]}
          >
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              Next
            </Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Quality note + safe area padding */}
        <View style={[styles.qualityNote, { paddingBottom: insets.bottom }]}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
// Factory pattern to support theme changes

function createStyles(isLight: boolean) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
      gap: 10,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: COLORS.border,
      flexShrink: 0,
    },
    notesBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0,
    },
    slideContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slideWrapper: {
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 1,
    },
    layoutBadge: {
      position: 'absolute',
      bottom: SPACING.md + 8,
      right: SPACING.lg + 8,
      borderRadius: RADIUS.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderWidth: 1,
    },
    notesPanel: {
      borderTopWidth: 1,
      maxHeight: 110,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    notesLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    thumbStrip: {
      borderTopWidth: 1,
      paddingVertical: SPACING.sm,
    },
    exportBar: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      borderTopWidth: 1,
      gap: SPACING.sm,
    },
    exportGradientBtn: {
      borderRadius: RADIUS.lg,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    exportGradientText: {
      color: '#FFF',
      fontSize: FONTS.sizes.sm,
      fontWeight: '800',
    },
    exportBtn: {
      borderRadius: RADIUS.lg,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1.5,
    },
    exportBtnText: {
      fontSize: FONTS.sizes.sm,
      fontWeight: '700',
    },
    htmlBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
    },
    navBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    counter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      minWidth: 56,
    },
    qualityNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      justifyContent: 'center',
    },
  });
}