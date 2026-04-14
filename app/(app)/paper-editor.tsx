// app/(app)/paper-editor.tsx
// Part 38 — Academic Paper Editor screen.
// Part 41.8 — Section management.
// Part 41.8 FIXES:
//   FIX Problem 2 — handleBack now calls saveNow() unconditionally before
//                   navigating, not just when isDirty. This ensures the DB
//                   is always up-to-date when academic-paper.tsx reloads on
//                   focus, even if the debounce timer hasn't fired yet.
//   FIX Problem 5 — section delete guard removed from hook; trash icon now
//                   shows on every section (including pre-generated ones).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Alert, Pressable,
  ActivityIndicator, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown }         from 'react-native-reanimated';

import { supabase }                    from '../../src/lib/supabase';
import { useAuth }                     from '../../src/context/AuthContext';
import { useCredits }                  from '../../src/context/CreditsContext';
import { usePaperEditor }              from '../../src/hooks/usePaperEditor';
import { usePaperVersions }            from '../../src/hooks/usePaperVersions';
import { useCitationManager }          from '../../src/hooks/useCitationManager';

import { PaperEditorToolbar }          from '../../src/components/paperEditor/PaperEditorToolbar';
import { PaperSectionEditor }          from '../../src/components/paperEditor/PaperSectionEditor';
import { PaperAIToolbar }              from '../../src/components/paperEditor/PaperAIToolbar';
import { CitationManagerModal }        from '../../src/components/paperEditor/CitationManagerModal';
import { VersionHistoryPanel }         from '../../src/components/paperEditor/VersionHistoryPanel';
import { WordCountBadge }              from '../../src/components/paperEditor/WordCountBadge';
import { LoadingOverlay }              from '../../src/components/common/LoadingOverlay';

import { exportAcademicPaperAsPDF }    from '../../src/services/academicPdfExport';
import { exportAcademicPaperAsDocx }   from '../../src/services/academicDocxExport';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { DEFAULT_EXPORT_CONFIG }       from '../../src/constants/paperEditor';
import type { AcademicPaper, Citation, AcademicCitationStyle } from '../../src/types';
import type {
  PaperAITool,
  PaperExportConfig,
  SectionInsertPosition,
  NewSectionConfig,
} from '../../src/types/paperEditor';

// ─── Map AcademicPaper from Supabase row ──────────────────────────────────────

function mapPaperRow(data: Record<string, any>): AcademicPaper {
  return {
    id:            data.id,
    reportId:      data.report_id,
    userId:        data.user_id,
    title:         data.title          ?? '',
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
}

// ─── Export config modal ──────────────────────────────────────────────────────

interface ExportModalProps { visible: boolean; paper: AcademicPaper | null; onClose: () => void; }

function ExportModal({ visible, paper, onClose }: ExportModalProps) {
  const [config,    setConfig]    = useState<PaperExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  if (!paper) return null;

  const handleExportPDF = async () => {
    setExporting('pdf');
    try { await exportAcademicPaperAsPDF({ ...paper, institution: config.institution || paper.institution }); }
    catch { Alert.alert('Export Error', 'Could not generate PDF. Please try again.'); }
    finally { setExporting(null); }
  };
  const handleExportDocx = async () => {
    setExporting('docx');
    try { await exportAcademicPaperAsDocx(paper, config); }
    catch { Alert.alert('Export Error', 'Could not generate Word document. Please try again.'); }
    finally { setExporting(null); }
  };

  const fontSizes = [10, 11, 12, 13, 14] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, paddingBottom: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.md }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Export Options</Text>
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Institution (optional)</Text>
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
              <TextInput value={config.institution ?? ''} onChangeText={(v: string) => setConfig(prev => ({ ...prev, institution: v }))} placeholder="University / Organization name" placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, height: 44 }} />
            </View>
          </View>
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Author Name (optional)</Text>
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
              <TextInput value={config.authorName ?? ''} onChangeText={(v: string) => setConfig(prev => ({ ...prev, authorName: v }))} placeholder="Your full name" placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, height: 44 }} />
            </View>
          </View>
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Font Size</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fontSizes.map(size => (
                <Pressable key={size} onPress={() => setConfig(prev => ({ ...prev, fontSizePt: size }))} style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg, alignItems: 'center', backgroundColor: config.fontSizePt === size ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderWidth: 1.5, borderColor: config.fontSizePt === size ? COLORS.primary : COLORS.border }}>
                  <Text style={{ color: config.fontSizePt === size ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{size}pt</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['single', 'double'] as const).map(spacing => (
              <Pressable key={spacing} onPress={() => setConfig(prev => ({ ...prev, lineSpacing: spacing }))} style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg, alignItems: 'center', backgroundColor: config.lineSpacing === spacing ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderWidth: 1.5, borderColor: config.lineSpacing === spacing ? COLORS.primary : COLORS.border }}>
                <Text style={{ color: config.lineSpacing === spacing ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{spacing === 'single' ? 'Single Spaced' : 'Double Spaced'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <TouchableOpacity onPress={handleExportPDF} disabled={!!exporting} activeOpacity={0.85} style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}>
              <LinearGradient colors={[COLORS.primary, '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.medium }}>
                {exporting === 'pdf' ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="document-outline" size={17} color="#FFF" />}
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportDocx} disabled={!!exporting} activeOpacity={0.85} style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}>
              <LinearGradient colors={['#2B5BE0', '#1A3AB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.medium }}>
                {exporting === 'docx' ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="logo-windows" size={17} color="#FFF" />}
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{exporting === 'docx' ? 'Generating…' : 'Export DOCX'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PaperEditorScreen() {
  const { paperId } = useLocalSearchParams<{ paperId: string }>();
  const { user }    = useAuth();
  const { balance } = useCredits();

  const [paper,     setPaper]     = useState<AcademicPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // FIX P2: track whether a save is in progress when navigating back
  const [isSavingBack, setIsSavingBack] = useState(false);

  useEffect(() => {
    if (!paperId || !user) return;
    loadPaper();
  }, [paperId, user]);

  const loadPaper = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.from('academic_papers').select('*').eq('id', paperId).single();
      if (error || !data) throw error ?? new Error('Not found');
      setPaper(mapPaperRow(data));
    } catch (err) {
      setLoadError('Could not load this paper. Please go back and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const editor   = usePaperEditor(paper);
  const versions = usePaperVersions(paper?.id ?? null);

  const handleCitationsChange = useCallback((citations: Citation[], style: AcademicCitationStyle) => {
    editor.updateCitations(citations, style);
  }, [editor.updateCitations]);

  const citMan = useCitationManager(
    paper?.id         ?? null,
    user?.id          ?? null,
    paper?.citations  ?? [],
    paper?.citationStyle ?? 'apa',
    (style) => editor.changeCitationStyle(style),
    handleCitationsChange,
  );

  useEffect(() => {
    if (editor.versionSavedCount > 0 && paper?.id) versions.load(paper.id);
  }, [editor.versionSavedCount]);

  const [showAIPanel,    setShowAIPanel]    = useState(false);
  const [aiSectionId,    setAISectionId]    = useState<string | null>(null);
  const [aiSubsectionId, setAISubsectionId] = useState<string | null>(null);
  const [showVersions,   setShowVersions]   = useState(false);
  const [showCitations,  setShowCitations]  = useState(false);
  const [showExport,     setShowExport]     = useState(false);

  // ─── FIX Problem 2: Always save before leaving ────────────────────────────
  // Previously saveNow was only called in the "Save & Leave" path.
  // Now handleBack ALWAYS calls saveNow() before navigating, so the DB is
  // guaranteed to be current when academic-paper.tsx reloads on focus.
  const handleBack = useCallback(async () => {
    setIsSavingBack(true);
    try {
      // Force flush the debounce timer and wait for the DB write to complete
      await editor.saveNow();
    } catch {
      // Non-fatal — still navigate back
    } finally {
      setIsSavingBack(false);
    }
    router.back();
  }, [editor.saveNow]);

  const handleOpenAI = useCallback((sectionId: string, subsectionId?: string) => {
    setAISectionId(sectionId);
    setAISubsectionId(subsectionId ?? null);
    setShowAIPanel(true);
  }, []);

  const handleAITool = useCallback(async (tool: PaperAITool) => {
    if (!aiSectionId) return;
    setShowAIPanel(false);
    await editor.runAITool(tool, aiSectionId, aiSubsectionId ?? undefined);
  }, [aiSectionId, aiSubsectionId, editor.runAITool]);

  const handleGenerateSubsectionTitle = useCallback(async (sectionId: string, subsectionId: string) => {
    await editor.generateSubsectionTitle(sectionId, subsectionId);
  }, [editor.generateSubsectionTitle]);

  const handleAddSubsectionWithAI = useCallback(async (sectionId: string, description?: string) => {
    await editor.generateSubsectionWithAI(sectionId, description);
  }, [editor.generateSubsectionWithAI]);

  const handleSaveCurrentVersion = useCallback(async (label: string) => {
    await editor.saveVersion(label);
    Alert.alert('Snapshot Saved', 'Your current paper has been saved as a version snapshot.');
  }, [editor.saveVersion]);

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    await editor.saveVersion(`Before Restore · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    const result = await versions.restore(versionId);
    if (result) {
      editor.applyRestore(result.sections, result.abstract, result.wordCount);
      setShowVersions(false);
      Alert.alert('✅ Restored', 'The version has been restored.');
    }
  }, [editor, versions]);

  const handleRenameVersion = useCallback(async (versionId: string, newLabel: string): Promise<boolean> => {
    return await versions.rename(versionId, newLabel);
  }, [versions.rename]);

  const handleDeleteVersion = useCallback(async (versionId: string): Promise<boolean> => {
    return await versions.deleteVersion(versionId);
  }, [versions.deleteVersion]);

  // Section management
  const handleAddSectionAfter = useCallback((config: NewSectionConfig, position: SectionInsertPosition) => {
    editor.addSection(config, position);
  }, [editor.addSection]);

  const handleAddSectionWithAI = useCallback(async (config: NewSectionConfig, position: SectionInsertPosition) => {
    await editor.addSectionWithAI(config, position);
  }, [editor.addSectionWithAI]);

  // FIX P5: delete without confirmation for non-abstract sections
  const handleDeleteSection = useCallback((sectionId: string) => {
    const section = editor.sections.find(s => s.id === sectionId);
    if (!section) return;

    if (section.type === 'abstract') {
      // Hook will show the alert — just call it
      editor.removeSection(sectionId);
      return;
    }

    Alert.alert(
      'Delete Section',
      `Delete "${section.title}"? This can be restored from Version History.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => editor.removeSection(sectionId) },
      ],
    );
  }, [editor.sections, editor.removeSection]);

  if (isLoading) return <LoadingOverlay visible message="Loading paper editor…" />;

  if (loadError || !paper) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={52} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginTop: SPACING.md, textAlign: 'center' }}>Could Not Load Paper</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 }}>{loadError ?? 'Paper not found.'}</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const aiSection    = editor.sections.find(s => s.id === aiSectionId) ?? null;
  const aiSubsection = aiSection && aiSubsectionId
    ? (aiSection.subsections ?? []).find(s => s.id === aiSubsectionId) ?? null
    : null;
  const paperTopic = (paper as any).query ?? paper.title ?? '';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <PaperEditorToolbar
          title={paper.title}
          isDirty={editor.isDirty}
          isSaving={editor.isSaving || isSavingBack}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          creditBalance={balance}
          totalWordCount={editor.totalWordCount}
          lastSavedAt={editor.lastSavedAt}
          onBack={handleBack}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onSave={editor.saveNow}
          onOpenVersions={() => setShowVersions(true)}
          onOpenCitations={() => setShowCitations(true)}
          onOpenExport={() => setShowExport(true)}
        />

        {/* FIX P2: saving-back overlay hint */}
        {isSavingBack && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}15`, paddingHorizontal: SPACING.lg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}25` }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Saving before leaving…</Text>
          </View>
        )}

        {editor.error && (
          <Animated.View entering={FadeInDown.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.error}12`, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: `${COLORS.error}25` }}>
            <Ionicons name="alert-circle-outline" size={15} color={COLORS.error} />
            <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }} numberOfLines={2}>{editor.error}</Text>
            <Pressable onPress={editor.clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={COLORS.error} />
            </Pressable>
          </Animated.View>
        )}

        {editor.isAIProcessing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}15`, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}25` }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 }}>{editor.aiProcessingLabel || 'AI is processing…'}</Text>
          </View>
        )}

        {/* Stats strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard, minHeight: 38, gap: SPACING.sm }}>
          <View style={{ flexShrink: 1, flexGrow: 0, maxWidth: '40%' }}>
            <WordCountBadge sectionType="introduction" wordCount={editor.totalWordCount} compact={false} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.primary}20` }}>
              <Ionicons name="school-outline" size={11} color={COLORS.textMuted} />
              <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 1 }}>{editor.citationStyle.toUpperCase()} · {editor.sections.length} sec</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.warning}20` }}>
              <Ionicons name="link-outline" size={11} color={COLORS.textMuted} />
              <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 1 }}>
                {citMan.citations.length} cite{citMan.citations.length !== 1 ? 's' : ''}
                {citMan.isSaving ? ' · saving…' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Section cards */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">

          {editor.sections.filter(s => s.type === 'abstract').map((section) => {
            const idx = editor.sections.findIndex(s2 => s2.id === section.id);
            return (
              <PaperSectionEditor
                key={section.id}
                section={section}
                index={0}
                totalSections={editor.sections.length}
                isFirst={idx === 0}
                isLast={idx === editor.sections.length - 1}
                isAIProcessing={editor.isAIProcessing && aiSectionId === section.id}
                aiProcessingLabel={editor.aiProcessingLabel}
                onUpdateContent={content => editor.updateSectionContent(section.id, content)}
                onAddSubsection={() => editor.addSubsection(section.id)}
                onAddSubsectionWithAI={desc => handleAddSubsectionWithAI(section.id, desc)}
                onUpdateSubsection={(subId, field, value) => editor.updateSubsection(section.id, subId, field, value)}
                onRemoveSubsection={subId => editor.removeSubsection(section.id, subId)}
                onMoveSubUp={subId => editor.moveSubsectionUp(section.id, subId)}
                onMoveSubDown={subId => editor.moveSubsectionDown(section.id, subId)}
                onOpenAITools={subsectionId => handleOpenAI(section.id, subsectionId)}
                onGenerateSubsectionTitle={subId => handleGenerateSubsectionTitle(section.id, subId)}
                onAddSectionAfter={handleAddSectionAfter}
                onAddSectionWithAI={handleAddSectionWithAI}
                onDeleteSection={() => handleDeleteSection(section.id)}
                onMoveSectionUp={() => editor.moveSectionUp(section.id)}
                onMoveSectionDown={() => editor.moveSectionDown(section.id)}
                onRenameSection={title => editor.renameSectionTitle(section.id, title)}
              />
            );
          })}

          {editor.sections.filter(s => s.type !== 'abstract').map((section, i) => {
            const idx = editor.sections.findIndex(s2 => s2.id === section.id);
            return (
              <PaperSectionEditor
                key={section.id}
                section={section}
                index={i + 1}
                totalSections={editor.sections.length}
                isFirst={idx === 0}
                isLast={idx === editor.sections.length - 1}
                isAIProcessing={editor.isAIProcessing && aiSectionId === section.id}
                aiProcessingLabel={editor.aiProcessingLabel}
                onUpdateContent={content => editor.updateSectionContent(section.id, content)}
                onAddSubsection={() => editor.addSubsection(section.id)}
                onAddSubsectionWithAI={desc => handleAddSubsectionWithAI(section.id, desc)}
                onUpdateSubsection={(subId, field, value) => editor.updateSubsection(section.id, subId, field, value)}
                onRemoveSubsection={subId => editor.removeSubsection(section.id, subId)}
                onMoveSubUp={subId => editor.moveSubsectionUp(section.id, subId)}
                onMoveSubDown={subId => editor.moveSubsectionDown(section.id, subId)}
                onOpenAITools={subsectionId => handleOpenAI(section.id, subsectionId)}
                onGenerateSubsectionTitle={subId => handleGenerateSubsectionTitle(section.id, subId)}
                onAddSectionAfter={handleAddSectionAfter}
                onAddSectionWithAI={handleAddSectionWithAI}
                onDeleteSection={() => handleDeleteSection(section.id)}
                onMoveSectionUp={() => editor.moveSectionUp(section.id)}
                onMoveSectionDown={() => editor.moveSectionDown(section.id)}
                onRenameSection={title => editor.renameSectionTitle(section.id, title)}
              />
            );
          })}

          <View style={{ alignItems: 'center', paddingTop: SPACING.md, gap: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16 }}>
              Changes auto-save every 1.5s · Use ↑↓ to reorder sections{'\n'}
              Long-press section title to rename · Deleted sections restorable via Versions
            </Text>
          </View>
        </ScrollView>

        {/* Modals */}
        <PaperAIToolbar
          visible={showAIPanel}
          section={aiSection}
          isProcessing={editor.isAIProcessing}
          processingLabel={editor.aiProcessingLabel}
          creditBalance={balance}
          subsectionTitle={aiSubsection?.title}
          onSelectTool={handleAITool}
          onClose={() => { setShowAIPanel(false); setAISubsectionId(null); }}
        />

        <VersionHistoryPanel
          visible={showVersions}
          versions={versions.versions}
          isLoading={versions.isLoading}
          isRestoring={versions.isRestoring}
          currentWords={editor.totalWordCount}
          onRestore={handleRestoreVersion}
          onSaveCurrent={handleSaveCurrentVersion}
          onRename={handleRenameVersion}
          onDelete={handleDeleteVersion}
          onClose={() => setShowVersions(false)}
        />

        <CitationManagerModal
          visible={showCitations}
          citations={citMan.citations}
          formattedCitations={citMan.formattedCitations}
          citationStyle={citMan.citationStyle}
          isImporting={citMan.isImporting}
          importError={citMan.importError}
          paperTopic={paperTopic}
          onClose={() => setShowCitations(false)}
          onStyleChange={style => { citMan.setCitationStyle(style); editor.changeCitationStyle(style); }}
          onAdd={citMan.addCitation}
          onUpdate={citMan.updateCitation}
          onDelete={citMan.deleteCitation}
          onMoveUp={citMan.moveCitationUp}
          onMoveDown={citMan.moveCitationDown}
          onImportFromUrl={citMan.importFromUrl}
          onGenerateCitations={citMan.generateCitations}
          isGeneratingCitations={citMan.isGeneratingCitations}
          generateCitationsError={citMan.generateCitationsError}
        />

        <ExportModal
          visible={showExport}
          paper={paper ? {
            ...paper,
            sections:      editor.sections,
            abstract:      editor.abstract,
            citationStyle: editor.citationStyle,
          } : null}
          onClose={() => setShowExport(false)}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}