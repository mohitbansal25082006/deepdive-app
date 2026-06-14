// src/hooks/useWorkspaceReportRole.ts
// Part 52 (update) — Realtime role sync for the workspace REPORT screen.
//
//   PROBLEM (before this hook):
//     workspace-report.tsx received `userRole` once as a navigation param. When
//     an owner approved a viewer→editor request (or demoted an editor back to
//     viewer) WHILE that user had the report open, the report screen kept
//     showing the OLD role — edit controls didn't appear/disappear until the
//     user backed out and reopened.
//
//   FIX:
//     This tiny hook subscribes to the SAME realtime signals the rest of the
//     workspace already uses and resolves the CURRENT user's live role for a
//     workspace, seeded from the nav param so there's no flash:
//
//       • "workspace_members:{workspace_id}"  event "role_change"
//           Fired by the broadcast_member_role_change() trigger (added in
//           schema_part52_search_patch.sql) on any role change (approve a
//           viewer's request, demote an editor, ownership transfer). Payload
//           { user_id, workspace_id, role }. We act only when user_id === me.
//
//       • postgres_changes UPDATE on workspace_members (filtered to this
//           workspace) as a belt-and-suspenders fallback.
//
//       • "workspace_member_removed:{user_id}"  event "workspace_kick"
//           If the user is removed/blocked or the workspace is deleted while
//           viewing the report, onKicked fires so the screen can navigate out.
//
//   USAGE (in workspace-report.tsx):
//     const { role } = useWorkspaceReportRole(workspaceId, initialRoleParam, {
//       onKicked: () => router.back(),
//     });
//     const isEditor = role === 'editor' || role === 'owner';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { WorkspaceRole } from '../types';

interface Options {
  /** Fired if the current user is removed/blocked or the workspace is deleted. */
  onKicked?: () => void;
}

export function useWorkspaceReportRole(
  workspaceId: string | null,
  initialRole: WorkspaceRole | null,
  options: Options = {},
) {
  const { user } = useAuth();
  const [role, setRole] = useState<WorkspaceRole | null>(initialRole);
  const cbRef = useRef(options);
  useEffect(() => { cbRef.current = options; }, [options]);

  // Re-seed if the nav param changes (e.g. navigating between reports)
  useEffect(() => { setRole(initialRole); }, [initialRole]);

  // Authoritative fetch — resolves the true current role from the DB.
  const refetchRole = useCallback(async () => {
    if (!workspaceId || !user) return;
    try {
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.role) setRole(data.role as WorkspaceRole);
    } catch {
      // non-fatal — keep current role
    }
  }, [workspaceId, user]);

  useEffect(() => {
    if (!workspaceId || !user) return;

    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      // CRITICAL: authenticate the realtime socket with the EXPLICIT access
      // token BEFORE subscribing to the private channels, or RLS rejects
      // broadcast delivery (role changes / kicks would silently never arrive
      // until the socket got auth elsewhere).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      // ── 1. Broadcast: role change (PRIMARY) ──────────────────────────────
      const roleChannel = supabase
        .channel(`workspace_members:${workspaceId}`, { config: { private: true } })
        .on('broadcast', { event: 'role_change' }, (payload) => {
          const data    = (payload.payload ?? {}) as Record<string, unknown>;
          const userId  = data.user_id as string | undefined;
          const newRole = data.role    as WorkspaceRole | undefined;
          if (userId === user.id && newRole) {
            setRole(newRole);
          }
        })
        .subscribe();
      channels.push(roleChannel);

      // ── 2. postgres_changes on workspace_members (FALLBACK) ─────────────
      const pgChannel = supabase
        .channel(`p52:report-role:${workspaceId}:${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'workspace_members',
            filter: `workspace_id=eq.${workspaceId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if ((row.user_id as string) === user.id && row.role) {
              setRole(row.role as WorkspaceRole);
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'workspace_members',
            filter: `workspace_id=eq.${workspaceId}` },
          (payload) => {
            const old = payload.old as Record<string, unknown>;
            if ((old.user_id as string) === user.id) {
              cbRef.current.onKicked?.();
            }
          },
        )
        .subscribe();
      channels.push(pgChannel);

      // ── 3. Personal kick channel (removed / blocked / workspace deleted) ─
      const kickChannel = supabase
        .channel(`workspace_member_removed:${user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'workspace_kick' }, (payload) => {
          const data = (payload.payload ?? {}) as Record<string, unknown>;
          const wsId = data.workspace_id as string | undefined;
          if (wsId === workspaceId) {
            cbRef.current.onKicked?.();
          }
        })
        .subscribe();
      channels.push(kickChannel);
    })();

    // Resolve authoritative role once on mount so we never start stale.
    refetchRole();

    return () => {
      cancelled = true;
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [workspaceId, user, refetchRole]);

  return { role, refetchRole };
}