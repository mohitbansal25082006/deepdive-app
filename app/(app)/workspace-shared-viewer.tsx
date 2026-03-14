// app/(app)/workspace-shared-viewer.tsx
// Part 14 — Viewer screen for presentations and academic papers
// shared inside a workspace.
//
// KEY BEHAVIOUR:
//   • Loads content via SECURITY DEFINER RPCs that bypass owner RLS.
//   • NEVER triggers generation — if data exists it shows it, if not
//     it shows a "not available" state (not a generate prompt).
//   • Presentations → renders SlidePreviewPanel (read-only, no generate).
//   • Academic papers → renders AcademicPaperView (read-only).
//   • Both support PDF export and native share.
//   • Shared-by info + workspace context shown in header.
//
// Route params:
//   workspaceId   — UUID of the workspace (required)
//   contentType   — 'presentation' | 'academic_paper' (required)
//   contentId     — UUID of the presentation or paper (required)
//   contentTitle  — display title (passed from card, shown while loading)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  Alert, ScrollView, Share,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { supabase }              from '../../src/lib/supabase';
import { SlidePreviewPanel }     from '../../src/components/research/SlidePreviewPanel';
import { AcademicPaperView }     from '../../src/components/research/AcademicPaperView';
import { LoadingOverlay }        from '../../src/components/common/LoadingOverlay';
import { exportAsSlidePDF, generatePPTX } from '../../src/services/pptxExport';
import { exportAcademicPaperAsPDF }        from '../../src/services/academicPdfExport';
import {
  GeneratedPresentation, AcademicPaper, PresentationTheme,
  AcademicSection, AcademicCitationStyle,
} from '../../src/types';
import { getThemeTokens } from '../../src/services/pptxExport';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapPresentationRow(data: Record<string, unknown>): GeneratedPresentation {
  return {
    id:          data.id          as string,
    reportId:    data.report_id   as string,
    userId:      data.user_id     as string,
    title:       data.title       as string,
    subtitle:    (data.subtitle   as string) ?? '',
    theme:       (data.theme      as PresentationTheme) ?? 'dark',
    themeTokens: getThemeTokens((data.theme as PresentationTheme) ?? 'dark'),
    slides:      (data.slides     as GeneratedPresentation['slides']) ?? [],
    totalSlides: (data.total_slides as number) ?? 0,
    generatedAt: data.generated_at as string,
    exportCount: (data.export_count as number) ?? 0,
  };
}

function mapPaperRow(data: Record<string, unknown>): AcademicPaper {
  return {
    id:            data.id             as string,
    reportId:      data.report_id      as string,
    userId:        data.user_id        as string,
    title:         data.title          as string,
    runningHead:   (data.running_head  as string) ?? '',
    abstract:      (data.abstract      as string) ?? '',
    keywords:      (data.keywords      as string[]) ?? [],
    sections:      (data.sections      as AcademicSection[]) ?? [],
    citations:     (data.citations     as AcademicPaper['citations']) ?? [],
    citationStyle: (data.citation_style as AcademicCitationStyle) ?? 'apa',
    wordCount:     (data.word_count    as number) ?? 0,
    pageEstimate:  (data.page_estimate as number) ?? 0,
    institution:   (data.institution   as string) ?? undefined,
    generatedAt:   data.generated_at   as string,
    exportCount:   (data.export_count  as number) ?? 0,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceSharedViewerScreen() {
  const {
    workspaceId,
    contentType,
    contentId,
    contentTitle,
  } = useLocalSearchParams<{
    workspaceId:  string;
    contentType:  'presentation' | 'academic_paper';
    contentId:    string;
    contentTitle?: string;
  }>();

  const [presentation,  setPresentation]  = useState<GeneratedPresentation | null>(null);
  const [paper,         setPaper]         = useState<AcademicPaper | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isExporting,   setIsExporting]   = useState(false);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [sharerName,    setSharerName]    = useState<string | null>(null);

  const isPresentation = contentType === 'presentation';

  // ── Load shared content via SECURITY DEFINER RPC ──────────────────────────
  // This bypasses the presentations/academic_papers RLS which only allows
  // the owner to read. Any workspace member can call these RPCs.
  const load = useCallback(async () => {
    if (!workspaceId || !contentId || !contentType) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      if (isPresentation) {
        const { data, error } = await supabase.rpc(
          'get_shared_presentation_for_workspace',
          {
            p_workspace_id:    workspaceId,
            p_presentation_id: contentId,
          },
        );

        if (error) throw error;

        // RPC returns SETOF — data is array
        const rows = (data as Record<string, unknown>[]) ?? [];
        if (rows.length === 0) throw new Error('Presentation not found or not shared to this workspace.');

        setPresentation(mapPresentationRow(rows[0]));

      } else {
        const { data, error } = await supabase.rpc(
          'get_shared_academic_paper_for_workspace',
          {
            p_workspace_id: workspaceId,
            p_paper_id:     contentId,
          },
        );

        if (error) throw error;

        const rows = (data as Record<string, unknown>[]) ?? [];
        if (rows.length === 0) throw new Error('Academic paper not found or not shared to this workspace.');

        setPaper(mapPaperRow(rows[0]));
      }

      // Also load sharer name from shared_workspace_content
      const { data: swcData } = await supabase
        .from('shared_workspace_content')
        .select('shared_by, profiles:shared_by(full_name, username)')
        .eq('workspace_id', workspaceId)
        .eq('content_type',  contentType)
        .eq('content_id',    contentId)
        .maybeSingle();

      if (swcData) {
        const profile = (swcData as any).profiles;
        setSharerName(profile?.full_name ?? profile?.username ?? null);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load content';
      console.error('[WorkspaceSharedViewer] load error:', err);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, contentId, contentType, isPresentation]);

  useEffect(() => { load(); }, [load]);

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      if (isPresentation && presentation) {
        await exportAsSlidePDF(presentation);
      } else if (paper) {
        await exportAcademicPaperAsPDF(paper);
      }
    } catch (err) {
      Alert.alert('Export Error', err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPPTX = async () => {
    if (!presentation || isExporting) return;
    setIsExporting(true);
    try {
      await generatePPTX(presentation);
    } catch (err) {
      // Fall back to PDF
      try {
        await exportAsSlidePDF(presentation);
      } catch {
        Alert.alert('Export Error', 'Could not export presentation.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareMarkdown = async () => {
    if (!paper) return;
    try {
      const lines: string[] = [
        `# ${paper.title}`,
        '',
        `**Keywords:** ${paper.keywords.join(', ')}`,
        `**Words:** ~${paper.wordCount.toLocaleString()}  |  **Pages:** ~${paper.pageEstimate}`,
        `**Citation Style:** ${paper.citationStyle.toUpperCase()}`,
        '',
        '---',
        '',
        '## Abstract',
        '',
        paper.abstract,
      ];
      await Share.share({ title: paper.title, message: lines.join('\n') });
    } catch {}
  };

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <LoadingOverlay
        visible
        message={`Loading ${isPresentation ? 'presentation' : 'academic paper'}…`}
      />
    );
  }

  // ─── Error / not available ────────────────────────────────────────────────

  if (loadError || (!presentation && !paper)) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {contentTitle ?? (isPresentation ? 'Presentation' : 'Academic Paper')}
            </Text>
          </View>

          {/* Error body */}
          <View style={styles.errorBody}>
            <View style={styles.errorIcon}>
              <Ionicons
                name={isPresentation ? 'easel-outline' : 'school-outline'}
                size={44}
                color={COLORS.textMuted}
              />
            </View>
            <Text style={styles.errorTitle}>Content Unavailable</Text>
            <Text style={styles.errorDesc}>
              {loadError ?? 'This content could not be loaded. It may have been deleted by the owner.'}
            </Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color="#FFF" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.backLinkBtn}>
              <Text style={styles.backLinkText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── PRESENTATION VIEWER ──────────────────────────────────────────────────

  if (isPresentation && presentation) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>

          {/* Slide preview panel takes the main space */}
          <SlidePreviewPanel
            presentation={presentation}
            onClose={() => router.back()}
          />

          {/* Export bar */}
          <View style={styles.exportBar}>
            {/* Shared-by info */}
            {sharerName && (
              <View style={styles.sharerRow}>
                <Ionicons name="people-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.sharerText}>
                  Shared by {sharerName}
                </Text>
              </View>
            )}

            <View style={styles.exportBtnRow}>
              {/* PPTX */}
              <Pressable
                onPress={handleExportPPTX}
                disabled={isExporting}
                style={{ flex: 1.5, opacity: isExporting ? 0.55 : 1 }}
              >
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.exportPrimaryBtn}
                >
                  {isExporting
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="desktop-outline" size={16} color="#FFF" />}
                  <Text style={styles.exportPrimaryBtnText}>
                    {isExporting ? 'Exporting…' : 'Export PPTX'}
                  </Text>
                </LinearGradient>
              </Pressable>

              {/* PDF */}
              <Pressable
                onPress={handleExportPDF}
                disabled={isExporting}
                style={[styles.exportSecondaryBtn, { flex: 1, opacity: isExporting ? 0.55 : 1 }]}
              >
                <Ionicons name="document-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.exportSecondaryBtnText}>PDF</Text>
              </Pressable>

              {/* Stats */}
              <View style={styles.slideCountBadge}>
                <Ionicons name="layers-outline" size={12} color={COLORS.primary} />
                <Text style={styles.slideCountText}>
                  {presentation.totalSlides} slides
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── ACADEMIC PAPER VIEWER ────────────────────────────────────────────────

  if (paper) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>

          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Academic Paper
              </Text>
              <Text style={styles.headerSub}>
                {paper.citationStyle.toUpperCase()}
                {' · '}~{paper.wordCount.toLocaleString()} words
                {' · '}~{paper.pageEstimate} pages
                {sharerName ? ` · Shared by ${sharerName}` : ''}
              </Text>
            </View>

            {/* Export PDF */}
            <Pressable
              onPress={handleExportPDF}
              disabled={isExporting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconActionBtn, { opacity: isExporting ? 0.6 : 1 }]}
            >
              {isExporting
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="download-outline" size={18} color={COLORS.primary} />}
            </Pressable>

            {/* Share markdown */}
            <Pressable
              onPress={handleShareMarkdown}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconActionBtn, { marginLeft: 6 }]}
            >
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Shared-by banner */}
          {sharerName && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.sharedByBanner}>
              <Ionicons name="people-outline" size={13} color={COLORS.primary} />
              <Text style={styles.sharedByBannerText}>
                Shared to this workspace by {sharerName}
              </Text>
            </Animated.View>
          )}

          {/* Paper viewer — read only, no generate button */}
          <AcademicPaperView
            paper={paper}
            onExportPDF={handleExportPDF}
            onExportMarkdown={handleShareMarkdown}
            isExporting={isExporting}
          />

        </SafeAreaView>
      </LinearGradient>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap:              SPACING.sm,
  },
  backBtn: {
    width:          38,
    height:         38,
    borderRadius:   12,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    COLORS.border,
    flexShrink:     0,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  headerSub: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  iconActionBtn: {
    width:          38,
    height:         38,
    borderRadius:   12,
    backgroundColor: `${COLORS.primary}15`,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    `${COLORS.primary}30`,
    flexShrink:     0,
  },

  sharedByBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   8,
    backgroundColor:  `${COLORS.primary}08`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.primary}15`,
  },
  sharedByBannerText: {
    color:    COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },

  // Export bar (presentations)
  exportBar: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    paddingBottom:     SPACING.md,
    backgroundColor:   COLORS.backgroundCard,
    borderTopWidth:    1,
    borderTopColor:    COLORS.border,
    gap:               SPACING.sm,
  },
  sharerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  sharerText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  exportBtnRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  exportPrimaryBtn: {
    borderRadius:   RADIUS.lg,
    paddingVertical: 12,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    ...SHADOWS.medium,
  },
  exportPrimaryBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '800',
  },
  exportSecondaryBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 12,
    borderRadius:   RADIUS.lg,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:    1,
    borderColor:    COLORS.border,
  },
  exportSecondaryBtnText: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  slideCountBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    backgroundColor:  `${COLORS.primary}12`,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical:  8,
    borderWidth:      1,
    borderColor:      `${COLORS.primary}25`,
  },
  slideCountText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },

  // Error state
  errorBody: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
    gap:            12,
  },
  errorIcon: {
    width:          80,
    height:         80,
    borderRadius:   22,
    backgroundColor: COLORS.backgroundCard,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    COLORS.border,
  },
  errorTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
  },
  errorDesc: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.sm,
    textAlign:  'center',
    lineHeight: 22,
    maxWidth:   300,
  },
  retryBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    backgroundColor: COLORS.primary,
    borderRadius:   RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    marginTop:      4,
  },
  retryText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  backLinkBtn: {
    paddingVertical: 8,
  },
  backLinkText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
});