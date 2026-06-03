// src/hooks/useWorkspaceSharing.ts
// Part 46 UPDATE — Auto-reloads when realtime shared content events fire.
//
// The central useWorkspaceRealtime hook (via useWorkspace) bumps
// sharedContentVersion on INSERT/DELETE for shared_workspace_content.
// This hook accepts that version as an optional prop and reloads
// whenever it changes — giving instant Shared tab updates.
//
// Pass sharedContentVersion from useWorkspace into this hook in
// workspace-detail.tsx:
//   const sharing = useWorkspaceSharing(id, sharedContentVersion);
//
// All Part 14 FIX behaviour (server reload after share/unshare) preserved.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getWorkspaceSharedContent,
  sharePresentationToWorkspace,
  shareAcademicPaperToWorkspace,
  removeSharedContent,
} from '../services/workspaceSharingService';
import {
  SharedWorkspaceContent,
  SharedContentType,
  WorkspaceSharingState,
} from '../types';

export function useWorkspaceSharing(
  workspaceId: string | null,
  // Part 46: optional realtime version counter — reload when it changes
  sharedContentVersion?: number,
) {
  const [state, setState] = useState<WorkspaceSharingState>({
    items:     [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  // Track previous version to detect changes
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);

  const patch = useCallback((partial: Partial<WorkspaceSharingState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // Part 46 FIX: stop retrying when user is confirmed not-a-member
  const notMemberRef = useRef(false);

  // ── Load all shared content ────────────────────────────────────────────
  const load = useCallback(async (contentType?: SharedContentType) => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedContent(workspaceId, contentType);

    if (notMember) {
      notMemberRef.current = true;
      patch({ items: [], isLoading: false, error: null });
      return;
    }

    if (error) {
      console.error('[useWorkspaceSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ items: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  // ── Auto-load on mount and workspaceId change ──────────────────────────
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

  // ── Share presentation ─────────────────────────────────────────────────
  const sharePresentation = useCallback(async (
    presentationId: string,
    title:          string,
    subtitle?:      string,
    reportId?:      string,
    metadata:       Record<string, unknown> = {},
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };
    patch({ isSharing: true, error: null });

    const { error } = await sharePresentationToWorkspace(
      workspaceId, presentationId, title, subtitle, reportId, metadata,
    );
    patch({ isSharing: false });
    if (!error) await load();
    else patch({ error });
    return { error };
  }, [workspaceId, patch, load]);

  // ── Share academic paper ───────────────────────────────────────────────
  const sharePaper = useCallback(async (
    paperId:   string,
    title:     string,
    subtitle?: string,
    reportId?: string,
    metadata:  Record<string, unknown> = {},
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace selected' };
    patch({ isSharing: true, error: null });

    const { error } = await shareAcademicPaperToWorkspace(
      workspaceId, paperId, title, subtitle, reportId, metadata,
    );
    patch({ isSharing: false });
    if (!error) await load();
    else patch({ error });
    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove shared item ─────────────────────────────────────────────────
  const remove = useCallback(async (
    contentType: SharedContentType,
    contentId:   string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };

    const { error } = await removeSharedContent(workspaceId, contentType, contentId);

    if (!error) {
      // Optimistic removal — realtime DELETE will confirm
      setState(prev => ({
        ...prev,
        items: prev.items.filter(
          i => !(i.contentType === contentType && i.contentId === contentId),
        ),
      }));
    }
    return { error };
  }, [workspaceId]);

  // ── Computed ───────────────────────────────────────────────────────────
  const presentations = state.items.filter(i => i.contentType === 'presentation');
  const papers        = state.items.filter(i => i.contentType === 'academic_paper');

  return {
    items:         state.items,
    presentations,
    papers,
    isLoading:     state.isLoading,
    isSharing:     state.isSharing,
    error:         state.error,
    load,
    sharePresentation,
    sharePaper,
    remove,
  };
}

// ─── Simpler hook: just the workspace IDs this content is shared to ───────────

export function useContentSharedWorkspaces(
  contentType: SharedContentType,
  contentId:   string | null | undefined,
) {
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!contentId) return;
    setIsLoading(true);
    try {
      const { data } = await import('../lib/supabase').then(async ({ supabase }) => {
        return supabase
          .from('shared_workspace_content')
          .select('workspace_id')
          .eq('content_type', contentType)
          .eq('content_id',   contentId);
      });
      setWorkspaceIds((data ?? []).map((r: { workspace_id: string }) => r.workspace_id));
    } catch {
      setWorkspaceIds([]);
    } finally {
      setIsLoading(false);
    }
  }, [contentType, contentId]);

  useEffect(() => { load(); }, [load]);

  const isSharedTo = useCallback(
    (wid: string) => workspaceIds.includes(wid),
    [workspaceIds],
  );

  return { workspaceIds, isLoading, isSharedTo, reload: load };
}