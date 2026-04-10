// app/(app)/workspace-shared-viewer.tsx
// Part 41.5 — FIX: Non-owners can now open shared presentations and academic papers.
//
// ROOT CAUSE (Part 14/31 bug):
//   PresentationViewer and AcademicPaperViewer queried the tables directly:
//     supabase.from('presentations').select(...).eq('id', contentId).single()
//     supabase.from('academic_papers').select('*').eq('id', contentId).single()
//   These queries are blocked by RLS for any user who is NOT the row owner,
//   producing "not found" / "you no longer have access" errors for workspace members.
//
// FIX (Part 41.5):
//   Use the existing SECURITY DEFINER RPCs that were created exactly for this purpose:
//     get_shared_presentation_for_workspace(p_workspace_id, p_presentation_id)
//     get_shared_academic_paper_for_workspace(p_workspace_id, p_paper_id)
//   These RPCs verify the caller is a workspace member AND that the content is shared
//   to that workspace, then fetch the row bypassing RLS.
//
//   To pass workspaceId to the viewer, the screen now accepts a `workspaceId` param.
//   All callers (workspace-detail.tsx SharedContentCard "Open" button) must pass it.
//   The param is optional-safe: if absent, falls back to the old direct query so
//   the owner's own navigation continues to work without changes.
//
// Part 41.4 changes (AcademicExportModal) are fully preserved.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  Alert, Share,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { supabase }                     from '../../src/lib/supabase';
import { SlidePreviewPanel }            from '../../src/components/research/SlidePreviewPanel';
import { AcademicPaperView }            from '../../src/components/research/AcademicPaperView';
import { AcademicExportModal }          from '../../src/components/research/AcademicExportModal';
import { LoadingOverlay }               from '../../src/components/common/LoadingOverlay';
import { mergeEditorData }              from '../../src/services/slideEditorService';
import {
  getThemeTokens,
  generatePPTX,
  exportAsSlidePDF,
  exportAsHTMLSlides,
} from '../../src/services/pptxExport';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import type {
  GeneratedPresentation,
  PresentationTheme,
  AcademicPaper,
} from '../../src/types';

// ─── Params ───────────────────────────────────────────────────────────────────

type Params = {
  contentType:  string;
  contentId:    string;
  workspaceId?: string;   // NEW in Part 41.5 — required for non-owner RPC path
  sharerName?:  string;
  sharedAt?:    string;
};

// ─── Attribution Banner ───────────────────────────────────────────────────────

function AttributionBanner({
  sharerName,
  sharedAt,
}: {
  sharerName?: string;
  sharedAt?:  string;
}) {
  const dateStr = sharedAt
    ? new Date(sharedAt).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               SPACING.sm,
      backgroundColor:   `${COLORS.primary}12`,
      borderBottomWidth: 1,
      borderBottomColor: `${COLORS.primary}25`,
      paddingHorizontal: SPACING.lg,
      paddingVertical:   SPACING.sm,
    }}>
      <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
      <Text style={{
        color:      COLORS.primary,
        fontSize:   FONTS.sizes.xs,
        fontWeight: '600',
        flex:       1,
      }}>
        {sharerName
          ? `Shared by ${sharerName}${dateStr ? ` · ${dateStr}` : ''}`
          : dateStr
          ? `Shared on ${dateStr}`
          : 'Shared in workspace'}
        {'  ·  '}
        <Text style={{ color: COLORS.textMuted, fontWeight: '400' }}>View only</Text>
      </Text>
    </View>
  );
}

// ─── Presentation Viewer ──────────────────────────────────────────────────────
// Part 41.5: Uses get_shared_presentation_for_workspace RPC when workspaceId
// is available, so non-owners bypass RLS. Falls back to direct query for owners.

function PresentationViewer({
  contentId,
  workspaceId,
  sharerName,
  sharedAt,
}: {
  contentId:    string;
  workspaceId?: string;
  sharerName?:  string;
  sharedAt?:    string;
}) {
  const [presentation, setPresentation] = useState<GeneratedPresentation | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isExporting,  setIsExporting]  = useState(false);
  const [exportFormat, setExportFormat] = useState<'pptx' | 'pdf' | 'html' | null>(null);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let data: Record<string, unknown> | null = null;

      // ── Part 41.5 FIX: use SECURITY DEFINER RPC for non-owner workspace members ──
      if (workspaceId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_shared_presentation_for_workspace',
          {
            p_workspace_id:    workspaceId,
            p_presentation_id: contentId,
          },
        );

        if (rpcError) {
          console.error('[PresentationViewer] RPC error:', rpcError);
          // Provide a clear, user-friendly message for the two expected error codes
          if (
            rpcError.message?.includes('not_member') ||
            rpcError.message?.includes('P0005')
          ) {
            setLoadError('You are not a member of this workspace.');
          } else if (
            rpcError.message?.includes('not_shared') ||
            rpcError.message?.includes('P0006')
          ) {
            setLoadError('This presentation is no longer shared in this workspace.');
          } else {
            setLoadError('Presentation not found or you no longer have access.');
          }
          return;
        }

        // RPC returns an array (SETOF); take first row
        const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
        data = (rows[0] as Record<string, unknown>) ?? null;
      } else {
        // Owner fallback: direct query (RLS allows owner to read their own row)
        const { data: directData, error: directError } = await supabase
          .from('presentations')
          .select('id, title, subtitle, theme, slides, editor_data, font_family, report_id, user_id, generated_at, export_count, total_slides')
          .eq('id', contentId)
          .single();

        if (directError || !directData) {
          setLoadError('Presentation not found or you no longer have access.');
          return;
        }
        data = directData as Record<string, unknown>;
      }

      if (!data) {
        setLoadError('Presentation not found or you no longer have access.');
        return;
      }

      const theme: PresentationTheme = (data.theme as PresentationTheme) ?? 'dark';
      const rawSlides:     unknown[] = Array.isArray(data.slides)      ? data.slides      : [];
      const editorDataArr: unknown[] = Array.isArray(data.editor_data) ? data.editor_data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedSlides             = mergeEditorData(rawSlides as any[], editorDataArr as any[]);

      const pres: GeneratedPresentation & { fontFamily?: string } = {
        id:          data.id          as string,
        reportId:    data.report_id   as string,
        userId:      data.user_id     as string,
        title:       data.title       as string,
        subtitle:    (data.subtitle   as string) ?? '',
        theme,
        themeTokens: getThemeTokens(theme),
        slides:      mergedSlides,
        totalSlides: mergedSlides.length,
        generatedAt: data.generated_at as string,
        exportCount: (data.export_count as number) ?? 0,
        fontFamily:  (data.font_family  as string) ?? 'system',
      };

      setPresentation(pres);
    } catch (err) {
      console.error('[workspace-shared-viewer] presentation load error:', err);
      setLoadError('Failed to load presentation.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleExportPPTX = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('pptx');
    try { await generatePPTX(presentation); }
    catch (e) { Alert.alert('Export failed', String(e)); }
    finally   { setIsExporting(false); setExportFormat(null); }
  }, [presentation]);

  const handleExportPDF = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('pdf');
    try { await exportAsSlidePDF(presentation); }
    catch (e) { Alert.alert('Export failed', String(e)); }
    finally   { setIsExporting(false); setExportFormat(null); }
  }, [presentation]);

  const handleExportHTML = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('html');
    try { await exportAsHTMLSlides(presentation); }
    catch (e) { Alert.alert('Export failed', String(e)); }
    finally   { setIsExporting(false); setExportFormat(null); }
  }, [presentation]);

  if (isLoading) return <LoadingOverlay visible message="Loading presentation…" />;

  if (loadError || !presentation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
          fontWeight: '700', marginTop: SPACING.md, textAlign: 'center',
        }}>
          {loadError ?? 'Presentation not found'}
        </Text>
        <Pressable
          onPress={load}
          style={{
            marginTop: SPACING.lg, backgroundColor: COLORS.primary,
            borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />

      <SlidePreviewPanel
        presentation={presentation}
        onClose={() => router.back()}
      />

      {/* Export bar */}
      <View style={{
        paddingHorizontal: SPACING.lg,
        paddingTop:        SPACING.sm,
        paddingBottom:     SPACING.md,
        backgroundColor:   COLORS.backgroundCard,
        borderTopWidth:    1,
        borderTopColor:    COLORS.border,
        gap:               SPACING.sm,
      }}>
        <Pressable
          onPress={handleExportPPTX}
          disabled={isExporting}
          style={{ opacity: isExporting && exportFormat !== 'pptx' ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={['#6C63FF', '#8B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{
              borderRadius: RADIUS.lg, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', gap: 8, ...SHADOWS.medium,
            }}
          >
            {isExporting && exportFormat === 'pptx'
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="desktop-outline" size={17} color="#FFF" />}
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              {isExporting && exportFormat === 'pptx' ? 'Exporting…' : 'Export PPTX'}
            </Text>
          </LinearGradient>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <Pressable
            onPress={handleExportPDF}
            disabled={isExporting}
            style={[{
              flex: 1, borderRadius: RADIUS.lg, paddingVertical: 10,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 7, backgroundColor: COLORS.backgroundElevated,
              borderWidth: 1.5, borderColor: COLORS.border,
            }, isExporting && exportFormat !== 'pdf' ? { opacity: 0.5 } : {}]}
          >
            {isExporting && exportFormat === 'pdf'
              ? <ActivityIndicator size="small" color={COLORS.textSecondary} />
              : <Ionicons name="document-outline" size={16} color={COLORS.textSecondary} />}
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>PDF</Text>
          </Pressable>

          <Pressable
            onPress={handleExportHTML}
            disabled={isExporting}
            style={[{
              flex: 1, borderRadius: RADIUS.lg, paddingVertical: 10,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 7, backgroundColor: COLORS.backgroundElevated,
              borderWidth: 1, borderColor: COLORS.border,
            }, isExporting && exportFormat !== 'html' ? { opacity: 0.5 } : {}]}
          >
            {isExporting && exportFormat === 'html'
              ? <ActivityIndicator size="small" color={COLORS.textMuted} />
              : <Ionicons name="globe-outline" size={15} color={COLORS.textMuted} />}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>HTML</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg }}>
          {[
            { label: 'Slides',   value: String(presentation.totalSlides) },
            { label: 'Theme',    value: presentation.theme               },
            { label: 'Exported', value: String(presentation.exportCount ?? 0) },
          ].map(stat => (
            <View key={stat.label} style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                {stat.value}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Academic Paper Viewer ────────────────────────────────────────────────────
// Part 41.5: Uses get_shared_academic_paper_for_workspace RPC when workspaceId
// is available, so non-owners bypass RLS. Falls back to direct query for owners.
// Part 41.4: Uses <AcademicExportModal> for full PDF + DOCX export.

function AcademicPaperViewer({
  contentId,
  workspaceId,
  sharerName,
  sharedAt,
}: {
  contentId:    string;
  workspaceId?: string;
  sharerName?:  string;
  sharedAt?:    string;
}) {
  const [paper,            setPaper]            = useState<AcademicPaper | null>(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const [loadError,        setLoadError]        = useState<string | null>(null);
  const [showExportModal,  setShowExportModal]  = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let data: Record<string, unknown> | null = null;

      // ── Part 41.5 FIX: use SECURITY DEFINER RPC for non-owner workspace members ──
      if (workspaceId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_shared_academic_paper_for_workspace',
          {
            p_workspace_id: workspaceId,
            p_paper_id:     contentId,
          },
        );

        if (rpcError) {
          console.error('[AcademicPaperViewer] RPC error:', rpcError);
          if (
            rpcError.message?.includes('not_member') ||
            rpcError.message?.includes('P0005')
          ) {
            setLoadError('You are not a member of this workspace.');
          } else if (
            rpcError.message?.includes('not_shared') ||
            rpcError.message?.includes('P0006')
          ) {
            setLoadError('This paper is no longer shared in this workspace.');
          } else {
            setLoadError('Academic paper not found or you no longer have access.');
          }
          return;
        }

        // RPC returns SETOF (array); take first row
        const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
        data = (rows[0] as Record<string, unknown>) ?? null;
      } else {
        // Owner fallback: direct query (RLS allows owner to read their own row)
        const { data: directData, error: directError } = await supabase
          .from('academic_papers')
          .select('*')
          .eq('id', contentId)
          .single();

        if (directError || !directData) {
          setLoadError('Academic paper not found or you no longer have access.');
          return;
        }
        data = directData as Record<string, unknown>;
      }

      if (!data) {
        setLoadError('Academic paper not found or you no longer have access.');
        return;
      }

      const mapped: AcademicPaper = {
        id:            data.id             as string,
        reportId:      data.report_id      as string,
        userId:        data.user_id        as string,
        title:         data.title          as string,
        runningHead:   (data.running_head  as string) ?? '',
        abstract:      (data.abstract      as string) ?? '',
        keywords:      (data.keywords      as string[]) ?? [],
        sections:      (data.sections      as AcademicPaper['sections']) ?? [],
        citations:     (data.citations     as AcademicPaper['citations']) ?? [],
        citationStyle: (data.citation_style as AcademicPaper['citationStyle']) ?? 'apa',
        wordCount:     (data.word_count    as number) ?? 0,
        pageEstimate:  (data.page_estimate as number) ?? 0,
        institution:   (data.institution   as string) ?? undefined,
        generatedAt:   data.generated_at   as string,
        exportCount:   (data.export_count  as number) ?? 0,
      };

      setPaper(mapped);
    } catch (err) {
      console.error('[workspace-shared-viewer] academic paper load error:', err);
      setLoadError('Failed to load academic paper.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId, workspaceId]);

  useEffect(() => { load(); }, [load]);

  // Markdown share
  const handleExportMarkdown = useCallback(async () => {
    if (!paper) return;
    try {
      const lines: string[] = [
        `# ${paper.title}`,
        '',
        `**Running Head:** ${paper.runningHead}`,
        `**Citation Style:** ${paper.citationStyle.toUpperCase()}`,
        `**Word Count:** ~${paper.wordCount.toLocaleString()}`,
        `**Pages:** ~${paper.pageEstimate}`,
        '',
        '## Abstract',
        '',
        paper.abstract,
        '',
        paper.keywords.length > 0
          ? `*Keywords: ${paper.keywords.join(', ')}*`
          : '',
        '',
      ];

      for (const section of paper.sections) {
        lines.push(`## ${section.title}`, '', section.content, '');
        for (const sub of section.subsections ?? []) {
          lines.push(`### ${sub.title}`, '', sub.content, '');
        }
      }

      if (paper.citations.length > 0) {
        lines.push('## References', '');
        paper.citations.forEach((c, i) => {
          lines.push(`[${i + 1}] ${c.title} — ${c.source} (${c.url})`);
        });
      }

      await Share.share({ message: lines.join('\n') });
    } catch {
      Alert.alert('Error', 'Could not share paper.');
    }
  }, [paper]);

  if (isLoading) return <LoadingOverlay visible message="Loading paper…" />;

  if (loadError || !paper) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
          fontWeight: '700', marginTop: SPACING.md, textAlign: 'center',
        }}>
          {loadError ?? 'Paper not found'}
        </Text>
        <Pressable
          onPress={load}
          style={{
            marginTop: SPACING.lg, backgroundColor: COLORS.primary,
            borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Attribution banner */}
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />

      {/* View-only notice + Export button row */}
      <View style={{
        flexDirection:     'row',
        alignItems:        'center',
        justifyContent:    'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical:   8,
        backgroundColor:   `${COLORS.warning}08`,
        borderBottomWidth: 1,
        borderBottomColor: `${COLORS.warning}20`,
        gap:               SPACING.sm,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
          <Ionicons name="lock-closed-outline" size={11} color={COLORS.warning} />
          <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>
            View only — re-generation not available
          </Text>
        </View>

        {/* Export button — opens full AcademicExportModal */}
        <Pressable
          onPress={() => setShowExportModal(true)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
            backgroundColor:   `${COLORS.primary}18`,
            borderRadius:      RADIUS.lg,
            paddingHorizontal: 10,
            paddingVertical:   6,
            borderWidth:       1,
            borderColor:       `${COLORS.primary}35`,
          }}
        >
          <Ionicons name="download-outline" size={13} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            Export
          </Text>
        </Pressable>

        {/* Share Markdown button */}
        <Pressable
          onPress={handleExportMarkdown}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
            backgroundColor:   `${COLORS.success}15`,
            borderRadius:      RADIUS.lg,
            paddingHorizontal: 10,
            paddingVertical:   6,
            borderWidth:       1,
            borderColor:       `${COLORS.success}30`,
          }}
        >
          <Ionicons name="share-outline" size={13} color={COLORS.success} />
          <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            Share
          </Text>
        </Pressable>
      </View>

      {/* Paper content */}
      <AcademicPaperView
        paper={paper}
        onExportPDF={() => setShowExportModal(true)}
        onExportMarkdown={handleExportMarkdown}
        isExporting={false}
      />

      {/* Full export modal — PDF + DOCX with institution/author/font/spacing */}
      <AcademicExportModal
        visible={showExportModal}
        paper={paper}
        onClose={() => setShowExportModal(false)}
        skipDbUpdate={false}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function WorkspaceSharedViewer() {
  const {
    contentType,
    contentId,
    workspaceId,   // NEW — passed by SharedContentCard "Open" button
    sharerName,
    sharedAt,
  } = useLocalSearchParams<Params>();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/workspace' as any);
  }, []);

  if (!contentId || !contentType) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          edges={['top']}
        >
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{
            color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
            fontWeight: '700', marginTop: SPACING.md,
          }}>
            Invalid shared content
          </Text>
          <Pressable
            onPress={handleBack}
            style={{
              marginTop: SPACING.lg, backgroundColor: COLORS.primary,
              borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const titleForType = contentType === 'presentation'
    ? 'Shared Presentation'
    : 'Shared Academic Paper';
  const iconForType  = contentType === 'presentation'
    ? 'easel-outline'
    : 'school-outline';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{
          flexDirection:     'row',
          alignItems:        'center',
          paddingHorizontal: SPACING.lg,
          paddingVertical:   SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          gap:               SPACING.sm,
        }}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width:           36,
              height:          36,
              borderRadius:    10,
              backgroundColor: COLORS.backgroundElevated,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
          </Pressable>

          <View style={{
            width:           36,
            height:          36,
            borderRadius:    10,
            alignItems:      'center',
            justifyContent:  'center',
            backgroundColor: `${COLORS.primary}18`,
            borderWidth:     1,
            borderColor:     `${COLORS.primary}30`,
          }}>
            <Ionicons name={iconForType as any} size={18} color={COLORS.primary} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '800',
              }}
            >
              {titleForType}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Workspace shared content
            </Text>
          </View>
        </View>

        {/* Content */}
        {contentType === 'presentation' ? (
          <PresentationViewer
            contentId={contentId}
            workspaceId={workspaceId}
            sharerName={sharerName}
            sharedAt={sharedAt}
          />
        ) : (
          <AcademicPaperViewer
            contentId={contentId}
            workspaceId={workspaceId}
            sharerName={sharerName}
            sharedAt={sharedAt}
          />
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}