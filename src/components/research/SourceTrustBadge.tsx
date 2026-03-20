// src/components/research/SourceTrustBadge.tsx
// Part 25 — Source Trust Badge Component
//
// Renders a compact, inline trust indicator for a single source/citation.
// Shows: Trust tier pill · Credibility score · Bias indicator
//
// USAGE — compact (inline in citation list):
//   <SourceTrustBadge score={citation.trustScore} size="sm" />
//
// USAGE — full (in sources detail panel):
//   <SourceTrustBadge score={citation.trustScore} size="md" showBias showTags />
//
// USAGE — aggregate banner (top of sources tab):
//   <SourceTrustSummaryBanner results={report.citations} />

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  size       = 'sm',
  showBias   = false,
  showTags   = false,
  showScore  = true,
}: SourceTrustBadgeProps) {
  if (!score) return null;

  const tierColor  = TIER_COLORS[score.tier];
  const scoreColor = getScoreColor(score.credibilityScore);
  const biasColor  = BIAS_COLORS[score.bias];

  const isXs = size === 'xs';
  const isMd = size === 'md';

  const pillH   = isXs ? 16 : isMd ? 22 : 18;
  const textSz  = isXs ? 9  : isMd ? 11 : 10;
  const iconSz  = isXs ? 8  : isMd ? 11 : 9;
  const padH    = isXs ? 5  : isMd ? 8  : 6;

  return (
    <View style={[styles.row, isXs && styles.rowXs]}>
      {/* ── Tier pill ── */}
      <View style={[
        styles.pill,
        { height: pillH, paddingHorizontal: padH, backgroundColor: `${tierColor}18`, borderColor: `${tierColor}35` },
      ]}>
        {!isXs && (
          <Ionicons
            name={tierIconName(score.tier) as any}
            size={iconSz}
            color={tierColor}
            style={{ marginRight: 3 }}
          />
        )}
        <Text style={[styles.pillText, { fontSize: textSz, color: tierColor }]}>
          {isXs ? `T${score.tier}` : TIER_LABELS[score.tier]}
        </Text>
      </View>

      {/* ── Score ── */}
      {showScore && (
        <View style={[
          styles.pill,
          { height: pillH, paddingHorizontal: padH, backgroundColor: `${scoreColor}18`, borderColor: `${scoreColor}35` },
        ]}>
          <Text style={[styles.pillText, { fontSize: textSz, color: scoreColor }]}>
            {score.credibilityScore.toFixed(1)}
            {!isXs && `  ${getScoreLabel(score.credibilityScore)}`}
          </Text>
        </View>
      )}

      {/* ── Bias ── */}
      {showBias && (
        <View style={[
          styles.pill,
          { height: pillH, paddingHorizontal: padH, backgroundColor: `${biasColor}15`, borderColor: `${biasColor}30` },
        ]}>
          <View style={[styles.biasDot, { backgroundColor: biasColor }]} />
          <Text style={[styles.pillText, { fontSize: textSz, color: biasColor }]}>
            {BIAS_LABELS[score.bias]}
          </Text>
        </View>
      )}

      {/* ── Verified check ── */}
      {score.isVerified && !isXs && (
        <View style={[
          styles.pill,
          { height: pillH, paddingHorizontal: padH, backgroundColor: `${COLORS.success}15`, borderColor: `${COLORS.success}30` },
        ]}>
          <Ionicons name="checkmark-circle" size={iconSz} color={COLORS.success} />
          {isMd && (
            <Text style={[styles.pillText, { fontSize: textSz, color: COLORS.success, marginLeft: 3 }]}>
              Verified
            </Text>
          )}
        </View>
      )}

      {/* ── Tags (md only) ── */}
      {showTags && isMd && score.tags.slice(0, 3).map(tag => (
        <View key={tag} style={[
          styles.pill,
          { height: pillH, paddingHorizontal: padH, backgroundColor: `${COLORS.primary}10`, borderColor: `${COLORS.primary}20` },
        ]}>
          <Text style={[styles.pillText, { fontSize: textSz - 1, color: COLORS.textMuted }]}>{tag}</Text>
        </View>
      ))}
    </View>
  );
});

// ─── Tier icon helper ─────────────────────────────────────────────────────────

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

  const avgColor   = getScoreColor(summary.avgScore);
  const hqPercent  = summary.highQualityPercent;
  const hqColor    = hqPercent >= 60 ? COLORS.success : hqPercent >= 35 ? COLORS.warning : COLORS.error;

  return (
    <View style={styles.summaryBanner}>
      {/* Left: avg score ring */}
      <View style={[styles.scoreBubble, { borderColor: `${avgColor}50` }]}>
        <Text style={[styles.scoreRingValue, { color: avgColor }]}>
          {summary.avgScore.toFixed(1)}
        </Text>
        <Text style={[styles.scoreRingLabel, { color: avgColor }]}>AVG</Text>
      </View>

      {/* Middle: label */}
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={styles.summaryTitle}>Source Quality</Text>
        <Text style={styles.summarySubtitle}>
          {getScoreLabel(summary.avgScore)} overall · {results.length} sources
        </Text>
      </View>

      {/* Right: tier breakdown */}
      <View style={styles.tierBreakdown}>
        {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
          const count = summary.tierBreakdown[tier] ?? 0;
          if (count === 0) return null;
          return (
            <View key={tier} style={styles.tierDot}>
              <View style={[styles.tierDotCircle, { backgroundColor: TIER_COLORS[tier] }]} />
              <Text style={[styles.tierDotLabel, { color: TIER_COLORS[tier] }]}>{count}</Text>
            </View>
          );
        })}
      </View>

      {/* High quality % */}
      <View style={[styles.hqBadge, { backgroundColor: `${hqColor}15`, borderColor: `${hqColor}35` }]}>
        <Text style={[styles.hqBadgeText, { color: hqColor }]}>{hqPercent}%</Text>
        <Text style={[styles.hqBadgeLabel, { color: hqColor }]}>HQ</Text>
      </View>
    </View>
  );
});

// ─── Trust Distribution Bar ───────────────────────────────────────────────────
// Shows a horizontal stacked bar of Tier 1/2/3/4 proportions.

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
            <View
              key={tier}
              style={[
                styles.distBarSegment,
                { flex: pct, backgroundColor: TIER_COLORS[tier] },
              ]}
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
              <Text style={[styles.distLegendText, { color: TIER_COLORS[tier] }]}>
                {TIER_LABELS[tier]} · {c}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    gap:           4,
  },
  rowXs: {
    gap: 3,
  },
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   RADIUS.full,
    borderWidth:    1,
  },
  pillText: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  biasDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
    marginRight:  3,
  },

  // Summary banner
  summaryBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  'rgba(30,30,60,0.6)',
    borderRadius:     RADIUS.lg,
    padding:          12,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.08)',
    marginBottom:     12,
  },
  scoreBubble: {
    width:          48,
    height:         48,
    borderRadius:   24,
    borderWidth:    2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scoreRingValue: {
    fontSize:   14,
    fontWeight: '800',
  },
  scoreRingLabel: {
    fontSize:   8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  summaryTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  summarySubtitle: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    marginTop:  2,
  },
  tierBreakdown: {
    flexDirection: 'column',
    gap:           3,
    marginRight:   10,
  },
  tierDot: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  tierDotCircle: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  tierDotLabel: {
    fontSize:   9,
    fontWeight: '700',
  },
  hqBadge: {
    alignItems:     'center',
    borderRadius:   RADIUS.md,
    borderWidth:    1,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  hqBadgeText: {
    fontSize:   13,
    fontWeight: '800',
  },
  hqBadgeLabel: {
    fontSize:   8,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Distribution bar
  distBar: {
    flexDirection: 'row',
    height:        6,
    borderRadius:  RADIUS.full,
    overflow:      'hidden',
    marginBottom:  6,
    gap:           1,
  },
  distBarSegment: {
    borderRadius: RADIUS.full,
  },
  distLegend: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  distLegendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  distLegendDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  distLegendText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
});