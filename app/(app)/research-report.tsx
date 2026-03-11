// app/(app)/research-report.tsx
// Part 5 — Added "Generate Slides" entry point in header + report tab card.
//
// ─── FREEZE FIX ───────────────────────────────────────────────────────────────
//
//  THE FREEZE: tapping the slides button / any header button froze navigation.
//
//  Cause 1 — Header wrapped in `Animated.View entering={FadeIn.duration(400)}`
//    Every button in the header (back, slides, knowledge-graph, PDF, share) was
//    inside this animated wrapper. After FadeIn completes, Reanimated leaves a
//    ghost layout layer that permanently absorbs ALL touch events in that region.
//    Pressing any header button appeared to fire but the JS responder was locked
//    by the ghost layer → navigation called but JS thread waited for a responder
//    release that never came → screen froze.
//    Ref: github.com/software-mansion/react-native-reanimated/issues/3388
//         github.com/software-mansion/react-native-reanimated/issues/5850
//
//  Cause 2 — AI Slides promo card inside Animated.View entering= with a
//    TouchableOpacity inside. Same ghost-layer freeze trigger.
//
//  Cause 3 — TouchableOpacity uses the JS responder system which Reanimated
//    intercepts. All TouchableOpacity → Pressable (native touch path).
//
//  FIXES:
//    1. Header → plain View (no Animated wrapper)
//    2. Slides promo + knowledge graph promo → plain View (no Animated wrapper)
//    3. All TouchableOpacity → Pressable throughout
//    4. Animated.View entering= retained ONLY on pure display content
//       (stats row, executive summary, infographic) — no interactive children
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Alert, Linking, KeyboardAvoidingView, Platform,
  ActivityIndicator, Switch, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { supabase }                from '../../src/lib/supabase';
import { ReportSectionCard }       from '../../src/components/research/ReportSection';
import { FollowUpChat }            from '../../src/components/research/FollowUpChat';
import { CitationModal }           from '../../src/components/research/CitationModal';
import { InfographicsPanel }       from '../../src/components/research/InfographicCard';
import { SourceImageGallery }      from '../../src/components/research/SourceImageGallery';
import { ShareSheet }              from '../../src/components/research/ShareSheet';
import { LoadingOverlay }          from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ResearchReport }          from '../../src/types';
import { useConversation }         from '../../src/hooks/useConversation';
import { exportReportAsPDF }       from '../../src/services/pdfExport';
import { cacheReport, getCachedReport } from '../../src/lib/offlineCache';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_W  = SCREEN_W - SPACING.lg * 2;

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick Scan', deep: 'Deep Dive', expert: 'Expert Mode',
};

export default function ResearchReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const insets = useSafeAreaInsets();

  const [report,         setReport]         = useState<ResearchReport | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState<'report' | 'findings' | 'sources'>('report');
  const [showChat,       setShowChat]       = useState(false);
  const [showCitations,  setShowCitations]  = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [isFromCache,    setIsFromCache]    = useState(false);
  const [visualMode,     setVisualMode]     = useState(true);

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
        id:                data.id,
        userId:            data.user_id,
        query:             data.query,
        depth:             data.depth,
        focusAreas:        data.focus_areas        ?? [],
        title:             data.title              ?? data.query,
        executiveSummary:  data.executive_summary  ?? '',
        sections:          data.sections           ?? [],
        keyFindings:       data.key_findings       ?? [],
        futurePredictions: data.future_predictions ?? [],
        citations:         data.citations          ?? [],
        statistics:        data.statistics         ?? [],
        searchQueries:     data.search_queries     ?? [],
        sourcesCount:      data.sources_count      ?? 0,
        reliabilityScore:  data.reliability_score  ?? 0,
        status:            data.status,
        errorMessage:      data.error_message,
        agentLogs:         data.agent_logs         ?? [],
        isPinned:          data.is_pinned          ?? false,
        exportCount:       data.export_count       ?? 0,
        viewCount:         data.view_count         ?? 0,
        knowledgeGraph:    data.knowledge_graph    ?? undefined,
        infographicData:   data.infographic_data   ?? undefined,
        sourceImages:      data.source_images      ?? [],
        presentationId:    data.presentation_id    ?? undefined,
        slideCount:        data.slide_count        ?? 0,
        createdAt:         data.created_at,
        completedAt:       data.completed_at,
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

  const conversation = useConversation(report as ResearchReport);

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

  // ── Part 5: Navigate to slide generator ──────────────────────────────────

  const handleGenerateSlides = () => {
    if (!report) return;
    const params: Record<string, string> = { reportId: report.id };
    if (report.presentationId) params.presentationId = report.presentationId;
    router.push({ pathname: '/(app)/slide-preview' as any, params });
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
    (report?.infographicData?.stats.length  ?? 0) > 0 ||
    (report?.sourceImages?.length           ?? 0) > 0 ||
    !!report?.knowledgeGraph;

  const hasPresentation = !!report?.presentationId;

  if (loading && !report) return <LoadingOverlay visible message="Loading report…" />;
  if (!report) return null;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >

          {/*
            ── Header ──
            FIX 1: Plain View — removed Animated.View entering={FadeIn.duration(400)}.
            The ghost layer was blocking ALL header buttons after the fade animation.
            FIX 3: All Pressable (not TouchableOpacity).
          */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: SPACING.lg,
              paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
              borderBottomWidth: 1, borderBottomColor: COLORS.border,
            }}
          >
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

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                {isFromCache && (
                  <View style={{
                    backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm,
                    paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0,
                  }}>
                    <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
                  </View>
                )}
                <Text
                  style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', flex: 1 }}
                  numberOfLines={1}
                >
                  {report.title}
                </Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatDate(report.createdAt)} · {DEPTH_LABELS[report.depth]}
              </Text>
            </View>

            {/* Knowledge Graph shortcut */}
            {report.knowledgeGraph && (
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: `${COLORS.primary}15`,
                  alignItems: 'center', justifyContent: 'center', marginRight: 6,
                  borderWidth: 1, borderColor: `${COLORS.primary}30`,
                }}
              >
                <Ionicons name="git-network-outline" size={18} color={COLORS.primary} />
              </Pressable>
            )}

            {/* ── Part 5: Slides button ── */}
            <Pressable
              onPress={handleGenerateSlides}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: hasPresentation ? `${COLORS.primary}22` : COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center', marginRight: 6,
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

            {/* PDF Export */}
            <Pressable
              onPress={handleExportPDF}
              disabled={exporting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center', marginRight: 6,
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
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="share-outline" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* ── Visual Toggle ── */}
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

          {/* ── Tabs ── */}
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

          {/* ── Content ── */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: SPACING.lg,
              paddingTop: SPACING.sm,
              paddingBottom: showChat ? SPACING.md : insets.bottom + 80,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Stats row — pure display, Animated.View entering= is safe */}
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}
            >
              {[
                { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline',            color: COLORS.info },
                { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline',             color: COLORS.primary },
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
                  // Pure display — safe
                  <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
                    <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                  </Animated.View>
                )}

                {/* Executive Summary — pure display, safe */}
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

                {/*
                  ── Part 5: AI Slides promo card ──
                  FIX 2+3: Plain View wrapper, Pressable button.
                  Was Animated.View entering= wrapping a TouchableOpacity —
                  the ghost layer + JS responder = freeze on press.
                */}
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
                          { label: 'PDF',  icon: 'document-outline' },
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
                        {!hasPresentation && (
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            backgroundColor: `${COLORS.accent}12`,
                            borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
                            borderWidth: 1, borderColor: `${COLORS.accent}25`,
                          }}>
                            <Ionicons name="sparkles" size={10} color={COLORS.accent} />
                            <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '700' }}>AI-Generated</Text>
                          </View>
                        )}
                      </View>
                    </LinearGradient>
                  </Pressable>
                </View>

                {/*
                  Knowledge Graph promo
                  FIX 2+3: Plain View, Pressable.
                */}
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
                }}>
                  Key Findings
                </Text>
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
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                        {i + 1}
                      </Text>
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
                    }}>
                      Future Predictions
                    </Text>
                    {report.futurePredictions.map((pred, i) => (
                      <View key={i} style={{
                        backgroundColor: `${COLORS.warning}10`,
                        borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
                        flexDirection: 'row', alignItems: 'flex-start',
                        borderWidth: 1, borderColor: `${COLORS.warning}25`,
                      }}>
                        <Ionicons name="telescope-outline" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
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
                    }}>
                      Key Statistics
                    </Text>
                    {report.statistics.slice(0, 10).map((stat, i) => (
                      <View key={i} style={{
                        backgroundColor: COLORS.backgroundCard,
                        borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
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
                  }}>
                    {report.citations.length} Sources Used
                  </Text>
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
                    }}>
                      Search Queries Executed
                    </Text>
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

          {/* ── Follow-up CTA ── */}
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
                  colors={COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.full, paddingVertical: 14,
                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Ask Follow-Up Questions
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* ── Follow-up chat ── */}
          {showChat && (
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderTopWidth: 1, borderTopColor: COLORS.border,
              paddingBottom: insets.bottom,
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
                    colors={COLORS.gradientPrimary}
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="chatbubble-ellipses" size={14} color="#FFF" />
                  </LinearGradient>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                    Follow-Up Questions
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </Pressable>
              {report && (
                <FollowUpChat
                  messages={conversation.messages}
                  sending={conversation.sending}
                  onSend={conversation.sendMessage}
                />
              )}
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
    </LinearGradient>
  );
}