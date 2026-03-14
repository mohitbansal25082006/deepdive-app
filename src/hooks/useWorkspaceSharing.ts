// src/hooks/useWorkspaceSharing.ts
// Part 14 FIX — After a successful share/unshare, reload from the RPC
// instead of optimistically updating, so the Shared tab always shows
// fresh server data (avoids stale-cache display bugs).

import { useState, useCallback, useEffect } from 'react';
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceSharing(workspaceId: string | null) {
  const [state, setState] = useState<WorkspaceSharingState>({
    items:     [],
    isLoading: false,
    isSharing: false,
    error:     null,
  });

  const patch = useCallback((partial: Partial<WorkspaceSharingState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Load all shared content via SECURITY DEFINER RPC ──────────────────────
  const load = useCallback(async (contentType?: SharedContentType) => {
    if (!workspaceId) return;
    patch({ isLoading: true, error: null });

    const { data, error } = await getWorkspaceSharedContent(workspaceId, contentType);

    if (error) {
      console.error('[useWorkspaceSharing] load error:', error);
      patch({ isLoading: false, error });
    } else {
      patch({ items: data, isLoading: false, error: null });
    }
  }, [workspaceId, patch]);

  // Auto-load when workspaceId changes
  useEffect(() => {
    if (workspaceId) load();
  }, [workspaceId, load]);

  // ── Share presentation ─────────────────────────────────────────────────────
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

    if (!error) {
      // Reload from server so the Shared tab shows the real inserted row
      await load();
    } else {
      patch({ error });
    }

    return { error };
  }, [workspaceId, patch, load]);

  // ── Share academic paper ───────────────────────────────────────────────────
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

    if (!error) {
      await load();
    } else {
      patch({ error });
    }

    return { error };
  }, [workspaceId, patch, load]);

  // ── Remove shared item ─────────────────────────────────────────────────────
  const remove = useCallback(async (
    contentType: SharedContentType,
    contentId:   string,
  ): Promise<{ error: string | null }> => {
    if (!workspaceId) return { error: 'No workspace' };

    const { error } = await removeSharedContent(workspaceId, contentType, contentId);

    if (!error) {
      // Optimistic removal is fine here — just filter out the deleted item
      setState(prev => ({
        ...prev,
        items: prev.items.filter(
          i => !(i.contentType === contentType && i.contentId === contentId)
        ),
      }));
    }

    return { error };
  }, [workspaceId]);

  // ── Computed ───────────────────────────────────────────────────────────────
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
// Used by slide-preview / academic-paper to show shared badges.

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
      // Use the RPC that already has all data — just grab workspace_ids
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