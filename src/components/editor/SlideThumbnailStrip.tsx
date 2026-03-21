// src/components/editor/SlideThumbnailStrip.tsx
// Part 28 — FIX: Visible delete button on every slide. Removed index>0 guard.

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, Alert, TouchableOpacity,
} from 'react-native';
import { Ionicons }       from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { SlideCard }                             from '../research/SlideCard';
import { COLORS, FONTS, SPACING, RADIUS }         from '../../constants/theme';
import type { EditableSlide }                    from '../../types/editor';
import type { PresentationThemeTokens, SlideLayout } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const THUMB_W    = 96;
const THUMB_H    = Math.round(THUMB_W * (9 / 16));
const THUMB_SCALE = THUMB_W / 320;
const ITEM_W     = THUMB_W + SPACING.sm;
const STRIP_H    = THUMB_H + 44; // thumb + slide number + delete button

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideThumbnailStripProps {
  slides:          EditableSlide[];
  activeIndex:     number;
  tokens:          PresentationThemeTokens;
  fontFamily?:     string;
  accentColor?:    string;
  onSelectSlide:   (index: number) => void;
  onAddSlide:      (afterIndex: number, layout?: SlideLayout) => void;
  onDeleteSlide:   (index: number) => void;
  onReorderSlide:  (from: number, to: number) => void;
  onDuplicateSlide:(index: number) => void;
}

// ─── Add-slide button ─────────────────────────────────────────────────────────

const AddSlideBtn = React.memo(function AddSlideBtn({
  afterIndex,
  accentColor,
  onAdd,
}: {
  afterIndex:  number;
  accentColor: string;
  onAdd:       (after: number) => void;
}) {
  return (
    <Pressable
      onPress={() => onAdd(afterIndex)}
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      style={{
        width:          22,
        height:         THUMB_H,
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

// ─── Single Slide Thumbnail ───────────────────────────────────────────────────

const ThumbItem = React.memo(function ThumbItem({
  slide,
  index,
  isActive,
  tokens,
  fontFamily,
  accentColor,
  totalSlides,
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
  onPress:      (i: number) => void;
  onDelete:     (i: number) => void;
  onDuplicate:  (i: number) => void;
}) {
  const canDelete = totalSlides > 1;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Slide',
      `Delete slide ${index + 1}? Use undo to restore it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(index) },
      ],
    );
  }, [index, onDelete]);

  return (
    <View style={{ alignItems: 'center', width: THUMB_W }}>

      {/* Thumbnail press area */}
      <Pressable
        onPress={() => onPress(index)}
        onLongPress={() => onDuplicate(index)}
        delayLongPress={600}
        style={{
          borderRadius:  8,
          overflow:      'hidden',
          borderWidth:   isActive ? 2.5 : 1,
          borderColor:   isActive ? accentColor : COLORS.border,
          shadowColor:   isActive ? accentColor : '#000',
          shadowOffset:  { width: 0, height: isActive ? 3 : 1 },
          shadowOpacity: isActive ? 0.4 : 0.12,
          shadowRadius:  isActive ? 8 : 3,
          elevation:     isActive ? 6 : 2,
          transform:     [{ scale: isActive ? 1.03 : 1 }],
        }}
      >
        <SlideCard slide={slide} tokens={tokens} scale={THUMB_SCALE} fontFamily={fontFamily} />
      </Pressable>

      {/* Slide number + action row */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'space-between',
        width:          '100%',
        marginTop:      4,
        paddingHorizontal: 2,
      }}>
        {/* Duplicate button */}
        <TouchableOpacity
          onPress={() => onDuplicate(index)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.6}
          style={{
            width:           18,
            height:          18,
            borderRadius:    5,
            backgroundColor: `${accentColor}15`,
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          <Ionicons name="copy-outline" size={10} color={accentColor} />
        </TouchableOpacity>

        {/* Slide number */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {isActive && (
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accentColor }} />
          )}
          <Text style={{
            color:      isActive ? accentColor : COLORS.textMuted,
            fontSize:   9,
            fontWeight: isActive ? '800' : '500',
          }}>
            {index + 1}
          </Text>
        </View>

        {/* DELETE button — always visible, disabled only when 1 slide remains */}
        <TouchableOpacity
          onPress={canDelete ? handleDelete : undefined}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={canDelete ? 0.6 : 1}
          style={{
            width:           18,
            height:          18,
            borderRadius:    5,
            backgroundColor: canDelete ? `${COLORS.error}18` : `${COLORS.error}08`,
            alignItems:      'center',
            justifyContent:  'center',
            opacity:         canDelete ? 1 : 0.3,
          }}
        >
          <Ionicons name="trash-outline" size={10} color={COLORS.error} />
        </TouchableOpacity>
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
}: SlideThumbnailStripProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to keep active slide visible
  useEffect(() => {
    if (!scrollRef.current) return;
    // Each item = thumb width + add button width + gaps
    const itemFullW = THUMB_W + 22 + SPACING.xs * 2;
    const x = activeIndex * itemFullW;
    scrollRef.current.scrollTo({ x: Math.max(0, x - 40), animated: true });
  }, [activeIndex]);

  const handleAddSlide = useCallback((afterIndex: number) => {
    Alert.alert(
      'Add Slide',
      'Choose a layout:',
      [
        { text: 'Content',     onPress: () => onAddSlide(afterIndex, 'content')     },
        { text: 'Key Points',  onPress: () => onAddSlide(afterIndex, 'bullets')     },
        { text: 'Statistics',  onPress: () => onAddSlide(afterIndex, 'stats')       },
        { text: 'Section',     onPress: () => onAddSlide(afterIndex, 'section')     },
        { text: 'Quote',       onPress: () => onAddSlide(afterIndex, 'quote')       },
        { text: 'Predictions', onPress: () => onAddSlide(afterIndex, 'predictions') },
        { text: 'Closing',     onPress: () => onAddSlide(afterIndex, 'closing')     },
        { text: 'Cancel',      style: 'cancel'                                      },
      ],
    );
  }, [onAddSlide]);

  return (
    <View style={{
      height:          STRIP_H + SPACING.sm * 2,
      backgroundColor: COLORS.backgroundCard,
      borderTopWidth:  1,
      borderTopColor:  COLORS.border,
    }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: SPACING.lg,
          paddingVertical:   SPACING.sm,
          flexDirection:     'row',
          alignItems:        'flex-start',
          gap:               SPACING.xs,
        }}
        keyboardShouldPersistTaps="always"
      >
        {slides.map((slide, i) => (
          <React.Fragment key={slide.id}>
            {/* Add button before first slide */}
            {i === 0 && (
              <AddSlideBtn
                afterIndex={-1}
                accentColor={accentColor}
                onAdd={() => handleAddSlide(-1)}
              />
            )}

            <ThumbItem
              slide={slide}
              index={i}
              isActive={i === activeIndex}
              tokens={tokens}
              fontFamily={fontFamily}
              accentColor={accentColor}
              totalSlides={slides.length}
              onPress={onSelectSlide}
              onDelete={onDeleteSlide}
              onDuplicate={onDuplicateSlide}
            />

            {/* Add button after every slide */}
            <AddSlideBtn
              afterIndex={i}
              accentColor={accentColor}
              onAdd={handleAddSlide}
            />
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}