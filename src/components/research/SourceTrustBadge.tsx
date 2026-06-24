// src/components/research/SourceTrustBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Source Trust UI  (REDESIGN - Theme Compatible)
// Exports unchanged: SourceTrustBadge · SourceTrustSummaryBanner · TrustDistributionBar
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useMemo } from 'react';
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
import { COLORS, FONTS, RADIUS, isLightTheme, getModalBackdrop } from '../../constants/theme';

// ─── Helper: Get theme-aware tier color with proper opacity ────────────────

/**
 * Returns a theme-aware version of a tier color with the specified opacity.
 * Uses the tier's base color but adjusts it to work well with the current theme.
 */
function getThemeTierColor(tier: SourceTrustTier, opacity: number = 1): string {
  const baseColor = TIER_COLORS[tier];
  const isLight = isLightTheme();
  
  // In light mode, we need slightly more saturated/darker versions
  // of the tier colors to maintain visibility against white backgrounds
  if (isLight) {
    const lightMap: Record<SourceTrustTier, string> = {
      1: '#4F46E5', // Slightly darker indigo
      2: '#059669', // Darker emerald
      3: '#D97706', // Darker amber
      4: '#DC2626', // Darker red
    };
    const color = lightMap[tier] || baseColor;
    if (opacity === 1) return color;
    return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
  }
  
  // Dark mode - use the original colors
  if (opacity === 1) return baseColor;
  return `${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Returns theme-aware background color for tier pills
 */
function getTierPillBg(tier: SourceTrustTier): string {
  const baseColor = TIER_COLORS[tier];
  const isLight = isLightTheme();
  // Light mode: use a lighter, more transparent background
  // Dark mode: use a darker, more transparent background
  const opacity = isLight ? 0.12 : 0.18;
  return getThemeTierColor(tier, opacity);
}

/**
 * Returns theme-aware border color for tier pills
 */
function getTierPillBorder(tier: SourceTrustTier): string {
  const baseColor = TIER_COLORS[tier];
  const isLight = isLightTheme();
  const opacity = isLight ? 0.30 : 0.40;
  return getThemeTierColor(tier, opacity);
}

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

  const isLight = isLightTheme();
  const tierColor  = getThemeTierColor(score.tier);
  const scoreColor = getScoreColor(score.credibilityScore);
  const biasColor  = BIAS_COLORS[score.bias];

  const isXs = size === 'xs';
  const isMd = size === 'md';

  const pillH  = isXs ? 17 : isMd ? 23 : 19;
  const textSz = isXs ? 9  : isMd ? 11 : 10;
  const iconSz = isXs ? 8  : isMd ? 11 : 9;
  const padH   = isXs ? 6  : isMd ? 9  : 7;

  // Theme-aware colors
  const tierBg = getTierPillBg(score.tier);
  const tierBorder = getTierPillBorder(score.tier);
  const scoreBg = isLight ? `${scoreColor}1A` : `${scoreColor}1C`;
  const scoreBorder = isLight ? `${scoreColor}30` : `${scoreColor}40`;
  const biasBg = isLight ? `${biasColor}14` : `${biasColor}18`;
  const biasBorder = isLight ? `${biasColor}28` : `${biasColor}33`;
  const verifiedBg = isLight ? `${COLORS.success}14` : `${COLORS.success}18`;
  const verifiedBorder = isLight ? `${COLORS.success}28` : `${COLORS.success}33`;
  const tagBg = isLight ? `${COLORS.primary}0C` : `${COLORS.primary}12`;
  const tagBorder = isLight ? `${COLORS.primary}18` : `${COLORS.primary}22`;
  const verifiedTextColor = isLight ? COLORS.success : COLORS.success;

  return (
    <View style={[styles.row, isXs && styles.rowXs]}>
      {/* Tier */}
      <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: tierBg, borderColor: tierBorder }]}>
        {!isXs && <Ionicons name={tierIconName(score.tier) as any} size={iconSz} color={tierColor} style={{ marginRight: 3 }} />}
        <Text style={[styles.pillText, { fontSize: textSz, color: tierColor }]}>
          {isXs ? `T${score.tier}` : TIER_LABELS[score.tier]}
        </Text>
      </View>

      {/* Score */}
      {showScore && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: scoreBg, borderColor: scoreBorder }]}>
          <View style={[styles.scoreDot, { backgroundColor: scoreColor }]} />
          <Text style={[styles.pillText, { fontSize: textSz, color: scoreColor }]}>
            {score.credibilityScore.toFixed(1)}{!isXs && `  ${getScoreLabel(score.credibilityScore)}`}
          </Text>
        </View>
      )}

      {/* Bias */}
      {showBias && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: biasBg, borderColor: biasBorder }]}>
          <View style={[styles.biasDot, { backgroundColor: biasColor }]} />
          <Text style={[styles.pillText, { fontSize: textSz, color: biasColor }]}>{BIAS_LABELS[score.bias]}</Text>
        </View>
      )}

      {/* Verified */}
      {score.isVerified && !isXs && (
        <View style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: verifiedBg, borderColor: verifiedBorder }]}>
          <Ionicons name="checkmark-circle" size={iconSz} color={COLORS.success} />
          {isMd && <Text style={[styles.pillText, { fontSize: textSz, color: verifiedTextColor, marginLeft: 3 }]}>Verified</Text>}
        </View>
      )}

      {/* Tags (md only) */}
      {showTags && isMd && score.tags.slice(0, 3).map(tag => (
        <View key={tag} style={[styles.pill, { height: pillH, paddingHorizontal: padH, backgroundColor: tagBg, borderColor: tagBorder }]}>
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
  const isLight = isLightTheme();
  const summary = computeBatchTrustSummary(results);
  const avgColor = getScoreColor(summary.avgScore);
  const hqPercent = summary.highQualityPercent;
  const hqColor = hqPercent >= 60 ? COLORS.success : hqPercent >= 35 ? COLORS.warning : COLORS.error;

  // Theme-aware banner gradient - use as const for tuple type
  const bannerGradient: [string, string] = isLight 
    ? [COLORS.backgroundCard, COLORS.backgroundElevated] as const
    : ['#1A1A38', '#121228'] as const;

  // Theme-aware ring border
  const ringBorderColor = isLight ? `${avgColor}33` : `${avgColor}55`;
  
  // Theme-aware ring inner gradient - use as const for tuple type
  const ringInnerColors: [string, string] = isLight
    ? [`${avgColor}1A`, `${avgColor}08`] as const
    : [`${avgColor}33`, `${avgColor}0A`] as const;

  // Theme-aware HQ box
  const hqBg = isLight ? `${hqColor}0D` : `${hqColor}18`;
  const hqBorder = isLight ? `${hqColor}25` : `${hqColor}40`;

  return (
    <View style={[styles.bannerWrap, { borderColor: isLight ? COLORS.border : 'rgba(255,255,255,0.08)' }]}>
      <LinearGradient colors={bannerGradient} style={styles.banner}>
        {/* score ring */}
        <View style={[styles.ringOuter, { borderColor: ringBorderColor }]}>
          <LinearGradient
            colors={ringInnerColors}
            style={styles.ringInner}
          >
            <Text style={[styles.ringValue, { color: avgColor }]}>{summary.avgScore.toFixed(1)}</Text>
            <Text style={[styles.ringLabel, { color: avgColor }]}>AVG</Text>
          </LinearGradient>
        </View>

        {/* label */}
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={[styles.bannerTitle, { color: COLORS.textPrimary }]}>Source Quality</Text>
          <Text style={[styles.bannerSub, { color: COLORS.textMuted }]}>
            {getScoreLabel(summary.avgScore)} · {results.length} sources
          </Text>
        </View>

        {/* tier breakdown */}
        <View style={styles.tierCol}>
          {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
            const count = summary.tierBreakdown[tier] ?? 0;
            if (count === 0) return null;
            const tierColor = getThemeTierColor(tier);
            return (
              <View key={tier} style={styles.tierRow}>
                <View style={[styles.tierDot, { backgroundColor: tierColor }]} />
                <Text style={[styles.tierCount, { color: tierColor }]}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* HQ */}
        <View style={[styles.hq, { backgroundColor: hqBg, borderColor: hqBorder }]}>
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
  const isLight = isLightTheme();
  const scored = results.filter(r => r.trustScore);
  if (scored.length === 0) return null;

  const counts: Record<SourceTrustTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of scored) counts[r.trustScore!.tier]++;

  return (
    <View>
      <View style={[styles.distBar, { gap: isLight ? 1 : 2 }]}>
        {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
          const pct = (counts[tier] / scored.length) * 100;
          if (pct < 1) return null;
          const tierColor = getThemeTierColor(tier);
          const tierColorLight = getThemeTierColor(tier, 0.7);
          // Use as const for tuple type
          const gradientColors: [string, string] = [tierColor, tierColorLight] as const;
          return (
            <LinearGradient
              key={tier}
              colors={gradientColors}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.distSeg, { flex: pct, minWidth: isLight ? 6 : 4 }]}
            />
          );
        })}
      </View>
      <View style={styles.distLegend}>
        {([1, 2, 3, 4] as SourceTrustTier[]).map(tier => {
          const c = counts[tier];
          if (c === 0) return null;
          const tierColor = getThemeTierColor(tier);
          return (
            <View key={tier} style={styles.distLegendItem}>
              <View style={[styles.distLegendDot, { backgroundColor: tierColor }]} />
              <Text style={[styles.distLegendText, { color: tierColor }]}>{TIER_LABELS[tier]} · {c}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

// Styles that don't depend on theme (layout-only)
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  rowXs: { gap: 4 },
  
  pill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderRadius: RADIUS.full, 
    borderWidth: 1,
  },
  pillText: { 
    fontWeight: '700', 
    letterSpacing: 0.2,
  },
  scoreDot: { 
    width: 5, 
    height: 5, 
    borderRadius: 3, 
    marginRight: 4,
  },
  biasDot: { 
    width: 5, 
    height: 5, 
    borderRadius: 3, 
    marginRight: 3,
  },

  bannerWrap: { 
    borderRadius: RADIUS.lg, 
    overflow: 'hidden', 
    borderWidth: 1, 
    marginBottom: 12,
  },
  banner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12,
  },

  ringOuter: { 
    width: 52, 
    height: 52, 
    borderRadius: 26, 
    borderWidth: 2, 
    padding: 3,
  },
  ringInner: { 
    flex: 1, 
    borderRadius: 22, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  ringValue: { 
    fontSize: 15, 
    fontWeight: '900',
  },
  ringLabel: { 
    fontSize: 7.5, 
    fontWeight: '800', 
    letterSpacing: 1,
  },

  bannerTitle: { 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '800',
  },
  bannerSub: { 
    fontSize: FONTS.sizes.xs, 
    marginTop: 2,
  },

  tierCol: { 
    gap: 3, 
    marginRight: 10,
  },
  tierRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
  },
  tierDot: { 
    width: 7, 
    height: 7, 
    borderRadius: 4,
  },
  tierCount: { 
    fontSize: 9, 
    fontWeight: '800',
  },

  hq: { 
    alignItems: 'center', 
    borderRadius: RADIUS.md, 
    borderWidth: 1, 
    paddingHorizontal: 9, 
    paddingVertical: 5,
  },
  hqValue: { 
    fontSize: 14, 
    fontWeight: '900',
  },
  hqLabel: { 
    fontSize: 8, 
    fontWeight: '800', 
    letterSpacing: 1,
  },

  distBar: { 
    flexDirection: 'row', 
    height: 8, 
    borderRadius: RADIUS.full, 
    overflow: 'hidden', 
    marginBottom: 7,
  },
  distSeg: { 
    borderRadius: RADIUS.full,
  },
  distLegend: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8,
  },
  distLegendItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
  },
  distLegendDot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3,
  },
  distLegendText: { 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '700',
  },
});