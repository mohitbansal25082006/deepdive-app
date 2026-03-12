// app/(app)/workspace-report.tsx
// CHANGE: Comments panel is now a bottom drawer (not a right-side split pane).
//         Full report width is always visible. Sheet slides up from bottom.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Modal, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInUp, SlideOutDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useReportComments } from '../../src/hooks/useReportComments';
import { usePresence } from '../../src/hooks/usePresence';
import { CommentThread } from '../../src/components/workspace/CommentThread';
import { CommentInput } from '../../src/components/workspace/CommentInput';
import { PresenceBar } from '../../src/components/workspace/PresenceBar';
import { supabase } from '../../src/lib/supabase';
import { ResearchReport, WorkspaceRole } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.65;

// ─── Report loader ─────────────────────────────────────────────────────────────

function mapRow(d: Record<string, unknown>): ResearchReport {
  return {
    id:               d.id as string,
    userId:           d.user_id as string,
    query:            d.query as string,
    depth:            d.depth as ResearchReport['depth'],
    focusAreas:       (d.focus_areas as string[])       ?? [],
    title:            (d.title as string)               ?? '',
    executiveSummary: (d.executive_summary as string)   ?? '',
    sections:         (d.sections as ResearchReport['sections']) ?? [],
    keyFindings:      (d.key_findings as string[])      ?? [],
    futurePredictions:(d.future_predictions as string[]) ?? [],
    citations:        (d.citations as ResearchReport['citations']) ?? [],
    statistics:       (d.statistics as ResearchReport['statistics']) ?? [],
    searchQueries:    (d.search_queries as string[])    ?? [],
    sourcesCount:     (d.sources_count as number)       ?? 0,
    reliabilityScore: (d.reliability_score as number)   ?? 0,
    status:           d.status as ResearchReport['status'],
    agentLogs:        [],
    createdAt:        d.created_at as string,
    completedAt:      (d.completed_at as string)        ?? undefined,
  };
}

async function loadReportForWorkspace(
  reportId: string, workspaceId: string,
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
  if (!row) return { report: null, errorMessage: "You don't have access to this report, or it has been removed from the workspace." };
  return { report: mapRow(row as Record<string, unknown>), errorMessage: null };
}

// ─── Screen ────────────────────────────────────────────────────────────────────

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

  const { othersOnline } = usePresence(reportId ?? null, true);

  const isEditor      = userRole === 'owner' || userRole === 'editor';
  const totalComments = comments.length;

  const handleSectionTap = (sectionId: string, sectionTitle: string) => {
    if (!isEditor) return;
    setActiveSection({ id: sectionId, title: sectionTitle });
    setShowComments(true);
  };

  const visibleComments = activeSection
    ? getCommentsForSection(activeSection.id)
    : comments;

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Main ────────────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
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
          <TouchableOpacity
            onPress={() => setShowComments(v => !v)}
            style={[styles.commentsToggle, showComments && styles.commentsToggleActive]}
          >
            <Ionicons name="chatbubbles-outline" size={18}
              color={showComments ? COLORS.primary : COLORS.textSecondary} />
            {totalComments > 0 && (
              <View style={styles.commentsBadge}>
                <Text style={styles.commentsBadgeText}>{totalComments}</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Presence */}
        {othersOnline.length > 0 && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.presenceWrap}>
            <PresenceBar users={othersOnline} />
          </Animated.View>
        )}

        {/* Stat strip */}
        {report.reliabilityScore > 0 && (
          <Animated.View entering={FadeIn.duration(400).delay(100)} style={styles.statsStrip}>
            <StatPill icon="globe-outline"            value={`${report.sourcesCount}`}       label="sources"     color={COLORS.info} />
            <StatPill icon="link-outline"              value={`${report.citations.length}`}   label="citations"   color={COLORS.primary} />
            <StatPill icon="shield-checkmark-outline"  value={`${report.reliabilityScore}/10`} label="reliability"
              color={report.reliabilityScore >= 7 ? COLORS.success : report.reliabilityScore >= 5 ? COLORS.warning : COLORS.error} />
          </Animated.View>
        )}

        {/* Full-width report */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.reportContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Executive summary */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Executive Summary</Text>
            <Text style={styles.summaryText}>{report.executiveSummary}</Text>
          </Animated.View>

          {/* Sections */}
          {report.sections.map((section, idx) => {
            const cnt = sectionCounts[section.id] ?? 0;
            return (
              <Animated.View
                key={section.id ?? idx}
                entering={FadeInDown.duration(400).delay(idx * 40)}
                style={styles.section}
              >
                <TouchableOpacity
                  onPress={() => handleSectionTap(section.id, section.title)}
                  activeOpacity={isEditor ? 0.7 : 1}
                  style={styles.sectionHeader}
                >
                  <View style={styles.sectionTitleRow}>
                    {(section as any).icon && (
                      <Ionicons name={(section as any).icon} size={15} color={COLORS.primary} />
                    )}
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

          {/* Key findings */}
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

          {/* Future predictions */}
          {report.futurePredictions.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={[styles.findingsCard, { borderColor: `${COLORS.warning}30`, marginTop: SPACING.sm }]}
            >
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

        {/* FAB — only when sheet is closed */}
        {isEditor && !showComments && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.fab, { bottom: insets.bottom + 20 }]}>
            <TouchableOpacity onPress={() => setShowComments(true)} style={styles.fabBtn} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
              {totalComments > 0 && <Text style={styles.fabCount}>{totalComments}</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}

      </SafeAreaView>

      {/* ── Bottom sheet via Modal ── */}
      <Modal
        visible={showComments}
        transparent
        animationType="none"
        onRequestClose={() => setShowComments(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setShowComments(false)}
        />

        {/* FIX: SlideInDown → SlideInUp so the sheet rises from the bottom edge.
               Removed springify/damping to prevent the bouncing overshoot. */}
        <Animated.View
          entering={SlideInUp.duration(320)}
          exiting={SlideOutDown.duration(260)}
          style={[styles.commentsSheet, { height: SHEET_HEIGHT, paddingBottom: insets.bottom }]}
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>
                {activeSection
                  ? `Section: ${activeSection.title.length > 30 ? activeSection.title.slice(0, 30) + '…' : activeSection.title}`
                  : 'All Comments'}
              </Text>
              {activeSection && (
                <TouchableOpacity onPress={() => setActiveSection(null)} style={styles.clearBtn}>
                  <Ionicons name="close-circle-outline" size={13} color={COLORS.textMuted} />
                  <Text style={styles.clearBtnText}>Show all comments</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => setShowComments(false)} style={styles.sheetCloseBtn}>
              <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Comment list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.commentsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {commentsLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : visibleComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <Ionicons name="chatbubbles-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.noCommentsTitle}>No comments yet</Text>
                <Text style={styles.noCommentsBody}>
                  {isEditor
                    ? 'Tap any section heading in the report to start a discussion on that section, or write a general comment below.'
                    : 'No comments have been added to this report yet.'}
                </Text>
              </View>
            ) : (
              visibleComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  userRole={userRole}
                  onReply={postReply}
                  onResolve={toggleResolve}
                  onDeleteComment={removeComment}
                  onDeleteReply={removeReply}
                />
              ))
            )}
          </ScrollView>

          {/* Composer */}
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
    </LinearGradient>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label, color }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; color: string }) {
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  presenceWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  statsStrip:   { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },

  reportContent: { padding: SPACING.xl, paddingBottom: 100 },
  summaryCard:   { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  summaryLabel:  { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  summaryText:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },

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

  sheetBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  commentsSheet:  { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 20 },
  handleWrap:     { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:         { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  sheetHeader:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  clearBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  clearBtnText:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  sheetCloseBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0, marginLeft: SPACING.md },
  commentsList:   { padding: SPACING.xl, paddingBottom: 20 },
  noCommentsWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: SPACING.xl, gap: 10 },
  noCommentsTitle:{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  noCommentsBody: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
});