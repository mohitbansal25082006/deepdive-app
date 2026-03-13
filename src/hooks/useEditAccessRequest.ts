// src/hooks/useEditAccessRequest.ts
// Part 12 — Manages edit access request state for both viewers (submitting)
// and owners/editors (reviewing pending requests).

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  EditAccessRequest,
  fetchMyRequest,
  fetchPendingRequests,
  requestEditorAccess,
  retractEditorRequest,
  approveRequest,
  denyRequest,
  subscribeToAccessRequests,
} from '../services/editAccessRequestService';
import { WorkspaceRole } from '../types';

// ─── Viewer-side hook ─────────────────────────────────────────────────────────
// Used in workspace-detail or workspace-report to show the "Request Editor Access" button.

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

  useEffect(() => {
    if (!shouldLoad) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    fetchMyRequest(workspaceId!).then(({ data, error }) => {
      setState({ myRequest: data, isLoading: false, isSubmitting: false, error });
    });
  }, [workspaceId, shouldLoad]);

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

  return {
    ...state,
    submit,
    retract,
    hasPendingRequest:  state.myRequest?.status === 'pending',
    hasApprovedRequest: state.myRequest?.status === 'approved',
    hasDeniedRequest:   state.myRequest?.status === 'denied',
  };
}

// ─── Owner/Editor-side hook ───────────────────────────────────────────────────
// Used in workspace-members or a notification badge to review incoming requests.

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

  const unsubRef = useRef<(() => void) | null>(null);

  const shouldLoad = (userRole === 'owner' || userRole === 'editor') && !!workspaceId;

  const load = useCallback(async () => {
    if (!shouldLoad) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await fetchPendingRequests(workspaceId!);
    setState({ requests: data, isLoading: false, isActioning: false, error });
  }, [workspaceId, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    load();

    // Realtime: new requests come in while the owner is viewing
    unsubRef.current = subscribeToAccessRequests(workspaceId!, {
      onInsert: (req) => {
        setState((s) => {
          // Avoid duplicates
          if (s.requests.some((r) => r.id === req.id)) return s;
          return { ...s, requests: [req, ...s.requests] };
        });
      },
      onUpdate: (req) => {
        // If status changed away from pending, remove from list
        setState((s) => ({
          ...s,
          requests: req.status === 'pending'
            ? s.requests.map((r) => (r.id === req.id ? req : r))
            : s.requests.filter((r) => r.id !== req.id),
        }));
      },
    });

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [workspaceId, shouldLoad, load]);

  const approve = useCallback(async (requestId: string) => {
    setState((s) => ({ ...s, isActioning: true, error: null }));
    const { error } = await approveRequest(requestId);

    setState((s) => ({
      ...s,
      isActioning: false,
      requests: error
        ? s.requests
        : s.requests.filter((r) => r.id !== requestId),
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
      requests: error
        ? s.requests
        : s.requests.filter((r) => r.id !== requestId),
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