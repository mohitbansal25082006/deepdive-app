// src/hooks/useEditAccessRequest.ts
// Part 12 — Manages edit access request state for viewers and owners.
// Part 13B — Added 'removed' status + viewer realtime banner.
// Part 52 (FIX) — Feature 2 (realtime viewer→editor requests) NOW WORKS LIVE.
//
//   THE BUG (why the owner only saw a request after leaving & re-entering):
//     Private Realtime channels require the socket to be authenticated FIRST.
//     supabase.realtime.setAuth() returns a Promise, but the previous code
//     called it fire-and-forget and immediately .subscribe()'d the private
//     channel. The channel therefore subscribed BEFORE auth was applied, so
//     Realtime Authorization (RLS on realtime.messages) REJECTED broadcast
//     delivery — the owner received nothing. It only "worked" after navigating
//     away and back because by then some OTHER channel had set the auth token
//     on the socket, so the second subscribe succeeded.
//
//   THE FIX:
//     await supabase.realtime.setAuth()  BEFORE  .subscribe() on every private
//     channel, on BOTH the viewer side and the owner side. Now the broadcast
//     reaches the owner instantly on the first mount.
//
//   Channels (from schema_part52.sql broadcast_access_request_change()):
//     • owner feed:   "workspace_access_requests:{workspace_id}"  event "request_change"
//     • viewer's own: "workspace_my_request:{workspace_id}:{user_id}" event "my_request_change"
//   postgres_changes is kept as a secondary fallback.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  EditAccessRequest,
  fetchMyRequest,
  fetchPendingRequests,
  requestEditorAccess,
  retractEditorRequest,
  approveRequest,
  denyRequest,
  subscribeToAccessRequests,
  subscribeToMyRequest,
} from '../services/editAccessRequestService';
import { WorkspaceRole } from '../types';

// ─── Viewer-side hook ─────────────────────────────────────────────────────────

interface ViewerRequestState {
  myRequest:    EditAccessRequest | null;
  isLoading:    boolean;
  isSubmitting: boolean;
  error:        string | null;
}

export function useMyAccessRequest(
  workspaceId: string | null,
  userRole:    WorkspaceRole | null,
) {
  const [state, setState] = useState<ViewerRequestState>({
    myRequest:    null,
    isLoading:    true,
    isSubmitting: false,
    error:        null,
  });

  // Only viewers need to track their own request
  const shouldLoad = userRole === 'viewer' && !!workspaceId;
  const pgUnsubRef   = useRef<(() => void) | null>(null);
  const bcChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const reloadMine = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await fetchMyRequest(workspaceId);
    setState((s) => ({ ...s, myRequest: data }));
  }, [workspaceId]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldLoad) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    fetchMyRequest(workspaceId!).then(({ data, error }) => {
      setState({ myRequest: data, isLoading: false, isSubmitting: false, error });
    });
  }, [workspaceId, shouldLoad]);

  // ── Realtime broadcast (PRIMARY) + postgres_changes (fallback) ────────────
  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !workspaceId || cancelled) return;

      // CRITICAL: authenticate the realtime socket with the EXPLICIT access
      // token BEFORE subscribing to the private channel, otherwise RLS rejects
      // broadcast delivery ("permissions to read from this Topic").
      await supabase.realtime.setAuth(session!.access_token);
      if (cancelled) return;

      const bc = supabase
        .channel(`workspace_my_request:${workspaceId}:${user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'my_request_change' }, () => {
          reloadMine();
        })
        .subscribe();
      bcChannelRef.current = bc;

      // FALLBACK: postgres_changes (Part 13B behaviour)
      pgUnsubRef.current = subscribeToMyRequest(
        workspaceId,
        user.id,
        (updatedRequest) => {
          setState((s) => ({ ...s, myRequest: updatedRequest }));
        },
      );
    })();

    return () => {
      cancelled = true;
      if (bcChannelRef.current) { supabase.removeChannel(bcChannelRef.current); bcChannelRef.current = null; }
      if (pgUnsubRef.current)   { pgUnsubRef.current();                         pgUnsubRef.current = null; }
    };
  }, [workspaceId, shouldLoad, reloadMine]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(async (message?: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setState((s) => ({ ...s, isSubmitting: true, error: null }));
    const { data, error } = await requestEditorAccess(workspaceId, message);
    setState((s) => ({
      ...s,
      myRequest:    data ?? s.myRequest,
      isSubmitting: false,
      error,
    }));
    return { error };
  }, [workspaceId]);

  // ── Retract ───────────────────────────────────────────────────────────────
  const retract = useCallback(async () => {
    if (!workspaceId) return;
    setState((s) => ({ ...s, isSubmitting: true }));
    await retractEditorRequest(workspaceId);
    setState({ myRequest: null, isLoading: false, isSubmitting: false, error: null });
  }, [workspaceId]);

  const status = state.myRequest?.status;

  return {
    ...state,
    submit,
    retract,
    hasPendingRequest:  status === 'pending',
    hasApprovedRequest: status === 'approved',
    hasDeniedRequest:   status === 'denied',
    hasRemovedRequest:  status === 'removed',
  };
}

// ─── Owner/Editor-side hook ───────────────────────────────────────────────────

interface PendingRequestsState {
  requests:    EditAccessRequest[];
  isLoading:   boolean;
  isActioning: boolean;
  error:       string | null;
}

export function usePendingAccessRequests(
  workspaceId: string | null,
  userRole:    WorkspaceRole | null,
) {
  const [state, setState] = useState<PendingRequestsState>({
    requests:    [],
    isLoading:   false,
    isActioning: false,
    error:       null,
  });

  const pgUnsubRef   = useRef<(() => void) | null>(null);
  const bcChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const shouldLoad   = (userRole === 'owner' || userRole === 'editor') && !!workspaceId;

  const load = useCallback(async () => {
    if (!shouldLoad) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await fetchPendingRequests(workspaceId!);
    setState({ requests: data, isLoading: false, isActioning: false, error });
  }, [workspaceId, shouldLoad]);

  // Reload only the list (no spinner) — used by realtime callbacks.
  const reloadSilent = useCallback(async () => {
    if (!shouldLoad) return;
    const { data } = await fetchPendingRequests(workspaceId!);
    setState((s) => ({ ...s, requests: data }));
  }, [workspaceId, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;

    load();

    (async () => {
      // CRITICAL: authenticate the realtime socket with the EXPLICIT access
      // token BEFORE subscribing to the private channel. Without this, the
      // owner's private channel subscribes before auth is applied and RLS
      // silently drops the broadcast — which is exactly why a new request only
      // showed up after leaving and re-entering the workspace.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      // PRIMARY: broadcast channel for this workspace's request feed
      const bc = supabase
        .channel(`workspace_access_requests:${workspaceId}`, { config: { private: true } })
        .on('broadcast', { event: 'request_change' }, () => {
          // Any change (created / updated / deleted) — re-fetch the pending list.
          reloadSilent();
        })
        .subscribe();
      bcChannelRef.current = bc;
    })();

    // FALLBACK: postgres_changes (Part 12 behaviour) — set up immediately.
    pgUnsubRef.current = subscribeToAccessRequests(workspaceId!, {
      onInsert: (req) => {
        // A new request landed — re-fetch authoritative joined data so the
        // requester's name/avatar are correct, then also optimistically add.
        reloadSilent();
        setState((s) => {
          if (s.requests.some((r) => r.id === req.id)) return s;
          return { ...s, requests: [req, ...s.requests] };
        });
      },
      onUpdate: (req) => {
        setState((s) => ({
          ...s,
          requests: req.status === 'pending'
            ? s.requests.map((r) => (r.id === req.id ? req : r))
            : s.requests.filter((r) => r.id !== req.id),
        }));
        // Re-sync to be safe (handles approve/deny from another device).
        reloadSilent();
      },
    });

    return () => {
      cancelled = true;
      if (bcChannelRef.current) { supabase.removeChannel(bcChannelRef.current); bcChannelRef.current = null; }
      if (pgUnsubRef.current)   { pgUnsubRef.current();                         pgUnsubRef.current = null; }
    };
  }, [workspaceId, shouldLoad, load, reloadSilent]);

  const approve = useCallback(async (requestId: string) => {
    setState((s) => ({ ...s, isActioning: true, error: null }));
    const { error } = await approveRequest(requestId);
    setState((s) => ({
      ...s,
      isActioning: false,
      requests: error ? s.requests : s.requests.filter((r) => r.id !== requestId),
      error,
    }));
    return { error };
  }, []);

  const deny = useCallback(async (requestId: string) => {
    setState((s) => ({ ...s, isActioning: true, error: null }));
    const { error } = await denyRequest(requestId);
    setState((s) => ({
      ...s,
      isActioning: false,
      requests: error ? s.requests : s.requests.filter((r) => r.id !== requestId),
      error,
    }));
    return { error };
  }, []);

  return {
    ...state,
    pendingCount: state.requests.length,
    refresh: load,
    approve,
    deny,
  };
}