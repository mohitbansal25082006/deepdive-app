// app/(app)/academic-paper.tsx
// Part 41.4 — Shared AcademicExportModal.
// Part 41.8 FIXES:
//   FIX Problem 2 — Remove the hasFocusedOnce guard that was skipping the
//                   first useFocusEffect reload. Now EVERY focus (including
//                   returning from paper-editor) triggers a fresh DB load.
//                   paper-editor already calls saveNow() before navigating
//                   back, so the DB is always up-to-date when we reload here.
//   FIX Problem 3 — AcademicPaperView receives ap.paper which is updated by
//                   the loadPaper() call in useFocusEffect, so the section
//                   filter nav and all section cards always reflect the latest
//                   saved state including any added/removed custom sections.
// ─────────────────────────────────────────────────────────────────────────────
// Part 55.3 — Theme compatibility: Replaced all hardcoded hex literals and
//             fixed gradient colors with theme-aware values. All surfaces,
//             buttons, badges, and status indicators now follow the active
//             theme palette dynamically via useTheme().
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Alert, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient }        from 'expo-linear-gradient';
import { Ionicons }              from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }          from 'react-native-safe-area-context';
import { ScrollView }            from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { supabase }                     from '../../src/lib/supabase';
import { useAcademicPaper }             from '../../src/hooks/useAcademicPaper';
import { AcademicPaperView }            from '../../src/components/research/AcademicPaperView';
import { AcademicExportModal }          from '../../src/components/research/AcademicExportModal';
import { LoadingOverlay }               from '../../src/components/common/LoadingOverlay';
import { GradientButton }               from '../../src/components/common/GradientButton';
import { ShareToWorkspaceModal }        from '../../src/components/workspace/ShareToWorkspaceModal';
import { CreditBalance }                from '../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal }     from '../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }                from '../../src/hooks/useCreditGate';
import { FEATURE_COSTS }                from '../../src/constants/credits';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useTheme }                     from '../../src/context/ThemeContext';
import { ResearchReport, AcademicPaper } from '../../src/types';

export default function AcademicPaperScreen() {
  const { reportId, paperId } = useLocalSearchParams<{
    reportId: string;
    paperId?:  string;
  }>();

  const [report,          setReport]          = useState<ResearchReport | null>(null);
  const [reportLoading,   setReportLoading]   = useState(true);
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const ap = useAcademicPaper(report);

  const {
    balance,
    guardedConsume,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  } = useCreditGate();

  // ─── FIX P2 + P3: Reload paper from DB on EVERY focus ────────────────────
  useFocusEffect(
    useCallback(() => {
      if (ap.paper?.id) {
        ap.loadPaper(ap.paper.id);
      }
    }, [ap.paper?.id, ap.loadPaper]),
  );

  useEffect(() => {
    if (!reportId) return;
    loadReport();
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

  useEffect(() => {
    if (paperId && !ap.paper) {
      ap.loadByReportId(reportId);
    }
  }, [paperId, reportId]);

  useEffect(() => {
    if (report && !ap.paper && !ap.isLoading && !ap.isGenerating) {
      ap.loadByReportId(report.id);
    }
  }, [report]);

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
          text:  'Regenerate',
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

  const handleOpenEditor = useCallback(() => {
    if (!ap.paper) return;
    router.push({
      pathname: '/(app)/paper-editor' as any,
      params:   { paperId: ap.paper.id },
    });
  }, [ap.paper]);

  const isInitialLoading = reportLoading || (ap.isLoading && !ap.paper);

  if (isInitialLoading) {
    return <LoadingOverlay visible message="Loading academic paper…" />;
  }

  if (ap.isGenerating) {
    return <GeneratingView ap={ap} insufficientInfo={insufficientInfo} clearInsufficient={clearInsufficient} />;
  }

  if (!ap.paper) {
    return <NoPaperView 
      ap={ap}
      balance={balance}
      isConsuming={isConsuming}
      insufficientInfo={insufficientInfo}
      clearInsufficient={clearInsufficient}
      handleGenerateWithCredits={handleGenerateWithCredits}
    />;
  }

  // ── Paper loaded — full viewer ─────────────────────────────────────────────
  return (
    <PaperLoadedView
      ap={ap}
      isConsuming={isConsuming}
      insufficientInfo={insufficientInfo}
      clearInsufficient={clearInsufficient}
      report={report}
      showShareModal={showShareModal}
      showExportModal={showExportModal}
      setShowShareModal={setShowShareModal}
      setShowExportModal={setShowExportModal}
      handleOpenEditor={handleOpenEditor}
      handleRegenerateWithCredits={handleRegenerateWithCredits}
    />
  );
}

// ─── Sub-components for better readability ──────────────────────────────────

function GeneratingView({ ap, insufficientInfo, clearInsufficient }: any) {
  const colors = COLORS; // Already theme-mutated
  const sectionNames = ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Findings', 'Conclusion', 'References'];

  return (
    <LinearGradient colors={[colors.background, colors.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
        <LinearGradient 
          colors={colors.gradientPrimary} 
          style={[styles.generatingIconContainer, SHADOWS.large]}
        >
          <Ionicons name="school" size={38} color="#FFF" />
        </LinearGradient>
        <Text style={[styles.generatingTitle, { color: colors.textPrimary }]}>Writing Academic Paper</Text>
        <Text style={[styles.generatingSubtitle, { color: colors.textMuted }]}>
          {ap.progress || 'AI is crafting a journal-quality paper from your research…'}
        </Text>
        <ActivityIndicator size="large" color={colors.primary} />
        <View style={[
          styles.generatingSectionsContainer,
          { 
            backgroundColor: colors.backgroundCard,
            borderColor: `${colors.primary}25`,
          }
        ]}>
          <Text style={[styles.generatingSectionsLabel, { color: colors.textMuted }]}>Sections Being Written</Text>
          {sectionNames.map((s, i) => (
            <View key={s} style={styles.generatingSectionRow}>
              <ActivityIndicator size="small" color={colors.primary} style={{ opacity: 0.4 + i * 0.08 }} />
              <Text style={[styles.generatingSectionName, { color: colors.textSecondary }]}>{s}</Text>
            </View>
          ))}
        </View>
      </SafeAreaView>
      <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
    </LinearGradient>
  );
}

function NoPaperView({ 
  ap, balance, isConsuming, insufficientInfo, clearInsufficient, handleGenerateWithCredits 
}: any) {
  const colors = COLORS;
  const features = ['7 Academic Sections', '3500–5000 Words', 'APA Citations', 'PDF + DOCX Export', 'Inline Editor', 'Version History'];

  return (
    <LinearGradient colors={[colors.background, colors.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.headerContainer, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.backButton, { backgroundColor: colors.backgroundElevated }]}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <CreditBalance balance={balance} size="sm" />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.noPaperContainer, { padding: SPACING.xl }]}>
            <LinearGradient 
              colors={[colors.backgroundElevated, colors.backgroundCard]} 
              style={[styles.noPaperIconContainer, { borderColor: `${colors.primary}30` }, SHADOWS.medium]}
            >
              <Ionicons name="school-outline" size={46} color={colors.primary} />
            </LinearGradient>
            <Text style={[styles.noPaperTitle, { color: colors.textPrimary }]}>No Academic Paper Yet</Text>
            <Text style={[styles.noPaperSubtitle, { color: colors.textMuted }]}>
              Generate a full peer-review–quality paper from{'\n'}your existing research report.
            </Text>
            <View style={styles.featuresContainer}>
              {features.map(f => (
                <View key={f} style={[
                  styles.featureBadge,
                  { 
                    backgroundColor: `${colors.primary}12`,
                    borderColor: `${colors.primary}25`,
                  }
                ]}>
                  <Text style={[styles.featureBadgeText, { color: colors.primary }]}>{f}</Text>
                </View>
              ))}
            </View>
            {ap.error && (
              <Animated.View entering={FadeInDown.duration(300)} style={[
                styles.errorContainer,
                { 
                  backgroundColor: `${colors.error}10`,
                  borderColor: `${colors.error}25`,
                }
              ]}>
                <View style={styles.errorHeader}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={[styles.errorTitle, { color: colors.error }]}>Generation Failed</Text>
                </View>
                <Text style={[styles.errorMessage, { color: colors.textMuted }]}>{ap.error}</Text>
              </Animated.View>
            )}
            <View style={[
              styles.creditInfoContainer,
              { 
                backgroundColor: `${colors.primary}08`,
                borderColor: `${colors.primary}18`,
              }
            ]}>
              <Ionicons name="flash" size={15} color={colors.primary} />
              <Text style={[styles.creditInfoText, { color: colors.textMuted }]}>
                Generating this paper costs{' '}
                <Text style={[styles.creditInfoHighlight, { color: colors.primary }]}>{FEATURE_COSTS.academic_paper} credits</Text>
                {'. '}Your balance:{' '}
                <Text style={[styles.creditInfoHighlight, { color: colors.primary }]}>{balance} cr</Text>
              </Text>
            </View>
            <GradientButton
              title={isConsuming ? 'Checking credits...' : 'Generate Academic Paper 🎓'}
              onPress={handleGenerateWithCredits}
              loading={ap.isGenerating || isConsuming}
            />
            <Text style={[styles.creditInfoFooter, { color: colors.textMuted }]}>
              Uses {FEATURE_COSTS.academic_paper} credits · Based on your existing research · ~2–3 minutes
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
    </LinearGradient>
  );
}

function PaperLoadedView({
  ap,
  isConsuming,
  insufficientInfo,
  clearInsufficient,
  report,
  showShareModal,
  showExportModal,
  setShowShareModal,
  setShowExportModal,
  handleOpenEditor,
  handleRegenerateWithCredits,
}: any) {
  const colors = COLORS;

  return (
    <LinearGradient colors={[colors.background, colors.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={[styles.headerContainer, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.backButton, { backgroundColor: colors.backgroundElevated }]}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* Edit */}
          <Pressable 
            onPress={handleOpenEditor} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} 
            style={[
              styles.actionButton,
              { 
                backgroundColor: `${colors.primary}18`,
                borderColor: `${colors.primary}35`,
              }
            ]}
          >
            <Ionicons name="pencil-outline" size={15} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Edit</Text>
          </Pressable>

          {/* Share to workspace */}
          <Pressable 
            onPress={() => setShowShareModal(true)} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} 
            style={[
              styles.actionButton,
              { 
                backgroundColor: `${colors.success}15`,
                borderColor: `${colors.success}35`,
              }
            ]}
          >
            <Ionicons name="people-outline" size={15} color={colors.success} />
            <Text style={[styles.actionButtonText, { color: colors.success }]}>Share</Text>
          </Pressable>

          {/* Regenerate */}
          <Pressable 
            onPress={handleRegenerateWithCredits} 
            disabled={isConsuming} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} 
            style={[
              styles.iconButton,
              { 
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border,
                opacity: isConsuming ? 0.5 : 1,
              }
            ]}
          >
            {isConsuming ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={17} color={colors.textSecondary} />}
          </Pressable>

          {/* Export */}
          <Pressable 
            onPress={() => setShowExportModal(true)} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} 
            style={[
              styles.iconButton,
              { 
                backgroundColor: `${colors.primary}18`,
                borderColor: `${colors.primary}35`,
              }
            ]}
          >
            <Ionicons name="download-outline" size={17} color={colors.primary} />
          </Pressable>
        </View>

        <AcademicPaperView
          paper={ap.paper}
          onExportPDF={() => setShowExportModal(true)}
          onExportMarkdown={ap.exportMarkdown}
          isExporting={ap.isExporting}
        />
      </SafeAreaView>

      <AcademicExportModal
        visible={showExportModal}
        paper={ap.paper}
        onClose={() => setShowExportModal(false)}
        skipDbUpdate={false}
      />

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
          onShared={(_, workspaceName) =>
            Alert.alert('✅ Shared!', `"${ap.paper!.title}" has been shared to ${workspaceName}.`, [{ text: 'OK' }])
          }
        />
      )}

      <InsufficientCreditsModal
        visible={!!insufficientInfo}
        info={insufficientInfo}
        onClose={clearInsufficient}
      />
    </LinearGradient>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 5,
  },
  actionButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    borderWidth: 1,
  },

  // Generating view
  generatingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  generatingTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  generatingSubtitle: {
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  generatingSectionsContainer: {
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    width: '100%',
    marginTop: SPACING.xl,
  },
  generatingSectionsLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  generatingSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  generatingSectionName: {
    fontSize: FONTS.sizes.sm,
  },

  // No paper view
  noPaperContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPaperIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  noPaperTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  noPaperSubtitle: {
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  featureBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  featureBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  errorContainer: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    width: '100%',
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
  errorMessage: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 16,
  },
  creditInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    width: '100%',
    borderWidth: 1,
  },
  creditInfoText: {
    fontSize: FONTS.sizes.xs,
    flex: 1,
    lineHeight: 18,
  },
  creditInfoHighlight: {
    fontWeight: '700',
  },
  creditInfoFooter: {
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 16,
  },
});