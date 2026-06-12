// src/components/research/SourceTrustBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Source Trust UI  (REDESIGN)
// Exports unchanged: SourceTrustBadge · SourceTrustSummaryBanner · TrustDistributionBar
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SourceTrustScore, SourceTrustTier } from '../../types';
import {
  TIER_LABELS,
  TIER_COLORS,
  BIAS_LABELS,
  BIAS_COLORS,
  getScoreColor,
  getScoreLabel,
  computeBatchTrustSummary,
} from '../../services/sourceTrustScorer';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

// ─── Single Source Trust Badge ────────────────────────────────────────────────

interface SourceTrustBadgeProps {
  score?:     SourceTrustScore;
  size?:      'xs' | 'sm' | 'md';
  showBias?:  boolean;
  showTags?:  boolean;
  showScore?: boolean;
}

export const SourceTrustBadge = memo(function SourceTrustBadge({
  score,
  size      = 'sm',
  showBias  = false,
  showTags  = false,
  showScore = true,
}: SourceTrustBadgeProps) {
  if (!score) return null;

  const tierColor  = TIER_COLORS[score.tier];
  const scoreColor = getScoreColor(score.credibilityScore);
  const biasColor  = BIAS_COLORS[score.bias];

  const isXs = size === 'xs';
  const isMd = size === 'md';

  const pillH  = isXs ? 17 : isMd ? 23 : 19;
  const textSz = isXs ? 9  : isMd ? 11 : 10;
  const iconSz = isXs ? 8  : isMd ? 11 : 9;
  const padH   = isXs ? 6  : isMd ? 9  : 7;

  return (
    <View style={[styles.row, isXs && styles.rowXs]}>
      {/* Tier */}
      <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: `${tierColor}1C`, borderColor: `${tierColor}40` }]}>
        {!isXs && <Ionicons name={tierIconName(score.tier) as any} size={iconSz} color={tierColor} style={{ marginRight: 3 }} />}
        <Text style={[styles.pillText, { fontSize: textSz, color: tierColor }]}>
          {isXs ? `T${score.tier}` : TIER_LABELS[score.tier]}
        </Text>
      </View>

      {/* Score */}
      {showScore && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: `${scoreColor}1C`, borderColor: `${scoreColor}40` }]}>
          <View style={[styles.scoreDot, { backgroundColor: scoreColor }]} />
          <Text style={[styles.pillText, { fontSize: textSz, color: scoreColor }]}>
            {score.credibilityScore.toFixed(1)}{!isXs && `  ${getScoreLabel(score.credibilityScore)}`}
          </Text>
        </View>
      )}

      {/* Bias */}
      {showBias && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: `${biasColor}18`, borderColor: `${biasColor}33` }]}>
          <View style={[styles.biasDot, { backgroundColor: biasColor }]} />
          <Text style={[styles.pillText, { fontSize: textSz, color: biasColor }]}>{BIAS_LABELS[score.bias]}</Text>
        </View>
      )}

      {/* Verified */}
      {score.isVerified && !isXs && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: `${COLORS.success}18`, borderColor: `${COLORS.success}33` }]}>
          <Ionicons name="checkmark-circle" size={iconSz} color={COLORS.success} />
          {isMd && <Text style={[styles.pillText, { fontSize: textSz, color: COLORS.success, marginLeft: 3 }]}>Verified</Text>}
        </View>
      )}

      {/* Tags (md only) */}
      {showTags && isMd && score.tags.slice(0, 3).map(tag => (
        <View key={tag} style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}22` }]}>
          <Text style={[styles.pillText, { fontSize: textSz - 1, color: COLORS.textMuted }]}>{tag}</Text>
        </View>
      ))}
    </View>
  );
});

function tierIconName(tier: SourceTrustTier): string {
  switch (tier) {
    case 1:  return 'shield-checkmark';
    case 2:  return 'checkmark-circle';
    case 3:  return 'information-circle';
    case 4:  return 'warning';
    default: return 'help-circle';
  }
}

// ─── Aggregate Summary Banner ─────────────────────────────────────────────────

interface SourceTrustSummaryBannerProps {
  results: Array<{ trustScore?: SourceTrustScore }>;
}

export const SourceTrustSummaryBanner = memo(function SourceTrustSummaryBanner({
  results,
}: SourceTrustSummaryBannerProps) {
  const summary = computeBatchTrustSummary(results);
  const avgColor = getScoreColor(summary.avgScore);
  const hqPercent = summary.highQualityPercent;
  const hqColor = hqPercent >= 60 ? COLORS.success : hqPercent >= 35 ? COLORS.warning : COLORS.error;

  return (
    <View style={styles.bannerWrap}>
      <LinearGradient colors={['#1A1A38', '#121228']} style={styles.banner}>
        {/* score ring */}
        <View style={[styles.ringOuter, { borderColor: `${avgColor}55` }]}>
          <LinearGradient
            colors={[`${avgColor}33`, `${avgColor}0A`]}
            style={styles.ringInner}
          >
            <Text style={[styles.ringValue, { color: avgColor }]}>{summary.avgScore.toFixed(1)}</Text>
            <Text style={[styles.ringLabel, { color: avgColor }]}>AVG</Text>
          </LinearGradient>
        </View>

        {/* label */}
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={styles.bannerTitle}>Source Quality</Text>
          <Text style={styles.bannerSub}>
            {getScoreLabel(summary.avgScore)} · {results.length} sources
          </Text>
        </View>

        {/* tier breakdown */}
        <View style={styles.tierCol}>
          {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
            const count = summary.tierBreakdown[tier] ?? 0;
            if (count === 0) return null;
            return (
              <View key={tier} style={styles.tierRow}>
                <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} />
                <Text style={[styles.tierCount, { color: TIER_COLORS[tier] }]}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* HQ */}
        <View style={[styles.hq, { backgroundColor: `${hqColor}18`, borderColor: `${hqColor}40` }]}>
          <Text style={[styles.hqValue, { color: hqColor }]}>{hqPercent}%</Text>
          <Text style={[styles.hqLabel, { color: hqColor }]}>HQ</Text>
        </View>
      </LinearGradient>
    </View>
  );
});

// ─── Trust Distribution Bar ───────────────────────────────────────────────────

interface TrustDistributionBarProps {
  results: Array<{ trustScore?: SourceTrustScore }>;
}

export const TrustDistributionBar = memo(function TrustDistributionBar({
  results,
}: TrustDistributionBarProps) {
  const scored = results.filter(r => r.trustScore);
  if (scored.length === 0) return null;

  const counts: Record<SourceTrustTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of scored) counts[r.trustScore!.tier]++;

  return (
    <View>
      <View style={styles.distBar}>
        {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
          const pct = (counts[tier] / scored.length) * 100;
          if (pct < 1) return null;
          return (
            <LinearGradient
              key={tier}
              colors={[TIER_COLORS[tier], `${TIER_COLORS[tier]}AA`]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.distSeg, { flex: pct }]}
            />
          );
        })}
      </View>
      <View style={styles.distLegend}>
        {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
          const c = counts[tier];
          if (c === 0) return null;
          return (
            <View key={tier} style={styles.distLegendItem}>
              <View style={[styles.distLegendDot, { backgroundColor: TIER_COLORS[tier] }]} />
              <Text style={[styles.distLegendText, { color: TIER_COLORS[tier] }]}>{TIER_LABELS[tier]} · {c}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  rowXs: { gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.full, borderWidth: 1 },
  pillText: { fontWeight: '700', letterSpacing: 0.2 },
  scoreDot: { width: 5, height: 5, borderRadius: 3, marginRight: 4 },
  biasDot: { width: 5, height: 5, borderRadius: 3, marginRight: 3 },

  bannerWrap: { borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 12 },

  ringOuter: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, padding: 3 },
  ringInner: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 15, fontWeight: '900' },
  ringLabel: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },

  bannerTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' },
  bannerSub: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },

  tierCol: { gap: 3, marginRight: 10 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tierDot: { width: 7, height: 7, borderRadius: 4 },
  tierCount: { fontSize: 9, fontWeight: '800' },

  hq: { alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  hqValue: { fontSize: 14, fontWeight: '900' },
  hqLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  distBar: { flexDirection: 'row', height: 8, borderRadius: RADIUS.full, overflow: 'hidden', marginBottom: 7, gap: 2 },
  distSeg: { borderRadius: RADIUS.full },
  distLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  distLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distLegendDot: { width: 6, height: 6, borderRadius: 3 },
  distLegendText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
});