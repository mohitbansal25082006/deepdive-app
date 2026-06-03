// src/hooks/useWorkspaceList.ts
// Part 46 UPDATE — Integrates useWorkspaceListRealtime so:
//   • Workspace card disappears instantly when the current user is
//     removed (by owner) or blocked — no manual refresh needed.
//   • Workspace card appears instantly when the current user joins.
//   • Role pill on WorkspaceCard updates instantly when owner changes
//     the current user's role in any workspace.
//
// Previously this hook subscribed to workspace_members with
// filter: `user_id=eq.${user.id}` and called load() on ANY change.
// That still works but is now also handled via useWorkspaceListRealtime
// which gives us the workspace_id from the DELETE payload (REPLICA IDENTITY FULL)
// so we can remove the specific card without a full reload.
//
// All Part 10 behaviour is preserved.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Workspace, WorkspaceListState } from '../types';
import { listUserWorkspaces, createWorkspace } from '../services/workspaceService';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceListRealtime } from './useWorkspaceListRealtime';

export function useWorkspaceList() {
  const { user } = useAuth();
  const [state, setState] = useState<WorkspaceListState>({
    workspaces: [], isLoading: true, error: null,
  });
  // Keep a ref to avoid stale closures in realtime callbacks
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Full reload from DB ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setState(s => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await listUserWorkspaces();
    setState({ workspaces: data, isLoading: false, error });
  }, [user]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  // ── Part 46: Realtime — targeted workspace list mutations ─────────────────
  // Instead of a full reload on every change (which causes flicker),
  // we surgically add/remove/update workspace cards based on the event.
  useWorkspaceListRealtime({
    onJoined: (workspaceId) => {
      // User joined a new workspace — reload to get the full workspace object
      // (we need name, description, avatar, etc. which aren't in the member row)
      load();
    },

    onRemoved: (workspaceId) => {
      // Part 46: Instantly remove the workspace card — no full reload needed.
      // This fires when the owner removes the current user OR when they leave.
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.filter(ws => ws.id !== workspaceId),
      }));
    },

    onBlocked: (workspaceId) => {
      // Part 46: Instantly remove the workspace card when the user is blocked.
      // The member row DELETE fires first (handled by onRemoved above),
      // but workspace_blocked_members INSERT is a backup signal.
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.filter(ws => ws.id !== workspaceId),
      }));
    },

    onRoleChanged: (workspaceId, newRole) => {
      // Part 46: Update the role pill on the workspace card instantly.
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.map(ws =>
          ws.id === workspaceId
            ? { ...ws, userRole: newRole as Workspace['userRole'] }
            : ws,
        ),
      }));
    },
  });

  // ── Create workspace ──────────────────────────────────────────────────────
  const create = useCallback(async (
    name: string,
    description?: string,
  ): Promise<{ workspace: Workspace | null; error: string | null }> => {
    const { data, error } = await createWorkspace(name, description);
    if (data) {
      setState(s => ({ ...s, workspaces: [data, ...s.workspaces] }));
    }
    return { workspace: data, error };
  }, []);

  return { ...state, refresh: load, create };
}