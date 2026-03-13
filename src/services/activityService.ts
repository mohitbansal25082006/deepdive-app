// src/services/activityService.ts
// Part 11 — Read and subscribe to workspace activity feed.
// CHANGED: Activity persistence — rows now survive user account deletion
//          (schema_part11.sql changed actor FK to ON DELETE SET NULL).
//          Mapper handles null actor_id / user_id gracefully so historical
//          entries always render as "Deleted User" rather than crashing.

import { supabase } from '../lib/supabase';
import { WorkspaceActivity, WorkspaceActivityAction } from '../types';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapActivity(row: Record<string, unknown>): WorkspaceActivity {
  // The RPC returns flat columns from get_workspace_activity_feed;
  // raw INSERT payloads may arrive as nested objects.
  const activityData = (row.activity ?? row) as Record<string, unknown>;

  // Actor can be null (deleted user) — show graceful fallback
  const actorName     = (row.actor_name     as string | null) ?? null;
  const actorUsername = (row.actor_username as string | null) ?? null;
  const actorAvatar   = (row.actor_avatar   as string | null) ?? null;

  // Support both column naming conventions across schema versions
  const userId =
    (activityData.user_id  as string | null) ??
    (activityData.actor_id as string | null) ??
    null;

  const resourceType =
    (activityData.resource_type as string | null) ??
    (activityData.target_type   as string | null) ??
    null;

  const resourceId =
    (activityData.resource_id as string | null) ??
    (activityData.target_id   as string | null) ??
    null;

  const metadata =
    (activityData.metadata as Record<string, unknown> | null) ??
    (activityData.meta     as Record<string, unknown> | null) ??
    {};

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

// ─── Fetch paginated activity feed ────────────────────────────────────────────

export async function fetchActivityFeed(
  workspaceId: string,
  limit = 30,
): Promise<{ data: WorkspaceActivity[]; error: string | null }> {
  try {
    // Use the updated RPC from schema_part11 that handles null actors
    const { data, error } = await supabase
      .rpc('get_workspace_activity_feed', {
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

export async function logActivity(
  workspaceId: string,
  action: WorkspaceActivityAction,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Try schema_part10 column names first; fall back gracefully if columns differ
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

// ─── Realtime subscription for activity feed ──────────────────────────────────
// NOTE: Because actor_id / user_id is now nullable (SET NULL on delete),
//       we handle the case where userId is null in the realtime payload.
//       The activity row will still arrive — we just show "Deleted User".

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

        // userId may be null if SET NULL has already fired for a deleted account
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