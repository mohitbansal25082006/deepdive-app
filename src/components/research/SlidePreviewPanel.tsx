// src/components/research/SlidePreviewPanel.tsx
// Part 5 — Full slide deck browser:
//   • Horizontal full-width carousel (one slide at a time, swipe-nav)
//   • Thumbnail strip below with tap-to-jump
//   • Slide counter + layout label
//   • Speaker notes toggle
//
// ─── FIXES APPLIED ────────────────────────────────────────────────────────────
//
//  FIX 1 — All TouchableOpacity → Pressable
//    TouchableOpacity uses the JS responder system. Reanimated's Animated.View
//    intercepts that responder chain and swallows press events silently.
//    Pressable uses the native touch path and is immune.
//    Ref: github.com/software-mansion/react-native-reanimated/issues/6070
//
//  FIX 2 — Removed `entering=` from Animated.View wrappers containing buttons
//    After an entering animation completes, Reanimated leaves a ghost layout
//    layer that permanently absorbs pointer events. All three interactive bars
//    (header, navigation row, thumbnail strip) were wrapped in Animated.View
//    with entering=, making every button inside permanently unreachable after
//    the animation finished. Fixed by using plain View for all bars that
//    contain interactive children.
//    Ref: github.com/software-mansion/react-native-reanimated/issues/3388
//
//  FIX 3 — FlatList wrapped in Animated.View entering=
//    The main carousel FlatList was wrapped in Animated.View entering=.
//    The ghost layer was absorbing horizontal swipe gestures, disabling the
//    carousel scroll entirely after the animation. Moved to plain View.
//
//  SAFE: Animated.View entering= is still used on the slide counter label and
//  speaker notes panel — both are pure display content with no interactive
//  children, so the ghost layer cannot block any touches.
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

const THUMB_W     = 90;
const THUMB_H     = Math.round(THUMB_W * (9 / 16));
const THUMB_SCALE = THUMB_W / 320;

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
  const thumbRef = useRef<ScrollView>(null);

  const activeSlide = slides[activeIdx];
  const accentColor = activeSlide?.accentColor ?? tokens.primary;

  // ── Carousel viewability tracking ─────────────────────────────────────────

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const newIdx = viewableItems[0].index ?? 0;
        setActiveIdx(newIdx);
        thumbRef.current?.scrollTo({
          x: Math.max(0, newIdx * (THUMB_W + 8) - SCREEN_W / 2 + THUMB_W / 2),
          animated: true,
        });
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

      {/*
        ── Header bar ──
        FIX 2: Plain View — was Animated.View entering={FadeIn.duration(350)}.
        The ghost layer was blocking onClose Pressable and Notes toggle.
        FIX 1: All TouchableOpacity → Pressable.
      */}
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
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
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

        {/* Notes toggle — FIX 1: Pressable */}
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

      {/*
        ── Slide counter + layout label ──
        SAFE: Pure display content, no interactive children.
        Animated.View entering= is fine here.
      */}
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

      {/*
        ── Main carousel ──
        FIX 3: Plain View — was Animated.View entering={FadeInDown.duration(400).delay(80)}.
        The ghost layer was absorbing horizontal swipe gestures, disabling carousel
        scroll entirely after the entrance animation finished.
      */}
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

      {/*
        ── Speaker notes ──
        SAFE: Pure display content, no interactive children.
        Animated.View entering= is fine here.
      */}
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

      {/*
        ── Navigation row ──
        FIX 2: Plain View — was Animated.View entering={FadeInDown.duration(300).delay(100)}.
        The ghost layer made prev/next Pressables and all dot/First/Last buttons unreachable.
        FIX 1: All TouchableOpacity → Pressable.
      */}
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

        {/* Progress dots — show up to 9 before switching to fraction */}
        {slides.length <= 9 ? (
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {slides.map((_, i) => (
              // FIX 1: Pressable
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
            {/* FIX 1: Pressable */}
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

            {/* FIX 1: Pressable */}
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
        FIX 2: Plain View — was Animated.View entering={FadeInDown.duration(350).delay(120)}.
        The ghost layer was blocking all thumbnail Pressables after the animation.
        FIX 1: All TouchableOpacity inside → Pressable.
      */}
      <View
        style={{
          borderTopWidth: 1, borderTopColor: COLORS.border,
          paddingVertical: SPACING.sm,
          backgroundColor: COLORS.backgroundCard,
        }}
      >
        <ScrollView
          ref={thumbRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}
        >
          {slides.map((slide, i) => (
            // FIX 1: Pressable — thumb was TouchableOpacity, ghost layer ate its taps
            <Pressable
              key={slide.id}
              onPress={() => goTo(i)}
            >
              <View style={{
                borderRadius: 6,
                borderWidth: 2,
                borderColor: i === activeIdx ? accentColor : 'transparent',
                overflow: 'hidden',
                shadowColor: i === activeIdx ? accentColor : '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: i === activeIdx ? 0.4 : 0.1,
                shadowRadius: 6,
                elevation: i === activeIdx ? 6 : 2,
              }}>
                <SlideCard
                  slide={slide}
                  tokens={tokens}
                  scale={THUMB_SCALE}
                />
              </View>
              <Text style={{
                color: i === activeIdx ? accentColor : COLORS.textMuted,
                fontSize: 9, textAlign: 'center', marginTop: 3, fontWeight: '600',
              }}>
                {i + 1}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

    </View>
  );
}