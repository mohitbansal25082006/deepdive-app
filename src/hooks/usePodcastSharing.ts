// src/hooks/usePodcastSharing.ts
// Part 46 — Auto-reloads when realtime shared podcast events fire.
// Part 51 UPDATE — Deferred loading via `enabled` (default true) + `hasLoaded`.
// Part 52.2 FOLLOW-UP — Activity logging for podcast share/remove is now done
//   server-side by DB triggers on shared_podcasts (see schema_part52_2.sql §9),
//   so this hook no longer logs anything itself. One correct entry per action,
//   regardless of which client path triggers the share/remove.
//
// All Part 15 behaviour preserved.

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
  sharedContentVersion?: number,
  enabled: boolean = true,
) {
  const [state, setState] = useState<SharedPodcastState>({
    podcasts:  [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  const [hasLoaded, setHasLoaded] = useState(false);
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);
  const notMemberRef   = useRef(false);

  const patch = useCallback((partial: Partial<SharedPodcastState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared podcasts ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedPodcasts(workspaceId);

    if (notMember) {
      notMemberRef.current = true;
      patch({ podcasts: [], isLoading: false, error: null });
      setHasLoaded(true);
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ podcasts: data, isLoading: false, error: null });
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

  // ── Share a podcast (activity logged server-side via trigger) ──────────
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

  // ── Remove a shared podcast (activity logged server-side via trigger) ──
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
    hasLoaded,
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