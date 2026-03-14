// src/services/workspaceSharingService.ts
// Part 14 FINAL FIX — Maps "out_" prefixed column names returned by
// the fixed get_workspace_shared_content and get_user_workspaces_for_sharing
// RPCs. The prefix was added to fix Postgres 42702 ambiguous column error.

import { supabase } from '../lib/supabase';
import { SharedWorkspaceContent, SharedContentType } from '../types';

// ─── Mapper: get_workspace_shared_content rows ────────────────────────────────
// RPC now returns out_id, out_workspace_id, etc. (prefixed to avoid 42702)

function mapSharedContentRow(row: Record<string, unknown>): SharedWorkspaceContent {
  return {
    id:           (row.out_id           ?? row.id)           as string,
    workspaceId:  (row.out_workspace_id ?? row.workspace_id) as string,
    sharedBy:     (row.out_shared_by    ?? row.shared_by)    as string,
    contentType:  (row.out_content_type ?? row.content_type) as SharedContentType,
    contentId:    (row.out_content_id   ?? row.content_id)   as string,
    title:        (row.out_title        ?? row.title)        as string,
    subtitle:     ((row.out_subtitle    ?? row.subtitle)     as string) ?? undefined,
    reportId:     ((row.out_report_id   ?? row.report_id)    as string) ?? undefined,
    metadata:     ((row.out_metadata    ?? row.metadata)     as Record<string, unknown>) ?? {},
    sharedAt:     (row.out_shared_at    ?? row.shared_at)    as string,
    sharerName:   ((row.out_sharer_name  ?? row.sharer_name)  as string) ?? undefined,
    sharerAvatar: ((row.out_sharer_avatar ?? row.sharer_avatar) as string) ?? undefined,
  };
}

// ─── Mapper for share_content_to_workspace return (no prefix — returns row) ──

function mapShareRow(row: Record<string, unknown>): SharedWorkspaceContent {
  return {
    id:           row.id           as string,
    workspaceId:  row.workspace_id as string,
    sharedBy:     row.shared_by    as string,
    contentType:  row.content_type as SharedContentType,
    contentId:    row.content_id   as string,
    title:        row.title        as string,
    subtitle:     (row.subtitle    as string) ?? undefined,
    reportId:     (row.report_id   as string) ?? undefined,
    metadata:     (row.metadata    as Record<string, unknown>) ?? {},
    sharedAt:     row.shared_at    as string,
    sharerName:   undefined,
    sharerAvatar: undefined,
  };
}

// ─── Share a presentation into a workspace ────────────────────────────────────

export async function sharePresentationToWorkspace(
  workspaceId:    string,
  presentationId: string,
  title:          string,
  subtitle?:      string,
  reportId?:      string,
  metadata:       Record<string, unknown> = {},
): Promise<{ data: SharedWorkspaceContent | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('share_content_to_workspace', {
      p_workspace_id: workspaceId,
      p_content_type: 'presentation',
      p_content_id:   presentationId,
      p_title:        title,
      p_subtitle:     subtitle ?? null,
      p_report_id:    reportId ?? null,
      p_metadata:     metadata,
    });

    if (error) {
      console.error('[sharePresentationToWorkspace] RPC error:', error);
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!row) throw new Error('No data returned from share RPC');

    return { data: mapShareRow(row), error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to share presentation',
    };
  }
}

// ─── Share an academic paper into a workspace ─────────────────────────────────

export async function shareAcademicPaperToWorkspace(
  workspaceId: string,
  paperId:     string,
  title:       string,
  subtitle?:   string,
  reportId?:   string,
  metadata:    Record<string, unknown> = {},
): Promise<{ data: SharedWorkspaceContent | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('share_content_to_workspace', {
      p_workspace_id: workspaceId,
      p_content_type: 'academic_paper',
      p_content_id:   paperId,
      p_title:        title,
      p_subtitle:     subtitle ?? null,
      p_report_id:    reportId ?? null,
      p_metadata:     metadata,
    });

    if (error) {
      console.error('[shareAcademicPaperToWorkspace] RPC error:', error);
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!row) throw new Error('No data returned from share RPC');

    return { data: mapShareRow(row), error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to share academic paper',
    };
  }
}

// ─── Remove shared content ────────────────────────────────────────────────────

export async function removeSharedContent(
  workspaceId:  string,
  contentType:  SharedContentType,
  contentId:    string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('remove_shared_content', {
      p_workspace_id: workspaceId,
      p_content_type: contentType,
      p_content_id:   contentId,
    });

    if (error) {
      console.error('[removeSharedContent] RPC error:', error);
      throw error;
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove' };
  }
}

// ─── Get all shared content for a workspace ───────────────────────────────────
// Maps "out_" prefixed columns from the fixed RPC.

export async function getWorkspaceSharedContent(
  workspaceId:  string,
  contentType?: SharedContentType,
): Promise<{ data: SharedWorkspaceContent[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_shared_content', {
      p_workspace_id: workspaceId,
      p_content_type: contentType ?? null,
    });

    if (error) {
      console.error('[getWorkspaceSharedContent] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapSharedContentRow), error: null };
  } catch (err) {
    return {
      data:  [],
      error: err instanceof Error ? err.message : 'Failed to load shared content',
    };
  }
}

// ─── Get workspace IDs a piece of content is already shared to ───────────────
// Direct table query — SELECT policy only needs caller to be a member.

export async function getWorkspacesContentIsSharedTo(
  contentType: SharedContentType,
  contentId:   string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('shared_workspace_content')
      .select('workspace_id')
      .eq('content_type', contentType)
      .eq('content_id',   contentId);

    if (error) {
      console.warn('[getWorkspacesContentIsSharedTo] query error:', error);
      return [];
    }

    return (data ?? []).map((r: { workspace_id: string }) => r.workspace_id);
  } catch {
    return [];
  }
}