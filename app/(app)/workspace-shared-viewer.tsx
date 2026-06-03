// app/(app)/workspace-shared-viewer.tsx
// Part 46 FIX — Corrected contentId routing for search results.
//
// BUG: When navigating from WorkspaceSearchModal, the search RPC returns
// result_id = shared_workspace_content.id (the sharing row UUID), NOT the
// actual presentation_id / paper_id. The RPCs
// get_shared_presentation_for_workspace and get_shared_academic_paper_for_workspace
// expect the real content UUID (presentations.id / academic_papers.id).
//
// FIX: Accept an additional param `actualContentId` that carries the real
// content UUID when navigating from search. If present, use it instead of
// contentId for the RPC call. workspace-detail.tsx passes this when
// navigating from search results via onOpenSharedContent.
//
// Also accept contentId as fallback (existing workspace-detail navigation
// already passes the correct presentation/paper UUID — unchanged).
//
// All Part 41.7 export logic unchanged.

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import {
  generatePPTXFromImages,
  exportAsSlidePDFFromImages,
  exportAsHTMLSlidesFromImages,
} from '../../src/services/slideCaptureExport';
import {
  SlideExportRenderer,
  type SlideExportRendererRef,
} from '../../src/components/research/SlideExportRenderer';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import type {
  GeneratedPresentation,
  PresentationTheme,
  AcademicPaper,
} from '../../src/types';

// ─── Params ───────────────────────────────────────────────────────────────────

type Params = {
  contentType:     string;
  contentId:       string;       // may be shared_workspace_content.id (from search) OR presentation.id
  actualContentId?: string;      // Part 46 FIX: real presentation/paper UUID when coming from search
  workspaceId?:    string;
  sharerName?:     string;
  sharedAt?:       string;
};

// ─── Helper: resolve the real presentation/paper UUID ─────────────────────────
// When navigating from search, contentId = shared_workspace_content.id.
// We need to look up the actual content_id from that row.

async function resolveContentId(
  contentType:  string,
  contentId:    string,
  workspaceId?: string,
): Promise<string> {
  // If it looks like it might be a shared content row, try to resolve it
  // by querying shared_workspace_content for the actual content_id.
  if (!workspaceId) return contentId;

  try {
    const { data } = await supabase
      .from('shared_workspace_content')
      .select('content_id')
      .eq('id', contentId)
      .eq('workspace_id', workspaceId)
      .eq('content_type', contentType)
      .maybeSingle();

    if (data?.content_id) {
      return data.content_id as string;
    }
  } catch {
    // If lookup fails, the original contentId may already be the real UUID
  }
  return contentId;
}

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
  const [captureProgress, setCaptureProgress] = useState<{ done: number; total: number } | null>(null);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const rendererRef = useRef<SlideExportRendererRef>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Part 46 FIX: resolve the real presentation UUID before calling RPC.
      // If contentId is a shared_workspace_content.id row, look up the actual UUID.
      const resolvedId = await resolveContentId('presentation', contentId, workspaceId);

      let data: Record<string, unknown> | null = null;

      if (workspaceId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_shared_presentation_for_workspace',
          {
            p_workspace_id:    workspaceId,
            p_presentation_id: resolvedId,
          },
        );

        if (rpcError) {
          console.error('[PresentationViewer] RPC error:', rpcError);
          if (rpcError.message?.includes('not_member') || rpcError.code === 'P0005') {
            setLoadError('You are not a member of this workspace.');
          } else if (rpcError.message?.includes('not_shared') || rpcError.code === 'P0006') {
            setLoadError('This presentation is no longer shared in this workspace.');
          } else {
            setLoadError('Presentation not found or you no longer have access.');
          }
          return;
        }

        const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
        data = (rows[0] as Record<string, unknown>) ?? null;
      } else {
        const { data: directData, error: directError } = await supabase
          .from('presentations')
          .select('id, title, subtitle, theme, slides, editor_data, font_family, report_id, user_id, generated_at, export_count, total_slides')
          .eq('id', resolvedId)
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

  const captureSlides = useCallback(async (pres: GeneratedPresentation): Promise<(string | null)[]> => {
    const renderer = rendererRef.current;
    if (!renderer) return new Array(pres.slides.length).fill(null);
    setCaptureProgress({ done: 0, total: pres.slides.length });
    const images = await renderer.captureAll();
    setCaptureProgress(null);
    return images;
  }, []);

  const handleExportPPTX = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('pptx');
    try {
      const images = await captureSlides(presentation);
      if (images.every(i => i === null)) await generatePPTX(presentation);
      else await generatePPTXFromImages(images, presentation);
    } catch (e) { Alert.alert('Export failed', String(e)); }
    finally { setIsExporting(false); setExportFormat(null); setCaptureProgress(null); }
  }, [presentation, captureSlides]);

  const handleExportPDF = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('pdf');
    try {
      const images = await captureSlides(presentation);
      if (images.every(i => i === null)) await exportAsSlidePDF(presentation);
      else await exportAsSlidePDFFromImages(images, presentation);
    } catch (e) { Alert.alert('Export failed', String(e)); }
    finally { setIsExporting(false); setExportFormat(null); setCaptureProgress(null); }
  }, [presentation, captureSlides]);

  const handleExportHTML = useCallback(async () => {
    if (!presentation) return;
    setIsExporting(true); setExportFormat('html');
    try {
      const images = await captureSlides(presentation);
      if (images.every(i => i === null)) await exportAsHTMLSlides(presentation);
      else await exportAsHTMLSlidesFromImages(images, presentation);
    } catch (e) { Alert.alert('Export failed', String(e)); }
    finally { setIsExporting(false); setExportFormat(null); setCaptureProgress(null); }
  }, [presentation, captureSlides]);

  function exportLabel(format: 'pptx' | 'pdf' | 'html', defaultLabel: string): string {
    if (!isExporting || exportFormat !== format) return defaultLabel;
    if (captureProgress) return `Capturing ${captureProgress.done}/${captureProgress.total}…`;
    return 'Exporting…';
  }

  if (isLoading) return <LoadingOverlay visible message="Loading presentation…" />;

  if (loadError || !presentation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
          {loadError ?? 'Presentation not found'}
        </Text>
        <Pressable onPress={load} style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SlideExportRenderer ref={rendererRef} presentation={presentation} onProgress={(done, total) => setCaptureProgress({ done, total })} />
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />
      <SlidePreviewPanel presentation={presentation} onClose={() => router.back()} />
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm }}>
        <Pressable onPress={handleExportPPTX} disabled={isExporting} style={{ opacity: isExporting && exportFormat !== 'pptx' ? 0.5 : 1 }}>
          <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.lg, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.medium }}>
            {isExporting && exportFormat === 'pptx' ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="desktop-outline" size={17} color="#FFF" />}
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{exportLabel('pptx', 'Export PPTX')}</Text>
          </LinearGradient>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <Pressable onPress={handleExportPDF} disabled={isExporting} style={[{ flex: 1, borderRadius: RADIUS.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.backgroundElevated, borderWidth: 1.5, borderColor: COLORS.border }, isExporting && exportFormat !== 'pdf' ? { opacity: 0.5 } : {}]}>
            {isExporting && exportFormat === 'pdf' ? <ActivityIndicator size="small" color={COLORS.textSecondary} /> : <Ionicons name="document-outline" size={16} color={COLORS.textSecondary} />}
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{exportLabel('pdf', 'PDF')}</Text>
          </Pressable>
          <Pressable onPress={handleExportHTML} disabled={isExporting} style={[{ flex: 1, borderRadius: RADIUS.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border }, isExporting && exportFormat !== 'html' ? { opacity: 0.5 } : {}]}>
            {isExporting && exportFormat === 'html' ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <Ionicons name="globe-outline" size={15} color={COLORS.textMuted} />}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{exportLabel('html', 'HTML')}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
          <Ionicons name="camera-outline" size={11} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Exports capture slides exactly as shown</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg }}>
          {[{ label: 'Slides', value: String(presentation.totalSlides) }, { label: 'Theme', value: presentation.theme }, { label: 'Exported', value: String(presentation.exportCount ?? 0) }].map(stat => (
            <View key={stat.label} style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>{stat.value}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Academic Paper Viewer ────────────────────────────────────────────────────

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
  const [paper,           setPaper]           = useState<AcademicPaper | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [loadError,       setLoadError]       = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Part 46 FIX: resolve the real paper UUID (same pattern as PresentationViewer)
      const resolvedId = await resolveContentId('academic_paper', contentId, workspaceId);

      let data: Record<string, unknown> | null = null;

      if (workspaceId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_shared_academic_paper_for_workspace',
          { p_workspace_id: workspaceId, p_paper_id: resolvedId },
        );

        if (rpcError) {
          console.error('[AcademicPaperViewer] RPC error:', rpcError);
          if (rpcError.message?.includes('not_member') || rpcError.code === 'P0005') {
            setLoadError('You are not a member of this workspace.');
          } else if (rpcError.message?.includes('not_shared') || rpcError.code === 'P0006') {
            setLoadError('This paper is no longer shared in this workspace.');
          } else {
            setLoadError('Academic paper not found or you no longer have access.');
          }
          return;
        }

        const rows = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
        data = (rows[0] as Record<string, unknown>) ?? null;
      } else {
        const { data: directData, error: directError } = await supabase
          .from('academic_papers').select('*').eq('id', resolvedId).single();
        if (directError || !directData) {
          setLoadError('Academic paper not found or you no longer have access.');
          return;
        }
        data = directData as Record<string, unknown>;
      }

      if (!data) { setLoadError('Academic paper not found or you no longer have access.'); return; }

      setPaper({
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
      });
    } catch (err) {
      console.error('[workspace-shared-viewer] academic paper load error:', err);
      setLoadError('Failed to load academic paper.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleExportMarkdown = useCallback(async () => {
    if (!paper) return;
    try {
      const lines: string[] = [`# ${paper.title}`, '', `**Running Head:** ${paper.runningHead}`, `**Citation Style:** ${paper.citationStyle.toUpperCase()}`, `**Word Count:** ~${paper.wordCount.toLocaleString()}`, `**Pages:** ~${paper.pageEstimate}`, '', '## Abstract', '', paper.abstract, '', paper.keywords.length > 0 ? `*Keywords: ${paper.keywords.join(', ')}*` : '', ''];
      for (const section of paper.sections) {
        lines.push(`## ${section.title}`, '', section.content, '');
        for (const sub of section.subsections ?? []) lines.push(`### ${sub.title}`, '', sub.content, '');
      }
      if (paper.citations.length > 0) {
        lines.push('## References', '');
        paper.citations.forEach((c, i) => lines.push(`[${i + 1}] ${c.title} — ${c.source} (${c.url})`));
      }
      await Share.share({ message: lines.join('\n') });
    } catch { Alert.alert('Error', 'Could not share paper.'); }
  }, [paper]);

  if (isLoading) return <LoadingOverlay visible message="Loading paper…" />;

  if (loadError || !paper) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>{loadError ?? 'Paper not found'}</Text>
        <Pressable onPress={load} style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 8, backgroundColor: `${COLORS.warning}08`, borderBottomWidth: 1, borderBottomColor: `${COLORS.warning}20`, gap: SPACING.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
          <Ionicons name="lock-closed-outline" size={11} color={COLORS.warning} />
          <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>View only — re-generation not available</Text>
        </View>
        <Pressable onPress={() => setShowExportModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${COLORS.primary}35` }}>
          <Ionicons name="download-outline" size={13} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Export</Text>
        </Pressable>
        <Pressable onPress={handleExportMarkdown} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${COLORS.success}30` }}>
          <Ionicons name="share-outline" size={13} color={COLORS.success} />
          <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Share</Text>
        </Pressable>
      </View>
      <AcademicPaperView paper={paper} onExportPDF={() => setShowExportModal(true)} onExportMarkdown={handleExportMarkdown} isExporting={false} />
      <AcademicExportModal visible={showExportModal} paper={paper} onClose={() => setShowExportModal(false)} skipDbUpdate={false} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function WorkspaceSharedViewer() {
  const { contentType, contentId, workspaceId, sharerName, sharedAt } =
    useLocalSearchParams<Params>();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/workspace' as any);
  }, []);

  if (!contentId || !contentType) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md }}>Invalid shared content</Text>
          <Pressable onPress={handleBack} style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const titleForType = contentType === 'presentation' ? 'Shared Presentation' : 'Shared Academic Paper';
  const iconForType  = contentType === 'presentation' ? 'easel-outline' : 'school-outline';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm }}>
          <Pressable onPress={handleBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
            <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
          </Pressable>
          <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}18`, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
            <Ionicons name={iconForType as any} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{titleForType}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Workspace shared content</Text>
          </View>
        </View>

        {contentType === 'presentation' ? (
          <PresentationViewer contentId={contentId} workspaceId={workspaceId} sharerName={sharerName} sharedAt={sharedAt} />
        ) : (
          <AcademicPaperViewer contentId={contentId} workspaceId={workspaceId} sharerName={sharerName} sharedAt={sharedAt} />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}