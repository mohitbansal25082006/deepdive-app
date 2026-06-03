// src/hooks/useWorkspaceMembers.ts
// Part 46 UPDATE — Realtime member list: role changes, removals, and
// blocks now propagate instantly to every device viewing the members
// screen — no manual refresh needed.
//
// Changes from Part 13B:
//   • useWorkspaceRealtime replaces the old subscribeToMembers channel
//     (deduplicates subscriptions when workspace-detail and workspace-members
//     are both mounted).
//   • changeRole now fires logRoleChanged so the Activity tab captures it.
//   • remove now fires logMemberRemoved (with name lookup) for the Activity tab.
//   • block now fires logMemberBlocked for the Activity tab.
//   • transferOwner now fires logOwnershipTransferred for the Activity tab.
//   • onSelfRemoved: if the current user's own member row is deleted while
//     they are viewing this screen, userRole is set to null so all
//     management controls disappear without a crash.
//
// All Part 13B behaviour (demoteEditorToViewer, leaveWorkspace, etc.)
// is preserved exactly.

import { useState, useEffect, useCallback } from 'react';
import { WorkspaceMember, WorkspaceRole } from '../types';
import {
  getWorkspaceMembersWithProfiles,
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  transferOwnership,
} from '../services/workspaceInviteService';
import { demoteEditorToViewer } from '../services/editAccessRequestService';
import {
  logRoleChanged,
  logMemberRemoved,
  logMemberBlocked,
  logOwnershipTransferred,
} from '../services/activityService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceRealtime } from './useWorkspaceRealtime';

export function useWorkspaceMembers(workspaceId: string | null) {
  const { user } = useAuth();
  const [members,    setMembers]    = useState<WorkspaceMember[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const userMember = members.find((m) => m.userId === user?.id);
  const userRole   = userMember?.role ?? null;
  const isOwner    = userRole === 'owner';
  const canManage  = isOwner;

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    const { data, error } = await getWorkspaceMembersWithProfiles(workspaceId);
    setMembers(data);
    setError(error);
    setIsLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    load();
  }, [workspaceId, load]);

  // ── Part 46: Realtime subscriptions ───────────────────────────────────
  // Using useWorkspaceRealtime (centralised) — no duplicate channels.
  useWorkspaceRealtime(workspaceId, {
    onMemberInsert: (_userId, _role) => {
      // Reload to get the full profile object for the new member
      load();
    },

    onMemberUpdate: (updatedUserId, newRole) => {
      setMembers(prev =>
        prev.map(m => m.userId === updatedUserId ? { ...m, role: newRole } : m),
      );
    },

    onMemberDelete: (deletedUserId) => {
      setMembers(prev => prev.filter(m => m.userId !== deletedUserId));
    },

    onSelfRemoved: () => {
      // Current user was removed while viewing this screen —
      // clear state so no management UI is shown
      setMembers([]);
    },
  });

  // ── Change role ────────────────────────────────────────────────────────
  const changeRole = useCallback(async (
    userId: string,
    role:   Exclude<WorkspaceRole, 'owner'>,
  ) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const currentMember = members.find(m => m.userId === userId);
    const isEditorDemotion = currentMember?.role === 'editor' && role === 'viewer';

    let result: { error: string | null };

    if (isEditorDemotion) {
      // Use special RPC that also resets the access request to 'removed'
      result = await demoteEditorToViewer(workspaceId, userId);
    } else {
      result = await updateMemberRole(workspaceId, userId, role);
    }

    if (!result.error) {
      // Optimistic update — realtime UPDATE will confirm
      setMembers(prev =>
        prev.map(m => m.userId === userId ? { ...m, role } : m),
      );

      // Part 46: Log role change to Activity tab
      const targetName = currentMember?.profile?.fullName
        ?? currentMember?.profile?.username
        ?? 'A member';
      const ownerProfile = members.find(m => m.role === 'owner')?.profile;
      const changedByName = ownerProfile?.fullName ?? ownerProfile?.username ?? 'Owner';

      // Get workspace name for notification
      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        if (ws) {
          logRoleChanged({
            workspaceId,
            workspaceName: (ws as any).name ?? '',
            targetUserId:  userId,
            targetName,
            newRole:        role,
            changedByName,
          }).catch(() => {});
        }
      } catch {}
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members]);

  // ── Remove member ─────────────────────────────────────────────────────
  const remove = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const targetMember = members.find(m => m.userId === userId);
    const result = await removeMember(workspaceId, userId);

    if (!result.error) {
      // Optimistic update — realtime DELETE will confirm
      setMembers(prev => prev.filter(m => m.userId !== userId));

      // Part 46 FIX: send Broadcast kick signal to removed user
      // so they get navigated away instantly without relying on
      // the Postgres Changes DELETE event (which loses user_id with RLS).
      // Wrapped in void async IIFE — supabase.rpc() returns PostgrestFilterBuilder
      // which has no .catch() in its TypeScript types (ts2551).
      void (async () => {
        try {
          await supabase.rpc('notify_workspace_member_removed', {
            p_workspace_id: workspaceId,
            p_user_id:      userId,
          });
        } catch {
          // Non-fatal — broadcast failure doesn't break the remove action
        }
      })();

      // Part 46: Log member removal to Activity tab
      const removedName   = targetMember?.profile?.fullName ?? targetMember?.profile?.username ?? 'A member';
      const currentName   = members.find(m => m.userId === user?.id)?.profile?.fullName
        ?? members.find(m => m.userId === user?.id)?.profile?.username
        ?? 'Owner';

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        if (ws) {
          logMemberRemoved({
            workspaceId,
            workspaceName: (ws as any).name ?? '',
            removedUserId: userId,
            removedName,
            removedByName: currentName,
          }).catch(() => {});
        }
      } catch {}
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members, user?.id]);

  // ── Leave workspace ────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    if (!workspaceId) return { error: 'No workspace' };
    return leaveWorkspace(workspaceId);
  }, [workspaceId]);

  // ── Transfer ownership ─────────────────────────────────────────────────
  const transferOwner = useCallback(async (newOwnerId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const newOwnerMember = members.find(m => m.userId === newOwnerId);
    const previousOwnerMember = members.find(m => m.role === 'owner');

    const result = await transferOwnership(workspaceId, newOwnerId);

    if (!result.error) {
      // Part 46 FIX: Don't call load() — realtime UPDATE events from
      // transfer_workspace_ownership RPC fire onMemberUpdate for BOTH affected
      // rows (old owner → editor, new owner → owner) instantly on all devices.
      // Calling load() here races with realtime and can cause a flash/flicker.

      // Part 46: Log ownership transfer to Activity tab
      const newOwnerName   = newOwnerMember?.profile?.fullName ?? newOwnerMember?.profile?.username ?? 'New owner';
      const previousOwner  = previousOwnerMember?.profile?.fullName ?? previousOwnerMember?.profile?.username ?? 'Previous owner';

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        if (ws) {
          logOwnershipTransferred({
            workspaceId,
            workspaceName: (ws as any).name ?? '',
            newOwnerId,
            newOwnerName,
            previousOwner,
          }).catch(() => {});
        }
      } catch {}
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members, load]);

  // ── Block member ───────────────────────────────────────────────────────
  // Calls block_workspace_member RPC (Part 13B), then logs to Activity tab (Part 46).
  const block = useCallback(async (userId: string, reason?: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const targetMember = members.find(m => m.userId === userId);

    try {
      const { error } = await supabase.rpc('block_workspace_member', {
        p_workspace_id: workspaceId,
        p_user_id:      userId,
        p_reason:       reason ?? null,
      });

      if (error) throw error;

      // Optimistic update — realtime DELETE + blocked INSERT will confirm
      setMembers(prev => prev.filter(m => m.userId !== userId));

      // Part 46: Log block to Activity tab
      const blockedName   = targetMember?.profile?.fullName ?? targetMember?.profile?.username ?? 'A member';
      const blockedByName = members.find(m => m.userId === user?.id)?.profile?.fullName
        ?? members.find(m => m.userId === user?.id)?.profile?.username
        ?? 'Owner';

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        if (ws) {
          logMemberBlocked({
            workspaceId,
            workspaceName: (ws as any).name ?? '',
            blockedUserId: userId,
            blockedName,
            blockedByName,
          }).catch(() => {});
        }
      } catch {}

      setIsUpdating(false);
      return { error: null };
    } catch (err) {
      setIsUpdating(false);
      return { error: err instanceof Error ? err.message : 'Failed to block member' };
    }
  }, [workspaceId, members, user?.id]);

  return {
    members, isLoading, isUpdating, error,
    userRole, isOwner, canManage,
    refresh: load,
    changeRole, remove, leave, transferOwner, block,
  };
}