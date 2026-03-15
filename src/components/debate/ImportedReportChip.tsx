// src/components/debate/ImportedReportChip.tsx
// Part 20 — Compact chip displayed below the topic input when a
// research report has been imported. Shows the report title and
// a dismiss button to clear it.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImportedReportChipProps {
  reportTitle:   string;
  sectionsCount: number;
  sourcesCount:  number;
  onRemove:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportedReportChip({
  reportTitle,
  sectionsCount,
  sourcesCount,
  onRemove,
}: ImportedReportChipProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      {/* Left icon */}
      <View style={styles.iconWrap}>
        <Ionicons name="document-text" size={15} color={COLORS.primary} />
      </View>

      {/* Text content */}
      <View style={styles.content}>
        <View style={styles.labelRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Report</Text>
          </View>
          <Text style={styles.statsText}>
            {sectionsCount} sections · {sourcesCount} sources
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {reportTitle}
        </Text>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        style={styles.removeBtn}
      >
        <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     `${COLORS.primary}30`,
    padding:         SPACING.sm,
    marginBottom:    SPACING.md,
  },

  iconWrap: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: `${COLORS.primary}18`,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     `${COLORS.primary}25`,
    flexShrink:      0,
  },

  content: {
    flex:    1,
    minWidth: 0,
    gap:     3,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },

  badge: {
    backgroundColor:  `${COLORS.primary}22`,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical:   1,
  },

  badgeText: {
    color:      COLORS.primary,
    fontSize:   10,
    fontWeight: '700',
  },

  statsText: {
    color:    COLORS.textMuted,
    fontSize: 10,
  },

  title: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },

  removeBtn: {
    padding:  2,
    flexShrink: 0,
  },
});