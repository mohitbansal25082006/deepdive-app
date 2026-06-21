// src/hooks/useEditAccessRequest.ts
// Part 12 — Manages edit access request state for viewers and owners.
// Part 13B — Added 'removed' status + viewer realtime banner.
// Part 52  — Realtime viewer→editor requests (await setAuth before subscribe).
// Part 52.2 — Feature 1e: when an owner/editor APPROVES (or denies) a request,
//   log it to the Activity feed with BOTH the approver's and the requester's
//   full names so the entry reads "<approver> granted editor access to
//   <requester>" with both names tappable to their profiles.
//
//   The requester's name comes from the pending request's joined profile; the
//   approver's name is resolved from the current user's profile. Logging is
//   fire-and-forget and never blocks the approve/deny action.

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
import {
  logAccessRequestApproved,
  logAccessRequestDenied,
} from '../services/activityService';
import { WorkspaceRole } from '../types';

// ─── Helper: resolve the current user's display name ──────────────────────────

async function resolveCurrentUserName(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'A member';
    const { data } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single();
    const p = data as { full_name?: string; username?: string } | null;
    return p?.full_name ?? p?.username ?? 'A member';
  } catch {
    return 'A member';
  }
}

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

  const shouldLoad = userRole === 'viewer' && !!workspaceId;
  const pgUnsubRef   = useRef<(() => void) | null>(null);
  const bcChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const reloadMine = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await fetchMyRequest(workspaceId);
    setState((s) => ({ ...s, myRequest: data }));
  }, [workspaceId]);

  useEffect(() => {
    if (!shouldLoad) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    fetchMyRequest(workspaceId!).then(({ data, error }) => {
      setState({ myRequest: data, isLoading: false, isSubmitting: false, error });
    });
  }, [workspaceId, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !workspaceId || cancelled) return;

      await supabase.realtime.setAuth(session!.access_token);
      if (cancelled) return;

      const bc = supabase
        .channel(`workspace_my_request:${workspaceId}:${user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'my_request_change' }, () => {
          reloadMine();
        })
        .subscribe();
      bcChannelRef.current = bc;

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

  // Keep a live ref to the current requests so action handlers can look up the
  // requester's name + id without adding them to the callback deps.
  const requestsRef = useRef<EditAccessRequest[]>([]);
  useEffect(() => { requestsRef.current = state.requests; }, [state.requests]);

  const load = useCallback(async () => {
    if (!shouldLoad) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await fetchPendingRequests(workspaceId!);
    setState({ requests: data, isLoading: false, isActioning: false, error });
  }, [workspaceId, shouldLoad]);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const bc = supabase
        .channel(`workspace_access_requests:${workspaceId}`, { config: { private: true } })
        .on('broadcast', { event: 'request_change' }, () => {
          reloadSilent();
        })
        .subscribe();
      bcChannelRef.current = bc;
    })();

    pgUnsubRef.current = subscribeToAccessRequests(workspaceId!, {
      onInsert: (req) => {
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
        reloadSilent();
      },
    });

    return () => {
      cancelled = true;
      if (bcChannelRef.current) { supabase.removeChannel(bcChannelRef.current); bcChannelRef.current = null; }
      if (pgUnsubRef.current)   { pgUnsubRef.current();                         pgUnsubRef.current = null; }
    };
  }, [workspaceId, shouldLoad, load, reloadSilent]);

  // ── Approve (Part 52.2: log to Activity feed with both names) ─────────────
  const approve = useCallback(async (requestId: string) => {
    setState((s) => ({ ...s, isActioning: true, error: null }));

    // Capture the requester before the row leaves the list.
    const req = requestsRef.current.find((r) => r.id === requestId);

    const { error } = await approveRequest(requestId);
    setState((s) => ({
      ...s,
      isActioning: false,
      requests: error ? s.requests : s.requests.filter((r) => r.id !== requestId),
      error,
    }));

    if (!error && req && workspaceId) {
      const requesterName =
        req.profile?.fullName ?? req.profile?.username ?? 'A member';
      const approverName = await resolveCurrentUserName();
      logAccessRequestApproved({
        workspaceId,
        requesterId:   req.userId,
        requesterName,
        approverName,
      }).catch(() => {});
    }

    return { error };
  }, [workspaceId]);

  // ── Deny (Part 52.2: log to Activity feed with both names) ────────────────
  const deny = useCallback(async (requestId: string) => {
    setState((s) => ({ ...s, isActioning: true, error: null }));

    const req = requestsRef.current.find((r) => r.id === requestId);

    const { error } = await denyRequest(requestId);
    setState((s) => ({
      ...s,
      isActioning: false,
      requests: error ? s.requests : s.requests.filter((r) => r.id !== requestId),
      error,
    }));

    if (!error && req && workspaceId) {
      const requesterName =
        req.profile?.fullName ?? req.profile?.username ?? 'A member';
      const approverName = await resolveCurrentUserName();
      logAccessRequestDenied({
        workspaceId,
        requesterId:   req.userId,
        requesterName,
        approverName,
      }).catch(() => {});
    }

    return { error };
  }, [workspaceId]);

  return {
    ...state,
    pendingCount: state.requests.length,
    refresh: load,
    approve,
    deny,
  };
}