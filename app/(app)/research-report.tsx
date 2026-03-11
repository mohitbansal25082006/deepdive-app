// app/(app)/research-report.tsx
// Part 7 — Updated: Added Academic Paper promo card, "Generate Paper" / "View Paper"
// CTA, and navigation to academic-paper.tsx screen.
//
// ─── FREEZE FIX (carried over from Part 5) ───────────────────────────────────
// All header & promo buttons use Pressable (not TouchableOpacity).
// No interactive children inside Animated.View entering= wrappers.
//
// ─── HEADER OPTIMIZATION (Mar 2026) ──────────────────────────────────────────
// • Right actions wrapped in a compact View with gap: 4
// • All action buttons reduced to 34×34 (was 38) for better breathing room
// • Title Pressable now has explicit marginRight + inner gap reduced to 4
// • Title Text gets ellipsizeMode="tail" + flexShrink support
// • Result: title never gets crushed even with all 6 right icons on small screens
// ──────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Alert, Linking, KeyboardAvoidingView, Platform,
  ActivityIndicator, Switch, Dimensions, Modal,
  Animated as RNAnimated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { ReportSectionCard } from '../../src/components/research/ReportSection';
import { CitationModal } from '../../src/components/research/CitationModal';
import { InfographicsPanel } from '../../src/components/research/InfographicCard';
import { SourceImageGallery } from '../../src/components/research/SourceImageGallery';
import { ShareSheet } from '../../src/components/research/ShareSheet';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { ResearchAssistantChat } from '../../src/components/research/ResearchAssistantChat';
import { useResearchAssistant } from '../../src/hooks/useResearchAssistant';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ResearchReport } from '../../src/types';
import { exportReportAsPDF } from '../../src/services/pdfExport';
import { cacheReport, getCachedReport } from '../../src/lib/offlineCache';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const PANEL_W = SCREEN_W - SPACING.lg * 2;
const SHEET_MAX_H = SCREEN_H * 0.72;
const SCROLL_MAX_H = SHEET_MAX_H - 90;

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick Scan', deep: 'Deep Dive', expert: 'Expert Mode',
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ResearchReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'report' | 'findings' | 'sources'>('report');
  const [showChat, setShowChat] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [visualMode, setVisualMode] = useState(true);
  const [showReportDetails, setShowReportDetails] = useState(false);
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const [contentH, setContentH] = useState(0);
  const [scrollerH, setScrollerH] = useState(0);

  const assistant = useResearchAssistant(report);

  useEffect(() => { if (reportId) loadReport(); }, [reportId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const cached = await getCachedReport(reportId);
      if (cached) { setReport(cached); setIsFromCache(true); setLoading(false); }

      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error || !data) {
        if (!cached) { Alert.alert('Error', 'Could not load report.'); router.back(); }
        return;
      }

      const mapped: ResearchReport = {
        id: data.id,
        userId: data.user_id,
        query: data.query,
        depth: data.depth,
        focusAreas: data.focus_areas ?? [],
        title: data.title ?? data.query,
        executiveSummary: data.executive_summary ?? '',
        sections: data.sections ?? [],
        keyFindings: data.key_findings ?? [],
        futurePredictions: data.future_predictions ?? [],
        citations: data.citations ?? [],
        statistics: data.statistics ?? [],
        searchQueries: data.search_queries ?? [],
        sourcesCount: data.sources_count ?? 0,
        reliabilityScore: data.reliability_score ?? 0,
        status: data.status,
        errorMessage: data.error_message,
        agentLogs: data.agent_logs ?? [],
        isPinned: data.is_pinned ?? false,
        exportCount: data.export_count ?? 0,
        viewCount: data.view_count ?? 0,
        knowledgeGraph: data.knowledge_graph ?? undefined,
        infographicData: data.infographic_data ?? undefined,
        sourceImages: data.source_images ?? [],
        presentationId: data.presentation_id ?? undefined,
        slideCount: data.slide_count ?? 0,
        // Part 7
        academicPaperId: data.academic_paper_id ?? undefined,
        researchMode: data.research_mode ?? 'standard',
        createdAt: data.created_at,
        completedAt: data.completed_at,
      };

      setReport(mapped);
      setIsFromCache(false);
      await cacheReport(mapped);
      await supabase
        .from('research_reports')
        .update({ view_count: (data.view_count ?? 0) + 1 })
        .eq('id', reportId);
    } catch (err) {
      console.error('[ResearchReport] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      await exportReportAsPDF(report, visualMode);
      await supabase
        .from('research_reports')
        .update({ export_count: (report.exportCount ?? 0) + 1 })
        .eq('id', report.id);
    } catch {
      Alert.alert('Export Error', 'Could not generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateSlides = () => {
    if (!report) return;
    const params: Record<string, string> = { reportId: report.id };
    if (report.presentationId) params.presentationId = report.presentationId;
    router.push({ pathname: '/(app)/slide-preview' as any, params });
  };

  // ── Part 7: Navigate to academic paper screen ────────────────────────────
  const handleOpenAcademicPaper = () => {
    if (!report) return;
    router.push({
      pathname: '/(app)/academic-paper' as any,
      params: {
        reportId: report.id,
        ...(report.academicPaperId ? { paperId: report.academicPaperId } : {}),
      },
    });
  };

  const openURL = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Cannot open URL', url);
    } catch { Alert.alert('Error', 'Could not open this link.'); }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const reliabilityColor =
    (report?.reliabilityScore ?? 0) >= 8 ? COLORS.success
    : (report?.reliabilityScore ?? 0) >= 6 ? COLORS.warning
    : COLORS.error;

  const hasVisuals =
    (report?.infographicData?.charts.length ?? 0) > 0 ||
    (report?.infographicData?.stats.length ?? 0) > 0 ||
    (report?.sourceImages?.length ?? 0) > 0 ||
    !!report?.knowledgeGraph;

  const hasPresentation = !!report?.presentationId;
  const hasAcademicPaper = !!report?.academicPaperId;
  const isAcademicMode = report?.researchMode === 'academic';

  if (loading && !report) return <LoadingOverlay visible message="Loading report…" />;
  if (!report) return null;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── OPTIMIZED HEADER ───────────────────────────────────────────── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}>
            {/* Back button */}
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/home' as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
              }}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>

            {/* Title area — now protected from compression */}
            <Pressable
              onPress={() => setShowReportDetails(true)}
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              style={{ flex: 1, marginRight: SPACING.sm }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                {isFromCache && (
                  <View style={{
                    backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm,
                    paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0,
                  }}>
                    <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
                  </View>
                )}
                {/* Part 7: Academic mode badge in header */}
                {isAcademicMode && (
                  <View style={{
                    backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.sm,
                    paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0,
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                  }}>
                    <Ionicons name="school" size={9} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>ACADEMIC</Text>
                  </View>
                )}
                <Text
                  style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.base,
                    fontWeight: '700',
                    flex: 1,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {report.title}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} style={{ flexShrink: 0 }} />
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatDate(report.createdAt)} · {DEPTH_LABELS[report.depth]} · Tap for details
              </Text>
            </Pressable>

            {/* RIGHT ACTIONS — compact wrapped container */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {/* Knowledge Graph shortcut */}
              {report.knowledgeGraph && (
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 34, height: 34, borderRadius: 12,
                    backgroundColor: `${COLORS.primary}15`,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: `${COLORS.primary}30`,
                  }}
                >
                  <Ionicons name="git-network-outline" size={18} color={COLORS.primary} />
                </Pressable>
              )}

              {/* Part 7: Academic paper button */}
              <Pressable
                onPress={handleOpenAcademicPaper}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: hasAcademicPaper ? `${COLORS.primary}22` : COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: hasAcademicPaper ? `${COLORS.primary}55` : COLORS.border,
                }}
              >
                <Ionicons
                  name={hasAcademicPaper ? 'school' : 'school-outline'}
                  size={18}
                  color={hasAcademicPaper ? COLORS.primary : COLORS.textSecondary}
                />
              </Pressable>

              {/* Slides button */}
              <Pressable
                onPress={handleGenerateSlides}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: hasPresentation ? `${COLORS.primary}22` : COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: hasPresentation ? `${COLORS.primary}55` : COLORS.border,
                }}
              >
                <Ionicons
                  name={hasPresentation ? 'easel' : 'easel-outline'}
                  size={18}
                  color={hasPresentation ? COLORS.primary : COLORS.textSecondary}
                />
              </Pressable>

              {/* AI Chat button */}
              <Pressable
                onPress={() => setShowChat(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: showChat
                    ? `${COLORS.primary}22`
                    : assistant.isEmbedded
                      ? `${COLORS.success}18`
                      : COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: showChat
                    ? `${COLORS.primary}55`
                    : assistant.isEmbedded
                      ? `${COLORS.success}40`
                      : COLORS.border,
                }}
              >
                <Ionicons
                  name={showChat ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                  size={18}
                  color={showChat ? COLORS.primary : assistant.isEmbedded ? COLORS.success : COLORS.textSecondary}
                />
              </Pressable>

              {/* PDF Export */}
              <Pressable
                onPress={handleExportPDF}
                disabled={exporting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {exporting
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Ionicons name="download-outline" size={20} color={COLORS.textSecondary} />
                }
              </Pressable>

              {/* Share */}
              <Pressable
                onPress={() => setShowShareSheet(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="share-outline" size={20} color={COLORS.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* ── Visual Toggle ─────────────────────────────────────────────── */}
          {hasVisuals && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
              backgroundColor: visualMode ? `${COLORS.primary}08` : COLORS.background,
              borderBottomWidth: 1,
              borderBottomColor: visualMode ? `${COLORS.primary}15` : COLORS.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LinearGradient
                  colors={visualMode ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="bar-chart-outline" size={14} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                    Visual Mode
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {visualMode ? 'Charts & graphs shown' : 'Text-only view'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name="git-network-outline" size={12} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Graph</Text>
                </Pressable>
                <Switch
                  value={visualMode}
                  onValueChange={setVisualMode}
                  trackColor={{ false: COLORS.backgroundElevated, true: `${COLORS.primary}50` }}
                  thumbColor={visualMode ? COLORS.primary : COLORS.textMuted}
                  ios_backgroundColor={COLORS.backgroundElevated}
                />
              </View>
            </View>
          )}

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
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
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Main content ──────────────────────────────────────────────── */}
          {!showChat && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingTop: SPACING.sm,
                paddingBottom: insets.bottom + 80,
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Stats row */}
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}
              >
                {[
                  { label: 'Sources', value: String(report.sourcesCount), icon: 'globe-outline', color: COLORS.info },
                  { label: 'Citations', value: String(report.citations.length), icon: 'link-outline', color: COLORS.primary },
                  { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline', color: reliabilityColor },
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
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </Animated.View>

              {/* ── REPORT TAB ── */}
              {activeTab === 'report' && (
                <>
                  {visualMode && report.infographicData && (
                    <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
                      <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                    </Animated.View>
                  )}

                  {/* Executive Summary */}
                  <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                    <LinearGradient
                      colors={['#1A1A35', '#12122A']}
                      style={{
                        borderRadius: RADIUS.xl, padding: SPACING.lg,
                        marginBottom: SPACING.lg,
                        borderWidth: 1, borderColor: `${COLORS.primary}25`,
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

                  {/* Report sections */}
                  {report.sections.map((section, i) => (
                    <ReportSectionCard
                      key={section.id ?? i}
                      section={section}
                      citations={report.citations}
                      index={i}
                    />
                  ))}

                  {/* ── Part 7: Academic Paper Promo Card ── */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={handleOpenAcademicPaper}>
                      <LinearGradient
                        colors={['#1A1A35', '#12122A']}
                        style={{
                          borderRadius: RADIUS.xl, padding: SPACING.lg,
                          borderWidth: 1,
                          borderColor: hasAcademicPaper ? `${COLORS.primary}50` : `${COLORS.primary}25`,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient
                            colors={['#6C63FF', '#4A42CC']}
                            style={{
                              width: 48, height: 48, borderRadius: 14,
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              ...SHADOWS.medium,
                            }}
                          >
                            <Ionicons name="school" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                                {hasAcademicPaper ? 'View Academic Paper' : 'Generate Academic Paper'}
                              </Text>
                              {hasAcademicPaper && (
                                <View style={{
                                  backgroundColor: `${COLORS.primary}20`,
                                  borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2,
                                  borderWidth: 1, borderColor: `${COLORS.primary}40`,
                                  flexDirection: 'row', alignItems: 'center', gap: 3,
                                }}>
                                  <Ionicons name="checkmark-circle" size={9} color={COLORS.primary} />
                                  <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>
                                    READY
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              {hasAcademicPaper
                                ? 'Abstract · Introduction · Literature Review · Methodology · Findings · Conclusion · References'
                                : 'Convert this report into a full peer-review–quality academic paper'
                              }
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                        {/* Section chips */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: SPACING.md, flexWrap: 'wrap' }}>
                          {[
                            { label: '7 Sections', icon: 'list-outline' },
                            { label: '~4000 Words', icon: 'text-outline' },
                            { label: 'APA / MLA / IEEE', icon: 'school-outline' },
                            { label: 'PDF Export', icon: 'download-outline' },
                          ].map(f => (
                            <View key={f.label} style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              backgroundColor: `${COLORS.primary}12`,
                              borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
                              borderWidth: 1, borderColor: `${COLORS.primary}25`,
                            }}>
                              <Ionicons name={f.icon as any} size={10} color={COLORS.primary} />
                              <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{f.label}</Text>
                            </View>
                          ))}
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* AI Slides promo */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={handleGenerateSlides}>
                      <LinearGradient
                        colors={['#1A1A35', '#12122A']}
                        style={{
                          borderRadius: RADIUS.xl, padding: SPACING.lg,
                          borderWidth: 1,
                          borderColor: hasPresentation ? `${COLORS.primary}50` : `${COLORS.primary}25`,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient
                            colors={['#6C63FF', '#8B5CF6']}
                            style={{
                              width: 48, height: 48, borderRadius: 14,
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              ...SHADOWS.medium,
                            }}
                          >
                            <Ionicons name="easel" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                                {hasPresentation ? 'View Presentation' : 'Generate Slides'}
                              </Text>
                              {hasPresentation && (
                                <View style={{
                                  backgroundColor: `${COLORS.accent}20`,
                                  borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2,
                                  borderWidth: 1, borderColor: `${COLORS.accent}40`,
                                }}>
                                  <Text style={{ color: COLORS.accent, fontSize: 9, fontWeight: '700' }}>
                                    {report.slideCount} SLIDES
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              {hasPresentation
                                ? 'Your AI presentation is ready · Export as PPTX, PDF or HTML'
                                : 'Convert this report into a beautiful slide deck with AI'
                              }
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: SPACING.md, flexWrap: 'wrap' }}>
                          {[
                            { label: 'PPTX', icon: 'desktop-outline' },
                            { label: 'PDF', icon: 'document-outline' },
                            { label: 'HTML', icon: 'globe-outline' },
                          ].map(f => (
                            <View key={f.label} style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              backgroundColor: `${COLORS.primary}12`,
                              borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
                              borderWidth: 1, borderColor: `${COLORS.primary}25`,
                            }}>
                              <Ionicons name={f.icon as any} size={10} color={COLORS.primary} />
                              <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{f.label}</Text>
                            </View>
                          ))}
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* AI Assistant promo */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={() => setShowChat(true)}>
                      <LinearGradient
                        colors={['#1A1A35', '#12122A']}
                        style={{
                          borderRadius: RADIUS.xl, padding: SPACING.lg,
                          borderWidth: 1,
                          borderColor: assistant.isEmbedded ? `${COLORS.success}40` : `${COLORS.primary}25`,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient
                            colors={assistant.isEmbedded
                              ? [COLORS.success, COLORS.success + 'AA']
                              : COLORS.gradientPrimary}
                            style={{
                              width: 48, height: 48, borderRadius: 14,
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                          >
                            <Ionicons name="chatbubble-ellipses" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                                AI Research Assistant
                              </Text>
                              {assistant.isEmbedded && (
                                <View style={{
                                  backgroundColor: `${COLORS.success}20`,
                                  borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2,
                                  borderWidth: 1, borderColor: `${COLORS.success}40`,
                                  flexDirection: 'row', alignItems: 'center', gap: 4,
                                }}>
                                  <Ionicons name="sparkles" size={9} color={COLORS.success} />
                                  <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>RAG READY</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              7 modes · RAG search · Follow-up questions
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: SPACING.md, flexWrap: 'wrap' }}>
                          {['Explain Simply', 'Find Flaws', 'Go Deeper', 'Fact Check', 'Compare'].map(label => (
                            <View key={label} style={{
                              backgroundColor: `${COLORS.primary}12`,
                              borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
                              borderWidth: 1, borderColor: `${COLORS.primary}25`,
                            }}>
                              <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{label}</Text>
                            </View>
                          ))}
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* Knowledge Graph promo */}
                  {visualMode && (
                    <View style={{ marginBottom: SPACING.lg }}>
                      <Pressable
                        onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                      >
                        <LinearGradient
                          colors={['#1A1A35', '#12122A']}
                          style={{
                            borderRadius: RADIUS.xl, padding: SPACING.lg,
                            borderWidth: 1, borderColor: `${COLORS.primary}25`,
                            flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                          }}
                        >
                          <LinearGradient
                            colors={COLORS.gradientPrimary}
                            style={{
                              width: 48, height: 48, borderRadius: 14,
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                          >
                            <Ionicons name="git-network" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                              Knowledge Graph
                            </Text>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>
                              {report.knowledgeGraph
                                ? `${report.knowledgeGraph.nodes.length} nodes · ${report.knowledgeGraph.edges.length} relationships`
                                : 'Tap to generate interactive concept map'
                              }
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </LinearGradient>
                      </Pressable>
                    </View>
                  )}
                </>
              )}

              {/* ── FINDINGS TAB ── */}
              {activeTab === 'findings' && (
                <>
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
                  }}>Key Findings</Text>
                  {report.keyFindings.map((finding, i) => (
                    <View key={i} style={{
                      backgroundColor: COLORS.backgroundCard,
                      borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
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
                  ))}
                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase',
                        marginBottom: SPACING.md, marginTop: SPACING.lg,
                      }}>Future Predictions</Text>
                      {report.futurePredictions.map((pred, i) => (
                        <View key={i} style={{
                          backgroundColor: `${COLORS.warning}10`,
                          borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
                          flexDirection: 'row', alignItems: 'flex-start',
                          borderWidth: 1, borderColor: `${COLORS.warning}25`,
                        }}>
                          <Ionicons name="telescope-outline" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{pred}</Text>
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
                          backgroundColor: COLORS.backgroundCard,
                          borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
                          borderWidth: 1, borderColor: COLORS.border,
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>{stat.value}</Text>
                          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginTop: 4 }}>{stat.context}</Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>Source: {stat.source}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ── SOURCES TAB ── */}
              {activeTab === 'sources' && (
                <>
                  {visualMode && (report.sourceImages?.length ?? 0) > 0 && (
                    <SourceImageGallery images={report.sourceImages!} title="Source Images" />
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
                    <Text style={{
                      color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                      letterSpacing: 1, textTransform: 'uppercase',
                    }}>{report.citations.length} Sources Used</Text>
                    <Pressable
                      onPress={() => setShowCitations(true)}
                      style={{
                        backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full,
                        paddingHorizontal: 12, paddingVertical: 6,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        borderWidth: 1, borderColor: `${COLORS.primary}30`,
                      }}
                    >
                      <Ionicons name="copy-outline" size={14} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Cite</Text>
                    </Pressable>
                  </View>
                  {report.citations.map((c, i) => (
                    <Pressable
                      key={c.id ?? i}
                      onPress={() => openURL(c.url)}
                      style={{
                        backgroundColor: COLORS.backgroundCard,
                        borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
                        borderWidth: 1, borderColor: COLORS.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 6,
                          backgroundColor: `${COLORS.primary}20`,
                          alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0,
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                        </View>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1, lineHeight: 20 }}>
                          {c.title}
                        </Text>
                        <Ionicons name="open-outline" size={16} color={COLORS.primary} style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }} />
                      </View>
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 4 }}>
                        {c.source}{c.date ? ` · ${c.date}` : ''}
                      </Text>
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
                      }}>Search Queries Executed</Text>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={{
                          backgroundColor: COLORS.backgroundElevated,
                          borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8,
                          marginBottom: 6, flexDirection: 'row', alignItems: 'center',
                        }}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
          {!showChat && (
            <View style={{
              paddingHorizontal: SPACING.lg,
              paddingTop: SPACING.sm,
              paddingBottom: insets.bottom + SPACING.sm,
              backgroundColor: 'rgba(10,10,26,0.96)',
              borderTopWidth: 1, borderTopColor: COLORS.border,
            }}>
              <Pressable onPress={() => setShowChat(true)}>
                <LinearGradient
                  colors={assistant.isEmbedded
                    ? [COLORS.success, COLORS.success + 'CC']
                    : COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.full, paddingVertical: 14,
                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Ionicons
                    name={assistant.isEmbedded ? 'sparkles' : 'chatbubble-ellipses-outline'}
                    size={18}
                    color="#FFF"
                  />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    {assistant.isEmbedded
                      ? 'AI Research Assistant (RAG Ready)'
                      : assistant.isEmbedding
                        ? 'AI Research Assistant (Indexing…)'
                        : 'Open AI Research Assistant'
                    }
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* ── Research Assistant Chat ────────────────────────────────────── */}
          {showChat && (
            <View style={{
              flex: 1,
              backgroundColor: COLORS.backgroundCard,
              borderTopWidth: 1, borderTopColor: COLORS.border,
            }}>
              <Pressable
                onPress={() => setShowChat(false)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                  borderBottomWidth: 1, borderBottomColor: COLORS.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LinearGradient
                    colors={assistant.isEmbedded
                      ? [COLORS.success, COLORS.success + 'AA']
                      : COLORS.gradientPrimary}
                    style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="chatbubble-ellipses" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      AI Research Assistant
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {assistant.isEmbedded
                        ? '✦ RAG-powered · semantic search active'
                        : assistant.isEmbedding
                          ? '⟳ Indexing report…'
                          : '· Keyword fallback mode'
                      }
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </Pressable>
              <ResearchAssistantChat
                assistant={assistant}
                reportTitle={report.title}
              />
              <View style={{ height: insets.bottom }} />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CitationModal
        visible={showCitations}
        citations={report.citations}
        onClose={() => setShowCitations(false)}
      />
      <ShareSheet
        visible={showShareSheet}
        report={report}
        onClose={() => setShowShareSheet(false)}
      />

      {/* ── Report Details Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showReportDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportDetails(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          onPress={() => setShowReportDetails(false)}
        >
          <Pressable onPress={e => e.stopPropagation()} style={{ maxHeight: SHEET_MAX_H }}>
            <LinearGradient
              colors={['#1A1A35', '#0A0A1A']}
              style={{
                borderTopLeftRadius: 28, borderTopRightRadius: 28,
                paddingTop: SPACING.sm,
                borderTopWidth: 1, borderColor: COLORS.border,
              }}
            >
              <View style={{
                width: 40, height: 4, borderRadius: 2,
                backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm,
              }} />
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="document-text" size={16} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                      Report Details
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
                      {report.title}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setShowReportDetails(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    backgroundColor: COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', maxHeight: SCROLL_MAX_H }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    paddingHorizontal: SPACING.lg,
                    paddingTop: SPACING.xs,
                    paddingBottom: SPACING.lg,
                    gap: SPACING.sm,
                  }}
                  scrollEventThrottle={16}
                  onScroll={RNAnimated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                  )}
                  onContentSizeChange={(_, h) => setContentH(h)}
                  onLayout={e => setScrollerH(e.nativeEvent.layout.height)}
                >
                  {/* Full Report Title */}
                  <View style={{
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30`,
                  }}>
                    <Text style={{
                      color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                      letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
                    }}>Full Title</Text>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 24 }}>
                      {report.title}
                    </Text>
                  </View>

                  {/* Original Query */}
                  <View style={{
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Ionicons name="search-outline" size={13} color={COLORS.primary} />
                      <Text style={{
                        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                        letterSpacing: 1, textTransform: 'uppercase',
                      }}>Original Query</Text>
                    </View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, fontStyle: 'italic' }}>
                      "{report.query}"
                    </Text>
                  </View>

                  {/* Meta grid */}
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[
                      { icon: 'layers-outline', colors: COLORS.gradientPrimary, label: 'Depth', value: DEPTH_LABELS[report.depth], color: COLORS.textPrimary },
                      { icon: 'shield-checkmark-outline', colors: [reliabilityColor, reliabilityColor + 'AA'] as [string,string], label: 'Reliability', value: `${report.reliabilityScore}/10`, color: reliabilityColor },
                      { icon: 'globe-outline', colors: [COLORS.info, COLORS.info + 'AA'] as [string,string], label: 'Sources', value: String(report.sourcesCount), color: COLORS.info },
                    ].map(item => (
                      <View key={item.label} style={{
                        flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                        padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4,
                      }}>
                        <LinearGradient colors={item.colors} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={item.icon as any} size={13} color="#FFF" />
                        </LinearGradient>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center' }}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Part 7: Academic Paper row in details */}
                  <View style={{
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1,
                    borderColor: hasAcademicPaper ? `${COLORS.primary}30` : COLORS.border,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}>
                    <Ionicons
                      name={hasAcademicPaper ? 'school' : 'school-outline'}
                      size={16}
                      color={hasAcademicPaper ? COLORS.primary : COLORS.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Academic Paper
                      </Text>
                      <Text style={{ color: hasAcademicPaper ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        {hasAcademicPaper ? 'Generated · Tap to view' : isAcademicMode ? 'Generated during pipeline' : 'Not generated — use Academic Mode'}
                      </Text>
                    </View>
                    {hasAcademicPaper && (
                      <Pressable
                        onPress={() => { setShowReportDetails(false); handleOpenAcademicPaper(); }}
                        style={{
                          backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.md,
                          paddingHorizontal: 12, paddingVertical: 6,
                          borderWidth: 1, borderColor: `${COLORS.primary}35`,
                        }}
                      >
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>View</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Timestamps */}
                  <View style={{
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 8,
                  }}>
                    {[
                      { icon: 'time-outline', iconColor: COLORS.textMuted, label: 'Created', value: formatDate(report.createdAt) },
                      ...(report.completedAt ? [{ icon: 'checkmark-circle-outline', iconColor: COLORS.success, label: 'Completed', value: formatDate(report.completedAt) }] : []),
                      { icon: 'eye-outline', iconColor: COLORS.textMuted, label: 'Views', value: String(report.viewCount ?? 0) },
                      { icon: 'download-outline', iconColor: COLORS.textMuted, label: 'Exports', value: String(report.exportCount ?? 0) },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name={row.icon as any} size={13} color={row.iconColor} />
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{row.label}</Text>
                        </View>
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Focus areas */}
                  {report.focusAreas && report.focusAreas.length > 0 && (
                    <View style={{
                      backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                      padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm }}>
                        <Ionicons name="flag-outline" size={13} color={COLORS.primary} />
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                          Focus Areas
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {report.focusAreas.map((area, i) => (
                          <View key={i} style={{
                            backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full,
                            paddingHorizontal: 10, paddingVertical: 4,
                            borderWidth: 1, borderColor: `${COLORS.primary}30`,
                          }}>
                            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{area}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Status row */}
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[
                      {
                        icon: report.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline',
                        color: report.status === 'completed' ? COLORS.success : COLORS.textMuted,
                        border: report.status === 'completed' ? `${COLORS.success}30` : COLORS.border,
                        label: 'Status', value: report.status,
                      },
                      {
                        icon: assistant.isEmbedded ? 'sparkles' : assistant.isEmbedding ? 'sync-outline' : 'cloud-outline',
                        color: assistant.isEmbedded ? COLORS.success : assistant.isEmbedding ? COLORS.primary : COLORS.textMuted,
                        border: assistant.isEmbedded ? `${COLORS.success}30` : COLORS.border,
                        label: 'RAG', value: assistant.isEmbedded ? 'Ready' : assistant.isEmbedding ? 'Indexing' : 'Pending',
                      },
                      {
                        icon: 'chatbubbles-outline', color: COLORS.primary, border: COLORS.border,
                        label: 'Chats', value: String(assistant.messages.length),
                      },
                    ].map(item => (
                      <View key={item.label} style={{
                        flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                        padding: SPACING.sm, borderWidth: 1, borderColor: item.border,
                        alignItems: 'center', gap: 3,
                      }}>
                        <Ionicons name={item.icon as any} size={16} color={item.color} />
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' }}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {contentH > scrollerH && (
                  <View style={{
                    width: 4, marginRight: 6, marginVertical: SPACING.sm,
                    backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden',
                  }}>
                    <RNAnimated.View style={{
                      width: 4, borderRadius: 2, backgroundColor: COLORS.primary,
                      height: scrollerH > 0 ? Math.max(32, (scrollerH / contentH) * scrollerH) : 32,
                      transform: [{
                        translateY: scrollerH > 0 && contentH > scrollerH
                          ? scrollY.interpolate({
                              inputRange: [0, contentH - scrollerH],
                              outputRange: [0, scrollerH - Math.max(32, (scrollerH / contentH) * scrollerH)],
                              extrapolate: 'clamp',
                            })
                          : 0,
                      }],
                    }} />
                  </View>
                )}
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}