// src/hooks/useWorkspaceMembers.ts
// Part 46 UPDATE — Realtime member list: role changes, removals, and
// blocks propagate instantly to every device viewing the members screen.
//
// Part 52.3B UPDATE — Activity-log correctness (works with schema_part52_3.sql):
//   The legacy RPCs (block_workspace_member, demote_editor_to_viewer,
//   approve_editor_request) used to insert their OWN nameless activity rows,
//   which produced "blocked a member" / a second "changed a member's role".
//   schema_part52_3.sql now DROPS those nameless RPC rows at the source, so the
//   NAMED client logs emitted here are the single source of truth. To make those
//   named rows correct:
//     • changeRole(): resolve `changedByName` from the CURRENT user (the actor),
//       not from "the owner row". Previously it read the owner's profile, which
//       mislabels the actor whenever the acting owner's row isn't the first
//       owner found, and is simply wrong conceptually. We now read the acting
//       member's own profile (falling back to a DB profile fetch).
//     • block()/remove()/transferOwner() already log named entries — unchanged,
//       they remain the surviving rows after the RPC's nameless ones are dropped.
//
// All Part 13B behaviour (demoteEditorToViewer, leaveWorkspace, etc.) preserved.

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

  // ── Helper: resolve the CURRENT actor's display name ────────────────────
  // Prefers the in-memory member profile; falls back to a direct profiles
  // fetch so the name is correct even before the member list loads.
  const resolveActorName = useCallback(async (): Promise<string> => {
    const fromMembers = members.find((m) => m.userId === user?.id)?.profile;
    if (fromMembers?.fullName || fromMembers?.username) {
      return fromMembers.fullName ?? fromMembers.username ?? 'A member';
    }
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return 'A member';
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', authUser.id)
        .single();
      const p = data as { full_name?: string; username?: string } | null;
      return p?.full_name ?? p?.username ?? 'A member';
    } catch {
      return 'A member';
    }
  }, [members, user?.id]);

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
      // Special RPC that also resets the access request to 'removed'.
      // (Its own nameless member_role_changed row is dropped by 52.3 SQL.)
      result = await demoteEditorToViewer(workspaceId, userId);
    } else {
      // (updateMemberRole does not emit activity; we log the named row below.)
      result = await updateMemberRole(workspaceId, userId, role);
    }

    if (!result.error) {
      // Optimistic update — realtime UPDATE will confirm
      setMembers(prev =>
        prev.map(m => m.userId === userId ? { ...m, role } : m),
      );

      // Part 52.3B: log the NAMED role-change entry (the single surviving row).
      const targetName = currentMember?.profile?.fullName
        ?? currentMember?.profile?.username
        ?? 'A member';

      // FIX: the actor is the CURRENT user, not "whichever owner row we find".
      const changedByName = await resolveActorName();

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        logRoleChanged({
          workspaceId,
          workspaceName: (ws as any)?.name ?? '',
          targetUserId:  userId,
          targetName,
          newRole:        role,
          changedByName,
        }).catch(() => {});
      } catch {
        // Even if the workspace-name lookup fails, still log the entry.
        logRoleChanged({
          workspaceId,
          workspaceName: '',
          targetUserId:  userId,
          targetName,
          newRole:        role,
          changedByName,
        }).catch(() => {});
      }
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members, resolveActorName]);

  // ── Remove member ─────────────────────────────────────────────────────
  const remove = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const targetMember = members.find(m => m.userId === userId);
    const result = await removeMember(workspaceId, userId);

    if (!result.error) {
      // Optimistic update — realtime DELETE will confirm
      setMembers(prev => prev.filter(m => m.userId !== userId));

      // Part 46 FIX: Broadcast kick signal to removed user.
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

      // Part 52.3B: log the NAMED removal entry with the correct actor name.
      const removedName = targetMember?.profile?.fullName ?? targetMember?.profile?.username ?? 'A member';
      const currentName = await resolveActorName();

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        logMemberRemoved({
          workspaceId,
          workspaceName: (ws as any)?.name ?? '',
          removedUserId: userId,
          removedName,
          removedByName: currentName,
        }).catch(() => {});
      } catch {
        logMemberRemoved({
          workspaceId,
          workspaceName: '',
          removedUserId: userId,
          removedName,
          removedByName: currentName,
        }).catch(() => {});
      }
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members, resolveActorName]);

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
      // Realtime UPDATE events flip both rows on all devices; don't call load().
      const newOwnerName  = newOwnerMember?.profile?.fullName ?? newOwnerMember?.profile?.username ?? 'New owner';
      const previousOwner = previousOwnerMember?.profile?.fullName ?? previousOwnerMember?.profile?.username ?? 'Previous owner';

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        logOwnershipTransferred({
          workspaceId,
          workspaceName: (ws as any)?.name ?? '',
          newOwnerId,
          newOwnerName,
          previousOwner,
        }).catch(() => {});
      } catch {
        logOwnershipTransferred({
          workspaceId,
          workspaceName: '',
          newOwnerId,
          newOwnerName,
          previousOwner,
        }).catch(() => {});
      }
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members]);

  // ── Block member ───────────────────────────────────────────────────────
  // Calls block_workspace_member RPC, then logs the NAMED entry (Part 52.3B).
  // The RPC's own nameless 'member_blocked' row is dropped by schema_part52_3.sql,
  // so this named entry is the single "blocked <name>" row that survives.
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

      // Part 52.3B: NAMED block entry with the correct actor name.
      const blockedName   = targetMember?.profile?.fullName ?? targetMember?.profile?.username ?? 'A member';
      const blockedByName = await resolveActorName();

      try {
        const { data: ws } = await supabase
          .from('workspaces').select('name').eq('id', workspaceId).single();
        logMemberBlocked({
          workspaceId,
          workspaceName: (ws as any)?.name ?? '',
          blockedUserId: userId,
          blockedName,
          blockedByName,
        }).catch(() => {});
      } catch {
        logMemberBlocked({
          workspaceId,
          workspaceName: '',
          blockedUserId: userId,
          blockedName,
          blockedByName,
        }).catch(() => {});
      }

      setIsUpdating(false);
      return { error: null };
    } catch (err) {
      setIsUpdating(false);
      return { error: err instanceof Error ? err.message : 'Failed to block member' };
    }
  }, [workspaceId, members, resolveActorName]);

  return {
    members, isLoading, isUpdating, error,
    userRole, isOwner, canManage,
    refresh: load,
    changeRole, remove, leave, transferOwner, block,
  };
}