// src/services/workspaceInviteService.ts
// Invite link generation, email invites, and member management.

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { WorkspaceMember, WorkspaceRole } from '../types';
import { mapWorkspaceMember } from './workspaceService';
import { logActivity } from './activityService';

// ─── Build a shareable invite URL ─────────────────────────────────────────────
// Format: deepdive://workspace/join/{code}
// A production app would use a universal link; for this project we use a
// custom scheme that the app handles via Expo Router's deep-link handler.

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

    await logActivity(workspaceId, 'member_role_changed', 'member', userId, { new_role: newRole });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update role' };
  }
}

// ─── Remove a member ─────────────────────────────────────────────────────────

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

    await logActivity(workspaceId, 'member_removed', 'member', userId);
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

    await logActivity(workspaceId, 'member_left', 'member', user.id);
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

// ─── Subscribe to member list changes ────────────────────────────────────────

export function subscribeToMembers(
  workspaceId: string,
  callbacks: {
    onInsert: (member: { userId: string; role: WorkspaceRole }) => void;
    onDelete: (userId: string) => void;
    onUpdate: (member: { userId: string; role: WorkspaceRole }) => void;
  },
): () => void {
  const channel = supabase
    .channel(`workspace:${workspaceId}:members`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'workspace_members',
        filter: `workspace_id=eq.${workspaceId}`,
      },
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
        callbacks.onDelete((payload.old as Record<string, unknown>).user_id as string);
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