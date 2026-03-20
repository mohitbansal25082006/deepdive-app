// src/components/knowledgeBase/KBSourceReportChip.tsx
// Part 26 — Personal AI Knowledge Base
//
// Displays one "source report" chip beneath an assistant message.
// Shows:
//   • Report title (truncated)
//   • Similarity percentage (how relevant this report was)
//   • Number of chunks retrieved
//   • Chunk type icons (section, finding, statistic, etc.)
//   • Tap → navigate to that report (optional via onPress)
//
// Used in KBMessageBubble's source attribution row.

import React from 'react';
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { KBSourceReport } from '../../types/knowledgeBase';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Chunk type → icon mapping ────────────────────────────────────────────────

const CHUNK_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  summary:    { icon: 'document-text-outline',   color: '#6C63FF' },
  section:    { icon: 'list-outline',             color: '#29B6F6' },
  finding:    { icon: 'bulb-outline',             color: '#43E97B' },
  prediction: { icon: 'telescope-outline',        color: '#FFA726' },
  statistic:  { icon: 'bar-chart-outline',        color: '#FF6584' },
  citation:   { icon: 'link-outline',             color: '#AB47BC' },
};

function getChunkIcon(type: string) {
  return CHUNK_TYPE_ICONS[type] ?? { icon: 'document-outline', color: COLORS.textMuted };
}

// ─── Similarity → color ───────────────────────────────────────────────────────

function getSimilarityColor(sim: number): string {
  if (sim >= 0.7) return COLORS.success;
  if (sim >= 0.5) return COLORS.primary;
  if (sim >= 0.35) return COLORS.warning;
  return COLORS.textMuted;
}

function getSimilarityLabel(sim: number): string {
  if (sim >= 0.7) return 'High';
  if (sim >= 0.5) return 'Good';
  if (sim >= 0.35) return 'Partial';
  return 'Low';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  source:   KBSourceReport;
  index:    number;          // used for gradient rotation
  onPress?: () => void;
  compact?: boolean;         // compact = just title + sim pill (for overflow row)
}

// ─── Gradient palette (same as personalization) ───────────────────────────────

const GRADIENTS: readonly [string, string][] = [
  ['#6C63FF', '#8B5CF6'],
  ['#FF6584', '#FF8E53'],
  ['#43E97B', '#38F9D7'],
  ['#F093FB', '#F5576C'],
  ['#4FACFE', '#00F2FE'],
  ['#FA709A', '#FEE140'],
  ['#30CFD0', '#667EEA'],
];

// ─── Component ────────────────────────────────────────────────────────────────

export function KBSourceReportChip({ source, index, onPress, compact = false }: Props) {
  const gradient   = GRADIENTS[index % GRADIENTS.length];
  const simColor   = getSimilarityColor(source.topSimilarity);
  const simLabel   = getSimilarityLabel(source.topSimilarity);
  const simPct     = Math.round(source.topSimilarity * 100);

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.compactChip, pressed && { opacity: 0.75 }]}
      >
        <View style={[styles.compactDot, { backgroundColor: gradient[0] }]} />
        <Text style={styles.compactTitle} numberOfLines={1}>
          {source.reportTitle}
        </Text>
        <View style={[styles.simMini, { backgroundColor: simColor + '18', borderColor: simColor + '35' }]}>
          <Text style={[styles.simMiniText, { color: simColor }]}>{simPct}%</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}
      disabled={!onPress}
    >
      {/* Left accent bar */}
      <LinearGradient
        colors={gradient}
        style={styles.accentBar}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Content */}
      <View style={styles.chipBody}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Ionicons name="document-text-outline" size={11} color={gradient[0]} />
          <Text style={styles.title} numberOfLines={2}>
            {source.reportTitle}
          </Text>
          {onPress && (
            <Ionicons
              name="arrow-forward-outline"
              size={11}
              color={COLORS.textMuted}
              style={{ marginLeft: 'auto' }}
            />
          )}
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {/* Similarity badge */}
          <View style={[
            styles.simBadge,
            { backgroundColor: simColor + '15', borderColor: simColor + '30' },
          ]}>
            <View style={[styles.simDot, { backgroundColor: simColor }]} />
            <Text style={[styles.simText, { color: simColor }]}>
              {simLabel} · {simPct}%
            </Text>
          </View>

          {/* Chunk count */}
          <View style={styles.chunkBadge}>
            <Ionicons name="layers-outline" size={9} color={COLORS.textMuted} />
            <Text style={styles.chunkText}>
              {source.chunkCount} section{source.chunkCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Chunk type icons */}
        {source.chunkTypes.length > 0 && (
          <View style={styles.typeRow}>
            {source.chunkTypes.slice(0, 5).map(type => {
              const cfg = getChunkIcon(type);
              return (
                <View key={type} style={[styles.typeChip, { borderColor: cfg.color + '30', backgroundColor: cfg.color + '10' }]}>
                  <Ionicons name={cfg.icon as any} size={9} color={cfg.color} />
                  <Text style={[styles.typeLabel, { color: cfg.color }]}>{type}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chip: {
    flexDirection:   'row',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
    overflow:        'hidden',
    minWidth:        180,
    maxWidth:        260,
  },
  accentBar: {
    width:        3,
    flexShrink:   0,
  },
  chipBody: {
    flex:    1,
    padding: SPACING.sm,
    gap:     5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:            5,
  },
  title: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
    flex:       1,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            6,
    flexWrap:      'wrap',
  },
  simBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            4,
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderRadius:  RADIUS.full,
    borderWidth:   1,
  },
  simDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },
  simText: {
    fontSize:   9,
    fontWeight: '700',
  },
  chunkBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:  RADIUS.full,
    backgroundColor: COLORS.backgroundCard,
    borderWidth:   1,
    borderColor:   COLORS.border,
  },
  chunkText: {
    color:     COLORS.textMuted,
    fontSize:  9,
    fontWeight: '500',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            3,
    paddingHorizontal: 5,
    paddingVertical:   2,
    borderRadius:  4,
    borderWidth:   1,
  },
  typeLabel: {
    fontSize:      9,
    fontWeight:    '600',
    textTransform: 'capitalize',
  },

  // ── Compact variant ──────────────────────────────────────────────────────
  compactChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              6,
    paddingHorizontal: 9,
    paddingVertical:   5,
    borderRadius:    RADIUS.full,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:     1,
    borderColor:     COLORS.border,
    maxWidth:        200,
  },
  compactDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    flexShrink:   0,
  },
  compactTitle: {
    color:     COLORS.textSecondary,
    fontSize:  FONTS.sizes.xs,
    flex:      1,
    fontWeight: '500',
  },
  simMini: {
    paddingHorizontal: 6,
    paddingVertical:   1,
    borderRadius:  RADIUS.full,
    borderWidth:   1,
  },
  simMiniText: {
    fontSize:   9,
    fontWeight: '700',
  },
});