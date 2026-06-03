// src/hooks/useWorkspace.ts
// Part 46 UPDATE — Full realtime wiring via useWorkspaceRealtime.
//
// What's new vs Part 10/11:
//
//   MEMBERS (realtime):
//     • INSERT  → add member card without full reload (profile fetched separately)
//     • UPDATE  → update role pill instantly on all screens
//     • DELETE  → remove member card instantly; if current user → trigger onSelfRemoved
//     • BLOCK INSERT → same as DELETE for the blocked user
//
//   REPORTS FEED (realtime):
//     • INSERT → reload feed (need full report object from RPC, not just workspace_reports row)
//     • DELETE → remove card instantly by workspaceReportId
//     • UPDATE → update isPinned on the matching card instantly
//
//   SHARED CONTENT (realtime):
//     • INSERT → reload the relevant sharing hook (presentation/paper/podcast/debate)
//     • DELETE → remove from local state instantly
//
//   ACTIVITY (realtime):
//     • INSERT → reload activity feed (actorProfile needs a profile join)
//
//   USER ROLE (self):
//     • When the current user's own role changes, userRole state updates instantly
//       so all permission gates (isEditor, isOwner) flip without refresh.
//
// All Part 10/11/12/13 actions (update, remove, addReport, etc.) unchanged.

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
import { logSharedContentAdded } from '../services/activityService';

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

  // Part 46 Fix 2: pinnedReportIds managed here so onPinChanged can update it
  // directly from the Broadcast trigger without going through reports[].
  const [pinnedReportIds, setPinnedReportIds] = useState<Set<string>>(new Set());

  // Track whether we've been removed from the workspace (to stop reloading)
  const removedRef = useRef(false);
  // Part 46 FIX: expose this so workspace-detail can navigate away immediately
  // without waiting for workspace===null (which onSelfRemoved never sets)
  const [isSelfRemoved, setIsSelfRemoved] = useState(false);

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
        getWorkspaceFeed(workspaceId, 20, 0),
      ]);

      if (wsResult.error) throw wsResult.error;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userMember = membersResult.data.find(m => m.userId === currentUser?.id);

      const feedData = feedResult.data;

      // Part 46 Fix 2: Load pinned report IDs directly from pinned_workspace_reports.
      // The feed mapper in workspaceService.ts does NOT set isPinned on WorkspaceReport,
      // so reading feedData.filter(r => r.isPinned) always returns empty. We query the
      // pinned_workspace_reports table directly which is the authoritative source.
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
        // Non-fatal — pins just show as unpinned until Broadcast arrives
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

  // ── Helper: reload only the feed ───────────────────────────────────────
  const reloadFeed = useCallback(async () => {
    if (!workspaceId || removedRef.current) return;
    const { data } = await getWorkspaceFeed(workspaceId, 20, 0);
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
    load();
  }, [workspaceId, load]);

  // ── Part 46: Centralised realtime subscriptions ─────────────────────────
  useWorkspaceRealtime(workspaceId, {
    // ── Members ──────────────────────────────────────────────────────────
    onMemberInsert: (_userId, _role) => {
      // Reload members to get the full profile object (avatar, name etc.)
      reloadMembers();
    },

    onMemberUpdate: (updatedUserId, newRole) => {
      setState(s => {
        // Update the role in the members list instantly
        const updatedMembers = s.members.map(m =>
          m.userId === updatedUserId ? { ...m, role: newRole } : m,
        );
        // If it's the current user's role that changed, update userRole too
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
      // Current user was removed or blocked — mark as removed so we
      // don't fire further loads; the screen will navigate away.
      removedRef.current = true;
      setIsSelfRemoved(true);
      setState(s => ({ ...s, userRole: null, members: [], reports: [] }));
    },

    // ── Reports feed ──────────────────────────────────────────────────────
    onReportInsert: (_wrId, _reportId) => {
      // Need full report object from RPC — do a silent feed reload
      reloadFeed();
    },

    onReportDelete: (wrId, _reportId) => {
      // Remove the card instantly by workspace_reports.id
      setState(s => ({
        ...s,
        reports: s.reports.filter(r => r.id !== wrId),
      }));
    },

    onReportUpdate: (wrId, _reportId, isPinned) => {
      // Fired for metadata changes on workspace_reports.
      // Pin changes are now handled by onPinChanged (Broadcast trigger).
      if (isPinned === undefined) return;
      setState(s => ({
        ...s,
        reports: s.reports.map(r =>
          r.id === wrId ? { ...r, isPinned } : r,
        ),
      }));
    },

    // Part 46 Fix 2: Pin realtime via Broadcast trigger on pinned_workspace_reports.
    // Fires instantly on ALL members' devices when any member pins/unpins a report.
    // Updates BOTH reports[].isPinned AND the dedicated pinnedReportIds Set so
    // workspace-detail can read from either without any sync useEffect delay.
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

    // ── Shared content ────────────────────────────────────────────────────
    // We don't store shared content in this hook's state — useWorkspaceSharing,
    // usePodcastSharing, useDebateSharing each manage their own lists.
    // Signal them to reload via a lightweight approach: we expose a
    // sharedContentVersion counter that those hooks can watch.
    onSharedContentInsert: (contentType, contentId) => {
      // Bump version for ALL content types including voice_debate (channel 6b)
      // This triggers auto-reload in all four sharing hooks via sharedContentVersion
      setState(s => ({
        ...s,
        _sharedContentVersion: ((s as any)._sharedContentVersion ?? 0) + 1,
      } as any));

      // Part 46: Log activity for ALL shared content types.
      // We run this async without awaiting — non-blocking.
      // Fetches content title from the relevant table then logs.
      if (!workspaceId || !user) return;
      void (async () => {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (!currentUser) return;

          // Get workspace name
          const { data: ws } = await supabase
            .from('workspaces').select('name').eq('id', workspaceId).single();
          const workspaceName = (ws as any)?.name ?? '';

          // Get sharer profile name
          const { data: profile } = await supabase
            .from('profiles').select('full_name, username').eq('id', currentUser.id).single();
          const sharerName = (profile as any)?.full_name ?? (profile as any)?.username ?? 'A member';

          // Look up content title based on type
          let contentTitle = 'Untitled';
          if (contentType === 'presentation') {
            const { data: p } = await supabase
              .from('presentations').select('title').eq('id', contentId).single();
            contentTitle = (p as any)?.title ?? 'Untitled Presentation';
          } else if (contentType === 'academic_paper') {
            const { data: p } = await supabase
              .from('academic_papers').select('title').eq('id', contentId).single();
            contentTitle = (p as any)?.title ?? 'Untitled Paper';
          } else if (contentType === 'podcast') {
            const { data: p } = await supabase
              .from('shared_podcasts').select('title').eq('podcast_id', contentId).eq('workspace_id', workspaceId).single();
            contentTitle = (p as any)?.title ?? 'Untitled Podcast';
          } else if (contentType === 'debate') {
            const { data: p } = await supabase
              .from('shared_debates').select('topic').eq('debate_id', contentId).eq('workspace_id', workspaceId).single();
            contentTitle = (p as any)?.topic ?? 'Untitled Debate';
          } else if (contentType === 'voice_debate') {
            const { data: p } = await supabase
              .from('shared_voice_debates').select('topic').eq('voice_debate_id', contentId).eq('workspace_id', workspaceId).single();
            contentTitle = (p as any)?.topic ?? 'Untitled Voice Debate';
          }

          await logSharedContentAdded({
            workspaceId,
            workspaceName,
            contentType: contentType as any,
            contentId,
            contentTitle,
            sharerName,
          });
        } catch {
          // Non-fatal — activity log failure should never break the share action
        }
      })();
    },

    onSharedContentDelete: (_contentType, _contentId) => {
      setState(s => ({
        ...s,
        _sharedContentVersion: ((s as any)._sharedContentVersion ?? 0) + 1,
      } as any));
    },

    // ── Activity ──────────────────────────────────────────────────────────
    // useActivityFeed has its own subscribeToActivity channel.
    // No action needed here — it self-manages.
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
    // Realtime INSERT on workspace_reports will trigger reloadFeed()
    return result;
  }, [workspaceId]);

  const removeReport = useCallback(async (reportId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    const result = await removeReportFromWorkspace(workspaceId, reportId);
    // Realtime DELETE on workspace_reports will remove the card instantly
    return result;
  }, [workspaceId]);

  // Expose sharedContentVersion so workspace-detail.tsx can react to it
  const sharedContentVersion = (state as any)._sharedContentVersion ?? 0;

  // Part 46 Fix 2: optimistic pin update called by workspace-detail after toggle
  // so the pin icon flips immediately on the toggling device without waiting for Broadcast
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
    isSelfRemoved,     // Part 46 FIX: workspace-detail watches this to navigate away
    pinnedReportIds,   // Part 46 Fix 2: direct Set<string> updated by Broadcast trigger
    updatePin,         // Part 46 Fix 2: optimistic pin update for toggling device
    refresh:      (silent?: boolean) => load(silent),
    update,
    remove,
    addReport,
    removeReport,
  };
}