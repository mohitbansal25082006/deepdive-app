// src/services/blockService.ts
// Part 13B — Block / unblock workspace members.
// All heavy lifting is done by SECURITY DEFINER RPCs in schema_part13.sql.

import { supabase }      from '../lib/supabase';
import { BlockedMember } from '../types';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapBlocked(row: Record<string, unknown>): BlockedMember {
  const p = row.profile as Record<string, unknown> | undefined;
  return {
    id:            row.id            as string,
    workspaceId:   row.workspace_id  as string,
    blockedUserId: row.blocked_user_id as string,
    blockedBy:     row.blocked_by    as string,
    reason:        (row.reason       as string) ?? null,
    blockedAt:     row.blocked_at    as string,
    profile: p ? {
      id:        p.id         as string,
      username:  (p.username  as string) ?? null,
      fullName:  (p.full_name as string) ?? null,
      avatarUrl: (p.avatar_url as string) ?? null,
    } : undefined,
  };
}

// ─── Block a member ───────────────────────────────────────────────────────────

/**
 * Blocks a member from a workspace.
 * Owner only — enforced by the DB RPC.
 * The RPC also:
 *   • removes them from workspace_members
 *   • cancels any pending access requests
 *   • marks approved requests as 'removed'
 *   • inserts into workspace_blocked_members
 *   • logs the activity
 */
export async function blockMember(
  workspaceId: string,
  userId:      string,
  reason?:     string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('block_workspace_member', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
      p_reason:       reason?.trim() ?? null,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to block member' };
  }
}

// ─── Unblock a member ─────────────────────────────────────────────────────────

export async function unblockMember(
  workspaceId: string,
  userId:      string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('unblock_workspace_member', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to unblock member' };
  }
}

// ─── Get blocked members list ─────────────────────────────────────────────────

export async function getBlockedMembers(
  workspaceId: string,
): Promise<{ data: BlockedMember[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_blocked_members', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapBlocked), error: null };
  } catch (err) {
    return {
      data:  [],
      error: err instanceof Error ? err.message : 'Failed to load blocked members',
    };
  }
}

// ─── Check if a specific user is blocked ─────────────────────────────────────

export async function isUserBlocked(
  workspaceId: string,
  userId:      string,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_blocked_from_workspace', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
    });
    return (data as boolean) ?? false;
  } catch {
    return false;
  }
}