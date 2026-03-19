// app/(app)/academic-paper.tsx
// Part 24 — UPDATED: Credit gate (25 credits) added before generating academic paper.
// All Part 14 functionality preserved (share to workspace, PDF/Markdown export, section nav).

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Alert, ActivityIndicator,
}                                from 'react-native';
import { LinearGradient }        from 'expo-linear-gradient';
import { Ionicons }              from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }          from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { supabase }              from '../../src/lib/supabase';
import { useAcademicPaper }      from '../../src/hooks/useAcademicPaper';
import { AcademicPaperView }     from '../../src/components/research/AcademicPaperView';
import { LoadingOverlay }        from '../../src/components/common/LoadingOverlay';
import { GradientButton }        from '../../src/components/common/GradientButton';
import { ShareToWorkspaceModal } from '../../src/components/workspace/ShareToWorkspaceModal';
// ── Part 24: Credit gate ─────────────────────────────────────────────────────
import { CreditBalance }            from '../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal } from '../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }            from '../../src/hooks/useCreditGate';
import { FEATURE_COSTS }            from '../../src/constants/credits';
// ────────────────────────────────────────────────────────────────────────────
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ResearchReport }        from '../../src/types';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AcademicPaperScreen() {
  const { reportId, paperId } = useLocalSearchParams<{
    reportId: string;
    paperId?:  string;
  }>();

  const [report,        setReport]        = useState<ResearchReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [showShareModal,setShowShareModal]= useState(false);

  const ap = useAcademicPaper(report);

  // ── Part 24: Credit gate ──────────────────────────────────────────────────
  const {
    balance,
    guardedConsume,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  } = useCreditGate();
  // ─────────────────────────────────────────────────────────────────────────

  // ── Load parent report ────────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId) return;
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error || !data) {
        Alert.alert('Error', 'Could not load research report.');
        router.back();
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
        agentLogs:         data.agent_logs         ?? [],
        knowledgeGraph:    data.knowledge_graph    ?? undefined,
        infographicData:   data.infographic_data   ?? undefined,
        sourceImages:      data.source_images      ?? [],
        academicPaperId:   data.academic_paper_id  ?? undefined,
        researchMode:      data.research_mode      ?? 'standard',
        createdAt:         data.created_at,
        completedAt:       data.completed_at,
      };

      setReport(mapped);
    } catch (err) {
      console.error('[AcademicPaper] loadReport error:', err);
      Alert.alert('Error', 'Unexpected error loading report.');
      router.back();
    } finally {
      setReportLoading(false);
    }
  };

  // Auto-load if paperId passed directly
  useEffect(() => {
    if (paperId && !ap.paper) {
      ap.loadByReportId(reportId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, reportId]);

  // Auto-load once report is available
  useEffect(() => {
    if (report && !ap.paper && !ap.isLoading && !ap.isGenerating) {
      ap.loadByReportId(report.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  // ── Part 24: Guarded generate ─────────────────────────────────────────────

  const handleGenerateWithCredits = useCallback(async () => {
    const ok = await guardedConsume('academic_paper');
    if (!ok) return;
    ap.generate();
  }, [guardedConsume, ap.generate]);

  const handleRegenerateWithCredits = useCallback(() => {
    Alert.alert(
      'Regenerate Paper',
      'This will overwrite the existing academic paper. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            const ok = await guardedConsume('academic_paper');
            if (!ok) return;
            ap.generate();
          },
        },
      ],
    );
  }, [guardedConsume, ap.generate]);

  // ─────────────────────────────────────────────────────────────────────────

  const isInitialLoading = reportLoading || (ap.isLoading && !ap.paper);

  if (isInitialLoading) {
    return <LoadingOverlay visible message="Loading academic paper…" />;
  }

  // ── Generating state ───────────────────────────────────────────────────────

  if (ap.isGenerating) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={{ width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, ...SHADOWS.large }}
          >
            <Ionicons name="school" size={38} color="#FFF" />
          </LinearGradient>

          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', marginBottom: SPACING.sm, textAlign: 'center' }}>
            Writing Academic Paper
          </Text>

          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl }}>
            {ap.progress || 'AI is crafting a journal-quality paper from your research…'}
          </Text>

          <ActivityIndicator size="large" color={COLORS.primary} />

          <View style={{ marginTop: SPACING.xl, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25`, width: '100%' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
              Sections Being Written
            </Text>
            {['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Findings', 'Conclusion', 'References'].map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <ActivityIndicator size="small" color={COLORS.primary} style={{ opacity: 0.4 + i * 0.08 }} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>{s}</Text>
              </View>
            ))}
          </View>
        </SafeAreaView>

        {/* Part 24: Insufficient Credits Modal (still possible if concurrent generate attempt) */}
        <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
      </LinearGradient>
    );
  }

  // ── Empty state (no paper yet) ────────────────────────────────────────────

  if (!ap.paper) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', flex: 1 }}>
              Academic Paper Mode
            </Text>
            {/* Part 24: Balance pill */}
            <CreditBalance balance={balance} size="sm" />
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{ width: 100, height: 100, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}30`, ...SHADOWS.medium }}
            >
              <Ionicons name="school-outline" size={46} color={COLORS.primary} />
            </LinearGradient>

            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm }}>
              No Academic Paper Yet
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl }}>
              Generate a full peer-review–quality paper from{'\n'}your existing research report.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: SPACING.xl }}>
              {['7 Academic Sections', '3500–5000 Words', 'APA Citations', 'PDF Export', 'Subsections', 'Share to Workspace'].map(f => (
                <View key={f} style={{ backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{f}</Text>
                </View>
              ))}
            </View>

            {ap.error && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={{ backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.error}25`, width: '100%' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Generation Failed</Text>
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>{ap.error}</Text>
              </Animated.View>
            )}

            {/* Part 24: Credit info banner */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg,
              padding: SPACING.md, marginBottom: SPACING.lg, width: '100%',
              borderWidth: 1, borderColor: `${COLORS.primary}18`,
            }}>
              <Ionicons name="flash" size={15} color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                Generating this paper costs{' '}
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{FEATURE_COSTS.academic_paper} credits</Text>
                {'. '}Your balance:{' '}
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{balance} cr</Text>
              </Text>
            </View>

            <GradientButton
              title={isConsuming ? 'Checking credits...' : 'Generate Academic Paper 🎓'}
              onPress={handleGenerateWithCredits}
              loading={ap.isGenerating || isConsuming}
            />

            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.md, lineHeight: 16 }}>
              Uses {FEATURE_COSTS.academic_paper} credits · Based on your existing research · ~2–3 minutes
            </Text>
          </View>
        </SafeAreaView>

        {/* Part 24: Insufficient Credits Modal */}
        <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
      </LinearGradient>
    );
  }

  // ── Paper loaded — full viewer ─────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }} numberOfLines={1}>
              Academic Paper
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {ap.paper.citationStyle.toUpperCase()} · ~{ap.paper.wordCount.toLocaleString()} words · ~{ap.paper.pageEstimate} pages
            </Text>
          </View>

          {/* Share to workspace */}
          <Pressable
            onPress={() => setShowShareModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ height: 38, borderRadius: 12, backgroundColor: `${COLORS.success}15`, alignItems: 'center', justifyContent: 'center', marginLeft: 6, borderWidth: 1, borderColor: `${COLORS.success}35`, paddingHorizontal: 10, flexDirection: 'row', gap: 5 }}
          >
            <Ionicons name="people-outline" size={16} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Share</Text>
          </Pressable>

          {/* Regenerate — also credit-gated */}
          <Pressable
            onPress={handleRegenerateWithCredits}
            disabled={isConsuming}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginLeft: 6, borderWidth: 1, borderColor: COLORS.border, opacity: isConsuming ? 0.5 : 1 }}
          >
            {isConsuming
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="refresh-outline" size={18} color={COLORS.textSecondary} />}
          </Pressable>

          {/* PDF export */}
          <Pressable
            onPress={ap.exportPDF}
            disabled={ap.isExporting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', marginLeft: 6, borderWidth: 1, borderColor: `${COLORS.primary}35`, opacity: ap.isExporting ? 0.6 : 1 }}
          >
            {ap.isExporting
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="download-outline" size={18} color={COLORS.primary} />}
          </Pressable>
        </View>

        {/* Paper viewer */}
        <AcademicPaperView
          paper={ap.paper}
          onExportPDF={ap.exportPDF}
          onExportMarkdown={ap.exportMarkdown}
          isExporting={ap.isExporting}
        />

      </SafeAreaView>

      {/* Share to workspace modal */}
      {ap.paper && (
        <ShareToWorkspaceModal
          visible={showShareModal}
          contentType="academic_paper"
          contentId={ap.paper.id}
          title={ap.paper.title}
          subtitle={`${ap.paper.citationStyle.toUpperCase()} · ~${ap.paper.wordCount.toLocaleString()} words`}
          reportId={report?.id}
          metadata={{
            wordCount:     ap.paper.wordCount,
            pageEstimate:  ap.paper.pageEstimate,
            citationStyle: ap.paper.citationStyle,
            sectionCount:  ap.paper.sections.length,
          }}
          onClose={() => setShowShareModal(false)}
          onShared={(_, workspaceName) => Alert.alert('✅ Shared!', `"${ap.paper!.title}" has been shared to ${workspaceName}.`, [{ text: 'OK' }])}
        />
      )}

      {/* Part 24: Insufficient Credits Modal */}
      <InsufficientCreditsModal
        visible={!!insufficientInfo}
        info={insufficientInfo}
        onClose={clearInsufficient}
      />
    </LinearGradient>
  );
}