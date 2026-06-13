// src/hooks/useWorkspaceSharing.ts
// Part 46 — Auto-reloads when realtime shared content events fire.
// Part 51 UPDATE — Deferred loading:
//   • New `enabled` param (default true for backward compat). When false the
//     hook does NOT fetch on mount and ignores version bumps, so the Shared
//     tab's network call only happens once the user actually opens that tab.
//   • New `hasLoaded` flag so the screen can show a spinner until the first
//     fetch resolves, then show content / empty state.
//
// All Part 14/46 behaviour preserved.

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
  sharedContentVersion?: number,
  // Part 51 — defer loading until enabled (Shared tab opened)
  enabled: boolean = true,
) {
  const [state, setState] = useState<WorkspaceSharingState>({
    items:     [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });
  const [hasLoaded, setHasLoaded] = useState(false);
  const prevVersionRef = useRef<number | undefined>(sharedContentVersion);
  const notMemberRef   = useRef(false);

  const patch = useCallback((partial: Partial<WorkspaceSharingState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load all shared content ────────────────────────────────────────────
  const load = useCallback(async (contentType?: SharedContentType) => {
    if (!workspaceId || notMemberRef.current) return;
    patch({ isLoading: true, error: null });

    const { data, error, notMember } = await getWorkspaceSharedContent(workspaceId, contentType);

    if (notMember) {
      notMemberRef.current = true;
      patch({ items: [], isLoading: false, error: null });
      setHasLoaded(true);
      return;
    }

    if (error) {
      console.error('[useWorkspaceSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ items: data, isLoading: false, error: null });
    }
    setHasLoaded(true);
  }, [workspaceId, patch]);

  // ── Reset on workspace change ──────────────────────────────────────────
  useEffect(() => {
    notMemberRef.current = false;
    setHasLoaded(false);
  }, [workspaceId]);

  // ── Part 51: load only when enabled ────────────────────────────────────
  useEffect(() => {
    if (workspaceId && enabled) {
      load();
      prevVersionRef.current = sharedContentVersion;
    }
  }, [workspaceId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload when sharedContentVersion bumps (only while enabled) ─────────
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
    hasLoaded,     // Part 51
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