// app/(app)/slide-editor.tsx
// Part 28 — Slide Canvas Editor: Main screen
// FIX: onRewriteBullets + onRewriteSingleBullet wired to AIEditPanel.
//      onDeleteSlide no longer wraps with its own Alert (ThumbItem does it).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useCallback, useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, Alert,
  Dimensions, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient }                      from 'expo-linear-gradient';
import { Ionicons }                            from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams }        from 'expo-router';
import Animated, { FadeIn }                   from 'react-native-reanimated';

import { useAuth }                             from '../../src/context/AuthContext';
import { useCredits }                          from '../../src/context/CreditsContext';
import { useSlideEditor }                      from '../../src/hooks/useSlideEditor';
import { generatePPTX, exportAsSlidePDF }      from '../../src/services/pptxExport';

import { SlideEditorCanvas }   from '../../src/components/editor/SlideEditorCanvas';
import { SlideThumbnailStrip } from '../../src/components/editor/SlideThumbnailStrip';
import { FormattingToolbar }   from '../../src/components/editor/FormattingToolbar';
import { ColorPicker }         from '../../src/components/editor/ColorPicker';
import { LayoutSwitcher }      from '../../src/components/editor/LayoutSwitcher';
import { ThemeSwitcher }       from '../../src/components/editor/ThemeSwitcher';
import { BlockInserter }       from '../../src/components/editor/BlockInserter';
import { AIEditPanel }         from '../../src/components/editor/AIEditPanel';
import { DesignPanel }         from '../../src/components/editor/DesignPanel';
import { LoadingOverlay }      from '../../src/components/common/LoadingOverlay';
import { InsufficientCreditsModal } from '../../src/components/credits/InsufficientCreditsModal';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import type { ResearchReport }                  from '../../src/types';
import { supabase }                             from '../../src/lib/supabase';

// ─── Tool tabs ────────────────────────────────────────────────────────────────

type ToolTab = 'canvas' | 'design' | 'blocks' | 'ai';

interface ToolTabMeta {
  id:       ToolTab;
  label:    string;
  icon:     string;
  gradient: readonly [string, string];
}

const TOOL_TABS: ToolTabMeta[] = [
  { id: 'canvas', label: 'Edit',   icon: 'pencil-outline',        gradient: ['#6C63FF', '#8B5CF6'] },
  { id: 'design', label: 'Design', icon: 'color-palette-outline', gradient: ['#FF6584', '#F093FB'] },
  { id: 'blocks', label: 'Blocks', icon: 'add-circle-outline',    gradient: ['#43E97B', '#38F9D7'] },
  { id: 'ai',     label: 'AI ✦',   icon: 'sparkles-outline',      gradient: ['#FFA726', '#FF7043'] },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function SlideEditorScreen() {
  const { presentationId, reportId } = useLocalSearchParams() as {
    presentationId: string;
    reportId?:      string;
  };
  const insets      = useSafeAreaInsets();
  const { user }    = useAuth();
  const { balance } = useCredits();

  const [report,        setReport]        = useState<ResearchReport | null>(null);
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>('canvas');
  const [isExporting,   setIsExporting]   = useState(false);

  // Load optional report for AI context
  useEffect(() => {
    if (!reportId) return;
    supabase.from('research_reports').select('*').eq('id', reportId).single()
      .then(({ data }) => {
        if (!data) return;
        setReport({
          id: data.id, userId: data.user_id, query: data.query, depth: data.depth,
          focusAreas: data.focus_areas ?? [], title: data.title ?? data.query,
          executiveSummary: data.executive_summary ?? '', sections: data.sections ?? [],
          keyFindings: data.key_findings ?? [], futurePredictions: data.future_predictions ?? [],
          citations: data.citations ?? [], statistics: data.statistics ?? [],
          searchQueries: data.search_queries ?? [], sourcesCount: data.sources_count ?? 0,
          reliabilityScore: data.reliability_score ?? 0, status: data.status,
          agentLogs: data.agent_logs ?? [], infographicData: data.infographic_data ?? undefined,
          createdAt: data.created_at,
        } as ResearchReport);
      });
  }, [reportId]);

  const editor = useSlideEditor(report);

  useEffect(() => {
    if (presentationId) editor.loadEditor(presentationId);
  }, [presentationId]);

  const {
    state, presentation, isLoading, loadError, activeSlide,
  } = editor;

  const tokens = presentation?.themeTokens ?? {
    background: COLORS.background, surface: COLORS.backgroundCard,
    primary: COLORS.primary, textPrimary: COLORS.textPrimary,
    textSecondary: COLORS.textSecondary, textMuted: COLORS.textMuted, border: COLORS.border,
    pptx: { background: '0A0A1A', surface: '12122A', primary: '6C63FF', textPrimary: 'FFFFFF', textSecondary: 'A0A0C0', textMuted: '5A5A7A', border: '2A2A4A' },
  };

  const accentColor = activeSlide?.accentColor ?? tokens.primary;

  // Panel booleans
  const isColorPickerOpen   = state.activePanel === 'color_picker';
  const isLayoutOpen        = state.activePanel === 'layout_switcher';
  const isThemeOpen         = state.activePanel === 'theme_switcher';
  const isBlockInserterOpen = state.activePanel === 'block_inserter';
  const isAIPanelOpen       = ['ai_rewrite','ai_generate_slide','ai_layout_suggest'].includes(state.activePanel);
  const isDesignOpen        = ['spacing','font_picker','accent_picker'].includes(state.activePanel);

  const colorPickerCurrent = (() => {
    const t = state.colorPickerTarget;
    if (!t) return accentColor;
    if (t.scope === 'slide_bg') return activeSlide?.editorData?.backgroundColor ?? tokens.background;
    if (t.scope === 'accent')   return activeSlide?.accentColor ?? tokens.primary;
    if (t.scope === 'field')    return editor.getFormatting((t as any).fieldKey).color ?? accentColor;
    return accentColor;
  })();

  const handleToolTab = useCallback((tab: ToolTab) => {
    setActiveToolTab(tab);
    switch (tab) {
      case 'design': editor.openPanel('spacing');        break;
      case 'blocks': editor.openPanel('block_inserter'); break;
      case 'ai':     editor.openPanel('ai_rewrite');     break;
      case 'canvas': editor.closePanel();                break;
    }
  }, [editor]);

  const handleExport = useCallback(async () => {
    const exportPres = editor.getExportPresentation();
    if (!exportPres) return;
    Alert.alert('Export Slides', 'Choose export format:', [
      { text: 'PPTX', onPress: async () => { setIsExporting(true); try { await generatePPTX(exportPres); } finally { setIsExporting(false); } } },
      { text: 'PDF',  onPress: async () => { setIsExporting(true); try { await exportAsSlidePDF(exportPres); } finally { setIsExporting(false); } } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [editor]);

  const handleBack = useCallback(() => {
    if (state.isDirty) {
      Alert.alert('Unsaved changes', 'Save before leaving?', [
        { text: 'Discard',    style: 'destructive', onPress: () => router.back() },
        { text: 'Save & Exit', onPress: async () => { await editor.saveNow(); router.back(); } },
        { text: 'Keep Editing', style: 'cancel' },
      ]);
    } else {
      router.back();
    }
  }, [state.isDirty, editor]);

  if (isLoading) return <LoadingOverlay visible message="Loading editor…" />;

  if (loadError || !presentation) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }} edges={['top']}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
            {loadError ?? 'Presentation not found'}
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

          {/* ── HEADER ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm }}>
            <Pressable onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
            </Pressable>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{presentation.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {state.isSaving ? (
                  <><ActivityIndicator size="small" color={COLORS.primary} style={{ transform: [{ scale: 0.65 }] }} /><Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Saving…</Text></>
                ) : state.isDirty ? (
                  <><View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.warning }} /><Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>Unsaved</Text></>
                ) : (
                  <><Ionicons name="checkmark-circle" size={11} color={COLORS.success} /><Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '600' }}>Saved</Text></>
                )}
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>· {state.slides.length} slides</Text>
              </View>
            </View>

            <Pressable onPress={editor.undo} disabled={!editor.canUndo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, opacity: editor.canUndo ? 1 : 0.3 }}>
              <Ionicons name="arrow-undo" size={17} color={COLORS.textSecondary} />
            </Pressable>
            <Pressable onPress={editor.redo} disabled={!editor.canRedo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, opacity: editor.canRedo ? 1 : 0.3 }}>
              <Ionicons name="arrow-redo" size={17} color={COLORS.textSecondary} />
            </Pressable>
            <Pressable onPress={editor.saveNow} disabled={!state.isDirty || state.isSaving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: state.isDirty ? `${COLORS.primary}18` : COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: state.isDirty ? `${COLORS.primary}40` : COLORS.border, opacity: (state.isDirty && !state.isSaving) ? 1 : 0.35 }}>
              {state.isSaving ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="cloud-upload-outline" size={17} color={state.isDirty ? COLORS.primary : COLORS.textMuted} />}
            </Pressable>
            <Pressable onPress={handleExport} disabled={isExporting} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', opacity: isExporting ? 0.5 : 1 }}>
              <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10 }} />
              {isExporting ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="share-outline" size={17} color="#FFF" />}
            </Pressable>
          </View>

          {/* ── TOOL TABS ── */}
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.xs }}>
            {TOOL_TABS.map(tab => {
              const active = activeToolTab === tab.id;
              return (
                <Pressable key={tab.id} onPress={() => handleToolTab(tab.id)} style={{ flex: 1 }}>
                  {active ? (
                    <LinearGradient colors={tab.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: RADIUS.lg, paddingVertical: 8 }}>
                      <Ionicons name={tab.icon as any} size={13} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{tab.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: RADIUS.lg, paddingVertical: 8, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border }}>
                      <Ionicons name={tab.icon as any} size={13} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{tab.label}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            <Pressable onPress={() => editor.openPanel('layout_switcher')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="grid-outline" size={17} color={COLORS.textSecondary} />
            </Pressable>
            <Pressable onPress={() => editor.openPanel('theme_switcher')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="color-palette-outline" size={17} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* ── AI processing banner ── */}
          {state.isAIProcessing && (
            <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: 10, backgroundColor: `${COLORS.primary}15`, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}25` }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 }}>
                {state.aiProcessingLabel || 'AI is working…'}
              </Text>
            </Animated.View>
          )}

          {/* ── MAIN CANVAS ── */}
          <View style={{ flex: 1 }}>
            {activeSlide ? (
              <SlideEditorCanvas
                slide={activeSlide}
                tokens={tokens}
                fontFamily={state.fontFamily}
                getFormatting={editor.getFormatting}
                editingText={state.editingText}
                selectedField={state.selectedField}
                onFieldTap={field => { editor.selectField(field); setActiveToolTab('canvas'); }}
                onEditingTextChange={editor.setEditingText}
                onCommitField={(field, value) => { editor.commitFieldEdit(field, value); setActiveToolTab('canvas'); }}
                onUpdateBullet={editor.updateBullet}
                onAddBullet={editor.addBullet}
                onRemoveBullet={editor.removeBullet}
                onDeleteBlock={editor.deleteBlock}
                onUpdateBlock={editor.updateBlock}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
          </View>

          {/* ── FORMATTING TOOLBAR ── */}
          <FormattingToolbar
            activeField={state.selectedField}
            formatting={state.selectedField ? editor.getFormatting(state.selectedField) : {}}
            isAIProcessing={state.isAIProcessing}
            onToggleBold={() => state.selectedField && editor.toggleBold(state.selectedField)}
            onToggleItalic={() => state.selectedField && editor.toggleItalic(state.selectedField)}
            onFontSizeUp={() => state.selectedField && editor.cycleFontSizeUp(state.selectedField)}
            onFontSizeDown={() => state.selectedField && editor.cycleFontSizeDown(state.selectedField)}
            onSetAlignment={align => state.selectedField && editor.setAlignment(state.selectedField, align)}
            onOpenColorPicker={() => state.selectedField && editor.openColorPicker({ scope: 'field', fieldKey: state.selectedField })}
            onAIRewrite={style => state.selectedField && editor.aiRewriteField(state.selectedField, style)}
            onDone={() => { if (state.selectedField) editor.commitFieldEdit(state.selectedField, state.editingText); }}
            accentColor={accentColor}
          />

          {/* ── THUMBNAIL STRIP ── */}
          <SlideThumbnailStrip
            slides={state.slides}
            activeIndex={state.activeSlideIndex}
            tokens={tokens}
            fontFamily={state.fontFamily}
            accentColor={accentColor}
            onSelectSlide={editor.goToSlide}
            onAddSlide={editor.addSlide}
            // Delete is confirmed inside ThumbItem — just call directly
            onDeleteSlide={editor.deleteSlide}
            onReorderSlide={editor.reorderSlides}
            onDuplicateSlide={editor.duplicateSlide}
          />

        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── BOTTOM SHEET PANELS ── */}

      <ColorPicker
        visible={isColorPickerOpen}
        currentColor={colorPickerCurrent}
        onSelectColor={editor.applyPickedColor}
        onClose={() => editor.closePanel()}
        title={
          state.colorPickerTarget?.scope === 'slide_bg' ? 'Slide Background Color'
          : state.colorPickerTarget?.scope === 'accent' ? 'Accent Color'
          : `${(state.colorPickerTarget as any)?.fieldKey ?? 'Field'} Color`
        }
      />

      <LayoutSwitcher
        visible={isLayoutOpen}
        currentLayout={activeSlide?.layout ?? 'content'}
        tokens={tokens}
        onSelectLayout={editor.switchLayout}
        onClose={() => editor.closePanel()}
      />

      <ThemeSwitcher
        visible={isThemeOpen}
        currentTheme={presentation.theme}
        onSelectTheme={editor.setTheme}
        onClose={() => editor.closePanel()}
      />

      <BlockInserter
        visible={isBlockInserterOpen}
        infographicData={report?.infographicData ?? null}
        accentColor={accentColor}
        onInsertBlock={editor.addBlock}
        onClose={() => { editor.closePanel(); setActiveToolTab('canvas'); }}
      />

      {/* FIX 1: onRewriteBullets + onRewriteSingleBullet now passed */}
      <AIEditPanel
        visible={isAIPanelOpen}
        isProcessing={state.isAIProcessing}
        processingLabel={state.aiProcessingLabel}
        selectedField={state.selectedField}
        selectedFieldValue={state.selectedField ? ((activeSlide as any)?.[state.selectedField] ?? '') : ''}
        currentSlide={activeSlide}
        currentSlideIndex={state.activeSlideIndex}
        totalSlides={state.slides.length}
        balance={balance}
        layoutSuggestion={state.layoutSuggestion}
        onRewriteField={editor.aiRewriteField}
        onRewriteBullets={editor.aiRewriteBullets}
        onRewriteSingleBullet={editor.aiRewriteSingleBullet}
        onGenerateSlide={editor.aiGenerateSlide}
        onGenerateSpeakerNotes={editor.aiGenerateSpeakerNotes}
        onSuggestLayout={editor.aiSuggestLayout}
        onApplyLayoutSuggestion={editor.applyLayoutSuggestion}
        onDismissLayoutSuggestion={editor.dismissLayoutSuggestion}
        onClose={() => { editor.closePanel(); setActiveToolTab('canvas'); }}
      />

      <DesignPanel
        visible={isDesignOpen}
        tokens={tokens}
        currentBg={activeSlide?.editorData?.backgroundColor}
        currentAccent={activeSlide?.accentColor}
        currentSpacing={activeSlide?.editorData?.spacing ?? 'default'}
        currentFont={state.fontFamily}
        onSetBackground={(color, applyAll) => editor.setBackgroundColor(color, applyAll)}
        onSetAccent={(color, applyAll) => editor.setAccentColor(color, applyAll)}
        onSetSpacing={editor.setSpacing}
        onSetFont={editor.setFontFamily}
        onOpenColorPicker={scope => {
          editor.closePanel();
          setTimeout(() => editor.openColorPicker({ scope }), 250);
        }}
        onClose={() => { editor.closePanel(); setActiveToolTab('canvas'); }}
      />

    </LinearGradient>
  );
}