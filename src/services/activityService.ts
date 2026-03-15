// src/services/activityService.ts
// Part 18D — Extended logActivity to cover all new action types:
//   shared content added/removed, report added/removed,
//   member removed, ownership transferred.
// All existing Part 11 behaviour is preserved.

import { supabase } from '../lib/supabase';
import { WorkspaceActivity, WorkspaceActivityAction } from '../types';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapActivity(row: Record<string, unknown>): WorkspaceActivity {
  const activityData = (row.activity ?? row) as Record<string, unknown>;

  const actorName     = (row.actor_name     as string | null) ?? null;
  const actorUsername = (row.actor_username as string | null) ?? null;
  const actorAvatar   = (row.actor_avatar   as string | null) ?? null;

  const userId       = (activityData.user_id  as string | null) ?? (activityData.actor_id as string | null) ?? null;
  const resourceType = (activityData.resource_type as string | null) ?? (activityData.target_type as string | null) ?? null;
  const resourceId   = (activityData.resource_id   as string | null) ?? (activityData.target_id   as string | null) ?? null;
  const metadata     = (activityData.metadata as Record<string, unknown> | null) ?? (activityData.meta as Record<string, unknown> | null) ?? {};

  return {
    id:           activityData.id as string,
    workspaceId:  activityData.workspace_id as string,
    userId,
    action:       activityData.action as WorkspaceActivityAction,
    resourceType,
    resourceId,
    metadata,
    createdAt:    activityData.created_at as string,
    actorProfile: userId || actorName ? {
      id:        userId ?? 'deleted',
      username:  actorUsername,
      fullName:  actorName,
      avatarUrl: actorAvatar,
    } : undefined,
  };
}

// ─── Fetch paginated feed ─────────────────────────────────────────────────────

export async function fetchActivityFeed(
  workspaceId: string,
  limit = 30,
): Promise<{ data: WorkspaceActivity[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_activity_feed', {
      p_workspace_id: workspaceId,
      p_limit:        limit,
    });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapActivity), error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load activity' };
  }
}

// ─── Log an activity event ────────────────────────────────────────────────────
//
// Part 18D: enhanced metadata helpers for all new action types.
// The function itself is unchanged — callers pass the metadata directly.

export async function logActivity(
  workspaceId:  string,
  action:       WorkspaceActivityAction,
  resourceType?: string,
  resourceId?:   string,
  metadata?:     Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action,
      resource_type: resourceType ?? null,
      resource_id:   resourceId   ?? null,
      metadata:      metadata     ?? {},
    });
  } catch (err) {
    console.warn('[activityService] logActivity error:', err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────
// These make it easy to call logActivity from workspace screens with correct
// metadata shapes, and also fire the corresponding local notification.

import {
  notifyReportAdded, notifyMemberRemoved, notifyMemberBlocked,
  notifyRoleChanged, notifyOwnershipTransferred, notifySharedContent,
} from './workspaceNotificationService';

/** Log + notify: a report was added to the workspace. */
export async function logReportAdded(params: {
  workspaceId:   string;
  workspaceName: string;
  reportId:      string;
  reportTitle:   string;
  adderName:     string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'report_added', 'report', params.reportId, {
      report_title: params.reportTitle,
      adder_name:   params.adderName,
    }),
    notifyReportAdded({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      reportTitle:   params.reportTitle,
      adderName:     params.adderName,
      reportId:      params.reportId,
    }),
  ]);
}

/** Log + notify: a report was removed from the workspace. */
export async function logReportRemoved(params: {
  workspaceId:  string;
  reportId:     string;
  reportTitle:  string;
  removerName:  string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'report_removed', 'report', params.reportId, {
    report_title: params.reportTitle,
    remover_name: params.removerName,
  });
}

/** Log + notify: a shared content item was added. */
export async function logSharedContentAdded(params: {
  workspaceId:   string;
  workspaceName: string;
  contentType:   'presentation' | 'academic_paper' | 'podcast' | 'debate';
  contentId:     string;
  contentTitle:  string;
  sharerName:    string;
}): Promise<void> {
  const actionMap: Record<string, WorkspaceActivityAction> = {
    presentation:   'presentation_shared',
    academic_paper: 'academic_paper_shared',
    podcast:        'podcast_shared',
    debate:         'debate_shared',
  };
  await Promise.all([
    logActivity(
      params.workspaceId,
      actionMap[params.contentType] ?? 'presentation_shared',
      params.contentType,
      params.contentId,
      { title: params.contentTitle, sharer_name: params.sharerName },
    ),
    notifySharedContent({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      sharerName:    params.sharerName,
      contentType:   params.contentType,
      contentTitle:  params.contentTitle,
    }),
  ]);
}

/** Log + notify: a member was removed from the workspace. */
export async function logMemberRemoved(params: {
  workspaceId:   string;
  workspaceName: string;
  removedUserId: string;
  removedName:   string;
  removedByName: string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'member_removed', 'member', params.removedUserId, {
      removed_name:    params.removedName,
      removed_by_name: params.removedByName,
    }),
    notifyMemberRemoved({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      removedName:   params.removedName,
      removedByName: params.removedByName,
    }),
  ]);
}

/** Log + notify: a member was blocked. */
export async function logMemberBlocked(params: {
  workspaceId:   string;
  workspaceName: string;
  blockedUserId: string;
  blockedName:   string;
  blockedByName: string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'member_blocked', 'member', params.blockedUserId, {
      blocked_name:    params.blockedName,
      blocked_by_name: params.blockedByName,
    }),
    notifyMemberBlocked({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      blockedName:   params.blockedName,
      blockedByName: params.blockedByName,
    }),
  ]);
}

/** Log + notify: a member's role was changed. */
export async function logRoleChanged(params: {
  workspaceId:   string;
  workspaceName: string;
  targetUserId:  string;
  targetName:    string;
  newRole:       string;
  changedByName: string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'member_role_changed', 'member', params.targetUserId, {
      target_name:     params.targetName,
      new_role:        params.newRole,
      changed_by_name: params.changedByName,
    }),
    notifyRoleChanged({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      targetName:    params.targetName,
      newRole:       params.newRole,
      changedByName: params.changedByName,
    }),
  ]);
}

/** Log + notify: workspace ownership was transferred. */
export async function logOwnershipTransferred(params: {
  workspaceId:   string;
  workspaceName: string;
  newOwnerId:    string;
  newOwnerName:  string;
  previousOwner: string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'ownership_transferred', 'workspace', params.workspaceId, {
      new_owner_name: params.newOwnerName,
      previous_owner: params.previousOwner,
    }),
    notifyOwnershipTransferred({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      newOwnerName:  params.newOwnerName,
      previousOwner: params.previousOwner,
    }),
  ]);
}

// ─── Realtime subscription ────────────────────────────────────────────────────

export function subscribeToActivity(
  workspaceId: string,
  onInsert: (activity: WorkspaceActivity) => void,
): () => void {
  const channel = supabase
    .channel(`workspace:${workspaceId}:activity`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'workspace_activity',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      async (payload) => {
        const row = payload.new as Record<string, unknown>;

        const userId =
          (row.user_id  as string | null) ??
          (row.actor_id as string | null) ??
          null;

        let actorProfile: WorkspaceActivity['actorProfile'];
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', userId)
            .single();
          if (data) {
            const p = data as Record<string, unknown>;
            actorProfile = {
              id:        p.id        as string,
              username:  (p.username  as string) ?? null,
              fullName:  (p.full_name as string) ?? null,
              avatarUrl: (p.avatar_url as string) ?? null,
            };
          }
        }

        const resourceType = (row.resource_type as string | null) ?? null;
        const resourceId   = (row.resource_id   as string | null) ?? null;
        const metadata     = (row.metadata as Record<string, unknown> | null) ?? {};

        onInsert({
          id:           row.id as string,
          workspaceId:  row.workspace_id as string,
          userId,
          action:       row.action as WorkspaceActivityAction,
          resourceType,
          resourceId,
          metadata,
          createdAt:    row.created_at as string,
          actorProfile,
        });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}