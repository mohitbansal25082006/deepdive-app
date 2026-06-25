// src/components/workspace/ChatDateSeparator.tsx
// Part 50 — Custom date separator for Stream Chat MessageList
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

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
      <View style={styles.lineWrap}>
        <View style={[styles.line, { backgroundColor: COLORS.primary, opacity: 0.25 }]} />
      </View>

      <View style={[styles.pill, { backgroundColor: `${COLORS.primary}28`, borderColor: `${COLORS.primary}60`, shadowColor: COLORS.primary }]}>
        <Text style={[styles.pillText, { color: COLORS.textPrimary }]}>{label}</Text>
      </View>

      <View style={styles.lineWrap}>
        <View style={[styles.line, { backgroundColor: COLORS.primary, opacity: 0.25 }]} />
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
  },
  pill: {
    borderRadius:      20,
    borderWidth:       1.5,
    paddingVertical:   5,
    paddingHorizontal: 14,
    alignItems:        'center',
    justifyContent:    'center',
    flexShrink:        0,
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.2,
    shadowRadius:      6,
    elevation:         3,
  },
  pillText: {
    fontSize:           11,
    fontWeight:         '700',
    letterSpacing:      0.4,
    includeFontPadding: false,
  },
});