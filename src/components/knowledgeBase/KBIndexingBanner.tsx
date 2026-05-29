// src/components/knowledgeBase/KBIndexingBanner.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic.
// No floating animations. Clean status strips. All logic unchanged.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  Animated as RNAnimated, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { KBIndexState, KBStats }  from '../../types/knowledgeBase';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  stats:      KBStats | null;
  indexState: KBIndexState;
  onRetry:    () => void;
}

export function KBIndexingBanner({ stats, indexState, onRetry }: Props) {
  const progressAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (indexState.status === 'indexing' && indexState.pendingCount > 0) {
      RNAnimated.timing(progressAnim, {
        toValue: indexState.doneCount / indexState.pendingCount,
        duration: 500, useNativeDriver: false,
      }).start();
    } else if (indexState.status === 'complete') {
      RNAnimated.timing(progressAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
    }
  }, [indexState.doneCount, indexState.status]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp',
  });

  // ── Stats strip ────────────────────────────────────────────────────────────
  const StatsStrip = () => {
    if (!stats) return null;
    const items = [
      { label: 'Reports', value: String(stats.totalReports),   icon: 'document-text-outline' as const },
      { label: 'Indexed', value: String(stats.indexedReports), icon: 'git-network-outline'   as const },
      { label: 'Ready',   value: `${stats.indexedPct}%`,       icon: 'checkmark-circle-outline' as const },
      { label: 'Chunks',  value: String(stats.totalChunks),    icon: 'layers-outline'        as const },
    ];
    return (
      <View style={styles.statsStrip}>
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={styles.statsDivider} />}
            <View style={styles.statItem}>
              <Ionicons name={item.icon} size={10} color={`${COLORS.primary}70`} />
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    );
  };

  // ── Error ──────────────────────────────────────────────────────────────────
  if (indexState.status === 'error') {
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.errorBanner}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="warning-outline" size={13} color={COLORS.warning} />
        </View>
        <Text style={styles.errorText} numberOfLines={2}>
          Indexing failed — some reports may not be searchable
        </Text>
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Indexing ───────────────────────────────────────────────────────────────
  if (indexState.status === 'indexing') {
    const pct = indexState.pendingCount > 0
      ? Math.round((indexState.doneCount / indexState.pendingCount) * 100) : 0;
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.indexingBanner}>
        <View style={styles.indexingTop}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.indexingTitle}>Building Knowledge Base · {pct}%</Text>
            {indexState.currentTitle ? (
              <Text style={styles.indexingSubtitle} numberOfLines={1}>
                Indexing: {indexState.currentTitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{indexState.doneCount}/{indexState.pendingCount}</Text>
          </View>
        </View>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <RNAnimated.View style={[styles.progressFillWrap, { width: progressWidth as any }]}>
            <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </RNAnimated.View>
        </View>
        <StatsStrip />
      </Animated.View>
    );
  }

  // ── Complete / idle ────────────────────────────────────────────────────────
  if (indexState.status === 'complete' || indexState.status === 'idle') {
    const allIndexed = stats ? stats.indexedReports >= stats.totalReports && stats.totalReports > 0 : false;
    return (
      <View style={styles.readyBanner}>
        {allIndexed ? (
          <View style={styles.readyPill}>
            <View style={styles.readyDot} />
            <Ionicons name="sparkles" size={10} color={COLORS.accent} />
            <Text style={styles.readyText}>KB Ready — {stats?.totalReports} report{stats?.totalReports !== 1 ? 's' : ''} indexed</Text>
          </View>
        ) : stats && stats.totalReports > 0 ? (
          <View style={styles.partialPill}>
            <Ionicons name="git-network-outline" size={10} color={COLORS.primary} />
            <Text style={styles.partialText}>{stats.indexedReports}/{stats.totalReports} indexed ({stats.indexedPct}%)</Text>
            <Pressable onPress={onRetry}><Text style={styles.indexNowText}>Index now →</Text></Pressable>
          </View>
        ) : (
          <View style={styles.emptyPill}>
            <Ionicons name="information-circle-outline" size={10} color={COLORS.textMuted} />
            <Text style={styles.emptyPillText}>No reports yet — complete research to build your KB</Text>
          </View>
        )}
        <StatsStrip />
      </View>
    );
  }

  // ── Checking ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.checkingBanner}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={styles.checkingText}>Scanning your research library…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checkingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: `${COLORS.primary}08`, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}15` },
  checkingText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },

  indexingBanner: { paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: `${COLORS.primary}08`, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}18`, gap: 8 },
  indexingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indexingTitle: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 2 },
  indexingSubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  countPill: { backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}28`, flexShrink: 0 },
  countPillText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: COLORS.border },
  progressFillWrap: { height: 4, borderRadius: 2, overflow: 'hidden' },

  readyBanner: { paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: COLORS.backgroundCard, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 6 },
  readyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: `${COLORS.accent}10`, borderWidth: 1, borderColor: `${COLORS.accent}22` },
  readyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.accent },
  readyText: { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  partialPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}10`, borderWidth: 1, borderColor: `${COLORS.primary}22` },
  partialText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  indexNowText: { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  emptyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
  emptyPillText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: `${COLORS.warning}08`, borderBottomWidth: 1, borderBottomColor: `${COLORS.warning}18` },
  errorIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.warning}12`, borderWidth: 1, borderColor: `${COLORS.warning}25`, flexShrink: 0 },
  errorText: { flex: 1, color: COLORS.warning, fontSize: FONTS.sizes.xs, lineHeight: 16 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: `${COLORS.warning}18`, borderWidth: 1, borderColor: `${COLORS.warning}35`, flexShrink: 0 },
  retryText: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  statsStrip: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statsDivider: { width: 1, height: 24, backgroundColor: `${COLORS.border}80` },
  statValue: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: 1 },
  statLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
});