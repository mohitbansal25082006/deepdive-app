// src/hooks/useWorkspaceChatUnread.ts
// Part 50.9 — Live unread badge for the workspace "Team Chat" button.
//
// Subscribes to the Stream unread count for the workspace channel and returns a
// reactive count. Only enabled for owners/editors (viewers have no chat access).
// Re-fetches on focus so the count is fresh when returning to workspace-detail
// from the chat screen, and exposes clear() to zero the badge the instant chat
// is opened (optimistic — the real value re-syncs on focus).

import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  subscribeWorkspaceUnread,
  getWorkspaceUnreadCount,
} from '../services/streamUnreadService';

export function useWorkspaceChatUnread(
  workspaceId: string | null,
  enabled: boolean,
): { unread: number; clear: () => void; refresh: () => void } {
  const [unread, setUnread] = useState(0);
  const mountedRef = useRef(true);

  const clear = useCallback(() => setUnread(0), []);

  const refresh = useCallback(() => {
    if (!workspaceId || !enabled) return;
    getWorkspaceUnreadCount(workspaceId)
      .then((c) => { if (mountedRef.current) setUnread(c); })
      .catch(() => {});
  }, [workspaceId, enabled]);

  // Live subscription for the lifetime of the screen
  useEffect(() => {
    mountedRef.current = true;
    if (!workspaceId || !enabled) {
      setUnread(0);
      return () => { mountedRef.current = false; };
    }
    const unsub = subscribeWorkspaceUnread(workspaceId, (count) => {
      if (mountedRef.current) setUnread(count);
    });
    return () => {
      mountedRef.current = false;
      try { unsub(); } catch { /* */ }
    };
  }, [workspaceId, enabled]);

  // Refresh on focus (returning from the chat screen, etc.)
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {};
    }, [refresh]),
  );

  return { unread, clear, refresh };
}