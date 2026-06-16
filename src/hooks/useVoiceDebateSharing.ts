// src/hooks/useVoiceDebateSharing.ts
// Part 46 — Auto-reloads when realtime shared voice debate events fire.
// Part 51 UPDATE — Deferred loading via `enabled` (default true) + `hasLoaded`.
// Part 52.2 FOLLOW-UP — share/remove activity is logged server-side by DB
//   triggers on shared_voice_debates (schema_part52_2.sql §9); none here.
//
// All Part 44 behaviour preserved.

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
  sharedContentVersion?: number,
  enabled: boolean = true,
) {
  const [state, setState] = useState<VoiceDebateSharingState>({
    voiceDebates: [],
    isLoading:    false,
    isSharing:    false,
    error:        null,
  });
  const [hasLoaded, setHasLoaded] = useState(false);
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);
  const notMemberRef   = useRef(false);

  const patch = useCallback((partial: Partial<VoiceDebateSharingState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const load = useCallback(async () => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedVoiceDebates(workspaceId);

    if (notMember) {
      notMemberRef.current = true;
      patch({ voiceDebates: [], isLoading: false, error: null });
      setHasLoaded(true);
      return;
    }

    if (error) {
      patch({ isLoading: false, error });
    } else {
      patch({ voiceDebates: data, isLoading: false, error: null });
    }
    setHasLoaded(true);
  }, [workspaceId, patch]);

  useEffect(() => {
    notMemberRef.current = false;
    setHasLoaded(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId && enabled) {
      load();
      prevVersionRef.current = sharedContentVersion;
    }
  }, [workspaceId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
    hasLoaded,
    load,
    share,
    remove,
  };
}

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