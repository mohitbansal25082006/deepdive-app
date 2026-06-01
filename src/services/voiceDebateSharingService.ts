// src/services/voiceDebateSharingService.ts
// Part 44 — Sharing voice debates to workspaces.
//
// Pattern mirrors podcastSharingService.ts (Part 15) exactly.
// Audio is already uploaded to Supabase Storage before sharing —
// the share_voice_debate_to_workspace RPC validates audio_all_uploaded=true
// and copies the cloud URLs into shared_voice_debates.
//
// PUBLIC API:
//   shareVoiceDebateToWorkspace(workspaceId, voiceDebateId)
//   removeSharedVoiceDebate(workspaceId, voiceDebateId)
//   getWorkspaceSharedVoiceDebates(workspaceId)
//   getSharedVoiceDebateById(workspaceId, sharedId)
//   getWorkspacesVoiceDebateIsSharedTo(voiceDebateId)
//   trackVoiceDebateView(sharedId)   — fire-and-forget
//   trackVoiceDebateDownload(sharedId)
//   updateSharedDebateVoiceAudio(voiceDebateId, sessionId, audioUrls, allUploaded)
//     — called when voice debate is generated AFTER debate is already shared

import { supabase } from '../lib/supabase';
import type { SharedVoiceDebate } from '../types/voiceDebateSharing';
import type { VoiceDebateScript } from '../types/voiceDebate';

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapSharedVoiceDebateRow(row: Record<string, unknown>): SharedVoiceDebate {
  const get = (prefixed: string, plain: string) =>
    row[prefixed] !== undefined ? row[prefixed] : row[plain];

  return {
    id:                (get('out_id',                   'id'))                    as string,
    workspaceId:       (get('out_workspace_id',          'workspace_id'))          as string,
    voiceDebateId:     (get('out_voice_debate_id',       'voice_debate_id'))       as string,
    debateSessionId:   (get('out_debate_session_id',     'debate_session_id'))     as string,
    sharedBy:          (get('out_shared_by',             'shared_by'))             as string,
    topic:             (get('out_topic',                 'topic'))                 as string,
    question:          ((get('out_question',             'question') as string)    ?? ''),
    script:            ((get('out_script',               'script') as VoiceDebateScript)
                        ?? { turns: [], segments: [], totalWords: 0, estimatedDurationMinutes: 0, generatedAt: '' }),
    totalTurns:        ((get('out_total_turns',          'total_turns') as number) ?? 0),
    durationSeconds:   ((get('out_duration_seconds',     'duration_seconds') as number) ?? 0),
    wordCount:         ((get('out_word_count',           'word_count') as number)  ?? 0),
    audioStorageUrls:  ((get('out_audio_storage_urls',   'audio_storage_urls') as string[]) ?? []),
    audioAllUploaded:  ((get('out_audio_all_uploaded',   'audio_all_uploaded') as boolean) ?? false),
    viewCount:         ((get('out_view_count',           'view_count') as number)  ?? 0),
    downloadCount:     ((get('out_download_count',       'download_count') as number) ?? 0),
    debateCreatedAt:   ((get('out_debate_created_at',    'debate_created_at') as string) ?? undefined),
    debateCompletedAt: ((get('out_debate_completed_at',  'debate_completed_at') as string) ?? undefined),
    sharedAt:          (get('out_shared_at',             'shared_at'))             as string,
    sharerName:        ((get('out_sharer_name',          'sharer_name') as string) ?? undefined),
    sharerAvatar:      ((get('out_sharer_avatar',        'sharer_avatar') as string) ?? undefined),
  };
}

// ─── Share a voice debate to a workspace ─────────────────────────────────────
//
// IMPORTANT: Audio must be fully uploaded before calling this.
// The RPC validates audio_all_uploaded = TRUE and will throw if not.
// Use useVoiceDebate.state.voiceDebate.audioAllUploaded to check first.

export async function shareVoiceDebateToWorkspace(
  workspaceId:    string,
  voiceDebateId:  string,
): Promise<{ data: SharedVoiceDebate | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('share_voice_debate_to_workspace', {
      p_workspace_id:    workspaceId,
      p_voice_debate_id: voiceDebateId,
    });

    if (error) {
      console.error('[shareVoiceDebateToWorkspace] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const row  = rows[0] ?? (data as Record<string, unknown>);
    if (!row) throw new Error('No data returned from share_voice_debate_to_workspace RPC');

    return { data: mapSharedVoiceDebateRow(row), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to share voice debate';
    const cleaned = msg
      .replace('new row violates row-level security', 'Permission denied — you need editor or owner role')
      .replace('duplicate key value violates unique constraint', 'Already shared to this workspace')
      .replace('voice_debate_not_found', 'Voice debate not found or you do not own it')
      .replace('voice_debate_not_complete', 'Only completed voice debates can be shared')
      .replace('audio_not_uploaded', 'Upload audio to cloud first before sharing to workspace')
      .replace('permission_denied', 'Only editors and owners can share content');
    return { data: null, error: cleaned };
  }
}

// ─── Remove a shared voice debate ─────────────────────────────────────────────

export async function removeSharedVoiceDebate(
  workspaceId:   string,
  voiceDebateId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('remove_shared_voice_debate', {
      p_workspace_id:    workspaceId,
      p_voice_debate_id: voiceDebateId,
    });

    if (error) {
      console.error('[removeSharedVoiceDebate] RPC error:', error);
      throw error;
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove shared voice debate' };
  }
}

// ─── Get all shared voice debates for a workspace ─────────────────────────────

export async function getWorkspaceSharedVoiceDebates(
  workspaceId: string,
): Promise<{ data: SharedVoiceDebate[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_shared_voice_debates', {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error('[getWorkspaceSharedVoiceDebates] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapSharedVoiceDebateRow), error: null };
  } catch (err) {
    return {
      data:  [],
      error: err instanceof Error ? err.message : 'Failed to load shared voice debates',
    };
  }
}

// ─── Get a single shared voice debate by sharedId ─────────────────────────────

export async function getSharedVoiceDebateById(
  workspaceId: string,
  sharedId:    string,
): Promise<{ data: SharedVoiceDebate | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_voice_debate_by_id', {
      p_workspace_id: workspaceId,
      p_shared_id:    sharedId,
    });

    if (error) {
      console.error('[getSharedVoiceDebateById] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) {
      return { data: null, error: 'Voice debate not found or not shared to this workspace.' };
    }

    return { data: mapSharedVoiceDebateRow(rows[0]), error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load shared voice debate',
    };
  }
}

// ─── Get workspace IDs a voice debate is already shared to ────────────────────

export async function getWorkspacesVoiceDebateIsSharedTo(
  voiceDebateId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_workspaces_voice_debate_is_shared_to', {
      p_voice_debate_id: voiceDebateId,
    });

    if (error) {
      console.warn('[getWorkspacesVoiceDebateIsSharedTo] error:', error);
      return [];
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return rows.map(r => (r.out_workspace_id ?? r.workspace_id) as string);
  } catch {
    return [];
  }
}

// ─── Track views (fire-and-forget) ───────────────────────────────────────────

export function trackVoiceDebateView(sharedId: string): void {
  supabase
    .rpc('increment_shared_voice_debate_views', { p_shared_id: sharedId })
    .then(({ error }) => {
      if (error) console.warn('[trackVoiceDebateView] error:', error.message);
    });
}

// ─── Track downloads ──────────────────────────────────────────────────────────

export async function trackVoiceDebateDownload(sharedId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_shared_voice_debate_downloads', {
    p_shared_id: sharedId,
  });
  if (error) console.warn('[trackVoiceDebateDownload] error:', error.message);
}

// ─── Update shared copies after voice debate generated post-sharing ───────────
//
// Called from useVoiceDebate.onComplete when voice debate was generated
// AFTER the base debate was already shared to workspaces.
// Updates all shared_voice_debates rows for the same debate_session_id.

export async function updateSharedDebateVoiceAudio(
  voiceDebateId: string,
  sessionId:     string,
  audioUrls:     string[],
  allUploaded:   boolean,
): Promise<{ rowsUpdated: number; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('update_shared_debate_voice_audio', {
      p_voice_debate_id: voiceDebateId,
      p_session_id:      sessionId,
      p_audio_urls:      audioUrls,
      p_all_uploaded:    allUploaded,
    });

    if (error) {
      console.warn('[updateSharedDebateVoiceAudio] error:', error.message);
      return { rowsUpdated: 0, error: error.message };
    }

    return { rowsUpdated: (data as number) ?? 0, error: null };
  } catch (err) {
    return {
      rowsUpdated: 0,
      error:       err instanceof Error ? err.message : 'Failed to update shared voice audio',
    };
  }
}

// ─── Load workspaces the debate is shared to (for modal) ─────────────────────
// Helper used by ShareVoiceDebateToWorkspaceModal.
// Loads all workspaces where caller is editor/owner, with isShared flag per row.

export async function loadWorkspacesForVoiceDebate(
  voiceDebateId: string,
): Promise<{
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      string;
  isShared:      boolean;
}[]> {
  // Strategy: use get_user_workspaces_for_sharing with content_type='voice_debate'
  // (the RPC handles non-voice-debate content types generically via shared_workspace_content,
  // but voice debates use shared_voice_debates — so we need a custom query here).

  try {
    // 1. Load workspaces the user belongs to as editor/owner
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: memberRows, error: memberErr } = await supabase
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name, avatar_url, is_personal)')
      .eq('user_id', user.id)
      .in('role', ['owner', 'editor']);

    if (memberErr) throw memberErr;

    const workspaces = ((memberRows ?? []) as Record<string, unknown>[])
      .filter(row => {
        const ws = row.workspace as Record<string, unknown> | null;
        return ws && ws.is_personal === false;
      })
      .map(row => {
        const ws = row.workspace as Record<string, unknown>;
        return {
          workspaceId:   ws.id       as string,
          workspaceName: ws.name     as string,
          avatarUrl:     (ws.avatar_url as string) ?? null,
          userRole:      row.role    as string,
          isShared:      false,
        };
      });

    if (workspaces.length === 0) return [];

    // 2. Check which are already shared
    const ids = workspaces.map(w => w.workspaceId);
    const { data: sharedRows } = await supabase
      .from('shared_voice_debates')
      .select('workspace_id')
      .eq('voice_debate_id', voiceDebateId)
      .in('workspace_id', ids);

    const sharedSet = new Set(
      ((sharedRows ?? []) as { workspace_id: string }[]).map(r => r.workspace_id)
    );

    return workspaces.map(w => ({ ...w, isShared: sharedSet.has(w.workspaceId) }));
  } catch (err) {
    console.error('[loadWorkspacesForVoiceDebate]', err);
    return [];
  }
}