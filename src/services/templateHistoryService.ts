// src/services/templateHistoryService.ts
// Part 30 — Template History: save / load / restore presentation snapshots
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }               from '../lib/supabase';
import type { TemplateHistoryEntry } from '../types/editor';

// ─── Save snapshot BEFORE applying a template ────────────────────────────────

export async function saveTemplateSnapshot(
  presentationId:      string,
  userId:              string,
  slidesSnapshot:      any[],
  editorDataSnapshot:  any[],
  fontFamily:          string,
  templateId?:         string,
  templateName?:       string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('save_template_history', {
      p_presentation_id:      presentationId,
      p_user_id:              userId,
      p_slides_snapshot:      slidesSnapshot,
      p_editor_data_snapshot: editorDataSnapshot,
      p_font_family:          fontFamily,
      p_template_id:          templateId ?? null,
      p_template_name:        templateName ?? null,
    });

    if (error) {
      console.warn('[templateHistoryService] saveTemplateSnapshot error:', error.message);
      return null;
    }

    return data as string;
  } catch (err) {
    console.error('[templateHistoryService] saveTemplateSnapshot unexpected error:', err);
    return null;
  }
}

// ─── Load history entries ─────────────────────────────────────────────────────

export async function loadTemplateHistory(
  presentationId: string,
  userId:         string,
): Promise<TemplateHistoryEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_template_history', {
      p_presentation_id: presentationId,
      p_user_id:         userId,
      p_limit:           20,
    });

    if (error || !data) {
      console.warn('[templateHistoryService] loadTemplateHistory error:', error?.message);
      return [];
    }

    return (data as any[]).map(row => ({
      id:                   row.id,
      presentationId,
      userId,
      slidesSnapshot:       row.slides_snapshot ?? [],
      editorDataSnapshot:   row.editor_data_snapshot ?? [],
      fontFamily:           row.font_family ?? 'system',
      templateId:           row.template_id ?? undefined,
      templateName:         row.template_name ?? undefined,
      createdAt:            row.created_at,
    })) as TemplateHistoryEntry[];
  } catch (err) {
    console.error('[templateHistoryService] loadTemplateHistory unexpected error:', err);
    return [];
  }
}

// ─── Delete a specific entry ──────────────────────────────────────────────────

export async function deleteHistoryEntry(
  entryId: string,
  userId:  string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('delete_template_history_entry', {
      p_entry_id: entryId,
      p_user_id:  userId,
    });

    if (error) {
      console.warn('[templateHistoryService] deleteHistoryEntry error:', error.message);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('[templateHistoryService] deleteHistoryEntry unexpected error:', err);
    return false;
  }
}

// ─── Clear all history for presentation ──────────────────────────────────────

export async function clearAllHistory(
  presentationId: string,
  userId:         string,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('clear_template_history', {
      p_presentation_id: presentationId,
      p_user_id:         userId,
    });

    if (error) {
      console.warn('[templateHistoryService] clearAllHistory error:', error.message);
      return 0;
    }

    return (data as number) ?? 0;
  } catch (err) {
    console.error('[templateHistoryService] clearAllHistory unexpected error:', err);
    return 0;
  }
}