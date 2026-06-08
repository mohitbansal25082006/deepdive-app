// src/services/streamChatService.ts
// Part 49 — Stream Chat Service
// Part 50 FIX — getOrCreateWorkspaceChannel: remove client-side addMembers call
//   (it's now done server-side in the Edge Function before token is returned).
//   The client-side addMembers was a RACE CONDITION: watch() was called first,
//   which failed with ReadChannel for non-creator members BEFORE addMembers ran.
//
//   New flow:
//     Edge Function → upsertUser → addMembers(all workspaces) → return token
//     Client        → connectUser(token) → channel.watch() ← user already member ✓
//
// UNCHANGED: fetchStreamToken, connectStreamUser, disconnectStreamUser, chatClient.
// CHANGED:   getOrCreateWorkspaceChannel — removed the addMembers call (server handles it).

import { StreamChat, Channel as StreamChannel } from 'stream-chat';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const STREAM_API_KEY   = process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '';
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL   ?? '';
const CHANNEL_TYPE     = 'messaging';

// ─── Singleton client ─────────────────────────────────────────────────────────

const chatClient = StreamChat.getInstance(STREAM_API_KEY);

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  token:  string;
  userId: string;
  name:   string;
  expiry: number;
}

let _tokenCache: TokenCache | null = null;

function isTokenValid(cache: TokenCache | null): boolean {
  if (!cache) return false;
  const now = Math.floor(Date.now() / 1000);
  return now < cache.expiry - 300;
}

// ─── Fetch Stream token from Edge Function ────────────────────────────────────
// The Edge Function now also pre-seeds the user as a channel_member for all
// their workspaces. Token fetch is the ONLY place membership is managed.

export async function fetchStreamToken(): Promise<{ token: string; userId: string; name: string } | null> {
  if (isTokenValid(_tokenCache)) {
    return { token: _tokenCache!.token, userId: _tokenCache!.userId, name: _tokenCache!.name };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/stream-chat-token`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    });

    if (!res.ok) {
      console.error('[StreamChat] token fetch failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json() as { token: string; userId: string; name: string };

    _tokenCache = {
      token:  data.token,
      userId: data.userId,
      name:   data.name,
      expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };

    return { token: data.token, userId: data.userId, name: data.name };
  } catch (err) {
    console.error('[StreamChat] fetchStreamToken error:', err);
    return null;
  }
}

// ─── Connect user to Stream ───────────────────────────────────────────────────

export async function connectStreamUser(
  userId:   string,
  name:     string,
  token:    string,
  imageUrl?: string,
): Promise<boolean> {
  try {
    if (chatClient.userID === userId) return true;
    if (chatClient.userID) {
      await chatClient.disconnectUser();
    }
    await chatClient.connectUser(
      { id: userId, name, image: imageUrl ?? undefined },
      token,
    );
    return true;
  } catch (err) {
    console.error('[StreamChat] connectStreamUser error:', err);
    return false;
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectStreamUser(): Promise<void> {
  try {
    _tokenCache = null;
    if (chatClient.userID) {
      await chatClient.disconnectUser();
    }
  } catch (err) {
    console.warn('[StreamChat] disconnect error (non-fatal):', err);
  }
}

// ─── Get or create workspace channel ─────────────────────────────────────────
//
// Part 50 CHANGE: Removed client-side addMembers([userId]) call.
//
// WHY: The previous code called channel.watch() first, THEN addMembers().
//   For a non-creator member, watch() fired BEFORE they had `channel_member`
//   role, causing ReadChannel error (code 17).
//
// The fix: The Edge Function now adds the user to all their workspace channels
// server-side (bypassing permissions) before returning the token. By the time
// this function runs and calls channel.watch(), the user is already a member.
//
// channel.watch() itself returns silently if the user is already a member,
// so the first user (creator) also works correctly — watch() both creates the
// channel AND marks them as a watcher, and they were already added by the
// Edge Function call that happened before connectUser().

export function getWorkspaceChannelId(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 55);
  return `workspace-${safe}`;
}

export async function getOrCreateWorkspaceChannel(
  workspaceId: string,
  userId:      string,
  userRole:    'owner' | 'editor' | 'viewer',
): Promise<StreamChannel | null> {
  try {
    const channelId = getWorkspaceChannelId(workspaceId);

    const channelData: any = {
      name:        `Workspace ${workspaceId}`,
      workspaceId,
      // created_by_id is required by Stream when creating a channel client-side
      // if the channel doesn't exist yet. The creator's userId is correct here.
      created_by_id: userId,
    };

    const channel = chatClient.channel(CHANNEL_TYPE, channelId, channelData);

    // watch() subscribes to real-time events and fetches message history.
    // Creates the channel if it doesn't exist yet.
    // User is already a channel_member (added server-side) → no ReadChannel error.
    await channel.watch();

    // NOTE: addMembers() is intentionally REMOVED from here.
    // It is now handled by the Edge Function (server-side) before token return.
    // Calling it here was the race condition that caused the ReadChannel error.

    return channel;
  } catch (err) {
    console.error('[StreamChat] getOrCreateWorkspaceChannel error:', err);
    return null;
  }
}

// ─── Export singleton client ──────────────────────────────────────────────────

export { chatClient };