// src/hooks/usePaperEditor.ts
// Part 38 — Main paper editor hook.
// Part 38b/c/d — subsection AI, FIX refs rebuild, stale-closure fixes.
// Part 41.8 — Section management (add/remove/reorder/AI-generate).
//
// Part 41.8 FIXES (this file):
//   FIX Problem 4 — addSection, addSectionWithAI, removeSection now each call
//                   createPaperVersion BEFORE mutating state, so every structural
//                   change is restorable from the version history panel.
//   FIX Problem 5 — removeSection now allows deletion of ALL sections EXCEPT
//                   'abstract'. The old CANONICAL_SECTION_TYPES guard is removed;
//                   only the abstract is protected because its content is stored
//                   in a separate DB column and cannot be reconstructed from sections.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';

import { useAuth }    from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import {
  savePaperEdits,
  saveCitationStyle,
  createPaperVersion,
  incrementPaperAIEdits,
} from '../services/paperEditorService';
import {
  runPaperSectionAI,
  runPaperSubsectionAI,
  generateSubsectionTitleAI,
  generateSubsectionBodyAI,
  generateFullSectionAI,
} from '../services/agents/paperSectionAgent';
import { buildReferencesContent } from './useCitationManager';

import type {
  AcademicPaper,
  AcademicSection,
  AcademicSubsection,
  AcademicCitationStyle,
  Citation,
} from '../types';
import type { CreditFeature } from '../types/credits';
import type {
  PaperAITool,
  SectionInsertPosition,
  NewSectionConfig,
  GeneratedSectionOutput,
} from '../types/paperEditor';
import { PAPER_AI_TOOL_LABELS } from '../types/paperEditor';
import {
  MAX_UNDO_STEPS,
  AUTO_SAVE_DEBOUNCE_MS,
} from '../constants/paperEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeTotalWords(sections: AcademicSection[], abstract: string): number {
  return countWords(abstract) + sections.reduce((sum, s) =>
    sum + countWords(s.content) +
    (s.subsections ?? []).reduce((a, sub) => a + countWords(sub.content), 0), 0);
}

function deepCopySections(sections: AcademicSection[]): AcademicSection[] {
  return JSON.parse(JSON.stringify(sections));
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toolToCreditFeature(tool: PaperAITool): CreditFeature {
  switch (tool) {
    case 'expand':              return 'paper_ai_expand';
    case 'shorten':             return 'paper_ai_shorten';
    case 'formalize':           return 'paper_ai_formalize';
    case 'fix_citations':       return 'paper_ai_fix_citations';
    case 'add_counterargument': return 'paper_ai_counterargument';
    case 'regenerate':          return 'paper_ai_regenerate';
    case 'generate_section':    return 'paper_ai_generate_section';
  }
}

function insertSectionAt(
  sections:   AcademicSection[],
  newSection: AcademicSection,
  position:   SectionInsertPosition,
): AcademicSection[] {
  const arr = [...sections];
  if (position.where === 'start')  return [newSection, ...arr];
  if (position.where === 'end')    return [...arr, newSection];

  const targetIdx = arr.findIndex(s => s.id === position.targetSectionId);
  if (targetIdx === -1)            return [...arr, newSection];

  arr.splice(position.where === 'before' ? targetIdx : targetIdx + 1, 0, newSection);
  return arr;
}

interface EditorSnapshot { sections: AcademicSection[]; abstract: string; }

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UsePaperEditorReturn {
  sections:          AcademicSection[];
  abstract:          string;
  citationStyle:     AcademicCitationStyle;
  totalWordCount:    number;
  isDirty:           boolean;
  isSaving:          boolean;
  lastSavedAt:       number | null;
  canUndo:           boolean;
  canRedo:           boolean;
  isAIProcessing:    boolean;
  aiProcessingLabel: string;
  error:             string | null;
  versionSavedCount: number;

  updateSectionContent:      (sectionId: string, content: string) => void;
  updateAbstract:            (text: string) => void;
  addSubsection:             (sectionId: string) => void;
  updateSubsection:          (sectionId: string, subId: string, field: 'title' | 'content', value: string) => void;
  removeSubsection:          (sectionId: string, subId: string) => void;
  moveSubsectionUp:          (sectionId: string, subId: string) => void;
  moveSubsectionDown:        (sectionId: string, subId: string) => void;
  updateReferencesSection:   (content: string) => void;
  updateCitations:           (citations: Citation[], style: AcademicCitationStyle) => void;

  // Section management (Part 41.8)
  addSection:          (config: NewSectionConfig, position: SectionInsertPosition) => AcademicSection;
  addSectionWithAI:    (config: NewSectionConfig, position: SectionInsertPosition) => Promise<AcademicSection | null>;
  removeSection:       (sectionId: string) => boolean;           // FIX P5: no canonical guard
  moveSectionUp:       (sectionId: string) => void;
  moveSectionDown:     (sectionId: string) => void;
  renameSectionTitle:  (sectionId: string, title: string) => void;

  changeCitationStyle:       (style: AcademicCitationStyle) => Promise<void>;
  undo:                      () => void;
  redo:                      () => void;
  saveNow:                   () => Promise<void>;
  saveVersion:               (label: string) => Promise<void>;
  runAITool:                 (tool: PaperAITool, sectionId: string, subsectionId?: string) => Promise<void>;
  generateSubsectionTitle:   (sectionId: string, subsectionId: string) => Promise<void>;
  generateSubsectionWithAI:  (sectionId: string, description?: string) => Promise<AcademicSubsection | null>;
  applyRestore:              (sections: AcademicSection[], abstract: string, wordCount: number) => void;
  clearError:                () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePaperEditor(paper: AcademicPaper | null): UsePaperEditorReturn {
  const { user }    = useAuth();
  const { consume } = useCredits();

  const [sections,          setSections]         = useState<AcademicSection[]>(paper?.sections ?? []);
  const [abstract,          setAbstract]         = useState<string>(paper?.abstract ?? '');
  const [citationStyle,     setCitationStyle]     = useState<AcademicCitationStyle>(paper?.citationStyle ?? 'apa');
  const [isDirty,           setIsDirty]           = useState(false);
  const [isSaving,          setIsSaving]          = useState(false);
  const [lastSavedAt,       setLastSavedAt]       = useState<number | null>(null);
  const [isAIProcessing,    setIsAIProcessing]    = useState(false);
  const [aiProcessingLabel, setAIProcessingLabel] = useState('');
  const [error,             setError]             = useState<string | null>(null);
  const [versionSavedCount, setVersionSavedCount] = useState(0);

  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep stable refs for use inside callbacks without stale closure issues
  const sectionsRef = useRef(sections);
  const abstractRef = useRef(abstract);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { abstractRef.current = abstract; }, [abstract]);

  useEffect(() => {
    if (paper) {
      setSections(deepCopySections(paper.sections));
      setAbstract(paper.abstract ?? '');
      setCitationStyle(paper.citationStyle ?? 'apa');
      setIsDirty(false);
      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [paper?.id]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const totalWordCount = computeTotalWords(sections, abstract);

  const pushUndo = useCallback((prev: AcademicSection[], prevAbs: string) => {
    const stack = undoStack.current;
    if (stack.length >= MAX_UNDO_STEPS) stack.shift();
    stack.push({ sections: deepCopySections(prev), abstract: prevAbs });
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const scheduleAutoSave = useCallback((upd: AcademicSection[], updAbs: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!paper || !user) return;
      setIsSaving(true);
      try {
        const wc = computeTotalWords(upd, updAbs);
        await savePaperEdits(paper.id, user.id, upd, updAbs, wc);
        setLastSavedAt(Date.now());
        setIsDirty(false);
      } catch (e) {
        console.warn('[usePaperEditor] auto-save failed:', e);
      } finally {
        setIsSaving(false);
      }
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [paper, user]);

  // ─── Core updates ─────────────────────────────────────────────────────────

  const updateSectionContent = useCallback((sectionId: string, content: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => s.id === sectionId ? { ...s, content } : s);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  const updateAbstract = useCallback((text: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      scheduleAutoSave(prev, text);
      return prev;
    });
    setAbstract(text);
    setIsDirty(true);
  }, [pushUndo, scheduleAutoSave]);

  const updateReferencesSection = useCallback((content: string) => {
    setSections(prev => {
      const updated = prev.map(s => s.type === 'references' ? { ...s, content } : s);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [scheduleAutoSave]);

  const updateCitations = useCallback((citations: Citation[], style: AcademicCitationStyle) => {
    const refsContent = buildReferencesContent(citations, style);
    setSections(prev => {
      const updated = prev.map(s => s.type === 'references' ? { ...s, content: refsContent } : s);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [scheduleAutoSave]);

  // ─── Subsection CRUD ──────────────────────────────────────────────────────

  const addSubsection = useCallback((sectionId: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const newSub: AcademicSubsection = { id: newId('sub'), title: 'New Subsection', content: '' };
        return { ...s, subsections: [...(s.subsections ?? []), newSub] };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  const updateSubsection = useCallback((sectionId: string, subId: string, field: 'title' | 'content', value: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, subsections: (s.subsections ?? []).map(sub => sub.id === subId ? { ...sub, [field]: value } : sub) };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  const removeSubsection = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, subsections: (s.subsections ?? []).filter(sub => sub.id !== subId) };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  const moveSubsectionUp = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const subs = [...(s.subsections ?? [])];
        const idx  = subs.findIndex(sub => sub.id === subId);
        if (idx <= 0) return s;
        [subs[idx - 1], subs[idx]] = [subs[idx], subs[idx - 1]];
        return { ...s, subsections: subs };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  const moveSubsectionDown = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const subs = [...(s.subsections ?? [])];
        const idx  = subs.findIndex(sub => sub.id === subId);
        if (idx < 0 || idx >= subs.length - 1) return s;
        [subs[idx], subs[idx + 1]] = [subs[idx + 1], subs[idx]];
        return { ...s, subsections: subs };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  // ─── Part 41.8: Section management ───────────────────────────────────────

  /**
   * Add a new blank section manually.
   * FIX P4: saves a version snapshot before mutating.
   */
  const addSection = useCallback((
    config:   NewSectionConfig,
    position: SectionInsertPosition,
  ): AcademicSection => {
    const newSection: AcademicSection = {
      id:          newId('sec'),
      type:        config.type || 'custom',
      title:       config.title || 'New Section',
      content:     '',
      subsections: [],
    };

    // FIX P4: Save a version before adding so it's restorable
    if (paper && user) {
      const wc = computeTotalWords(sectionsRef.current, abstractRef.current);
      createPaperVersion(
        paper.id, user.id,
        `Before adding "${newSection.title}"`,
        sectionsRef.current, abstractRef.current, wc,
      ).then(() => setVersionSavedCount(c => c + 1));
    }

    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = insertSectionAt(prev, newSection, position);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });

    return newSection;
  }, [paper, user, pushUndo, scheduleAutoSave]);

  /**
   * AI-generate a full section and insert it.
   * FIX P4: saves a version snapshot before inserting.
   * Costs 4 credits.
   */
  const addSectionWithAI = useCallback(async (
    config:   NewSectionConfig,
    position: SectionInsertPosition,
  ): Promise<AcademicSection | null> => {
    if (!paper || !user || isAIProcessing) return null;

    const creditOk = await consume('paper_ai_generate_section');
    if (!creditOk) {
      setError('Not enough credits to generate a section. You need 4 credits.');
      return null;
    }

    setIsAIProcessing(true);
    setAIProcessingLabel(`Generating "${config.title || config.type}" section…`);
    setError(null);

    try {
      const result = await generateFullSectionAI(
        config.type,
        config.title,
        config.description,
        paper.citations ?? [],
        citationStyle,
        paper.title,
        paper.keywords ?? [],
        sectionsRef.current,
      );

      if (!result?.title?.trim() || !result?.content?.trim()) {
        throw new Error('AI returned an incomplete section. Please try again.');
      }

      const newSection: AcademicSection = {
        id:    newId('sec'),
        type:  result.type || config.type,
        title: result.title.trim(),
        content: result.content.trim(),
        subsections: result.subsections.map(sub => ({
          id:      newId('sub'),
          title:   sub.title.trim(),
          content: sub.content.trim(),
        })),
      };

      // FIX P4: Save a named version snapshot before inserting
      const wc = computeTotalWords(sectionsRef.current, abstractRef.current);
      await createPaperVersion(
        paper.id, user.id,
        `Before AI section "${newSection.title}"`,
        sectionsRef.current, abstractRef.current, wc,
      );
      setVersionSavedCount(c => c + 1);

      setSections(prev => {
        pushUndo(prev, abstractRef.current);
        const updated = insertSectionAt(prev, newSection, position);
        setIsDirty(true);
        scheduleAutoSave(updated, abstractRef.current);
        return updated;
      });

      incrementPaperAIEdits(paper.id, user.id);
      return newSection;

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate section.';
      setError(msg);
      Alert.alert('AI Error', msg);
      return null;
    } finally {
      setIsAIProcessing(false);
      setAIProcessingLabel('');
    }
  }, [paper, user, isAIProcessing, citationStyle, consume, pushUndo, scheduleAutoSave]);

  /**
   * Remove a section by ID.
   * FIX P5: Only 'abstract' is protected. All other sections including
   *         introduction, literature_review, methodology, findings,
   *         conclusion, and references can be deleted.
   * FIX P4: Saves a named version before deleting so the section is restorable.
   */
  const removeSection = useCallback((sectionId: string): boolean => {
    const currentSections = sectionsRef.current;
    const section = currentSections.find(s => s.id === sectionId);
    if (!section) return false;

    // FIX P5: only protect abstract
    if (section.type === 'abstract') {
      Alert.alert(
        'Cannot Remove Abstract',
        'The Abstract section cannot be removed because its content is stored separately and required for all exports and the academic paper viewer.',
        [{ text: 'OK' }],
      );
      return false;
    }

    // FIX P4: Save a named version before deleting
    if (paper && user) {
      const wc = computeTotalWords(currentSections, abstractRef.current);
      createPaperVersion(
        paper.id, user.id,
        `Before deleting "${section.title}"`,
        currentSections, abstractRef.current, wc,
      ).then(() => setVersionSavedCount(c => c + 1));
    }

    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.filter(s => s.id !== sectionId);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
    return true;
  }, [paper, user, pushUndo, scheduleAutoSave]);

  /**
   * Move a section up (swap with the previous section).
   * Abstract stays first; no other pinning constraints (FIX P5 logic).
   */
  const moveSectionUp = useCallback((sectionId: string) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId);
      if (idx <= 0) return prev;
      // Don't move above abstract
      if (prev[idx - 1]?.type === 'abstract') return prev;

      pushUndo(prev, abstractRef.current);
      const updated = [...prev];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  /**
   * Move a section down (swap with the next section).
   */
  const moveSectionDown = useCallback((sectionId: string) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId);
      if (idx < 0 || idx >= prev.length - 1) return prev;

      pushUndo(prev, abstractRef.current);
      const updated = [...prev];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  /**
   * Rename any section's display title.
   */
  const renameSectionTitle = useCallback((sectionId: string, title: string) => {
    if (!title.trim()) return;
    setSections(prev => {
      pushUndo(prev, abstractRef.current);
      const updated = prev.map(s => s.id === sectionId ? { ...s, title: title.trim() } : s);
      setIsDirty(true);
      scheduleAutoSave(updated, abstractRef.current);
      return updated;
    });
  }, [pushUndo, scheduleAutoSave]);

  // ─── Citation style ───────────────────────────────────────────────────────

  const changeCitationStyle = useCallback(async (style: AcademicCitationStyle) => {
    if (!paper || !user) return;
    setCitationStyle(style);
    try { await saveCitationStyle(paper.id, user.id, style); } catch { }
  }, [paper, user]);

  // ─── Undo / Redo ──────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    const stack = undoStack.current;
    if (!stack.length) return;
    const snap = stack.pop()!;
    redoStack.current.push({ sections: deepCopySections(sections), abstract });
    setSections(deepCopySections(snap.sections));
    setAbstract(snap.abstract);
    setIsDirty(true);
    setCanUndo(stack.length > 0);
    setCanRedo(true);
    scheduleAutoSave(snap.sections, snap.abstract);
  }, [sections, abstract, scheduleAutoSave]);

  const redo = useCallback(() => {
    const stack = redoStack.current;
    if (!stack.length) return;
    const snap = stack.pop()!;
    undoStack.current.push({ sections: deepCopySections(sections), abstract });
    setSections(deepCopySections(snap.sections));
    setAbstract(snap.abstract);
    setIsDirty(true);
    setCanUndo(true);
    setCanRedo(stack.length > 0);
    scheduleAutoSave(snap.sections, snap.abstract);
  }, [sections, abstract, scheduleAutoSave]);

  // ─── Manual save ─────────────────────────────────────────────────────────

  const saveNow = useCallback(async () => {
    if (!paper || !user || isSaving) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setIsSaving(true);
    try {
      const wc = computeTotalWords(sections, abstract);
      const ok = await savePaperEdits(paper.id, user.id, sections, abstract, wc);
      if (ok) { setLastSavedAt(Date.now()); setIsDirty(false); }
    } catch (e) {
      console.error('[usePaperEditor] saveNow error:', e);
    } finally {
      setIsSaving(false);
    }
  }, [paper, user, sections, abstract, isSaving]);

  // ─── Version snapshot ─────────────────────────────────────────────────────

  const saveVersion = useCallback(async (label: string) => {
    if (!paper || !user) return;
    try {
      const wc = computeTotalWords(sections, abstract);
      await createPaperVersion(paper.id, user.id, label, sections, abstract, wc);
      setVersionSavedCount(c => c + 1);
    } catch (e) {
      console.warn('[usePaperEditor] saveVersion error:', e);
    }
  }, [paper, user, sections, abstract]);

  // ─── AI Tool ─────────────────────────────────────────────────────────────

  const runAITool = useCallback(async (
    tool:          PaperAITool,
    sectionId:     string,
    subsectionId?: string,
  ) => {
    if (!paper || !user || isAIProcessing) return;

    const section   = sections.find(s => s.id === sectionId);
    if (!section) { setError('Section not found.'); return; }

    let targetSub: AcademicSubsection | null = null;
    if (subsectionId) {
      targetSub = (section.subsections ?? []).find(s => s.id === subsectionId) ?? null;
      if (!targetSub) { setError('Subsection not found.'); return; }
    }

    const label         = PAPER_AI_TOOL_LABELS[tool];
    const contextLabel  = targetSub
      ? `${label} — ${section.title} › ${targetSub.title}`
      : `${label} — ${section.title}`;
    const creditFeature = toolToCreditFeature(tool);
    const creditOk      = await consume(creditFeature);
    if (!creditOk) { setError(`Not enough credits to use "${label}".`); return; }

    const wc = computeTotalWords(sections, abstract);
    await createPaperVersion(
      paper.id, user.id,
      `Before ${label}${targetSub ? ' (subsection)' : ''} — ${section.title}`,
      sections, abstract, wc,
    );
    setVersionSavedCount(c => c + 1);

    setIsAIProcessing(true);
    setAIProcessingLabel(`${contextLabel}…`);
    setError(null);

    try {
      let newContent: string;
      if (targetSub) {
        newContent = await runPaperSubsectionAI(
          tool, targetSub, section,
          paper.citations ?? [], citationStyle,
          paper.title, paper.keywords ?? [],
        );
      } else {
        newContent = await runPaperSectionAI(
          tool, section,
          paper.citations ?? [], citationStyle,
          paper.title, paper.keywords ?? [],
        );
      }

      if (!newContent?.trim()) throw new Error('AI returned empty content.');

      pushUndo(sections, abstract);

      if (targetSub) {
        setSections(prev => prev.map(s => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            subsections: (s.subsections ?? []).map(sub =>
              sub.id === subsectionId ? { ...sub, content: newContent.trim() } : sub
            ),
          };
        }));
      } else {
        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, content: newContent.trim() } : s
        ));
      }

      setIsDirty(true);
      setSections(upd => { scheduleAutoSave(upd, abstractRef.current); return upd; });
      incrementPaperAIEdits(paper.id, user.id);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI processing failed.';
      setError(msg);
      Alert.alert('AI Error', msg);
    } finally {
      setIsAIProcessing(false);
      setAIProcessingLabel('');
    }
  }, [paper, user, isAIProcessing, sections, abstract, citationStyle, consume, pushUndo, scheduleAutoSave]);

  // ─── Generate subsection title ────────────────────────────────────────────

  const generateSubsectionTitle = useCallback(async (sectionId: string, subsectionId: string) => {
    if (!paper || !user || isAIProcessing) return;
    const section = sections.find(s => s.id === sectionId);
    const sub     = (section?.subsections ?? []).find(s => s.id === subsectionId);
    if (!section || !sub) { setError('Subsection not found.'); return; }

    const creditOk = await consume('paper_ai_subtitle');
    if (!creditOk) { setError('Not enough credits to generate a title.'); return; }

    setIsAIProcessing(true);
    setAIProcessingLabel('Generating subsection title…');
    setError(null);

    try {
      const newTitle = await generateSubsectionTitleAI(sub.content, section.title, section.type);
      if (!newTitle?.trim()) throw new Error('AI returned empty title.');

      pushUndo(sections, abstract);
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          subsections: (s.subsections ?? []).map(sub =>
            sub.id === subsectionId ? { ...sub, title: newTitle.trim() } : sub
          ),
        };
      }));
      setIsDirty(true);
      setSections(upd => { scheduleAutoSave(upd, abstractRef.current); return upd; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate title.');
    } finally {
      setIsAIProcessing(false);
      setAIProcessingLabel('');
    }
  }, [paper, user, isAIProcessing, sections, abstract, consume, pushUndo, scheduleAutoSave]);

  // ─── Generate full subsection (title + body) ──────────────────────────────

  const generateSubsectionWithAI = useCallback(async (
    sectionId:    string,
    description?: string,
  ): Promise<AcademicSubsection | null> => {
    if (!paper || !user || isAIProcessing) return null;
    const section = sections.find(s => s.id === sectionId);
    if (!section) { setError('Section not found.'); return null; }

    const creditOk = await consume('paper_ai_expand');
    if (!creditOk) { setError('Not enough credits to generate a subsection.'); return null; }

    setIsAIProcessing(true);
    setAIProcessingLabel('Generating subsection…');
    setError(null);

    try {
      const result = await generateSubsectionBodyAI(
        section, paper.citations ?? [], citationStyle,
        paper.title, paper.keywords ?? [], description,
      );

      if (!result?.title?.trim() || !result?.content?.trim()) {
        throw new Error('AI returned incomplete subsection.');
      }

      const newSub: AcademicSubsection = {
        id:      newId('sub'),
        title:   result.title.trim(),
        content: result.content.trim(),
      };

      pushUndo(sections, abstract);
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, subsections: [...(s.subsections ?? []), newSub] };
      }));
      setIsDirty(true);
      setSections(upd => { scheduleAutoSave(upd, abstractRef.current); return upd; });
      incrementPaperAIEdits(paper.id, user.id);
      setVersionSavedCount(c => c + 1);
      return newSub;

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate subsection.';
      setError(msg);
      Alert.alert('AI Error', msg);
      return null;
    } finally {
      setIsAIProcessing(false);
      setAIProcessingLabel('');
    }
  }, [paper, user, isAIProcessing, sections, abstract, citationStyle, consume, pushUndo, scheduleAutoSave]);

  // ─── Apply restore ────────────────────────────────────────────────────────

  const applyRestore = useCallback((
    restoredSections: AcademicSection[],
    restoredAbstract: string,
    wordCount:        number,
  ) => {
    pushUndo(sections, abstract);
    setSections(deepCopySections(restoredSections));
    setAbstract(restoredAbstract);
    setIsDirty(true);
    scheduleAutoSave(restoredSections, restoredAbstract);
  }, [sections, abstract, pushUndo, scheduleAutoSave]);

  const clearError = useCallback(() => setError(null), []);

  return {
    sections, abstract, citationStyle, totalWordCount,
    isDirty, isSaving, lastSavedAt,
    canUndo, canRedo,
    isAIProcessing, aiProcessingLabel,
    error, versionSavedCount,

    updateSectionContent, updateAbstract,
    addSubsection, updateSubsection, removeSubsection,
    moveSubsectionUp, moveSubsectionDown,
    updateReferencesSection, updateCitations,

    addSection, addSectionWithAI, removeSection,
    moveSectionUp, moveSectionDown, renameSectionTitle,

    changeCitationStyle,
    undo, redo, saveNow, saveVersion,
    runAITool, generateSubsectionTitle, generateSubsectionWithAI,
    applyRestore, clearError,
  };
}