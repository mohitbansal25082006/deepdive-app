// src/hooks/useVoiceDebateSharing.ts
// Part 46 UPDATE — Auto-reloads when realtime shared voice debate events fire.
//
// Accepts optional sharedContentVersion from useWorkspace.
// When it changes, load() is called automatically so the Shared tab
// Voice Debates section updates without any manual refresh.
//
// All Part 44 behaviour preserved exactly.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWorkspaceSharedVoiceDebates,
  shareVoiceDebateToWorkspace,
  removeSharedVoiceDebate,
  getWorkspacesVoiceDebateIsSharedTo,
} from '../services/voiceDebateSharingService';
import type { SharedVoiceDebate } from '../types/voiceDebateSharing';

interface VoiceDebateSharingState {
  voiceDebates: SharedVoiceDebate[];
  isLoading:    boolean;
  isSharing:    boolean;
  error:        string | null;
}

export function useVoiceDebateSharing(
  workspaceId: string | null,
  // Part 46: optional realtime version counter
  sharedContentVersion?: number,
) {
  const [state, setState] = useState<VoiceDebateSharingState>({
    voiceDebates: [],
    isLoading:    false,
    isSharing:    false,
    error:        null,
  });
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);

  const patch = useCallback((partial: Partial<VoiceDebateSharingState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load shared voice debates ──────────────────────────────────────────
  // Part 46 FIX: stop retrying when user is confirmed not-a-member
  const notMemberRef = useRef(false);

  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedVoiceDebates(workspaceId);

    // Part 46 FIX: service now returns notMember:true for membership errors
    if (notMember) {
      notMemberRef.current = true;
      patch({ voiceDebates: [], isLoading: false, error: null });
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ voiceDebates: data, isLoading: false, error: null });
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

  // ── Share a voice debate ───────────────────────────────────────────────
  const share = useCallback(async (
    voiceDebateId: string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };
    patch({ isSharing: true, error: null });
    const { error } = await shareVoiceDebateToWorkspace(workspaceId, voiceDebateId);
    patch({ isSharing: false });
    if (!error) await load();
    else patch({ error });
    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove a shared voice debate ───────────────────────────────────────
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

  return {
    voiceDebates: state.voiceDebates,
    isLoading:    state.isLoading,
    isSharing:    state.isSharing,
    error:        state.error,
    load,
    share,
    remove,
  };
}

// ─── useVoiceDebateSharedWorkspaces ──────────────────────────────────────────

export function useVoiceDebateSharedWorkspaces(
  voiceDebateId: string | null | undefined,
) {
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