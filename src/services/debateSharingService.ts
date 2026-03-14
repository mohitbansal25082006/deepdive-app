// src/services/debateSharingService.ts
// Part 16 — Sharing debate sessions into / out of workspaces.
//
// Pattern mirrors podcastSharingService.ts exactly, but simpler:
// debates have no audio to upload — the full JSON perspectives + moderator
// data is stored directly in the shared_debates row by the RPC.
//
// Public API:
//   shareDebateToWorkspace(workspaceId, debateId)
//   removeSharedDebate(workspaceId, debateId)
//   getWorkspaceSharedDebates(workspaceId)
//   getSharedDebateById(workspaceId, sharedId)
//   getWorkspacesDebateIsSharedTo(debateId)
//   trackDebateView(sharedId)          — fire-and-forget
//   trackDebateDownload(sharedId)
//   sharedDebateToSession(sd)          — convert for export/render reuse

import { supabase } from '../lib/supabase';
import {
  SharedDebate,
  DebatePerspective,
  DebateModerator,
  DebateAgentRole,
  DebateSession,
  DebateStatus,
} from '../types';

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapSharedDebateRow(row: Record<string, unknown>): SharedDebate {
  const get = (prefixed: string, plain: string) =>
    row[prefixed] !== undefined ? row[prefixed] : row[plain];

  return {
    id:                 (get('out_id',                   'id'))                    as string,
    workspaceId:        (get('out_workspace_id',          'workspace_id'))          as string,
    debateId:           (get('out_debate_id',             'debate_id'))             as string,
    sharedBy:           (get('out_shared_by',             'shared_by'))             as string,
    reportId:           ((get('out_report_id',            'report_id') as string)  ?? undefined),
    topic:              (get('out_topic',                 'topic'))                 as string,
    question:           ((get('out_question',             'question') as string)   ?? ''),
    agentRoles:         ((get('out_agent_roles',          'agent_roles') as DebateAgentRole[]) ?? []),
    searchResultsCount: ((get('out_search_results_count', 'search_results_count') as number) ?? 0),
    perspectives:       ((get('out_perspectives',         'perspectives') as DebatePerspective[]) ?? []),
    moderator:          ((get('out_moderator',            'moderator') as DebateModerator) ?? null),
    debateStatus:       ((get('out_debate_status',        'debate_status') as DebateStatus) ?? 'completed'),
    viewCount:          ((get('out_view_count',           'view_count') as number)    ?? 0),
    downloadCount:      ((get('out_download_count',       'download_count') as number) ?? 0),
    debateCreatedAt:    ((get('out_debate_created_at',    'debate_created_at') as string) ?? undefined),
    debateCompletedAt:  ((get('out_debate_completed_at',  'debate_completed_at') as string) ?? undefined),
    sharedAt:           (get('out_shared_at',             'shared_at'))             as string,
    sharerName:         ((get('out_sharer_name',          'sharer_name') as string) ?? undefined),
    sharerAvatar:       ((get('out_sharer_avatar',        'sharer_avatar') as string) ?? undefined),
  };
}

// ─── Share a debate into a workspace ─────────────────────────────────────────

export async function shareDebateToWorkspace(
  workspaceId: string,
  debateId:    string,
): Promise<{ data: SharedDebate | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('share_debate_to_workspace', {
      p_workspace_id: workspaceId,
      p_debate_id:    debateId,
    });

    if (error) {
      console.error('[shareDebateToWorkspace] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const row  = rows[0] ?? (data as Record<string, unknown>);
    if (!row) throw new Error('No data returned from share_debate_to_workspace RPC');

    return { data: mapSharedDebateRow(row), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to share debate';
    const cleaned = msg
      .replace('new row violates row-level security', 'Permission denied — you need editor or owner role')
      .replace('duplicate key value violates unique constraint', 'Already shared to this workspace')
      .replace('debate_not_found', 'Debate not found or you do not own it')
      .replace('debate_not_complete', 'Only completed debates can be shared')
      .replace('permission_denied', 'Only editors and owners can share content');
    return { data: null, error: cleaned };
  }
}

// ─── Remove a shared debate ───────────────────────────────────────────────────

export async function removeSharedDebate(
  workspaceId: string,
  debateId:    string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('remove_shared_debate', {
      p_workspace_id: workspaceId,
      p_debate_id:    debateId,
    });

    if (error) {
      console.error('[removeSharedDebate] RPC error:', error);
      throw error;
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove shared debate' };
  }
}

// ─── Get all shared debates for a workspace ───────────────────────────────────

export async function getWorkspaceSharedDebates(
  workspaceId: string,
): Promise<{ data: SharedDebate[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_shared_debates', {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error('[getWorkspaceSharedDebates] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapSharedDebateRow), error: null };
  } catch (err) {
    return {
      data:  [],
      error: err instanceof Error ? err.message : 'Failed to load shared debates',
    };
  }
}

// ─── Get a single shared debate ───────────────────────────────────────────────

export async function getSharedDebateById(
  workspaceId: string,
  sharedId:    string,
): Promise<{ data: SharedDebate | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_debate_by_id', {
      p_workspace_id: workspaceId,
      p_shared_id:    sharedId,
    });

    if (error) {
      console.error('[getSharedDebateById] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) {
      return { data: null, error: 'Debate not found or not shared to this workspace.' };
    }

    return { data: mapSharedDebateRow(rows[0]), error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load shared debate',
    };
  }
}

// ─── Get workspace IDs a debate is already shared to ─────────────────────────

export async function getWorkspacesDebateIsSharedTo(
  debateId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_workspaces_debate_is_shared_to', {
      p_debate_id: debateId,
    });

    if (error) {
      console.warn('[getWorkspacesDebateIsSharedTo] error:', error);
      return [];
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return rows.map(r => (r.out_workspace_id ?? r.workspace_id) as string);
  } catch {
    return [];
  }
}

// ─── Track views (fire-and-forget) ───────────────────────────────────────────

export function trackDebateView(sharedId: string): void {
  supabase
    .rpc('increment_shared_debate_views', { p_shared_id: sharedId })
    .then(({ error }) => {
      if (error) console.warn('[trackDebateView] error:', error.message);
    });
}

// ─── Track downloads ──────────────────────────────────────────────────────────

export async function trackDebateDownload(sharedId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_shared_debate_downloads', {
    p_shared_id: sharedId,
  });
  if (error) console.warn('[trackDebateDownload] error:', error.message);
}

// ─── Convert SharedDebate → DebateSession (for export/render reuse) ──────────

export function sharedDebateToSession(sd: SharedDebate): DebateSession {
  return {
    id:                 sd.debateId,
    userId:             sd.sharedBy,
    topic:              sd.topic,
    question:           sd.question,
    perspectives:       sd.perspectives,
    moderator:          sd.moderator,
    status:             sd.debateStatus,
    agentRoles:         sd.agentRoles,
    searchResultsCount: sd.searchResultsCount,
    createdAt:          sd.debateCreatedAt ?? sd.sharedAt,
    completedAt:        sd.debateCompletedAt,
  };
}