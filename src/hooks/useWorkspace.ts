// src/hooks/useWorkspace.ts
// Part 46 UPDATE — Full realtime wiring via useWorkspaceRealtime.
// Part 51 UPDATE — fast-open feed pagination + realtime shared content.
// Part 52 UPDATE —
//   Feature 1 (realtime settings + delete kick-out):
//     • Now also mounts useWorkspaceSettingsRealtime, which listens on the
//       "workspace_settings:{id}" private channel and the member kick channel.
//     • onSettingsUpdated → patches the in-state `workspace` object live so the
//       detail header / settings screen reflect name/description/avatar changes
//       made by ANY editor or owner, on every member's device, instantly.
//     • onWorkspaceDeleted → flips isSelfRemoved so workspace-detail navigates
//       the member out to the Teams tab (same exit path used for remove/block).
//
// Part 52.2 FOLLOW-UP (Fix 5) —
//   Shared-content activity is now logged EXACTLY ONCE at the user-action call
//   site (ShareToWorkspaceModal for presentations & academic papers;
//   usePodcastSharing / useDebateSharing / useVoiceDebateSharing for the rest).
//   The realtime auto-logging that used to live here (logSharedAdded, fired from
//   onSharedBroadcast / onSharedContentInsert) caused TWO problems:
//     • it ran on EVERY member's device that had the workspace open → duplicate
//       feed entries, and
//     • it surfaced academic-paper shares as mislabeled/duplicate entries.
//   So logSharedAdded is now a NO-OP and is no longer called from the realtime
//   handlers. We still call bumpSharedVersion() so the Shared tab refreshes in
//   realtime — only the (duplicate) logging is removed.
//
// All Part 10/11/12/13/46/51 actions unchanged.

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
import { useAuth } from '../context/AuthContext';
import { useWorkspaceRealtime } from './useWorkspaceRealtime';
import { useWorkspaceSettingsRealtime } from './useWorkspaceSettingsRealtime'; // Part 52

// Part 51 — small first page so the screen opens fast even with many reports
const FEED_PAGE_SIZE = 8;

export function useWorkspace(workspaceId: string | null) {
  const { user } = useAuth();

  const [state, setState] = useState<WorkspaceDetailState>({
    workspace:    null,
    members:      [],
    reports:      [],
    userRole:     null,
    isLoading:    true,
    isRefreshing: false,
    error:        null,
  });

  const [pinnedReportIds, setPinnedReportIds] = useState<Set<string>>(new Set());

  // Part 51 — feed pagination state
  const [reportsHasMore,    setReportsHasMore]    = useState(true);
  const [reportsLoadingMore, setReportsLoadingMore] = useState(false);
  const feedOffsetRef = useRef(0);

  const removedRef = useRef(false);
  const [isSelfRemoved, setIsSelfRemoved] = useState(false);

  // Part 52 — true only when removal was caused by the workspace being deleted
  const [isDeleted, setIsDeleted] = useState(false);

  // ── Load workspace ──────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!workspaceId || removedRef.current) return;

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
        // Part 51 — first page only
        getWorkspaceFeed(workspaceId, FEED_PAGE_SIZE, 0),
      ]);

      if (wsResult.error) throw wsResult.error;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userMember = membersResult.data.find(m => m.userId === currentUser?.id);

      const feedData = feedResult.data;

      // Part 51 — reset pagination cursors for the fresh load
      feedOffsetRef.current = feedData.length;
      setReportsHasMore(feedData.length === FEED_PAGE_SIZE);

      // Load pinned report IDs directly from pinned_workspace_reports
      try {
        const { data: pinnedRows } = await supabase
          .from('pinned_workspace_reports')
          .select('report_id')
          .eq('workspace_id', workspaceId);
        const initialPinned = new Set<string>(
          ((pinnedRows ?? []) as { report_id: string }[]).map(r => r.report_id)
        );
        setPinnedReportIds(initialPinned);
      } catch {
        setPinnedReportIds(new Set());
      }

      setState({
        workspace:    mapWorkspace(wsResult.data as Record<string, unknown>),
        members:      membersResult.data,
        reports:      feedData,
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

  // ── Part 51: load next page of feed reports ────────────────────────────
  const loadMoreReports = useCallback(async () => {
    if (!workspaceId || removedRef.current) return;
    if (reportsLoadingMore || !reportsHasMore) return;

    setReportsLoadingMore(true);
    try {
      const { data } = await getWorkspaceFeed(workspaceId, FEED_PAGE_SIZE, feedOffsetRef.current);
      setState(s => {
        const seen = new Set(s.reports.map(r => r.id));
        const fresh = data.filter(r => !seen.has(r.id));
        return { ...s, reports: [...s.reports, ...fresh] };
      });
      feedOffsetRef.current += data.length;
      setReportsHasMore(data.length === FEED_PAGE_SIZE);
    } catch {
      // non-fatal — user can pull-to-refresh
    } finally {
      setReportsLoadingMore(false);
    }
  }, [workspaceId, reportsLoadingMore, reportsHasMore]);

  // ── Helper: reload only the feed (first page) ──────────────────────────
  const reloadFeed = useCallback(async () => {
    if (!workspaceId || removedRef.current) return;
    const { data } = await getWorkspaceFeed(workspaceId, FEED_PAGE_SIZE, 0);
    feedOffsetRef.current = data.length;
    setReportsHasMore(data.length === FEED_PAGE_SIZE);
    setState(s => ({ ...s, reports: data }));
  }, [workspaceId]);

  // ── Helper: reload only the members ────────────────────────────────────
  const reloadMembers = useCallback(async () => {
    if (!workspaceId || removedRef.current) return;
    const { data } = await getWorkspaceMembersWithProfiles(workspaceId);
    const userMember = data.find(m => m.userId === user?.id);
    setState(s => ({
      ...s,
      members:  data,
      userRole: (userMember?.role ?? s.userRole) as WorkspaceRole | null,
    }));
  }, [workspaceId, user?.id]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    removedRef.current = false;
    setIsSelfRemoved(false);
    setIsDeleted(false);
    load();
  }, [workspaceId, load]);

  // ── Part 51: bump shared version (drives Shared-tab realtime refresh) ───
  const bumpSharedVersion = useCallback(() => {
    setState(s => ({
      ...s,
      _sharedContentVersion: ((s as any)._sharedContentVersion ?? 0) + 1,
    } as any));
  }, []);

  // ── Part 52.2 (Fix 5): shared-content activity logging moved to the share
  //    call sites. This realtime auto-logger is now a NO-OP to prevent
  //    duplicate / mislabeled feed entries. Kept as a stable function so the
  //    realtime handler signatures don't need to change.
  const logSharedAdded = useCallback((_contentType: string, _contentId: string) => {
    return;
  }, []);

  // ── Part 46: Centralised realtime subscriptions ─────────────────────────
  useWorkspaceRealtime(workspaceId, {
    // ── Members ──────────────────────────────────────────────────────────
    onMemberInsert: () => { reloadMembers(); },

    onMemberUpdate: (updatedUserId, newRole) => {
      setState(s => {
        const updatedMembers = s.members.map(m =>
          m.userId === updatedUserId ? { ...m, role: newRole } : m,
        );
        const newUserRole = updatedUserId === user?.id ? newRole : s.userRole;
        return { ...s, members: updatedMembers, userRole: newUserRole };
      });
    },

    onMemberDelete: (deletedUserId) => {
      setState(s => ({
        ...s,
        members: s.members.filter(m => m.userId !== deletedUserId),
      }));
    },

    onSelfRemoved: () => {
      removedRef.current = true;
      setIsSelfRemoved(true);
      setState(s => ({ ...s, userRole: null, members: [], reports: [] }));
    },

    // ── Reports feed ──────────────────────────────────────────────────────
    onReportInsert: () => { reloadFeed(); },

    onReportDelete: (wrId) => {
      setState(s => ({
        ...s,
        reports: s.reports.filter(r => r.id !== wrId),
      }));
    },

    onReportUpdate: (wrId, _reportId, isPinned) => {
      if (isPinned === undefined) return;
      setState(s => ({
        ...s,
        reports: s.reports.map(r => (r.id === wrId ? { ...r, isPinned } : r)),
      }));
    },

    onPinChanged: (reportId, pinned) => {
      setState(s => ({
        ...s,
        reports: s.reports.map(r =>
          r.reportId === reportId ? { ...r, isPinned: pinned } : r,
        ),
      }));
      setPinnedReportIds(prev => {
        const next = new Set(prev);
        if (pinned) next.add(reportId);
        else        next.delete(reportId);
        return next;
      });
    },

    // ── Part 51: unified shared broadcast (PRIMARY realtime path) ─────────
    //   Part 52.2 (Fix 5): we still bump the shared version so the Shared tab
    //   refreshes live, but we NO LONGER log activity here (logging happens
    //   once at the share call site).
    onSharedBroadcast: (contentType, contentId, action) => {
      if (contentType === 'report') {
        if (action === 'removed') {
          setState(s => ({
            ...s,
            reports: s.reports.filter(r => r.reportId !== contentId),
          }));
        } else {
          reloadFeed();
        }
        return;
      }
      bumpSharedVersion();
    },

    // ── Legacy postgres_changes fallback (still bump version, no logging) ─
    onSharedContentInsert: (_contentType, _contentId) => {
      bumpSharedVersion();
    },

    onSharedContentDelete: () => {
      bumpSharedVersion();
    },
  });

  // ── Part 52: Realtime workspace settings + delete kick-out ──────────────
  useWorkspaceSettingsRealtime(workspaceId, {
    onSettingsUpdated: ({ name, description, avatarUrl }) => {
      // Patch the in-state workspace object live. We only overwrite fields
      // that were present in the broadcast payload.
      setState(s => {
        if (!s.workspace) return s;
        return {
          ...s,
          workspace: {
            ...s.workspace,
            name:        name        !== undefined ? (name ?? s.workspace.name)               : s.workspace.name,
            description: description !== undefined ? (description ?? null)                    : s.workspace.description,
            avatarUrl:   avatarUrl   !== undefined ? (avatarUrl ?? null)                      : s.workspace.avatarUrl,
            updatedAt:   new Date().toISOString(),
          },
        };
      });
    },

    onWorkspaceDeleted: () => {
      // Treat exactly like being removed — workspace-detail will navigate out.
      removedRef.current = true;
      setIsDeleted(true);
      setIsSelfRemoved(true);
      setState(s => ({ ...s, userRole: null, members: [], reports: [] }));
    },
  });

  // ── Actions ─────────────────────────────────────────────────────────────

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
    const result = await addReportToWorkspace(workspaceId, reportId);
    return result;
  }, [workspaceId]);

  // Part 51 — Feature 4: remove a shared report from the workspace.
  const removeReport = useCallback(async (reportId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setState(s => ({
      ...s,
      reports: s.reports.filter(r => r.reportId !== reportId),
    }));
    const result = await removeReportFromWorkspace(workspaceId, reportId);
    if (result.error) {
      reloadFeed();
    }
    return result;
  }, [workspaceId, reloadFeed]);

  const sharedContentVersion = (state as any)._sharedContentVersion ?? 0;

  const updatePin = useCallback((reportId: string, pinned: boolean) => {
    setPinnedReportIds(prev => {
      const next = new Set(prev);
      if (pinned) next.add(reportId);
      else        next.delete(reportId);
      return next;
    });
  }, []);

  return {
    ...state,
    sharedContentVersion,
    isSelfRemoved,
    isDeleted,           // Part 52
    pinnedReportIds,
    updatePin,
    // Part 51 — feed pagination
    reportsHasMore,
    reportsLoadingMore,
    loadMoreReports,
    refresh:      (silent?: boolean) => load(silent),
    update,
    remove,
    addReport,
    removeReport,
  };
}