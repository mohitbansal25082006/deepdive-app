// src/hooks/useEditAccessRequest.ts
// Part 12 — Manages edit access request state for viewers and owners.
// Part 13B UPDATE:
//   • useMyAccessRequest now exposes `hasRemovedRequest` flag
//   • Subscribes to realtime updates on own request so viewer sees
//     the "removed as editor" banner instantly when the owner demotes them.
//   • When status is 'removed', viewer can re-submit a fresh request.
//   • useWorkspaceMembers calls demoteEditorToViewer instead of regular
//     updateMemberRole when demoting editor → viewer (handled in that hook).

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
  const unsubRef   = useRef<(() => void) | null>(null);

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

  // ── Realtime: watch for status changes (approved → removed, etc.) ─────────
  useEffect(() => {
    if (!shouldLoad) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !workspaceId) return;

      unsubRef.current = subscribeToMyRequest(
        workspaceId,
        user.id,
        (updatedRequest) => {
          setState((s) => ({
            ...s,
            myRequest: updatedRequest,
          }));
        },
      );
    });

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [workspaceId, shouldLoad]);

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
    hasRemovedRequest:  status === 'removed',   // ← Part 13B
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

  const unsubRef    = useRef<(() => void) | null>(null);
  const shouldLoad  = (userRole === 'owner' || userRole === 'editor') && !!workspaceId;

  const load = useCallback(async () => {
    if (!shouldLoad) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await fetchPendingRequests(workspaceId!);
    setState({ requests: data, isLoading: false, isActioning: false, error });
  }, [workspaceId, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    load();

    unsubRef.current = subscribeToAccessRequests(workspaceId!, {
      onInsert: (req) => {
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