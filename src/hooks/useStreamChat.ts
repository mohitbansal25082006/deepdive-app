// src/hooks/useStreamChat.ts
// Part 49 — Stream Chat React Hook
//
// Manages the full lifecycle of a Stream Chat session for one workspace:
//   1. Fetches a Stream token from the Supabase Edge Function
//   2. Connects the user to Stream (connectUser)
//   3. Gets or creates the workspace channel and watches it
//   4. Returns { client, channel, isReady, error }
//
// Cleanup on unmount: unwatch the channel (keeps client connected for
// other screens that may also use Stream, e.g. unread badge polling).
// Full disconnect happens in AuthContext.signOut().

import { useEffect, useState, useRef, useCallback } from 'react';
import type { StreamChat, Channel as StreamChannel } from 'stream-chat';
import { useAuth }               from '../context/AuthContext';
import {
  chatClient,
  fetchStreamToken,
  connectStreamUser,
  getOrCreateWorkspaceChannel,
} from '../services/streamChatService';

export interface UseStreamChatResult {
  client:   StreamChat | null;
  channel:  StreamChannel | null;
  isReady:  boolean;
  error:    string | null;
  refresh:  () => Promise<void>;
}

export function useStreamChat(
  workspaceId: string | null,
  userRole:    'owner' | 'editor' | 'viewer' | null,
): UseStreamChatResult {
  const { user, profile }           = useAuth();
  const [channel,  setChannel]      = useState<StreamChannel | null>(null);
  const [isReady,  setIsReady]      = useState(false);
  const [error,    setError]        = useState<string | null>(null);
  const channelRef                  = useRef<StreamChannel | null>(null);
  const mountedRef                  = useRef(true);

  const setupChannel = useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    if (userRole !== 'owner' && userRole !== 'editor') {
      // Viewers get the access guard — no Stream connection needed
      setIsReady(true);
      return;
    }

    setError(null);
    setIsReady(false);

    // ── Step 1: Get Stream token ───────────────────────────────────────────
    const tokenData = await fetchStreamToken();
    if (!tokenData) {
      if (mountedRef.current) setError('Could not authenticate with chat service. Please try again.');
      return;
    }

    // ── Step 2: Connect user ───────────────────────────────────────────────
    const imageUrl  = profile?.avatar_url ?? undefined;
    const connected = await connectStreamUser(
      tokenData.userId,
      tokenData.name,
      tokenData.token,
      imageUrl,
    );

    if (!connected) {
      if (mountedRef.current) setError('Failed to connect to chat. Check your connection and retry.');
      return;
    }

    // ── Step 3: Get / create workspace channel ─────────────────────────────
    const ch = await getOrCreateWorkspaceChannel(
      workspaceId,
      tokenData.userId,
      userRole,
    );

    if (!mountedRef.current) return;

    if (!ch) {
      setError('Could not load chat channel. Please go back and try again.');
      return;
    }

    channelRef.current = ch;
    setChannel(ch);
    setIsReady(true);
  }, [workspaceId, userRole, user?.id, profile?.avatar_url]);

  useEffect(() => {
    mountedRef.current = true;
    setupChannel();

    return () => {
      mountedRef.current = false;
      // Unwatch channel to stop receiving events for this workspace.
      // DO NOT disconnect the client here — other components may use it.
      if (channelRef.current) {
        channelRef.current.stopWatching().catch(() => {});
        channelRef.current = null;
      }
    };
  }, [setupChannel]);

  return {
    client:  isReady ? chatClient as unknown as StreamChat : null,
    channel,
    isReady,
    error,
    refresh: setupChannel,
  };
}