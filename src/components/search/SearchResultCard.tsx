// src/components/search/SearchResultCard.tsx
// Part 35 — FIXED
//
// Changes:
//   • Removed internal router.push() calls — navigation now via onPress callback
//     passed from global-search.tsx. This prevents the modal freeze bug where
//     navigating from within a modal caused the screen to lock.
//   • Component is now a pure presentational card.

import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons }         from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SearchResult }     from '../../types/search';
import { CONTENT_TYPE_META } from '../../constants/search';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Semantic Score Badge ─────────────────────────────────────────────────────

function SemanticBadge({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color =
    pct >= 70 ? COLORS.success :
    pct >= 45 ? COLORS.primary :
    COLORS.warning;
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
      <Ionicons name="git-network-outline" size={9} color={color} />
      <Text style={[styles.badgeText, { color }]}>{pct}% match</Text>
    </View>
  );
}

// ─── Depth Badge ──────────────────────────────────────────────────────────────

function DepthBadge({ depth }: { depth: string }) {
  const color =
    depth === 'expert' ? COLORS.warning :
    depth === 'deep'   ? COLORS.primary :
    COLORS.info;
  return (
    <View style={[styles.badge, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
      <Text style={[styles.badgeText, { color }]}>
        {depth.charAt(0).toUpperCase() + depth.slice(1)}
      </Text>
    </View>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

interface SearchResultCardProps {
  result:  SearchResult;
  index:   number;
  query:   string;
  onPress: (result: SearchResult) => void;  // ← navigation handled by parent
}

function SearchResultCardComponent({ result, index, query, onPress }: SearchResultCardProps) {
  const meta = CONTENT_TYPE_META[result.contentType];

  const renderTitle = () => {
    const lower      = result.title.toLowerCase();
    const queryLower = query.toLowerCase().trim();
    if (!queryLower || !lower.includes(queryLower)) {
      return <Text style={styles.title} numberOfLines={2}>{result.title}</Text>;
    }
    const idx = lower.indexOf(queryLower);
    return (
      <Text style={styles.title} numberOfLines={2}>
        {result.title.slice(0, idx)}
        <Text style={[styles.title, { color: meta.color, fontWeight: '800' }]}>
          {result.title.slice(idx, idx + queryLower.length)}
        </Text>
        {result.title.slice(idx + queryLower.length)}
      </Text>
    );
  };

  const formattedDate = new Date(result.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const hasSemanticScore = (result.semanticScore ?? 0) > 0;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 40)}>
      <TouchableOpacity
        onPress={() => onPress(result)}
        activeOpacity={0.78}
        style={styles.card}
      >
        <View style={[styles.accentBar, { backgroundColor: meta.color }]} />

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
              <Ionicons name={meta.icon as any} size={17} color={meta.color} />
            </View>

            <View style={styles.titleWrap}>
              {renderTitle()}
              {result.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>{result.subtitle}</Text>
              ) : null}
            </View>

            <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} style={styles.chevron} />
          </View>

          {result.preview ? (
            <Text style={styles.preview} numberOfLines={2}>{result.preview}</Text>
          ) : null}

          <View style={styles.footerRow}>
            <View style={[styles.typeBadge, { backgroundColor: `${meta.color}15`, borderColor: `${meta.color}30` }]}>
              <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {result.depth ? <DepthBadge depth={result.depth} /> : null}
            {hasSemanticScore ? <SemanticBadge score={result.semanticScore!} /> : null}
            <View style={styles.spacer} />
            <Text style={styles.date}>{formattedDate}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const SearchResultCard = memo(SearchResultCardComponent);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    marginBottom:    SPACING.sm,
    borderWidth:     1,
    borderColor:     COLORS.border,
    overflow:        'hidden',
  },
  accentBar: {
    width: 3, alignSelf: 'stretch', borderRadius: 2,
  },
  content: {
    flex: 1, padding: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.xs, gap: SPACING.sm,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, borderWidth: 1,
  },
  titleWrap: {
    flex: 1, minWidth: 0,
  },
  title: {
    color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
    fontWeight: '700', lineHeight: 21,
  },
  subtitle: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2,
  },
  chevron: {
    marginTop: 2, flexShrink: 0,
  },
  preview: {
    color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
    lineHeight: 18, marginBottom: SPACING.sm,
  },
  footerRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
  },
  typeBadge: {
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: FONTS.sizes.xs, fontWeight: '700',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1,
  },
  badgeText: {
    fontSize: FONTS.sizes.xs, fontWeight: '700',
  },
  spacer: { flex: 1 },
  date: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
  },
});