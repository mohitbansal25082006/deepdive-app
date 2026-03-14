// src/hooks/usePodcastSharing.ts
// Part 15 — Manages state for podcast sharing into/out of workspaces.
//
// Two export hooks:
//   usePodcastSharing(workspaceId)
//     → lists all shared podcasts in a workspace, share/remove actions
//   usePodcastSharedWorkspaces(podcastId)
//     → tells you which workspaces a podcast is already shared to
//       (used in the share modal to show "Shared ✓" badges)

import { useState, useEffect, useCallback } from 'react';
import {
  getWorkspaceSharedPodcasts,
  sharePodcastToWorkspace,
  removeSharedPodcast,
  getWorkspacesPodcastIsSharedTo,
} from '../services/podcastSharingService';
import { SharedPodcast, SharedPodcastState } from '../types';

// ─── usePodcastSharing ────────────────────────────────────────────────────────

export function usePodcastSharing(workspaceId: string | null) {
  const [state, setState] = useState<SharedPodcastState>({
    podcasts:  [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });

  const patch = useCallback((partial: Partial<SharedPodcastState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared podcasts ───────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!workspaceId) return;
    patch({ isLoading: true, error: null });

    const { data, error } = await getWorkspaceSharedPodcasts(workspaceId);

    if (error) {
      console.error('[usePodcastSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ podcasts: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  // Auto-load when workspaceId changes
  useEffect(() => {
    if (workspaceId) load();
  }, [workspaceId, load]);

  // ── Share a podcast ────────────────────────────────────────────────────────

  const share = useCallback(async (
    podcastId: string,
    reportId?: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };

    patch({ isSharing: true, error: null });

    const { error } = await sharePodcastToWorkspace(workspaceId, podcastId, reportId);

    patch({ isSharing: false });

    if (!error) {
      // Reload to get the fresh row with sharer info
      await load();
    } else {
      patch({ error });
    }

    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared podcast ────────────────────────────────────────────────

  const remove = useCallback(async (
    podcastId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };

    const { error } = await removeSharedPodcast(workspaceId, podcastId);

    if (!error) {
      // Optimistic removal
      setState(prev => ({
        ...prev,
        podcasts: prev.podcasts.filter(p => p.podcastId !== podcastId),
      }));
    }

    return { error };
  }, [workspaceId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalMinutes = Math.round(
    state.podcasts.reduce((sum, p) => sum + p.durationSeconds, 0) / 60
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
// Lightweight hook used by podcast-player / podcast tab to know which
// workspaces a specific podcast is already shared to.

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