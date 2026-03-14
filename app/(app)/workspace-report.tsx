// app/(app)/workspace-report.tsx
// Part 15 — Added "Download Report" button for ALL workspace members
// (not just the owner). Uses exportWorkspaceReportAsPDF() which loads
// the full report via get_workspace_report_full() SECURITY DEFINER RPC,
// then opens the native share sheet so any member can save/send the PDF.
//
// Also added "Copy as Markdown" and "Copy Text" options in a small
// export sheet that appears when the download icon is tapped.
//
// All other Part 12 functionality (comments, AI summary, viewer access
// request) is unchanged.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Modal, Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { BlurView }       from 'expo-blur';
import Animated, { FadeIn, FadeInDown, SlideInUp, SlideOutDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams }    from 'expo-router';

import { useReportComments }   from '../../src/hooks/useReportComments';
import { usePresence }         from '../../src/hooks/usePresence';
import { useCommentReactions } from '../../src/hooks/useCommentReactions';
import { useMyAccessRequest }  from '../../src/hooks/useEditAccessRequest';
import { CommentThread }       from '../../src/components/workspace/CommentThread';
import { CommentInput }        from '../../src/components/workspace/CommentInput';
import { PresenceBar }         from '../../src/components/workspace/PresenceBar';
import { CommentSummaryPanel } from '../../src/components/workspace/CommentSummaryPanel';
import { EditAccessRequestModal } from '../../src/components/workspace/EditAccessRequestModal';
import { supabase }            from '../../src/lib/supabase';
import { generateCommentSummary, CommentSummaryResult } from '../../src/services/commentSummaryService';
import {
  exportWorkspaceReportAsPDF,
  exportWorkspaceReportAsMarkdown,
  copyWorkspaceReportToClipboard,
} from '../../src/services/workspaceReportExportService';
import { ResearchReport, WorkspaceRole } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.65;

// ─── Report loader ─────────────────────────────────────────────────────────────

function mapRow(d: Record<string, unknown>): ResearchReport {
  return {
    id:                d.id as string,
    userId:            d.user_id as string,
    query:             d.query as string,
    depth:             d.depth as ResearchReport['depth'],
    focusAreas:        (d.focus_areas as string[]) ?? [],
    title:             (d.title as string) ?? '',
    executiveSummary:  (d.executive_summary as string) ?? '',
    sections:          (d.sections as ResearchReport['sections']) ?? [],
    keyFindings:       (d.key_findings as string[]) ?? [],
    futurePredictions: (d.future_predictions as string[]) ?? [],
    citations:         (d.citations as ResearchReport['citations']) ?? [],
    statistics:        (d.statistics as ResearchReport['statistics']) ?? [],
    searchQueries:     (d.search_queries as string[]) ?? [],
    sourcesCount:      (d.sources_count as number) ?? 0,
    reliabilityScore:  (d.reliability_score as number) ?? 0,
    status:            d.status as ResearchReport['status'],
    agentLogs:         [],
    createdAt:         d.created_at as string,
    completedAt:       (d.completed_at as string) ?? undefined,
  };
}

async function loadReportForWorkspace(
  reportId: string,
  workspaceId: string,
): Promise<{ report: ResearchReport | null; errorMessage: string | null }> {
  const { data: direct, error: directError } = await supabase
    .from('research_reports').select('*').eq('id', reportId).maybeSingle();
  if (direct) return { report: mapRow(direct as Record<string, unknown>), errorMessage: null };
  if (directError && directError.code !== 'PGRST116')
    console.warn('[workspace-report] SELECT error:', directError.message);

  const { data: rpcRows, error: rpcError } = await supabase
    .rpc('get_workspace_report', { p_report_id: reportId, p_workspace_id: workspaceId });
  if (rpcError) {
    console.error('[workspace-report] RPC error:', rpcError.message);
    return { report: null, errorMessage: 'Could not load report. Please check your connection.' };
  }
  const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!row) return {
    report: null,
    errorMessage: "You don't have access to this report, or it has been removed from the workspace.",
  };
  return { report: mapRow(row as Record<string, unknown>), errorMessage: null };
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
  const [busy,         setBusy]         = useState<string | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedText,   setCopiedText]   = useState(false);

  useEffect(() => {
    if (visible) { setBusy(null); setCopiedMarkdown(false); setCopiedText(false); }
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
    if (!error) { setCopiedMarkdown(true); setTimeout(() => setCopiedMarkdown(false), 2500); }
    else Alert.alert('Error', error);
  };

  const handleCopyText = async () => {
    if (busy) return;
    setBusy('txt');
    const { error } = await copyWorkspaceReportToClipboard(reportId, workspaceId);
    setBusy(null);
    if (!error) { setCopiedText(true); setTimeout(() => setCopiedText(false), 2500); }
    else Alert.alert('Error', error);
  };

  type Option = { id: string; icon: string; label: string; sublabel: string; color: string; onPress: () => void; };
  const options: Option[] = [
    { id: 'pdf', icon: 'document-text-outline',   label: 'Download PDF',          sublabel: 'Full styled research report PDF',  color: COLORS.primary,   onPress: handlePDF },
    { id: 'md',  icon: copiedMarkdown ? 'checkmark-circle-outline' : 'logo-markdown', label: copiedMarkdown ? 'Copied to Clipboard!' : 'Copy as Markdown', sublabel: 'Structured markdown format', color: COLORS.secondary, onPress: handleMarkdown },
    { id: 'txt', icon: copiedText ? 'checkmark-circle-outline' : 'copy-outline',   label: copiedText ? 'Copied!' : 'Copy as Text', sublabel: 'Plain text for notes / email', color: COLORS.accent, onPress: handleCopyText },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.65)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.xl + 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Download Report</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }} numberOfLines={2}>{reportTitle}</Text>
          </View>
          {options.map(opt => (
            <TouchableOpacity key={opt.id} onPress={opt.onPress} activeOpacity={0.78}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${opt.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${opt.color}25` }}>
                {busy === opt.id ? <ActivityIndicator size="small" color={opt.color} /> : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>{opt.label}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{opt.sublabel}</Text>
              </View>
              {!busy && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function WorkspaceReportScreen() {
  const { reportId, workspaceId, userRole: roleParam } =
    useLocalSearchParams<{ reportId: string; workspaceId: string; userRole?: string }>();
  const userRole = (roleParam as WorkspaceRole) ?? 'viewer';
  const insets   = useSafeAreaInsets();

  const [report,          setReport]          = useState<ResearchReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [loadError,       setLoadError]       = useState<string | null>(null);
  const [activeSection,   setActiveSection]   = useState<{ id: string; title: string } | null>(null);
  const [showComments,    setShowComments]    = useState(false);
  const [currentUserId,   setCurrentUserId]   = useState('');

  // Part 15: export sheet
  const [showExportSheet, setShowExportSheet] = useState(false);

  // Part 12 — AI comment summary state
  const [summary,          setSummary]          = useState<CommentSummaryResult | null>(null);
  const [isSummarizing,    setIsSummarizing]    = useState(false);
  const [summaryError,     setSummaryError]     = useState<string | null>(null);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);

  // Part 12 — Viewer access request
  const [showRequestModal, setShowRequestModal] = useState(false);

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

  const {
    comments, sectionCounts, isLoading: commentsLoading, isSending,
    postComment, postReply, toggleResolve, removeComment, removeReply, getCommentsForSection,
  } = useReportComments(reportId ?? null, workspaceId ?? null);

  const { othersOnline }               = usePresence(reportId ?? null, true);
  const commentIds                     = comments.map((c) => c.id);
  const { getReactions, toggle: toggleReaction } = useCommentReactions(commentIds);

  const {
    myRequest, isSubmitting, hasPendingRequest,
    submit: submitRequest, retract: retractRequest,
  } = useMyAccessRequest(workspaceId ?? null, userRole);

  const isEditor      = userRole === 'owner' || userRole === 'editor';
  const isViewer      = userRole === 'viewer';
  const totalComments = comments.length;

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

  const handleSectionTap = (sectionId: string, sectionTitle: string) => {
    if (!isEditor) return;
    setActiveSection({ id: sectionId, title: sectionTitle });
    setShowComments(true);
  };

  const handleHeaderCommentPress = () => {
    setActiveSection(null);
    setShowComments(true);
  };

  const visibleComments = activeSection
    ? getCommentsForSection(activeSection.id)
    : comments;

  if (isLoadingReport) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.centeredText}>Loading report…</Text>
      </LinearGradient>
    );
  }

  if (loadError || !report) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={styles.centered}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="document-lock-outline" size={44} color={COLORS.error} />
        </View>
        <Text style={styles.errorTitle}>Report Unavailable</Text>
        <Text style={styles.errorDesc}>{loadError ?? 'This report could not be loaded.'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorBackBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={16} color="#FFF" />
          <Text style={styles.errorBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={2}>{report.title}</Text>
            <Text style={styles.headerMeta}>
              {report.depth?.toUpperCase()} · {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {report.sourcesCount > 0 ? ` · ${report.sourcesCount} sources` : ''}
            </Text>
          </View>

          {/* Part 15: Download button — available to ALL members */}
          <TouchableOpacity
            onPress={() => setShowExportSheet(true)}
            style={[styles.commentsToggle, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={showComments ? () => setShowComments(false) : handleHeaderCommentPress}
            style={[styles.commentsToggle, showComments && styles.commentsToggleActive]}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={showComments ? COLORS.primary : COLORS.textSecondary} />
            {totalComments > 0 && (
              <View style={styles.commentsBadge}>
                <Text style={styles.commentsBadgeText}>{totalComments}</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Viewer "Request Editor Access" banner ── */}
        {isViewer && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.viewerBanner}>
            {hasPendingRequest ? (
              <View style={styles.viewerBannerLeft}>
                <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                <Text style={styles.viewerBannerTextWarning}>Editor access request pending…</Text>
              </View>
            ) : (
              <View style={styles.viewerBannerLeft}>
                <Ionicons name="eye-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.viewerBannerText}>You're a viewer — read only</Text>
              </View>
            )}
            {!hasPendingRequest && (
              <TouchableOpacity onPress={() => setShowRequestModal(true)} style={styles.viewerBannerCta} activeOpacity={0.85}>
                <Ionicons name="pencil-outline" size={12} color="#FFF" />
                <Text style={styles.viewerBannerCtaText}>Request Access</Text>
              </TouchableOpacity>
            )}
            {hasPendingRequest && (
              <TouchableOpacity onPress={() => setShowRequestModal(true)} style={[styles.viewerBannerCta, { backgroundColor: `${COLORS.warning}30` }]}>
                <Text style={[styles.viewerBannerCtaText, { color: COLORS.warning }]}>View</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ── Presence ── */}
        {othersOnline.length > 0 && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.presenceWrap}>
            <PresenceBar users={othersOnline} />
          </Animated.View>
        )}

        {/* ── Stat strip ── */}
        {report.reliabilityScore > 0 && (
          <Animated.View entering={FadeIn.duration(400).delay(100)} style={styles.statsStrip}>
            <StatPill icon="globe-outline"           value={`${report.sourcesCount}`}        label="sources"    color={COLORS.info} />
            <StatPill icon="link-outline"            value={`${report.citations.length}`}    label="citations"  color={COLORS.primary} />
            <StatPill icon="shield-checkmark-outline" value={`${report.reliabilityScore}/10`} label="reliability" color={report.reliabilityScore >= 7 ? COLORS.success : report.reliabilityScore >= 5 ? COLORS.warning : COLORS.error} />
          </Animated.View>
        )}

        {/* ── Report body ── */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Executive Summary</Text>
            <Text style={styles.summaryText}>{report.executiveSummary}</Text>
          </Animated.View>

          {report.sections.map((section, idx) => {
            const cnt = sectionCounts[section.id] ?? 0;
            return (
              <Animated.View key={section.id ?? idx} entering={FadeInDown.duration(400).delay(idx * 40)} style={styles.section}>
                <TouchableOpacity onPress={() => handleSectionTap(section.id, section.title)} activeOpacity={isEditor ? 0.7 : 1} style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    {(section as any).icon && <Ionicons name={(section as any).icon} size={15} color={COLORS.primary} />}
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </View>
                  <View style={styles.sectionHeaderRight}>
                    {cnt > 0 && (
                      <View style={styles.sectionBadge}>
                        <Ionicons name="chatbubble" size={10} color={COLORS.primary} />
                        <Text style={styles.sectionBadgeText}>{cnt}</Text>
                      </View>
                    )}
                    {isEditor && <Ionicons name="chatbubble-ellipses-outline" size={13} color={COLORS.textMuted} />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.sectionContent}>{section.content}</Text>
                {((section as any).bullets ?? []).length > 0 && (
                  <View style={styles.bullets}>
                    {((section as any).bullets as string[]).map((b: string, bi: number) => (
                      <View key={bi} style={styles.bullet}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Animated.View>
            );
          })}

          {report.keyFindings.length > 0 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.findingsCard}>
              <Text style={styles.findingsLabel}>Key Findings</Text>
              {report.keyFindings.map((f, i) => (
                <View key={i} style={styles.findingRow}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.findingText}>{f}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          {report.futurePredictions.length > 0 && (
            <Animated.View entering={FadeInDown.duration(400)} style={[styles.findingsCard, { borderColor: `${COLORS.warning}30`, marginTop: SPACING.sm }]}>
              <Text style={[styles.findingsLabel, { color: COLORS.warning }]}>Future Predictions</Text>
              {report.futurePredictions.map((p, i) => (
                <View key={i} style={styles.findingRow}>
                  <Ionicons name="telescope-outline" size={14} color={COLORS.warning} />
                  <Text style={styles.findingText}>{p}</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </ScrollView>

        {/* ── FAB ── */}
        {isEditor && !showComments && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.fab, { bottom: insets.bottom + 20 }]}>
            <TouchableOpacity onPress={handleHeaderCommentPress} style={styles.fabBtn} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
              {totalComments > 0 && <Text style={styles.fabCount}>{totalComments}</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}

      </SafeAreaView>

      {/* ── Comments Bottom Sheet ── */}
      <Modal visible={showComments} transparent animationType="none" onRequestClose={() => setShowComments(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowComments(false)} />
        <Animated.View entering={SlideInUp.duration(320)} exiting={SlideOutDown.duration(260)}
          style={[styles.commentsSheet, { height: SHEET_HEIGHT, paddingBottom: insets.bottom }]}>
          <View style={styles.handleWrap}><View style={styles.handle} /></View>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>
                {activeSection ? `Section: ${activeSection.title.length > 28 ? activeSection.title.slice(0, 28) + '…' : activeSection.title}` : 'All Comments'}
              </Text>
              {activeSection && (
                <TouchableOpacity onPress={() => setActiveSection(null)} style={styles.clearBtn}>
                  <Ionicons name="close-circle-outline" size={13} color={COLORS.textMuted} />
                  <Text style={styles.clearBtnText}>Show all comments</Text>
                </TouchableOpacity>
              )}
            </View>
            {totalComments > 0 && (
              <TouchableOpacity onPress={() => { setShowSummaryPanel(v => !v); if (!showSummaryPanel && !summary) handleGenerateSummary(); }}
                style={[styles.summarizeBtn, showSummaryPanel && styles.summarizeBtnActive]} activeOpacity={0.8}>
                {isSummarizing ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="sparkles" size={14} color={showSummaryPanel ? COLORS.primary : COLORS.textSecondary} />}
                <Text style={[styles.summarizeBtnText, showSummaryPanel && { color: COLORS.primary }]}>
                  {showSummaryPanel ? 'Hide Summary' : 'Summarize'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowComments(false)} style={styles.sheetCloseBtn}>
              <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.commentsList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {showSummaryPanel && (
              <CommentSummaryPanel summary={summary} isGenerating={isSummarizing} error={summaryError} totalComments={totalComments} onGenerate={handleGenerateSummary} onClose={() => setShowSummaryPanel(false)} />
            )}
            {commentsLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : visibleComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <Ionicons name="chatbubbles-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.noCommentsTitle}>No comments yet</Text>
                <Text style={styles.noCommentsBody}>
                  {isEditor ? 'Tap any section heading to start a discussion, or write a general comment below.' : 'No comments have been added yet.'}
                </Text>
              </View>
            ) : (
              visibleComments.map((comment) => (
                <CommentThread key={comment.id} comment={comment} currentUserId={currentUserId} userRole={userRole}
                  reactions={getReactions(comment.id)} onToggleReaction={(cid, emoji) => toggleReaction(cid, emoji)}
                  onReply={postReply} onResolve={toggleResolve} onDeleteComment={removeComment} onDeleteReply={removeReply} />
              ))
            )}
          </ScrollView>

          {isEditor && (
            <CommentInput sectionTitle={activeSection?.title} isSending={isSending}
              onSubmit={(text) => postComment(text, activeSection?.id, [])}
              onClearSection={() => setActiveSection(null)} />
          )}
        </Animated.View>
      </Modal>

      {/* ── Part 15: Export Sheet ── */}
      {report && (
        <ExportSheet
          visible={showExportSheet}
          reportId={reportId ?? ''}
          workspaceId={workspaceId ?? ''}
          reportTitle={report.title}
          onClose={() => setShowExportSheet(false)}
        />
      )}

      {/* ── Viewer access request modal ── */}
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

function StatPill({ icon, value, label, color }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; color: string; }) {
  return (
    <View style={[pill.wrap, { backgroundColor: `${color}12` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[pill.value, { color }]}>{value}</Text>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  value: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  label: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
});

const styles = StyleSheet.create({
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: SPACING.xl },
  centeredText:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  errorIconWrap:    { width: 80, height: 80, borderRadius: 24, backgroundColor: `${COLORS.error}15`, alignItems: 'center', justifyContent: 'center' },
  errorTitle:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  errorDesc:        { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  errorBackBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 10, marginTop: 4 },
  errorBackBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  header:               { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 },
  backBtn:              { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  headerTitle:          { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', lineHeight: 19 },
  headerMeta:           { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  commentsToggle:       { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  commentsToggleActive: { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}50` },
  commentsBadge:        { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.primary, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  commentsBadgeText:    { color: '#FFF', fontSize: 9, fontWeight: '800' },

  viewerBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.md, marginBottom: SPACING.xs, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  viewerBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  viewerBannerText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  viewerBannerTextWarning: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  viewerBannerCta: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 5 },
  viewerBannerCtaText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },

  presenceWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  statsStrip:   { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  reportContent: { padding: SPACING.xl, paddingBottom: 100 },
  summaryCard:  { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  summaryLabel: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  summaryText:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },

  section:            { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  sectionTitle:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionBadge:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  sectionBadgeText:   { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  sectionContent:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },
  bullets:            { marginTop: SPACING.sm, gap: 6 },
  bullet:             { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot:          { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 7, flexShrink: 0 },
  bulletText:         { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 },
  findingsCard:       { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.success}30` },
  findingsLabel:      { color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm },
  findingRow:         { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  findingText:        { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 },

  fab:      { position: 'absolute', right: SPACING.xl },
  fabBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 13, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  fabCount: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' },

  sheetBackdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  commentsSheet:   { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 20 },
  handleWrap:      { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:          { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  sheetHeader:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  sheetTitle:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  clearBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  clearBtnText:    { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  summarizeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  summarizeBtnActive: { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}40` },
  summarizeBtnText:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  sheetCloseBtn:   { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  commentsList:    { padding: SPACING.xl, paddingBottom: 20 },
  noCommentsWrap:  { alignItems: 'center', paddingTop: 40, paddingHorizontal: SPACING.xl, gap: 10 },
  noCommentsTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  noCommentsBody:  { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
});