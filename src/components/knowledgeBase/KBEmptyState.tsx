// src/components/knowledgeBase/KBEmptyState.tsx
// Part 26 — Personal AI Knowledge Base
//
// Shown when the KB chat has no messages yet.
// Two modes:
//   • hasReports = true  → Show suggested queries grid + hero prompt
//   • hasReports = false → Show onboarding state (do some research first)

import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  KB_SUGGESTED_QUERIES,
  KBSuggestedQuery,
} from '../../types/knowledgeBase';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  hasReports:    boolean;
  indexedCount:  number;
  totalCount:    number;
  onQueryPress:  (query: string) => void;
  onStartSearch: () => void;  // focuses the text input
}

// ─── No-reports state ─────────────────────────────────────────────────────────

function NoReportsState() {
  return (
    <Animated.View
      entering={FadeInDown.duration(500)}
      style={styles.noReportsWrap}
    >
      <LinearGradient
        colors={['#6C63FF30', '#8B5CF620']}
        style={styles.noReportsIcon}
      >
        <Ionicons name="library-outline" size={40} color={COLORS.primary} />
      </LinearGradient>

      <Text style={styles.noReportsTitle}>Your Knowledge Base is Empty</Text>
      <Text style={styles.noReportsSubtitle}>
        Complete at least one research session to start building your personal AI knowledge base.
        Once you have reports, you can ask questions across all of them simultaneously.
      </Text>

      <View style={styles.stepsList}>
        {[
          { icon: 'search-outline',       label: 'Run a research query from the Home tab' },
          { icon: 'document-text-outline',label: 'Wait for your report to complete' },
          { icon: 'sparkles-outline',     label: 'Come back here and start asking questions' },
        ].map((step, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{i + 1}</Text>
            </View>
            <Ionicons name={step.icon as any} size={16} color={COLORS.primary} />
            <Text style={styles.stepLabel}>{step.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  index,
  onPress,
}: {
  suggestion: KBSuggestedQuery;
  index:      number;
  onPress:    () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.suggestionCard,
          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
        ]}
      >
        {/* Gradient accent top bar */}
        <LinearGradient
          colors={suggestion.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.suggestionAccentBar}
        />

        <View style={styles.suggestionBody}>
          {/* Icon */}
          <LinearGradient
            colors={suggestion.gradient}
            style={styles.suggestionIcon}
          >
            <Ionicons name={suggestion.icon as any} size={16} color="#FFF" />
          </LinearGradient>

          {/* Text */}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
            <Text style={styles.suggestionQuery} numberOfLines={2}>
              {suggestion.query}
            </Text>
          </View>

          {/* Arrow */}
          <Ionicons
            name="arrow-forward-circle-outline"
            size={18}
            color={suggestion.gradient[0]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KBEmptyState({
  hasReports,
  indexedCount,
  totalCount,
  onQueryPress,
  onStartSearch,
}: Props) {
  if (!hasReports) {
    return <NoReportsState />;
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <LinearGradient
          colors={['#6C63FF', '#8B5CF6']}
          style={styles.heroIcon}
        >
          <Ionicons name="library" size={32} color="#FFF" />
        </LinearGradient>

        <Text style={styles.heroTitle}>Your Personal Knowledge Base</Text>
        <Text style={styles.heroSubtitle}>
          Ask questions across all {totalCount} of your research report{totalCount !== 1 ? 's' : ''} simultaneously.
          {'\n'}
          {indexedCount < totalCount
            ? `${indexedCount}/${totalCount} reports indexed and searchable.`
            : `All ${totalCount} reports are indexed and ready.`}
        </Text>

        {/* Ask anything button */}
        <Pressable
          onPress={onStartSearch}
          style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={COLORS.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.heroBtnGrad}
          >
            <Ionicons name="sparkles" size={16} color="#FFF" />
            <Text style={styles.heroBtnText}>Ask your Knowledge Base</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      {/* ── Capabilities strip ───────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(500).delay(100)}>
        <Text style={styles.sectionHeader}>What you can ask</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.capsRow}
        >
          {[
            { icon: 'search-outline',     label: 'Find anything',          desc: 'Search across all reports' },
            { icon: 'git-compare-outline',label: 'Compare topics',         desc: 'Link findings together' },
            { icon: 'bar-chart-outline',  label: 'Surface statistics',     desc: 'All your data in one place' },
            { icon: 'telescope-outline',  label: 'Trend analysis',         desc: 'Spot patterns over time' },
            { icon: 'bulb-outline',       label: 'Synthesize insights',    desc: 'Connect the dots' },
          ].map((cap, i) => (
            <View key={i} style={styles.capCard}>
              <Ionicons name={cap.icon as any} size={18} color={COLORS.primary} />
              <Text style={styles.capLabel}>{cap.label}</Text>
              <Text style={styles.capDesc}>{cap.desc}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Suggested queries ────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(500).delay(200)}>
        <Text style={styles.sectionHeader}>Try these questions</Text>
        <View style={styles.suggestionsGrid}>
          {KB_SUGGESTED_QUERIES.map((suggestion, i) => (
            <SuggestionCard
              key={suggestion.label}
              suggestion={suggestion}
              index={i}
              onPress={() => onQueryPress(suggestion.query)}
            />
          ))}
        </View>
      </Animated.View>

      {/* ── Bottom padding ───────────────────────────────────────────────── */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    gap:               SPACING.lg,
  },

  // ── No reports ────────────────────────────────────────────────────────────
  noReportsWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
    gap:            SPACING.md,
  },
  noReportsIcon: {
    width:          88,
    height:         88,
    borderRadius:   24,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.sm,
  },
  noReportsTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
    textAlign:  'center',
  },
  noReportsSubtitle: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.sm,
    textAlign:  'center',
    lineHeight: 21,
  },
  stepsList: {
    alignSelf: 'stretch',
    gap:       SPACING.sm,
    marginTop: SPACING.sm,
  },
  stepItem: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.md,
    padding:         SPACING.sm,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  stepNumber: {
    width:          22,
    height:         22,
    borderRadius:   11,
    backgroundColor: COLORS.primary,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  stepNumberText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.xs,
    fontWeight: '800',
  },
  stepLabel: {
    color:     COLORS.textSecondary,
    fontSize:  FONTS.sizes.sm,
    flex:      1,
    lineHeight: 18,
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    alignItems:      'center',
    gap:              SPACING.sm,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     COLORS.primary + '25',
    padding:         SPACING.lg,
  },
  heroIcon: {
    width:          72,
    height:         72,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.xs,
  },
  heroTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
    textAlign:  'center',
  },
  heroSubtitle: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.sm,
    textAlign:  'center',
    lineHeight: 21,
  },
  heroBtn: {
    alignSelf:  'stretch',
    marginTop:  SPACING.xs,
    borderRadius: RADIUS.lg,
    overflow:   'hidden',
  },
  heroBtnGrad: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             8,
    paddingVertical: 14,
    borderRadius:   RADIUS.lg,
  },
  heroBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },

  // ── Section header ────────────────────────────────────────────────────────
  sectionHeader: {
    color:         COLORS.textMuted,
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  SPACING.sm,
  },

  // ── Capabilities ──────────────────────────────────────────────────────────
  capsRow: {
    flexDirection: 'row',
    gap:            SPACING.sm,
    paddingRight:  SPACING.md,
  },
  capCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.sm,
    alignItems:      'center',
    gap:              6,
    width:           110,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  capLabel: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    textAlign:  'center',
  },
  capDesc: {
    color:     COLORS.textMuted,
    fontSize:  9,
    textAlign: 'center',
    lineHeight: 14,
  },

  // ── Suggestion cards ──────────────────────────────────────────────────────
  suggestionsGrid: {
    gap: SPACING.sm,
  },
  suggestionCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     COLORS.border,
    overflow:        'hidden',
  },
  suggestionAccentBar: {
    height: 2,
  },
  suggestionBody: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.sm,
    padding:       SPACING.sm,
  },
  suggestionIcon: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  suggestionLabel: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  suggestionQuery: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    lineHeight: 17,
  },
});