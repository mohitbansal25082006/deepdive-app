// src/hooks/useWorkspaceListDeleteRealtime.ts
// Part 52 — Feature 1 (Teams-tab side of delete + settings).
//
//   useWorkspaceListRealtime (Part 46) already removes a card when the current
//   user is removed/blocked via the "workspace_member_removed:{user_id}" kick
//   channel. Part 52's delete trigger fans out a kick message with
//   type='workspace_deleted' on that SAME channel — so the existing onRemoved
//   handler already deletes the card. Good.
//
//   What the Teams tab DIDN'T have before Part 52:
//     • Live update of a card's NAME / DESCRIPTION / AVATAR when the owner or an
//       editor edits the workspace in settings. The card just showed stale data
//       until a manual refresh.
//
//   This hook subscribes once (per current user) to a settings channel for
//   EACH workspace the user belongs to and patches the matching card in place.
//   It is additive — it does not touch the kick/join/role logic, which stays in
//   useWorkspaceListRealtime.
//
//   Implementation note: we cannot know every workspace_id up front cheaply, so
//   instead of N channels we listen on postgres_changes UPDATE of the
//   workspaces table (INSERT/UPDATE carry full payload.new under RLS) filtered
//   to nothing — RLS already restricts which workspace rows the user can read,
//   so they only receive updates for workspaces they're a member of. This is
//   one channel total and scales fine for the Teams tab.

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Options {
  /** Patch a single workspace card's name/description/avatar in place. */
  onWorkspaceUpdated?: (
    workspaceId: string,
    updates: { name?: string | null; description?: string | null; avatarUrl?: string | null },
  ) => void;
}

export function useWorkspaceListDeleteRealtime(options: Options) {
  const { user } = useAuth();
  const cbRef    = useRef(options);

  useEffect(() => { cbRef.current = options; }, [options]);

  useEffect(() => {
    if (!user?.id) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // ── Postgres Changes: workspaces UPDATE ────────────────────────────────
    // RLS on `workspaces` already limits readable rows to ones the user is a
    // member of, so an unfiltered subscription only delivers relevant updates.
    const wsChannel = supabase
      .channel(`p52:list:user:${user.id}:ws_update`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'workspaces' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const id  = row.id as string | undefined;
          if (!id) return;
          cbRef.current.onWorkspaceUpdated?.(id, {
            name:        (row.name        as string | null) ?? undefined,
            description: (row.description as string | null) ?? undefined,
            avatarUrl:   (row.avatar_url  as string | null) ?? undefined,
          });
        },
      )
      .subscribe();
    channels.push(wsChannel);

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [user?.id]);
}