// src/services/slideEditorService.ts
// Part 28 — Slide Canvas Editor: Supabase read / write
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type {
  EditableSlide,
  SlideEditorData,
  FontFamily,
  SavedEditorPayload,
} from '../types/editor';
import type { GeneratedPresentation, PresentationTheme } from '../types';
import { getThemeTokens } from './pptxExport';

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a presentation with its editor data from Supabase.
 * Returns null if not found or access denied.
 */
export async function loadEditorPresentation(
  presentationId: string,
  userId: string,
): Promise<{ presentation: GeneratedPresentation; editorSlides: EditableSlide[]; fontFamily: FontFamily } | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_presentation_editor', {
        p_presentation_id: presentationId,
        p_user_id:         userId,
      });

    if (error || !data) {
      console.warn('[slideEditorService] load failed:', error?.message);
      return null;
    }

    const theme: PresentationTheme = (data.theme as PresentationTheme) ?? 'dark';
    const rawSlides: any[] = data.slides ?? [];
    const editorDataArr: SlideEditorData[] = Array.isArray(data.editor_data)
      ? data.editor_data
      : [];

    // Merge editor_data into each slide
    const editorSlides: EditableSlide[] = rawSlides.map((s, i) => ({
      ...s,
      editorData: editorDataArr[i] ?? undefined,
    }));

    const presentation: GeneratedPresentation = {
      id:           data.id,
      reportId:     data.report_id,
      userId,
      title:        data.title,
      subtitle:     data.subtitle ?? '',
      theme,
      themeTokens:  getThemeTokens(theme),
      slides:       editorSlides,
      totalSlides:  editorSlides.length,
      generatedAt:  data.generated_at,
      exportCount:  data.export_count ?? 0,
    };

    return {
      presentation,
      editorSlides,
      fontFamily: (data.font_family as FontFamily) ?? 'system',
    };
  } catch (err) {
    console.error('[slideEditorService] loadEditorPresentation error:', err);
    return null;
  }
}

// ─── Save (full) ──────────────────────────────────────────────────────────────

/**
 * Persist the entire editor state back to Supabase.
 * Extracts editorData from each slide, stores separately in editor_data column.
 * Passes ai_edits_delta to track usage without a separate round-trip.
 */
export async function saveEditorState(
  presentationId: string,
  userId:         string,
  slides:         EditableSlide[],
  fontFamily:     FontFamily,
  aiEditsDelta:   number = 0,
): Promise<boolean> {
  try {
    // Separate slide content from editor overlay
    const cleanSlides = slides.map(({ editorData: _ed, ...slide }) => slide);
    const editorData: SlideEditorData[] = slides.map(s => s.editorData ?? {});

    const { error } = await supabase.rpc('save_presentation_editor', {
      p_presentation_id: presentationId,
      p_user_id:         userId,
      p_slides:          cleanSlides,
      p_editor_data:     editorData,
      p_font_family:     fontFamily,
      p_ai_edits_delta:  aiEditsDelta,
    });

    if (error) {
      console.warn('[slideEditorService] save failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[slideEditorService] saveEditorState error:', err);
    return false;
  }
}

// ─── Save (single slide — quick patch) ───────────────────────────────────────

/**
 * Update a single slide in the array without rewriting the entire payload.
 * Used for fast auto-save after individual edits.
 * Falls back to full save if the partial update fails.
 */
export async function saveSingleSlide(
  presentationId: string,
  userId:         string,
  allSlides:      EditableSlide[],
  fontFamily:     FontFamily,
): Promise<boolean> {
  // For simplicity and reliability, we always do a full save.
  // The RPC is fast (indexed by id, row-level), so this is acceptable.
  return saveEditorState(presentationId, userId, allSlides, fontFamily, 0);
}

// ─── Track AI edit usage ──────────────────────────────────────────────────────

/**
 * Increment ai_edits_count by delta.
 * Called separately when we want to track AI usage without a full slide save.
 */
export async function trackAIEdits(
  presentationId: string,
  userId:         string,
  delta:          number = 1,
): Promise<void> {
  try {
    await supabase
      .from('presentations')
      .update({ ai_edits_count: supabase.rpc('coalesce_increment', { p_id: presentationId, p_delta: delta }) as any })
      .eq('id', presentationId)
      .eq('user_id', userId);
  } catch {
    // Non-fatal — best effort tracking
  }
}

// ─── Build export-ready slides ────────────────────────────────────────────────

/**
 * Strip editorData from EditableSlide[] to produce clean PresentationSlide[]
 * suitable for PPTX / PDF / HTML export.
 */
export function toExportSlides(slides: EditableSlide[]) {
  return slides.map(({ editorData: _ed, ...slide }) => slide);
}

// ─── Helper: merge editorData into a base slide array ────────────────────────

/**
 * Given a raw slides array from DB and a matching editor_data array,
 * produce EditableSlide[] with editorData merged in.
 */
export function mergeEditorData(
  rawSlides: any[],
  editorDataArr: SlideEditorData[],
): EditableSlide[] {
  return rawSlides.map((s, i) => ({
    ...s,
    editorData: editorDataArr[i] ?? undefined,
  }));
}