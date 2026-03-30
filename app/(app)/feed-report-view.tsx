// app/(app)/feed-report-view.tsx
// DeepDive AI — Part 36: View-only report screen for the Following feed.
//
// FIX (Error 1): Original used .single() which throws PGRST116
// "Cannot coerce the result to a single JSON object" when RLS blocks the row
// (report owned by another user). Fixed with a two-strategy approach:
//
//   Strategy 1 — SECURITY DEFINER RPC `get_published_report_by_id`:
//     Returns the report only if there is an active share_link (author
//     deliberately published it). Bypasses owner-only RLS safely.
//     Requires schema_patch_part36_feed.sql to be run in Supabase.
//
//   Strategy 2 — Direct .maybeSingle() fallback:
//     Works when the viewer IS the owner (RLS passes), or if the project's
//     RLS policy allows reading published reports.
//     .maybeSingle() returns null instead of throwing PGRST116.
//
//   If both return null → show a friendly "not available" screen.
//
// This screen is view-only: no edit controls, no chat, no export.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }            from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }            from '../../src/lib/supabase';
import { Avatar }              from '../../src/components/common/Avatar';
import { ReportSectionCard }   from '../../src/components/research/ReportSection';
import {
  SourceTrustBadge,
  SourceTrustSummaryBanner,
  TrustDistributionBar,
} from '../../src/components/research/SourceTrustBadge';
import { scoreSource, getScoreColor } from '../../src/services/sourceTrustScorer';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import type { ResearchReport } from '../../src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick', deep: 'Deep Dive', expert: 'Expert',
};
const DEPTH_COLORS: Record<string, string> = {
  quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Map raw DB row → typed ResearchReport ────────────────────────────────────

function mapRow(data: Record<string, any>): ResearchReport {
  return {
    id:                data.id,
    userId:            data.user_id,
    query:             data.query,
    depth:             data.depth,
    focusAreas:        data.focus_areas        ?? [],
    title:             data.title              ?? data.query,
    executiveSummary:  data.executive_summary  ?? '',
    sections:          data.sections           ?? [],
    keyFindings:       data.key_findings        ?? [],
    futurePredictions: data.future_predictions  ?? [],
    citations: (data.citations ?? []).map((c: any) => ({
      ...c,
      trustScore: c.trustScore ?? scoreSource(c.url ?? '', c.source),
    })),
    statistics:        data.statistics          ?? [],
    searchQueries:     data.search_queries      ?? [],
    sourcesCount:      data.sources_count       ?? 0,
    reliabilityScore:  data.reliability_score   ?? 0,
    status:            data.status,
    errorMessage:      data.error_message,
    agentLogs:         data.agent_logs          ?? [],
    isPinned:          data.is_pinned           ?? false,
    exportCount:       data.export_count        ?? 0,
    viewCount:         data.view_count          ?? 0,
    knowledgeGraph:    data.knowledge_graph     ?? undefined,
    infographicData:   data.infographic_data    ?? undefined,
    sourceImages:      data.source_images       ?? [],
    presentationId:    data.presentation_id     ?? undefined,
    slideCount:        data.slide_count         ?? 0,
    academicPaperId:   data.academic_paper_id   ?? undefined,
    researchMode:      data.research_mode       ?? 'standard',
    createdAt:         data.created_at,
    completedAt:       data.completed_at,
  };
}

// ─── Author chip ──────────────────────────────────────────────────────────────

function AuthorChip({
  authorName, authorUsername, avatarUrl,
}: {
  authorName:     string;
  authorUsername: string | null;
  avatarUrl:      string | null;
}) {
  return (
    <Pressable
      onPress={() => {
        if (authorUsername) {
          router.push({
            pathname: '/(app)/user-profile' as any,
            params:   { username: authorUsername },
          });
        }
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        flexDirection:    'row',
        alignItems:       'center',
        gap:              8,
        backgroundColor:  COLORS.backgroundElevated,
        borderRadius:     RADIUS.full,
        paddingHorizontal: SPACING.md,
        paddingVertical:  6,
        borderWidth:      1,
        borderColor:      `${COLORS.primary}30`,
        alignSelf:        'flex-start',
      }}
    >
      <Avatar url={avatarUrl} name={authorName} size={22} />
      <View>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
          {authorName}
        </Text>
        {authorUsername && (
          <Text style={{ color: COLORS.primary, fontSize: 10, marginTop: 1 }}>
            @{authorUsername}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
    </Pressable>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
      {[200, 120, 160, 140, 180].map((h, i) => (
        <View
          key={i}
          style={{
            height:          h,
            backgroundColor: COLORS.backgroundCard,
            borderRadius:    RADIUS.xl,
            borderWidth:     1,
            borderColor:     COLORS.border,
            opacity:         1 - i * 0.16,
          }}
        />
      ))}
    </View>
  );
}

// ─── Not available ────────────────────────────────────────────────────────────

function NotAvailable() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
      <Ionicons name="lock-closed-outline" size={48} color={COLORS.textMuted} />
      <Text style={{
        color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700',
        marginTop: SPACING.md, textAlign: 'center',
      }}>
        Report not available
      </Text>
      <Text style={{
        color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center',
        marginTop: SPACING.sm, lineHeight: 22,
      }}>
        This report may have been unpublished or removed by the author.
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={{
          marginTop: SPACING.xl, backgroundColor: COLORS.primary,
          borderRadius: RADIUS.full, paddingHorizontal: SPACING.xl, paddingVertical: 12,
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700' }}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FeedReportViewScreen() {
  const {
    reportId,
    authorName,
    authorUsername,
    authorAvatarUrl,
  } = useLocalSearchParams<{
    reportId:         string;
    authorName?:      string;
    authorUsername?:  string;
    authorAvatarUrl?: string;
  }>();

  const insets = useSafeAreaInsets();

  const [report,    setReport]    = useState<ResearchReport | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [activeTab, setActiveTab] = useState<'report' | 'findings' | 'sources'>('report');

  useEffect(() => {
    if (reportId) loadReport();
  }, [reportId]);

  // ── Two-strategy load ──────────────────────────────────────────────────────

  const loadReport = async () => {
    setLoading(true);
    setNotFound(false);

    try {
      let rawData: Record<string, any> | null = null;

      // ── Strategy 1: SECURITY DEFINER RPC ──────────────────────────────────
      // Only succeeds when the report has an active share_link (published).
      // Requires schema_patch_part36_feed.sql to be applied.
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          'get_published_report_by_id',
          { p_report_id: reportId },
        );

        if (!rpcErr && rpcData && typeof rpcData === 'object') {
          rawData = rpcData as Record<string, any>;
        }
      } catch {
        // RPC not yet deployed — fall through
      }

      // ── Strategy 2: Direct query with maybeSingle ──────────────────────────
      // .maybeSingle() returns null (never throws) when 0 rows match.
      // This handles the case where the viewer owns the report (RLS passes).
      if (!rawData) {
        const { data: direct, error: directErr } = await supabase
          .from('research_reports')
          .select('*')
          .eq('id', reportId)
          .maybeSingle();   // ← KEY FIX: was .single() which threw PGRST116

        if (directErr) {
          console.warn('[FeedReportView] direct query:', directErr.message);
        }
        if (direct) rawData = direct as Record<string, any>;
      }

      if (!rawData) {
        setNotFound(true);
        return;
      }

      setReport(mapRow(rawData));

      // Increment view count — ignore errors (viewer may not own the row)
      supabase
        .from('research_reports')
        .update({ view_count: (rawData.view_count ?? 0) + 1 })
        .eq('id', reportId)
        .then(() => {});

    } catch (err) {
      console.warn('[FeedReportView] unexpected error:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const openURL = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Cannot open URL', url);
    } catch {
      Alert.alert('Error', 'Could not open this link.');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const depthColor = DEPTH_COLORS[report?.depth ?? 'quick'] ?? COLORS.primary;
  const reliabilityColor =
    (report?.reliabilityScore ?? 0) >= 8 ? COLORS.success
    : (report?.reliabilityScore ?? 0) >= 6 ? COLORS.warning
    : COLORS.error;

  const sortedCitations = report?.citations
    ? [...report.citations].sort((a, b) => {
        const ta = a.trustScore?.tier ?? 3, tb = b.trustScore?.tier ?? 3;
        if (ta !== tb) return ta - tb;
        return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
      })
    : [];

  const avgSourceQuality = sortedCitations.length > 0
    ? Math.round(sortedCitations.reduce((s, c) => s + (c.trustScore?.credibilityScore ?? 5), 0)
        / sortedCitations.length * 10) / 10
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
          backgroundColor: COLORS.background, zIndex: 10,
        }}>
          {/* Row 1 */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
            paddingBottom: 6, gap: SPACING.sm,
          }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 36, height: 36, borderRadius: 11,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
              }}
            >
              <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
            </Pressable>

            <Text
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {loading ? 'Loading…' : (report?.title ?? 'Report')}
            </Text>

            <View style={{
              backgroundColor: `${COLORS.info}15`, borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: `${COLORS.info}30`, flexShrink: 0,
            }}>
              <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '700' }}>VIEW ONLY</Text>
            </View>
          </View>

          {/* Row 2 — meta chips */}
          {report && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
              gap: SPACING.sm, flexWrap: 'wrap',
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 4,
                backgroundColor: `${depthColor}15`, borderRadius: RADIUS.full,
                borderWidth: 1, borderColor: `${depthColor}30`,
              }}>
                <Ionicons
                  name={report.depth === 'expert' ? 'star' : report.depth === 'deep' ? 'layers' : 'flash'}
                  size={10} color={depthColor}
                />
                <Text style={{ color: depthColor, fontSize: 10, fontWeight: '700' }}>
                  {DEPTH_LABELS[report.depth]}
                </Text>
              </View>

              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatDate(report.createdAt)}
              </Text>

              {(authorUsername || authorName) && (
                <AuthorChip
                  authorName={authorName ?? 'Researcher'}
                  authorUsername={authorUsername ?? null}
                  avatarUrl={authorAvatarUrl ?? null}
                />
              )}
            </View>
          )}
        </View>

        {loading  && <LoadingSkeleton />}
        {!loading && notFound  && <NotAvailable />}

        {!loading && !notFound && report && (
          <>
            {/* Tabs */}
            <View style={{
              flexDirection: 'row', paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.sm, gap: SPACING.sm,
            }}>
              {(['report', 'findings', 'sources'] as const).map(tab => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: RADIUS.md,
                    backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    color: activeTab === tab ? '#FFF' : COLORS.textMuted,
                    fontSize: FONTS.sizes.xs, fontWeight: '600',
                  }}>
                    {tab === 'sources'
                      ? `Sources${sortedCitations.length > 0 ? ` (${sortedCitations.length})` : ''}`
                      : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
                paddingBottom: insets.bottom + 32,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Stats row */}
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}
              >
                {[
                  { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline',            color: COLORS.info      },
                  { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline',             color: COLORS.primary   },
                  { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline', color: reliabilityColor },
                  ...(avgSourceQuality !== null
                    ? [{ label: 'Quality', value: `${avgSourceQuality}/10`, icon: 'star-outline', color: getScoreColor(avgSourceQuality) }]
                    : []),
                ].map(stat => (
                  <View key={stat.label} style={{
                    flex: 1, backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.lg, padding: SPACING.sm,
                    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <Ionicons name={stat.icon as any} size={16} color={stat.color} />
                    <Text style={{ color: stat.color, fontSize: FONTS.sizes.md, fontWeight: '800', marginTop: 4 }}>
                      {stat.value}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, textAlign: 'center' }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </Animated.View>

              {/* ══ REPORT TAB ══ */}
              {activeTab === 'report' && (
                <>
                  <Animated.View entering={FadeInDown.duration(400).delay(80)}>
                    <LinearGradient
                      colors={['#1A1A35', '#12122A']}
                      style={{
                        borderRadius: RADIUS.xl, padding: SPACING.lg,
                        marginBottom: SPACING.lg, borderWidth: 1,
                        borderColor: `${COLORS.primary}25`,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                        <LinearGradient
                          colors={COLORS.gradientPrimary}
                          style={{
                            width: 32, height: 32, borderRadius: 10,
                            alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
                          }}
                        >
                          <Ionicons name="newspaper-outline" size={16} color="#FFF" />
                        </LinearGradient>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                          Executive Summary
                        </Text>
                      </View>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                        {report.executiveSummary}
                      </Text>
                    </LinearGradient>
                  </Animated.View>

                  {report.sections.map((section, i) => (
                    <ReportSectionCard
                      key={section.id ?? i}
                      section={section}
                      citations={report.citations}
                      index={i}
                    />
                  ))}
                </>
              )}

              {/* ══ FINDINGS TAB ══ */}
              {activeTab === 'findings' && (
                <>
                  {report.keyFindings.length > 0 && (
                    <>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
                      }}>Key Findings</Text>
                      {report.keyFindings.map((finding, i) => (
                        <Animated.View key={i} entering={FadeInDown.duration(350).delay(i * 50)}>
                          <View style={{
                            backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                            padding: SPACING.md, marginBottom: SPACING.sm,
                            flexDirection: 'row', alignItems: 'flex-start',
                            borderWidth: 1, borderColor: COLORS.border,
                            borderLeftWidth: 3, borderLeftColor: COLORS.primary,
                          }}>
                            <View style={{
                              width: 24, height: 24, borderRadius: 12,
                              backgroundColor: `${COLORS.primary}20`,
                              alignItems: 'center', justifyContent: 'center',
                              marginRight: SPACING.sm, flexShrink: 0,
                            }}>
                              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{i + 1}</Text>
                            </View>
                            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>
                              {finding}
                            </Text>
                          </View>
                        </Animated.View>
                      ))}
                    </>
                  )}

                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase',
                        marginBottom: SPACING.md, marginTop: SPACING.lg,
                      }}>Future Predictions</Text>
                      {report.futurePredictions.map((pred, i) => (
                        <View key={i} style={{
                          backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg,
                          padding: SPACING.md, marginBottom: SPACING.sm,
                          flexDirection: 'row', alignItems: 'flex-start',
                          borderWidth: 1, borderColor: `${COLORS.warning}25`,
                        }}>
                          <Ionicons name="telescope-outline" size={16} color={COLORS.warning}
                            style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>
                            {pred}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}

                  {report.statistics.length > 0 && (
                    <>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase',
                        marginBottom: SPACING.md, marginTop: SPACING.lg,
                      }}>Key Statistics</Text>
                      {report.statistics.slice(0, 10).map((stat, i) => (
                        <View key={i} style={{
                          backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                          padding: SPACING.md, marginBottom: SPACING.sm,
                          borderWidth: 1, borderColor: COLORS.border,
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                            {stat.value}
                          </Text>
                          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginTop: 4 }}>
                            {stat.context}
                          </Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>
                            Source: {stat.source}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ══ SOURCES TAB ══ */}
              {activeTab === 'sources' && (
                <>
                  {sortedCitations.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400)}>
                      <SourceTrustSummaryBanner results={sortedCitations} />
                      <View style={{ marginBottom: SPACING.md }}>
                        <TrustDistributionBar results={sortedCitations} />
                      </View>
                    </Animated.View>
                  )}

                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
                  }}>
                    {sortedCitations.length} Sources · Sorted by Trust
                  </Text>

                  {sortedCitations.map((c, i) => (
                    <Pressable
                      key={c.id ?? i}
                      onPress={() => openURL(c.url)}
                      style={{
                        backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                        padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1,
                        borderColor:
                          c.trustScore?.tier === 1 ? `${COLORS.success}30`
                          : c.trustScore?.tier === 2 ? `${COLORS.primary}25`
                          : COLORS.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 6,
                          backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}20` : `${COLORS.primary}20`,
                          alignItems: 'center', justifyContent: 'center',
                          marginRight: 8, flexShrink: 0,
                        }}>
                          <Text style={{
                            color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary,
                            fontSize: 10, fontWeight: '700',
                          }}>{i + 1}</Text>
                        </View>
                        <Text style={{
                          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                          fontWeight: '600', flex: 1, lineHeight: 20,
                        }}>{c.title}</Text>
                        <Ionicons name="open-outline" size={16} color={COLORS.primary}
                          style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }} />
                      </View>
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>
                        {c.source}{c.date ? ` · ${c.date}` : ''}
                      </Text>
                      {c.trustScore && (
                        <View style={{ marginBottom: 6 }}>
                          <SourceTrustBadge score={c.trustScore} size="sm" showBias showScore />
                        </View>
                      )}
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                        {c.snippet}
                      </Text>
                    </Pressable>
                  ))}

                  {report.searchQueries.length > 0 && (
                    <View style={{ marginTop: SPACING.lg }}>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
                      }}>
                        {report.searchQueries.length} Search Queries Used
                      </Text>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={{
                          backgroundColor: COLORS.backgroundElevated,
                          borderRadius: RADIUS.md,
                          paddingHorizontal: SPACING.md, paddingVertical: 8,
                          marginBottom: 6, flexDirection: 'row', alignItems: 'center',
                        }}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted}
                            style={{ marginRight: 8 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>
                            {q}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}