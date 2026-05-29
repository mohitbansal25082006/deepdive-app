// src/components/knowledgeBase/KBEmptyState.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic.
// No floating orbs. No springify bounce. Clean FadeIn/FadeInDown entrances.
// All props/logic unchanged.

import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { KB_SUGGESTED_QUERIES, KBSuggestedQuery } from '../../types/knowledgeBase';
import { COLORS, FONTS, SPACING, RADIUS }          from '../../constants/theme';

interface Props {
  hasReports:    boolean;
  indexedCount:  number;
  totalCount:    number;
  onQueryPress:  (query: string) => void;
  onStartSearch: () => void;
}

// ─── Section label (matches research-input style) ─────────────────────────────
function SectionLabel({ text, color = COLORS.primary }: { text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
      <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: color }} />
      <Text style={{
        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
        letterSpacing: 1.2, textTransform: 'uppercase',
      }}>
        {text}
      </Text>
    </View>
  );
}

// ─── No-reports onboarding ────────────────────────────────────────────────────
function NoReportsState() {
  const STEPS = [
    { icon: 'search-outline',        label: 'Run a research query from the Home tab' },
    { icon: 'document-text-outline', label: 'Wait for your report to complete' },
    { icon: 'sparkles-outline',      label: 'Come back here and ask questions' },
  ];
  return (
    <View style={styles.noReportsWrap}>
      <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', width: '100%' }}>
        {/* Icon card */}
        <LinearGradient colors={['#1A1235', '#0F0F22']} style={styles.noReportsCard}>
          <LinearGradient colors={[`${COLORS.primary}40`, 'transparent']} style={styles.cardGlow} />
          <LinearGradient colors={['#7C3AED', '#6C63FF']} style={styles.heroIconOrb}>
            <Ionicons name="library-outline" size={36} color="#FFF" />
          </LinearGradient>
          <Text style={styles.noReportsTitle}>Knowledge Base is Empty</Text>
          <Text style={styles.noReportsSubtitle}>
            Complete at least one research session to build your personal AI second brain.
          </Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(350).delay(100)} style={{ width: '100%' }}>
        <SectionLabel text="Get started" />
        {STEPS.map((step, i) => (
          <Animated.View key={i} entering={FadeInLeft.duration(350).delay(120 + i * 70)}>
            <View style={styles.stepRow}>
              <View style={styles.stepNumOrb}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={styles.stepIconWrap}>
                <Ionicons name={step.icon as any} size={15} color={COLORS.primary} />
              </View>
              <Text style={styles.stepLabel}>{step.label}</Text>
            </View>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────
function SuggestionCard({
  suggestion, index, onPress,
}: { suggestion: KBSuggestedQuery; index: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 50)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.suggCard, { borderColor: `${suggestion.gradient[0]}30` }, pressed && { opacity: 0.80 }]}
      >
        {/* Top accent line */}
        <LinearGradient colors={suggestion.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.suggTopLine} />

        <View style={styles.suggBody}>
          {/* Icon orb */}
          <LinearGradient colors={suggestion.gradient} style={styles.suggIconOrb}>
            <Ionicons name={suggestion.icon as any} size={16} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={styles.suggLabel}>{suggestion.label}</Text>
            <Text style={styles.suggQuery} numberOfLines={2}>{suggestion.query}</Text>
          </View>

          {/* Arrow */}
          <View style={[styles.suggArrow, { backgroundColor: `${suggestion.gradient[0]}15`, borderColor: `${suggestion.gradient[0]}28` }]}>
            <Ionicons name="arrow-forward" size={12} color={suggestion.gradient[0]} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function KBEmptyState({
  hasReports, indexedCount, totalCount, onQueryPress, onStartSearch,
}: Props) {
  if (!hasReports) return <NoReportsState />;

  const CAPS = [
    { icon: 'search-outline',      label: 'Find anything',    desc: 'Search across all reports' },
    { icon: 'git-compare-outline', label: 'Compare topics',   desc: 'Connect findings together' },
    { icon: 'bar-chart-outline',   label: 'Surface stats',    desc: 'All data in one place' },
    { icon: 'telescope-outline',   label: 'Spot trends',      desc: 'Patterns over time' },
    { icon: 'bulb-outline',        label: 'Synthesize',       desc: 'Connect the dots' },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Hero card ──────────────────────────────────────────────── */}
      <Animated.View entering={FadeIn.duration(400)}>
        <LinearGradient colors={['#1A1235', '#0F0F22']} style={styles.heroCard}>
          <LinearGradient colors={[`${COLORS.primary}40`, 'transparent']} style={styles.cardGlow} />
          <LinearGradient colors={['#7C3AED', '#6C63FF']} style={styles.heroCardIcon}>
            <Ionicons name="library" size={28} color="#FFF" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Your Personal Knowledge Base</Text>
          <Text style={styles.heroSubtitle}>
            Ask questions across all {totalCount} report{totalCount !== 1 ? 's' : ''} simultaneously.
            {'\n'}
            {indexedCount < totalCount
              ? `${indexedCount}/${totalCount} reports indexed and searchable.`
              : `All ${totalCount} reports indexed and ready.`}
          </Text>
          <Pressable
            onPress={onStartSearch}
            style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.82 }]}
          >
            <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroBtnGrad}>
              <Ionicons name="sparkles" size={15} color="#FFF" />
              <Text style={styles.heroBtnText}>Ask your Knowledge Base</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Animated.View>

      {/* ── Capability chips ───────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(350).delay(80)}>
        <SectionLabel text="What you can ask" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CAPS.map((cap, i) => (
            <View key={i} style={styles.capCard}>
              <View style={styles.capIconWrap}>
                <Ionicons name={cap.icon as any} size={15} color={COLORS.primary} />
              </View>
              <Text style={styles.capLabel}>{cap.label}</Text>
              <Text style={styles.capDesc}>{cap.desc}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Suggested queries ──────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(350).delay(160)}>
        <SectionLabel text="Try these questions" />
        <View style={{ gap: SPACING.sm }}>
          {KB_SUGGESTED_QUERIES.map((s, i) => (
            <SuggestionCard key={s.label} suggestion={s} index={i} onPress={() => onQueryPress(s.query)} />
          ))}
        </View>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.lg },

  // No-reports
  noReportsWrap: { flex: 1, padding: SPACING.xl, gap: SPACING.lg },
  noReportsCard: { borderRadius: RADIUS.xl, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}22`, overflow: 'hidden', marginBottom: SPACING.sm },
  heroIconOrb: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  noReportsTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  noReportsSubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}15` },
  stepNumOrb: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '800' },
  stepIconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}12`, borderWidth: 1, borderColor: `${COLORS.primary}22`, flexShrink: 0 },
  stepLabel: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 18 },

  // Hero card
  heroCard: { borderRadius: RADIUS.xl, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}22`, overflow: 'hidden' },
  cardGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  heroCardIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  heroTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  heroSubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  heroBtn: { alignSelf: 'stretch', marginTop: SPACING.xs },
  heroBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: RADIUS.lg },
  heroBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },

  // Caps
  capCard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems: 'center', gap: 5, width: 104, marginRight: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}18` },
  capIconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}12`, borderWidth: 1, borderColor: `${COLORS.primary}22` },
  capLabel: { color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center' },
  capDesc:  { color: COLORS.textMuted,   fontSize: 9, textAlign: 'center', lineHeight: 13 },

  // Suggestion card
  suggCard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden', marginBottom: 0 },
  suggTopLine: { height: 1.5 },
  suggBody: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm },
  suggIconOrb: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  suggLabel: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 },
  suggQuery: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 },
  suggArrow: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
});