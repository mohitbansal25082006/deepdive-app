// src/services/activityService.ts
// Read and subscribe to workspace activity feed.

import { supabase } from '../lib/supabase';
import { WorkspaceActivity, WorkspaceActivityAction } from '../types';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapActivity(row: Record<string, unknown>): WorkspaceActivity {
  const actor = row.actor_profile as Record<string, unknown> | undefined;
  const activityData = (row.activity ?? row) as Record<string, unknown>;
  return {
    id:           activityData.id as string,
    workspaceId:  activityData.workspace_id as string,
    userId:       (activityData.user_id as string) ?? null,
    action:       activityData.action as WorkspaceActivityAction,
    resourceType: (activityData.resource_type as string) ?? null,
    resourceId:   (activityData.resource_id   as string) ?? null,
    metadata:     (activityData.metadata as Record<string, unknown>) ?? {},
    createdAt:    activityData.created_at as string,
    actorProfile: actor ? {
      id:        actor.id as string,
      username:  (actor.username  as string) ?? null,
      fullName:  (actor.full_name as string)  ?? null,
      avatarUrl: (actor.avatar_url as string) ?? null,
    } : undefined,
  };
}

// ─── Fetch paginated activity feed ────────────────────────────────────────────

export async function fetchActivityFeed(
  workspaceId: string,
  limit = 30,
): Promise<{ data: WorkspaceActivity[]; error: string | null }> {
  try {
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
        // Fetch the actor's profile so we can display their name/avatar
        const userId = row.user_id as string | null;
        let actorProfile;
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', userId)
            .single();
          if (data) {
            actorProfile = {
              id:        (data as Record<string, unknown>).id as string,
              username:  ((data as Record<string, unknown>).username  as string) ?? null,
              fullName:  ((data as Record<string, unknown>).full_name as string)  ?? null,
              avatarUrl: ((data as Record<string, unknown>).avatar_url as string) ?? null,
            };
          }
        }
        onInsert({
          id:           row.id as string,
          workspaceId:  row.workspace_id as string,
          userId:       userId,
          action:       row.action as WorkspaceActivityAction,
          resourceType: (row.resource_type as string) ?? null,
          resourceId:   (row.resource_id   as string) ?? null,
          metadata:     (row.metadata as Record<string, unknown>) ?? {},
          createdAt:    row.created_at as string,
          actorProfile,
        });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}