// src/hooks/useWorkspaceMembers.ts
// Member management with realtime updates.

import { useState, useEffect, useCallback } from 'react';
import { WorkspaceMember, WorkspaceRole } from '../types';
import {
  getWorkspaceMembersWithProfiles,
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  transferOwnership,
  subscribeToMembers,
} from '../services/workspaceInviteService';
import { useAuth } from '../context/AuthContext';

export function useWorkspaceMembers(workspaceId: string | null) {
  const { user } = useAuth();
  const [members,      setMembers]      = useState<WorkspaceMember[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isUpdating,   setIsUpdating]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const userMember  = members.find(m => m.userId === user?.id);
  const userRole    = userMember?.role ?? null;
  const isOwner     = userRole === 'owner';
  const canManage   = isOwner;

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
        setMembers(prev => prev.filter(m => m.userId !== userId));
      },
      onUpdate: ({ userId, role }) => {
        setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m));
      },
    });

    return unsubscribe;
  }, [workspaceId, load]);

  const changeRole = useCallback(async (
    userId: string,
    role: Exclude<WorkspaceRole, 'owner'>,
  ) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);
    const result = await updateMemberRole(workspaceId, userId, role);
    if (!result.error) {
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m));
    }
    setIsUpdating(false);
    return result;
  }, [workspaceId]);

  const remove = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace' };
    setIsUpdating(true);
    const result = await removeMember(workspaceId, userId);
    if (!result.error) setMembers(prev => prev.filter(m => m.userId !== userId));
    setIsUpdating(false);
    return result;
  }, [workspaceId]);

  const leave = useCallback(async () => {
    if (!workspaceId) return { error: 'No workspace' };
    return leaveWorkspace(workspaceId);
  }, [workspaceId]);

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