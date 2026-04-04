// src/hooks/usePaperEditor.ts
// Part 38 — Main paper editor hook.
// Part 38b — versionSavedCount, subsection AI, paper_ai_* credits.
// Part 38c FIXES:
//   FIX #2 — updateReferencesSection(content): finds the references section
//             by type and updates its content so Citation Manager changes
//             appear live in the paper without a reload.
//   FIX #2 — updateCitations(citations, style): combined action used by
//             paper-editor.tsx onCitationsChange callback; updates both the
//             internal citations ref AND rebuilds the references section.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useCallback, useRef, useEffect,
} from 'react';
import { Alert } from 'react-native';

import { useAuth }       from '../context/AuthContext';
import { useCredits }    from '../context/CreditsContext';
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
import type { PaperAITool }   from '../types/paperEditor';
import {
  PAPER_AI_TOOL_LABELS,
} from '../types/paperEditor';
import {
  MAX_UNDO_STEPS,
  AUTO_SAVE_DEBOUNCE_MS,
} from '../constants/paperEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeTotalWords(sections: AcademicSection[], abstract: string): number {
  return countWords(abstract) + sections.reduce((sum, s) => {
    return sum + countWords(s.content) +
      (s.subsections ?? []).reduce((a, sub) => a + countWords(sub.content), 0);
  }, 0);
}

function deepCopySections(sections: AcademicSection[]): AcademicSection[] {
  return JSON.parse(JSON.stringify(sections));
}

function toolToCreditFeature(tool: PaperAITool): CreditFeature {
  switch (tool) {
    case 'expand':              return 'paper_ai_expand';
    case 'shorten':             return 'paper_ai_shorten';
    case 'formalize':           return 'paper_ai_formalize';
    case 'fix_citations':       return 'paper_ai_fix_citations';
    case 'add_counterargument': return 'paper_ai_counterargument';
    case 'regenerate':          return 'paper_ai_regenerate';
  }
}

interface EditorSnapshot {
  sections: AcademicSection[];
  abstract: string;
}

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

  updateSectionContent:       (sectionId: string, content: string) => void;
  updateAbstract:             (text: string) => void;
  addSubsection:              (sectionId: string) => void;
  updateSubsection:           (sectionId: string, subId: string, field: 'title' | 'content', value: string) => void;
  removeSubsection:           (sectionId: string, subId: string) => void;
  moveSubsectionUp:           (sectionId: string, subId: string) => void;
  moveSubsectionDown:         (sectionId: string, subId: string) => void;
  /** FIX #2: Update the references section content (called by citation manager) */
  updateReferencesSection:    (content: string) => void;
  /** FIX #2: Combined update — rebuilds references section from new citations */
  updateCitations:            (citations: Citation[], style: AcademicCitationStyle) => void;

  changeCitationStyle:        (style: AcademicCitationStyle) => Promise<void>;
  undo:                       () => void;
  redo:                       () => void;
  saveNow:                    () => Promise<void>;
  saveVersion:                (label: string) => Promise<void>;
  runAITool:                  (tool: PaperAITool, sectionId: string, subsectionId?: string) => Promise<void>;
  generateSubsectionTitle:    (sectionId: string, subsectionId: string) => Promise<void>;
  generateSubsectionWithAI:   (sectionId: string, description?: string) => Promise<AcademicSubsection | null>;
  applyRestore:               (sections: AcademicSection[], abstract: string, wordCount: number) => void;
  clearError:                 () => void;
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

  const scheduleAutoSave = useCallback((
    upd:    AcademicSection[],
    updAbs: string,
  ) => {
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
      pushUndo(prev, abstract);
      const updated = prev.map(s => s.id === sectionId ? { ...s, content } : s);
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  const updateAbstract = useCallback((text: string) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      setAbstract(text);
      setIsDirty(true);
      scheduleAutoSave(prev, text);
      return prev;
    });
    setAbstract(text);
  }, [abstract, pushUndo, scheduleAutoSave]);

  // FIX #2: Update references section by type (no undo push — non-destructive)
  const updateReferencesSection = useCallback((content: string) => {
    setSections(prev => {
      const updated = prev.map(s =>
        s.type === 'references' ? { ...s, content } : s
      );
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, scheduleAutoSave]);

  // FIX #2: Called by paper-editor onCitationsChange — rebuilds references text
  const updateCitations = useCallback((citations: Citation[], style: AcademicCitationStyle) => {
    const refsContent = buildReferencesContent(citations, style);
    setSections(prev => {
      const updated = prev.map(s =>
        s.type === 'references' ? { ...s, content: refsContent } : s
      );
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, scheduleAutoSave]);

  // ─── Subsection CRUD ──────────────────────────────────────────────────────

  const addSubsection = useCallback((sectionId: string) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const newSub: AcademicSubsection = {
          id:      `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title:   'New Subsection',
          content: '',
        };
        return { ...s, subsections: [...(s.subsections ?? []), newSub] };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  const updateSubsection = useCallback((
    sectionId: string,
    subId:     string,
    field:     'title' | 'content',
    value:     string,
  ) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          subsections: (s.subsections ?? []).map(sub =>
            sub.id === subId ? { ...sub, [field]: value } : sub
          ),
        };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  const removeSubsection = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, subsections: (s.subsections ?? []).filter(sub => sub.id !== subId) };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  const moveSubsectionUp = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const subs = [...(s.subsections ?? [])];
        const idx  = subs.findIndex(sub => sub.id === subId);
        if (idx <= 0) return s;
        [subs[idx - 1], subs[idx]] = [subs[idx], subs[idx - 1]];
        return { ...s, subsections: subs };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  const moveSubsectionDown = useCallback((sectionId: string, subId: string) => {
    setSections(prev => {
      pushUndo(prev, abstract);
      const updated = prev.map(s => {
        if (s.id !== sectionId) return s;
        const subs = [...(s.subsections ?? [])];
        const idx  = subs.findIndex(sub => sub.id === subId);
        if (idx < 0 || idx >= subs.length - 1) return s;
        [subs[idx], subs[idx + 1]] = [subs[idx + 1], subs[idx]];
        return { ...s, subsections: subs };
      });
      setIsDirty(true);
      scheduleAutoSave(updated, abstract);
      return updated;
    });
  }, [abstract, pushUndo, scheduleAutoSave]);

  // ─── Citation style ───────────────────────────────────────────────────────

  const changeCitationStyle = useCallback(async (style: AcademicCitationStyle) => {
    if (!paper || !user) return;
    setCitationStyle(style);
    try { await saveCitationStyle(paper.id, user.id, style); } catch { /* non-fatal */ }
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

    const section    = sections.find(s => s.id === sectionId);
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

    if (!creditOk) {
      setError(`Not enough credits to use "${label}".`);
      return;
    }

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
      setSections(upd => { scheduleAutoSave(upd, abstract); return upd; });
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

  const generateSubsectionTitle = useCallback(async (
    sectionId:    string,
    subsectionId: string,
  ) => {
    if (!paper || !user || isAIProcessing) return;
    const section = sections.find(s => s.id === sectionId);
    const sub     = (section?.subsections ?? []).find(s => s.id === subsectionId);
    if (!section || !sub) { setError('Subsection not found.'); return; }

    const creditOk = await consume('paper_ai_subtitle');
    if (!creditOk) {
      setError('Not enough credits to generate a title.');
      return;
    }

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
      setSections(upd => { scheduleAutoSave(upd, abstract); return upd; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate title.';
      setError(msg);
    } finally {
      setIsAIProcessing(false);
      setAIProcessingLabel('');
    }
  }, [paper, user, isAIProcessing, sections, abstract, consume, pushUndo, scheduleAutoSave]);

  // ─── FIX #5: Generate full subsection (title + body) via AI ──────────────

  const generateSubsectionWithAI = useCallback(async (
    sectionId:    string,
    description?: string,
  ): Promise<AcademicSubsection | null> => {
    if (!paper || !user || isAIProcessing) return null;
    const section = sections.find(s => s.id === sectionId);
    if (!section) { setError('Section not found.'); return null; }

    // 2 credits for generating a full subsection
    const creditOk = await consume('paper_ai_expand');
    if (!creditOk) {
      setError('Not enough credits to generate a subsection.');
      return null;
    }

    setIsAIProcessing(true);
    setAIProcessingLabel('Generating subsection…');
    setError(null);

    try {
      const result = await generateSubsectionBodyAI(
        section,
        paper.citations ?? [],
        citationStyle,
        paper.title,
        paper.keywords ?? [],
        description,
      );

      if (!result?.title?.trim() || !result?.content?.trim()) {
        throw new Error('AI returned incomplete subsection.');
      }

      const newSub: AcademicSubsection = {
        id:      `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title:   result.title.trim(),
        content: result.content.trim(),
      };

      pushUndo(sections, abstract);
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        return { ...s, subsections: [...(s.subsections ?? []), newSub] };
      }));
      setIsDirty(true);
      setSections(upd => { scheduleAutoSave(upd, abstract); return upd; });
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
    sections,
    abstract,
    citationStyle,
    totalWordCount,
    isDirty,
    isSaving,
    lastSavedAt,
    canUndo,
    canRedo,
    isAIProcessing,
    aiProcessingLabel,
    error,
    versionSavedCount,

    updateSectionContent,
    updateAbstract,
    addSubsection,
    updateSubsection,
    removeSubsection,
    moveSubsectionUp,
    moveSubsectionDown,
    updateReferencesSection,   // FIX #2
    updateCitations,           // FIX #2

    changeCitationStyle,
    undo,
    redo,
    saveNow,
    saveVersion,
    runAITool,
    generateSubsectionTitle,
    generateSubsectionWithAI,  // FIX #5
    applyRestore,
    clearError,
  };
}