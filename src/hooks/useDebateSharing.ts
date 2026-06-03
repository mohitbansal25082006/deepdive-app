// src/hooks/useDebateSharing.ts
// Part 46 UPDATE — Auto-reloads when realtime shared debate events fire.
//
// Accepts optional sharedContentVersion from useWorkspace.
// When it changes, load() is called automatically so the Shared tab
// debate section updates without any manual refresh.
//
// All Part 16 behaviour preserved exactly.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWorkspaceSharedDebates,
  shareDebateToWorkspace,
  removeSharedDebate,
  getWorkspacesDebateIsSharedTo,
} from '../services/debateSharingService';
import { SharedDebate, SharedDebateState } from '../types';

export function useDebateSharing(
  workspaceId: string | null,
  // Part 46: optional realtime version counter
  sharedContentVersion?: number,
) {
  const [state, setState] = useState<SharedDebateState>({
    debates:   [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);

  const patch = useCallback((partial: Partial<SharedDebateState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared debates ───────────────────────────────────────────────
  // Part 46 FIX: stop retrying when user is confirmed not-a-member
  const notMemberRef = useRef(false);

  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedDebates(workspaceId);

    // Part 46 FIX: service now returns notMember:true for membership errors
    if (notMember) {
      notMemberRef.current = true;
      patch({ debates: [], isLoading: false, error: null });
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ debates: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  // ── Auto-load on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (workspaceId) {
      load();
      prevVersionRef.current = sharedContentVersion;
    }
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Part 46: Reload when sharedContentVersion bumps ───────────────────
  useEffect(() => {
    if (
      sharedContentVersion !== undefined &&
      sharedContentVersion !== prevVersionRef.current &&
      workspaceId
    ) {
      prevVersionRef.current = sharedContentVersion;
      load();
    }
  }, [sharedContentVersion, workspaceId, load]);

  // ── Share a debate ────────────────────────────────────────────────────
  const share = useCallback(async (
    debateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };
    patch({ isSharing: true, error: null });
    const { error } = await shareDebateToWorkspace(workspaceId, debateId);
    patch({ isSharing: false });
    if (!error) await load();
    else patch({ error });
    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared debate ────────────────────────────────────────────
  const remove = useCallback(async (
    debateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };
    const { error } = await removeSharedDebate(workspaceId, debateId);
    if (!error) {
      setState(prev => ({
        ...prev,
        debates: prev.debates.filter(d => d.debateId !== debateId),
      }));
    }
    return { error };
  }, [workspaceId]);

  // ── Derived ────────────────────────────────────────────────────────────
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