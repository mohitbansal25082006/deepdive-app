// app/(app)/research-report.tsx
// Part 33 — Header redesigned to fix congestion
//
// HEADER REDESIGN:
//   Row 1: Back button | Report title (truncated) | Chevron
//   Row 2: Date · Depth chip · Scrollable action icon row
//   This removes the squeeze and gives each element breathing room.
//   FIXED: Header now properly fixed with independent scrolling content
//
// All other functionality from Part 25/33 preserved unchanged.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
  Dimensions,
  Modal,
  Animated as RNAnimated,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams }    from 'expo-router';
import { supabase }                        from '../../src/lib/supabase';
import { ReportSectionCard }               from '../../src/components/research/ReportSection';
import { CitationModal }                   from '../../src/components/research/CitationModal';
import { InfographicsPanel }               from '../../src/components/research/InfographicCard';
import { SourceImageGallery }              from '../../src/components/research/SourceImageGallery';
import { ShareSheet }                      from '../../src/components/research/ShareSheet';
import { LoadingOverlay }                  from '../../src/components/common/LoadingOverlay';
import { ResearchAssistantChat }           from '../../src/components/research/ResearchAssistantChat';
import { useResearchAssistant }            from '../../src/hooks/useResearchAssistant';
import {
  SourceTrustBadge,
  SourceTrustSummaryBanner,
  TrustDistributionBar,
}                                          from '../../src/components/research/SourceTrustBadge';
import { getScoreColor, scoreSource }      from '../../src/services/sourceTrustScorer';
import { usePublicShare }                  from '../../src/hooks/usePublicShare';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ResearchReport }                  from '../../src/types';
import { exportReportAsPDF }               from '../../src/services/pdfExport';
import { cacheReport, getCachedReport }    from '../../src/lib/cacheStorage';

const SCREEN_W  = Dimensions.get('window').width;
const SCREEN_H  = Dimensions.get('window').height;
const PANEL_W   = SCREEN_W - SPACING.lg * 2;
const SHEET_MAX_H  = SCREEN_H * 0.72;
const SCROLL_MAX_H = SHEET_MAX_H - 90;

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick', deep: 'Deep Dive', expert: 'Expert',
};
const DEPTH_COLORS: Record<string, string> = {
  quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning,
};

// ── Action icon button ─────────────────────────────────────────────────────────

interface ActionBtnProps {
  icon:        string;
  onPress:     () => void;
  active?:     boolean;
  activeColor?: string;
  loading?:    boolean;
  badge?:      string;
  disabled?:   boolean;
}

function ActionBtn({ icon, onPress, active, activeColor, loading, badge, disabled }: ActionBtnProps) {
  const color = activeColor ?? COLORS.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={{
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: active ? `${color}20` : COLORS.backgroundElevated,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
        borderColor: active ? `${color}50` : COLORS.border,
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
      }}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon as any} size={17} color={active ? color : COLORS.textSecondary} />
      }
      {badge && !loading && (
        <View style={{
          position: 'absolute', top: -4, right: -4,
          backgroundColor: color, borderRadius: 8,
          paddingHorizontal: 4, paddingVertical: 1,
          minWidth: 16, alignItems: 'center',
        }}>
          <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Public Share Modal ─────────────────────────────────────────────────────────

interface PublicShareModalProps {
  visible:   boolean;
  shareUrl:  string | null;
  isLoading: boolean;
  onClose:   () => void;
  onCopy:    () => void;
  onOpen:    () => void;
  onShare:   () => void;
}

function PublicShareModal({
  visible, shareUrl, isLoading, onClose, onCopy, onOpen, onShare,
}: PublicShareModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={e => e.stopPropagation()}>
          <LinearGradient
            colors={['#1A1A35', '#0A0A1A']}
            style={{
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              paddingBottom: insets.bottom + SPACING.lg,
              borderTopWidth: 1, borderColor: `${COLORS.primary}40`,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="globe-outline" size={18} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Public Report Link</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Anyone with the link can view this report</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: SPACING.lg }}>
              <View style={{
                backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1,
                borderColor: shareUrl ? `${COLORS.primary}30` : COLORS.border,
                minHeight: 56, justifyContent: 'center',
              }}>
                {isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Generating share link…</Text>
                  </View>
                ) : shareUrl ? (
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontFamily: 'monospace' }} numberOfLines={2} selectable>
                    {shareUrl}
                  </Text>
                ) : (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Tap an option below to generate your link</Text>
                )}
              </View>

              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.md,
                padding: SPACING.sm, marginBottom: SPACING.lg,
                borderWidth: 1, borderColor: `${COLORS.info}20`,
              }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.info} style={{ marginTop: 1 }} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                  Visitors get <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>3 free AI questions</Text> about this report, then they're prompted to download DeepDive AI.
                </Text>
              </View>

              <View style={{ gap: SPACING.sm }}>
                <Pressable onPress={onCopy}
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 14, borderRadius: RADIUS.full,
                    opacity: pressed ? 0.85 : 1,
                    backgroundColor: shareUrl ? COLORS.primary : COLORS.backgroundElevated,
                    borderWidth: 1, borderColor: shareUrl ? 'transparent' : COLORS.border,
                  }]}>
                  <Ionicons name="copy-outline" size={18} color={shareUrl ? '#FFF' : COLORS.textMuted} />
                  <Text style={{ color: shareUrl ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    {shareUrl ? 'Copy Link' : 'Generate & Copy Link'}
                  </Text>
                </Pressable>

                <Pressable onPress={onShare}
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 14, borderRadius: RADIUS.full,
                    opacity: pressed ? 0.85 : 1,
                    backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border,
                  }]}>
                  <Ionicons name="share-social-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Share via…</Text>
                </Pressable>

                {shareUrl && (
                  <Pressable onPress={onOpen}
                    style={({ pressed }) => [{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 14, borderRadius: RADIUS.full,
                      opacity: pressed ? 0.85 : 1,
                      backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border,
                    }]}>
                    <Ionicons name="open-outline" size={18} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Preview in Browser</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ResearchReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const insets       = useSafeAreaInsets();

  const [report,            setReport]            = useState<ResearchReport | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [activeTab,         setActiveTab]         = useState<'report' | 'findings' | 'sources'>('report');
  const [showChat,          setShowChat]          = useState(false);
  const [showCitations,     setShowCitations]     = useState(false);
  const [showShareSheet,    setShowShareSheet]    = useState(false);
  const [exporting,         setExporting]         = useState(false);
  const [isFromCache,       setIsFromCache]       = useState(false);
  const [visualMode,        setVisualMode]        = useState(true);
  const [showReportDetails, setShowReportDetails] = useState(false);
  const [showPublicShare,   setShowPublicShare]   = useState(false);

  const scrollY   = useRef(new RNAnimated.Value(0)).current;
  const [contentH,  setContentH]  = useState(0);
  const [scrollerH, setScrollerH] = useState(0);

  const assistant   = useResearchAssistant(report);
  const publicShare = usePublicShare(report?.id ?? null);

  useEffect(() => { if (reportId) loadReport(); }, [reportId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const cached = await getCachedReport<ResearchReport>(reportId);
      if (cached) {
        const enriched: ResearchReport = {
          ...cached,
          citations: cached.citations.map(c => ({
            ...c,
            trustScore: c.trustScore ?? scoreSource(c.url, c.source),
          })),
        };
        setReport(enriched);
        setIsFromCache(true);
        setLoading(false);
      }

      const { data, error } = await supabase.from('research_reports').select('*').eq('id', reportId).single();
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

      setReport(mapped);
      setIsFromCache(false);
      await cacheReport(mapped as unknown as { id: string; title: string; [key: string]: unknown });
      await supabase.from('research_reports').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', reportId);

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
      await supabase.from('research_reports').update({ export_count: (report.exportCount ?? 0) + 1 }).eq('id', report.id);
    } catch {
      Alert.alert('Export Error', 'Could not generate PDF.');
    } finally { setExporting(false); }
  };

  const handleGenerateSlides = () => {
    if (!report) return;
    const params: Record<string, string> = { reportId: report.id };
    if (report.presentationId) params.presentationId = report.presentationId;
    router.push({ pathname: '/(app)/slide-preview' as any, params });
  };

  const handleOpenAcademicPaper = () => {
    if (!report) return;
    router.push({
      pathname: '/(app)/academic-paper' as any,
      params: { reportId: report.id, ...(report.academicPaperId ? { paperId: report.academicPaperId } : {}) },
    });
  };

  const handlePublicShareCopy  = async () => { await publicShare.copyUrl();    setShowPublicShare(false); };
  const handlePublicShareOpen  = async () => { const url = publicShare.shareUrl; if (url && await Linking.canOpenURL(url)) await Linking.openURL(url); };
  const handlePublicShareNative = async () => { await publicShare.shareReport(); setShowPublicShare(false); };

  const openURL = async (url: string) => {
    try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else Alert.alert('Cannot open URL', url); }
    catch { Alert.alert('Error', 'Could not open this link.'); }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const reliabilityColor =
    (report?.reliabilityScore ?? 0) >= 8 ? COLORS.success
    : (report?.reliabilityScore ?? 0) >= 6 ? COLORS.warning
    : COLORS.error;

  const hasVisuals    = (report?.infographicData?.charts.length ?? 0) > 0 || (report?.infographicData?.stats.length ?? 0) > 0 || (report?.sourceImages?.length ?? 0) > 0 || !!report?.knowledgeGraph;
  const hasPresentation  = !!report?.presentationId;
  const hasAcademicPaper = !!report?.academicPaperId;
  const isAcademicMode   = report?.researchMode === 'academic';

  const sortedCitations = report?.citations
    ? [...report.citations].sort((a, b) => {
        const ta = a.trustScore?.tier ?? 3, tb = b.trustScore?.tier ?? 3;
        if (ta !== tb) return ta - tb;
        return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
      })
    : [];

  const avgSourceQuality = sortedCitations.length > 0
    ? Math.round(sortedCitations.reduce((s, c) => s + (c.trustScore?.credibilityScore ?? 5), 0) / sortedCitations.length * 10) / 10
    : null;

  if (loading && !report) return <LoadingOverlay visible message="Loading report…" />;
  if (!report) return null;

  const depthColor = DEPTH_COLORS[report.depth] ?? COLORS.primary;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ═══════════════════════════════════════════════════
            FIXED HEADER — Outside KeyboardAvoidingView
        ═══════════════════════════════════════════════════ */}
        <View style={{
          borderBottomWidth: 1, 
          borderBottomColor: COLORS.border,
          backgroundColor: COLORS.background,
          zIndex: 10,
        }}>
          {/* Row 1: back + title + chevron */}
          <View style={{
            flexDirection: 'row', 
            alignItems: 'center',
            paddingHorizontal: SPACING.md, 
            paddingTop: SPACING.sm, 
            paddingBottom: 6,
            gap: SPACING.sm,
          }}>
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/home' as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 36, 
                height: 36, 
                borderRadius: 11,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', 
                justifyContent: 'center',
                borderWidth: 1, 
                borderColor: COLORS.border, 
                flexShrink: 0,
              }}
            >
              <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => setShowReportDetails(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              {/* Status / mode badges */}
              {isFromCache && (
                <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 }}>
                  <Text style={{ color: COLORS.info, fontSize: 8, fontWeight: '800' }}>OFFLINE</Text>
                </View>
              )}
              {isAcademicMode && (
                <View style={{ backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 }}>
                  <Ionicons name="school" size={9} color={COLORS.primary} />
                </View>
              )}
              <Text
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', flex: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {report.title}
              </Text>
              <Ionicons name="chevron-down" size={13} color={COLORS.textMuted} style={{ flexShrink: 0 }} />
            </Pressable>
          </View>

          {/* Row 2: depth chip + date + scrollable action icons */}
          <View style={{
            flexDirection: 'row', 
            alignItems: 'center',
            paddingHorizontal: SPACING.md, 
            paddingBottom: SPACING.sm,
            gap: SPACING.sm,
          }}>
            {/* Depth chip */}
            <View style={{
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: 4,
              paddingHorizontal: 8, 
              paddingVertical: 4,
              backgroundColor: `${depthColor}15`, 
              borderRadius: RADIUS.full,
              borderWidth: 1, 
              borderColor: `${depthColor}30`, 
              flexShrink: 0,
            }}>
              <Ionicons
                name={report.depth === 'expert' ? 'star' : report.depth === 'deep' ? 'layers' : 'flash'}
                size={10}
                color={depthColor}
              />
              <Text style={{ color: depthColor, fontSize: 10, fontWeight: '700' }}>
                {DEPTH_LABELS[report.depth]}
              </Text>
            </View>

            {/* Date */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flexShrink: 0 }}>
              {formatDate(report.createdAt)}
            </Text>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Scrollable action icons */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingRight: SPACING.xs }}
              style={{ flexShrink: 0, maxWidth: SCREEN_W - 200 }}
            >
              {/* Knowledge graph */}
              {report.knowledgeGraph && (
                <ActionBtn
                  icon="git-network-outline"
                  onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                />
              )}

              {/* Academic paper */}
              <ActionBtn
                icon={hasAcademicPaper ? 'school' : 'school-outline'}
                onPress={handleOpenAcademicPaper}
                active={hasAcademicPaper}
              />

              {/* Slides */}
              <ActionBtn
                icon={hasPresentation ? 'easel' : 'easel-outline'}
                onPress={handleGenerateSlides}
                active={hasPresentation}
                badge={hasPresentation && report.slideCount ? String(report.slideCount) : undefined}
              />

              {/* AI chat */}
              <ActionBtn
                icon={showChat ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                onPress={() => setShowChat(v => !v)}
                active={showChat || assistant.isEmbedded}
                activeColor={assistant.isEmbedded && !showChat ? COLORS.success : COLORS.primary}
              />

              {/* Public share */}
              <ActionBtn
                icon={publicShare.shareId ? 'globe' : 'globe-outline'}
                onPress={() => setShowPublicShare(true)}
                active={!!publicShare.shareId}
                activeColor={COLORS.success}
                loading={publicShare.isLoading}
              />

              {/* Export PDF */}
              <ActionBtn
                icon="download-outline"
                onPress={handleExportPDF}
                loading={exporting}
              />

              {/* Share sheet */}
              <ActionBtn
                icon="share-outline"
                onPress={() => setShowShareSheet(true)}
              />
            </ScrollView>
          </View>
        </View>
        {/* ═══════════════════════════════════════════════════
            END FIXED HEADER
        ═══════════════════════════════════════════════════ */}

        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* ── Visual Toggle ── */}
          {hasVisuals && (
            <View style={{
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              paddingHorizontal: SPACING.lg, 
              paddingVertical: SPACING.sm,
              backgroundColor: visualMode ? `${COLORS.primary}08` : COLORS.background,
              borderBottomWidth: 1, 
              borderBottomColor: visualMode ? `${COLORS.primary}15` : COLORS.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LinearGradient colors={visualMode ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="bar-chart-outline" size={14} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Visual Mode</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{visualMode ? 'Charts & graphs shown' : 'Text-only view'}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border }}>
                  <Ionicons name="git-network-outline" size={12} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Graph</Text>
                </Pressable>
                <Switch value={visualMode} onValueChange={setVisualMode}
                  trackColor={{ false: COLORS.backgroundElevated, true: `${COLORS.primary}50` }}
                  thumbColor={visualMode ? COLORS.primary : COLORS.textMuted}
                  ios_backgroundColor={COLORS.backgroundElevated} />
              </View>
            </View>
          )}

          {/* ── Tabs ── */}
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm }}>
            {(['report', 'findings', 'sources'] as const).map(tab => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated, alignItems: 'center' }}>
                <Text style={{ color: activeTab === tab ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  {tab === 'sources' ? `Sources${sortedCitations.length > 0 ? ` (${sortedCitations.length})` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Content ── */}
          {!showChat && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ 
                paddingHorizontal: SPACING.lg, 
                paddingTop: SPACING.sm, 
                paddingBottom: insets.bottom + 80 
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Stats row */}
              <Animated.View entering={FadeInDown.duration(400)} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                {[
                  { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline',            color: COLORS.info      },
                  { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline',             color: COLORS.primary   },
                  { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline', color: reliabilityColor },
                  ...(avgSourceQuality !== null ? [{ label: 'Src Quality', value: `${avgSourceQuality}/10`, icon: 'star-outline', color: getScoreColor(avgSourceQuality) }] : []),
                ].map(stat => (
                  <View key={stat.label} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                    <Ionicons name={stat.icon as any} size={16} color={stat.color} />
                    <Text style={{ color: stat.color, fontSize: FONTS.sizes.md, fontWeight: '800', marginTop: 4 }}>{stat.value}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, textAlign: 'center' }}>{stat.label}</Text>
                  </View>
                ))}
              </Animated.View>

              {/* REPORT TAB */}
              {activeTab === 'report' && (
                <>
                  {visualMode && report.infographicData && (
                    <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
                      <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                    </Animated.View>
                  )}

                  <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                    <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                        <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
                          <Ionicons name="newspaper-outline" size={16} color="#FFF" />
                        </LinearGradient>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Executive Summary</Text>
                      </View>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{report.executiveSummary}</Text>
                    </LinearGradient>
                  </Animated.View>

                  {report.sections.map((section, i) => (
                    <ReportSectionCard key={section.id ?? i} section={section} citations={report.citations} index={i} />
                  ))}

                  {/* Public share promo card */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={() => setShowPublicShare(true)}>
                      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: publicShare.shareId ? `${COLORS.success}50` : `${COLORS.primary}25` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient colors={publicShare.shareId ? [COLORS.success, `${COLORS.success}BB`] : ['#6C63FF', '#4A42CC']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium }}>
                            <Ionicons name={publicShare.shareId ? 'globe' : 'globe-outline'} size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                                {publicShare.shareId ? 'Public Link Active' : 'Share as Public Page'}
                              </Text>
                              {publicShare.shareId && (
                                <View style={{ backgroundColor: `${COLORS.success}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.success}40` }}>
                                  <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>LIVE</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              {publicShare.shareId ? 'Anyone with the link can read this · 3 free AI questions for visitors' : 'Generate a public URL · Visitors get 3 free AI questions · Great for sharing'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={publicShare.shareId ? COLORS.success : COLORS.primary} />
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* Academic paper promo */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={handleOpenAcademicPaper}>
                      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: hasAcademicPaper ? `${COLORS.primary}50` : `${COLORS.primary}25` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient colors={['#6C63FF', '#4A42CC']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium }}>
                            <Ionicons name="school" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{hasAcademicPaper ? 'View Academic Paper' : 'Generate Academic Paper'}</Text>
                              {hasAcademicPaper && (
                                <View style={{ backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.primary}40` }}>
                                  <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>READY</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              {hasAcademicPaper ? 'Abstract · Introduction · Literature Review · Methodology · Findings · Conclusion' : 'Convert this report into a full peer-review–quality academic paper'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* Slides promo */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={handleGenerateSlides}>
                      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: hasPresentation ? `${COLORS.primary}50` : `${COLORS.primary}25` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium }}>
                            <Ionicons name="easel" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{hasPresentation ? 'View Presentation' : 'Generate Slides'}</Text>
                              {hasPresentation && (
                                <View style={{ backgroundColor: `${COLORS.accent}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.accent}40` }}>
                                  <Text style={{ color: COLORS.accent, fontSize: 9, fontWeight: '700' }}>{report.slideCount} SLIDES</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{hasPresentation ? 'Your AI presentation is ready · Export as PPTX, PDF or HTML' : 'Convert this report into a beautiful slide deck with AI'}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* AI assistant promo */}
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Pressable onPress={() => setShowChat(true)}>
                      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: assistant.isEmbedded ? `${COLORS.success}40` : `${COLORS.primary}25` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                          <LinearGradient colors={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'AA'] : COLORS.gradientPrimary} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ionicons name="chatbubble-ellipses" size={22} color="#FFF" />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>AI Research Assistant</Text>
                              {assistant.isEmbedded && (
                                <View style={{ backgroundColor: `${COLORS.success}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.success}40`, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="sparkles" size={9} color={COLORS.success} />
                                  <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>RAG READY</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>7 modes · RAG search · Follow-up questions</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </>
              )}

              {/* FINDINGS TAB */}
              {activeTab === 'findings' && (
                <>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>Key Findings</Text>
                  {report.keyFindings.map((finding, i) => (
                    <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, flexShrink: 0 }}>
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{i + 1}</Text>
                      </View>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{finding}</Text>
                    </View>
                  ))}
                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md, marginTop: SPACING.lg }}>Future Predictions</Text>
                      {report.futurePredictions.map((pred, i) => (
                        <View key={i} style={{ backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: `${COLORS.warning}25` }}>
                          <Ionicons name="telescope-outline" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{pred}</Text>
                        </View>
                      ))}
                    </>
                  )}
                  {report.statistics.length > 0 && (
                    <>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md, marginTop: SPACING.lg }}>Key Statistics</Text>
                      {report.statistics.slice(0, 10).map((stat, i) => (
                        <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
                          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>{stat.value}</Text>
                          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginTop: 4 }}>{stat.context}</Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>Source: {stat.source}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* SOURCES TAB */}
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {sortedCitations.length} Sources · Sorted by Trust
                    </Text>
                    <Pressable onPress={() => setShowCitations(true)}
                      style={{ backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
                      <Ionicons name="copy-outline" size={14} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Cite</Text>
                    </Pressable>
                  </View>
                  {sortedCitations.map((c, i) => (
                    <Pressable key={c.id ?? i} onPress={() => openURL(c.url)}
                      style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: c.trustScore?.tier === 1 ? `${COLORS.success}30` : c.trustScore?.tier === 2 ? `${COLORS.primary}25` : COLORS.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}20` : `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 }}>
                          <Text style={{ color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                        </View>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1, lineHeight: 20 }}>{c.title}</Text>
                        <Ionicons name="open-outline" size={16} color={COLORS.primary} style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }} />
                      </View>
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>{c.source}{c.date ? ` · ${c.date}` : ''}</Text>
                      {c.trustScore && <View style={{ marginBottom: 6 }}><SourceTrustBadge score={c.trustScore} size="sm" showBias showScore /></View>}
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>{c.snippet}</Text>
                    </Pressable>
                  ))}
                  {report.searchQueries.length > 0 && (
                    <View style={{ marginTop: SPACING.lg }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                          {report.searchQueries.length} Search Queries
                        </Text>
                        <View style={{ backgroundColor: `${COLORS.info}15`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.info}25` }}>
                          <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>{report.sourcesCount} UNIQUE SOURCES</Text>
                        </View>
                      </View>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {/* Bottom CTA */}
          {!showChat && (
            <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: insets.bottom + SPACING.sm, backgroundColor: 'rgba(10,10,26,0.96)', borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Pressable onPress={() => setShowChat(true)}>
                <LinearGradient
                  colors={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'CC'] : COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <Ionicons name={assistant.isEmbedded ? 'sparkles' : 'chatbubble-ellipses-outline'} size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    {assistant.isEmbedded ? 'AI Research Assistant (RAG Ready)' : assistant.isEmbedding ? 'AI Research Assistant (Indexing…)' : 'Open AI Research Assistant'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* AI Chat */}
          {showChat && (
            <View style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Pressable onPress={() => setShowChat(false)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LinearGradient colors={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'AA'] : COLORS.gradientPrimary} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubble-ellipses" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>AI Research Assistant</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{assistant.isEmbedded ? '✦ RAG-powered · semantic search active' : assistant.isEmbedding ? '⟳ Indexing report…' : '· Keyword fallback mode'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </Pressable>
              <ResearchAssistantChat assistant={assistant} reportTitle={report.title} />
              <View style={{ height: insets.bottom }} />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CitationModal visible={showCitations} citations={report.citations} onClose={() => setShowCitations(false)} />
      <ShareSheet visible={showShareSheet} report={report} onClose={() => setShowShareSheet(false)} />
      <PublicShareModal
        visible={showPublicShare}
        shareUrl={publicShare.shareUrl}
        isLoading={publicShare.isLoading}
        onClose={() => setShowPublicShare(false)}
        onCopy={handlePublicShareCopy}
        onOpen={handlePublicShareOpen}
        onShare={handlePublicShareNative}
      />

      {/* Report Details Modal */}
      <Modal visible={showReportDetails} transparent animationType="slide" onRequestClose={() => setShowReportDetails(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setShowReportDetails(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={{ maxHeight: SHEET_MAX_H }}>
            <LinearGradient colors={['#1A1A35', '#0A0A1A']} style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: SPACING.sm, borderTopWidth: 1, borderColor: COLORS.border }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="document-text" size={16} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Report Details</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>{report.title}</Text>
                  </View>
                </View>
                <Pressable onPress={() => setShowReportDetails(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', maxHeight: SCROLL_MAX_H }}>
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.lg, gap: SPACING.sm }}
                  scrollEventThrottle={16}
                  onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                  onContentSizeChange={(_, h) => setContentH(h)}
                  onLayout={e => setScrollerH(e.nativeEvent.layout.height)}>

                  <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Full Title</Text>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 24 }}>{report.title}</Text>
                  </View>

                  <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Ionicons name="search-outline" size={13} color={COLORS.primary} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Original Query</Text>
                    </View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, fontStyle: 'italic' }}>"{report.query}"</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[
                      { icon: 'layers-outline', colors: COLORS.gradientPrimary, label: 'Depth', value: DEPTH_LABELS[report.depth], color: COLORS.textPrimary },
                      { icon: 'shield-checkmark-outline', colors: [reliabilityColor, reliabilityColor + 'AA'] as [string,string], label: 'Reliability', value: `${report.reliabilityScore}/10`, color: reliabilityColor },
                      { icon: 'globe-outline', colors: [COLORS.info, COLORS.info + 'AA'] as [string,string], label: 'Sources', value: String(report.sourcesCount), color: COLORS.info },
                    ].map(item => (
                      <View key={item.label} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4 }}>
                        <LinearGradient colors={item.colors} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={item.icon as any} size={13} color="#FFF" />
                        </LinearGradient>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.label}</Text>
                        <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center' }}>{item.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Public share row */}
                  <Pressable onPress={() => { setShowReportDetails(false); setTimeout(() => setShowPublicShare(true), 300); }}
                    style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: publicShare.shareId ? `${COLORS.success}30` : COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name={publicShare.shareId ? 'globe' : 'globe-outline'} size={16} color={publicShare.shareId ? COLORS.success : COLORS.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Public Link</Text>
                      <Text style={{ color: publicShare.shareId ? COLORS.success : COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        {publicShare.shareId ? `Active · /r/${publicShare.shareId}` : 'Not generated · Tap to create'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                  </Pressable>

                  {avgSourceQuality !== null && (
                    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${getScoreColor(avgSourceQuality)}25` }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Ionicons name="star-outline" size={14} color={getScoreColor(avgSourceQuality)} />
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>Source Quality</Text>
                      </View>
                      <SourceTrustSummaryBanner results={sortedCitations} />
                      <View style={{ marginTop: 8 }}><TrustDistributionBar results={sortedCitations} /></View>
                    </View>
                  )}

                  <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 8 }}>
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
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{row.value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[
                      { icon: report.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline', color: report.status === 'completed' ? COLORS.success : COLORS.textMuted, border: report.status === 'completed' ? `${COLORS.success}30` : COLORS.border, label: 'Status', value: report.status },
                      { icon: assistant.isEmbedded ? 'sparkles' : assistant.isEmbedding ? 'sync-outline' : 'cloud-outline', color: assistant.isEmbedded ? COLORS.success : assistant.isEmbedding ? COLORS.primary : COLORS.textMuted, border: assistant.isEmbedded ? `${COLORS.success}30` : COLORS.border, label: 'RAG', value: assistant.isEmbedded ? 'Ready' : assistant.isEmbedding ? 'Indexing' : 'Pending' },
                      { icon: 'chatbubbles-outline', color: COLORS.primary, border: COLORS.border, label: 'Chats', value: String(assistant.messages.length) },
                    ].map(item => (
                      <View key={item.label} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: item.border, alignItems: 'center', gap: 3 }}>
                        <Ionicons name={item.icon as any} size={16} color={item.color} />
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.label}</Text>
                        <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' }}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {contentH > scrollerH && (
                  <View style={{ width: 4, marginRight: 6, marginVertical: SPACING.sm, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                    <RNAnimated.View style={{ width: 4, borderRadius: 2, backgroundColor: COLORS.primary, height: scrollerH > 0 ? Math.max(32, (scrollerH / contentH) * scrollerH) : 32, transform: [{ translateY: scrollerH > 0 && contentH > scrollerH ? scrollY.interpolate({ inputRange: [0, contentH - scrollerH], outputRange: [0, scrollerH - Math.max(32, (scrollerH / contentH) * scrollerH)], extrapolate: 'clamp' }) : 0 }] }} />
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