// src/components/paperEditor/WordCountBadge.tsx
// Part 38 — Live word count badge with target range indicator
// Part 38d FIX — Text no longer overflows: added numberOfLines={1} + flexShrink
//                on the label Text, and the range hint is hidden when compact.
//                The "over" format is shortened to keep it tight:
//                e.g. "2,745 (2,045 over)" → "2,745w (+2,045)"

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons }   from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';
import { SECTION_WORD_TARGETS }  from '../../types/paperEditor';

interface WordCountBadgeProps {
  sectionType: string;
  wordCount:   number;
  compact?:    boolean;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function WordCountBadge({ sectionType, wordCount, compact = false }: WordCountBadgeProps) {
  const target  = SECTION_WORD_TARGETS[sectionType];
  const min     = target?.min ?? 0;
  const max     = target?.max ?? 9999;
  const hasGoal = max < 9999;

  let color = COLORS.success;
  let icon  = 'checkmark-circle-outline';
  let label = `${wordCount.toLocaleString()}w`;

  if (hasGoal) {
    if (wordCount < min) {
      color = COLORS.warning;
      icon  = 'arrow-up-outline';
      label = compact
        ? `${wordCount}/${min}w`
        : `${wordCount.toLocaleString()}/${min.toLocaleString()}w`;
    } else if (wordCount > max) {
      color = COLORS.error;
      icon  = 'arrow-down-outline';
      // Shortened: "2,745w (+2,045)" — fits comfortably in the badge
      label = compact
        ? `${wordCount}w`
        : `${wordCount.toLocaleString()}w (+${(wordCount - max).toLocaleString()})`;
    } else {
      color = COLORS.success;
      icon  = 'checkmark-circle-outline';
      label = compact
        ? `${wordCount}w ✓`
        : `${wordCount.toLocaleString()}w ✓`;
    }
  } else {
    label = compact ? `${wordCount}w` : `${wordCount.toLocaleString()}w`;
    icon  = 'text-outline';
    color = COLORS.textMuted;
  }

  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:                4,
      backgroundColor:   `${color}18`,
      borderRadius:      RADIUS.full,
      paddingHorizontal: compact ? 7 : 10,
      paddingVertical:   compact ? 3 : 5,
      borderWidth:       1,
      borderColor:       `${color}35`,
      // Prevent the badge itself from growing beyond its content
      alignSelf:         'flex-start',
    }}>
      <Ionicons name={icon as any} size={compact ? 10 : 12} color={color} />
      <Text
        numberOfLines={1}
        style={{
          color,
          fontSize:   compact ? FONTS.sizes.xs : FONTS.sizes.sm,
          fontWeight: '700',
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {/* Range hint — only shown in non-compact AND only when within range
          (avoids adding extra width when already showing over/under info) */}
      {hasGoal && !compact && wordCount >= min && wordCount <= max && (
        <Text style={{ color, fontSize: 9, opacity: 0.7, flexShrink: 1 }} numberOfLines={1}>
          ({min}–{max})
        </Text>
      )}
    </View>
  );
}

// Standalone word count helper for use outside the component
export { countWords };