// app/(app)/workspace-report.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Workspace Report — Detail Screen (FULL THEME COMPATIBILITY)
//
// Part 15  — Download Report (all members): PDF, Markdown, Plain Text.
// Part 52  — REALTIME ROLE SYNC via useWorkspaceReportRole():
//              seeds from nav param, subscribes to role_change broadcast,
//              falls back to postgres_changes, refetches on mount,
//              fires onKicked when removed / workspace deleted.
// Part 55  — FULL THEME SYSTEM: all colors derive from the active theme via
//              the live COLORS singleton. useTheme() provides isLight/version.
//              Gradients, accents, surfaces, and badges adapt to any palette.
// Part 60  — SOURCES TAB: the third tab now shows ranked, trust-scored
//              citations (mirrors research-report.tsx) instead of duplicating
//              the Comments tab. Comment discussion (bottom sheet + FAB) is
//              unchanged and still reachable from the header / section taps.
// Part 61  — THEME CONTRAST PASS: every surface that previously hardcoded a
//              dark-mode-only color (icon chip backgrounds, banner fills,
//              pill backgrounds) now derives from `isLight` so text and icons
//              stay legible in both themes.
// Part 62  — Comments action button no longer renders a numeric badge (the
//              segmented tab label already shows the count).
// Part 63  — Report Details sheet height is now clamped against available
//              safe-area space so it can never overflow off-screen on short
//              devices.
//
// TYPE FIX: CommentInput's onClearSection prop is `() => void` (not optional).
//           Inline tab usage now passes `() => {}` instead of `undefined`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Dimensions,
  Linking,
  Alert,
  Animated as RNAnimated,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { BlurView }          from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInUp,
  SlideOutDown,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useReportComments }      from '../../src/hooks/useReportComments';
import { usePresence }            from '../../src/hooks/usePresence';
import { useCommentReactions }    from '../../src/hooks/useCommentReactions';
import { useMyAccessRequest }     from '../../src/hooks/useEditAccessRequest';
import { useWorkspaceReportRole } from '../../src/hooks/useWorkspaceReportRole';
import { CommentThread }          from '../../src/components/workspace/CommentThread';
import { CommentInput }           from '../../src/components/workspace/CommentInput';
import { PresenceBar }            from '../../src/components/workspace/PresenceBar';
import { CommentSummaryPanel }    from '../../src/components/workspace/CommentSummaryPanel';
import { EditAccessRequestModal } from '../../src/components/workspace/EditAccessRequestModal';
import {
  SourceTrustBadge,
  SourceTrustSummaryBanner,
  TrustDistributionBar,
} from '../../src/components/research/SourceTrustBadge';
import { getScoreColor, scoreSource } from '../../src/services/sourceTrustScorer';
import { supabase }               from '../../src/lib/supabase';
import {
  generateCommentSummary,
  CommentSummaryResult,
} from '../../src/services/commentSummaryService';
import {
  exportWorkspaceReportAsPDF,
  exportWorkspaceReportAsMarkdown,
  copyWorkspaceReportToClipboard,
} from '../../src/services/workspaceReportExportService';
import { ResearchReport, WorkspaceRole } from '../../src/types';
import {
  COLORS,
  FONTS,
  SPACING,
  RADIUS,
  SHADOWS,
  getModalBackdrop,
} from '../../src/constants/theme';
import { useTheme } from '../../src/context/ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W     = Dimensions.get('window').width;
const SCREEN_H     = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_H * 0.65;
const SHEET_MAX_H  = SCREEN_H * 0.88;

const DEPTH_LABELS: Record<string, string> = {
  quick:  'Quick',
  deep:   'Deep Dive',
  expert: 'Expert',
};

// ─── Report loader ─────────────────────────────────────────────────────────────

function mapRow(d: Record<string, unknown>): ResearchReport {
  return {
    id:                d.id as string,
    userId:            d.user_id as string,
    query:             d.query as string,
    depth:             d.depth as ResearchReport['depth'],
    focusAreas:        (d.focus_areas  as string[]) ?? [],
    title:             (d.title        as string)   ?? '',
    executiveSummary:  (d.executive_summary as string) ?? '',
    sections:          (d.sections     as ResearchReport['sections']) ?? [],
    keyFindings:       (d.key_findings as string[]) ?? [],
    futurePredictions: (d.future_predictions as string[]) ?? [],
    citations:         (d.citations    as ResearchReport['citations']) ?? [],
    statistics:        (d.statistics   as ResearchReport['statistics']) ?? [],
    searchQueries:     (d.search_queries as string[]) ?? [],
    sourcesCount:      (d.sources_count  as number)  ?? 0,
    reliabilityScore:  (d.reliability_score as number) ?? 0,
    status:            d.status as ResearchReport['status'],
    agentLogs:         [],
    createdAt:         d.created_at as string,
    completedAt:       (d.completed_at as string) ?? undefined,
  };
}

async function loadReportForWorkspace(
  reportId:    string,
  workspaceId: string,
): Promise<{ report: ResearchReport | null; errorMessage: string | null }> {
  const { data: direct, error: directError } = await supabase
    .from('research_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();

  if (direct)
    return { report: mapRow(direct as Record<string, unknown>), errorMessage: null };
  if (directError && directError.code !== 'PGRST116')
    console.warn('[workspace-report] SELECT error:', directError.message);

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'get_workspace_report',
    { p_report_id: reportId, p_workspace_id: workspaceId },
  );
  if (rpcError) {
    console.error('[workspace-report] RPC error:', rpcError.message);
    return {
      report:       null,
      errorMessage: 'Could not load report. Please check your connection.',
    };
  }
  const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!row)
    return {
      report:       null,
      errorMessage: "You don't have access to this report, or it has been removed from the workspace.",
    };
  return { report: mapRow(row as Record<string, unknown>), errorMessage: null };
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon, value, label, color,
}: {
  icon:  keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={{
      flexDirection:    'row',
      alignItems:       'center',
      gap:              4,
      borderRadius:     RADIUS.full,
      paddingHorizontal:10,
      paddingVertical:  5,
      backgroundColor:  `${color}18`,
      borderWidth:      1,
      borderColor:      `${color}25`,
    }}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={{ fontSize: FONTS.sizes.xs, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{label}</Text>
    </View>
  );
}

// ─── Segmented Tabs ───────────────────────────────────────────────────────────

type TabKey = 'report' | 'findings' | 'sources';
interface SegTab { key: TabKey; label: string; }

function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs:     SegTab[];
  active:   TabKey;
  onChange: (k: TabKey) => void;
}) {
  const { isLight }  = useTheme();
  const [w, setW]    = useState(0);
  const indicatorX   = useRef(new RNAnimated.Value(0)).current;
  const pad          = 4;
  const tabW         = w > 0 ? (w - pad * 2) / tabs.length : 0;
  const activeIndex  = Math.max(0, tabs.findIndex(t => t.key === active));

  useEffect(() => {
    RNAnimated.spring(indicatorX, {
      toValue:         pad + activeIndex * tabW,
      useNativeDriver: true,
      friction:        9,
      tension:         80,
    }).start();
  }, [activeIndex, tabW]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  // Theme-aware track background — a flat translucent fill that reads
  // correctly against both light and dark surfaces.
  const trackBg = isLight ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.06)';

  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection:   'row',
        backgroundColor: trackBg,
        borderRadius:    RADIUS.full,
        padding:         pad,
        borderWidth:     1,
        borderColor:     COLORS.border,
        position:        'relative',
        overflow:        'hidden',
      }}
    >
      {tabW > 0 && (
        <RNAnimated.View style={{
          position:  'absolute',
          top:       pad,
          bottom:    pad,
          left:      0,
          width:     tabW,
          transform: [{ translateX: indicatorX }],
        }}>
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={{ flex: 1, borderRadius: RADIUS.full, ...SHADOWS.small }}
          />
        </RNAnimated.View>
      )}
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', zIndex: 1 }}
          >
            <Text
              numberOfLines={1}
              style={{
                color:      isActive ? '#FFF' : COLORS.textSecondary,
                fontSize:   FONTS.sizes.xs,
                fontWeight: isActive ? '800' : '600',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Action icon button ───────────────────────────────────────────────────────

interface ActionBtnProps {
  icon:         string;
  onPress:      () => void;
  active?:      boolean;
  activeColor?: string;
  loading?:     boolean;
  disabled?:    boolean;
}

function ActionBtn({
  icon, onPress, active, activeColor, loading, disabled,
}: ActionBtnProps) {
  const { isLight } = useTheme();
  const color = activeColor ?? COLORS.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [{
        width:           38,
        height:          38,
        borderRadius:    12,
        backgroundColor: active
          ? `${color}22`
          : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1,
        borderColor:     active ? `${color}55` : COLORS.border,
        opacity:         disabled ? 0.5 : pressed ? 0.7 : 1,
        position:        'relative' as const,
      }]}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon as any} size={17} color={active ? color : COLORS.textSecondary} />}
    </Pressable>
  );
}

// ─── Export Sheet ─────────────────────────────────────────────────────────────

function ExportSheet({
  visible,
  reportId,
  workspaceId,
  reportTitle,
  onClose,
}: {
  visible:     boolean;
  reportId:    string;
  workspaceId: string;
  reportTitle: string;
  onClose:     () => void;
}) {
  const { isLight }             = useTheme();
  const [busy,      setBusy]    = useState<string | null>(null);
  const [copiedMd,  setCopiedMd]  = useState(false);
  const [copiedTxt, setCopiedTxt] = useState(false);

  useEffect(() => {
    if (visible) { setBusy(null); setCopiedMd(false); setCopiedTxt(false); }
  }, [visible]);

  const handlePDF = async () => {
    if (busy) return;
    setBusy('pdf');
    const { error } = await exportWorkspaceReportAsPDF(reportId, workspaceId);
    setBusy(null);
    if (error) Alert.alert('Export Error', error);
    else onClose();
  };

  const handleMarkdown = async () => {
    if (busy) return;
    setBusy('md');
    const { error } = await exportWorkspaceReportAsMarkdown(reportId, workspaceId);
    setBusy(null);
    if (!error) { setCopiedMd(true); setTimeout(() => setCopiedMd(false), 2500); }
    else Alert.alert('Error', error);
  };

  const handleCopyText = async () => {
    if (busy) return;
    setBusy('txt');
    const { error } = await copyWorkspaceReportToClipboard(reportId, workspaceId);
    setBusy(null);
    if (!error) { setCopiedTxt(true); setTimeout(() => setCopiedTxt(false), 2500); }
    else Alert.alert('Error', error);
  };

  type Opt = { id: string; icon: string; label: string; sub: string; color: string; onPress: () => void; };
  const options: Opt[] = [
    {
      id:      'pdf',
      icon:    'document-text-outline',
      label:   'Download PDF',
      sub:     'Full styled research report',
      color:   COLORS.primary,
      onPress: handlePDF,
    },
    {
      id:      'md',
      icon:    copiedMd ? 'checkmark-circle-outline' : 'logo-markdown',
      label:   copiedMd ? 'Copied!' : 'Copy as Markdown',
      sub:     'Structured markdown format',
      color:   COLORS.secondary,
      onPress: handleMarkdown,
    },
    {
      id:      'txt',
      icon:    copiedTxt ? 'checkmark-circle-outline' : 'copy-outline',
      label:   copiedTxt ? 'Copied!' : 'Copy as Plain Text',
      sub:     'Plain text for notes or email',
      color:   COLORS.accent,
      onPress: handleCopyText,
    },
  ];

  const sheetBg: readonly [string, string] = isLight
    ? ['#F5F6FB', '#FFFFFF']
    : ['#1A1A38', '#0A0A1A'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: getModalBackdrop(0.65),
          justifyContent:  'flex-end',
        }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={{
          borderTopLeftRadius:  28,
          borderTopRightRadius: 28,
          overflow:             'hidden',
          borderTopWidth:       1,
          borderTopColor:       COLORS.border,
        }}>
          <LinearGradient colors={sheetBg} style={{ padding: SPACING.xl, paddingBottom: SPACING.xl + 8 }}>

            {/* Handle */}
            <View style={{
              width:           40,
              height:          4,
              borderRadius:    2,
              backgroundColor: COLORS.border,
              alignSelf:       'center',
              marginBottom:    SPACING.lg,
            }} />

            {/* Title row */}
            <View style={{ marginBottom: SPACING.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    width:          34,
                    height:         34,
                    borderRadius:   11,
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="download" size={16} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                  Download Report
                </Text>
              </View>
              <Text
                style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4, marginLeft: 44 }}
                numberOfLines={2}
              >
                {reportTitle}
              </Text>
            </View>

            {/* Options */}
            {options.map(opt => (
              <TouchableOpacity
                key={opt.id}
                onPress={opt.onPress}
                activeOpacity={0.78}
                style={{
                  flexDirection:   'row',
                  alignItems:      'center',
                  gap:             14,
                  padding:         SPACING.md,
                  backgroundColor: isLight
                    ? 'rgba(0,0,0,0.03)'
                    : COLORS.backgroundElevated,
                  borderRadius:    RADIUS.lg,
                  marginBottom:    SPACING.sm,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                }}
              >
                <View style={{
                  width:           44,
                  height:          44,
                  borderRadius:    13,
                  backgroundColor: `${opt.color}18`,
                  alignItems:      'center',
                  justifyContent:  'center',
                  borderWidth:     1,
                  borderColor:     `${opt.color}25`,
                }}>
                  {busy === opt.id
                    ? <ActivityIndicator size="small" color={opt.color} />
                    : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                    {opt.sub}
                  </Text>
                </View>
                {!busy && (
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                )}
              </TouchableOpacity>
            ))}

            {/* Cancel */}
            <TouchableOpacity
              onPress={onClose}
              style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WorkspaceReportScreen() {
  const {
    reportId,
    workspaceId,
    userRole: roleParam,
  } = useLocalSearchParams<{ reportId: string; workspaceId: string; userRole?: string }>();

  const insets             = useSafeAreaInsets();
  const { isLight }        = useTheme();

  // ── Part 52: realtime role (seeded from nav param, kept live) ──────────────
  const initialRole = (roleParam as WorkspaceRole) ?? 'viewer';
  const { role: liveRole } = useWorkspaceReportRole(
    workspaceId ?? null,
    initialRole,
    {
      onKicked: () => {
        Alert.alert(
          'Access Removed',
          'You no longer have access to this report.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
        setTimeout(() => router.back(), 50);
      },
    },
  );
  const userRole = liveRole ?? initialRole;

  // ── Report state ────────────────────────────────────────────────────────────
  const [report,          setReport]          = useState<ResearchReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [loadError,       setLoadError]       = useState<string | null>(null);
  const [currentUserId,   setCurrentUserId]   = useState('');

  // ── Navigation / UI ─────────────────────────────────────────────────────────
  const [activeTab,         setActiveTab]         = useState<TabKey>('report');
  const [activeSection,     setActiveSection]     = useState<{ id: string; title: string } | null>(null);
  const [showComments,      setShowComments]      = useState(false);
  const [showExportSheet,   setShowExportSheet]   = useState(false);
  const [showRequestModal,  setShowRequestModal]  = useState(false);
  const [showReportDetails, setShowReportDetails] = useState(false);

  // ── AI summary ──────────────────────────────────────────────────────────────
  const [summary,          setSummary]          = useState<CommentSummaryResult | null>(null);
  const [isSummarizing,    setIsSummarizing]    = useState(false);
  const [summaryError,     setSummaryError]     = useState<string | null>(null);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);

  // ── Report details scroll tracking ──────────────────────────────────────────
  const [contentH,  setContentH]  = useState(0);
  const [scrollerH, setScrollerH] = useState(0);
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  // ── Load report ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId || !workspaceId) {
      setLoadError('Missing report or workspace ID.');
      setIsLoadingReport(false);
      return;
    }
    loadReportForWorkspace(reportId, workspaceId).then(({ report, errorMessage }) => {
      if (report) setReport(report);
      else        setLoadError(errorMessage ?? 'Report not found.');
      setIsLoadingReport(false);
    });
  }, [reportId, workspaceId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // ── Comments hooks ──────────────────────────────────────────────────────────
  const {
    comments,
    sectionCounts,
    isLoading: commentsLoading,
    isSending,
    postComment,
    postReply,
    toggleResolve,
    removeComment,
    removeReply,
    getCommentsForSection,
  } = useReportComments(reportId ?? null, workspaceId ?? null);

  const { othersOnline }                             = usePresence(reportId ?? null, true);
  const commentIds                                   = comments.map(c => c.id);
  const { getReactions, toggle: toggleReaction }     = useCommentReactions(commentIds);

  const {
    myRequest,
    isSubmitting,
    hasPendingRequest,
    submit: submitRequest,
    retract: retractRequest,
  } = useMyAccessRequest(workspaceId ?? null, userRole);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isEditor      = userRole === 'owner' || userRole === 'editor';
  const isViewer       = userRole === 'viewer';
  const totalComments  = comments.length;

  const visibleComments = activeSection
    ? getCommentsForSection(activeSection.id)
    : comments;

  const depthColor = (() => {
    const map: Record<string, string> = {
      quick:  COLORS.success,
      deep:   COLORS.primary,
      expert: COLORS.warning,
    };
    return map[(report?.depth as string) ?? ''] ?? COLORS.primary;
  })();

  const reliabilityColor =
    (report?.reliabilityScore ?? 0) >= 8 ? COLORS.success
    : (report?.reliabilityScore ?? 0) >= 6 ? COLORS.warning
    : COLORS.error;

  // ── Sources: trust-score every citation, sort best-first (mirrors
  //     research-report.tsx so both screens present sources identically) ──────
  const sortedCitations = (report?.citations ?? []).length
    ? [...(report!.citations as any[])]
        .map(c => ({ ...c, trustScore: c.trustScore ?? scoreSource(c.url ?? '', c.source) }))
        .sort((a, b) => {
          const ta = a.trustScore?.tier ?? 3, tb = b.trustScore?.tier ?? 3;
          if (ta !== tb) return ta - tb;
          return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
        })
    : [];

  const avgSourceQuality = sortedCitations.length > 0
    ? Math.round(
        sortedCitations.reduce((s, c) => s + (c.trustScore?.credibilityScore ?? 5), 0)
        / sortedCitations.length * 10
      ) / 10
    : null;

  // ── Part 52: close section composer on demotion ─────────────────────────────
  useEffect(() => {
    if (!isEditor) setActiveSection(null);
  }, [isEditor]);

  // ── AI summary ──────────────────────────────────────────────────────────────
  const handleGenerateSummary = async () => {
    if (!reportId || !workspaceId) return;
    setIsSummarizing(true);
    setSummaryError(null);
    setShowSummaryPanel(true);
    const { data, error } = await generateCommentSummary(reportId, workspaceId);
    setSummary(data);
    setSummaryError(error);
    setIsSummarizing(false);
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSectionTap = (sectionId: string, sectionTitle: string) => {
    if (!isEditor) return;
    setActiveSection({ id: sectionId, title: sectionTitle });
    setShowComments(true);
  };

  const handleOpenComments = () => {
    setActiveSection(null);
    setShowComments(true);
  };

  const handleToggleSummary = () => {
    setShowSummaryPanel(v => !v);
    if (!showSummaryPanel && !summary) handleGenerateSummary();
  };

  const openURL = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Cannot open URL', url);
    } catch {
      Alert.alert('Error', 'Could not open this link.');
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });

  // ── Theme-derived surfaces ───────────────────────────────────────────────────
  // Every surface below now branches on `isLight` so text/icons drawn on top
  // never lose contrast — no more dark-mode-only hex literals leaking into
  // light theme (and vice versa).
  const bgGradient: readonly [string, string, string] = isLight
    ? ['#F5F6FB', '#FFFFFF', '#EEF0F8']
    : [COLORS.background, COLORS.backgroundCard, COLORS.backgroundElevated];

  const headerGradient: readonly [string, string] = isLight
    ? ['#EEF0F8', '#FFFFFF']
    : ['#16162F', '#0E0E22'];

  const cardBg: readonly [string, string] = isLight
    ? ['#FFFFFF', '#EEF0F8']
    : [COLORS.backgroundCard, COLORS.backgroundElevated];

  const sheetBg: readonly [string, string] = isLight
    ? ['#F5F6FB', '#FFFFFF']
    : ['#1A1A38', '#0A0A1A'];

  const elevatedBg = isLight ? 'rgba(0,0,0,0.03)' : COLORS.backgroundElevated;
  const subtleBg   = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';

  // Viewer / editor role banners previously used a flat near-white card in
  // light mode (fine) but leaned on COLORS.backgroundCard in dark mode, which
  // in some palettes is nearly identical to the page background — replaced
  // with a translucent tint of the banner's own accent color so it always
  // separates from the surrounding surface in either theme.
  const viewerBannerBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)';

  // ── Stat tiles ───────────────────────────────────────────────────────────────
  const statTiles = report
    ? [
        { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline' as const,            color: COLORS.info      },
        { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline' as const,             color: COLORS.primary   },
        { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline' as const, color: reliabilityColor },
        { label: 'Comments',    value: String(totalComments),           icon: 'chatbubbles-outline' as const,      color: COLORS.secondary },
      ]
    : [];

  // ─── Loading / error screens ─────────────────────────────────────────────────

  if (isLoadingReport) {
    return (
      <LinearGradient
        colors={[COLORS.background, COLORS.backgroundCard]}
        style={styles.centered}
      >
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
          Loading report…
        </Text>
      </LinearGradient>
    );
  }

  if (loadError || !report) {
    return (
      <LinearGradient
        colors={[COLORS.background, COLORS.backgroundCard]}
        style={styles.centered}
      >
        <View style={[styles.errorIconWrap, { backgroundColor: `${COLORS.error}15` }]}>
          <Ionicons name="document-lock-outline" size={44} color={COLORS.error} />
        </View>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
          Report Unavailable
        </Text>
        <Text style={{
          color:     COLORS.textSecondary,
          fontSize:  FONTS.sizes.sm,
          textAlign: 'center',
          lineHeight:22,
          maxWidth:  300,
        }}>
          {loadError ?? 'This report could not be loaded.'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.errorBackBtn, { backgroundColor: COLORS.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={16} color="#FFF" />
          <Text style={styles.errorBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  // Report Details sheet: clamp to whatever vertical space is actually
  // available below the status bar / notch so it can never be pushed off
  // the top of short devices. SHEET_MAX_H is a ceiling, not a fixed height.
  const detailsSheetHeight = Math.min(SHEET_MAX_H, SCREEN_H - insets.top - 24);
  const detailsScrollHeight = detailsSheetHeight - 90 - insets.bottom;

  return (
    <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ══ FIXED HERO HEADER ══ */}
        <View style={{ zIndex: 10 }}>
          <LinearGradient
            colors={headerGradient}
            style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border }}
          >
            {/* Row 1 — back button / tappable title */}
            <View style={{
              flexDirection:     'row',
              alignItems:        'flex-start',
              paddingHorizontal: SPACING.md,
              paddingTop:        SPACING.sm,
              paddingBottom:     6,
              gap:               SPACING.sm,
            }}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => [{
                  width:           38,
                  height:          38,
                  borderRadius:    12,
                  backgroundColor: subtleBg,
                  alignItems:      'center',
                  justifyContent:  'center',
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                  flexShrink:      0,
                  opacity:         pressed ? 0.7 : 1,
                }]}
              >
                <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
              </Pressable>

              {/* Title tap → report details sheet */}
              <Pressable
                onPress={() => setShowReportDetails(true)}
                style={{
                  flex:          1,
                  flexDirection: 'row',
                  alignItems:    'center',
                  gap:           6,
                  minWidth:      0,
                }}
                hitSlop={{ top: 6, bottom: 6 }}
              >
                <Text
                  style={{
                    color:         COLORS.textPrimary,
                    fontSize:      FONTS.sizes.base,
                    fontWeight:    '800',
                    flex:          1,
                    letterSpacing: -0.2,
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {report.title}
                </Text>
                <View style={{
                  width:           22,
                  height:          22,
                  borderRadius:    7,
                  backgroundColor: subtleBg,
                  alignItems:      'center',
                  justifyContent:  'center',
                  flexShrink:      0,
                }}>
                  <Ionicons name="chevron-down" size={13} color={COLORS.textMuted} />
                </View>
              </Pressable>
            </View>

            {/* Row 2 — depth / date / action buttons */}
            <View style={{
              flexDirection:     'row',
              alignItems:        'center',
              paddingHorizontal: SPACING.md,
              paddingBottom:     SPACING.sm,
              gap:               SPACING.sm,
            }}>
              {/* Depth pill */}
              <View style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:               4,
                paddingHorizontal: 9,
                paddingVertical:   5,
                backgroundColor:   `${depthColor}1A`,
                borderRadius:      RADIUS.full,
                borderWidth:       1,
                borderColor:       `${depthColor}40`,
                flexShrink:        0,
              }}>
                <Ionicons
                  name={
                    report.depth === 'expert' ? 'star'
                    : report.depth === 'deep'  ? 'layers'
                    : 'flash'
                  }
                  size={10}
                  color={depthColor}
                />
                <Text style={{ color: depthColor, fontSize: 10, fontWeight: '800' }}>
                  {DEPTH_LABELS[report.depth] ?? report.depth}
                </Text>
              </View>

              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flexShrink: 0 }}>
                {formatDate(report.createdAt)}
              </Text>
              {report.sourcesCount > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flexShrink: 0 }}>
                  · {report.sourcesCount} sources
                </Text>
              )}

              <View style={{ flex: 1 }} />

              {/* Scrollable action row */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  flexDirection: 'row',
                  gap:           7,
                  alignItems:    'center',
                  paddingRight:  SPACING.xs,
                }}
                style={{ flexShrink: 0, maxWidth: SCREEN_W - 200 }}
              >
                {/* Download — available to ALL members */}
                <ActionBtn
                  icon="download-outline"
                  onPress={() => setShowExportSheet(true)}
                />
                {/* Comments toggle — count lives on the segmented tab, not here */}
                <ActionBtn
                  icon={showComments ? 'chatbubbles' : 'chatbubbles-outline'}
                  onPress={showComments ? () => setShowComments(false) : handleOpenComments}
                  active={showComments}
                />
              </ScrollView>
            </View>
          </LinearGradient>
        </View>

        {/* ── Viewer banner (hides instantly on promotion) ── */}
        {isViewer && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[
              styles.roleBanner,
              {
                borderColor:     COLORS.border,
                backgroundColor: viewerBannerBg,
              },
            ]}
          >
            {hasPendingRequest ? (
              <View style={styles.roleBannerLeft}>
                <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  Editor access request pending…
                </Text>
              </View>
            ) : (
              <View style={styles.roleBannerLeft}>
                <Ionicons name="eye-outline" size={14} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  You're a viewer — read only
                </Text>
              </View>
            )}
            {!hasPendingRequest && (
              <TouchableOpacity
                onPress={() => setShowRequestModal(true)}
                style={[styles.roleBannerCta, { backgroundColor: COLORS.primary }]}
                activeOpacity={0.85}
              >
                <Ionicons name="pencil-outline" size={12} color="#FFF" />
                <Text style={styles.roleBannerCtaText}>Request Access</Text>
              </TouchableOpacity>
            )}
            {hasPendingRequest && (
              <TouchableOpacity
                onPress={() => setShowRequestModal(true)}
                style={[styles.roleBannerCta, { backgroundColor: `${COLORS.warning}30` }]}
              >
                <Text style={[styles.roleBannerCtaText, { color: COLORS.warning }]}>View</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ── Editor confirmation banner (appears instantly on promotion) ── */}
        {isEditor && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[
              styles.roleBanner,
              {
                borderColor:     `${COLORS.success}30`,
                backgroundColor: isLight ? `${COLORS.success}0C` : `${COLORS.success}14`,
              },
            ]}
          >
            <View style={styles.roleBannerLeft}>
              <Ionicons name="create-outline" size={14} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                {userRole === 'owner'
                  ? 'Owner — full edit access'
                  : 'Editor — you can comment & discuss'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Presence bar ── */}
        {othersOnline.length > 0 && (
          <Animated.View
            entering={FadeIn.duration(400)}
            style={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm }}
          >
            <PresenceBar users={othersOnline} />
          </Animated.View>
        )}

        {/* ── Segmented tabs ── */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
          <SegmentedTabs
            tabs={[
              { key: 'report',   label: 'Report'   },
              { key: 'findings', label: 'Findings' },
              { key: 'sources',  label: `Sources${sortedCitations.length > 0 ? ` (${sortedCitations.length})` : ''}` },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </View>

        {/* ── Scrollable body ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingTop:        SPACING.sm,
            paddingBottom:     insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Stat tiles (shown on all tabs) ── */}
          {report.reliabilityScore > 0 && (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}
            >
              {statTiles.map(stat => (
                <View
                  key={stat.label}
                  style={{
                    flex:         1,
                    borderRadius: RADIUS.lg,
                    overflow:     'hidden',
                    borderWidth:  1,
                    borderColor:  `${stat.color}33`,
                  }}
                >
                  <LinearGradient
                    colors={cardBg}
                    style={{ padding: SPACING.sm, alignItems: 'center' }}
                  >
                    <LinearGradient
                      colors={[stat.color, `${stat.color}99`] as readonly [string, string]}
                      style={{
                        width:          30,
                        height:         30,
                        borderRadius:   9,
                        alignItems:     'center',
                        justifyContent: 'center',
                        marginBottom:   6,
                      }}
                    >
                      <Ionicons name={stat.icon} size={15} color="#FFF" />
                    </LinearGradient>
                    <Text style={{ color: stat.color, fontSize: FONTS.sizes.md, fontWeight: '900' }}>
                      {stat.value}
                    </Text>
                    <Text style={{
                      color:     COLORS.textMuted,
                      fontSize:  10,
                      marginTop: 2,
                      textAlign: 'center',
                      fontWeight:'600',
                    }}>
                      {stat.label}
                    </Text>
                  </LinearGradient>
                </View>
              ))}
            </Animated.View>
          )}

          {/* ════════════════════════════════════════
              REPORT TAB
          ════════════════════════════════════════ */}
          {activeTab === 'report' && (
            <>
              {/* Executive Summary */}
              <Animated.View entering={FadeInDown.duration(400).delay(50)}>
                <View style={{
                  borderRadius: RADIUS.xl,
                  marginBottom: SPACING.lg,
                  overflow:     'hidden',
                  borderWidth:  1,
                  borderColor:  `${COLORS.primary}2A`,
                }}>
                  <LinearGradient colors={cardBg} style={{ padding: SPACING.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                      <LinearGradient
                        colors={COLORS.gradientPrimary}
                        style={{
                          width:          34,
                          height:         34,
                          borderRadius:   11,
                          alignItems:     'center',
                          justifyContent: 'center',
                          marginRight:    SPACING.sm,
                        }}
                      >
                        <Ionicons name="newspaper" size={16} color="#FFF" />
                      </LinearGradient>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                        Executive Summary
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                      {report.executiveSummary}
                    </Text>
                  </LinearGradient>
                </View>
              </Animated.View>

              {/* Sections */}
              {report.sections.map((section, idx) => {
                const cnt = sectionCounts[section.id] ?? 0;
                return (
                  <Animated.View
                    key={section.id ?? idx}
                    entering={FadeInDown.duration(400).delay(idx * 40)}
                    style={{ marginBottom: SPACING.sm }}
                  >
                    <View style={{
                      borderRadius: RADIUS.lg,
                      overflow:     'hidden',
                      borderWidth:  1,
                      borderColor:  cnt > 0 ? `${COLORS.primary}30` : COLORS.border,
                    }}>
                      <LinearGradient colors={cardBg} style={{ padding: SPACING.md }}>
                        {/* Section header — tap to open section comments (editor only) */}
                        <TouchableOpacity
                          onPress={() => handleSectionTap(section.id, section.title)}
                          activeOpacity={isEditor ? 0.7 : 1}
                          style={{
                            flexDirection:  'row',
                            alignItems:     'center',
                            justifyContent: 'space-between',
                            marginBottom:   8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            {(section as any).icon && (
                              <Ionicons name={(section as any).icon} size={15} color={COLORS.primary} />
                            )}
                            <Text style={{
                              color:      COLORS.textPrimary,
                              fontSize:   FONTS.sizes.base,
                              fontWeight: '700',
                              flex:       1,
                            }}>
                              {section.title}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {cnt > 0 && (
                              <View style={{
                                flexDirection:     'row',
                                alignItems:        'center',
                                gap:               3,
                                backgroundColor:   `${COLORS.primary}15`,
                                borderRadius:      RADIUS.full,
                                paddingHorizontal: 6,
                                paddingVertical:   2,
                              }}>
                                <Ionicons name="chatbubble" size={10} color={COLORS.primary} />
                                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                                  {cnt}
                                </Text>
                              </View>
                            )}
                            {isEditor && (
                              <Ionicons name="chatbubble-ellipses-outline" size={13} color={COLORS.textMuted} />
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Section body */}
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                          {section.content}
                        </Text>

                        {/* Bullets */}
                        {((section as any).bullets ?? []).length > 0 && (
                          <View style={{ marginTop: SPACING.sm, gap: 6 }}>
                            {((section as any).bullets as string[]).map((b: string, bi: number) => (
                              <View key={bi} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                                <View style={{
                                  width:           5,
                                  height:          5,
                                  borderRadius:    3,
                                  backgroundColor: COLORS.primary,
                                  marginTop:       7,
                                  flexShrink:      0,
                                }} />
                                <Text style={{
                                  color:     COLORS.textSecondary,
                                  fontSize:  FONTS.sizes.sm,
                                  lineHeight:20,
                                  flex:      1,
                                }}>
                                  {b}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </LinearGradient>
                    </View>
                  </Animated.View>
                );
              })}

              {/* Editor CTA card */}
              {isEditor && (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <Pressable
                    onPress={handleOpenComments}
                    style={({ pressed }) => [{
                      borderRadius: RADIUS.xl,
                      marginTop:    SPACING.sm,
                      overflow:     'hidden',
                      borderWidth:  1,
                      borderColor:  `${COLORS.primary}25`,
                      opacity:      pressed ? 0.85 : 1,
                    }]}
                  >
                    <LinearGradient colors={cardBg} style={{ padding: SPACING.lg }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                        <LinearGradient
                          colors={COLORS.gradientPrimary}
                          style={{
                            width:          50,
                            height:         50,
                            borderRadius:   15,
                            alignItems:     'center',
                            justifyContent: 'center',
                            flexShrink:     0,
                            ...SHADOWS.medium,
                          }}
                        >
                          <Ionicons name="chatbubble-ellipses" size={22} color="#FFF" />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                          <Text style={{
                            color:      COLORS.textPrimary,
                            fontSize:   FONTS.sizes.base,
                            fontWeight: '900',
                            marginBottom: 4,
                          }}>
                            Add a Comment
                          </Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17 }}>
                            Tap any section heading to comment inline, or start a general discussion
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                      </View>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              )}
            </>
          )}

          {/* ════════════════════════════════════════
              FINDINGS TAB
          ════════════════════════════════════════ */}
          {activeTab === 'findings' && (
            <>
              {/* Key findings */}
              {report.keyFindings.length > 0 && (
                <>
                  <Text style={sectionLabel()}>Key Findings</Text>
                  {report.keyFindings.map((finding, i) => (
                    <Animated.View
                      key={i}
                      entering={FadeInDown.duration(350).delay(i * 50)}
                      style={{
                        borderRadius: RADIUS.lg,
                        marginBottom: SPACING.sm,
                        overflow:     'hidden',
                        borderWidth:  1,
                        borderColor:  COLORS.border,
                      }}
                    >
                      <LinearGradient
                        colors={cardBg}
                        style={{
                          padding:       SPACING.md,
                          flexDirection: 'row',
                          alignItems:    'flex-start',
                          borderLeftWidth:3,
                          borderLeftColor:COLORS.primary,
                        }}
                      >
                        <LinearGradient
                          colors={COLORS.gradientPrimary}
                          style={{
                            width:          26,
                            height:         26,
                            borderRadius:   9,
                            alignItems:     'center',
                            justifyContent: 'center',
                            marginRight:    SPACING.sm,
                            flexShrink:     0,
                          }}
                        >
                          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '900' }}>
                            {i + 1}
                          </Text>
                        </LinearGradient>
                        <Text style={{
                          color:      COLORS.textPrimary,
                          fontSize:   FONTS.sizes.sm,
                          lineHeight: 21,
                          flex:       1,
                          fontWeight: '500',
                        }}>
                          {finding}
                        </Text>
                      </LinearGradient>
                    </Animated.View>
                  ))}
                </>
              )}

              {/* Future predictions */}
              {report.futurePredictions.length > 0 && (
                <>
                  <Text style={[sectionLabel(), { marginTop: SPACING.lg }]}>Future Predictions</Text>
                  {report.futurePredictions.map((pred, i) => (
                    <View
                      key={i}
                      style={{
                        borderRadius: RADIUS.lg,
                        marginBottom: SPACING.sm,
                        overflow:     'hidden',
                        borderWidth:  1,
                        borderColor:  `${COLORS.warning}2A`,
                      }}
                    >
                      <LinearGradient
                        colors={[`${COLORS.warning}14`, `${COLORS.warning}06`] as readonly [string, string]}
                        style={{ padding: SPACING.md, flexDirection: 'row', alignItems: 'flex-start' }}
                      >
                        <Ionicons
                          name="telescope"
                          size={16}
                          color={COLORS.warning}
                          style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }}
                        />
                        <Text style={{
                          color:     COLORS.textSecondary,
                          fontSize:  FONTS.sizes.sm,
                          lineHeight:21,
                          flex:      1,
                        }}>
                          {pred}
                        </Text>
                      </LinearGradient>
                    </View>
                  ))}
                </>
              )}

              {/* Key statistics */}
              {(report.statistics?.length ?? 0) > 0 && (
                <>
                  <Text style={[sectionLabel(), { marginTop: SPACING.lg }]}>Key Statistics</Text>
                  {report.statistics.slice(0, 10).map((stat, i) => (
                    <View
                      key={i}
                      style={{
                        borderRadius: RADIUS.lg,
                        marginBottom: SPACING.sm,
                        overflow:     'hidden',
                        borderWidth:  1,
                        borderColor:  `${COLORS.primary}22`,
                      }}
                    >
                      <LinearGradient colors={cardBg} style={{ padding: SPACING.md }}>
                        <Text style={{
                          color:      COLORS.primaryLight ?? COLORS.primary,
                          fontSize:   FONTS.sizes.lg,
                          fontWeight: '900',
                        }}>
                          {stat.value}
                        </Text>
                        <Text style={{
                          color:     COLORS.textPrimary,
                          fontSize:  FONTS.sizes.sm,
                          lineHeight:19,
                          marginTop: 4,
                        }}>
                          {stat.context}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>
                          Source: {stat.source}
                        </Text>
                      </LinearGradient>
                    </View>
                  ))}
                </>
              )}

              {/* Empty state */}
              {report.keyFindings.length === 0 && report.futurePredictions.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
                  <Ionicons name="analytics-outline" size={40} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    No Findings Yet
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                    Key findings appear here once the report is fully processed.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ════════════════════════════════════════
              SOURCES TAB — ranked, trust-scored citations
              (mirrors research-report.tsx's Sources tab)
          ════════════════════════════════════════ */}
          {activeTab === 'sources' && (
            <>
              {sortedCitations.length > 0 ? (
                <>
                  <Animated.View entering={FadeInDown.duration(400)}>
                    <SourceTrustSummaryBanner results={sortedCitations} />
                    <View style={{ marginBottom: SPACING.md }}>
                      <TrustDistributionBar results={sortedCitations} />
                    </View>
                  </Animated.View>

                  <View style={{
                    flexDirection:  'row',
                    justifyContent: 'space-between',
                    alignItems:     'center',
                    marginBottom:   SPACING.md,
                  }}>
                    <Text style={sectionLabel()}>
                      {sortedCitations.length} Sources · Sorted by Trust
                    </Text>
                    {avgSourceQuality !== null && (
                      <View style={{
                        backgroundColor:   `${getScoreColor(avgSourceQuality)}1A`,
                        borderRadius:      RADIUS.full,
                        paddingHorizontal: 10,
                        paddingVertical:   4,
                        borderWidth:       1,
                        borderColor:       `${getScoreColor(avgSourceQuality)}40`,
                      }}>
                        <Text style={{
                          color:      getScoreColor(avgSourceQuality),
                          fontSize:   FONTS.sizes.xs,
                          fontWeight: '800',
                        }}>
                          Avg {avgSourceQuality}/10
                        </Text>
                      </View>
                    )}
                  </View>

                  {sortedCitations.map((c, i) => (
                    <Pressable
                      key={c.id ?? i}
                      onPress={() => openURL(c.url)}
                      style={{
                        borderRadius: RADIUS.lg,
                        marginBottom: SPACING.sm,
                        overflow:     'hidden',
                        borderWidth:  1,
                        borderColor:  c.trustScore?.tier === 1
                          ? `${COLORS.success}33`
                          : c.trustScore?.tier === 2
                          ? `${COLORS.primary}2A`
                          : COLORS.border,
                      }}
                    >
                      <LinearGradient colors={cardBg} style={{ padding: SPACING.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{
                            width:          24,
                            height:         24,
                            borderRadius:   7,
                            backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}22` : `${COLORS.primary}22`,
                            alignItems:     'center',
                            justifyContent: 'center',
                            marginRight:    9,
                            flexShrink:     0,
                          }}>
                            <Text style={{
                              color:      c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary,
                              fontSize:   10,
                              fontWeight: '900',
                            }}>
                              {i + 1}
                            </Text>
                          </View>
                          <Text style={{
                            color:      COLORS.textPrimary,
                            fontSize:   FONTS.sizes.sm,
                            fontWeight: '700',
                            flex:       1,
                            lineHeight: 20,
                          }}>
                            {c.title}
                          </Text>
                          <Ionicons
                            name="open-outline"
                            size={16}
                            color={COLORS.primary}
                            style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }}
                          />
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
                      <View style={{
                        flexDirection:  'row',
                        justifyContent: 'space-between',
                        alignItems:     'center',
                        marginBottom:   SPACING.md,
                      }}>
                        <Text style={sectionLabel()}>{report.searchQueries.length} Search Queries</Text>
                        <View style={{
                          backgroundColor:   `${COLORS.info}1A`,
                          borderRadius:      RADIUS.full,
                          paddingHorizontal: 11,
                          paddingVertical:   4,
                          borderWidth:       1,
                          borderColor:       `${COLORS.info}2A`,
                        }}>
                          <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '800' }}>
                            {report.sourcesCount} UNIQUE SOURCES
                          </Text>
                        </View>
                      </View>
                      {report.searchQueries.map((q, i) => (
                        <View
                          key={i}
                          style={{
                            backgroundColor:   isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                            borderRadius:      RADIUS.md,
                            paddingHorizontal: SPACING.md,
                            paddingVertical:   9,
                            marginBottom:      6,
                            flexDirection:     'row',
                            alignItems:        'center',
                            borderWidth:       1,
                            borderColor:       COLORS.border,
                          }}
                        >
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted} style={{ marginRight: 9 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
                  <Ionicons name="link-outline" size={40} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    No Sources Yet
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                    Citations and source links will appear here once research is complete.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* ── FAB — editor only; appears / disappears live with role ── */}
        {isEditor && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{
              position: 'absolute',
              right:    SPACING.xl,
              bottom:   insets.bottom + 20,
            }}
          >
            <TouchableOpacity
              onPress={handleOpenComments}
              style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:               6,
                backgroundColor:   COLORS.primary,
                borderRadius:      28,
                paddingHorizontal: 18,
                paddingVertical:   13,
                ...SHADOWS.medium,
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
              {totalComments > 0 && (
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                  {totalComments}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* ══ Comments Bottom Sheet (section-specific composer) ══ */}
      <Modal
        visible={showComments}
        transparent
        animationType="none"
        onRequestClose={() => setShowComments(false)}
      >
        <TouchableOpacity
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: getModalBackdrop(0.55),
          }}
          activeOpacity={1}
          onPress={() => setShowComments(false)}
        />

        <Animated.View
          entering={SlideInUp.duration(320)}
          exiting={SlideOutDown.duration(260)}
          style={{
            position:             'absolute',
            left:                 0,
            right:                0,
            bottom:               0,
            height:               SHEET_HEIGHT,
            paddingBottom:        insets.bottom,
            backgroundColor:      isLight ? '#FFFFFF' : COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            borderTopWidth:       1,
            borderColor:          COLORS.border,
            ...SHADOWS.large,
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
          </View>

          {/* Sheet header */}
          <View style={{
            flexDirection:     'row',
            alignItems:        'flex-start',
            paddingHorizontal: SPACING.xl,
            paddingBottom:     SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            gap:               8,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                {activeSection
                  ? `Section: ${activeSection.title.length > 28
                      ? activeSection.title.slice(0, 28) + '…'
                      : activeSection.title}`
                  : 'All Comments'}
              </Text>
              {activeSection && (
                <TouchableOpacity
                  onPress={() => setActiveSection(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                >
                  <Ionicons name="close-circle-outline" size={13} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    Show all comments
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {totalComments > 0 && (
              <TouchableOpacity
                onPress={handleToggleSummary}
                style={{
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:               4,
                  backgroundColor:   showSummaryPanel
                    ? `${COLORS.primary}12`
                    : elevatedBg,
                  borderRadius:      RADIUS.lg,
                  paddingHorizontal: 10,
                  paddingVertical:   6,
                  borderWidth:       1,
                  borderColor:       showSummaryPanel
                    ? `${COLORS.primary}40`
                    : COLORS.border,
                }}
                activeOpacity={0.8}
              >
                {isSummarizing
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Ionicons
                      name="sparkles"
                      size={14}
                      color={showSummaryPanel ? COLORS.primary : COLORS.textSecondary}
                    />}
                <Text style={{
                  color:      showSummaryPanel ? COLORS.primary : COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: '700',
                }}>
                  {showSummaryPanel ? 'Hide' : 'Summarize'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowComments(false)}
              style={{
                width:           34,
                height:          34,
                borderRadius:    10,
                backgroundColor: elevatedBg,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     COLORS.border,
                flexShrink:      0,
              }}
            >
              <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Comments list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {showSummaryPanel && (
              <CommentSummaryPanel
                summary={summary}
                isGenerating={isSummarizing}
                error={summaryError}
                totalComments={totalComments}
                onGenerate={handleGenerateSummary}
                onClose={() => setShowSummaryPanel(false)}
              />
            )}

            {commentsLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : visibleComments.length === 0 ? (
              <View style={{
                alignItems:       'center',
                paddingTop:       40,
                paddingHorizontal: SPACING.xl,
                gap:              10,
              }}>
                <Ionicons name="chatbubbles-outline" size={36} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                  No comments yet
                </Text>
                <Text style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.sm,
                  textAlign: 'center',
                  lineHeight:20,
                }}>
                  {isEditor
                    ? 'Tap any section heading to start a discussion, or write a general comment below.'
                    : 'No comments have been added yet.'}
                </Text>
              </View>
            ) : (
              visibleComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  userRole={userRole}
                  reactions={getReactions(comment.id)}
                  onToggleReaction={(cid, emoji) => toggleReaction(cid, emoji)}
                  onReply={postReply}
                  onResolve={toggleResolve}
                  onDeleteComment={removeComment}
                  onDeleteReply={removeReply}
                />
              ))
            )}
          </ScrollView>

          {/* ─── FIX: onClearSection is () => void — pass a real function ─── */}
          {isEditor && (
            <CommentInput
              sectionTitle={activeSection?.title}
              isSending={isSending}
              onSubmit={(text) => postComment(text, activeSection?.id, [])}
              onClearSection={() => setActiveSection(null)}
            />
          )}
        </Animated.View>
      </Modal>

      {/* ══ Export Sheet ══ */}
      {report && (
        <ExportSheet
          visible={showExportSheet}
          reportId={reportId ?? ''}
          workspaceId={workspaceId ?? ''}
          reportTitle={report.title}
          onClose={() => setShowExportSheet(false)}
        />
      )}

      {/* ══ Report Details Sheet ══ */}
      <Modal
        visible={showReportDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportDetails(false)}
      >
        <Pressable
          style={{
            flex:            1,
            backgroundColor: getModalBackdrop(0.6),
            justifyContent:  'flex-end',
          }}
          onPress={() => setShowReportDetails(false)}
        >
          {/* height is clamped (detailsSheetHeight) so the sheet can never
              extend above the safe area / off the top of short screens */}
          <Pressable onPress={e => e.stopPropagation()} style={{ height: detailsSheetHeight }}>
            <View style={{
              flex:                 1,
              borderTopLeftRadius:  30,
              borderTopRightRadius: 30,
              overflow:             'hidden',
              borderTopWidth:       1,
              borderColor:          COLORS.border,
            }}>
              <LinearGradient colors={sheetBg} style={{ flex: 1, paddingTop: SPACING.sm }}>

                {/* Drag handle */}
                <View style={{
                  width:           42,
                  height:          4,
                  borderRadius:    2,
                  backgroundColor: COLORS.border,
                  alignSelf:       'center',
                  marginBottom:    SPACING.sm,
                }} />

                {/* Sheet header */}
                <View style={{
                  flexDirection:     'row',
                  alignItems:        'center',
                  justifyContent:    'space-between',
                  paddingHorizontal: SPACING.lg,
                  paddingVertical:   SPACING.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                  marginBottom:      SPACING.sm,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 }}>
                    <LinearGradient
                      colors={COLORS.gradientPrimary}
                      style={{
                        width:          34,
                        height:         34,
                        borderRadius:   11,
                        alignItems:     'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="document-text" size={16} color="#FFF" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
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
                      width:           32,
                      height:          32,
                      borderRadius:    10,
                      backgroundColor: subtleBg,
                      alignItems:      'center',
                      justifyContent:  'center',
                      borderWidth:     1,
                      borderColor:     COLORS.border,
                    }}
                  >
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                {/* Scrollable detail content — height derived from the
                    clamped sheet height so content + scrollbar never push
                    past the bottom of the screen either */}
                <View style={{ flex: 1, height: detailsScrollHeight }}>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                      paddingHorizontal: SPACING.lg,
                      paddingTop:        SPACING.xs,
                      paddingBottom:     SPACING.lg + insets.bottom,
                      gap:               SPACING.sm,
                    }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    alwaysBounceVertical
                    onScroll={RNAnimated.event(
                      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                      { useNativeDriver: false },
                    )}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_, h) => setContentH(h)}
                    onLayout={e => setScrollerH(e.nativeEvent.layout.height)}
                  >
                    {/* Full title */}
                    <View style={detailCard(`${COLORS.primary}30`, isLight)}>
                      <Text style={detailLabel()}>Full Title</Text>
                      <Text style={{
                        color:      COLORS.textPrimary,
                        fontSize:   FONTS.sizes.base,
                        fontWeight: '800',
                        lineHeight: 24,
                      }}>
                        {report.title}
                      </Text>
                    </View>

                    {/* Original query */}
                    <View style={detailCard(COLORS.border, isLight)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="search-outline" size={13} color={COLORS.primary} />
                        <Text style={detailLabel()}>Original Query</Text>
                      </View>
                      <Text style={{
                        color:      COLORS.textSecondary,
                        fontSize:   FONTS.sizes.sm,
                        lineHeight: 20,
                        fontStyle:  'italic',
                      }}>
                        &ldquo;{report.query}&rdquo;
                      </Text>
                    </View>

                    {/* 3-up stat row */}
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {[
                        {
                          icon:   'layers-outline',
                          colors: COLORS.gradientPrimary,
                          label:  'Depth',
                          value:  DEPTH_LABELS[report.depth] ?? report.depth,
                          color:  COLORS.textPrimary,
                        },
                        {
                          icon:   'shield-checkmark-outline',
                          colors: [reliabilityColor, `${reliabilityColor}AA`] as readonly [string, string],
                          label:  'Reliability',
                          value:  `${report.reliabilityScore}/10`,
                          color:  reliabilityColor,
                        },
                        {
                          icon:   'globe-outline',
                          colors: [COLORS.info, `${COLORS.info}AA`] as readonly [string, string],
                          label:  'Sources',
                          value:  String(report.sourcesCount),
                          color:  COLORS.info,
                        },
                      ].map(item => (
                        <View
                          key={item.label}
                          style={{
                            ...detailCard(COLORS.border, isLight),
                            flex:       1,
                            alignItems: 'center' as const,
                            gap:        4,
                          }}
                        >
                          <LinearGradient
                            colors={item.colors}
                            style={{
                              width:          28,
                              height:         28,
                              borderRadius:   9,
                              alignItems:     'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons name={item.icon as any} size={13} color="#FFF" />
                          </LinearGradient>
                          <Text style={{
                            color:         COLORS.textMuted,
                            fontSize:      9,
                            fontWeight:    '700',
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                          }}>
                            {item.label}
                          </Text>
                          <Text style={{
                            color:      item.color,
                            fontSize:   FONTS.sizes.xs,
                            fontWeight: '800',
                            textAlign:  'center',
                          }}>
                            {item.value}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Role card */}
                    <View style={detailCard(COLORS.border, isLight)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons
                          name={
                            userRole === 'owner'  ? 'shield-checkmark-outline'
                            : userRole === 'editor' ? 'create-outline'
                            : 'eye-outline'
                          }
                          size={13}
                          color={
                            userRole === 'owner'  ? COLORS.warning
                            : userRole === 'editor' ? COLORS.success
                            : COLORS.textMuted
                          }
                        />
                        <Text style={detailLabel()}>Your Role</Text>
                      </View>
                      <Text style={{
                        color:         userRole === 'owner'  ? COLORS.warning
                                     : userRole === 'editor' ? COLORS.success
                                     : COLORS.textMuted,
                        fontSize:      FONTS.sizes.sm,
                        fontWeight:    '700',
                        textTransform: 'capitalize',
                      }}>
                        {userRole}
                      </Text>
                    </View>

                    {/* Metadata list */}
                    <View style={{ ...detailCard(COLORS.border, isLight), gap: 8 }}>
                      {[
                        {
                          icon:      'time-outline',
                          iconColor: COLORS.textMuted,
                          label:     'Created',
                          value:     formatDate(report.createdAt),
                        },
                        ...(report.completedAt
                          ? [{
                              icon:      'checkmark-circle-outline',
                              iconColor: COLORS.success,
                              label:     'Completed',
                              value:     formatDate(report.completedAt),
                            }]
                          : []),
                        {
                          icon:      'chatbubbles-outline',
                          iconColor: COLORS.primary,
                          label:     'Comments',
                          value:     String(totalComments),
                        },
                        {
                          icon:      'people-outline',
                          iconColor: COLORS.info,
                          label:     'Online Now',
                          value:     String(othersOnline.length),
                        },
                      ].map(row => (
                        <View
                          key={row.label}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name={row.icon as any} size={13} color={row.iconColor} />
                            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                              {row.label}
                            </Text>
                          </View>
                          <Text style={{
                            color:      COLORS.textSecondary,
                            fontSize:   FONTS.sizes.xs,
                            fontWeight: '700',
                          }}>
                            {row.value}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* 3-up status indicators */}
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {[
                        {
                          icon:   report.status === 'completed'
                            ? 'checkmark-circle'
                            : 'ellipse-outline',
                          color:  report.status === 'completed' ? COLORS.success : COLORS.textMuted,
                          border: report.status === 'completed' ? `${COLORS.success}33` : COLORS.border,
                          label:  'Status',
                          value:  report.status,
                        },
                        {
                          icon:   isEditor ? 'create' : 'eye-outline',
                          color:  isEditor ? COLORS.success : COLORS.textMuted,
                          border: isEditor ? `${COLORS.success}33` : COLORS.border,
                          label:  'Access',
                          value:  isEditor ? 'Edit' : 'View',
                        },
                        {
                          icon:   hasPendingRequest ? 'time-outline' : 'people-outline',
                          color:  hasPendingRequest ? COLORS.warning : COLORS.info,
                          border: hasPendingRequest ? `${COLORS.warning}33` : COLORS.border,
                          label:  'Request',
                          value:  hasPendingRequest ? 'Pending' : 'None',
                        },
                      ].map(item => (
                        <View
                          key={item.label}
                          style={{
                            ...detailCard(item.border, isLight),
                            flex:       1,
                            alignItems: 'center' as const,
                            gap:        3,
                          }}
                        >
                          <Ionicons name={item.icon as any} size={16} color={item.color} />
                          <Text style={{
                            color:         COLORS.textMuted,
                            fontSize:      9,
                            fontWeight:    '700',
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                          }}>
                            {item.label}
                          </Text>
                          <Text style={{
                            color:         item.color,
                            fontSize:      FONTS.sizes.xs,
                            fontWeight:    '800',
                            textTransform: 'capitalize',
                          }}>
                            {item.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Custom scrollbar thumb */}
                  {contentH > scrollerH && (
                    <View
                      pointerEvents="none"
                      style={{
                        position:        'absolute',
                        top:             SPACING.sm,
                        bottom:          SPACING.sm,
                        right:           4,
                        width:           4,
                        backgroundColor: COLORS.border,
                        borderRadius:    2,
                        overflow:        'hidden',
                      }}
                    >
                      <RNAnimated.View style={{
                        width:           4,
                        borderRadius:    2,
                        backgroundColor: COLORS.primary,
                        height:          scrollerH > 0
                          ? Math.max(32, (scrollerH / contentH) * scrollerH)
                          : 32,
                        transform: [{
                          translateY: (scrollerH > 0 && contentH > scrollerH)
                            ? scrollY.interpolate({
                                inputRange:  [0, contentH - scrollerH],
                                outputRange: [
                                  0,
                                  scrollerH - Math.max(32, (scrollerH / contentH) * scrollerH),
                                ],
                                extrapolate: 'clamp',
                              })
                            : 0,
                        }],
                      }} />
                    </View>
                  )}
                </View>
              </LinearGradient>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ Viewer access request modal ══ */}
      <EditAccessRequestModal
        mode="viewer"
        visible={showRequestModal}
        workspaceName={report?.title ?? 'Workspace'}
        existingRequest={myRequest}
        isSubmitting={isSubmitting}
        onSubmit={(message) => submitRequest(message)}
        onRetract={retractRequest}
        onClose={() => setShowRequestModal(false)}
      />
    </LinearGradient>
  );
}

// ─── Theme-aware style helpers ────────────────────────────────────────────────

function sectionLabel() {
  return {
    color:         COLORS.textMuted,
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom:  SPACING.md,
  };
}

function detailCard(border: string, isLight: boolean) {
  return {
    backgroundColor: isLight ? '#FFFFFF' : COLORS.backgroundCard,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     border,
  };
}

function detailLabel() {
  return {
    color:         COLORS.textMuted,
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginBottom:  4,
  };
}

// ─── Static styles (geometry only — no hardcoded colors) ─────────────────────

const styles = StyleSheet.create({
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            14,
    padding:        SPACING.xl,
  },
  errorIconWrap: {
    width:          80,
    height:         80,
    borderRadius:   24,
    alignItems:     'center',
    justifyContent: 'center',
  },
  errorBackBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   10,
    marginTop:         4,
  },
  errorBackBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  roleBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    marginHorizontal:  SPACING.md,
    marginBottom:      SPACING.xs,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    borderWidth:       1,
  },
  roleBannerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    flex:          1,
  },
  roleBannerCta: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  roleBannerCtaText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
});