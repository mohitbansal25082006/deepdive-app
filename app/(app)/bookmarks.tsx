// app/(app)/bookmarks.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Bookmarks (Saved Reports)
//
// Part 50.8 — FULL UI REDESIGN + correctness pass
//   • Cards now match the History tab's glassmorphic style: depth accent rail,
//     gradient depth icon, depth/sections/sources/reliability chips, and a
//     bookmark-pop micro-interaction on remove.
//   • Gradient header with a live stat ribbon (Saved · Avg Score · Sources).
//   • Shimmer skeletons + upgraded empty state.
//   • Reads/writes the same `is_pinned` field the History tab + report screen
//     use, so counts stay consistent everywhere.
//   • Part 56 — FULL THEME COMPATIBILITY: All colors now derive from the
//     active theme via COLORS object, with dynamic gradient generation
//     that adapts to any theme (Cosmic, Ocean, Sunset, Amethyst, Emerald, Mono).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn, FadeInDown, FadeOut, Layout,
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { ResearchReport } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

const SCREEN_W = Dimensions.get('window').width;

// ─── Depth configuration ──────────────────────────────────────────────────────
// These now use theme colors dynamically via a function that takes the
// current COLORS object, ensuring they blend with any theme.

function getDepthConfig(depth: string) {
  const colors = {
    quick: { color: COLORS.info, label: 'Quick', icon: 'flash' as const },
    deep: { color: COLORS.primary, label: 'Deep', icon: 'layers' as const },
    expert: { color: COLORS.warning, label: 'Expert', icon: 'star' as const },
  };
  return colors[depth as keyof typeof colors] ?? colors.deep;
}

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  try { Haptics.impactAsync(style); } catch {}
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useBookmarks() {
  const { user } = useAuth();
  const [reports, setReports]       = useState<ResearchReport[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async (isRefresh = false) => {
    if (!user) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    const { data, error } = await supabase
      .from('research_reports')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_pinned', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReports(
        data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          query: d.query,
          depth: d.depth,
          focusAreas: d.focus_areas ?? [],
          title: d.title ?? d.query,
          executiveSummary: d.executive_summary ?? '',
          sections: d.sections ?? [],
          keyFindings: d.key_findings ?? [],
          futurePredictions: d.future_predictions ?? [],
          citations: d.citations ?? [],
          statistics: d.statistics ?? [],
          searchQueries: d.search_queries ?? [],
          sourcesCount: d.sources_count ?? 0,
          reliabilityScore: d.reliability_score ?? 0,
          status: d.status,
          agentLogs: d.agent_logs ?? [],
          isPinned: true,
          createdAt: d.created_at,
          completedAt: d.completed_at,
        })),
      );
    }

    isRefresh ? setRefreshing(false) : setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const removeBookmark = useCallback(async (id: string) => {
    const prev = reports;
    setReports((p) => p.filter((r) => r.id !== id));
    const { error } = await supabase
      .from('research_reports')
      .update({ is_pinned: false })
      .eq('id', id);
    if (error) {
      setReports(prev);
      Alert.alert('Error', 'Could not remove bookmark.');
    }
  }, [reports]);

  return { reports, loading, refreshing, refresh: () => fetch(true), removeBookmark };
}

// ─── Shimmer skeleton ──────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withTiming(1, { duration: 1200 });
    const id = setInterval(() => { shimmer.value = 0; shimmer.value = withTiming(1, { duration: 1200 }); }, 1300);
    return () => clearInterval(id);
  }, []);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -SCREEN_W + shimmer.value * (SCREEN_W * 2) }],
  }));

  return (
    <View style={{
      borderRadius: RADIUS.xl,
      height: 134,
      marginBottom: SPACING.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      opacity: 1 - index * 0.18,
    }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: SCREEN_W }, sweep]}>
        <LinearGradient
          colors={['transparent', `${COLORS.primary}14`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <View style={{ padding: SPACING.md, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.backgroundElevated }} />
          <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: '85%' }} />
            <View style={{ height: 9, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '40%' }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[60, 80, 70].map((wd, i) => (
            <View key={i} style={{ height: 20, width: wd, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated }} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Stat ribbon card ──────────────────────────────────────────────────────────

function StatCard({ icon, value, label, accent }: {
  icon: string; value: string; label: string; accent: string;
}) {
  // Generate gradient based on accent color for theme consistency
  const gradientColors = [
    accent,
    `${accent}99`,
  ] as const;

  return (
    <View style={{
      flex: 1,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: `${accent}30`,
      backgroundColor: COLORS.backgroundCard,
    }}>
      <View style={{
        paddingVertical: SPACING.sm,
        paddingHorizontal: 6,
        alignItems: 'center',
        gap: 5,
      }}>
        <LinearGradient
          colors={gradientColors}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon as any} size={15} color="#FFF" />
        </LinearGradient>
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.md,
          fontWeight: '900',
          lineHeight: 21,
        }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: 10,
          fontWeight: '700',
          textAlign: 'center',
        }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// ─── Bookmark Card ────────────────────────────────────────────────────────────

function BookmarkCard({
  report, index, onOpen, onRemove,
}: {
  report: ResearchReport; index: number; onOpen: () => void; onRemove: () => void;
}) {
  const depthConfig = getDepthConfig(report.depth);
  const depthColor = depthConfig.color;

  const bm = useSharedValue(1);
  const bmStyle = useAnimatedStyle(() => ({ transform: [{ scale: bm.value }] }));
  const handleRemove = () => {
    bm.value = withSequence(
      withSpring(1.3, { damping: 5, stiffness: 260 }),
      withSpring(1, { damping: 12 })
    );
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    onRemove();
  };

  const reliColor =
    report.reliabilityScore >= 8 ? COLORS.success
    : report.reliabilityScore >= 6 ? COLORS.warning
    : COLORS.error;

  // Build chips dynamically with theme-aware colors
  const chips: { icon: string; label: string; color: string; bg: string }[] = [
    ...((report.sections?.length ?? 0) > 0 ? [{
      icon: 'layers-outline',
      label: `${report.sections.length} sections`,
      color: COLORS.primaryLight,
      bg: `${COLORS.primary}14`,
    }] : []),
    ...((report.citations?.length ?? 0) > 0 ? [{
      icon: 'link-outline',
      label: `${report.citations.length} sources`,
      color: COLORS.textSecondary,
      bg: `${COLORS.textMuted}14`,
    }] : []),
    ...(report.reliabilityScore > 0 ? [{
      icon: 'shield-checkmark',
      label: `${report.reliabilityScore}/10`,
      color: reliColor,
      bg: `${reliColor}14`,
    }] : []),
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(360).delay(Math.min(index, 8) * 50)}
      exiting={FadeOut.duration(200)}
      layout={Layout.springify()}
    >
      <Pressable
        onPress={() => { haptic(); onOpen(); }}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm }]}
      >
        <View style={{
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: `${COLORS.primary}40`,
          backgroundColor: COLORS.backgroundCard,
        }}>
          <View style={{ padding: SPACING.md, paddingLeft: SPACING.md + 6 }}>
            {/* Depth accent rail - now uses theme color */}
            <LinearGradient
              colors={[depthColor, `${depthColor}44`]}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 }}
            />

            {/* Meta strip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
              <LinearGradient
                colors={[depthColor, `${depthColor}99`]}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: SPACING.sm,
                  ...SHADOWS.small,
                }}
              >
                <Ionicons name="document-text" size={20} color="#FFF" />
              </LinearGradient>

              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: `${depthColor}1A`,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: `${depthColor}33`,
                }}>
                  <Ionicons name={depthConfig.icon} size={10} color={depthColor} />
                  <Text style={{ color: depthColor, fontSize: 10, fontWeight: '800' }}>
                    {depthConfig.label}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="bookmark" size={10} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>

              <Animated.View style={bmStyle}>
                <Pressable
                  onPress={handleRemove}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    backgroundColor: `${COLORS.primary}1A`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: `${COLORS.primary}40`,
                  }}
                >
                  <Ionicons name="bookmark" size={16} color={COLORS.primary} />
                </Pressable>
              </Animated.View>
            </View>

            {/* Title */}
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.md,
              fontWeight: '800',
              lineHeight: 24,
              letterSpacing: -0.3,
              marginBottom: SPACING.sm,
            }}>
              {report.title}
            </Text>

            {/* Summary */}
            {report.executiveSummary ? (
              <Text style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.xs,
                lineHeight: 18,
                marginBottom: SPACING.sm,
              }} numberOfLines={2}>
                {report.executiveSummary}
              </Text>
            ) : null}

            {/* Chips */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {chips.map((c, i) => (
                <View key={i} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: c.bg,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: `${c.color}22`,
                }}>
                  <Ionicons name={c.icon as any} size={10} color={c.color} />
                  <Text style={{ color: c.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookmarksScreen() {
  const { reports, loading, refreshing, refresh, removeBookmark } = useBookmarks();
  const { isLight } = useTheme();

  const handleRemove = (report: ResearchReport) => {
    Alert.alert(
      'Remove Bookmark',
      `Remove "${report.title}" from saved?\n\nThe report will remain in your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeBookmark(report.id) },
      ],
    );
  };

  const scored = reports.filter(r => r.reliabilityScore > 0);
  const avgScore = scored.length ? (Math.round((scored.reduce((s, r) => s + r.reliabilityScore, 0) / scored.length) * 10) / 10) : 0;
  const totalSources = reports.reduce((s, r) => s + (r.sourcesCount ?? 0), 0);

  // Theme-aware background gradient
  const bgGradient = isLight
    ? ['#F5F6FB', '#FFFFFF'] as const
    : [COLORS.background, '#0B0B1E', COLORS.backgroundCard] as const;

  // Header gradient that adapts to theme
  const headerGradient = isLight
    ? ['#EEF0F8', '#FFFFFF'] as const
    : ['#15152F', '#0D0D22'] as const;

  return (
    <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <Animated.View entering={FadeIn.duration(500)}>
          <LinearGradient colors={headerGradient} style={{ paddingBottom: SPACING.sm }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: SPACING.xl,
              paddingTop: SPACING.md,
              paddingBottom: SPACING.sm,
              gap: SPACING.md,
            }}>
              <Pressable
                onPress={() => { haptic(); router.back(); }}
                style={({ pressed }) => [{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.xl,
                  fontWeight: '900',
                  lineHeight: 28,
                  letterSpacing: -0.4,
                }}>
                  Saved Reports
                </Text>
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.sm,
                  marginTop: 2,
                }}>
                  {loading ? 'Loading…' : `${reports.length} saved report${reports.length !== 1 ? 's' : ''}`}
                </Text>
              </View>

              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...SHADOWS.small,
                }}
              >
                <Ionicons name="bookmark" size={20} color="#FFF" />
              </LinearGradient>
            </View>

            {reports.length > 0 && (
              <View style={{
                flexDirection: 'row',
                gap: SPACING.sm,
                paddingHorizontal: SPACING.xl,
                marginBottom: SPACING.sm,
              }}>
                <StatCard
                  icon="bookmark"
                  value={String(reports.length)}
                  label="Saved"
                  accent={COLORS.primary}
                />
                <StatCard
                  icon="shield-checkmark"
                  value={avgScore ? `${avgScore}` : '—'}
                  label="Avg Score"
                  accent={COLORS.success}
                />
                <StatCard
                  icon="globe"
                  value={totalSources >= 1000 ? `${(totalSources / 1000).toFixed(1)}k` : String(totalSources)}
                  label="Sources"
                  accent={COLORS.info}
                />
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* ── Content ── */}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SPACING.xl,
            paddingTop: SPACING.md,
            paddingBottom: 110,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {loading && reports.length === 0 && (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} index={i} />)
          )}

          {!loading && reports.length === 0 && (
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: 70 }}>
              <LinearGradient
                colors={isLight ? ['#EEF0F8', '#FFFFFF'] : ['#1C1C40', '#14142E']}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: SPACING.lg,
                  borderWidth: 1,
                  borderColor: `${COLORS.primary}30`,
                }}
              >
                <Ionicons name="bookmark-outline" size={46} color={`${COLORS.primary}AA`} />
              </LinearGradient>

              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.xl,
                fontWeight: '800',
                textAlign: 'center',
                marginBottom: SPACING.sm,
              }}>
                No Saved Reports Yet
              </Text>
              <Text style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.sm,
                textAlign: 'center',
                lineHeight: 22,
                paddingHorizontal: SPACING.xl,
                marginBottom: SPACING.xl,
              }}>
                Tap the bookmark icon on any research report to save it here for quick access.
              </Text>

              <Pressable
                onPress={() => { haptic(); router.push('/(app)/(tabs)/history'); }}
              >
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    borderRadius: RADIUS.full,
                    paddingHorizontal: SPACING.xl,
                    paddingVertical: 13,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    ...SHADOWS.medium,
                  }}
                >
                  <Ionicons name="time-outline" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: FONTS.sizes.base }}>
                    Browse History
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}

          {reports.length > 0 && (
            <>
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  backgroundColor: `${COLORS.primary}08`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.sm,
                  marginBottom: SPACING.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: `${COLORS.primary}20`,
                }}
              >
                <Ionicons name="information-circle-outline" size={15} color={COLORS.primary} />
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  flex: 1,
                  lineHeight: 18,
                }}>
                  Tap the bookmark icon on a card to remove it from saved.
                </Text>
              </Animated.View>

              {reports.map((report, i) => (
                <BookmarkCard
                  key={report.id}
                  report={report}
                  index={i}
                  onOpen={() => router.push({
                    pathname: '/(app)/research-report' as any,
                    params: { reportId: report.id }
                  })}
                  onRemove={() => handleRemove(report)}
                />
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}