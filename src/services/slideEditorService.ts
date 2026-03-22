// src/services/slideEditorService.ts
// Part 29 — Updated from Part 28
// Changes:
//   1. Added `applyTemplateToSlides()` — maps template slides to EditableSlide[]
//      remapping accent colors to match the chosen deck theme
//   2. Added `insertTemplateSlidesAtIndex()` helper
//   3. All Part 28 functions unchanged
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type {
  EditableSlide,
  SlideEditorData,
  FontFamily,
  SavedEditorPayload,
  SlideTemplate,
  SlideTemplateSlide,
} from '../types/editor';
import type { GeneratedPresentation, PresentationTheme, PresentationSlide } from '../types';
import { getThemeTokens } from './pptxExport';

// ─── Load ─────────────────────────────────────────────────────────────────────

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
    const rawSlides: any[]         = data.slides ?? [];
    const editorDataArr: SlideEditorData[] = Array.isArray(data.editor_data)
      ? data.editor_data
      : [];

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

export async function saveEditorState(
  presentationId: string,
  userId:         string,
  slides:         EditableSlide[],
  fontFamily:     FontFamily,
  aiEditsDelta:   number = 0,
): Promise<boolean> {
  try {
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

export async function saveSingleSlide(
  presentationId: string,
  userId:         string,
  allSlides:      EditableSlide[],
  fontFamily:     FontFamily,
): Promise<boolean> {
  return saveEditorState(presentationId, userId, allSlides, fontFamily, 0);
}

// ─── Track AI edits ───────────────────────────────────────────────────────────

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
    // Non-fatal
  }
}

// ─── Export helpers ───────────────────────────────────────────────────────────

export function toExportSlides(slides: EditableSlide[]) {
  return slides.map(({ editorData: _ed, ...slide }) => slide);
}

export function mergeEditorData(
  rawSlides: any[],
  editorDataArr: SlideEditorData[],
): EditableSlide[] {
  return rawSlides.map((s, i) => ({
    ...s,
    editorData: editorDataArr[i] ?? undefined,
  }));
}

// ─── Part 29: Template Application ───────────────────────────────────────────

/**
 * Map a template's accent color placeholder to the active theme primary.
 * If the template slide doesn't specify an accent, use the theme primary.
 */
function remapAccentColor(
  templateAccent: string | undefined,
  themePrimary:   string,
): string {
  if (!templateAccent) return themePrimary;
  // The template placeholder is '#6C63FF' (dark theme primary).
  // We remap it to whatever the chosen theme's primary is.
  if (templateAccent === '#6C63FF') return themePrimary;
  // If the template explicitly uses a non-placeholder color, keep it.
  return templateAccent;
}

/**
 * Convert a SlideTemplate's slides into EditableSlide[] ready for insertion
 * into the active deck. Renumbers from `startNumber`.
 */
export function applyTemplateToSlides(
  template:    SlideTemplate,
  theme:       PresentationTheme,
  startNumber: number = 1,
): EditableSlide[] {
  const tokens      = getThemeTokens(theme);
  const themePrimary = tokens.primary;

  return template.slides.map((ts: SlideTemplateSlide, i: number) => {
    const slide: EditableSlide = {
      id:          `tmpl_${template.id}_${Date.now()}_${i}`,
      slideNumber: startNumber + i,
      layout:      ts.layout,
      title:       ts.title,
      subtitle:    ts.subtitle,
      body:        ts.body,
      bullets:     ts.bullets,
      stats:       ts.stats,
      quote:       ts.quote,
      quoteAttribution: ts.quoteAttribution,
      sectionTag:  ts.sectionTag,
      badgeText:   ts.badgeText,
      speakerNotes: ts.speakerNotes,
      accentColor: remapAccentColor(ts.accentColor, themePrimary),
      icon:        ts.icon ?? 'document-text-outline',
    };
    return slide;
  });
}

/**
 * Insert template slides into an existing slides array after `afterIndex`.
 * Returns a new renumbered array.
 */
export function insertTemplateSlidesAtIndex(
  existingSlides:  EditableSlide[],
  templateSlides:  EditableSlide[],
  afterIndex:      number,
): EditableSlide[] {
  const copy = [...existingSlides];
  copy.splice(afterIndex + 1, 0, ...templateSlides);
  // Renumber all slides
  return copy.map((s, i) => ({ ...s, slideNumber: i + 1 }));
}

/**
 * Replace ALL slides in a deck with template slides (for "Start from template").
 * Returns renumbered array.
 */
export function replaceWithTemplateSlides(
  templateSlides: EditableSlide[],
): EditableSlide[] {
  return templateSlides.map((s, i) => ({ ...s, slideNumber: i + 1 }));
}

// ─── Part 29: Track template usage via Supabase ───────────────────────────────

export async function trackTemplateUsage(
  templateId:     string,
  presentationId: string | null,
  theme:          PresentationTheme,
): Promise<void> {
  try {
    await supabase.rpc('track_template_usage', {
      p_template_id:     templateId,
      p_presentation_id: presentationId,
      p_theme:           theme,
    });
  } catch {
    // Non-fatal analytics
  }
}