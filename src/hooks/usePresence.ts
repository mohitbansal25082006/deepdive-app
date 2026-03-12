// src/hooks/usePresence.ts
// Tracks who is currently viewing a specific report in a workspace.
// Wraps presenceService with React state + auto cleanup.

import { useState, useEffect, useCallback, useRef } from 'react';
import { PresenceUser, PresenceState } from '../types';
import {
  joinReportPresence,
  leaveReportPresence,
} from '../services/presenceService';
import { useAuth } from '../context/AuthContext';

export function usePresence(
  reportId: string | null,
  enabled = true,
) {
  const { user, profile } = useAuth();
  const [state, setState] = useState<PresenceState>({
    onlineUsers: [],
    isTracking:  false,
  });
  const cleanupRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    if (!reportId || !user || !enabled) return;

    try {
      const cleanup = await joinReportPresence(
        reportId,
        {
          userId:    user.id,
          username:  profile?.username   ?? null,
          fullName:  profile?.full_name  ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
        {
          onSync: (users) => {
            setState({ onlineUsers: users, isTracking: true });
          },
          onJoin: (incoming) => {
            setState(s => {
              if (s.onlineUsers.some(u => u.userId === incoming.userId)) return s;
              return { ...s, onlineUsers: [...s.onlineUsers, incoming] };
            });
          },
          onLeave: (leftUserId) => {
            setState(s => ({
              ...s,
              onlineUsers: s.onlineUsers.filter(u => u.userId !== leftUserId),
            }));
          },
        },
      );

      cleanupRef.current = cleanup;
      setState(s => ({ ...s, isTracking: true }));
    } catch (err) {
      console.warn('[usePresence] Failed to join presence:', err);
    }
  }, [reportId, user, profile, enabled]);

  useEffect(() => {
    if (!enabled) return;
    start();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (reportId) leaveReportPresence(reportId);
      setState({ onlineUsers: [], isTracking: false });
    };
  }, [reportId, enabled, start]);

  const othersOnline = state.onlineUsers.filter(u => u.userId !== user?.id);

  return {
    ...state,
    othersOnline,
    onlineCount: othersOnline.length,
  };
}