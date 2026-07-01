// src/components/research/SlidePreviewPanel.tsx
// Part 58.5 — Use liveMirror={true}, showActions={false}, thumbScale={0.42}
//   • Thumbnails render at full scale with transform scale
//   • Exactly matches the main slides content, layout, and styling
//   • No add/delete/copy buttons (view-only)
//   • Larger thumbnails (0.42 scale, ~134px wide) for better visibility
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView,
  FlatList, Dimensions,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SlideCard } from './SlideCard';
import { SlideThumbnailStrip } from '../editor/SlideThumbnailStrip';
import { GeneratedPresentation, PresentationSlide } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlidePreviewPanelProps {
  presentation: GeneratedPresentation;
  onClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W     = Dimensions.get('window').width;
const MAIN_SLIDE_W = SCREEN_W - SPACING.lg * 2;
const MAIN_SLIDE_H = Math.round(MAIN_SLIDE_W * (9 / 16));
const MAIN_SCALE   = MAIN_SLIDE_W / 320;

const LAYOUT_LABELS: Record<string, string> = {
  title:       'Title Slide',
  agenda:      'Agenda',
  section:     'Section Break',
  content:     'Content',
  bullets:     'Key Points',
  stats:       'Statistics',
  quote:       'Pull Quote',
  chart_ref:   'Chart & Analysis',
  predictions: 'Future Outlook',
  references:  'References',
  closing:     'Closing',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SlidePreviewPanel({ presentation, onClose }: SlidePreviewPanelProps) {
  const { slides, themeTokens: tokens, theme } = presentation;

  const [activeIdx, setActiveIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const mainRef  = useRef<FlatList>(null);

  const activeSlide = slides[activeIdx];
  const accentColor = activeSlide?.accentColor ?? tokens.primary;

  // ── Carousel viewability tracking ─────────────────────────────────────────

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const newIdx = viewableItems[0].index ?? 0;
        setActiveIdx(newIdx);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 }).current;

  // ── Navigation ────────────────────────────────────────────────────────────

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, slides.length - 1));
    mainRef.current?.scrollToIndex({ index: clamped, animated: true });
    setActiveIdx(clamped);
  }, [slides.length]);

  const goPrev = useCallback(() => goTo(activeIdx - 1), [goTo, activeIdx]);
  const goNext = useCallback(() => goTo(activeIdx + 1), [goTo, activeIdx]);

  // ── Main slide renderer ───────────────────────────────────────────────────

  const renderMainSlide = useCallback(({ item }: { item: PresentationSlide }) => (
    <View style={{ width: SCREEN_W, alignItems: 'center', paddingHorizontal: SPACING.lg }}>
      <View style={{
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 12,
      }}>
        <SlideCard
          slide={item}
          tokens={tokens}
          scale={MAIN_SCALE}
          showNotes={false}
        />
      </View>
    </View>
  ), [tokens, accentColor]);

  const keyExtractor = useCallback((item: PresentationSlide) => item.id, []);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Header bar ── */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
          gap: SPACING.sm,
        }}
      >
        {onClose && (
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </Pressable>
        )}

        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
            {presentation.title}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {slides.length} slides · {theme} theme
          </Text>
        </View>

        <Pressable
          onPress={() => setShowNotes(n => !n)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: showNotes ? `${COLORS.primary}22` : COLORS.backgroundElevated,
            borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5,
            borderWidth: 1, borderColor: showNotes ? `${COLORS.primary}44` : COLORS.border,
          }}
        >
          <Ionicons
            name={showNotes ? 'reader' : 'reader-outline'}
            size={14}
            color={showNotes ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={{ color: showNotes ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
            Notes
          </Text>
        </Pressable>
      </View>

      {/* ── Slide counter + layout label ── */}
      <Animated.View
        entering={FadeInDown.duration(300).delay(60)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: SPACING.lg, paddingVertical: 8,
        }}
      >
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: `${accentColor}18`,
          borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
          borderWidth: 1, borderColor: `${accentColor}35`,
        }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
          <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            {LAYOUT_LABELS[activeSlide?.layout] ?? 'Slide'}
          </Text>
        </View>

        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
          {activeIdx + 1} / {slides.length}
        </Text>
      </Animated.View>

      {/* ── Main carousel ── */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={mainRef}
          data={slides}
          renderItem={renderMainSlide}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          getItemLayout={(_, index) => ({
            length: SCREEN_W, offset: SCREEN_W * index, index,
          })}
          contentContainerStyle={{ alignItems: 'center' }}
        />
      </View>

      {/* ── Speaker notes ── */}
      {showNotes && activeSlide?.speakerNotes && (
        <Animated.View
          entering={FadeInDown.duration(260)}
          style={{
            marginHorizontal: SPACING.lg,
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg, padding: SPACING.md,
            borderWidth: 1, borderColor: `${accentColor}30`,
            marginBottom: SPACING.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Ionicons name="reader-outline" size={14} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              SPEAKER NOTES
            </Text>
          </View>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 18 }}>
            {activeSlide.speakerNotes}
          </Text>
        </Animated.View>
      )}

      {/* ── Navigation row ── */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
        }}
      >
        <Pressable
          onPress={goPrev}
          disabled={activeIdx === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
            opacity: activeIdx === 0 ? 0.35 : 1,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
        </Pressable>

        {/* Progress dots */}
        {slides.length <= 9 ? (
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {slides.map((_, i) => (
              <Pressable key={i} onPress={() => goTo(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <View style={{
                  width: i === activeIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === activeIdx ? accentColor : COLORS.border,
                }} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => goTo(0)}
              style={{
                backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full,
                paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>First</Text>
            </Pressable>

            <View style={{
              backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full,
              paddingHorizontal: 14, paddingVertical: 4,
              borderWidth: 1, borderColor: `${accentColor}35`,
            }}>
              <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                {activeIdx + 1} / {slides.length}
              </Text>
            </View>

            <Pressable
              onPress={() => goTo(slides.length - 1)}
              style={{
                backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full,
                paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Last</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={goNext}
          disabled={activeIdx === slides.length - 1}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
            opacity: activeIdx === slides.length - 1 ? 0.35 : 1,
          }}
        >
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {/*
        ── Thumbnail strip ──
        Part 58.5: Use liveMirror={true}, showActions={false}, thumbScale={0.42}
        • Thumbnails match main slides exactly
        • No add/delete/copy buttons (view-only)
        • Larger thumbnails (~134px wide) for better visibility
      */}
      <View
        style={{
          borderTopWidth: 1, borderTopColor: COLORS.border,
          paddingVertical: SPACING.sm,
          backgroundColor: COLORS.backgroundCard,
        }}
      >
        <SlideThumbnailStrip
          slides={slides}
          activeIndex={activeIdx}
          tokens={tokens}
          accentColor={accentColor}
          onSelectSlide={goTo}
          liveMirror={true}
          showActions={false}
          thumbScale={0.42}
        />
      </View>

    </View>
  );
}