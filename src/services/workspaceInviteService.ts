// src/services/workspaceInviteService.ts
// Part 46 UPDATE — Removed double activity logging from updateMemberRole
// and removeMember. Activity logging is now done in useWorkspaceMembers
// (with workspace name lookup and notification) to avoid duplicate entries
// in the Activity feed.
//
// subscribeToMembers is kept for backward compatibility but marked as
// LEGACY — useWorkspaceRealtime (Part 46) is the preferred approach.
// It will still work correctly alongside useWorkspaceRealtime.
//
// All Part 13B behaviour (buildInviteUrl, copyInviteLink, shareInviteLink,
// getWorkspaceMembersWithProfiles, updateMemberRole, removeMember,
// leaveWorkspace, transferOwnership) is preserved exactly.

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { WorkspaceMember, WorkspaceRole } from '../types';
import { mapWorkspaceMember } from './workspaceService';

// ─── Build a shareable invite URL ─────────────────────────────────────────────

export function buildInviteUrl(inviteCode: string): string {
  return `deepdive://workspace/join/${inviteCode}`;
}

// ─── Copy invite link to clipboard ───────────────────────────────────────────

export async function copyInviteLink(inviteCode: string): Promise<void> {
  await Clipboard.setStringAsync(buildInviteUrl(inviteCode));
}

// ─── Native share sheet for invite ───────────────────────────────────────────

export async function shareInviteLink(
  workspaceName: string,
  inviteCode: string,
): Promise<void> {
  const url = buildInviteUrl(inviteCode);
  await Share.share({
    message: `Join my DeepDive AI workspace "${workspaceName}"!\n\nInvite link: ${url}\n\nOr use code: ${inviteCode}`,
    url,
    title: `Join ${workspaceName}`,
  });
}

// ─── Get all members with profiles ───────────────────────────────────────────

export async function getWorkspaceMembersWithProfiles(
  workspaceId: string,
): Promise<{ data: WorkspaceMember[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('get_workspace_members_with_profiles', { p_workspace_id: workspaceId });

    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapWorkspaceMember), error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load members' };
  }
}

// ─── Update member role ───────────────────────────────────────────────────────
// Part 46: activity logging moved to useWorkspaceMembers.changeRole()
// to avoid duplicates and to include workspace name + notification.

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: Exclude<WorkspaceRole, 'owner'>,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('workspace_members')
      .update({ role: newRole })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (error) throw error;
    // NOTE: Activity logging intentionally removed here — done in useWorkspaceMembers
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update role' };
  }
}

// ─── Remove a member ─────────────────────────────────────────────────────────
// Part 46: activity logging moved to useWorkspaceMembers.remove()

export async function removeMember(
  workspaceId: string,
  userId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (error) throw error;
    // NOTE: Activity logging intentionally removed here — done in useWorkspaceMembers
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove member' };
  }
}

// ─── Leave a workspace (self-remove) ─────────────────────────────────────────

export async function leaveWorkspace(
  workspaceId: string,
): Promise<{ error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id);

    if (error) throw error;

    // Log member_left — safe to do here (not duplicated elsewhere)
    // Wrapped in void async to avoid ts(2551): .catch() doesn't exist on
    // PostgrestFilterBuilder directly in the Supabase TS types.
    void (async () => {
      try {
        await supabase.from('workspace_activity').insert({
          workspace_id:  workspaceId,
          user_id:       user.id,
          action:        'member_left',
          resource_type: 'member',
          resource_id:   user.id,
          metadata:      {},
        });
      } catch {
        // Non-fatal — ignore silently
      }
    })();

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to leave workspace' };
  }
}

// ─── Transfer ownership ───────────────────────────────────────────────────────

export async function transferOwnership(
  workspaceId: string,
  newOwnerId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .rpc('transfer_workspace_ownership', {
        p_workspace_id: workspaceId,
        p_new_owner_id: newOwnerId,
      });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to transfer ownership' };
  }
}

// ─── LEGACY: subscribeToMembers ───────────────────────────────────────────────
// Kept for backward compatibility. Part 46 uses useWorkspaceRealtime instead.
// Both can coexist — Supabase allows multiple subscriptions on different channels.

export function subscribeToMembers(
  workspaceId: string,
  callbacks: {
    onInsert: (member: { userId: string; role: WorkspaceRole }) => void;
    onDelete: (userId: string) => void;
    onUpdate: (member: { userId: string; role: WorkspaceRole }) => void;
  },
): () => void {
  const channel = supabase
    .channel(`legacy:workspace:${workspaceId}:members`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'workspace_members',
        filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        callbacks.onInsert({ userId: row.user_id as string, role: row.role as WorkspaceRole });
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'workspace_members',
        filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        // With REPLICA IDENTITY FULL, old has user_id
        const old = payload.old as Record<string, unknown>;
        callbacks.onDelete(old.user_id as string);
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'workspace_members',
        filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        callbacks.onUpdate({ userId: row.user_id as string, role: row.role as WorkspaceRole });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}