// app/(app)/workspace-shared-viewer.tsx
// Part 31 FIX — Presentation viewer loads the EDITED version (mergeEditorData).
// Part 14 UI FIX — AcademicPaperViewer now uses the exact same <AcademicPaperView>
//   component as academic-paper.tsx, so workspace members see an identical UI.
//
// ROOT CAUSE of broken academic paper UI:
//   The original AcademicPaperViewer built its own bespoke section navigator,
//   ScrollView, abstract box, subsection renderer, and citations list — all
//   inline inside workspace-shared-viewer.tsx. This custom UI was missing styles,
//   had layout bugs, and looked completely different from the real paper viewer.
//
// FIX:
//   AcademicPaperViewer now:
//     1. Fetches the paper from Supabase (same mapping as useAcademicPaper).
//     2. Maps raw DB row → AcademicPaper typed object.
//     3. Passes it directly to <AcademicPaperView> — the exact same component
//        that academic-paper.tsx uses — so the UI is identical.
//     4. Shows the AttributionBanner above the viewer.
//     5. Keeps the PDF / Markdown export buttons below (using academicPdfExport).
//
// PresentationViewer is unchanged from Part 31.

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
import { LoadingOverlay }               from '../../src/components/common/LoadingOverlay';
import { mergeEditorData }              from '../../src/services/slideEditorService';
import { exportAcademicPaperAsPDF }     from '../../src/services/academicPdfExport';
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
  contentType: string;
  contentId:   string;
  sharerName?: string;
  sharedAt?:   string;
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

// ─── Presentation Viewer (unchanged from Part 31) ─────────────────────────────

function PresentationViewer({
  contentId,
  sharerName,
  sharedAt,
}: {
  contentId:   string;
  sharerName?: string;
  sharedAt?:   string;
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
      const { data, error } = await supabase
        .from('presentations')
        .select('id, title, subtitle, theme, slides, editor_data, font_family, report_id, user_id, generated_at, export_count, total_slides')
        .eq('id', contentId)
        .single();

      if (error || !data) {
        setLoadError('Presentation not found or you no longer have access.');
        return;
      }

      const theme: PresentationTheme = (data.theme as PresentationTheme) ?? 'dark';
      const rawSlides:     any[] = Array.isArray(data.slides)      ? data.slides      : [];
      const editorDataArr: any[] = Array.isArray(data.editor_data) ? data.editor_data : [];
      const mergedSlides         = mergeEditorData(rawSlides, editorDataArr);

      const pres: GeneratedPresentation & { fontFamily?: string } = {
        id:          data.id,
        reportId:    data.report_id,
        userId:      data.user_id,
        title:       data.title,
        subtitle:    data.subtitle ?? '',
        theme,
        themeTokens: getThemeTokens(theme),
        slides:      mergedSlides,
        totalSlides: mergedSlides.length,
        generatedAt: data.generated_at,
        exportCount: data.export_count ?? 0,
        fontFamily:  data.font_family ?? 'system',
      };

      setPresentation(pres);
    } catch (err) {
      console.error('[workspace-shared-viewer] presentation load error:', err);
      setLoadError('Failed to load presentation.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

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
// FIX: Now uses <AcademicPaperView> — the exact same component as
//      academic-paper.tsx — so workspace members see identical UI.

function AcademicPaperViewer({
  contentId,
  sharerName,
  sharedAt,
}: {
  contentId:   string;
  sharerName?: string;
  sharedAt?:   string;
}) {
  const [paper,       setPaper]       = useState<AcademicPaper | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('academic_papers')
        .select('*')
        .eq('id', contentId)
        .single();

      if (error || !data) {
        setLoadError('Academic paper not found or you no longer have access.');
        return;
      }

      // Identical mapping to useAcademicPaper hook
      const mapped: AcademicPaper = {
        id:            data.id,
        reportId:      data.report_id,
        userId:        data.user_id,
        title:         data.title,
        runningHead:   data.running_head   ?? '',
        abstract:      data.abstract       ?? '',
        keywords:      data.keywords       ?? [],
        sections:      data.sections       ?? [],
        citations:     data.citations      ?? [],
        citationStyle: data.citation_style ?? 'apa',
        wordCount:     data.word_count     ?? 0,
        pageEstimate:  data.page_estimate  ?? 0,
        institution:   data.institution    ?? undefined,
        generatedAt:   data.generated_at,
        exportCount:   data.export_count   ?? 0,
      };

      setPaper(mapped);
    } catch (err) {
      console.error('[workspace-shared-viewer] academic paper load error:', err);
      setLoadError('Failed to load academic paper.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

  useEffect(() => { load(); }, [load]);

  // PDF export — same service as academic-paper.tsx
  const handleExportPDF = useCallback(async () => {
    if (!paper) return;
    setIsExporting(true);
    try {
      await exportAcademicPaperAsPDF(paper);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export PDF.');
    } finally {
      setIsExporting(false);
    }
  }, [paper]);

  // Markdown / share — same logic as useAcademicPaper hook
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
      {/* Attribution banner above the paper viewer */}
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />

      {/* View-only notice */}
      <View style={{
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        paddingHorizontal: SPACING.lg,
        paddingVertical:   6,
        backgroundColor:   `${COLORS.warning}0A`,
        borderBottomWidth: 1,
        borderBottomColor: `${COLORS.warning}20`,
      }}>
        <Ionicons name="lock-closed-outline" size={11} color={COLORS.warning} />
        <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>
          View only — re-generation not available for shared papers
        </Text>
      </View>

      {/* ── Same component as academic-paper.tsx ── */}
      <AcademicPaperView
        paper={paper}
        onExportPDF={handleExportPDF}
        onExportMarkdown={handleExportMarkdown}
        isExporting={isExporting}
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
            sharerName={sharerName}
            sharedAt={sharedAt}
          />
        ) : (
          <AcademicPaperViewer
            contentId={contentId}
            sharerName={sharerName}
            sharedAt={sharedAt}
          />
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}