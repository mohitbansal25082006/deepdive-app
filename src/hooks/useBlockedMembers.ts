// src/hooks/useBlockedMembers.ts
// Part 13B — Manages the blocked-members list for workspace owners.

import { useState, useCallback } from 'react';
import { BlockedMember }          from '../types';
import {
  getBlockedMembers,
  blockMember,
  unblockMember,
} from '../services/blockService';

interface State {
  blocked:     BlockedMember[];
  isLoading:   boolean;
  isActioning: boolean;
  error:       string | null;
}

export function useBlockedMembers(workspaceId: string | null) {
  const [state, setState] = useState<State>({
    blocked:     [],
    isLoading:   false,
    isActioning: false,
    error:       null,
  });

  // ── Load list ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await getBlockedMembers(workspaceId);
    setState({ blocked: data, isLoading: false, isActioning: false, error });
  }, [workspaceId]);

  // ── Block ──────────────────────────────────────────────────────────────────
  const block = useCallback(async (userId: string, reason?: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setState((s) => ({ ...s, isActioning: true, error: null }));
    const { error } = await blockMember(workspaceId, userId, reason);
    setState((s) => ({ ...s, isActioning: false, error }));
    return { error };
  }, [workspaceId]);

  // ── Unblock ────────────────────────────────────────────────────────────────
  const unblock = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setState((s) => ({ ...s, isActioning: true, error: null }));
    const { error } = await unblockMember(workspaceId, userId);
    if (!error) {
      // Optimistic remove from list
      setState((s) => ({
        ...s,
        isActioning: false,
        blocked: s.blocked.filter((b) => b.blockedUserId !== userId),
      }));
    } else {
      setState((s) => ({ ...s, isActioning: false, error }));
    }
    return { error };
  }, [workspaceId]);

  return {
    ...state,
    load,
    block,
    unblock,
  };
}