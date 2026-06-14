// src/hooks/useWorkspaceSettingsRealtime.ts
// Part 52 — Feature 1: Realtime workspace settings + delete kick-out.
//
//   WHY a dedicated hook (separate from useWorkspaceRealtime):
//     useWorkspaceRealtime already covers members / reports / shared content /
//     comments. Part 52 adds TWO new realtime concerns that are about the
//     workspace ROW itself rather than its child tables:
//
//       1. workspace_updated  — name / description / avatar_url changed by the
//          owner or an editor. Every other member's screen must reflect the new
//          values instantly (workspace-detail header, settings screen, and the
//          Teams-tab card).
//
//       2. workspace_deleted  — the owner deleted the workspace. Every member
//          who is currently inside it must be kicked back to the Teams tab and
//          have the card removed from every screen, instantly.
//
//   HOW (SQL side, see schema_part52.sql):
//     • broadcast_workspace_updated()  → private channel
//         "workspace_settings:{workspace_id}"   event "workspace_updated"
//         payload { workspace_id, name, description, avatar_url }
//       Fires on UPDATE of workspaces when any of name/description/avatar_url
//       actually changes.
//
//     • broadcast_workspace_deleted()  → fires a BEFORE DELETE trigger that
//       fans out one message PER MEMBER on that member's personal kick channel
//         "workspace_member_removed:{user_id}"  event "workspace_kick"
//         payload { type: 'workspace_deleted', workspace_id, user_id }
//       This reuses the SAME channel + event the existing
//       useWorkspaceListRealtime / useWorkspaceRealtime kick handlers already
//       listen on, so the Teams-tab card removal works with zero extra wiring.
//       It ALSO broadcasts a single workspace-wide deleted signal on
//         "workspace_settings:{workspace_id}"   event "workspace_deleted"
//       so anyone currently *inside* the workspace gets navigated out even if
//       their personal kick channel races.
//
//   All callbacks are optional and fire-and-forget. SECURITY DEFINER triggers
//   bypass RLS so delivery is reliable for every member.

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface WorkspaceSettingsRealtimePayload {
  workspaceId: string;
  name?:        string | null;
  description?: string | null;
  avatarUrl?:   string | null;
}

export interface WorkspaceSettingsRealtimeCallbacks {
  /** Fired when name / description / avatar_url changes on the workspace row. */
  onSettingsUpdated?: (payload: WorkspaceSettingsRealtimePayload) => void;
  /** Fired when the workspace is deleted (current user must be kicked out). */
  onWorkspaceDeleted?: (workspaceId: string) => void;
}

let _settingsInstanceCounter = 0;

export function useWorkspaceSettingsRealtime(
  workspaceId: string | null,
  callbacks: WorkspaceSettingsRealtimeCallbacks,
) {
  const { user } = useAuth();
  const cbRef    = useRef(callbacks);
  const idRef    = useRef(`s${++_settingsInstanceCounter}`).current;

  useEffect(() => { cbRef.current = callbacks; }, [callbacks]);

  const setup = useCallback(() => {
    if (!workspaceId || !user) return () => {};

    // Required for private channel authorization
    supabase.realtime.setAuth();

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // ── 1. Workspace settings channel (update + workspace-wide delete) ──────
    // Channel: "workspace_settings:{workspace_id}"
    const settingsChannel = supabase
      .channel(`workspace_settings:${workspaceId}`, { config: { private: true } })
      .on('broadcast', { event: 'workspace_updated' }, (payload) => {
        const data = (payload.payload ?? {}) as Record<string, unknown>;
        const wsId = data.workspace_id as string | undefined;
        if (wsId !== workspaceId) return;
        cbRef.current.onSettingsUpdated?.({
          workspaceId: wsId,
          name:        (data.name        as string | null) ?? undefined,
          description: (data.description as string | null) ?? undefined,
          avatarUrl:   (data.avatar_url  as string | null) ?? undefined,
        });
      })
      .on('broadcast', { event: 'workspace_deleted' }, (payload) => {
        const data = (payload.payload ?? {}) as Record<string, unknown>;
        const wsId = data.workspace_id as string | undefined;
        if (wsId === workspaceId) {
          cbRef.current.onWorkspaceDeleted?.(workspaceId);
        }
      })
      .subscribe();
    channels.push(settingsChannel);

    // ── 2. Personal kick channel (per-member delete fan-out) ───────────────
    // Channel: "workspace_member_removed:{user_id}"   Event: "workspace_kick"
    // The BEFORE DELETE trigger fans out one message per member here with
    // type='workspace_deleted'. We only act when the workspace_id matches the
    // one we're currently viewing.
    const kickChannel = supabase
      .channel(`workspace_member_removed:${user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'workspace_kick' }, (payload) => {
        const data = (payload.payload ?? {}) as Record<string, unknown>;
        const type = data.type         as string | undefined;
        const wsId = data.workspace_id as string | undefined;
        if (type === 'workspace_deleted' && wsId === workspaceId) {
          cbRef.current.onWorkspaceDeleted?.(workspaceId);
        }
      })
      .subscribe();
    channels.push(kickChannel);

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [workspaceId, user, idRef]);

  useEffect(() => {
    const cleanup = setup();
    return cleanup;
  }, [setup]);
}