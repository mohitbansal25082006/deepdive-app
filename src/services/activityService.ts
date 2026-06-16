// src/services/activityService.ts
// Part 52.2 UPDATE — Activity Feed v2.
//
//   WHAT CHANGED vs Part 46:
//     • subscribeToActivity() now uses the PRIVATE Broadcast channel
//       "workspace_activity:{id}" (event "activity_insert"), fed by the
//       SECURITY DEFINER trigger in schema_part52_2.sql. The trigger resolves
//       the actor profile server-side and ships a fully-formed row, so the
//       feed updates instantly for EVERY member with no follow-up fetch and
//       no refresh. A postgres_changes listener is kept as a fallback.
//     • fetchActivityFeed() now calls the rebuilt get_workspace_activity_feed
//       RPC which EXCLUDES comment_* actions (Feature 1c) and joins the actor
//       profile. Both the RPC path and the broadcast path map through the same
//       mapActivity(), so shapes are identical.
//     • New granular settings loggers (Feature 1f):
//         logWorkspaceRenamed, logWorkspaceDescriptionChanged, logWorkspaceLogoChanged
//     • New member-join logger (Feature 1e): logMemberJoined (client backup;
//       the DB trigger also logs it, with a 10s dedupe guard).
//     • logSharedContentAdded now records the linked report_id + target ids in
//       metadata so the feed can make names tappable (Feature 1d).
//     • Role / removal / block / ownership / access loggers now also store the
//       TARGET user id so ActivityItem can open that member's profile, plus
//       the FULL untruncated names of both actors (Feature 1e).
//     • Comment loggers (logCommentReplied) are kept for callers but those
//       actions are filtered out of the feed at the RPC + trigger level.
//
//   Mapper handles BOTH the RPC row shape and the broadcast payload shape.

import { supabase } from '../lib/supabase';
import { WorkspaceActivity, WorkspaceActivityAction } from '../types';

// ─── Mapper ───────────────────────────────────────────────────────────────────
// Accepts either:
//   (a) an RPC row from get_workspace_activity_feed (flat snake_case + actor_*)
//   (b) a broadcast payload from "workspace_activity" channel (same flat shape)
//   (c) a raw postgres_changes row (no actor_* — caller resolves separately)

function mapActivity(row: Record<string, unknown>): WorkspaceActivity {
  const actorName     = (row.actor_name     as string | null) ?? null;
  const actorUsername = (row.actor_username as string | null) ?? null;
  const actorAvatar   = (row.actor_avatar   as string | null) ?? null;

  const userId       =
    (row.user_id  as string | null) ??
    (row.actor_id as string | null) ??
    null;

  const resourceType =
    (row.resource_type as string | null) ??
    (row.target_type   as string | null) ??
    null;

  const resourceId =
    (row.resource_id as string | null) ??
    (row.target_id   as string | null) ??
    null;

  const metadata =
    (row.metadata as Record<string, unknown> | null) ??
    (row.meta     as Record<string, unknown> | null) ??
    {};

  return {
    id:          row.id as string,
    workspaceId: row.workspace_id as string,
    userId,
    action:      row.action as WorkspaceActivityAction,
    resourceType,
    resourceId,
    metadata,
    createdAt:   row.created_at as string,
    actorProfile: (userId || actorName) ? {
      id:        userId ?? 'deleted',
      username:  actorUsername,
      fullName:  actorName,
      avatarUrl: actorAvatar,
    } : undefined,
  };
}

// ─── Fetch paginated feed ─────────────────────────────────────────────────────
// Comment actions are excluded by the RPC itself (Feature 1c).

export async function fetchActivityFeed(
  workspaceId: string,
  limit = 40,
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

// ─── Low-level log helper ─────────────────────────────────────────────────────

export async function logActivity(
  workspaceId:   string,
  action:        WorkspaceActivityAction,
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

// ─── Helper: resolve the current user's display name ──────────────────────────
// Used by client-side loggers that need the actor's full name (share/remove/
// unblock/leave). full_name → username → 'A member'. Never throws.

export async function resolveActorName(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'A member';
    const { data } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single();
    const p = data as { full_name?: string; username?: string } | null;
    return p?.full_name ?? p?.username ?? 'A member';
  } catch {
    return 'A member';
  }
}

// ─── Notification imports ─────────────────────────────────────────────────────

import {
  notifyReportAdded, notifyMemberRemoved, notifyMemberBlocked,
  notifyRoleChanged, notifyOwnershipTransferred, notifySharedContent,
} from './workspaceNotificationService';

// ─── Reports ──────────────────────────────────────────────────────────────────

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
      report_id:    params.reportId,
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

/** Log: a report was removed from the workspace. */
export async function logReportRemoved(params: {
  workspaceId:  string;
  reportId:     string;
  reportTitle:  string;
  removerName:  string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'report_removed', 'report', params.reportId, {
    report_title: params.reportTitle,
    remover_name: params.removerName,
    report_id:    params.reportId,
  });
}

// ─── Shared content (slides / papers / podcasts / debates / voice) ───────────

/**
 * Log + notify: a shared content item was added.
 * Part 52.2: voice_debate now uses its own 'voice_debate_shared' action and
 * the linked report_id is stored so the feed name can be tappable.
 */
export async function logSharedContentAdded(params: {
  workspaceId:   string;
  workspaceName: string;
  contentType:   'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate';
  contentId:     string;
  contentTitle:  string;
  sharerName:    string;
  reportId?:     string;
}): Promise<void> {
  const actionMap: Record<string, WorkspaceActivityAction> = {
    presentation:   'presentation_shared',
    academic_paper: 'academic_paper_shared',
    podcast:        'podcast_shared',
    debate:         'debate_shared',
    voice_debate:   'voice_debate_shared',
  };

  await Promise.all([
    logActivity(
      params.workspaceId,
      actionMap[params.contentType] ?? 'presentation_shared',
      params.contentType,
      params.contentId,
      {
        title:       params.contentTitle,
        topic:       params.contentTitle, // alias for debate/voice consumers
        sharer_name: params.sharerName,
        is_voice:    params.contentType === 'voice_debate',
        report_id:   params.reportId ?? undefined,
      },
    ),
    notifySharedContent({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      sharerName:    params.sharerName,
      contentType:   params.contentType === 'voice_debate' ? 'debate' : params.contentType,
      contentTitle:  params.contentTitle,
    }),
  ]);
}

/**
 * Log: a shared content item was removed (Fix 6 — Part 52.2 follow-up).
 * Each content type gets its own dedicated *_unshared action so the feed can
 * render a correctly-named "removed a <type>" entry. The title is stored
 * (untruncated) so the entry reads naturally; no tap target (the content is
 * gone), and no notification.
 */
export async function logSharedContentRemoved(params: {
  workspaceId:  string;
  contentType:  'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate';
  contentId:    string;
  contentTitle: string;
  removerName:  string;
}): Promise<void> {
  const actionMap: Record<string, WorkspaceActivityAction> = {
    presentation:   'presentation_unshared',
    academic_paper: 'academic_paper_unshared',
    podcast:        'podcast_unshared',
    debate:         'debate_unshared',
    voice_debate:   'voice_debate_unshared',
  };

  await logActivity(
    params.workspaceId,
    actionMap[params.contentType] ?? 'presentation_unshared',
    params.contentType,
    params.contentId,
    {
      title:        params.contentTitle,
      topic:        params.contentTitle, // alias for debate/voice consumers
      remover_name: params.removerName,
      is_voice:     params.contentType === 'voice_debate',
    },
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

/** Part 52.2: a member joined via invite code (client backup; DB also logs). */
export async function logMemberJoined(params: {
  workspaceId: string;
  userId:      string;
  joinedName:  string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'member_joined', 'member', params.userId, {
    joined_name:    params.joinedName,
    target_user_id: params.userId,
  });
}

/** Part 52.2 (Fix 3): a member left the workspace of their own accord. */
export async function logMemberLeft(params: {
  workspaceId: string;
  userId:      string;
  leftName:    string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'member_left', 'member', params.userId, {
    left_name:      params.leftName,
    target_user_id: params.userId,
  });
}

/** Part 52.2 (Fix 2): a previously-blocked member was unblocked. */
export async function logMemberUnblocked(params: {
  workspaceId:     string;
  unblockedUserId: string;
  unblockedName:   string;
  unblockedByName: string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'member_unblocked', 'member', params.unblockedUserId, {
    unblocked_name:    params.unblockedName,
    unblocked_by_name: params.unblockedByName,
    unblocked_user_id: params.unblockedUserId,
    target_user_id:    params.unblockedUserId,
  });
}

/** Log + notify: a member was removed. Stores both names + target id. */
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
      removed_user_id: params.removedUserId,
      target_user_id:  params.removedUserId,
    }),
    notifyMemberRemoved({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      removedName:   params.removedName,
      removedByName: params.removedByName,
    }),
  ]);
}

/** Log + notify: a member was blocked. Stores both names + target id. */
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
      blocked_user_id: params.blockedUserId,
      target_user_id:  params.blockedUserId,
    }),
    notifyMemberBlocked({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      blockedName:   params.blockedName,
      blockedByName: params.blockedByName,
    }),
  ]);
}

/** Log + notify: a member's role was changed. Stores both names + target id. */
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
      target_user_id:  params.targetUserId,
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

/** Log + notify: workspace ownership was transferred. Stores both names + id. */
export async function logOwnershipTransferred(params: {
  workspaceId:   string;
  workspaceName: string;
  newOwnerId:    string;
  newOwnerName:  string;
  previousOwner: string;
}): Promise<void> {
  await Promise.all([
    logActivity(params.workspaceId, 'ownership_transferred', 'member', params.newOwnerId, {
      new_owner_name: params.newOwnerName,
      previous_owner: params.previousOwner,
      new_owner_id:   params.newOwnerId,
      target_user_id: params.newOwnerId,
    }),
    notifyOwnershipTransferred({
      workspaceId:   params.workspaceId,
      workspaceName: params.workspaceName,
      newOwnerName:  params.newOwnerName,
      previousOwner: params.previousOwner,
    }),
  ]);
}

// ─── Pin / unpin ──────────────────────────────────────────────────────────────

export async function logPinToggled(params: {
  workspaceId:  string;
  reportId:     string;
  pinned:       boolean;
  reportTitle:  string;
}): Promise<void> {
  try {
    await supabase.rpc('log_pin_activity', {
      p_workspace_id: params.workspaceId,
      p_report_id:    params.reportId,
      p_pinned:       params.pinned,
      p_report_title: params.reportTitle,
    });
  } catch {
    await logActivity(
      params.workspaceId,
      params.pinned ? 'report_pinned' : 'report_unpinned',
      'report',
      params.reportId,
      { report_title: params.reportTitle, report_id: params.reportId },
    );
  }
}

// ─── Access requests ──────────────────────────────────────────────────────────

export async function logAccessRequestSent(params: {
  workspaceId: string;
  userId:      string;
  userName:    string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'access_request_sent', 'member', params.userId, {
    requester_name: params.userName,
    target_user_id: params.userId,
  });
}

/**
 * Part 52.2: logs BOTH the approver and the requester names so the feed can
 * render "<approver> granted editor access to <requester>" with both names
 * tappable to their profiles (Feature 1e).
 */
export async function logAccessRequestApproved(params: {
  workspaceId:   string;
  requesterId:   string;
  requesterName: string;
  approverName:  string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'access_request_approved', 'member', params.requesterId, {
    requester_name: params.requesterName,
    approver_name:  params.approverName,
    target_user_id: params.requesterId,
    new_role:       'editor',
  });
}

export async function logAccessRequestDenied(params: {
  workspaceId:   string;
  requesterId:   string;
  requesterName: string;
  approverName?: string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'access_request_denied', 'member', params.requesterId, {
    requester_name: params.requesterName,
    approver_name:  params.approverName,
    target_user_id: params.requesterId,
  });
}

// ─── Settings changes (Feature 1f) ────────────────────────────────────────────

/** Log: workspace name changed, with old → new and who did it. */
export async function logWorkspaceRenamed(params: {
  workspaceId: string;
  oldName:     string;
  newName:     string;
  actorName:   string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'workspace_renamed', 'workspace', params.workspaceId, {
    old_name:        params.oldName,
    new_name:        params.newName,
    changed_by_name: params.actorName,
  });
}

/** Log: workspace description changed, with old → new and who did it. */
export async function logWorkspaceDescriptionChanged(params: {
  workspaceId:    string;
  oldDescription: string;
  newDescription: string;
  actorName:      string;
}): Promise<void> {
  await logActivity(params.workspaceId, 'workspace_description_changed', 'workspace', params.workspaceId, {
    old_description: params.oldDescription,
    new_description: params.newDescription,
    changed_by_name: params.actorName,
  });
}

/** Log: workspace logo changed (set or removed), with who did it. */
export async function logWorkspaceLogoChanged(params: {
  workspaceId: string;
  actorName:   string;
  removed:     boolean;
}): Promise<void> {
  await logActivity(params.workspaceId, 'workspace_logo_changed', 'workspace', params.workspaceId, {
    changed_by_name: params.actorName,
    removed:         params.removed,
  });
}

// ─── Comment loggers (kept for callers; filtered out of the feed) ────────────

/** Part 46: a reply was added to a comment. NOT shown in the feed (1c). */
export async function logCommentReplied(params: {
  workspaceId: string;
  commentId:   string;
  reportId:    string;
}): Promise<void> {
  await logActivity(
    params.workspaceId,
    'comment_reply_added',
    'comment',
    params.commentId,
    { report_id: params.reportId },
  );
}

/** Legacy alias retained for older call sites. */
export async function logSharedVoiceDebate(params: {
  workspaceId:   string;
  workspaceName: string;
  debateId:      string;
  topic:         string;
  sharerName:    string;
}): Promise<void> {
  await logSharedContentAdded({
    workspaceId:   params.workspaceId,
    workspaceName: params.workspaceName,
    contentType:   'voice_debate',
    contentId:     params.debateId,
    contentTitle:  params.topic,
    sharerName:    params.sharerName,
  });
}

// ─── Realtime subscription (Part 52.2: Broadcast PRIMARY + pg fallback) ───────
//
//   PRIMARY: private channel "workspace_activity:{id}", event "activity_insert"
//   from the SECURITY DEFINER trigger. Payload already includes the resolved
//   actor profile, so we map it directly — no extra round-trip, instant for
//   every member, and comment_* events are excluded server-side.
//
//   FALLBACK: postgres_changes INSERT on workspace_activity. Used only if the
//   broadcast is unavailable (e.g. migration not yet applied). We resolve the
//   actor profile client-side and skip comment_* actions to match the feed.

export function subscribeToActivity(
  workspaceId: string,
  onInsert: (activity: WorkspaceActivity) => void,
): () => void {
  let cancelled = false;
  const channels: ReturnType<typeof supabase.channel>[] = [];

  const seen = new Set<string>();
  const emit = (activity: WorkspaceActivity) => {
    if (cancelled) return;
    if (seen.has(activity.id)) return;     // dedupe broadcast + pg fallback
    seen.add(activity.id);
    onInsert(activity);
  };

  (async () => {
    // Authenticate the socket BEFORE subscribing to the private channel,
    // otherwise RLS on realtime.messages drops the broadcast.
    const { data: { session } } = await supabase.auth.getSession();
    if (cancelled) return;
    if (session?.access_token) {
      await supabase.realtime.setAuth(session.access_token);
    }
    if (cancelled) return;

    // PRIMARY — private broadcast
    const bc = supabase
      .channel(`workspace_activity:${workspaceId}`, { config: { private: true } })
      .on('broadcast', { event: 'activity_insert' }, (payload) => {
        const data = (payload.payload ?? {}) as Record<string, unknown>;
        if (!data.id) return;
        emit(mapActivity(data));
      })
      .subscribe();
    channels.push(bc);
  })();

  // FALLBACK — postgres_changes
  const pg = supabase
    .channel(`p52_2:ws:${workspaceId}:activity_feed`)
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
        const action = row.action as WorkspaceActivityAction;

        // Feature 1c — never surface comment events.
        if (
          action === 'comment_added' ||
          action === 'comment_resolved' ||
          action === 'comment_reply_added'
        ) return;

        const userId =
          (row.user_id  as string | null) ??
          (row.actor_id as string | null) ??
          null;

        let actorName: string | null = null;
        let actorUsername: string | null = null;
        let actorAvatar: string | null = null;

        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', userId)
            .single();
          if (data) {
            const p = data as Record<string, unknown>;
            actorUsername = (p.username   as string) ?? null;
            actorName     = (p.full_name  as string) ?? null;
            actorAvatar   = (p.avatar_url as string) ?? null;
          }
        }

        emit(mapActivity({
          ...row,
          actor_name:     actorName,
          actor_username: actorUsername,
          actor_avatar:   actorAvatar,
        }));
      },
    )
    .subscribe();
  channels.push(pg);

  return () => {
    cancelled = true;
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}