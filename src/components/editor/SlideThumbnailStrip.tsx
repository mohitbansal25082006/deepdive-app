// src/components/editor/SlideThumbnailStrip.tsx
// Part 58.5 — REDESIGNED: Live mirror rendering
//   • Thumbnails render at full scale with transform scale
//   • Exactly matches the main slides content, layout, and styling
//   • Added showActions prop to control add/delete/copy buttons visibility
//   • Added thumbScale prop to control thumbnail size
//   • Preview: showActions={false}, thumbScale={0.42} (larger, ~134px wide)
//   • Editor: showActions={true}, thumbScale={0.28} (compact, ~90px wide)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, Alert, TouchableOpacity,
  Dimensions, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SlideCard } from '../research/SlideCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { EditableSlide } from '../../types/editor';
import type { PresentationThemeTokens, SlideLayout } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideThumbnailStripProps {
  slides:           EditableSlide[];
  activeIndex:      number;
  tokens:           PresentationThemeTokens;
  fontFamily?:      string;
  accentColor?:     string;
  onSelectSlide:    (index: number) => void;
  onAddSlide?:      (afterIndex: number, layout?: SlideLayout) => void;
  onDeleteSlide?:   (index: number) => void;
  onReorderSlide?:  (from: number, to: number) => void;
  onDuplicateSlide?: (index: number) => void;
  /** Whether thumbnails should show full content (true = live mirror) */
  liveMirror?:      boolean;
  /** Whether to show add/delete/copy action buttons (preview=false, editor=true) */
  showActions?:     boolean;
  /** Thumbnail scale factor (0.28 = default compact, 0.42 = larger for preview) */
  thumbScale?:      number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_THUMB_SCALE = 0.28; // Compact size for editor
const PREVIEW_THUMB_SCALE = 0.42; // Larger size for preview (~134px wide)

// ─── Dynamic sizing based on scale ───────────────────────────────────────────

function getThumbDimensions(scale: number) {
  const width = 320 * scale;
  const height = 180 * scale;
  return { width, height, scale };
}

// ─── Add-slide button ─────────────────────────────────────────────────────────

const AddSlideBtn = React.memo(function AddSlideBtn({
  afterIndex,
  accentColor,
  thumbHeight,
  onAdd,
}: {
  afterIndex:  number;
  accentColor: string;
  thumbHeight: number;
  onAdd:       (after: number) => void;
}) {
  return (
    <Pressable
      onPress={() => onAdd(afterIndex)}
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      style={{
        width:          22,
        height:         thumbHeight + 12,
        alignItems:     'center',
        justifyContent: 'center',
        alignSelf:      'flex-start',
      }}
    >
      <View style={{
        width:           22,
        height:          22,
        borderRadius:    11,
        backgroundColor: `${accentColor}20`,
        borderWidth:     1.5,
        borderStyle:     'dashed',
        borderColor:     `${accentColor}60`,
        alignItems:      'center',
        justifyContent:  'center',
      }}>
        <Ionicons name="add" size={13} color={accentColor} />
      </View>
    </Pressable>
  );
});

// ─── Single Live-Mirror Thumbnail ────────────────────────────────────────────

const LiveThumbItem = React.memo(function LiveThumbItem({
  slide,
  index,
  isActive,
  tokens,
  fontFamily,
  accentColor,
  totalSlides,
  showActions,
  thumbWidth,
  thumbHeight,
  thumbScale,
  onPress,
  onDelete,
  onDuplicate,
}: {
  slide:        EditableSlide;
  index:        number;
  isActive:     boolean;
  tokens:       PresentationThemeTokens;
  fontFamily?:  string;
  accentColor:  string;
  totalSlides:  number;
  showActions:  boolean;
  thumbWidth:   number;
  thumbHeight:  number;
  thumbScale:   number;
  onPress:      (i: number) => void;
  onDelete?:    (i: number) => void;
  onDuplicate?: (i: number) => void;
}) {
  const canDelete = totalSlides > 1;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Slide',
      `Delete slide ${index + 1}? Use undo to restore it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(index) },
      ],
    );
  }, [index, onDelete]);

  const handleDuplicate = useCallback(() => {
    onDuplicate?.(index);
  }, [index, onDuplicate]);

  return (
    <View style={{ alignItems: 'center', width: thumbWidth + 6, paddingHorizontal: 2 }}>

      {/* Thumbnail press area — uses transform scale for live mirror */}
      <Pressable
        onPress={() => onPress(index)}
        onLongPress={showActions ? handleDuplicate : undefined}
        delayLongPress={600}
        style={[
          {
            borderRadius: 6,
            overflow: 'hidden',
            borderWidth: isActive ? 2.5 : 1.5,
            borderColor: isActive ? accentColor : COLORS.border,
            backgroundColor: tokens.background,
            shadowColor: isActive ? accentColor : '#000',
            shadowOffset: { width: 0, height: isActive ? 4 : 1 },
            shadowOpacity: isActive ? 0.4 : 0.12,
            shadowRadius: isActive ? 10 : 3,
            elevation: isActive ? 8 : 2,
          },
          isActive && styles.activeShadow,
        ]}
      >
        {/* 
          KEY: Render SlideCard at FULL SCALE (scale={1}) but use 
          transform scale to shrink the container. This preserves ALL 
          text wrapping, layout, and styling exactly as in the main slides.
        */}
        <View style={{
          width: 320,
          height: 180,
          transform: [{ scale: thumbScale }],
          transformOrigin: 'top left',
          marginBottom: -180 * (1 - thumbScale),
          marginRight: -320 * (1 - thumbScale),
        }}>
          <SlideCard
            slide={slide}
            tokens={tokens}
            scale={1}
            fontFamily={fontFamily}
            noTruncate={true}
          />
        </View>
      </Pressable>

      {/* Slide number + action row - actions only shown when showActions={true} */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 4,
        paddingHorizontal: 2,
      }}>
        {/* Duplicate button - only in editor */}
        {showActions && onDuplicate && (
          <TouchableOpacity
            onPress={handleDuplicate}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.6}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              backgroundColor: `${accentColor}15`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="copy-outline" size={11} color={accentColor} />
          </TouchableOpacity>
        )}

        {/* Spacer when actions are hidden */}
        {!showActions && <View style={{ width: 20 }} />}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {isActive && (
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accentColor }} />
          )}
          <Text style={{
            color: isActive ? accentColor : COLORS.textMuted,
            fontSize: 10,
            fontWeight: isActive ? '800' : '500',
          }}>
            {index + 1}
          </Text>
        </View>

        {/* Delete button - only in editor */}
        {showActions && onDelete && (
          <TouchableOpacity
            onPress={canDelete ? handleDelete : undefined}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={canDelete ? 0.6 : 1}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              backgroundColor: canDelete ? `${COLORS.error}18` : `${COLORS.error}08`,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canDelete ? 1 : 0.3,
            }}
          >
            <Ionicons name="trash-outline" size={11} color={COLORS.error} />
          </TouchableOpacity>
        )}

        {/* Spacer when actions are hidden */}
        {!showActions && <View style={{ width: 20 }} />}
      </View>
    </View>
  );
});

// ─── Legacy ThumbItem (for editor fallback, uses scale-based rendering) ─────

const LegacyThumbItem = React.memo(function LegacyThumbItem({
  slide,
  index,
  isActive,
  tokens,
  fontFamily,
  accentColor,
  totalSlides,
  noTruncate,
  showActions,
  thumbWidth,
  thumbHeight,
  thumbScale,
  onPress,
  onDelete,
  onDuplicate,
}: {
  slide:        EditableSlide;
  index:        number;
  isActive:     boolean;
  tokens:       PresentationThemeTokens;
  fontFamily?:  string;
  accentColor:  string;
  totalSlides:  number;
  noTruncate:   boolean;
  showActions:  boolean;
  thumbWidth:   number;
  thumbHeight:  number;
  thumbScale:   number;
  onPress:      (i: number) => void;
  onDelete?:    (i: number) => void;
  onDuplicate?: (i: number) => void;
}) {
  const canDelete = totalSlides > 1;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Slide',
      `Delete slide ${index + 1}? Use undo to restore it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(index) },
      ],
    );
  }, [index, onDelete]);

  const handleDuplicate = useCallback(() => {
    onDuplicate?.(index);
  }, [index, onDuplicate]);

  return (
    <View style={{ alignItems: 'center', width: thumbWidth + 4, paddingHorizontal: 2 }}>

      <Pressable
        onPress={() => onPress(index)}
        onLongPress={showActions ? handleDuplicate : undefined}
        delayLongPress={600}
        style={{
          borderRadius: 6,
          overflow: 'hidden',
          borderWidth: isActive ? 2.5 : 1.5,
          borderColor: isActive ? accentColor : COLORS.border,
          backgroundColor: tokens.background,
          shadowColor: isActive ? accentColor : '#000',
          shadowOffset: { width: 0, height: isActive ? 4 : 1 },
          shadowOpacity: isActive ? 0.4 : 0.12,
          shadowRadius: isActive ? 10 : 3,
          elevation: isActive ? 8 : 2,
        }}
      >
        <SlideCard
          slide={slide}
          tokens={tokens}
          scale={thumbScale}
          fontFamily={fontFamily}
          noTruncate={noTruncate}
        />
      </Pressable>

      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 4,
        paddingHorizontal: 2,
      }}>
        {showActions && onDuplicate && (
          <TouchableOpacity
            onPress={handleDuplicate}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.6}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              backgroundColor: `${accentColor}15`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="copy-outline" size={11} color={accentColor} />
          </TouchableOpacity>
        )}

        {!showActions && <View style={{ width: 20 }} />}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {isActive && (
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accentColor }} />
          )}
          <Text style={{
            color: isActive ? accentColor : COLORS.textMuted,
            fontSize: 9,
            fontWeight: isActive ? '800' : '500',
          }}>
            {index + 1}
          </Text>
        </View>

        {showActions && onDelete && (
          <TouchableOpacity
            onPress={canDelete ? handleDelete : undefined}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={canDelete ? 0.6 : 1}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              backgroundColor: canDelete ? `${COLORS.error}18` : `${COLORS.error}08`,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canDelete ? 1 : 0.3,
            }}
          >
            <Ionicons name="trash-outline" size={11} color={COLORS.error} />
          </TouchableOpacity>
        )}

        {!showActions && <View style={{ width: 20 }} />}
      </View>
    </View>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function SlideThumbnailStrip({
  slides,
  activeIndex,
  tokens,
  fontFamily,
  accentColor = COLORS.primary,
  onSelectSlide,
  onAddSlide,
  onDeleteSlide,
  onReorderSlide,
  onDuplicateSlide,
  liveMirror = true,
  showActions = true,
  thumbScale = DEFAULT_THUMB_SCALE,
}: SlideThumbnailStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;

  // Calculate dimensions based on thumbScale
  const { width: thumbWidth, height: thumbHeight } = getThumbDimensions(thumbScale);
  const itemWidth = thumbWidth + 8 + (showActions ? 22 : 0);
  const stripHeight = thumbHeight + 52;

  // Auto-scroll to keep active slide visible
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetX = Math.max(0, activeIndex * itemWidth - screenWidth / 2 + thumbWidth / 2);
    scrollRef.current.scrollTo({ x: targetX, animated: true });
  }, [activeIndex, itemWidth, screenWidth, thumbWidth]);

  const handleAddSlide = useCallback((afterIndex: number) => {
    if (!onAddSlide) return;
    Alert.alert(
      'Add Slide',
      'Choose a layout:',
      [
        { text: 'Content',     onPress: () => onAddSlide?.(afterIndex, 'content')     },
        { text: 'Key Points',  onPress: () => onAddSlide?.(afterIndex, 'bullets')     },
        { text: 'Statistics',  onPress: () => onAddSlide?.(afterIndex, 'stats')       },
        { text: 'Section',     onPress: () => onAddSlide?.(afterIndex, 'section')     },
        { text: 'Quote',       onPress: () => onAddSlide?.(afterIndex, 'quote')       },
        { text: 'Predictions', onPress: () => onAddSlide?.(afterIndex, 'predictions') },
        { text: 'Closing',     onPress: () => onAddSlide?.(afterIndex, 'closing')     },
        { text: 'Cancel',      style: 'cancel'                                      },
      ],
    );
  }, [onAddSlide]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{
      height: stripHeight,
      backgroundColor: COLORS.backgroundCard,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 6,
        }}
        keyboardShouldPersistTaps="always"
      >
        {slides.map((slide, i) => (
          <React.Fragment key={slide.id}>
            {/* Add button before first slide - only in editor */}
            {i === 0 && showActions && onAddSlide && (
              <AddSlideBtn
                afterIndex={-1}
                accentColor={accentColor}
                thumbHeight={thumbHeight}
                onAdd={() => handleAddSlide(-1)}
              />
            )}

            {liveMirror ? (
              <LiveThumbItem
                slide={slide}
                index={i}
                isActive={i === activeIndex}
                tokens={tokens}
                fontFamily={fontFamily}
                accentColor={accentColor}
                totalSlides={slides.length}
                showActions={showActions}
                thumbWidth={thumbWidth}
                thumbHeight={thumbHeight}
                thumbScale={thumbScale}
                onPress={onSelectSlide}
                onDelete={onDeleteSlide}
                onDuplicate={onDuplicateSlide}
              />
            ) : (
              <LegacyThumbItem
                slide={slide}
                index={i}
                isActive={i === activeIndex}
                tokens={tokens}
                fontFamily={fontFamily}
                accentColor={accentColor}
                totalSlides={slides.length}
                noTruncate={false}
                showActions={showActions}
                thumbWidth={thumbWidth}
                thumbHeight={thumbHeight}
                thumbScale={thumbScale}
                onPress={onSelectSlide}
                onDelete={onDeleteSlide}
                onDuplicate={onDuplicateSlide}
              />
            )}

            {/* Add button after every slide - only in editor */}
            {showActions && onAddSlide && (
              <AddSlideBtn
                afterIndex={i}
                accentColor={accentColor}
                thumbHeight={thumbHeight}
                onAdd={handleAddSlide}
              />
            )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  activeShadow: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});