// app/(app)/paper-editor.tsx
// Part 38 — Academic Paper Editor screen.
// Part 38 UPDATE:
//   - Removed onDetectUsage prop (detectUsageIssues no longer exists on hook)
//   - Added onGenerateCitations, isGeneratingCitations, generateCitationsError
//   - Added paperTopic prop to CitationManagerModal
// Part 38c FIXES:
//   FIX #2 — onCitationsChange(citations, style) callback calls
//             editor.updateCitations() which rebuilds the References section
//             live so changes appear immediately without reloading.
//   FIX #3 — useCitationManager now receives user?.id so it can persist
//             citations to DB; onCitationsChange also triggers editor auto-save.
//   FIX #5 — onAddSubsectionWithAI(sectionId, description) wired to
//             editor.generateSubsectionWithAI(); AI processing handled inline.
//   FIX #7 (prev) — paperId passed as first arg to useCitationManager.
//   FIX #1 (prev) — versionSavedCount useEffect reloads versions list.
// Part 38d FIXES:
//   FIX #STATS — Stats strip text no longer overflows screen.
// UPDATE: onRename + onDelete wired to VersionHistoryPanel.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useCallback, useEffect,
} from 'react';
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
import type { PaperAITool, PaperExportConfig } from '../../src/types/paperEditor';

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

interface ExportModalProps {
  visible: boolean;
  paper:   AcademicPaper | null;
  onClose: () => void;
}

function ExportModal({ visible, paper, onClose }: ExportModalProps) {
  const [config,    setConfig]    = useState<PaperExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  if (!paper) return null;

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      await exportAcademicPaperAsPDF({
        ...paper,
        institution: config.institution || paper.institution,
      });
    } catch {
      Alert.alert('Export Error', 'Could not generate PDF. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportDocx = async () => {
    setExporting('docx');
    try {
      await exportAcademicPaperAsDocx(paper, config);
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate Word document. Please try again.');
      console.error('[ExportModal] DOCX error:', err);
    } finally {
      setExporting(null);
    }
  };

  const fontSizes = [10, 11, 12, 13, 14] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:     COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            padding:              SPACING.lg,
            paddingBottom:        SPACING.xl,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
            gap:                  SPACING.md,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
            Export Options
          </Text>

          {/* Institution */}
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Institution (optional)
            </Text>
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
              <TextInput
                value={config.institution ?? ''}
                onChangeText={(v: string) => setConfig(prev => ({ ...prev, institution: v }))}
                placeholder="University / Organization name"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, height: 44 }}
              />
            </View>
          </View>

          {/* Author name */}
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Author Name (optional)
            </Text>
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
              <TextInput
                value={config.authorName ?? ''}
                onChangeText={(v: string) => setConfig(prev => ({ ...prev, authorName: v }))}
                placeholder="Your full name"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, height: 44 }}
              />
            </View>
          </View>

          {/* Font size */}
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Font Size
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fontSizes.map(size => (
                <Pressable
                  key={size}
                  onPress={() => setConfig(prev => ({ ...prev, fontSizePt: size }))}
                  style={{
                    flex:            1,
                    paddingVertical: 10,
                    borderRadius:    RADIUS.lg,
                    alignItems:      'center',
                    backgroundColor: config.fontSizePt === size ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                    borderWidth:     1.5,
                    borderColor:     config.fontSizePt === size ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text style={{ color: config.fontSizePt === size ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                    {size}pt
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Line spacing */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['single', 'double'] as const).map(spacing => (
              <Pressable
                key={spacing}
                onPress={() => setConfig(prev => ({ ...prev, lineSpacing: spacing }))}
                style={{
                  flex:            1,
                  paddingVertical: 10,
                  borderRadius:    RADIUS.lg,
                  alignItems:      'center',
                  backgroundColor: config.lineSpacing === spacing ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                  borderWidth:     1.5,
                  borderColor:     config.lineSpacing === spacing ? COLORS.primary : COLORS.border,
                }}
              >
                <Text style={{ color: config.lineSpacing === spacing ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                  {spacing === 'single' ? 'Single Spaced' : 'Double Spaced'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Export buttons */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <TouchableOpacity
              onPress={handleExportPDF}
              disabled={!!exporting}
              activeOpacity={0.85}
              style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.medium }}
              >
                {exporting === 'pdf'
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="document-outline" size={17} color="#FFF" />
                }
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                  {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleExportDocx}
              disabled={!!exporting}
              activeOpacity={0.85}
              style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}
            >
              <LinearGradient
                colors={['#2B5BE0', '#1A3AB8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.medium }}
              >
                {exporting === 'docx'
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="logo-windows" size={17} color="#FFF" />
                }
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                  {exporting === 'docx' ? 'Generating…' : 'Export DOCX'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16 }}>
            DOCX: Word document with double-spacing and hanging-indent references.{'\n'}
            PDF: Publication-quality layout.
          </Text>
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

  useEffect(() => {
    if (!paperId || !user) return;
    loadPaper();
  }, [paperId, user]);

  const loadPaper = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('academic_papers')
        .select('*')
        .eq('id', paperId)
        .single();
      if (error || !data) throw error ?? new Error('Not found');
      setPaper(mapPaperRow(data));
    } catch (err) {
      setLoadError('Could not load this paper. Please go back and try again.');
      console.error('[PaperEditorScreen] loadPaper:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const editor   = usePaperEditor(paper);
  const versions = usePaperVersions(paper?.id ?? null);

  // ── FIX #2 + FIX #3: onCitationsChange rebuilds references + persists ─────
  const handleCitationsChange = useCallback((
    citations: Citation[],
    style:     AcademicCitationStyle,
  ) => {
    editor.updateCitations(citations, style);
  }, [editor.updateCitations]);

  // ── Citation manager ──────────────────────────────────────────────────────
  const citMan = useCitationManager(
    paper?.id         ?? null,
    user?.id          ?? null,
    paper?.citations  ?? [],
    paper?.citationStyle ?? 'apa',
    (style) => editor.changeCitationStyle(style),
    handleCitationsChange,
  );

  // ── FIX #1: Live version reload when a version is saved ───────────────────
  useEffect(() => {
    if (editor.versionSavedCount > 0 && paper?.id) {
      versions.load(paper.id);
    }
  }, [editor.versionSavedCount]);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showAIPanel,    setShowAIPanel]    = useState(false);
  const [aiSectionId,    setAISectionId]    = useState<string | null>(null);
  const [aiSubsectionId, setAISubsectionId] = useState<string | null>(null);

  const [showVersions,  setShowVersions]  = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [showExport,    setShowExport]    = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (editor.isDirty) {
      Alert.alert(
        'Unsaved Changes',
        'Save your changes before leaving?',
        [
          { text: 'Discard',      style: 'destructive', onPress: () => router.back() },
          { text: 'Save & Leave', onPress: async () => { await editor.saveNow(); router.back(); } },
          { text: 'Keep Editing', style: 'cancel' },
        ],
      );
    } else {
      router.back();
    }
  }, [editor.isDirty, editor.saveNow]);

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

  const handleGenerateSubsectionTitle = useCallback(async (
    sectionId:    string,
    subsectionId: string,
  ) => {
    await editor.generateSubsectionTitle(sectionId, subsectionId);
  }, [editor.generateSubsectionTitle]);

  const handleAddSubsectionWithAI = useCallback(async (
    sectionId:    string,
    description?: string,
  ) => {
    await editor.generateSubsectionWithAI(sectionId, description);
  }, [editor.generateSubsectionWithAI]);

  const handleSaveCurrentVersion = useCallback(async (label: string) => {
    await editor.saveVersion(label);
    Alert.alert('Snapshot Saved', 'Your current paper has been saved as a version snapshot.');
  }, [editor.saveVersion]);

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    await editor.saveVersion(
      `Before Restore · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    );
    const result = await versions.restore(versionId);
    if (result) {
      editor.applyRestore(result.sections, result.abstract, result.wordCount);
      setShowVersions(false);
      Alert.alert('✅ Restored', 'The version has been restored. Your previous state was saved as a snapshot.');
    }
  }, [editor, versions]);

  // ── Version rename handler ────────────────────────────────────────────────
  const handleRenameVersion = useCallback(async (
    versionId: string,
    newLabel:  string,
  ): Promise<boolean> => {
    return await versions.rename(versionId, newLabel);
  }, [versions.rename]);

  // ── Version delete handler ────────────────────────────────────────────────
  const handleDeleteVersion = useCallback(async (
    versionId: string,
  ): Promise<boolean> => {
    return await versions.deleteVersion(versionId);
  }, [versions.deleteVersion]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) return <LoadingOverlay visible message="Loading paper editor…" />;

  if (loadError || !paper) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={52} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginTop: SPACING.md, textAlign: 'center' }}>
            Could Not Load Paper
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 }}>
            {loadError ?? 'Paper not found.'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12 }}
          >
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

        {/* ── Toolbar ── */}
        <PaperEditorToolbar
          title={paper.title}
          isDirty={editor.isDirty}
          isSaving={editor.isSaving}
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

        {/* ── Error banner ── */}
        {editor.error && (
          <Animated.View entering={FadeInDown.duration(300)} style={{
            flexDirection:    'row',
            alignItems:       'center',
            gap:              8,
            backgroundColor:  `${COLORS.error}12`,
            paddingHorizontal: SPACING.lg,
            paddingVertical:  SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: `${COLORS.error}25`,
          }}>
            <Ionicons name="alert-circle-outline" size={15} color={COLORS.error} />
            <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }} numberOfLines={2}>
              {editor.error}
            </Text>
            <Pressable onPress={editor.clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={COLORS.error} />
            </Pressable>
          </Animated.View>
        )}

        {/* ── AI processing banner ── */}
        {editor.isAIProcessing && (
          <View style={{
            flexDirection:    'row',
            alignItems:       'center',
            gap:              8,
            backgroundColor:  `${COLORS.primary}15`,
            paddingHorizontal: SPACING.lg,
            paddingVertical:  10,
            borderBottomWidth: 1,
            borderBottomColor: `${COLORS.primary}25`,
          }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 }}>
              {editor.aiProcessingLabel || 'AI is processing…'}
            </Text>
          </View>
        )}

        {/* ── Stats strip ── */}
        <View style={{
          flexDirection:     'row',
          alignItems:        'center',
          justifyContent:    'space-between',
          paddingHorizontal:  SPACING.lg,
          paddingVertical:    8,
          borderBottomWidth:  1,
          borderBottomColor:  COLORS.border,
          backgroundColor:    COLORS.backgroundCard,
          minHeight:          38,
          gap:                SPACING.sm,
        }}>
          <View style={{ flexShrink: 1, flexGrow: 0, maxWidth: '45%' }}>
            <WordCountBadge
              sectionType="introduction"
              wordCount={editor.totalWordCount}
              compact={false}
            />
          </View>

          <View style={{
            flexDirection: 'row',
            alignItems:    'center',
            gap:           6,
            flexShrink:    1,
            overflow:      'hidden',
          }}>
            <View style={{
              flexDirection:     'row',
              alignItems:        'center',
              gap:               4,
              flexShrink:        1,
              backgroundColor:   `${COLORS.primary}10`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 8,
              paddingVertical:   4,
              borderWidth:       1,
              borderColor:       `${COLORS.primary}20`,
            }}>
              <Ionicons name="school-outline" size={11} color={COLORS.textMuted} />
              <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 1 }}>
                {editor.citationStyle.toUpperCase()} · {paper.sections.length} sec
              </Text>
            </View>

            <View style={{
              flexDirection:     'row',
              alignItems:        'center',
              gap:               4,
              flexShrink:        1,
              backgroundColor:   `${COLORS.warning}10`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 8,
              paddingVertical:   4,
              borderWidth:       1,
              borderColor:       `${COLORS.warning}20`,
            }}>
              <Ionicons name="link-outline" size={11} color={COLORS.textMuted} />
              <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 1 }}>
                {citMan.citations.length} cite{citMan.citations.length !== 1 ? 's' : ''}
                {citMan.isSaving ? ' · saving…' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Section cards ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Abstract first */}
          {editor.sections
            .filter(s => s.type === 'abstract')
            .map((section, i) => (
              <PaperSectionEditor
                key={section.id}
                section={section}
                index={i}
                isAIProcessing={editor.isAIProcessing && aiSectionId === section.id}
                aiProcessingLabel={editor.aiProcessingLabel}
                onUpdateContent={content => editor.updateSectionContent(section.id, content)}
                onAddSubsection={() => editor.addSubsection(section.id)}
                onAddSubsectionWithAI={(desc) => handleAddSubsectionWithAI(section.id, desc)}
                onUpdateSubsection={(subId, field, value) =>
                  editor.updateSubsection(section.id, subId, field, value)}
                onRemoveSubsection={subId => editor.removeSubsection(section.id, subId)}
                onMoveSubUp={subId => editor.moveSubsectionUp(section.id, subId)}
                onMoveSubDown={subId => editor.moveSubsectionDown(section.id, subId)}
                onOpenAITools={(subsectionId) => handleOpenAI(section.id, subsectionId)}
                onGenerateSubsectionTitle={(subId) =>
                  handleGenerateSubsectionTitle(section.id, subId)}
              />
            ))
          }

          {/* All other sections */}
          {editor.sections
            .filter(s => s.type !== 'abstract')
            .map((section, i) => (
              <PaperSectionEditor
                key={section.id}
                section={section}
                index={i + 1}
                isAIProcessing={editor.isAIProcessing && aiSectionId === section.id}
                aiProcessingLabel={editor.aiProcessingLabel}
                onUpdateContent={content => editor.updateSectionContent(section.id, content)}
                onAddSubsection={() => editor.addSubsection(section.id)}
                onAddSubsectionWithAI={(desc) => handleAddSubsectionWithAI(section.id, desc)}
                onUpdateSubsection={(subId, field, value) =>
                  editor.updateSubsection(section.id, subId, field, value)}
                onRemoveSubsection={subId => editor.removeSubsection(section.id, subId)}
                onMoveSubUp={subId => editor.moveSubsectionUp(section.id, subId)}
                onMoveSubDown={subId => editor.moveSubsectionDown(section.id, subId)}
                onOpenAITools={(subsectionId) => handleOpenAI(section.id, subsectionId)}
                onGenerateSubsectionTitle={(subId) =>
                  handleGenerateSubsectionTitle(section.id, subId)}
              />
            ))
          }

          <View style={{ alignItems: 'center', paddingTop: SPACING.md, gap: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16 }}>
              Changes auto-save every 1.5s · Citations auto-update References section{'\n'}
              Tap ✦ on any section or subsection to run AI writing tools{'\n'}
              Tap T on a subsection to generate an AI title (1 cr)
            </Text>
          </View>
        </ScrollView>

        {/* ══════════════════════════════════════════════════════════════════
            MODALS
        ══════════════════════════════════════════════════════════════════ */}

        {/* AI Tool Panel */}
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

        {/* Version History */}
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

        {/* Citation Manager */}
        <CitationManagerModal
          visible={showCitations}
          citations={citMan.citations}
          formattedCitations={citMan.formattedCitations}
          citationStyle={citMan.citationStyle}
          isImporting={citMan.isImporting}
          importError={citMan.importError}
          paperTopic={paperTopic}
          onClose={() => setShowCitations(false)}
          onStyleChange={style => {
            citMan.setCitationStyle(style);
            editor.changeCitationStyle(style);
          }}
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

        {/* Export */}
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