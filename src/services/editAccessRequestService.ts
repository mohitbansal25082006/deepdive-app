// src/services/editAccessRequestService.ts
// Part 12 — Viewer → Editor access request flow.
// Part 13B UPDATE:
//   • Added 'removed' to AccessRequestStatus (mirrors schema_part13.sql constraint)
//   • Added demoteEditorToViewer() — calls demote_editor_to_viewer RPC which
//     simultaneously changes the role AND marks the approved request as 'removed'
//     so the viewer sees the "you were removed as editor" banner.

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase }         from '../lib/supabase';
import { MiniProfile }      from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

// Part 13B: added 'removed'
export type AccessRequestStatus = 'pending' | 'approved' | 'denied' | 'removed';

export interface EditAccessRequest {
  id:          string;
  workspaceId: string;
  userId:      string;
  message:     string | null;
  status:      AccessRequestStatus;
  reviewedBy:  string | null;
  reviewedAt:  string | null;
  createdAt:   string;
  updatedAt:   string;
  profile?:    MiniProfile;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRequest(row: Record<string, unknown>): EditAccessRequest {
  const profileRaw = row.profile as Record<string, unknown> | undefined;
  return {
    id:          row.id           as string,
    workspaceId: row.workspace_id as string,
    userId:      row.user_id      as string,
    message:     (row.message     as string) ?? null,
    status:      row.status       as AccessRequestStatus,
    reviewedBy:  (row.reviewed_by as string) ?? null,
    reviewedAt:  (row.reviewed_at as string) ?? null,
    createdAt:   row.created_at   as string,
    updatedAt:   row.updated_at   as string,
    profile: profileRaw ? {
      id:        profileRaw.id         as string,
      username:  (profileRaw.username  as string) ?? null,
      fullName:  (profileRaw.full_name as string) ?? null,
      avatarUrl: (profileRaw.avatar_url as string) ?? null,
    } : undefined,
  };
}

// ─── Submit a request ─────────────────────────────────────────────────────────

export async function requestEditorAccess(
  workspaceId: string,
  message?:    string,
): Promise<{ data: EditAccessRequest | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('request_editor_access', {
      p_workspace_id: workspaceId,
      p_message:      message?.trim() ?? null,
    });
    if (error) throw error;
    return { data: mapRequest(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to submit request' };
  }
}

// ─── Retract own pending request ─────────────────────────────────────────────

export async function retractEditorRequest(
  workspaceId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('retract_editor_request', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to retract request' };
  }
}

// ─── Fetch pending requests (owner/editor view) ───────────────────────────────

export async function fetchPendingRequests(
  workspaceId: string,
): Promise<{ data: EditAccessRequest[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_pending_access_requests', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapRequest), error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load requests' };
  }
}

// ─── Fetch current user's own request for a workspace ────────────────────────
// Returns the MOST RECENT request so the viewer always sees current status.

export async function fetchMyRequest(
  workspaceId: string,
): Promise<{ data: EditAccessRequest | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: null };

    const { data, error } = await supabase
      .from('edit_access_requests')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data)  return { data: null, error: null };
    return { data: mapRequest(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to load request' };
  }
}

// ─── Approve a request ────────────────────────────────────────────────────────

export async function approveRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('approve_editor_request', {
      p_request_id: requestId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to approve request' };
  }
}

// ─── Deny a request ───────────────────────────────────────────────────────────

export async function denyRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('deny_editor_request', {
      p_request_id: requestId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to deny request' };
  }
}

// ─── Part 13B: Demote editor to viewer ───────────────────────────────────────
// Calls the SECURITY DEFINER RPC that:
//   1. Changes role to 'viewer' in workspace_members
//   2. Marks the most recent approved request as 'removed'
//
// Use this instead of a plain updateMemberRole when the target is currently
// an editor so that the viewer gets the "you were removed" notification.

export async function demoteEditorToViewer(
  workspaceId: string,
  userId:      string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('demote_editor_to_viewer', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to demote member' };
  }
}

// ─── Realtime subscription for access requests ────────────────────────────────
// Owners use this to get notified instantly when a viewer makes a request.

export function subscribeToAccessRequests(
  workspaceId: string,
  callbacks: {
    onInsert: (request: EditAccessRequest) => void;
    onUpdate: (request: EditAccessRequest) => void;
  },
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`workspace:${workspaceId}:access_requests`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'edit_access_requests',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      async (payload) => {
        const row = payload.new as Record<string, unknown>;
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', row.user_id as string)
          .single();

        const p = profileRow as Record<string, unknown> | null;
        callbacks.onInsert(mapRequest({
          ...row,
          profile: p ? {
            id:         p.id,
            username:   p.username,
            full_name:  p.full_name,
            avatar_url: p.avatar_url,
          } : undefined,
        }));
      },
    )
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'edit_access_requests',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        callbacks.onUpdate(mapRequest(payload.new as Record<string, unknown>));
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ─── Realtime subscription for viewer's OWN request ──────────────────────────
// The viewer uses this to get notified when the owner approves, denies,
// or removes their editor access (status changes to 'removed').

export function subscribeToMyRequest(
  workspaceId: string,
  userId:      string,
  onUpdate:    (request: EditAccessRequest) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`my_request:${workspaceId}:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'edit_access_requests',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Only notify the specific user
        if (row.user_id === userId) {
          onUpdate(mapRequest(row));
        }
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}