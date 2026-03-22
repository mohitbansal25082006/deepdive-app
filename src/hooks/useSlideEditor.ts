// src/hooks/useSlideEditor.ts
// Part 29 — UPDATED from Part 28
// Changes:
//   1. Added applyTemplate() — replaces ALL slides with template slides
//   2. Added insertTemplate() — inserts template slides after active index
//   3. setTheme() now also persists theme column to Supabase DB so
//      slide-preview's useFocusEffect reads the correct theme on return
//   4. EditorTool type updated — 'blocks' removed, 'template' added
//   5. All Part 28 logic unchanged
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useCallback, useRef, useEffect, useReducer,
} from 'react';
import { Alert } from 'react-native';

import { useAuth }        from '../context/AuthContext';
import { useCredits }     from '../context/CreditsContext';
import { FEATURE_COSTS }  from '../constants/credits';
import {
  loadEditorPresentation,
  saveEditorState,
  toExportSlides,
  applyTemplateToSlides,
  insertTemplateSlidesAtIndex,
  replaceWithTemplateSlides,
  trackTemplateUsage,
} from '../services/slideEditorService';
import {
  rewriteText,
  rewriteBullets     as rewriteBulletsAgent,
  rewriteSingleBullet as rewriteSingleBulletAgent,
  generateSlide      as generateSlideAgent,
  generateSpeakerNotes,
  suggestLayout      as suggestLayoutAgent,
} from '../services/agents/slideEditAgent';
import { getThemeTokens } from '../services/pptxExport';
import { supabase }       from '../lib/supabase';
import {
  EDITOR_CREDIT_COSTS,
  MAX_UNDO_DEPTH,
  FONT_SCALE_STEPS,
  DEFAULT_FONT_SCALE,
  DEFAULT_FONT,
} from '../constants/editor';

import type {
  EditableSlide,
  SlideEditorState,
  EditorPanel,
  EditableFieldKey,
  FieldFormatting,
  TextAlignment,
  AdditionalBlock,
  SpacingLevel,
  FontFamily,
  AIRewriteStyle,
  AIGenerateSlideRequest,
  ColorPickerTarget,
  SlideTemplate,
} from '../types/editor';
import type {
  GeneratedPresentation,
  PresentationTheme,
  SlideLayout,
  ResearchReport,
} from '../types';

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_SLIDES';         payload: EditableSlide[] }
  | { type: 'PATCH_SLIDE';        index: number; patch: Partial<EditableSlide> }
  | { type: 'SET_ACTIVE_IDX';     index: number }
  | { type: 'SET_SELECTED_FIELD'; field: EditableFieldKey | null }
  | { type: 'SET_EDITING_TEXT';   text: string }
  | { type: 'SET_PANEL';          panel: EditorPanel }
  | { type: 'SET_COLOR_TARGET';   target: ColorPickerTarget | null }
  | { type: 'SET_FONT';           font: FontFamily }
  | { type: 'SET_DIRTY';          dirty: boolean }
  | { type: 'SET_SAVING';         saving: boolean }
  | { type: 'SET_SAVE_ERROR';     error: string | null }
  | { type: 'SET_AI_PROCESSING';  processing: boolean; label?: string }
  | { type: 'SET_LAYOUT_SUGGEST'; suggestion: SlideEditorState['layoutSuggestion'] }
  | { type: 'PUSH_UNDO';          snapshot: EditableSlide[] }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function reducer(state: SlideEditorState, action: Action): SlideEditorState {
  switch (action.type) {
    case 'SET_SLIDES':
      return { ...state, slides: action.payload };
    case 'PATCH_SLIDE': {
      const slides = [...state.slides];
      slides[action.index] = { ...slides[action.index], ...action.patch };
      return { ...state, slides };
    }
    case 'SET_ACTIVE_IDX':
      return { ...state, activeSlideIndex: action.index, selectedField: null, editingText: '' };
    case 'SET_SELECTED_FIELD':
      return { ...state, selectedField: action.field };
    case 'SET_EDITING_TEXT':
      return { ...state, editingText: action.text };
    case 'SET_PANEL':
      return { ...state, activePanel: action.panel };
    case 'SET_COLOR_TARGET':
      return { ...state, colorPickerTarget: action.target };
    case 'SET_FONT':
      return { ...state, fontFamily: action.font, isDirty: true };
    case 'SET_DIRTY':
      return { ...state, isDirty: action.dirty };
    case 'SET_SAVING':
      return { ...state, isSaving: action.saving };
    case 'SET_SAVE_ERROR':
      return { ...state, saveError: action.error };
    case 'SET_AI_PROCESSING':
      return { ...state, isAIProcessing: action.processing, aiProcessingLabel: action.label ?? state.aiProcessingLabel };
    case 'SET_LAYOUT_SUGGEST':
      return { ...state, layoutSuggestion: action.suggestion };
    case 'PUSH_UNDO': {
      const undoStack = [action.snapshot, ...state.undoStack].slice(0, MAX_UNDO_DEPTH);
      return { ...state, undoStack, redoStack: [], isDirty: true };
    }
    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const [prev, ...rest] = state.undoStack;
      return { ...state, slides: prev, undoStack: rest, redoStack: [state.slides, ...state.redoStack].slice(0, MAX_UNDO_DEPTH), isDirty: true };
    }
    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const [next, ...rest] = state.redoStack;
      return { ...state, slides: next, redoStack: rest, undoStack: [state.slides, ...state.undoStack].slice(0, MAX_UNDO_DEPTH), isDirty: true };
    }
    default:
      return state;
  }
}

const INITIAL_STATE: SlideEditorState = {
  slides: [], activeSlideIndex: 0, selectedField: null, editingText: '',
  activePanel: 'none', colorPickerTarget: null, activeTool: 'select',
  fontFamily: DEFAULT_FONT, isDirty: false, isSaving: false, saveError: null,
  isAIProcessing: false, aiProcessingLabel: '', layoutSuggestion: null,
  undoStack: [], redoStack: [],
};

// ─── Hook Return Type ─────────────────────────────────────────────────────────

export interface UseSlideEditorReturn {
  state:              SlideEditorState;
  presentation:       GeneratedPresentation | null;
  isLoading:          boolean;
  loadError:          string | null;
  activeSlide:        EditableSlide | null;

  loadEditor:         (presentationId: string) => Promise<void>;

  goToSlide:          (index: number) => void;
  goToNext:           () => void;
  goToPrev:           () => void;

  openPanel:          (panel: EditorPanel) => void;
  closePanel:         () => void;

  selectField:        (field: EditableFieldKey) => void;
  commitFieldEdit:    (field: EditableFieldKey, value: string) => void;
  setEditingText:     (text: string) => void;
  updateBullet:       (bulletIndex: number, value: string) => void;
  addBullet:          () => void;
  removeBullet:       (bulletIndex: number) => void;
  reorderBullets:     (from: number, to: number) => void;

  applyFormatting:    (field: EditableFieldKey, fmt: Partial<FieldFormatting>) => void;
  toggleBold:         (field: EditableFieldKey) => void;
  toggleItalic:       (field: EditableFieldKey) => void;
  cycleFontSizeUp:    (field: EditableFieldKey) => void;
  cycleFontSizeDown:  (field: EditableFieldKey) => void;
  setAlignment:       (field: EditableFieldKey, align: TextAlignment) => void;
  setFieldColor:      (field: EditableFieldKey, color: string) => void;
  getFormatting:      (field: EditableFieldKey) => FieldFormatting;

  switchLayout:       (layout: SlideLayout) => void;
  setBackgroundColor: (color: string, applyAll?: boolean) => void;
  setAccentColor:     (color: string, applyAll?: boolean) => void;
  setTheme:           (theme: PresentationTheme) => void;
  setFontFamily:      (font: FontFamily) => void;
  setSpacing:         (spacing: SpacingLevel, applyAll?: boolean) => void;

  openColorPicker:    (target: ColorPickerTarget) => void;
  applyPickedColor:   (color: string) => void;

  addSlide:           (afterIndex: number, layout?: SlideLayout) => void;
  deleteSlide:        (index: number) => void;
  reorderSlides:      (fromIndex: number, toIndex: number) => void;
  duplicateSlide:     (index: number) => void;

  addBlock:           (block: AdditionalBlock) => void;
  updateBlock:        (blockId: string, patch: Partial<AdditionalBlock>) => void;
  deleteBlock:        (blockId: string) => void;
  reorderBlocks:      (from: number, to: number) => void;

  undo:               () => void;
  redo:               () => void;
  canUndo:            boolean;
  canRedo:            boolean;

  saveNow:            () => Promise<void>;
  getExportPresentation: () => GeneratedPresentation | null;

  aiRewriteField:          (field: EditableFieldKey, style: AIRewriteStyle) => Promise<void>;
  aiRewriteBullets:        (style: AIRewriteStyle) => Promise<void>;
  aiRewriteSingleBullet:   (bulletIndex: number, style: AIRewriteStyle) => Promise<void>;
  aiGenerateSlide:         (req: AIGenerateSlideRequest) => Promise<void>;
  aiGenerateSpeakerNotes:  (slideIndex?: number) => Promise<void>;
  aiSuggestLayout:         () => Promise<void>;
  dismissLayoutSuggestion: () => void;
  applyLayoutSuggestion:   () => void;

  // Part 29: Template operations
  applyTemplate:  (template: SlideTemplate) => void;
  insertTemplate: (template: SlideTemplate) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSlideEditor(report?: ResearchReport | null): UseSlideEditorReturn {
  const { user }             = useAuth();
  const { balance, consume } = useCredits();

  const [editorState, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [presentation,   setPres]     = useState<GeneratedPresentation | null>(null);
  const [isLoading,      setIsLoading]= useState(false);
  const [loadError,      setLoadError]= useState<string | null>(null);

  const stateRef     = useRef(editorState);
  const presRef      = useRef(presentation);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiEditsRef   = useRef(0);

  useEffect(() => { stateRef.current = editorState; }, [editorState]);
  useEffect(() => { presRef.current  = presentation;  }, [presentation]);

  const activeSlide = editorState.slides[editorState.activeSlideIndex] ?? null;

  // ─── LOAD ──────────────────────────────────────────────────────────────────

  const loadEditor = useCallback(async (presentationId: string) => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await loadEditorPresentation(presentationId, user.id);
      if (!result) { setLoadError('Presentation not found or access denied.'); return; }
      dispatch({ type: 'SET_SLIDES',  payload: result.editorSlides });
      dispatch({ type: 'SET_FONT',    font: result.fontFamily });
      dispatch({ type: 'SET_DIRTY',   dirty: false });
      setPres(result.presentation);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load editor.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ─── PUSH UNDO ─────────────────────────────────────────────────────────────

  const pushUndo = useCallback(() => {
    dispatch({ type: 'PUSH_UNDO', snapshot: [...stateRef.current.slides] });
  }, []);

  // ─── AUTO-SAVE ─────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pres  = presRef.current;
      const state = stateRef.current;
      if (!pres || !user || !state.isDirty) return;
      dispatch({ type: 'SET_SAVING', saving: true });
      try {
        await saveEditorState(pres.id, user.id, state.slides, state.fontFamily, aiEditsRef.current);
        aiEditsRef.current = 0;
        dispatch({ type: 'SET_DIRTY',     dirty: false });
        dispatch({ type: 'SET_SAVE_ERROR', error: null });
      } catch {
        dispatch({ type: 'SET_SAVE_ERROR', error: 'Auto-save failed.' });
      } finally {
        dispatch({ type: 'SET_SAVING', saving: false });
      }
    }, 1500);
  }, [user]);

  useEffect(() => {
    if (editorState.isDirty) scheduleSave();
  }, [editorState.slides, editorState.fontFamily, editorState.isDirty]);

  const saveNow = useCallback(async () => {
    const pres  = presRef.current;
    const state = stateRef.current;
    if (!pres || !user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    dispatch({ type: 'SET_SAVING', saving: true });
    try {
      await saveEditorState(pres.id, user.id, state.slides, state.fontFamily, aiEditsRef.current);
      aiEditsRef.current = 0;
      dispatch({ type: 'SET_DIRTY',     dirty: false });
      dispatch({ type: 'SET_SAVE_ERROR', error: null });
    } catch {
      dispatch({ type: 'SET_SAVE_ERROR', error: 'Save failed. Please try again.' });
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [user]);

  // ─── NAVIGATION ───────────────────────────────────────────────────────────

  const goToSlide = useCallback((index: number) => {
    const slides  = stateRef.current.slides;
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    dispatch({ type: 'SET_ACTIVE_IDX', index: clamped });
  }, []);

  const goToNext = useCallback(() => {
    const { activeSlideIndex, slides } = stateRef.current;
    goToSlide(Math.min(activeSlideIndex + 1, slides.length - 1));
  }, [goToSlide]);

  const goToPrev = useCallback(() => {
    goToSlide(Math.max(stateRef.current.activeSlideIndex - 1, 0));
  }, [goToSlide]);

  // ─── PANEL CONTROL ────────────────────────────────────────────────────────

  const openPanel  = useCallback((panel: EditorPanel) => dispatch({ type: 'SET_PANEL', panel }), []);
  const closePanel = useCallback(() => dispatch({ type: 'SET_PANEL', panel: 'none' }), []);

  // ─── TEXT EDITING ─────────────────────────────────────────────────────────

  const selectField = useCallback((field: EditableFieldKey) => {
    const slide = stateRef.current.slides[stateRef.current.activeSlideIndex];
    const value = (slide as any)[field] ?? '';
    dispatch({ type: 'SET_SELECTED_FIELD', field });
    dispatch({ type: 'SET_EDITING_TEXT',   text: typeof value === 'string' ? value : '' });
    dispatch({ type: 'SET_PANEL', panel: 'text_edit' });
  }, []);

  const setEditingText = useCallback((text: string) => dispatch({ type: 'SET_EDITING_TEXT', text }), []);

  const commitFieldEdit = useCallback((field: EditableFieldKey, value: string) => {
    pushUndo();
    const idx = stateRef.current.activeSlideIndex;
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { [field]: value || undefined } as any });
    dispatch({ type: 'SET_SELECTED_FIELD', field: null });
    dispatch({ type: 'SET_EDITING_TEXT',   text: '' });
    dispatch({ type: 'SET_PANEL', panel: 'none' });
  }, [pushUndo]);

  const updateBullet = useCallback((bulletIndex: number, value: string) => {
    pushUndo();
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const bullets = [...(slide.bullets ?? [])];
    bullets[bulletIndex] = value;
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { bullets } });
  }, [pushUndo]);

  const addBullet = useCallback(() => {
    pushUndo();
    const idx     = stateRef.current.activeSlideIndex;
    const bullets = [...(stateRef.current.slides[idx].bullets ?? []), ''];
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { bullets } });
  }, [pushUndo]);

  const removeBullet = useCallback((bulletIndex: number) => {
    pushUndo();
    const idx     = stateRef.current.activeSlideIndex;
    const bullets = (stateRef.current.slides[idx].bullets ?? []).filter((_, i) => i !== bulletIndex);
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { bullets: bullets.length > 0 ? bullets : undefined } });
  }, [pushUndo]);

  const reorderBullets = useCallback((from: number, to: number) => {
    pushUndo();
    const idx     = stateRef.current.activeSlideIndex;
    const bullets = [...(stateRef.current.slides[idx].bullets ?? [])];
    const [item]  = bullets.splice(from, 1);
    bullets.splice(to, 0, item);
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { bullets } });
  }, [pushUndo]);

  // ─── FORMATTING ───────────────────────────────────────────────────────────

  const getFormatting = useCallback((field: EditableFieldKey): FieldFormatting => {
    const slide = stateRef.current.slides[stateRef.current.activeSlideIndex];
    return slide?.editorData?.fieldFormats?.[field] ?? {};
  }, []);

  const applyFormatting = useCallback((field: EditableFieldKey, fmt: Partial<FieldFormatting>) => {
    const idx     = stateRef.current.activeSlideIndex;
    const slide   = stateRef.current.slides[idx];
    const existing = slide?.editorData?.fieldFormats?.[field] ?? {};
    const newEditorData = {
      ...(slide.editorData ?? {}),
      fieldFormats: { ...(slide.editorData?.fieldFormats ?? {}), [field]: { ...existing, ...fmt } },
    };
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: newEditorData } });
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, []);

  const toggleBold      = useCallback((field: EditableFieldKey) => applyFormatting(field, { bold: !getFormatting(field).bold }), [applyFormatting, getFormatting]);
  const toggleItalic    = useCallback((field: EditableFieldKey) => applyFormatting(field, { italic: !getFormatting(field).italic }), [applyFormatting, getFormatting]);

  const cycleFontSizeUp = useCallback((field: EditableFieldKey) => {
    const cur = getFormatting(field).fontScale ?? DEFAULT_FONT_SCALE;
    const idx = FONT_SCALE_STEPS.findIndex(s => s >= cur);
    applyFormatting(field, { fontScale: FONT_SCALE_STEPS[Math.min(idx + 1, FONT_SCALE_STEPS.length - 1)] });
  }, [getFormatting, applyFormatting]);

  const cycleFontSizeDown = useCallback((field: EditableFieldKey) => {
    const cur = getFormatting(field).fontScale ?? DEFAULT_FONT_SCALE;
    const idx = FONT_SCALE_STEPS.findLastIndex(s => s <= cur);
    applyFormatting(field, { fontScale: FONT_SCALE_STEPS[Math.max(idx - 1, 0)] });
  }, [getFormatting, applyFormatting]);

  const setAlignment  = useCallback((field: EditableFieldKey, align: TextAlignment) => applyFormatting(field, { alignment: align }), [applyFormatting]);
  const setFieldColor = useCallback((field: EditableFieldKey, color: string) => applyFormatting(field, { color }), [applyFormatting]);

  // ─── DESIGN ───────────────────────────────────────────────────────────────

  const switchLayout = useCallback((layout: SlideLayout) => {
    pushUndo();
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const patch: Partial<EditableSlide> = { layout };
    const isBulletTarget = ['bullets', 'agenda', 'predictions', 'references'].includes(layout);
    const isBodyTarget   = ['content', 'chart_ref'].includes(layout);
    if (isBulletTarget && (!slide.bullets || slide.bullets.length === 0) && slide.body) {
      const sentences = slide.body.split(/(?<=[.!?])\s+|;\s*/).map(s => s.trim()).filter(s => s.length > 2).slice(0, 6);
      patch.bullets = sentences.length > 0 ? sentences : [slide.body.trim()];
    }
    if (isBodyTarget && !slide.body && slide.bullets?.length) {
      patch.body = slide.bullets.filter(b => b.trim()).map(b => b.trim().replace(/[^.!?]$/, s => s + '.')).join(' ');
    }
    if (layout === 'quote' && !slide.quote) {
      patch.quote = slide.body?.trim() || slide.bullets?.[0]?.trim();
    }
    if ((layout === 'closing' || layout === 'title') && !slide.subtitle) {
      patch.subtitle = slide.body?.split(/[.!?]/)[0]?.trim() || slide.bullets?.[0]?.trim();
    }
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch });
    dispatch({ type: 'SET_DIRTY', dirty: true });
    dispatch({ type: 'SET_PANEL', panel: 'none' });
  }, [pushUndo]);

  const setBackgroundColor = useCallback((color: string, applyAll = false) => {
    pushUndo();
    const state = stateRef.current;
    if (applyAll) {
      const slides = state.slides.map(s => ({ ...s, editorData: { ...s.editorData, backgroundColor: color } }));
      dispatch({ type: 'SET_SLIDES', payload: slides });
    } else {
      const idx = state.activeSlideIndex;
      dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(state.slides[idx].editorData ?? {}), backgroundColor: color } } });
    }
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, [pushUndo]);

  const setAccentColor = useCallback((color: string, applyAll = false) => {
    pushUndo();
    const state = stateRef.current;
    if (applyAll) {
      dispatch({ type: 'SET_SLIDES', payload: state.slides.map(s => ({ ...s, accentColor: color })) });
    } else {
      dispatch({ type: 'PATCH_SLIDE', index: state.activeSlideIndex, patch: { accentColor: color } });
    }
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, [pushUndo]);

  /**
   * Part 29 FIX: setTheme now also persists the theme column to Supabase.
   * This ensures slide-preview's useFocusEffect reads the correct theme
   * when returning from the editor — fixing the "theme reverts to original" bug.
   */
  const setTheme = useCallback((theme: PresentationTheme) => {
    pushUndo();
    const pres = presRef.current;
    if (!pres) return;
    const newTokens = getThemeTokens(theme);
    setPres({ ...pres, theme, themeTokens: newTokens });
    const slides = stateRef.current.slides.map(s => ({
      ...s,
      accentColor: s.accentColor === pres.themeTokens.primary ? newTokens.primary : s.accentColor,
    }));
    dispatch({ type: 'SET_SLIDES', payload: slides });
    dispatch({ type: 'SET_DIRTY', dirty: true });

    // Part 29 FIX: Persist theme column to DB immediately (fire-and-forget)
    if (user) {
      supabase
        .from('presentations')
        .update({ theme })
        .eq('id', pres.id)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('[useSlideEditor] theme persist failed:', error.message);
        });
    }
  }, [pushUndo, user]);

  const setFontFamily = useCallback((font: FontFamily) => dispatch({ type: 'SET_FONT', font }), []);

  const setSpacing = useCallback((spacing: SpacingLevel, applyAll = false) => {
    pushUndo();
    const state = stateRef.current;
    if (applyAll) {
      dispatch({ type: 'SET_SLIDES', payload: state.slides.map(s => ({ ...s, editorData: { ...(s.editorData ?? {}), spacing } })) });
    } else {
      const idx = state.activeSlideIndex;
      dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(state.slides[idx].editorData ?? {}), spacing } } });
    }
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, [pushUndo]);

  // ─── COLOR PICKER ─────────────────────────────────────────────────────────

  const openColorPicker = useCallback((target: ColorPickerTarget) => {
    dispatch({ type: 'SET_COLOR_TARGET', target });
    dispatch({ type: 'SET_PANEL', panel: 'color_picker' });
  }, []);

  const applyPickedColor = useCallback((color: string) => {
    const target = stateRef.current.colorPickerTarget;
    if (!target) return;
    switch (target.scope) {
      case 'slide_bg': setBackgroundColor(color, false); break;
      case 'accent':   setAccentColor(color, false); break;
      case 'field':    setFieldColor((target as any).fieldKey, color); break;
      case 'block': {
        const idx   = stateRef.current.activeSlideIndex;
        const slide = stateRef.current.slides[idx];
        const blocks = (slide.editorData?.additionalBlocks ?? []).map(b => b.id === (target as any).blockId ? { ...b, color } : b);
        dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(slide.editorData ?? {}), additionalBlocks: blocks } } });
        break;
      }
    }
    dispatch({ type: 'SET_COLOR_TARGET', target: null });
    dispatch({ type: 'SET_PANEL', panel: 'none' });
  }, [setBackgroundColor, setAccentColor, setFieldColor]);

  // ─── SLIDE MANAGEMENT ─────────────────────────────────────────────────────

  const addSlide = useCallback((afterIndex: number, layout: SlideLayout = 'content') => {
    pushUndo();
    const state  = stateRef.current;
    const newSlide: EditableSlide = {
      id: `slide_new_${Date.now()}`, slideNumber: 0, layout, title: 'New Slide',
      accentColor: presRef.current?.themeTokens.primary ?? '#6C63FF', icon: 'document-text-outline',
    };
    const slides = [...state.slides];
    slides.splice(afterIndex + 1, 0, newSlide);
    dispatch({ type: 'SET_SLIDES', payload: slides.map((s, i) => ({ ...s, slideNumber: i + 1 })) });
    dispatch({ type: 'SET_ACTIVE_IDX', index: afterIndex + 1 });
  }, [pushUndo]);

  const deleteSlide = useCallback((index: number) => {
    const slides = stateRef.current.slides;
    if (slides.length <= 1) { Alert.alert('Cannot delete', 'A presentation must have at least one slide.'); return; }
    pushUndo();
    const updated = slides.filter((_, i) => i !== index).map((s, i) => ({ ...s, slideNumber: i + 1 }));
    dispatch({ type: 'SET_SLIDES', payload: updated });
    dispatch({ type: 'SET_ACTIVE_IDX', index: Math.min(index, updated.length - 1) });
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, [pushUndo]);

  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    pushUndo();
    const slides = [...stateRef.current.slides];
    const [item] = slides.splice(fromIndex, 1);
    slides.splice(toIndex, 0, item);
    dispatch({ type: 'SET_SLIDES', payload: slides.map((s, i) => ({ ...s, slideNumber: i + 1 })) });
    dispatch({ type: 'SET_ACTIVE_IDX', index: toIndex });
  }, [pushUndo]);

  const duplicateSlide = useCallback((index: number) => {
    pushUndo();
    const slides = stateRef.current.slides;
    const copy: EditableSlide = { ...JSON.parse(JSON.stringify(slides[index])), id: `slide_dup_${Date.now()}` };
    const updated = [...slides];
    updated.splice(index + 1, 0, copy);
    dispatch({ type: 'SET_SLIDES', payload: updated.map((s, i) => ({ ...s, slideNumber: i + 1 })) });
    dispatch({ type: 'SET_ACTIVE_IDX', index: index + 1 });
  }, [pushUndo]);

  // ─── ADDITIONAL BLOCKS ────────────────────────────────────────────────────

  const addBlock = useCallback((block: AdditionalBlock) => {
    pushUndo();
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const blocks = [...(slide.editorData?.additionalBlocks ?? []), block];
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(slide.editorData ?? {}), additionalBlocks: blocks } } });
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, [pushUndo]);

  const updateBlock = useCallback((blockId: string, patch: Partial<AdditionalBlock>) => {
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const blocks = (slide.editorData?.additionalBlocks ?? []).map(b => b.id === blockId ? { ...b, ...patch } as AdditionalBlock : b);
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(slide.editorData ?? {}), additionalBlocks: blocks } } });
    dispatch({ type: 'SET_DIRTY', dirty: true });
  }, []);

  const deleteBlock = useCallback((blockId: string) => {
    pushUndo();
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const blocks = (slide.editorData?.additionalBlocks ?? []).filter(b => b.id !== blockId);
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(slide.editorData ?? {}), additionalBlocks: blocks } } });
  }, [pushUndo]);

  const reorderBlocks = useCallback((from: number, to: number) => {
    pushUndo();
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    const blocks = [...(slide.editorData?.additionalBlocks ?? [])];
    const [item] = blocks.splice(from, 1);
    blocks.splice(to, 0, item);
    dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { editorData: { ...(slide.editorData ?? {}), additionalBlocks: blocks } } });
  }, [pushUndo]);

  // ─── UNDO / REDO ──────────────────────────────────────────────────────────

  const undo = useCallback(() => { dispatch({ type: 'UNDO' }); scheduleSave(); }, [scheduleSave]);
  const redo = useCallback(() => { dispatch({ type: 'REDO' }); scheduleSave(); }, [scheduleSave]);

  // ─── EXPORT ───────────────────────────────────────────────────────────────

  const getExportPresentation = useCallback((): GeneratedPresentation | null => {
    const pres = presRef.current;
    if (!pres) return null;
    return { ...pres, slides: toExportSlides(stateRef.current.slides), totalSlides: stateRef.current.slides.length };
  }, []);

  // ─── AI OPERATIONS ────────────────────────────────────────────────────────

  const aiRewriteField = useCallback(async (field: EditableFieldKey, style: AIRewriteStyle) => {
    const slide    = stateRef.current.slides[stateRef.current.activeSlideIndex];
    const original = (slide as any)[field] as string | undefined;
    if (!original?.trim()) { Alert.alert('Nothing to rewrite', 'This field is empty.'); return; }
    if (balance < EDITOR_CREDIT_COSTS.ai_rewrite) { Alert.alert('Not enough credits', `Rewrite costs ${EDITOR_CREDIT_COSTS.ai_rewrite} credit. You have ${balance}.`); return; }
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: `Rewriting ${field} as "${style}"…` });
    try {
      const result = await rewriteText(original, style, report, field);
      await consume('research_quick');
      aiEditsRef.current += 1;
      pushUndo();
      dispatch({ type: 'PATCH_SLIDE', index: stateRef.current.activeSlideIndex, patch: { [field]: result } as any });
      dispatch({ type: 'SET_DIRTY', dirty: true });
    } catch (err) { Alert.alert('Rewrite failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); closePanel(); }
  }, [balance, consume, report, pushUndo, closePanel]);

  const aiRewriteBullets = useCallback(async (style: AIRewriteStyle) => {
    const slide = stateRef.current.slides[stateRef.current.activeSlideIndex];
    if (!slide?.bullets?.length) { Alert.alert('No bullets', 'No bullet points to rewrite.'); return; }
    if (balance < EDITOR_CREDIT_COSTS.ai_rewrite) { Alert.alert('Not enough credits', `Bullet rewrite costs ${EDITOR_CREDIT_COSTS.ai_rewrite} credit.`); return; }
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: `Rewriting all bullets as "${style}"…` });
    try {
      const result = await rewriteBulletsAgent(slide.bullets, style, report);
      await consume('research_quick');
      aiEditsRef.current += 1;
      pushUndo();
      dispatch({ type: 'PATCH_SLIDE', index: stateRef.current.activeSlideIndex, patch: { bullets: result } });
      dispatch({ type: 'SET_DIRTY', dirty: true });
    } catch (err) { Alert.alert('Rewrite failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); closePanel(); }
  }, [balance, consume, report, pushUndo, closePanel]);

  const aiRewriteSingleBullet = useCallback(async (bulletIndex: number, style: AIRewriteStyle) => {
    const slide  = stateRef.current.slides[stateRef.current.activeSlideIndex];
    const bullet = slide?.bullets?.[bulletIndex];
    if (!bullet?.trim()) { Alert.alert('Empty bullet', 'This bullet is empty.'); return; }
    if (balance < EDITOR_CREDIT_COSTS.ai_rewrite) { Alert.alert('Not enough credits', `Costs ${EDITOR_CREDIT_COSTS.ai_rewrite} credit.`); return; }
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: `Rewriting bullet ${bulletIndex + 1}…` });
    try {
      const result = await rewriteSingleBulletAgent(bullet, style);
      await consume('research_quick');
      aiEditsRef.current += 1;
      pushUndo();
      const idx      = stateRef.current.activeSlideIndex;
      const newBullets = [...(stateRef.current.slides[idx].bullets ?? [])];
      newBullets[bulletIndex] = result;
      dispatch({ type: 'PATCH_SLIDE', index: idx, patch: { bullets: newBullets } });
      dispatch({ type: 'SET_DIRTY', dirty: true });
    } catch (err) { Alert.alert('Rewrite failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); }
  }, [balance, consume, report, pushUndo]);

  const aiGenerateSlide = useCallback(async (req: AIGenerateSlideRequest) => {
    if (balance < EDITOR_CREDIT_COSTS.ai_generate) { Alert.alert('Not enough credits', `Generation costs ${EDITOR_CREDIT_COSTS.ai_generate} credits. You have ${balance}.`); return; }
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: 'Generating slide…' });
    try {
      const newSlideData = await generateSlideAgent(req, report, stateRef.current.slides.length);
      await consume('research_quick');
      await consume('research_quick');
      aiEditsRef.current += 2;
      pushUndo();
      const slides = [...stateRef.current.slides];
      const newSlide: EditableSlide = { ...newSlideData, slideNumber: req.insertAfterIdx + 2 };
      slides.splice(req.insertAfterIdx + 1, 0, newSlide);
      dispatch({ type: 'SET_SLIDES', payload: slides.map((s, i) => ({ ...s, slideNumber: i + 1 })) });
      dispatch({ type: 'SET_ACTIVE_IDX', index: req.insertAfterIdx + 1 });
      dispatch({ type: 'SET_DIRTY', dirty: true });
    } catch (err) { Alert.alert('Generation failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); closePanel(); }
  }, [balance, consume, report, pushUndo, closePanel]);

  const aiGenerateSpeakerNotes = useCallback(async (slideIndex?: number) => {
    const currentState = stateRef.current;
    const idx   = slideIndex !== undefined ? slideIndex : currentState.activeSlideIndex;
    const slide = currentState.slides[idx];
    if (!slide || !slide.layout) { Alert.alert('No slide found', 'Please select a slide first.'); return; }
    if (balance < EDITOR_CREDIT_COSTS.ai_notes) { Alert.alert('Not enough credits', `Speaker notes cost ${EDITOR_CREDIT_COSTS.ai_notes} credit. You have ${balance}.`); return; }
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: 'Writing speaker notes…' });
    try {
      const notes = await generateSpeakerNotes({ ...slide }, report);
      if (!notes?.trim()) throw new Error('AI returned empty notes. Please try again.');
      await consume('research_quick');
      aiEditsRef.current += 1;
      pushUndo();
      dispatch({ type: 'PATCH_SLIDE', index: stateRef.current.activeSlideIndex, patch: { speakerNotes: notes } });
      dispatch({ type: 'SET_DIRTY', dirty: true });
    } catch (err) { Alert.alert('Notes failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); }
  }, [balance, consume, report, pushUndo]);

  const aiSuggestLayout = useCallback(async () => {
    const idx   = stateRef.current.activeSlideIndex;
    const slide = stateRef.current.slides[idx];
    dispatch({ type: 'SET_AI_PROCESSING', processing: true, label: 'Analyzing layout…' });
    try {
      const suggestion = await suggestLayoutAgent(slide, slide.layout);
      dispatch({ type: 'SET_LAYOUT_SUGGEST', suggestion });
    } catch (err) { Alert.alert('Layout analysis failed', err instanceof Error ? err.message : 'Please try again.'); }
    finally { dispatch({ type: 'SET_AI_PROCESSING', processing: false }); }
  }, []);

  const dismissLayoutSuggestion = useCallback(() => dispatch({ type: 'SET_LAYOUT_SUGGEST', suggestion: null }), []);

  const applyLayoutSuggestion = useCallback(() => {
    const suggestion = stateRef.current.layoutSuggestion;
    if (!suggestion) return;
    switchLayout(suggestion.suggestedLayout);
    dispatch({ type: 'SET_LAYOUT_SUGGEST', suggestion: null });
  }, [switchLayout]);

  // ─── Part 29: TEMPLATE OPERATIONS ────────────────────────────────────────

  /**
   * Replace ALL slides in the deck with a template's slides.
   * Asks for confirmation since this is destructive.
   */
  const applyTemplate = useCallback((template: SlideTemplate) => {
    Alert.alert(
      `Apply "${template.name}"?`,
      `This will replace all ${stateRef.current.slides.length} slides with ${template.slideCount} template slides. Your current content will be lost.\n\nYou can undo this action.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply Template',
          style: 'destructive',
          onPress: () => {
            pushUndo();
            const pres  = presRef.current;
            const theme = pres?.theme ?? 'dark';
            const templateSlides = applyTemplateToSlides(template, theme, 1);
            const replaced = replaceWithTemplateSlides(templateSlides);
            dispatch({ type: 'SET_SLIDES', payload: replaced });
            dispatch({ type: 'SET_ACTIVE_IDX', index: 0 });
            dispatch({ type: 'SET_DIRTY', dirty: true });
            dispatch({ type: 'SET_PANEL', panel: 'none' });

            // Track usage (fire-and-forget)
            if (pres) {
              trackTemplateUsage(template.id, pres.id, theme);
            }
          },
        },
      ],
    );
  }, [pushUndo]);

  /**
   * Insert template slides after the active slide index.
   * Non-destructive — existing slides are preserved.
   */
  const insertTemplate = useCallback((template: SlideTemplate) => {
    pushUndo();
    const state     = stateRef.current;
    const pres      = presRef.current;
    const theme     = pres?.theme ?? 'dark';
    const afterIdx  = state.activeSlideIndex;
    const startNum  = afterIdx + 2; // +1 for active, +1 for 1-indexed

    const templateSlides = applyTemplateToSlides(template, theme, startNum);
    const merged = insertTemplateSlidesAtIndex(state.slides, templateSlides, afterIdx);

    dispatch({ type: 'SET_SLIDES', payload: merged });
    dispatch({ type: 'SET_ACTIVE_IDX', index: afterIdx + 1 });
    dispatch({ type: 'SET_DIRTY', dirty: true });
    dispatch({ type: 'SET_PANEL', panel: 'none' });

    // Track usage (fire-and-forget)
    if (pres) {
      trackTemplateUsage(template.id, pres.id, theme);
    }
  }, [pushUndo]);

  // ─── Return ───────────────────────────────────────────────────────────────

  return {
    state: editorState, presentation, isLoading, loadError, activeSlide,
    loadEditor,
    goToSlide, goToNext, goToPrev,
    openPanel, closePanel,
    selectField, commitFieldEdit, setEditingText,
    updateBullet, addBullet, removeBullet, reorderBullets,
    applyFormatting, toggleBold, toggleItalic,
    cycleFontSizeUp, cycleFontSizeDown, setAlignment, setFieldColor, getFormatting,
    switchLayout, setBackgroundColor, setAccentColor, setTheme, setFontFamily, setSpacing,
    openColorPicker, applyPickedColor,
    addSlide, deleteSlide, reorderSlides, duplicateSlide,
    addBlock, updateBlock, deleteBlock, reorderBlocks,
    undo, redo, canUndo: editorState.undoStack.length > 0, canRedo: editorState.redoStack.length > 0,
    saveNow, getExportPresentation,
    aiRewriteField, aiRewriteBullets, aiRewriteSingleBullet,
    aiGenerateSlide, aiGenerateSpeakerNotes, aiSuggestLayout,
    dismissLayoutSuggestion, applyLayoutSuggestion,
    // Part 29
    applyTemplate, insertTemplate,
  };
}