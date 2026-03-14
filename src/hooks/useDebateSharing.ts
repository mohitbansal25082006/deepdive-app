// src/hooks/useDebateSharing.ts
// Part 16 — Manages state for debate sharing into/out of workspaces.
//
// Two exported hooks:
//   useDebateSharing(workspaceId)
//     → lists all shared debates in a workspace, share/remove actions
//   useDebateSharedWorkspaces(debateId)
//     → tells you which workspaces a debate is already shared to
//       (used in the share modal to show "Shared ✓" badges)

import { useState, useEffect, useCallback } from 'react';
import {
  getWorkspaceSharedDebates,
  shareDebateToWorkspace,
  removeSharedDebate,
  getWorkspacesDebateIsSharedTo,
} from '../services/debateSharingService';
import { SharedDebate, SharedDebateState } from '../types';

// ─── useDebateSharing ─────────────────────────────────────────────────────────

export function useDebateSharing(workspaceId: string | null) {
  const [state, setState] = useState<SharedDebateState>({
    debates:   [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });

  const patch = useCallback((partial: Partial<SharedDebateState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared debates ───────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!workspaceId) return;
    patch({ isLoading: true, error: null });

    const { data, error } = await getWorkspaceSharedDebates(workspaceId);

    if (error) {
      console.error('[useDebateSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ debates: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  // Auto-load when workspaceId changes
  useEffect(() => {
    if (workspaceId) load();
  }, [workspaceId, load]);

  // ── Share a debate ────────────────────────────────────────────────────────

  const share = useCallback(async (
    debateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };

    patch({ isSharing: true, error: null });

    const { error } = await shareDebateToWorkspace(workspaceId, debateId);

    patch({ isSharing: false });

    if (!error) {
      // Reload to get the fresh row with sharer info
      await load();
    } else {
      patch({ error });
    }

    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared debate ────────────────────────────────────────────────

  const remove = useCallback(async (
    debateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };

    const { error } = await removeSharedDebate(workspaceId, debateId);

    if (!error) {
      // Optimistic removal
      setState(prev => ({
        ...prev,
        debates: prev.debates.filter(d => d.debateId !== debateId),
      }));
    }

    return { error };
  }, [workspaceId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalPerspectives = state.debates.reduce(
    (sum, d) => sum + (d.perspectives?.length ?? 0),
    0,
  );

  return {
    debates:           state.debates,
    isLoading:         state.isLoading,
    isSharing:         state.isSharing,
    error:             state.error,
    totalPerspectives,
    load,
    share,
    remove,
  };
}

// ─── useDebateSharedWorkspaces ────────────────────────────────────────────────
// Lightweight hook: used by debate-detail to know which workspaces
// a specific debate is already shared to.

export function useDebateSharedWorkspaces(debateId: string | null | undefined) {
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!debateId) return;
    setIsLoading(true);
    try {
      const ids = await getWorkspacesDebateIsSharedTo(debateId);
      setWorkspaceIds(ids);
    } catch {
      setWorkspaceIds([]);
    } finally {
      setIsLoading(false);
    }
  }, [debateId]);

  useEffect(() => { load(); }, [load]);

  const isSharedTo = useCallback(
    (wid: string) => workspaceIds.includes(wid),
    [workspaceIds],
  );

  return { workspaceIds, isLoading, isSharedTo, reload: load };
}