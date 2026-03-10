// app/(app)/bookmarks.tsx
// Dedicated bookmarks screen — shows all is_pinned reports.
// Accessible from the history tab header (bookmark icon) or tab bar.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { ResearchReport } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = {
  quick: COLORS.info,
  deep: COLORS.primary,
  expert: COLORS.warning,
};

const DEPTH_LABEL: Record<string, string> = {
  quick: 'Quick',
  deep: 'Deep',
  expert: 'Expert',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useBookmarks() {
  const { user } = useAuth();
  const [reports, setReports]     = useState<ResearchReport[]>([]);
  const [loading, setLoading]     = useState(true);
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
    await supabase
      .from('research_reports')
      .update({ is_pinned: false })
      .eq('id', id);
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { reports, loading, refreshing, refresh: () => fetch(true), removeBookmark };
}

// ─── Bookmark Card ────────────────────────────────────────────────────────────

function BookmarkCard({
  report,
  index,
  onOpen,
  onRemove,
}: {
  report: ResearchReport;
  index: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const depthColor = DEPTH_COLOR[report.depth] ?? COLORS.primary;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 60)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.75}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: 1,
          borderColor: `${COLORS.warning}30`,
        }}
      >
        {/* ── Top row ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
          {/* Icon */}
          <View style={{
            width: 46, height: 46, borderRadius: 13,
            backgroundColor: `${COLORS.warning}15`,
            alignItems: 'center', justifyContent: 'center',
            marginRight: SPACING.sm,
            borderWidth: 1, borderColor: `${COLORS.warning}25`,
          }}>
            <Ionicons name="bookmark" size={22} color={COLORS.warning} />
          </View>

          {/* Title + date */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.base,
                fontWeight: '700',
                lineHeight: 20,
              }}
              numberOfLines={2}
            >
              {report.title}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>
              Bookmarked · {new Date(report.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {/* Remove bookmark */}
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ marginLeft: SPACING.sm }}
          >
            <Ionicons name="bookmark" size={22} color={COLORS.warning} />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        {report.executiveSummary ? (
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.xs,
              lineHeight: 18,
              marginBottom: SPACING.sm,
            }}
            numberOfLines={3}
          >
            {report.executiveSummary}
          </Text>
        ) : null}

        {/* Chips */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <View style={{
            backgroundColor: `${depthColor}15`,
            borderRadius: RADIUS.full,
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: depthColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {DEPTH_LABEL[report.depth]}
            </Text>
          </View>

          {(report.sections?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor: `${COLORS.primary}10`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}>
                {report.sections.length} sections
              </Text>
            </View>
          )}

          {report.reliabilityScore > 0 && (
            <View style={{
              backgroundColor: `${COLORS.success}10`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs }}>
                {report.reliabilityScore}/10 ✓
              </Text>
            </View>
          )}
        </View>

        {/* Open arrow */}
        <View style={{
          position: 'absolute',
          bottom: SPACING.md,
          right: SPACING.md,
        }}>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookmarksScreen() {
  const { reports, loading, refreshing, refresh, removeBookmark } = useBookmarks();

  const handleRemove = (report: ResearchReport) => {
    Alert.alert(
      'Remove Bookmark',
      `Remove "${report.title}" from bookmarks?\n\nThe report will remain in your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBookmark(report.id),
        },
      ],
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.xl,
            paddingBottom: SPACING.md,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.md,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Bookmarks
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              {loading
                ? 'Loading...'
                : `${reports.length} saved report${reports.length !== 1 ? 's' : ''}`}
            </Text>
          </View>

          {/* Gold bookmark icon badge */}
          <View style={{
            width: 44, height: 44, borderRadius: 13,
            backgroundColor: `${COLORS.warning}15`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: `${COLORS.warning}30`,
          }}>
            <Ionicons name="bookmark" size={22} color={COLORS.warning} />
          </View>
        </Animated.View>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{
            padding: SPACING.xl,
            paddingTop: SPACING.sm,
            paddingBottom: 110,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.warning}
            />
          }
        >
          {/* Loading skeletons */}
          {loading && reports.length === 0 && (
            Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.xl,
                  height: 140,
                  marginBottom: SPACING.sm,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: 1 - i * 0.2,
                }}
              />
            ))
          )}

          {/* Empty state */}
          {!loading && reports.length === 0 && (
            <Animated.View
              entering={FadeIn.duration(600)}
              style={{ alignItems: 'center', paddingTop: 80 }}
            >
              {/* Pulsing bookmark icon */}
              <View style={{
                width: 100, height: 100, borderRadius: 30,
                backgroundColor: `${COLORS.warning}10`,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.lg,
                borderWidth: 1, borderColor: `${COLORS.warning}20`,
              }}>
                <Ionicons name="bookmark-outline" size={46} color={COLORS.warning} />
              </View>

              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.xl,
                fontWeight: '800',
                textAlign: 'center',
                marginBottom: SPACING.sm,
              }}>
                No Bookmarks Yet
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

              <TouchableOpacity
                onPress={() => router.push('/(app)/(tabs)/history')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[`${COLORS.warning}CC`, `${COLORS.warning}99`]}
                  style={{
                    borderRadius: RADIUS.full,
                    paddingHorizontal: SPACING.xl,
                    paddingVertical: 13,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="time-outline" size={18} color="#000" />
                  <Text style={{ color: '#000', fontWeight: '800', fontSize: FONTS.sizes.base }}>
                    Browse History
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Bookmark list */}
          {reports.length > 0 && (
            <>
              {/* Tip banner */}
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  backgroundColor: `${COLORS.warning}08`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.sm,
                  marginBottom: SPACING.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: `${COLORS.warning}20`,
                }}
              >
                <Ionicons name="information-circle-outline" size={15} color={COLORS.warning} />
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  flex: 1,
                  lineHeight: 18,
                }}>
                  Tap the bookmark icon on a card to remove it from this list.
                </Text>
              </Animated.View>

              {reports.map((report, i) => (
                <BookmarkCard
                  key={report.id}
                  report={report}
                  index={i}
                  onOpen={() =>
                    router.push({
                      pathname: '/(app)/research-report' as any,
                      params: { reportId: report.id },
                    })
                  }
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