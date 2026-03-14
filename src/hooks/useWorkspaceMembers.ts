// src/hooks/useWorkspaceMembers.ts
// Member management with realtime updates.
// Part 13B UPDATE:
//   • changeRole now calls demoteEditorToViewer() RPC when the target is
//     currently an editor AND the new role is 'viewer'. This ensures the
//     viewer gets the "you were removed as editor" notification banner.
//   • All other role changes still use updateMemberRole as before.

import { useState, useEffect, useCallback } from 'react';
import { WorkspaceMember, WorkspaceRole }    from '../types';
import {
  getWorkspaceMembersWithProfiles,
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  transferOwnership,
  subscribeToMembers,
} from '../services/workspaceInviteService';
import { demoteEditorToViewer } from '../services/editAccessRequestService';
import { useAuth }               from '../context/AuthContext';

export function useWorkspaceMembers(workspaceId: string | null) {
  const { user }         = useAuth();
  const [members,     setMembers]    = useState<WorkspaceMember[]>([]);
  const [isLoading,   setIsLoading]  = useState(true);
  const [isUpdating,  setIsUpdating] = useState(false);
  const [error,       setError]      = useState<string | null>(null);

  const userMember = members.find((m) => m.userId === user?.id);
  const userRole   = userMember?.role ?? null;
  const isOwner    = userRole === 'owner';
  const canManage  = isOwner;

  // ── Load ──────────────────────────────────────────────────────────────────
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

    const unsubscribe = subscribeToMembers(workspaceId, {
      onInsert: () => { load(); },
      onDelete: (userId) => {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      },
      onUpdate: ({ userId, role }) => {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role } : m)),
        );
      },
    });

    return unsubscribe;
  }, [workspaceId, load]);

  // ── Change role ────────────────────────────────────────────────────────────
  // Part 13B: if the member is currently an editor and we're demoting to viewer,
  // use the demote_editor_to_viewer RPC so the access request is also reset.

  const changeRole = useCallback(async (
    userId: string,
    role:   Exclude<WorkspaceRole, 'owner'>,
  ) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);

    const currentMember = members.find((m) => m.userId === userId);
    const isEditorDemotion = currentMember?.role === 'editor' && role === 'viewer';

    let result: { error: string | null };

    if (isEditorDemotion) {
      // Use special RPC that also resets the access request to 'removed'
      result = await demoteEditorToViewer(workspaceId, userId);
    } else {
      result = await updateMemberRole(workspaceId, userId, role);
    }

    if (!result.error) {
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m)),
      );
    }

    setIsUpdating(false);
    return result;
  }, [workspaceId, members]);

  // ── Remove ────────────────────────────────────────────────────────────────
  const remove = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);
    const result = await removeMember(workspaceId, userId);
    if (!result.error) setMembers((prev) => prev.filter((m) => m.userId !== userId));
    setIsUpdating(false);
    return result;
  }, [workspaceId]);

  // ── Leave ─────────────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    if (!workspaceId) return { error: 'No workspace' };
    return leaveWorkspace(workspaceId);
  }, [workspaceId]);

  // ── Transfer ownership ────────────────────────────────────────────────────
  const transferOwner = useCallback(async (newOwnerId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);
    const result = await transferOwnership(workspaceId, newOwnerId);
    if (!result.error) await load();
    setIsUpdating(false);
    return result;
  }, [workspaceId, load]);

  return {
    members, isLoading, isUpdating, error,
    userRole, isOwner, canManage,
    refresh: load,
    changeRole, remove, leave, transferOwner,
  };
}