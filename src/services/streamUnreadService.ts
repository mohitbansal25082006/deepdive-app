// src/services/streamUnreadService.ts
// Part 50.9 — Stream unread count for the workspace "Team Chat" button badge.
//
// WHY THE FIRST ATTEMPT FAILED:
//   We queried the channel with watch:false and called channel.countUnread().
//   On a non-watched channel Stream does NOT keep read state fresh and does NOT
//   deliver real-time events, so countUnread() returned 0 and nothing updated.
//
// THE FIX:
//   We WATCH the workspace channel from this service (lightweight — Stream allows
//   watching many channels). A watched channel:
//     • has accurate read state → channel.countUnread() is correct
//     • delivers 'message.new' / 'notification.mark_read' events → live updates
//   We ALSO listen to client-level 'notification.message_new' which carries an
//   authoritative `unread_count` for the affected channel even before our watch
//   state catches up. The badge takes the max of (event count, countUnread()).
//
//   The chat screen calls markWorkspaceChannelRead() on open/leave → countUnread
//   drops to 0 and the badge clears live via 'notification.mark_read'.

import {
  fetchStreamToken,
  connectStreamUser,
  getWorkspaceChannelId,
  chatClient,
} from './streamChatService';
import { supabase } from '../lib/supabase';
import type { Channel as StreamChannel } from 'stream-chat';

type UnreadListener = (count: number) => void;

const CHANNEL_TYPE = 'messaging';

// ─── Ensure the Stream user is connected ──────────────────────────────────────

async function ensureConnected(): Promise<string | null> {
  try {
    if (chatClient.userID) return chatClient.userID;

    const tokenData = await fetchStreamToken();
    if (!tokenData) return null;

    let imageUrl: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single();
        imageUrl = (data as any)?.avatar_url ?? undefined;
      }
    } catch { /* non-fatal */ }

    const ok = await connectStreamUser(
      tokenData.userId,
      tokenData.name,
      tokenData.token,
      imageUrl,
    );
    return ok ? tokenData.userId : null;
  } catch {
    return null;
  }
}

// ─── Get (and watch) the workspace channel ────────────────────────────────────

async function getWatchedChannel(workspaceId: string): Promise<StreamChannel | null> {
  try {
    const channelId = getWorkspaceChannelId(workspaceId);
    const channel   = chatClient.channel(CHANNEL_TYPE, channelId);
    // watch() hydrates read state AND subscribes to real-time events.
    // Safe to call repeatedly — Stream no-ops if already watching.
    await channel.watch();
    return channel;
  } catch {
    return null;
  }
}

// ─── One-shot read ────────────────────────────────────────────────────────────

export async function getWorkspaceUnreadCount(workspaceId: string): Promise<number> {
  try {
    const userId = await ensureConnected();
    if (!userId) return 0;
    const channel = await getWatchedChannel(workspaceId);
    if (!channel) return 0;
    const count = channel.countUnread();
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

// ─── Live subscription ────────────────────────────────────────────────────────

export function subscribeWorkspaceUnread(
  workspaceId: string,
  onChange: UnreadListener,
): () => void {
  let cancelled = false;
  const channelId = getWorkspaceChannelId(workspaceId);

  const subscriptions: { unsubscribe: () => void }[] = [];
  let channelRef: StreamChannel | null = null;

  const emitFromChannel = () => {
    if (cancelled || !channelRef) return;
    try {
      const c = channelRef.countUnread();
      onChange(typeof c === 'number' ? c : 0);
    } catch {
      onChange(0);
    }
  };

  (async () => {
    const userId = await ensureConnected();
    if (!userId || cancelled) return;

    const channel = await getWatchedChannel(workspaceId);
    if (!channel || cancelled) return;
    channelRef = channel;

    // Initial value
    emitFromChannel();

    // Channel-level events (fire because the channel is watched)
    const s1 = channel.on('message.new',           emitFromChannel);
    const s2 = channel.on('message.read',          emitFromChannel);
    const s3 = channel.on('notification.mark_read', emitFromChannel);
    subscriptions.push(s1, s2, s3);

    // Client-level event carries an authoritative unread_count for the channel.
    const s4 = chatClient.on('notification.message_new', (event: any) => {
      if (cancelled) return;
      const evChannelId = event?.channel_id ?? event?.cid?.split(':')?.[1];
      if (evChannelId && evChannelId !== channelId) return;

      // Prefer the event's unread_count when present; otherwise recompute.
      let next = 0;
      if (typeof event?.unread_count === 'number') {
        // unread_count on this event is the TOTAL across channels; the channel
        // count is more accurate for our single-channel badge, so take the
        // per-channel value when we can compute it.
        try {
          const perChannel = channelRef?.countUnread();
          next = typeof perChannel === 'number' ? perChannel : event.unread_count;
        } catch {
          next = event.unread_count;
        }
      } else {
        try { next = channelRef?.countUnread() ?? 0; } catch { next = 0; }
      }
      onChange(next);
    });
    subscriptions.push(s4);

    // Also recompute when the user reads anything anywhere (covers cross-device).
    const s5 = chatClient.on('notification.mark_read', emitFromChannel);
    subscriptions.push(s5);
  })();

  return () => {
    cancelled = true;
    subscriptions.forEach(s => { try { s.unsubscribe(); } catch { /* */ } });
    subscriptions.length = 0;
    // Note: we intentionally do NOT stopWatching here — the chat screen and other
    // badges may rely on the watched channel. Stream cleans up on disconnect.
  };
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markWorkspaceChannelRead(workspaceId: string): Promise<void> {
  try {
    const userId = await ensureConnected();
    if (!userId) return;
    const channel = await getWatchedChannel(workspaceId);
    if (!channel) return;
    await channel.markRead();
  } catch { /* non-fatal */ }
}