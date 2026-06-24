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
// ─────────────────────────────────────────────────────────────────────────────
// Part 55.3 — Theme compatibility: Replaced all hardcoded gradients and colors
//             with theme-aware values from COLORS. All surfaces, text, and
//             interactive elements now follow the active theme palette.
// ─────────────────────────────────────────────────────────────────────────────
// FIX: ScrollView now properly contains all content with correct flex layout.
//      The scroll container now uses flex: 1 on the parent and proper
//      contentContainerStyle to ensure scrolling works correctly.
// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: Smooth scrolling - Added scrollEventThrottle, decelerationRate, and
//        proper nested scroll handling for a buttery smooth experience.
// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: Removed FlatList-specific props (maxToRenderPerBatch, 
//        updateCellsBatchingPeriod, initialNumToRender) that are not valid
//        for ScrollView components.
// ─────────────────────────────────────────────────────────────────────────────

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
  StyleSheet,
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
}: {
  tabs: SegTab[]; active: string; onChange: (k: SegTab['key']) => void;
}) {
  const [w, setW] = useState(0);
  const indicatorX = useRef(new RNAnimated.Value(0)).current;
  const pad = 4;
  const tabW = w > 0 ? (w - pad * 2) / tabs.length : 0;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === active));

  useEffect(() => {
    if (tabW > 0) {
      RNAnimated.spring(indicatorX, {
        toValue: pad + activeIndex * tabW,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    }
  }, [activeIndex, tabW]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.tabsContainer,
        {
          backgroundColor: `${COLORS.textPrimary}08`,
          borderColor: COLORS.border,
        }
      ]}
    >
      {tabW > 0 && (
        <RNAnimated.View 
          style={[
            styles.tabIndicator,
            { 
              width: tabW,
              transform: [{ translateX: indicatorX }],
            }
          ]}
        >
          <LinearGradient colors={COLORS.gradientPrimary} style={styles.tabIndicatorGradient} />
        </RNAnimated.View>
      )}
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable 
            key={tab.key} 
            onPress={() => onChange(tab.key)} 
            style={styles.tabPressable}
          >
            <Text style={[
              styles.tabText,
              {
                color: isActive ? '#FFF' : COLORS.textMuted,
                fontWeight: isActive ? '800' : '600',
              }
            ]}>
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
      style={[
        styles.authorChip,
        {
          backgroundColor: COLORS.backgroundElevated,
          borderColor: `${COLORS.primary}30`,
        }
      ]}
    >
      <Avatar url={avatarUrl} name={authorName} size={22} />
      <View>
        <Text style={[styles.authorName, { color: COLORS.textPrimary }]}>
          {authorName}
        </Text>
        {authorUsername && (
          <Text style={[styles.authorUsername, { color: COLORS.primary }]}>
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
    <View style={styles.skeletonContainer}>
      {[200, 120, 160, 140, 180].map((h, i) => (
        <View
          key={i}
          style={[
            styles.skeletonItem,
            {
              height: h,
              backgroundColor: COLORS.backgroundCard,
              borderColor: COLORS.border,
              opacity: 1 - i * 0.16,
            }
          ]}
        />
      ))}
    </View>
  );
}

// ─── Not available ────────────────────────────────────────────────────────────

function NotAvailable() {
  return (
    <View style={styles.notAvailableContainer}>
      <Ionicons name="lock-closed-outline" size={48} color={COLORS.textMuted} />
      <Text style={[styles.notAvailableTitle, { color: COLORS.textPrimary }]}>
        Report not available
      </Text>
      <Text style={[styles.notAvailableSubtitle, { color: COLORS.textMuted }]}>
        This report may have been unpublished or removed by the author.
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.goBackButton, { backgroundColor: COLORS.primary }]}
      >
        <Text style={styles.goBackButtonText}>Go Back</Text>
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

  const [report,     setReport]     = useState<ResearchReport | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [activeTab,  setActiveTab]  = useState<'report' | 'findings' | 'sources'>('report');
  const [visualMode, setVisualMode] = useState(true);
  
  // Refs for scroll views
  const scrollViewRef = useRef<ScrollView>(null);

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
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ══ Header ══ */}
        <View style={styles.headerWrapper}>
          <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={[styles.headerGradient, { borderBottomColor: COLORS.border }]}>
            {/* Row 1 */}
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    backgroundColor: `${COLORS.textPrimary}08`,
                    borderColor: COLORS.border,
                    opacity: pressed ? 0.7 : 1,
                  }
                ]}
              >
                <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
              </Pressable>

              <Text
                style={[styles.headerTitle, { color: COLORS.textPrimary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {loading ? 'Loading…' : (report?.title ?? 'Report')}
              </Text>

              <View style={[
                styles.viewOnlyBadge,
                {
                  backgroundColor: `${COLORS.info}18`,
                  borderColor: `${COLORS.info}33`,
                }
              ]}>
                <Ionicons name="eye-outline" size={11} color={COLORS.info} />
                <Text style={[styles.viewOnlyText, { color: COLORS.info }]}>VIEW ONLY</Text>
              </View>
            </View>

            {/* Row 2 — meta chips + author */}
            {report && (
              <View style={styles.metaRow}>
                <View style={[
                  styles.depthChip,
                  {
                    backgroundColor: `${depthColor}1A`,
                    borderColor: `${depthColor}40`,
                  }
                ]}>
                  <Ionicons
                    name={report.depth === 'expert' ? 'star' : report.depth === 'deep' ? 'layers' : 'flash'}
                    size={10} color={depthColor}
                  />
                  <Text style={[styles.depthText, { color: depthColor }]}>
                    {DEPTH_LABELS[report.depth]}
                  </Text>
                </View>

                <Text style={[styles.dateText, { color: COLORS.textMuted }]}>
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
          <View style={styles.contentContainer}>
            {/* Visual Mode toggle (only when visuals exist) */}
            {hasVisuals && (
              <View style={[
                styles.visualToggleContainer,
                {
                  backgroundColor: visualMode ? `${COLORS.primary}0A` : 'transparent',
                  borderBottomColor: visualMode ? `${COLORS.primary}18` : COLORS.border,
                }
              ]}>
                <View style={styles.visualToggleLeft}>
                  <LinearGradient 
                    colors={visualMode ? COLORS.gradientPrimary : [COLORS.backgroundElevated, COLORS.backgroundCard]} 
                    style={styles.visualToggleIcon}
                  >
                    <Ionicons name="bar-chart" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={[styles.visualToggleTitle, { color: COLORS.textPrimary }]}>Visual Mode</Text>
                    <Text style={[styles.visualToggleSubtitle, { color: COLORS.textMuted }]}>
                      {visualMode ? 'Charts & images shown' : 'Text-only view'}
                    </Text>
                  </View>
                </View>
                <Switch 
                  value={visualMode} 
                  onValueChange={setVisualMode}
                  trackColor={{ false: COLORS.backgroundElevated, true: `${COLORS.primary}50` }}
                  thumbColor={visualMode ? COLORS.primary : COLORS.textMuted}
                  ios_backgroundColor={COLORS.backgroundElevated} 
                />
              </View>
            )}

            {/* Tabs */}
            <View style={styles.tabsOuter}>
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

            {/* ─── SCROLLVIEW ─── */}
            {/* Smooth scrolling with proper flex behavior and performance optimizations */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: insets.bottom + 40 }
              ]}
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
              // ── Smooth scrolling props (valid for ScrollView) ──
              scrollEventThrottle={16}
              decelerationRate="normal"
              nestedScrollEnabled={true}
              overScrollMode="always"
              bounces={true}
              alwaysBounceVertical={true}
              removeClippedSubviews={true}
            >
              {/* Stat tiles (gradient — matches research-report) */}
              <Animated.View entering={FadeInDown.duration(400)} style={styles.statTilesRow}>
                {statTiles.map(stat => (
                  <View key={stat.label} style={[styles.statTile, { borderColor: `${stat.color}33` }]}>
                    <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={styles.statTileContent}>
                      <LinearGradient colors={[stat.color, `${stat.color}99`]} style={styles.statTileIcon}>
                        <Ionicons name={stat.icon as any} size={15} color="#FFF" />
                      </LinearGradient>
                      <Text style={[styles.statTileValue, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={[styles.statTileLabel, { color: COLORS.textMuted }]}>{stat.label}</Text>
                    </LinearGradient>
                  </View>
                ))}
              </Animated.View>

              {/* ══ REPORT TAB ══ */}
              {activeTab === 'report' && (
                <>
                  {visualMode && report.infographicData && (
                    <Animated.View entering={FadeInDown.duration(400)} style={styles.infographicWrapper}>
                      <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                    </Animated.View>
                  )}

                  <Animated.View entering={FadeInDown.duration(400).delay(80)}>
                    <View style={[styles.executiveSummaryWrapper, { borderColor: `${COLORS.primary}2A` }]}>
                      <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={styles.executiveSummaryContent}>
                        <View style={styles.executiveSummaryHeader}>
                          <LinearGradient colors={COLORS.gradientPrimary} style={styles.executiveSummaryIcon}>
                            <Ionicons name="newspaper" size={16} color="#FFF" />
                          </LinearGradient>
                          <Text style={[styles.executiveSummaryTitle, { color: COLORS.textPrimary }]}>Executive Summary</Text>
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
                      <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>Key Findings</Text>
                      {report.keyFindings.map((finding, i) => (
                        <Animated.View key={i} entering={FadeInDown.duration(350).delay(i * 50)} style={[styles.findingCard, { borderColor: COLORS.border }]}>
                          <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={[styles.findingContent, { borderLeftColor: COLORS.primary }]}>
                            <LinearGradient colors={COLORS.gradientPrimary} style={styles.findingNumber}>
                              <Text style={styles.findingNumberText}>{i + 1}</Text>
                            </LinearGradient>
                            <RichText inline content={finding} highlightStats accent={COLORS.primaryLight} size={FONTS.sizes.sm} color={COLORS.textPrimary} weight="500" lineHeight={21} style={styles.findingRichText} />
                          </LinearGradient>
                        </Animated.View>
                      ))}
                    </>
                  )}

                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: SPACING.lg }]}>Future Predictions</Text>
                      {report.futurePredictions.map((pred, i) => (
                        <View key={i} style={[styles.predictionCard, { borderColor: `${COLORS.warning}2A` }]}>
                          <LinearGradient colors={[`${COLORS.warning}14`, `${COLORS.warning}06`]} style={styles.predictionContent}>
                            <Ionicons name="telescope" size={16} color={COLORS.warning} style={styles.predictionIcon} />
                            <RichText inline content={pred} highlightStats accent={COLORS.warning} size={FONTS.sizes.sm} color={COLORS.textSecondary} lineHeight={21} style={styles.predictionRichText} />
                          </LinearGradient>
                        </View>
                      ))}
                    </>
                  )}

                  {report.statistics.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: SPACING.lg }]}>Key Statistics</Text>
                      {report.statistics.slice(0, 10).map((stat, i) => (
                        <View key={i} style={[styles.statCard, { borderColor: `${COLORS.primary}22` }]}>
                          <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={styles.statCardContent}>
                            <Text style={[styles.statCardValue, { color: COLORS.primaryLight }]}>{stat.value}</Text>
                            <RichText inline content={stat.context} highlightStats accent={COLORS.primaryLight} size={FONTS.sizes.sm} color={COLORS.textPrimary} lineHeight={19} style={styles.statCardContext} />
                            <Text style={[styles.statCardSource, { color: COLORS.textMuted }]}>Source: {stat.source}</Text>
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
                      <View style={styles.distributionWrapper}>
                        <TrustDistributionBar results={sortedCitations} />
                      </View>
                    </Animated.View>
                  )}

                  <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
                    {sortedCitations.length} Sources · Sorted by Trust
                  </Text>

                  {sortedCitations.map((c, i) => (
                    <Pressable
                      key={c.id ?? i}
                      onPress={() => openURL(c.url)}
                      style={[
                        styles.sourceCard,
                        {
                          borderColor:
                            c.trustScore?.tier === 1 ? `${COLORS.success}33`
                            : c.trustScore?.tier === 2 ? `${COLORS.primary}2A`
                            : COLORS.border,
                        }
                      ]}
                    >
                      <LinearGradient colors={[COLORS.backgroundCard, COLORS.background]} style={styles.sourceCardContent}>
                        <View style={styles.sourceHeader}>
                          <View style={[
                            styles.sourceIndex,
                            {
                              backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}22` : `${COLORS.primary}22`,
                            }
                          ]}>
                            <Text style={[
                              styles.sourceIndexText,
                              {
                                color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary,
                              }
                            ]}>{i + 1}</Text>
                          </View>
                          <Text style={[styles.sourceTitle, { color: COLORS.textPrimary }]}>{c.title}</Text>
                          <Ionicons name="open-outline" size={16} color={COLORS.primary} style={styles.sourceOpenIcon} />
                        </View>
                        <Text style={[styles.sourceMeta, { color: COLORS.primary }]}>
                          {c.source}{c.date ? ` · ${c.date}` : ''}
                        </Text>
                        {c.trustScore && (
                          <View style={styles.sourceTrustWrapper}>
                            <SourceTrustBadge score={c.trustScore} size="sm" showBias showScore />
                          </View>
                        )}
                        <Text style={[styles.sourceSnippet, { color: COLORS.textMuted }]}>
                          {c.snippet}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}

                  {report.searchQueries.length > 0 && (
                    <View style={styles.searchQueriesWrapper}>
                      <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
                        {report.searchQueries.length} Search Queries Used
                      </Text>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={[
                          styles.searchQueryItem,
                          {
                            backgroundColor: `${COLORS.textPrimary}04`,
                            borderColor: COLORS.border,
                          }
                        ]}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted} style={styles.searchQueryIcon} />
                          <Text style={[styles.searchQueryText, { color: COLORS.textSecondary }]}>
                            {q}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  headerWrapper: {
    zIndex: 10,
  },
  headerGradient: {
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 6,
    gap: SPACING.sm,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  viewOnlyBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewOnlyText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  depthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  depthText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dateText: {
    fontSize: FONTS.sizes.xs,
  },

  // Author chip
  authorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  authorName: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  authorUsername: {
    fontSize: 10,
    marginTop: 1,
  },

  // Skeleton
  skeletonContainer: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  skeletonItem: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
  },

  // Not available
  notAvailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  notAvailableTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  notAvailableSubtitle: {
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 22,
  },
  goBackButton: {
    marginTop: SPACING.xl,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
  },
  goBackButtonText: {
    color: '#FFF',
    fontWeight: '700',
  },

  // Content container
  contentContainer: {
    flex: 1,
  },

  // ScrollView
  scrollView: {
    flex: 1,
    flexGrow: 1,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: RADIUS.full,
    padding: 4,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
  },
  tabIndicatorGradient: {
    flex: 1,
    borderRadius: RADIUS.full,
  },
  tabPressable: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    zIndex: 1,
  },
  tabText: {
    fontSize: FONTS.sizes.xs,
  },

  // Visual toggle
  visualToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  visualToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  visualToggleIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualToggleTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  visualToggleSubtitle: {
    fontSize: FONTS.sizes.xs,
  },

  // Tabs outer
  tabsOuter: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },

  // Scroll content
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    flexGrow: 1,
  },

  // Stat tiles
  statTilesRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statTileContent: {
    padding: SPACING.sm,
    alignItems: 'center',
  },
  statTileIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statTileValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '900',
  },
  statTileLabel: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Infographic
  infographicWrapper: {
    marginBottom: SPACING.lg,
  },

  // Executive summary
  executiveSummaryWrapper: {
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  executiveSummaryContent: {
    padding: SPACING.lg,
  },
  executiveSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  executiveSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  executiveSummaryTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
  },

  // Section label
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },

  // Findings
  findingCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  findingContent: {
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 3,
  },
  findingNumber: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  findingNumberText: {
    color: '#FFF',
    fontSize: FONTS.sizes.xs,
    fontWeight: '900',
  },
  findingRichText: {
    flex: 1,
  },

  // Predictions
  predictionCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  predictionContent: {
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  predictionIcon: {
    marginRight: SPACING.sm,
    marginTop: 2,
    flexShrink: 0,
  },
  predictionRichText: {
    flex: 1,
  },

  // Statistics
  statCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statCardContent: {
    padding: SPACING.md,
  },
  statCardValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '900',
  },
  statCardContext: {
    marginTop: 4,
  },
  statCardSource: {
    fontSize: FONTS.sizes.xs,
    marginTop: 4,
  },

  // Sources
  distributionWrapper: {
    marginBottom: SPACING.md,
  },
  sourceCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sourceCardContent: {
    padding: SPACING.md,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  sourceIndex: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    flexShrink: 0,
  },
  sourceIndexText: {
    fontSize: 10,
    fontWeight: '900',
  },
  sourceTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },
  sourceOpenIcon: {
    marginLeft: 6,
    flexShrink: 0,
    marginTop: 2,
  },
  sourceMeta: {
    fontSize: FONTS.sizes.xs,
    marginBottom: 6,
  },
  sourceTrustWrapper: {
    marginBottom: 6,
  },
  sourceSnippet: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 16,
  },

  // Search queries
  searchQueriesWrapper: {
    marginTop: SPACING.lg,
  },
  searchQueryItem: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  searchQueryIcon: {
    marginRight: 9,
  },
  searchQueryText: {
    fontSize: FONTS.sizes.xs,
    flex: 1,
  },
});