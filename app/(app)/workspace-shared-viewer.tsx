// app/(app)/workspace-shared-viewer.tsx
// Part 31 FIX — Workspace shared viewer now loads the EDITED presentation.
//
// ROOT CAUSE (Part 14 bug):
//   The original viewer fetched the presentation row but only used `data.slides`
//   (the raw AI-generated slides). It never read `editor_data`, `font_family`, or
//   the per-slide formatting overlays.  So any edits made in the slide editor
//   (background colours, accent overrides, custom blocks, text rewrites, etc.)
//   were invisible to workspace members who opened a shared presentation.
//
// FIX:
//   1. Fetch slides + editor_data + font_family from the presentations table.
//   2. Call mergeEditorData() to attach per-slide editorData overlays — the same
//      function used by slide-preview.tsx and useSlideEditor.ts.
//   3. Pass fontFamily through to SlidePreviewPanel so typefaces match the editor.
//   4. Show a "View only" attribution banner (sharedBy + sharedAt).
//   5. Export buttons (PDF, PPTX, HTML) export the merged/edited version.
//
// Everything that was working before (academic papers, slide viewer) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  Alert, ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient }              from 'expo-linear-gradient';
import { Ionicons }                    from '@expo/vector-icons';
import { SafeAreaView }                from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown }        from 'react-native-reanimated';

import { supabase }                    from '../../src/lib/supabase';
import { SlidePreviewPanel }           from '../../src/components/research/SlidePreviewPanel';
import { LoadingOverlay }              from '../../src/components/common/LoadingOverlay';
import { mergeEditorData }             from '../../src/services/slideEditorService';
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
  AcademicSection,
} from '../../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Params ───────────────────────────────────────────────────────────────────

type Params = {
  /** shared_workspace_content.content_type = 'presentation' | 'academic_paper' */
  contentType:    string;
  /** The actual content id (presentation id or paper id) */
  contentId:      string;
  /** Display: who shared it */
  sharedBy?:      string;
  /** Display: ISO timestamp */
  sharedAt?:      string;
  /** For presentations: workspace member display name of sharer */
  sharerName?:    string;
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
    ? new Date(sharedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={{
      flexDirection:   'row',
      alignItems:      'center',
      gap:             SPACING.sm,
      backgroundColor: `${COLORS.primary}12`,
      borderBottomWidth: 1,
      borderBottomColor: `${COLORS.primary}25`,
      paddingHorizontal: SPACING.lg,
      paddingVertical:   SPACING.sm,
    }}>
      <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>
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

// ─── Presentation viewer (the main fix) ───────────────────────────────────────

function PresentationViewer({
  contentId,
  sharerName,
  sharedAt,
}: {
  contentId:  string;
  sharerName?: string;
  sharedAt?:  string;
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
      // FIX: fetch slides + editor_data + font_family so we can merge edits
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

      // FIX: merge editor_data overlays so workspace members see the edited version
      const rawSlides:    any[]   = Array.isArray(data.slides)      ? data.slides      : [];
      const editorDataArr: any[]  = Array.isArray(data.editor_data) ? data.editor_data : [];
      const mergedSlides          = mergeEditorData(rawSlides, editorDataArr);

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
        // FIX: carry font_family so SlidePreviewPanel + export use correct typeface
        fontFamily:  data.font_family ?? 'system',
      };

      setPresentation(pres);
    } catch (err) {
      console.error('[workspace-shared-viewer] load error:', err);
      setLoadError('Failed to load presentation.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

  useEffect(() => { load(); }, [load]);

  // Export helpers — all use the merged presentation (with editorData)
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
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
          {loadError ?? 'Presentation not found'}
        </Text>
        <Pressable
          onPress={load}
          style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />

      {/* Slide viewer */}
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
        {/* Primary: PPTX */}
        <Pressable
          onPress={handleExportPPTX}
          disabled={isExporting}
          style={{ opacity: isExporting && exportFormat !== 'pptx' ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={['#6C63FF', '#8B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{
              borderRadius:    RADIUS.lg,
              paddingVertical: 13,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             8,
              ...SHADOWS.medium,
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

        {/* Secondary: PDF + HTML */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <Pressable
            onPress={handleExportPDF}
            disabled={isExporting}
            style={[{
              flex:            1,
              borderRadius:    RADIUS.lg,
              paddingVertical: 10,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             7,
              backgroundColor: COLORS.backgroundElevated,
              borderWidth:     1.5,
              borderColor:     COLORS.border,
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
              flex:            1,
              borderRadius:    RADIUS.lg,
              paddingVertical: 10,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             7,
              backgroundColor: COLORS.backgroundElevated,
              borderWidth:     1,
              borderColor:     COLORS.border,
            }, isExporting && exportFormat !== 'html' ? { opacity: 0.5 } : {}]}
          >
            {isExporting && exportFormat === 'html'
              ? <ActivityIndicator size="small" color={COLORS.textMuted} />
              : <Ionicons name="globe-outline" size={15} color={COLORS.textMuted} />}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>HTML</Text>
          </Pressable>
        </View>

        {/* Slide count chip */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg }}>
          {[
            { label: 'Slides',   value: String(presentation.totalSlides) },
            { label: 'Theme',    value: presentation.theme },
            { label: 'Exported', value: String(presentation.exportCount ?? 0) },
          ].map(stat => (
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

// ─── Academic Paper viewer (unchanged from Part 14) ───────────────────────────

function AcademicPaperViewer({
  contentId,
  sharerName,
  sharedAt,
}: {
  contentId:  string;
  sharerName?: string;
  sharedAt?:  string;
}) {
  const [paper,     setPaper]     = useState<AcademicPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

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

      const mapped: AcademicPaper = {
        id:            data.id,
        reportId:      data.report_id,
        userId:        data.user_id,
        title:         data.title,
        runningHead:   data.running_head ?? '',
        abstract:      data.abstract ?? '',
        keywords:      data.keywords ?? [],
        sections:      data.sections ?? [],
        citations:     data.citations ?? [],
        citationStyle: data.citation_style ?? 'apa',
        wordCount:     data.word_count ?? 0,
        pageEstimate:  data.page_estimate ?? 0,
        institution:   data.institution ?? undefined,
        generatedAt:   data.generated_at,
        exportCount:   data.export_count ?? 0,
      };

      setPaper(mapped);
      if (mapped.sections.length > 0) setActiveSectionId(mapped.sections[0].id);
    } catch (err) {
      console.error('[workspace-shared-viewer] academic paper load error:', err);
      setLoadError('Failed to load academic paper.');
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) return <LoadingOverlay visible message="Loading paper…" />;

  if (loadError || !paper) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
          {loadError ?? 'Paper not found'}
        </Text>
        <Pressable onPress={load} style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const activeSection = paper.sections.find(s => s.id === activeSectionId) ?? paper.sections[0] ?? null;

  const SECTION_TYPE_COLORS: Record<string, string> = {
    abstract:          COLORS.primary,
    introduction:      '#43E97B',
    literature_review: '#FFA726',
    methodology:       '#29B6F6',
    findings:          '#FF6584',
    conclusion:        '#AB47BC',
    references:        '#5A5A7A',
  };

  return (
    <View style={{ flex: 1 }}>
      <AttributionBanner sharerName={sharerName} sharedAt={sharedAt} />

      {/* Title + meta */}
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '900', marginBottom: 6 }} numberOfLines={3}>
          {paper.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: 'document-text-outline', label: `${paper.wordCount.toLocaleString()} words` },
            { icon: 'copy-outline',          label: `~${paper.pageEstimate} pages` },
            { icon: 'bookmark-outline',      label: paper.citationStyle.toUpperCase() },
            { icon: 'link-outline',          label: `${paper.citations.length} citations` },
          ].map(tag => (
            <View key={tag.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name={tag.icon as any} size={11} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '600' }}>{tag.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Section navigator */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm }}
        style={{ flexShrink: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
      >
        {paper.sections.map(section => {
          const isActive = section.id === activeSectionId;
          const color    = SECTION_TYPE_COLORS[section.type] ?? COLORS.primary;
          return (
            <Pressable
              key={section.id}
              onPress={() => setActiveSectionId(section.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical:   6,
                borderRadius:      RADIUS.full,
                backgroundColor:   isActive ? `${color}20` : COLORS.backgroundElevated,
                borderWidth:       1,
                borderColor:       isActive ? color : COLORS.border,
              }}
            >
              <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
                {section.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Section content */}
      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {activeSection ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            {/* Abstract box */}
            {activeSection.type === 'abstract' && (
              <View style={{ backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.lg, padding: SPACING.lg, borderLeftWidth: 3, borderLeftColor: COLORS.primary, marginBottom: SPACING.md }}>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Abstract</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{paper.abstract}</Text>
                {paper.keywords.length > 0 && (
                  <View style={{ marginTop: SPACING.md }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 }}>KEYWORDS</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>
                      {paper.keywords.join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Section body */}
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 24, marginBottom: SPACING.md }}>
              {activeSection.content}
            </Text>

            {/* Subsections */}
            {activeSection.subsections?.map(sub => (
              <View key={sub.id} style={{ marginBottom: SPACING.lg }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: SPACING.sm }}>
                  {sub.title}
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 24 }}>
                  {sub.content}
                </Text>
              </View>
            ))}

            {/* References */}
            {activeSection.type === 'references' && paper.citations.length > 0 && (
              <View style={{ marginTop: SPACING.lg }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>
                  {paper.citations.length} Citations
                </Text>
                {paper.citations.map((cit, i) => (
                  <View key={cit.id} style={{ marginBottom: SPACING.sm, flexDirection: 'row', gap: SPACING.sm }}>
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', minWidth: 28, flexShrink: 0 }}>[{i+1}]</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                      {cit.title} — {cit.source}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
            <Text style={{ color: COLORS.textMuted }}>Select a section above</Text>
          </View>
        )}
      </ScrollView>
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
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md }}>
            Invalid shared content
          </Text>
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

        {/* Header */}
        <View style={{
          flexDirection:      'row',
          alignItems:         'center',
          paddingHorizontal:  SPACING.lg,
          paddingVertical:    SPACING.sm,
          borderBottomWidth:  1,
          borderBottomColor:  COLORS.border,
          gap:                SPACING.sm,
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
              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}
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