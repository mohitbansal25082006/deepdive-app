// src/hooks/useWorkspaceListRealtime.ts
// Part 46 Fix 2 v3 — Uses realtime.send() triggers with simple JSON payloads.
//
// KEY FIXES:
//   1. supabase.realtime.setAuth() called before subscribing — REQUIRED for
//      private channels (realtime authorization).
//   2. Payload structure: realtime.send() delivers {type, payload: {workspace_id, ...}}
//      NOT the complex {payload: {record, old_record}} from broadcast_changes().
//   3. Channel names match EXACTLY what the SQL triggers send to.
//   4. Both remove and block send to the SAME channel "workspace_member_removed:{userId}"
//      with event name "workspace_kick" — one listener handles both.

import { useEffect, useRef } from 'react';
import { supabase }          from '../lib/supabase';
import { useAuth }           from '../context/AuthContext';

interface Options {
  onJoined?:     (workspaceId: string) => void;
  onRemoved?:    (workspaceId: string) => void;
  onRoleChanged?:(workspaceId: string, newRole: string) => void;
  onBlocked?:    (workspaceId: string) => void;
}

export function useWorkspaceListRealtime(options: Options) {
  const { user }  = useAuth();
  const cbRef     = useRef(options);

  useEffect(() => { cbRef.current = options; }, [options]);

  useEffect(() => {
    if (!user?.id) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Required for private channel authorization
    supabase.realtime.setAuth();

    // ── 1. Private Broadcast: member removed OR blocked ───────────────────
    // SQL triggers broadcast_member_removed() and broadcast_member_blocked()
    // both send to this same channel with event "workspace_kick".
    // Payload: { type: 'removed'|'blocked', workspace_id, user_id }
    const kickChannel = supabase
      .channel(`workspace_member_removed:${user.id}`, { config: { private: true } })
      .on(
        'broadcast',
        { event: 'workspace_kick' },
        (payload) => {
          // realtime.send() delivers data in payload.payload
          const data = (payload.payload ?? {}) as Record<string, unknown>;
          const workspaceId = data.workspace_id as string | undefined;
          const type        = data.type        as string | undefined;

          if (!workspaceId) return;

          if (type === 'blocked') {
            cbRef.current.onBlocked?.(workspaceId);
          }
          // Both removed and blocked should remove the card
          cbRef.current.onRemoved?.(workspaceId);
        },
      )
      .subscribe();
    channels.push(kickChannel);

    // ── 2. Postgres Changes: member INSERT (join) ─────────────────────────
    // INSERT always carries full payload.new — works with RLS.
    const joinChannel = supabase
      .channel(`p46:list:user:${user.id}:member_join`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'workspace_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onJoined?.(row.workspace_id as string);
        },
      )
      .subscribe();
    channels.push(joinChannel);

    // ── 3. Postgres Changes: member UPDATE (role change on Teams tab) ─────
    // UPDATE carries full payload.new — works with RLS.
    const roleChannel = supabase
      .channel(`p46:list:user:${user.id}:role_change`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'workspace_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onRoleChanged?.(
            row.workspace_id as string,
            row.role as string,
          );
        },
      )
      .subscribe();
    channels.push(roleChannel);

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.id]);
}