// src/components/workspace/CommentReactionBar.tsx
// Part 11 — Emoji reaction chips shown below each comment.
// FIX: summaries defaults to [] so .some() never crashes on undefined.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CommentReactionSummary, REACTION_EMOJIS } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Per-emoji accent colours ─────────────────────────────────────────────────

const EMOJI_COLORS: Record<string, string> = {
  '👍': COLORS.primary,
  '✅': COLORS.success,
  '❓': COLORS.warning,
  '🔥': '#FF6B35',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Reaction summaries for this comment — may be undefined while loading */
  summaries?:  CommentReactionSummary[];
  onToggle:    (emoji: string) => void;
  disabled?:   boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommentReactionBar({ summaries = [], onToggle, disabled = false }: Props) {
  // Always treat as array, even if caller accidentally passes undefined
  const safeSummaries: CommentReactionSummary[] = Array.isArray(summaries) ? summaries : [];

  // Build a lookup map from the summaries we received
  const summaryMap: Record<string, CommentReactionSummary> = {};
  for (const s of safeSummaries) {
    summaryMap[s.emoji] = s;
  }

  // Only show bar if there are any reactions already OR if interactions are enabled
  const hasAnyReactions = safeSummaries.some((s) => s.count > 0);
  if (!hasAnyReactions && disabled) return null;

  return (
    <View style={styles.bar}>
      {REACTION_EMOJIS.map((emoji) => {
        const summary  = summaryMap[emoji];
        const count    = summary?.count    ?? 0;
        const reacted  = summary?.hasReacted ?? false;
        const color    = EMOJI_COLORS[emoji] ?? COLORS.primary;

        // Hide zero-count chips when others already have reactions (keeps bar tidy)
        if (count === 0 && hasAnyReactions) return null;

        return (
          <TouchableOpacity
            key={emoji}
            onPress={() => !disabled && onToggle(emoji)}
            disabled={disabled}
            activeOpacity={disabled ? 1 : 0.75}
            style={[
              styles.chip,
              reacted && { backgroundColor: `${color}20`, borderColor: `${color}50` },
              disabled && styles.chipDisabled,
            ]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            {count > 0 && (
              <Text style={[styles.count, reacted && { color }]}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginTop:     SPACING.sm,
  },
  chip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.full,
    borderWidth:     1,
    borderColor:     COLORS.border,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    minWidth:   10,
    textAlign:  'center',
  },
});