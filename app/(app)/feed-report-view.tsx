// app/(app)/feed-report-view.tsx
// DeepDive AI — Part 36: View-only report screen for the Following feed.
//
// Part 54B — FEATURE 6: This screen's reading UI now MATCHES the owner
//   research-report screen (app/(app)/research-report.tsx) so a published
//   report looks the same whether you own it or are reading it from the feed.
//   Added, mirroring research-report.tsx:
//     • Animated SegmentedTabs (Report / Findings / Sources) with a sliding
//       gradient indicator (replaces the old flat 3-button row).
//     • Gradient stat tiles (icon chip + value + label).
//     • RichText executive summary with lead / dropCap / highlightStats, inside
//       a gradient card.
//     • RichText for section bullets / findings / predictions / stat contexts.
//     • InfographicsPanel (visual mode) + SourceImageGallery (sources tab).
//     • A Visual Mode toggle (charts & images on/off) when visuals exist.
//     • Trust badges / summary banner / distribution bar (already present, kept).
//
//   It REMAINS strictly view-only — NO chat, NO export, NO edit, NO bookmark,
//   NO public-share. The "VIEW ONLY" badge + AuthorChip are preserved.
//
// Load strategy preserved from Part 36:
//   Strategy 1 — SECURITY DEFINER RPC `get_published_report_by_id` (published).
//   Strategy 2 — direct .maybeSingle() fallback (owner / permissive RLS).
//   Both null → friendly "not available" screen.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  Dimensions,
  Switch,
  Animated as RNAnimated,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }            from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }            from '../../src/lib/supabase';
import { Avatar }              from '../../src/components/common/Avatar';
import { ReportSectionCard }   from '../../src/components/research/ReportSection';
import { RichText }            from '../../src/components/research/RichText';
import { InfographicsPanel }   from '../../src/components/research/InfographicCard';
import { SourceImageGallery }  from '../../src/components/research/SourceImageGallery';
import {
  SourceTrustBadge,
  SourceTrustSummaryBanner,
  TrustDistributionBar,
} from '../../src/components/research/SourceTrustBadge';
import { scoreSource, getScoreColor } from '../../src/services/sourceTrustScorer';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import type { ResearchReport } from '../../src/types';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_W  = SCREEN_W - SPACING.lg * 2;

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

// ─── Animated segmented tabs (mirrors research-report.tsx) ────────────────────

interface SegTab { key: 'report' | 'findings' | 'sources'; label: string; }

function SegmentedTabs({
  tabs, active, onChange,
}: { tabs: SegTab[]; active: string; onChange: (k: SegTab['key']) => void }) {
  const [w, setW] = useState(0);
  const indicatorX = useRef(new RNAnimated.Value(0)).current;
  const pad = 4;
  const tabW = w > 0 ? (w - pad * 2) / tabs.length : 0;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === active));

  useEffect(() => {
    RNAnimated.spring(indicatorX, {
      toValue: pad + activeIndex * tabW,
      useNativeDriver: true, friction: 9, tension: 80,
    }).start();
  }, [activeIndex, tabW]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: RADIUS.full, padding: pad, borderWidth: 1, borderColor: COLORS.border,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {tabW > 0 && (
        <RNAnimated.View style={{
          position: 'absolute', top: pad, bottom: pad, left: 0, width: tabW,
          transform: [{ translateX: indicatorX }],
        }}>
          <LinearGradient colors={COLORS.gradientPrimary} style={{ flex: 1, borderRadius: RADIUS.full, ...SHADOWS.small }} />
        </RNAnimated.View>
      )}
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={{ flex: 1, paddingVertical: 9, alignItems: 'center', zIndex: 1 }}>
            <Text style={{ color: isActive ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '800' : '600' }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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

const sectionLabel = {
  color: COLORS.textMuted,
  fontSize: FONTS.sizes.xs,
  fontWeight: '700' as const,
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  marginBottom: SPACING.md,
};

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

  const [report,     setReport]     = useState<ResearchReport | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [activeTab,  setActiveTab]  = useState<'report' | 'findings' | 'sources'>('report');
  const [visualMode, setVisualMode] = useState(true);

  useEffect(() => {
    if (reportId) loadReport();
  }, [reportId]);

  // ── Two-strategy load (preserved) ──────────────────────────────────────────

  const loadReport = async () => {
    setLoading(true);
    setNotFound(false);

    try {
      let rawData: Record<string, any> | null = null;

      // Strategy 1: SECURITY DEFINER RPC (published reports only)
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

      // Strategy 2: Direct query with maybeSingle (owner / permissive RLS)
      if (!rawData) {
        const { data: direct, error: directErr } = await supabase
          .from('research_reports')
          .select('*')
          .eq('id', reportId)
          .maybeSingle();

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

  const hasVisuals =
    (report?.infographicData?.charts.length ?? 0) > 0 ||
    (report?.infographicData?.stats.length ?? 0) > 0 ||
    (report?.sourceImages?.length ?? 0) > 0;

  const statTiles = report ? [
    { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline',            color: COLORS.info },
    { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline',             color: COLORS.primary },
    { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline', color: reliabilityColor },
    ...(avgSourceQuality !== null
      ? [{ label: 'Src Quality', value: `${avgSourceQuality}/10`, icon: 'star-outline', color: getScoreColor(avgSourceQuality) }]
      : []),
  ] : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, '#0B0B1E', COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ══ Header ══ */}
        <View style={{ zIndex: 10 }}>
          <LinearGradient colors={['#16162F', '#0E0E22']} style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            {/* Row 1 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
              paddingBottom: 6, gap: SPACING.sm,
            }}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => [{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
                  flexShrink: 0, opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
              </Pressable>

              <Text
                style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', letterSpacing: -0.2 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {loading ? 'Loading…' : (report?.title ?? 'Report')}
              </Text>

              <View style={{
                backgroundColor: `${COLORS.info}18`, borderRadius: RADIUS.full,
                paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: `${COLORS.info}33`, flexShrink: 0,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <Ionicons name="eye-outline" size={11} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '800' }}>VIEW ONLY</Text>
              </View>
            </View>

            {/* Row 2 — meta chips + author */}
            {report && (
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
                gap: SPACING.sm, flexWrap: 'wrap',
              }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 9, paddingVertical: 5,
                  backgroundColor: `${depthColor}1A`, borderRadius: RADIUS.full,
                  borderWidth: 1, borderColor: `${depthColor}40`,
                }}>
                  <Ionicons
                    name={report.depth === 'expert' ? 'star' : report.depth === 'deep' ? 'layers' : 'flash'}
                    size={10} color={depthColor}
                  />
                  <Text style={{ color: depthColor, fontSize: 10, fontWeight: '800' }}>
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
          </LinearGradient>
        </View>

        {loading  && <LoadingSkeleton />}
        {!loading && notFound  && <NotAvailable />}

        {!loading && !notFound && report && (
          <>
            {/* Visual Mode toggle (only when visuals exist) */}
            {hasVisuals && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                backgroundColor: visualMode ? `${COLORS.primary}0A` : 'transparent',
                borderBottomWidth: 1, borderBottomColor: visualMode ? `${COLORS.primary}18` : COLORS.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <LinearGradient colors={visualMode ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="bar-chart" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Visual Mode</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{visualMode ? 'Charts & images shown' : 'Text-only view'}</Text>
                  </View>
                </View>
                <Switch value={visualMode} onValueChange={setVisualMode}
                  trackColor={{ false: COLORS.backgroundElevated, true: `${COLORS.primary}50` }}
                  thumbColor={visualMode ? COLORS.primary : COLORS.textMuted}
                  ios_backgroundColor={COLORS.backgroundElevated} />
              </View>
            )}

            {/* Tabs */}
            <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
              <SegmentedTabs
                tabs={[
                  { key: 'report', label: 'Report' },
                  { key: 'findings', label: 'Findings' },
                  { key: 'sources', label: `Sources${sortedCitations.length > 0 ? ` (${sortedCitations.length})` : ''}` },
                ]}
                active={activeTab}
                onChange={setActiveTab}
              />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
                paddingBottom: insets.bottom + 40,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Stat tiles (gradient — matches research-report) */}
              <Animated.View entering={FadeInDown.duration(400)} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                {statTiles.map(stat => (
                  <View key={stat.label} style={{ flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${stat.color}33` }}>
                    <LinearGradient colors={['#1A1A38', '#12122A']} style={{ padding: SPACING.sm, alignItems: 'center' }}>
                      <LinearGradient colors={[stat.color, `${stat.color}99`]} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        <Ionicons name={stat.icon as any} size={15} color="#FFF" />
                      </LinearGradient>
                      <Text style={{ color: stat.color, fontSize: FONTS.sizes.md, fontWeight: '900' }}>{stat.value}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '600' }}>{stat.label}</Text>
                    </LinearGradient>
                  </View>
                ))}
              </Animated.View>

              {/* ══ REPORT TAB ══ */}
              {activeTab === 'report' && (
                <>
                  {visualMode && report.infographicData && (
                    <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
                      <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                    </Animated.View>
                  )}

                  <Animated.View entering={FadeInDown.duration(400).delay(80)}>
                    <View style={{ borderRadius: RADIUS.xl, marginBottom: SPACING.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.primary}2A` }}>
                      <LinearGradient colors={['#1B1B3C', '#121228']} style={{ padding: SPACING.lg }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                          <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
                            <Ionicons name="newspaper" size={16} color="#FFF" />
                          </LinearGradient>
                          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Executive Summary</Text>
                        </View>
                        <RichText
                          content={report.executiveSummary}
                          highlightStats lead dropCap
                          accent={COLORS.primaryLight}
                          size={FONTS.sizes.base}
                          color={COLORS.textSecondary}
                          lineHeight={24}
                        />
                      </LinearGradient>
                    </View>
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
                      <Text style={sectionLabel}>Key Findings</Text>
                      {report.keyFindings.map((finding, i) => (
                        <Animated.View key={i} entering={FadeInDown.duration(350).delay(i * 50)} style={{ borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
                          <LinearGradient colors={['#16162F', '#101024']} style={{ padding: SPACING.md, flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                            <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, flexShrink: 0 }}>
                              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '900' }}>{i + 1}</Text>
                            </LinearGradient>
                            <RichText inline content={finding} highlightStats accent={COLORS.primaryLight} size={FONTS.sizes.sm} color={COLORS.textPrimary} weight="500" lineHeight={21} style={{ flex: 1 }} />
                          </LinearGradient>
                        </Animated.View>
                      ))}
                    </>
                  )}

                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={[sectionLabel, { marginTop: SPACING.lg }]}>Future Predictions</Text>
                      {report.futurePredictions.map((pred, i) => (
                        <View key={i} style={{ borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.warning}2A` }}>
                          <LinearGradient colors={[`${COLORS.warning}14`, `${COLORS.warning}06`]} style={{ padding: SPACING.md, flexDirection: 'row', alignItems: 'flex-start' }}>
                            <Ionicons name="telescope" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                            <RichText inline content={pred} highlightStats accent={COLORS.warning} size={FONTS.sizes.sm} color={COLORS.textSecondary} lineHeight={21} style={{ flex: 1 }} />
                          </LinearGradient>
                        </View>
                      ))}
                    </>
                  )}

                  {report.statistics.length > 0 && (
                    <>
                      <Text style={[sectionLabel, { marginTop: SPACING.lg }]}>Key Statistics</Text>
                      {report.statistics.slice(0, 10).map((stat, i) => (
                        <View key={i} style={{ borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.primary}22` }}>
                          <LinearGradient colors={['#16162F', '#101024']} style={{ padding: SPACING.md }}>
                            <Text style={{ color: COLORS.primaryLight, fontSize: FONTS.sizes.lg, fontWeight: '900' }}>{stat.value}</Text>
                            <RichText inline content={stat.context} highlightStats accent={COLORS.primaryLight} size={FONTS.sizes.sm} color={COLORS.textPrimary} lineHeight={19} style={{ marginTop: 4 }} />
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>Source: {stat.source}</Text>
                          </LinearGradient>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ══ SOURCES TAB ══ */}
              {activeTab === 'sources' && (
                <>
                  {visualMode && (report.sourceImages?.length ?? 0) > 0 && (
                    <SourceImageGallery images={report.sourceImages!} title="Source Images" />
                  )}

                  {sortedCitations.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400)}>
                      <SourceTrustSummaryBanner results={sortedCitations} />
                      <View style={{ marginBottom: SPACING.md }}>
                        <TrustDistributionBar results={sortedCitations} />
                      </View>
                    </Animated.View>
                  )}

                  <Text style={sectionLabel}>
                    {sortedCitations.length} Sources · Sorted by Trust
                  </Text>

                  {sortedCitations.map((c, i) => (
                    <Pressable
                      key={c.id ?? i}
                      onPress={() => openURL(c.url)}
                      style={{
                        borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1,
                        borderColor:
                          c.trustScore?.tier === 1 ? `${COLORS.success}33`
                          : c.trustScore?.tier === 2 ? `${COLORS.primary}2A`
                          : COLORS.border,
                      }}
                    >
                      <LinearGradient colors={['#16162F', '#101024']} style={{ padding: SPACING.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{
                            width: 24, height: 24, borderRadius: 7,
                            backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}22` : `${COLORS.primary}22`,
                            alignItems: 'center', justifyContent: 'center',
                            marginRight: 9, flexShrink: 0,
                          }}>
                            <Text style={{
                              color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary,
                              fontSize: 10, fontWeight: '900',
                            }}>{i + 1}</Text>
                          </View>
                          <Text style={{
                            color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                            fontWeight: '700', flex: 1, lineHeight: 20,
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
                      </LinearGradient>
                    </Pressable>
                  ))}

                  {report.searchQueries.length > 0 && (
                    <View style={{ marginTop: SPACING.lg }}>
                      <Text style={sectionLabel}>
                        {report.searchQueries.length} Search Queries Used
                      </Text>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={{
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          borderRadius: RADIUS.md,
                          paddingHorizontal: SPACING.md, paddingVertical: 9,
                          marginBottom: 6, flexDirection: 'row', alignItems: 'center',
                          borderWidth: 1, borderColor: COLORS.border,
                        }}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted}
                            style={{ marginRight: 9 }} />
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