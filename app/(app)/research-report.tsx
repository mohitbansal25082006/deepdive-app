// app/(app)/research-report.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Research Report — Detail Screen
//
// Part 54A — NAVIGATION FIX (Feature 3)
//   The Row-1 back button now navigates to the HISTORY tab
//   (/(app)/(tabs)/history) instead of the Home tab. A report is opened from
//   History (and from notifications), so returning to History — where the
//   report list lives — is the expected behaviour. We use router.replace so the
//   back stack doesn't accumulate report→home→report chains.
//
// Part 50.8 — BOOKMARK SUPPORT ADDED
//   • Loads `is_pinned` into the mapped report.
//   • Bookmark action button writes `is_pinned` to Supabase (optimistic).
//
// ── ANDROID UI FIX (production) ───────────────────────────────────────────────
//   (Issue 4) The embedded AI Research Assistant chat input could sit under the
//     Android nav bar. We pass `bottomInset={insets.bottom}` to
//     <ResearchAssistantChat> so its input row clears the nav/gesture bar, and
//     drag-to-dismiss keyboard is handled inside that component.
//   (Issue 5) The top "Report Details" bottom-sheet modal now pads its scroll
//     content by `insets.bottom` so the last detail card isn't hidden behind the
//     Android nav bar (SDK 54 edge-to-edge draws behind it). The chat overlay's
//     bottom spacer also uses insets.bottom.
// ─────────────────────────────────────────────────────────────────────────────

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
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import * as Haptics          from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams }    from 'expo-router';
import { supabase }                        from '../../src/lib/supabase';
import { ReportSectionCard }               from '../../src/components/research/ReportSection';
import { RichText }                         from '../../src/components/research/RichText';
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
// FIX (issue 2): the Report Details sheet opens to a taller, fixed height so all
// detail cards are reachable. 0.72 left it feeling cut off on taller content;
// 0.85 gives the sheet room while still showing the dimmed backdrop above it.
const SHEET_MAX_H  = SCREEN_H * 0.85;
const SCROLL_MAX_H = SHEET_MAX_H - 90;

const DEPTH_LABELS: Record<string, string> = { quick: 'Quick', deep: 'Deep Dive', expert: 'Expert' };
const DEPTH_COLORS: Record<string, string> = { quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning };

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  try { Haptics.impactAsync(style); } catch {}
};

// ── Action icon button ─────────────────────────────────────────────────────────

interface ActionBtnProps {
  icon: string; onPress: () => void;
  active?: boolean; activeColor?: string; loading?: boolean; badge?: string; disabled?: boolean;
}

function ActionBtn({ icon, onPress, active, activeColor, loading, badge, disabled }: ActionBtnProps) {
  const color = activeColor ?? COLORS.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [{
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: active ? `${color}22` : 'rgba(255,255,255,0.05)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: active ? `${color}55` : COLORS.border,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        position: 'relative',
      }]}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon as any} size={17} color={active ? color : COLORS.textSecondary} />}
      {badge && !loading && (
        <View style={{
          position: 'absolute', top: -5, right: -5,
          backgroundColor: color, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1,
          minWidth: 16, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.background,
        }}>
          <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '900' }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Reusable promo card ─────────────────────────────────────────────────────────

interface PromoCardProps {
  icon: string;
  iconGradient: readonly [string, string];
  title: string;
  subtitle: string;
  badge?: { text: string; color: string; icon?: string };
  accentBorder: string;
  chevronColor: string;
  onPress: () => void;
  delay?: number;
}

function PromoCard({ icon, iconGradient, title, subtitle, badge, accentBorder, chevronColor, onPress, delay = 0 }: PromoCardProps) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)} style={{ marginBottom: SPACING.md }}>
      <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
        <View style={{ borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 1, borderColor: accentBorder }}>
          <LinearGradient colors={['#1A1A38', '#11112A']} style={{ padding: SPACING.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
              <LinearGradient colors={iconGradient} style={{ width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium }}>
                <Ionicons name={icon as any} size={23} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '900' }}>{title}</Text>
                  {badge && (
                    <View style={{
                      backgroundColor: `${badge.color}22`, borderRadius: RADIUS.full,
                      paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${badge.color}44`,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                    }}>
                      {badge.icon && <Ionicons name={badge.icon as any} size={9} color={badge.color} />}
                      <Text style={{ color: badge.color, fontSize: 9, fontWeight: '800' }}>{badge.text}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17 }}>{subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={chevronColor} />
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Animated segmented tabs ─────────────────────────────────────────────────────

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

// ── Public Share Modal (redesigned · same props/logic) ──────────────────────────

interface PublicShareModalProps {
  visible: boolean;
  shareUrl: string | null;
  shareId: string | null;
  isActive: boolean;
  isLoading: boolean;
  isToggling: boolean;
  onClose: () => void;
  onCopy: () => void;
  onOpen: () => void;
  onShare: () => void;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
}

function PublicShareModal({
  visible, shareUrl, shareId, isActive, isLoading, isToggling,
  onClose, onCopy, onOpen, onShare, onPublish, onUnpublish,
}: PublicShareModalProps) {
  const insets = useSafeAreaInsets();

  const handleToggle = async (newValue: boolean) => {
    if (newValue) {
      await onPublish();
    } else {
      Alert.alert(
        'Unpublish Report?',
        'The public URL will return 404 until you re-publish. Your share link will be preserved so the same URL works again when you re-enable it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unpublish', style: 'destructive', onPress: onUnpublish },
        ],
      );
    }
  };

  const hasLink = !!shareId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={{ borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', borderTopWidth: 1, borderColor: `${isActive ? COLORS.success : COLORS.primary}40` }}>
            <LinearGradient colors={['#1A1A38', '#0A0A1A']} style={{ paddingBottom: insets.bottom + SPACING.lg }}>
              <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <LinearGradient colors={isActive ? [COLORS.success, `${COLORS.success}CC`] : ['#6C63FF', '#8B5CF6']} style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={isActive ? 'globe' : 'globe-outline'} size={19} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Public Report Link</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {isActive ? '● Live — anyone with the link can view' : '○ Unpublished — link returns 404'}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={closeBtn}>
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: SPACING.lg }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: isActive ? `${COLORS.success}12` : 'rgba(255,255,255,0.04)',
                  borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
                  borderWidth: 1, borderColor: isActive ? `${COLORS.success}33` : COLORS.border,
                }}>
                  <View style={{ flex: 1, marginRight: SPACING.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isActive ? COLORS.success : COLORS.textMuted }} />
                      <Text style={{ color: isActive ? COLORS.success : COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                        {isActive ? 'Published' : 'Unpublished'}
                      </Text>
                      {isToggling && <ActivityIndicator size="small" color={COLORS.primary} />}
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                      {isActive ? 'Visitors can view this report · toggle off to hide it' : 'Report is hidden · toggle on to make it public again'}
                    </Text>
                  </View>
                  <Switch
                    value={isActive} onValueChange={handleToggle} disabled={isToggling || isLoading}
                    trackColor={{ false: COLORS.backgroundCard, true: `${COLORS.success}60` }}
                    thumbColor={isActive ? COLORS.success : COLORS.textMuted}
                    ios_backgroundColor={COLORS.backgroundCard}
                  />
                </View>

                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
                  borderWidth: 1, borderColor: shareUrl && isActive ? `${COLORS.primary}33` : COLORS.border, minHeight: 56, justifyContent: 'center',
                }}>
                  {isLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Generating share link…</Text>
                    </View>
                  ) : shareUrl && isActive ? (
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} numberOfLines={2} selectable>{shareUrl}</Text>
                  ) : shareUrl && !isActive ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="eye-off-outline" size={16} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Link is unpublished · toggle to re-enable</Text>
                    </View>
                  ) : (
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Toggle the switch above to generate your public link</Text>
                  )}
                </View>

                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                  backgroundColor: `${COLORS.info}12`, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.lg,
                  borderWidth: 1, borderColor: `${COLORS.info}22`,
                }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.info} style={{ marginTop: 1 }} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                    Visitors get{' '}<Text style={{ color: COLORS.textPrimary, fontWeight: '800' }}>3 free AI questions</Text>{' '}about this report, then they&apos;re prompted to download DeepDive AI.
                  </Text>
                </View>

                {isActive && (
                  <View style={{ gap: SPACING.sm }}>
                    <Pressable onPress={onCopy} style={({ pressed }) => [primaryBtn(shareUrl ? COLORS.primary : COLORS.backgroundElevated), { opacity: pressed ? 0.85 : 1, borderWidth: shareUrl ? 0 : 1, borderColor: COLORS.border }]}>
                      <Ionicons name="copy-outline" size={18} color={shareUrl ? '#FFF' : COLORS.textMuted} />
                      <Text style={{ color: shareUrl ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Copy Link</Text>
                    </Pressable>
                    <Pressable onPress={onShare} style={({ pressed }) => [secondaryBtn, { opacity: pressed ? 0.85 : 1 }]}>
                      <Ionicons name="share-social-outline" size={18} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Share via…</Text>
                    </Pressable>
                    {shareUrl && (
                      <Pressable onPress={onOpen} style={({ pressed }) => [secondaryBtn, { opacity: pressed ? 0.85 : 1 }]}>
                        <Ionicons name="open-outline" size={18} color={COLORS.textSecondary} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Preview in Browser</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {!isActive && hasLink && (
                  <Pressable onPress={() => handleToggle(true)} disabled={isToggling} style={({ pressed }) => [primaryBtn(COLORS.primary), { opacity: pressed || isToggling ? 0.7 : 1 }]}>
                    {isToggling ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="globe-outline" size={18} color="#FFF" />}
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Re-publish Report</Text>
                  </Pressable>
                )}

                {!hasLink && !isLoading && (
                  <Pressable onPress={() => handleToggle(true)} style={({ pressed }) => [primaryBtn(COLORS.primary), { opacity: pressed ? 0.85 : 1 }]}>
                    <Ionicons name="globe-outline" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Generate &amp; Publish Link</Text>
                  </Pressable>
                )}
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const closeBtn = {
  width: 32, height: 32, borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' as const, justifyContent: 'center' as const,
  borderWidth: 1, borderColor: COLORS.border,
};
const secondaryBtn = {
  flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
  gap: 8, paddingVertical: 14, borderRadius: RADIUS.full,
  backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.border,
};
function primaryBtn(bg: string) {
  return {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: bg,
  };
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

  // Part 50.8: bookmark state for this report
  const [isBookmarked,      setIsBookmarked]      = useState(false);
  const [bookmarking,       setBookmarking]       = useState(false);

  const scrollY   = useRef(new RNAnimated.Value(0)).current;
  const [contentH,  setContentH]  = useState(0);
  const [scrollerH, setScrollerH] = useState(0);

  const assistant   = useResearchAssistant(report);
  const publicShare = usePublicShare(report?.id ?? null);

  useEffect(() => { if (reportId) loadReport(); }, [reportId]);

  // ── Part 54A (Feature 3): back button → History tab ──────────────────────
  // A report is reached from History (or a notification), so "back" returns to
  // the History tab where the report list lives — not Home. router.replace keeps
  // the back stack from accumulating report→home→report chains.
  const handleBackToHistory = () => {
    router.replace('/(app)/(tabs)/history' as any);
  };

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
        setIsBookmarked(enriched.isPinned ?? false);
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
      setIsBookmarked(mapped.isPinned ?? false);
      setIsFromCache(false);
      await cacheReport(mapped as unknown as { id: string; title: string; [key: string]: unknown });
      await supabase.from('research_reports').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', reportId);
    } catch (err) {
      console.error('[ResearchReport] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Part 50.8: bookmark toggle — writes the same is_pinned field as History
  const handleToggleBookmark = async () => {
    if (!report || bookmarking) return;
    const next = !isBookmarked;
    setIsBookmarked(next);
    setBookmarking(true);
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase
        .from('research_reports')
        .update({ is_pinned: next })
        .eq('id', report.id);
      if (error) throw error;
      setReport(prev => (prev ? { ...prev, isPinned: next } : prev));
    } catch (err) {
      console.error('[ResearchReport] bookmark error:', err);
      setIsBookmarked(!next);
      Alert.alert('Error', 'Could not update bookmark.');
    } finally {
      setBookmarking(false);
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

  const handlePublicShareCopy   = async () => { await publicShare.copyUrl(); setShowPublicShare(false); };
  const handlePublicShareOpen   = async () => { const url = publicShare.shareUrl; if (url && await Linking.canOpenURL(url)) await Linking.openURL(url); };
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

  const hasVisuals       = (report?.infographicData?.charts.length ?? 0) > 0 || (report?.infographicData?.stats.length ?? 0) > 0 || (report?.sourceImages?.length ?? 0) > 0 || !!report?.knowledgeGraph;
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

  const statTiles = [
    { label: 'Sources',     value: String(report.sourcesCount),     icon: 'globe-outline',            color: COLORS.info },
    { label: 'Citations',   value: String(report.citations.length), icon: 'link-outline',             color: COLORS.primary },
    { label: 'Reliability', value: `${report.reliabilityScore}/10`, icon: 'shield-checkmark-outline', color: reliabilityColor },
    ...(avgSourceQuality !== null ? [{ label: 'Src Quality', value: `${avgSourceQuality}/10`, icon: 'star-outline', color: getScoreColor(avgSourceQuality) }] : []),
  ];

  return (
    <LinearGradient colors={[COLORS.background, '#0B0B1E', COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ══ FIXED HERO HEADER ══ */}
        <View style={{ zIndex: 10 }}>
          <LinearGradient colors={['#16162F', '#0E0E22']} style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            {/* Row 1 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: 6, gap: SPACING.sm }}>
              <Pressable
                onPress={handleBackToHistory}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => [{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
                  flexShrink: 0, opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
              </Pressable>

              <Pressable onPress={() => setShowReportDetails(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }} hitSlop={{ top: 6, bottom: 6 }}>
                {isFromCache && (
                  <View style={{ backgroundColor: `${COLORS.info}22`, borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 }}>
                    <Text style={{ color: COLORS.info, fontSize: 8, fontWeight: '900' }}>OFFLINE</Text>
                  </View>
                )}
                {isAcademicMode && (
                  <View style={{ backgroundColor: `${COLORS.primary}1A`, borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 }}>
                    <Ionicons name="school" size={9} color={COLORS.primary} />
                  </View>
                )}
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', flex: 1, letterSpacing: -0.2 }} numberOfLines={1} ellipsizeMode="tail">
                  {report.title}
                </Text>
                <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="chevron-down" size={13} color={COLORS.textMuted} />
                </View>
              </Pressable>

              {/* Part 50.8: quick bookmark toggle in the top row */}
              <Pressable
                onPress={handleToggleBookmark}
                disabled={bookmarking}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={({ pressed }) => [{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: isBookmarked ? `${COLORS.primary}22` : 'rgba(255,255,255,0.05)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: isBookmarked ? `${COLORS.primary}55` : COLORS.border,
                  flexShrink: 0, opacity: pressed ? 0.7 : 1,
                }]}
              >
                {bookmarking
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={isBookmarked ? COLORS.primary : COLORS.textSecondary} />}
              </Pressable>
            </View>

            {/* Row 2 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5,
                backgroundColor: `${depthColor}1A`, borderRadius: RADIUS.full, borderWidth: 1, borderColor: `${depthColor}40`, flexShrink: 0,
              }}>
                <Ionicons name={report.depth === 'expert' ? 'star' : report.depth === 'deep' ? 'layers' : 'flash'} size={10} color={depthColor} />
                <Text style={{ color: depthColor, fontSize: 10, fontWeight: '800' }}>{DEPTH_LABELS[report.depth]}</Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flexShrink: 0 }}>{formatDate(report.createdAt)}</Text>
              <View style={{ flex: 1 }} />
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', gap: 7, alignItems: 'center', paddingRight: SPACING.xs }}
                style={{ flexShrink: 0, maxWidth: SCREEN_W - 200 }}
              >
                {report.knowledgeGraph && (
                  <ActionBtn icon="git-network-outline" onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })} />
                )}
                <ActionBtn icon={hasAcademicPaper ? 'school' : 'school-outline'} onPress={handleOpenAcademicPaper} active={hasAcademicPaper} />
                <ActionBtn icon={hasPresentation ? 'easel' : 'easel-outline'} onPress={handleGenerateSlides} active={hasPresentation} badge={hasPresentation && report.slideCount ? String(report.slideCount) : undefined} />
                <ActionBtn icon={showChat ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} onPress={() => setShowChat(v => !v)} active={showChat || assistant.isEmbedded} activeColor={assistant.isEmbedded && !showChat ? COLORS.success : COLORS.primary} />
                <ActionBtn icon={publicShare.isActive ? 'globe' : 'globe-outline'} onPress={() => setShowPublicShare(true)} active={publicShare.isActive} activeColor={COLORS.success} loading={publicShare.isLoading} />
                <ActionBtn icon="download-outline" onPress={handleExportPDF} loading={exporting} />
                <ActionBtn icon="share-outline" onPress={() => setShowShareSheet(true)} />
              </ScrollView>
            </View>
          </LinearGradient>
        </View>

        {/* FIX (issue 3 — chat broken on Android): behavior="height" on Android
            shrank the whole container (header, tabs, chat) and double-compensated
            against SDK 54 'pan', breaking the embedded AI chat layout and leaving
            a gap. Android now uses behavior={undefined} so the OS 'pan' handles
            the keyboard; iOS keeps 'padding'. The chat is a flex column
            (message list + input row) that lays out correctly under 'pan'. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
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
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{visualMode ? 'Charts & graphs shown' : 'Text-only view'}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {report.knowledgeGraph && (
                  <Pressable onPress={() => router.push({ pathname: '/(app)/knowledge-graph' as any, params: { reportId: report.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border }}>
                    <Ionicons name="git-network-outline" size={12} color={COLORS.primaryLight} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Graph</Text>
                  </Pressable>
                )}
                <Switch value={visualMode} onValueChange={setVisualMode}
                  trackColor={{ false: COLORS.backgroundElevated, true: `${COLORS.primary}50` }}
                  thumbColor={visualMode ? COLORS.primary : COLORS.textMuted}
                  ios_backgroundColor={COLORS.backgroundElevated} />
              </View>
            </View>
          )}

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

          {!showChat && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: insets.bottom + 80 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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

              {activeTab === 'report' && (
                <>
                  {visualMode && report.infographicData && (
                    <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
                      <InfographicsPanel data={report.infographicData} availableWidth={PANEL_W} />
                    </Animated.View>
                  )}

                  <Animated.View entering={FadeInDown.duration(400).delay(100)}>
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
                    <ReportSectionCard key={section.id ?? i} section={section} citations={report.citations} index={i} />
                  ))}

                  <PromoCard
                    icon={publicShare.isActive ? 'globe' : 'globe-outline'}
                    iconGradient={publicShare.isActive ? [COLORS.success, `${COLORS.success}BB`] : ['#6C63FF', '#4A42CC']}
                    title={publicShare.isActive ? 'Public Link Active' : (publicShare.shareId ? 'Unpublished' : 'Share as Public Page')}
                    subtitle={publicShare.isActive ? 'Anyone with the link can read this · 3 free AI questions for visitors' : (publicShare.shareId ? 'Link is hidden · Tap to re-publish' : 'Generate a public URL · Visitors get 3 free AI questions · Great for sharing')}
                    badge={publicShare.isActive ? { text: 'LIVE', color: COLORS.success } : (publicShare.shareId ? { text: 'UNPUBLISHED', color: COLORS.warning } : undefined)}
                    accentBorder={publicShare.isActive ? `${COLORS.success}50` : `${COLORS.primary}25`}
                    chevronColor={publicShare.isActive ? COLORS.success : COLORS.primary}
                    onPress={() => setShowPublicShare(true)}
                  />

                  <PromoCard
                    icon="school"
                    iconGradient={['#6C63FF', '#4A42CC']}
                    title={hasAcademicPaper ? 'View Academic Paper' : 'Generate Academic Paper'}
                    subtitle={hasAcademicPaper ? 'Abstract · Introduction · Literature Review · Methodology · Findings · Conclusion' : 'Convert this report into a full peer-review–quality academic paper'}
                    badge={hasAcademicPaper ? { text: 'READY', color: COLORS.primary } : undefined}
                    accentBorder={hasAcademicPaper ? `${COLORS.primary}50` : `${COLORS.primary}25`}
                    chevronColor={COLORS.primary}
                    onPress={handleOpenAcademicPaper}
                  />

                  <PromoCard
                    icon="easel"
                    iconGradient={['#6C63FF', '#8B5CF6']}
                    title={hasPresentation ? 'View Presentation' : 'Generate Slides'}
                    subtitle={hasPresentation ? 'Your AI presentation is ready · Export as PPTX, PDF or HTML' : 'Convert this report into a beautiful slide deck with AI'}
                    badge={hasPresentation ? { text: `${report.slideCount} SLIDES`, color: COLORS.accent } : undefined}
                    accentBorder={hasPresentation ? `${COLORS.primary}50` : `${COLORS.primary}25`}
                    chevronColor={COLORS.primary}
                    onPress={handleGenerateSlides}
                  />

                  <PromoCard
                    icon="chatbubble-ellipses"
                    iconGradient={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'AA'] : COLORS.gradientPrimary}
                    title="AI Research Assistant"
                    subtitle="7 modes · RAG search · Follow-up questions"
                    badge={assistant.isEmbedded ? { text: 'RAG READY', color: COLORS.success, icon: 'sparkles' } : undefined}
                    accentBorder={assistant.isEmbedded ? `${COLORS.success}40` : `${COLORS.primary}25`}
                    chevronColor={COLORS.primary}
                    onPress={() => setShowChat(true)}
                  />
                </>
              )}

              {activeTab === 'findings' && (
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
                    <Text style={sectionLabel}>{sortedCitations.length} Sources · Sorted by Trust</Text>
                    <Pressable onPress={() => setShowCitations(true)} style={{ backgroundColor: `${COLORS.primary}1A`, borderRadius: RADIUS.full, paddingHorizontal: 13, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: `${COLORS.primary}40` }}>
                      <Ionicons name="copy-outline" size={14} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Cite</Text>
                    </Pressable>
                  </View>

                  {sortedCitations.map((c, i) => (
                    <Pressable key={c.id ?? i} onPress={() => openURL(c.url)} style={{ borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: c.trustScore?.tier === 1 ? `${COLORS.success}33` : c.trustScore?.tier === 2 ? `${COLORS.primary}2A` : COLORS.border }}>
                      <LinearGradient colors={['#16162F', '#101024']} style={{ padding: SPACING.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: c.trustScore?.tier === 1 ? `${COLORS.success}22` : `${COLORS.primary}22`, alignItems: 'center', justifyContent: 'center', marginRight: 9, flexShrink: 0 }}>
                            <Text style={{ color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary, fontSize: 10, fontWeight: '900' }}>{i + 1}</Text>
                          </View>
                          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1, lineHeight: 20 }}>{c.title}</Text>
                          <Ionicons name="open-outline" size={16} color={COLORS.primary} style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }} />
                        </View>
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>{c.source}{c.date ? ` · ${c.date}` : ''}</Text>
                        {c.trustScore && <View style={{ marginBottom: 6 }}><SourceTrustBadge score={c.trustScore} size="sm" showBias showScore /></View>}
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>{c.snippet}</Text>
                      </LinearGradient>
                    </Pressable>
                  ))}

                  {report.searchQueries.length > 0 && (
                    <View style={{ marginTop: SPACING.lg }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
                        <Text style={sectionLabel}>{report.searchQueries.length} Search Queries</Text>
                        <View style={{ backgroundColor: `${COLORS.info}1A`, borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.info}2A` }}>
                          <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '800' }}>{report.sourcesCount} UNIQUE SOURCES</Text>
                        </View>
                      </View>
                      {report.searchQueries.map((q, i) => (
                        <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 9, marginBottom: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                          <Ionicons name="search-outline" size={14} color={COLORS.textMuted} style={{ marginRight: 9 }} />
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {!showChat && (
            <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: insets.bottom + SPACING.sm, backgroundColor: 'rgba(8,8,22,0.97)', borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Pressable onPress={() => setShowChat(true)}>
                <LinearGradient
                  colors={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'CC'] : COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: RADIUS.full, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, ...SHADOWS.medium }}
                >
                  <Ionicons name={assistant.isEmbedded ? 'sparkles' : 'chatbubble-ellipses-outline'} size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {assistant.isEmbedded ? 'AI Research Assistant (RAG Ready)' : assistant.isEmbedding ? 'AI Research Assistant (Indexing…)' : 'Open AI Research Assistant'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {showChat && (
            <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Pressable onPress={() => setShowChat(false)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <LinearGradient colors={assistant.isEmbedded ? [COLORS.success, COLORS.success + 'AA'] : COLORS.gradientPrimary} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubble-ellipses" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>AI Research Assistant</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{assistant.isEmbedded ? '✦ RAG-powered · semantic search active' : assistant.isEmbedding ? '⟳ Indexing report…' : '· Keyword fallback mode'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </Pressable>
              {/* FIX (issue 4): pass bottomInset so the chat input clears the
                  Android nav/gesture bar. The chat handles drag-to-dismiss keyboard
                  internally. The previous height:insets.bottom spacer is removed
                  because the inset now lives inside the chat's input row. */}
              <ResearchAssistantChat assistant={assistant} reportTitle={report.title} bottomInset={insets.bottom} />
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CitationModal visible={showCitations} citations={report.citations} onClose={() => setShowCitations(false)} />
      <ShareSheet visible={showShareSheet} report={report} onClose={() => setShowShareSheet(false)} />

      <PublicShareModal
        visible={showPublicShare}
        shareUrl={publicShare.shareUrl}
        shareId={publicShare.shareId}
        isActive={publicShare.isActive}
        isLoading={publicShare.isLoading}
        isToggling={publicShare.isToggling}
        onClose={() => setShowPublicShare(false)}
        onCopy={handlePublicShareCopy}
        onOpen={handlePublicShareOpen}
        onShare={handlePublicShareNative}
        onPublish={publicShare.publishReport}
        onUnpublish={publicShare.unpublishReport}
      />

      <Modal visible={showReportDetails} transparent animationType="slide" onRequestClose={() => setShowReportDetails(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setShowReportDetails(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={{ height: SHEET_MAX_H }}>
            <View style={{ borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', borderTopWidth: 1, borderColor: COLORS.border }}>
              <LinearGradient colors={['#1A1A38', '#0A0A1A']} style={{ paddingTop: SPACING.sm }}>
                <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 }}>
                    <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text" size={16} color="#FFF" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Report Details</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>{report.title}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setShowReportDetails(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={closeBtn}>
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                {/* FIX (issue 2): use a fixed height (not maxHeight) so the sheet
                    always opens to its full size and every detail card is
                    scrollable into view, instead of collapsing to content height
                    and appearing "not fully open". */}
                <View style={{ height: SCROLL_MAX_H }}>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.lg + insets.bottom, gap: SPACING.sm }}
                    scrollEventThrottle={16}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    // FIX: lock to vertical so diagonal/imprecise drags that begin
                    // on a card still scroll, and make sure the ScrollView always
                    // owns the vertical gesture from any child component.
                    directionalLockEnabled
                    alwaysBounceVertical
                    canCancelContentTouches
                    onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                    onContentSizeChange={(_, h) => setContentH(h)}
                    onLayout={e => setScrollerH(e.nativeEvent.layout.height)}>

                    <View style={detailCard(`${COLORS.primary}30`)}>
                      <Text style={detailLabel}>Full Title</Text>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 24 }}>{report.title}</Text>
                    </View>

                    <View style={detailCard(COLORS.border)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="search-outline" size={13} color={COLORS.primary} />
                        <Text style={detailLabel}>Original Query</Text>
                      </View>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, fontStyle: 'italic' }}>&quot;{report.query}&quot;</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {[
                        { icon: 'layers-outline', colors: COLORS.gradientPrimary, label: 'Depth', value: DEPTH_LABELS[report.depth], color: COLORS.textPrimary },
                        { icon: 'shield-checkmark-outline', colors: [reliabilityColor, reliabilityColor + 'AA'] as [string, string], label: 'Reliability', value: `${report.reliabilityScore}/10`, color: reliabilityColor },
                        { icon: 'globe-outline', colors: [COLORS.info, COLORS.info + 'AA'] as [string, string], label: 'Sources', value: String(report.sourcesCount), color: COLORS.info },
                      ].map(item => (
                        <View key={item.label} style={[detailCard(COLORS.border), { flex: 1, alignItems: 'center', gap: 4 }]}>
                          <LinearGradient colors={item.colors} style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={item.icon as any} size={13} color="#FFF" />
                          </LinearGradient>
                          <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.label}</Text>
                          <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '800', textAlign: 'center' }}>{item.value}</Text>
                        </View>
                      ))}
                    </View>

                    {/* FIX: unstable_pressDelay lets a vertical drag that starts ON
                        this card become a scroll instead of being captured
                        immediately by the Pressable. Without it, starting a swipe
                        on this card (or the tiles) felt "dead" — the press handler
                        grabbed the touch before the ScrollView could claim it.
                        (Pressable uses unstable_pressDelay; delayPressIn is a
                        TouchableOpacity-only prop and not valid here.) */}
                    <Pressable onPress={() => { setShowReportDetails(false); setTimeout(() => setShowPublicShare(true), 300); }}
                      unstable_pressDelay={120}
                      style={[detailCard(publicShare.isActive ? `${COLORS.success}33` : COLORS.border), { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <Ionicons name={publicShare.isActive ? 'globe' : 'globe-outline'} size={16} color={publicShare.isActive ? COLORS.success : COLORS.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={detailLabel}>Public Link</Text>
                        <Text style={{ color: publicShare.isActive ? COLORS.success : COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                          {publicShare.isActive ? `Active · /r/${publicShare.shareId}` : (publicShare.shareId ? 'Unpublished · Tap to manage' : 'Not generated · Tap to create')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                    </Pressable>

                    {avgSourceQuality !== null && (
                      <View style={detailCard(`${getScoreColor(avgSourceQuality)}2A`)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Ionicons name="star-outline" size={14} color={getScoreColor(avgSourceQuality)} />
                          <Text style={detailLabel}>Source Quality</Text>
                        </View>
                        <SourceTrustSummaryBanner results={sortedCitations} />
                        <View style={{ marginTop: 8 }}><TrustDistributionBar results={sortedCitations} /></View>
                      </View>
                    )}

                    <View style={[detailCard(COLORS.border), { gap: 8 }]}>
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
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{row.value}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {[
                        { icon: report.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline', color: report.status === 'completed' ? COLORS.success : COLORS.textMuted, border: report.status === 'completed' ? `${COLORS.success}33` : COLORS.border, label: 'Status', value: report.status },
                        { icon: assistant.isEmbedded ? 'sparkles' : assistant.isEmbedding ? 'sync-outline' : 'cloud-outline', color: assistant.isEmbedded ? COLORS.success : assistant.isEmbedding ? COLORS.primary : COLORS.textMuted, border: assistant.isEmbedded ? `${COLORS.success}33` : COLORS.border, label: 'RAG', value: assistant.isEmbedded ? 'Ready' : assistant.isEmbedding ? 'Indexing' : 'Pending' },
                        { icon: 'chatbubbles-outline', color: COLORS.primary, border: COLORS.border, label: 'Chats', value: String(assistant.messages.length) },
                      ].map(item => (
                        <View key={item.label} style={[detailCard(item.border), { flex: 1, alignItems: 'center', gap: 3 }]}>
                          <Ionicons name={item.icon as any} size={16} color={item.color} />
                          <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.label}</Text>
                          <Text style={{ color: item.color, fontSize: FONTS.sizes.xs, fontWeight: '800', textTransform: 'capitalize' }}>{item.value}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Custom progress scrollbar — overlaid absolutely on the right
                      so it no longer narrows the ScrollView's draggable area. */}
                  {contentH > scrollerH && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: SPACING.sm, bottom: SPACING.sm, right: 4, width: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                      <RNAnimated.View style={{ width: 4, borderRadius: 2, backgroundColor: COLORS.primary, height: scrollerH > 0 ? Math.max(32, (scrollerH / contentH) * scrollerH) : 32, transform: [{ translateY: scrollerH > 0 && contentH > scrollerH ? scrollY.interpolate({ inputRange: [0, contentH - scrollerH], outputRange: [0, scrollerH - Math.max(32, (scrollerH / contentH) * scrollerH)], extrapolate: 'clamp' }) : 0 }] }} />
                    </View>
                  )}
                </View>
              </LinearGradient>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
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

const detailLabel = {
  color: COLORS.textMuted,
  fontSize: FONTS.sizes.xs,
  fontWeight: '700' as const,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
};

function detailCard(border: string) {
  return {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: border,
  };
}