// src/hooks/useWorkspace.ts
// Full workspace detail: workspace row + members + reports feed.
// Realtime subscriptions for workspace_reports and workspace_members.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Workspace, WorkspaceMember, WorkspaceReport,
  WorkspaceRole, WorkspaceDetailState,
} from '../types';
import {
  mapWorkspace, mapWorkspaceMember,
  updateWorkspace, deleteWorkspace,
  getWorkspaceFeed, addReportToWorkspace, removeReportFromWorkspace,
} from '../services/workspaceService';
import { getWorkspaceMembersWithProfiles } from '../services/workspaceInviteService';

export function useWorkspace(workspaceId: string | null) {
  const [state, setState] = useState<WorkspaceDetailState>({
    workspace:   null,
    members:     [],
    reports:     [],
    userRole:    null,
    isLoading:   true,
    isRefreshing:false,
    error:       null,
  });
  const reportsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const membersChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load workspace ──────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!workspaceId) return;

    setState(s => ({
      ...s,
      isLoading:    !silent,
      isRefreshing: silent,
      error:        null,
    }));

    try {
      const [wsResult, membersResult, feedResult] = await Promise.all([
        supabase.from('workspaces').select('*').eq('id', workspaceId).single(),
        getWorkspaceMembersWithProfiles(workspaceId),
        getWorkspaceFeed(workspaceId, 20, 0),
      ]);

      if (wsResult.error) throw wsResult.error;

      const { data: { user } } = await supabase.auth.getUser();
      const userMember = membersResult.data.find(m => m.userId === user?.id);

      setState({
        workspace:    mapWorkspace(wsResult.data as Record<string, unknown>),
        members:      membersResult.data,
        reports:      feedResult.data,
        userRole:     (userMember?.role ?? null) as WorkspaceRole | null,
        isLoading:    false,
        isRefreshing: false,
        error:        null,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading:    false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to load workspace',
      }));
    }
  }, [workspaceId]);

  // ── Realtime subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;

    load();

    // Reports feed: new report added or removed
    reportsChannelRef.current = supabase
      .channel(`workspace:${workspaceId}:reports_feed`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_reports',
          filter: `workspace_id=eq.${workspaceId}` },
        () => { getWorkspaceFeed(workspaceId, 20, 0).then(r => {
          setState(s => ({ ...s, reports: r.data }));
        }); },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'workspace_reports',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const deletedId = (payload.old as Record<string, unknown>).id as string;
          setState(s => ({ ...s, reports: s.reports.filter(r => r.id !== deletedId) }));
        },
      )
      .subscribe();

    // Members: join/leave/role change
    membersChannelRef.current = supabase
      .channel(`workspace:${workspaceId}:members_live`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_members',
          filter: `workspace_id=eq.${workspaceId}` },
        () => {
          getWorkspaceMembersWithProfiles(workspaceId).then(r => {
            setState(s => ({ ...s, members: r.data }));
          });
        },
      )
      .subscribe();

    return () => {
      if (reportsChannelRef.current) supabase.removeChannel(reportsChannelRef.current);
      if (membersChannelRef.current) supabase.removeChannel(membersChannelRef.current);
      reportsChannelRef.current = null;
      membersChannelRef.current = null;
    };
  }, [workspaceId, load]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const update = useCallback(async (
    updates: Parameters<typeof updateWorkspace>[1],
  ) => {
    if (!workspaceId) return { error: 'No workspace' };
    const { data, error } = await updateWorkspace(workspaceId, updates);
    if (data) setState(s => ({ ...s, workspace: data }));
    return { error };
  }, [workspaceId]);

  const remove = useCallback(async () => {
    if (!workspaceId) return { error: 'No workspace' };
    return deleteWorkspace(workspaceId);
  }, [workspaceId]);

  const addReport = useCallback(async (reportId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    return addReportToWorkspace(workspaceId, reportId);
  }, [workspaceId]);

  const removeReport = useCallback(async (reportId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    return removeReportFromWorkspace(workspaceId, reportId);
  }, [workspaceId]);

  return {
    ...state,
    refresh:      (silent?: boolean) => load(silent),
    update,
    remove,
    addReport,
    removeReport,
  };
}