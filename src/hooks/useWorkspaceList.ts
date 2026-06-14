// src/hooks/useWorkspaceList.ts
// Part 46 UPDATE — Integrates useWorkspaceListRealtime (join/remove/block/role).
// Part 52 UPDATE —
//   Feature 1 (realtime settings on the Teams tab):
//     • Also mounts useWorkspaceListDeleteRealtime, which patches a card's
//       name / description / avatar in place when the owner or an editor edits
//       the workspace in settings — so the Teams-tab card never shows stale
//       data and updates live on every member's device.
//     • Card REMOVAL on delete is already handled by useWorkspaceListRealtime's
//       onRemoved (the Part 52 delete trigger fans out a kick on the same
//       "workspace_member_removed:{user_id}" channel it already listens on).
//
// All Part 10/46 behaviour preserved.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Workspace, WorkspaceListState } from '../types';
import { listUserWorkspaces, createWorkspace } from '../services/workspaceService';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceListRealtime } from './useWorkspaceListRealtime';
import { useWorkspaceListDeleteRealtime } from './useWorkspaceListDeleteRealtime'; // Part 52

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

  // ── Part 46: Realtime — join / remove / block / role ──────────────────────
  useWorkspaceListRealtime({
    onJoined: (workspaceId) => {
      // User joined a new workspace — reload to get the full workspace object.
      load();
    },

    onRemoved: (workspaceId) => {
      // Instantly remove the card. Fires when the owner removes the user, when
      // they leave, OR when the workspace is deleted (Part 52 delete trigger
      // fans out a kick on this same channel).
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.filter(ws => ws.id !== workspaceId),
      }));
    },

    onBlocked: (workspaceId) => {
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.filter(ws => ws.id !== workspaceId),
      }));
    },

    onRoleChanged: (workspaceId, newRole) => {
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

  // ── Part 52: Realtime — live card name/description/avatar updates ─────────
  useWorkspaceListDeleteRealtime({
    onWorkspaceUpdated: (workspaceId, updates) => {
      setState(prev => ({
        ...prev,
        workspaces: prev.workspaces.map(ws => {
          if (ws.id !== workspaceId) return ws;
          return {
            ...ws,
            name:        updates.name        !== undefined ? (updates.name ?? ws.name) : ws.name,
            description: updates.description !== undefined ? (updates.description ?? null) : ws.description,
            avatarUrl:   updates.avatarUrl   !== undefined ? (updates.avatarUrl ?? null) : ws.avatarUrl,
          };
        }),
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