// src/hooks/useDebateSharing.ts
// Part 46 — Auto-reloads when realtime shared debate events fire.
// Part 51 UPDATE — Deferred loading via `enabled` (default true) + `hasLoaded`.
//   Debate section only fetches once the Shared tab is opened.
//
// All Part 16 behaviour preserved.

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
  sharedContentVersion?: number,
  enabled: boolean = true,
) {
  const [state, setState] = useState<SharedDebateState>({
    debates:   [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  const [hasLoaded, setHasLoaded] = useState(false);
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);
  const notMemberRef   = useRef(false);

  const patch = useCallback((partial: Partial<SharedDebateState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared debates ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedDebates(workspaceId);

    if (notMember) {
      notMemberRef.current = true;
      patch({ debates: [], isLoading: false, error: null });
      setHasLoaded(true);
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ debates: data, isLoading: false, error: null });
    }
    setHasLoaded(true);
  }, [workspaceId, patch]);

  // ── Reset on workspace change ──────────────────────────────────────────
  useEffect(() => {
    notMemberRef.current = false;
    setHasLoaded(false);
  }, [workspaceId]);

  // ── Part 51: load only when enabled ────────────────────────────────────
  useEffect(() => {
    if (workspaceId && enabled) {
      load();
      prevVersionRef.current = sharedContentVersion;
    }
  }, [workspaceId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload when sharedContentVersion bumps (only while enabled) ─────────
  useEffect(() => {
    if (
      enabled &&
      sharedContentVersion !== undefined &&
      sharedContentVersion !== prevVersionRef.current &&
      workspaceId
    ) {
      prevVersionRef.current = sharedContentVersion;
      load();
    }
  }, [sharedContentVersion, workspaceId, load, enabled]);

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
    hasLoaded,         // Part 51
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