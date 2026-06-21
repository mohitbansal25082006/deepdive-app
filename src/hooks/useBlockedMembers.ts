// src/hooks/useBlockedMembers.ts
// Part 13B — Manages the blocked-members list for workspace owners.
// Part 52.2 FOLLOW-UP (Fix 2): unblocking a member now logs a "unblocked"
//   Activity entry with both the target's and the actor's names.

import { useState, useCallback, useRef, useEffect } from 'react';
import { BlockedMember }          from '../types';
import {
  getBlockedMembers,
  blockMember,
  unblockMember,
} from '../services/blockService';
import { logMemberUnblocked, resolveActorName } from '../services/activityService';

interface State {
  blocked:     BlockedMember[];
  isLoading:   boolean;
  isActioning: boolean;
  error:       string | null;
}

// Defensive name extraction — BlockedMember shape has varied across parts.
function blockedNameOf(b: BlockedMember | undefined): string {
  if (!b) return 'a member';
  const any = b as any;
  return (
    any.fullName ??
    any.full_name ??
    any.username ??
    any.profile?.fullName ??
    any.profile?.full_name ??
    any.profile?.username ??
    'a member'
  );
}

export function useBlockedMembers(workspaceId: string | null) {
  const [state, setState] = useState<State>({
    blocked:     [],
    isLoading:   false,
    isActioning: false,
    error:       null,
  });

  // Live ref so unblock() can resolve the name before the row leaves the list.
  const blockedRef = useRef<BlockedMember[]>([]);
  useEffect(() => { blockedRef.current = state.blocked; }, [state.blocked]);

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

  // ── Unblock (Fix 2: log "unblocked <name>") ─────────────────────────────────
  const unblock = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setState((s) => ({ ...s, isActioning: true, error: null }));

    // Resolve the blocked member's name before the row is removed.
    const target = blockedRef.current.find((b) => (b as any).blockedUserId === userId || (b as any).userId === userId);
    const unblockedName = blockedNameOf(target);

    const { error } = await unblockMember(workspaceId, userId);
    if (!error) {
      // Optimistic remove from list
      setState((s) => ({
        ...s,
        isActioning: false,
        blocked: s.blocked.filter((b) => (b as any).blockedUserId !== userId && (b as any).userId !== userId),
      }));

      const unblockedByName = await resolveActorName();
      logMemberUnblocked({
        workspaceId,
        unblockedUserId: userId,
        unblockedName,
        unblockedByName,
      }).catch(() => {});
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