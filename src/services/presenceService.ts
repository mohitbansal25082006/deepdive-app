// src/services/presenceService.ts
// Supabase Realtime Presence — tracks who is currently viewing a report.
// One channel per report: "presence:report:{reportId}"

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PresenceUser } from '../types';

// Map of active channels keyed by reportId
const activeChannels = new Map<string, RealtimeChannel>();

export interface PresenceCallbacks {
  onSync:  (users: PresenceUser[]) => void;
  onJoin:  (user: PresenceUser)  => void;
  onLeave: (userId: string)      => void;
}

// ─── Parse raw presence state from Supabase into PresenceUser[] ───────────────

function parsePresenceState(state: Record<string, unknown[]>): PresenceUser[] {
  const users: PresenceUser[] = [];
  const seen = new Set<string>();

  for (const presences of Object.values(state)) {
    for (const p of presences) {
      const presence = p as Record<string, unknown>;
      const userId = presence.user_id as string;
      if (userId && !seen.has(userId)) {
        seen.add(userId);
        users.push({
          userId,
          username:  (presence.username   as string) ?? null,
          fullName:  (presence.full_name  as string) ?? null,
          avatarUrl: (presence.avatar_url as string) ?? null,
          onlineAt:  (presence.online_at  as string) ?? new Date().toISOString(),
          reportId:  (presence.report_id  as string) ?? undefined,
        });
      }
    }
  }

  return users;
}

// ─── Join presence channel for a report ──────────────────────────────────────

export async function joinReportPresence(
  reportId: string,
  user: { userId: string; username: string | null; fullName: string | null; avatarUrl: string | null },
  callbacks: PresenceCallbacks,
): Promise<() => void> {
  // Clean up any existing channel for this report
  await leaveReportPresence(reportId);

  const channelName = `presence:report:${reportId}`;

  const channel = supabase.channel(channelName, {
    config: { presence: { key: user.userId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      callbacks.onSync(parsePresenceState(state));
    })
    .on('presence', { event: 'join' }, ({ newPresences }: { newPresences: unknown[] }) => {
      for (const p of newPresences) {
        const presence = p as Record<string, unknown>;
        callbacks.onJoin({
          userId:    presence.user_id   as string,
          username:  (presence.username   as string) ?? null,
          fullName:  (presence.full_name  as string) ?? null,
          avatarUrl: (presence.avatar_url as string) ?? null,
          onlineAt:  (presence.online_at  as string) ?? new Date().toISOString(),
          reportId:  (presence.report_id  as string) ?? undefined,
        });
      }
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }: { leftPresences: unknown[] }) => {
      for (const p of leftPresences) {
        callbacks.onLeave((p as Record<string, unknown>).user_id as string);
      }
    });

  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id:    user.userId,
          username:   user.username,
          full_name:  user.fullName,
          avatar_url: user.avatarUrl,
          online_at:  new Date().toISOString(),
          report_id:  reportId,
        });
        resolve();
      }
    });
  });

  activeChannels.set(reportId, channel);

  return () => { leaveReportPresence(reportId); };
}

// ─── Leave presence channel ───────────────────────────────────────────────────

export async function leaveReportPresence(reportId: string): Promise<void> {
  const existing = activeChannels.get(reportId);
  if (existing) {
    await existing.untrack();
    await supabase.removeChannel(existing);
    activeChannels.delete(reportId);
  }
}

// ─── Leave ALL active presence channels (call on sign-out) ───────────────────

export async function leaveAllPresenceChannels(): Promise<void> {
  for (const reportId of activeChannels.keys()) {
    await leaveReportPresence(reportId);
  }
}