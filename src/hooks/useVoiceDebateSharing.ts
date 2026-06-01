// src/hooks/useVoiceDebateSharing.ts
// Part 44 — Manages state for voice debate sharing into/out of workspaces.
//
// Two exported hooks (mirrors useDebateSharing from Part 16):
//
//   useVoiceDebateSharing(workspaceId)
//     → lists all shared voice debates in a workspace, share/remove actions
//
//   useVoiceDebateSharedWorkspaces(voiceDebateId)
//     → tells you which workspaces a voice debate is already shared to
//       (used in the share modal to show "Shared ✓" badges)

import { useState, useEffect, useCallback } from 'react';
import {
  getWorkspaceSharedVoiceDebates,
  shareVoiceDebateToWorkspace,
  removeSharedVoiceDebate,
  getWorkspacesVoiceDebateIsSharedTo,
} from '../services/voiceDebateSharingService';
import type { SharedVoiceDebate, SharedVoiceDebateState } from '../types/voiceDebateSharing';

// ─── useVoiceDebateSharing ────────────────────────────────────────────────────

export function useVoiceDebateSharing(workspaceId: string | null) {
  const [state, setState] = useState<SharedVoiceDebateState>({
    voiceDebates: [],
    isLoading:    false,
    isSharing:    false,
    error:        null,
  });

  const patch = useCallback((partial: Partial<SharedVoiceDebateState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared voice debates ─────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!workspaceId) return;
    patch({ isLoading: true, error: null });

    const { data, error } = await getWorkspaceSharedVoiceDebates(workspaceId);

    if (error) {
      console.error('[useVoiceDebateSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ voiceDebates: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  useEffect(() => {
    if (workspaceId) load();
  }, [workspaceId, load]);

  // ── Share a voice debate ──────────────────────────────────────────────────

  const share = useCallback(async (
    voiceDebateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };

    patch({ isSharing: true, error: null });

    const { error } = await shareVoiceDebateToWorkspace(workspaceId, voiceDebateId);

    patch({ isSharing: false });

    if (!error) {
      await load();
    } else {
      patch({ error });
    }

    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared voice debate ──────────────────────────────────────────

  const remove = useCallback(async (
    voiceDebateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };

    const { error } = await removeSharedVoiceDebate(workspaceId, voiceDebateId);

    if (!error) {
      setState(prev => ({
        ...prev,
        voiceDebates: prev.voiceDebates.filter(vd => vd.voiceDebateId !== voiceDebateId),
      }));
    }

    return { error };
  }, [workspaceId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalMinutes = Math.round(
    state.voiceDebates.reduce((sum, vd) => sum + vd.durationSeconds, 0) / 60
  );

  return {
    voiceDebates: state.voiceDebates,
    isLoading:    state.isLoading,
    isSharing:    state.isSharing,
    error:        state.error,
    totalMinutes,
    load,
    share,
    remove,
  };
}

// ─── useVoiceDebateSharedWorkspaces ──────────────────────────────────────────
// Lightweight hook used by voice-debate-player / debate-detail to know which
// workspaces a specific voice debate is already shared to.

export function useVoiceDebateSharedWorkspaces(voiceDebateId: string | null | undefined) {
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!voiceDebateId) return;
    setIsLoading(true);
    try {
      const ids = await getWorkspacesVoiceDebateIsSharedTo(voiceDebateId);
      setWorkspaceIds(ids);
    } catch {
      setWorkspaceIds([]);
    } finally {
      setIsLoading(false);
    }
  }, [voiceDebateId]);

  useEffect(() => { load(); }, [load]);

  const isSharedTo = useCallback(
    (wid: string) => workspaceIds.includes(wid),
    [workspaceIds],
  );

  return { workspaceIds, isLoading, isSharedTo, reload: load };
}