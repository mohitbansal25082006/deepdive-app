// src/components/knowledgeBase/KBIndexingBanner.tsx
// Part 26 — Personal AI Knowledge Base
//
// Banner displayed at the top of the KB screen.
// Shows three states:
//   1. idle / complete  → "Knowledge Base Ready" green pill
//   2. indexing         → animated progress bar with report name
//   3. error            → warning with retry button
//
// Also displays the compact stats strip (X reports · Y indexed · Z% ready)

import React, { useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  Animated as RNAnimated, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { KBIndexState, KBStats }   from '../../types/knowledgeBase';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  stats:      KBStats | null;
  indexState: KBIndexState;
  onRetry:    () => void;
}

export function KBIndexingBanner({ stats, indexState, onRetry }: Props) {
  const progressAnim = useRef(new RNAnimated.Value(0)).current;

  // Animate the progress bar fill when doneCount changes
  useEffect(() => {
    if (
      indexState.status === 'indexing' &&
      indexState.pendingCount > 0
    ) {
      const pct = indexState.pendingCount > 0
        ? indexState.doneCount / indexState.pendingCount
        : 0;
      RNAnimated.timing(progressAnim, {
        toValue:         pct,
        duration:        600,
        useNativeDriver: false,
      }).start();
    } else if (indexState.status === 'complete') {
      RNAnimated.timing(progressAnim, {
        toValue:         1,
        duration:        400,
        useNativeDriver: false,
      }).start();
    }
  }, [indexState.doneCount, indexState.status]);

  const progressWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // ── Stats strip ─────────────────────────────────────────────────────────
  const StatsStrip = () => {
    if (!stats) return null;
    const items = [
      { label: 'Reports',  value: String(stats.totalReports),   icon: 'document-text-outline' },
      { label: 'Indexed',  value: String(stats.indexedReports), icon: 'git-network-outline' },
      { label: 'Ready',    value: `${stats.indexedPct}%`,       icon: 'checkmark-circle-outline' },
      { label: 'Chunks',   value: String(stats.totalChunks),    icon: 'layers-outline' },
    ];
    return (
      <View style={styles.statsStrip}>
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={styles.statsDivider} />}
            <View style={styles.statItem}>
              <Ionicons name={item.icon as any} size={11} color={COLORS.textMuted} />
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    );
  };

  // ── Error state ──────────────────────────────────────────────────────────
  if (indexState.status === 'error') {
    return (
      <Animated.View
        entering={FadeInDown.duration(300)}
        style={styles.errorBanner}
      >
        <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
        <Text style={styles.errorText} numberOfLines={2}>
          Indexing failed — some reports may not be searchable
        </Text>
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Indexing in progress ─────────────────────────────────────────────────
  if (indexState.status === 'indexing') {
    const pct = indexState.pendingCount > 0
      ? Math.round((indexState.doneCount / indexState.pendingCount) * 100)
      : 0;

    return (
      <Animated.View
        entering={FadeInDown.duration(300)}
        style={styles.indexingBanner}
      >
        <View style={styles.indexingTop}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.indexingTitle}>
              Building your Knowledge Base · {pct}%
            </Text>
            {indexState.currentTitle ? (
              <Text style={styles.indexingSubtitle} numberOfLines={1}>
                Indexing: {indexState.currentTitle}
              </Text>
            ) : null}
          </View>
          <Text style={styles.indexingCount}>
            {indexState.doneCount}/{indexState.pendingCount}
          </Text>
        </View>

        {/* Progress track */}
        <View style={styles.progressTrack}>
          <RNAnimated.View
            style={[
              styles.progressFill,
              { width: progressWidth as any },
            ]}
          />
        </View>

        <StatsStrip />
      </Animated.View>
    );
  }

  // ── Complete / idle ──────────────────────────────────────────────────────
  if (indexState.status === 'complete' || indexState.status === 'idle') {
    const allIndexed = stats
      ? stats.indexedReports >= stats.totalReports && stats.totalReports > 0
      : false;

    return (
      <View style={styles.readyBanner}>
        {/* Ready pill */}
        {allIndexed ? (
          <View style={styles.readyPill}>
            <Ionicons name="sparkles" size={11} color={COLORS.success} />
            <Text style={styles.readyText}>
              Knowledge Base Ready — {stats?.totalReports} report{stats?.totalReports !== 1 ? 's' : ''} indexed
            </Text>
          </View>
        ) : stats && stats.totalReports > 0 ? (
          <View style={styles.partialPill}>
            <Ionicons name="git-network-outline" size={11} color={COLORS.primary} />
            <Text style={styles.partialText}>
              {stats.indexedReports}/{stats.totalReports} reports indexed ({stats.indexedPct}%)
            </Text>
            <Pressable onPress={onRetry}>
              <Text style={styles.indexNowText}>Index now →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyPill}>
            <Ionicons name="information-circle-outline" size={11} color={COLORS.textMuted} />
            <Text style={styles.emptyPillText}>
              No reports yet — complete research to build your KB
            </Text>
          </View>
        )}

        <StatsStrip />
      </View>
    );
  }

  // ── Checking state ───────────────────────────────────────────────────────
  return (
    <View style={styles.checkingBanner}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={styles.checkingText}>Scanning your research library…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Checking ─────────────────────────────────────────────────────────────
  checkingBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:             8,
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    backgroundColor:   COLORS.primary + '08',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  checkingText: {
    color:     COLORS.primary,
    fontSize:  FONTS.sizes.xs,
    fontStyle: 'italic',
  },

  // ── Indexing ──────────────────────────────────────────────────────────────
  indexingBanner: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    backgroundColor:   COLORS.primary + '08',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary + '20',
    gap:               8,
  },
  indexingTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  indexingTitle: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    marginBottom: 2,
  },
  indexingSubtitle: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
  },
  indexingCount: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    flexShrink: 0,
  },
  progressTrack: {
    height:          4,
    backgroundColor: COLORS.border,
    borderRadius:    2,
    overflow:        'hidden',
  },
  progressFill: {
    height:          4,
    backgroundColor: COLORS.primary,
    borderRadius:    2,
  },

  // ── Ready ─────────────────────────────────────────────────────────────────
  readyBanner: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    backgroundColor:   COLORS.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap:               6,
  },
  readyPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              5,
    alignSelf:       'flex-start',
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:    RADIUS.full,
    backgroundColor: COLORS.success + '12',
    borderWidth:     1,
    borderColor:     COLORS.success + '25',
  },
  readyText: {
    color:      COLORS.success,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  partialPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    alignSelf:     'flex-start',
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:  RADIUS.full,
    backgroundColor: COLORS.primary + '10',
    borderWidth:   1,
    borderColor:   COLORS.primary + '25',
  },
  partialText: {
    color:     COLORS.primary,
    fontSize:  FONTS.sizes.xs,
    fontWeight: '600',
  },
  indexNowText: {
    color:      COLORS.accent,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  emptyPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            5,
    alignSelf:     'flex-start',
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:  RADIUS.full,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:   1,
    borderColor:   COLORS.border,
  },
  emptyPillText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
  },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              8,
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    backgroundColor:   COLORS.warning + '10',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning + '20',
  },
  errorText: {
    flex:      1,
    color:     COLORS.warning,
    fontSize:  FONTS.sizes.xs,
    lineHeight: 16,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.warning + '20',
    borderWidth:       1,
    borderColor:       COLORS.warning + '40',
  },
  retryText: {
    color:      COLORS.warning,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },

  // ── Stats strip ───────────────────────────────────────────────────────────
  statsStrip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            0,
  },
  statItem: {
    flex:           1,
    alignItems:     'center',
    gap:             2,
  },
  statsDivider: {
    width:           1,
    height:          28,
    backgroundColor: COLORS.border,
  },
  statValue: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
    marginTop:  2,
  },
  statLabel: {
    color:     COLORS.textMuted,
    fontSize:  9,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing:  0.4,
  },
});