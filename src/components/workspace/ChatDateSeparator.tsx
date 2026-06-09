// src/components/workspace/ChatDateSeparator.tsx
// Part 50 — Custom date separator for Stream Chat MessageList
// Replaces Stream's default InlineDateSeparator chip with a visually polished
// full-width divider that shows the date centered between two gradient lines.
// Usage: Pass as InlineDateSeparator prop to Channel component.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

interface Props {
  date?: Date | undefined;
}

function formatDate(date: Date): string {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d     = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff  = Math.round((today.getTime() - d.getTime()) / 86400000);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

export function ChatDateSeparator({ date }: Props) {
  if (!date) return null;
  const label = formatDate(date instanceof Date ? date : new Date(date));

  return (
    <View style={styles.row}>
      {/* Left line */}
      <View style={styles.lineWrap}>
        <View style={styles.line} />
      </View>

      {/* Date pill */}
      <View style={styles.pill}>
        <Text style={styles.pillText}>{label}</Text>
      </View>

      {/* Right line */}
      <View style={styles.lineWrap}>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap:               10,
  },
  lineWrap: {
    flex:           1,
    justifyContent: 'center',
  },
  line: {
    height:          1,
    backgroundColor: COLORS.primary,
    opacity:         0.25,
  },
  pill: {
    // High-contrast pill: semi-transparent primary accent background
    // so it's clearly readable on any dark background
    backgroundColor:   `${COLORS.primary}28`,
    borderRadius:      20,
    borderWidth:       1.5,
    borderColor:       `${COLORS.primary}60`,
    paddingVertical:   5,
    paddingHorizontal: 14,
    alignItems:        'center',
    justifyContent:    'center',
    flexShrink:        0,
    shadowColor:       COLORS.primary,
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.2,
    shadowRadius:      6,
    elevation:         3,
  },
  pillText: {
    color:              COLORS.textPrimary,   // solid white — maximum contrast
    fontSize:           11,
    fontWeight:         '700',
    letterSpacing:      0.4,
    includeFontPadding: false,
  },
});