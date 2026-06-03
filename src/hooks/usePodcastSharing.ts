// src/hooks/usePodcastSharing.ts
// Part 46 UPDATE — Auto-reloads when realtime shared podcast events fire.
//
// Accepts optional sharedContentVersion from useWorkspace.
// When it changes, load() is called automatically so the Shared tab
// podcast section updates without any manual refresh.
//
// All Part 15 behaviour preserved exactly.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWorkspaceSharedPodcasts,
  sharePodcastToWorkspace,
  removeSharedPodcast,
  getWorkspacesPodcastIsSharedTo,
} from '../services/podcastSharingService';
import { SharedPodcast, SharedPodcastState } from '../types';

export function usePodcastSharing(
  workspaceId: string | null,
  // Part 46: optional realtime version counter
  sharedContentVersion?: number,
) {
  const [state, setState] = useState<SharedPodcastState>({
    podcasts:  [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);

  const patch = useCallback((partial: Partial<SharedPodcastState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared podcasts ───────────────────────────────────────────────
  // Part 46 FIX: stop retrying when user is confirmed not-a-member
  const notMemberRef = useRef(false);

  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedPodcasts(workspaceId);

    // Part 46 FIX: service now returns notMember:true for membership errors
    if (notMember) {
      notMemberRef.current = true;
      patch({ podcasts: [], isLoading: false, error: null });
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ podcasts: data, isLoading: false, error: null });
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

  // ── Share a podcast ────────────────────────────────────────────────────
  const share = useCallback(async (
    podcastId: string,
    reportId?: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };
    patch({ isSharing: true, error: null });
    const { error } = await sharePodcastToWorkspace(workspaceId, podcastId, reportId);
    patch({ isSharing: false });
    if (!error) await load();
    else patch({ error });
    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared podcast ────────────────────────────────────────────
  const remove = useCallback(async (
    podcastId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };
    const { error } = await removeSharedPodcast(workspaceId, podcastId);
    if (!error) {
      setState(prev => ({
        ...prev,
        podcasts: prev.podcasts.filter(p => p.podcastId !== podcastId),
      }));
    }
    return { error };
  }, [workspaceId]);

  // ── Derived ────────────────────────────────────────────────────────────
  const totalMinutes = Math.round(
    state.podcasts.reduce((sum, p) => sum + p.durationSeconds, 0) / 60,
  );

  return {
    podcasts:     state.podcasts,
    isLoading:    state.isLoading,
    isSharing:    state.isSharing,
    error:        state.error,
    totalMinutes,
    load,
    share,
    remove,
  };
}

// ─── usePodcastSharedWorkspaces ───────────────────────────────────────────────

export function usePodcastSharedWorkspaces(podcastId: string | null | undefined) {
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!podcastId) return;
    setIsLoading(true);
    try {
      const ids = await getWorkspacesPodcastIsSharedTo(podcastId);
      setWorkspaceIds(ids);
    } catch {
      setWorkspaceIds([]);
    } finally {
      setIsLoading(false);
    }
  }, [podcastId]);

  useEffect(() => { load(); }, [load]);

  const isSharedTo = useCallback(
    (wid: string) => workspaceIds.includes(wid),
    [workspaceIds],
  );

  return { workspaceIds, isLoading, isSharedTo, reload: load };
}