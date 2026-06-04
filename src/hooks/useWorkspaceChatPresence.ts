// src/hooks/useWorkspaceChatPresence.ts
// Part 48b — NEW hook for workspace-level chat presence.
//
// IMPORTANT: This is SEPARATE from the existing usePresence.ts which tracks
// who is viewing a specific REPORT. This hook tracks who is currently active
// in a workspace CHAT SCREEN.
//
// FIX: Online count was wrong because presenceState() returns an object keyed
// by presence key, where each value is an ARRAY of presence objects (one per
// tab/device). The correct unique user count is Object.keys(state).length,
// NOT Object.values(state).flat().length (which double-counts multi-tab users).
//
// Channel name: `presence:workspace:chat:{workspaceId}` — workspace-scoped so
// members of different workspaces don't bleed into each other's counts.

import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface WorkspaceChatPresenceUser {
  userId:    string;
  username:  string | null;
  fullName:  string | null;
  avatarUrl: string | null;
  onlineAt:  string;
}

interface WorkspaceChatPresenceState {
  onlineUsers:  WorkspaceChatPresenceUser[];
  onlineCount:  number;
}

export function useWorkspaceChatPresence(
  workspaceId: string | null,
  trackSelf:   boolean = true,
): WorkspaceChatPresenceState {
  const { user, profile } = useAuth();
  const [state, setState] = useState<WorkspaceChatPresenceState>({
    onlineUsers: [],
    onlineCount: 0,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const buildMyPresence = useCallback((): Record<string, unknown> => ({
    userId:    user?.id ?? '',
    username:  profile?.username   ?? null,
    fullName:  profile?.full_name  ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    onlineAt:  new Date().toISOString(),
  }), [user?.id, profile?.username, profile?.full_name, profile?.avatar_url]);

  useEffect(() => {
    if (!workspaceId || !user?.id) return;

    // Workspace-chat scoped channel — different from report presence channel
    const channelName = `presence:workspace:chat:${workspaceId}`;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          // userId as key → multiple tabs from same user merge under one key
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    // ── Correct online count calculation ─────────────────────────────────
    // presenceState() = { [userId]: PresenceObject[] }
    // Object.keys() = unique users (correct)
    // Object.values().flat() = all tab-slots (wrong — double counts)

    const updateFromState = () => {
      try {
        const presState = channel.presenceState<Record<string, unknown>>();
        const keys      = Object.keys(presState);

        const seen  = new Set<string>();
        const users: WorkspaceChatPresenceUser[] = [];

        for (const key of keys) {
          const presences = presState[key];
          if (!Array.isArray(presences) || presences.length === 0) continue;
          // Take the most recent presence entry for this key
          const p   = presences[presences.length - 1] as Record<string, unknown>;
          const uid = String(p.userId ?? key ?? '');
          if (!uid || seen.has(uid)) continue;
          seen.add(uid);
          users.push({
            userId:    uid,
            username:  (p.username  ?? null) as string | null,
            fullName:  (p.fullName  ?? null) as string | null,
            avatarUrl: (p.avatarUrl ?? null) as string | null,
            onlineAt:  String(p.onlineAt ?? ''),
          });
        }

        setState({
          onlineUsers: users,
          onlineCount: keys.length, // unique user count
        });
      } catch { /* non-fatal */ }
    };

    channel
      .on('presence', { event: 'sync'  }, updateFromState)
      .on('presence', { event: 'join'  }, updateFromState)
      .on('presence', { event: 'leave' }, updateFromState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && trackSelf) {
          try {
            await channel.track(buildMyPresence());
          } catch { /* non-fatal */ }
        }
      });

    // ── Handle app background / foreground ────────────────────────────────
    const handleAppState = async (nextState: AppStateStatus) => {
      if (!channelRef.current || !trackSelf) return;
      if (nextState === 'active') {
        try { await channelRef.current.track(buildMyPresence()); } catch {}
      } else if (nextState === 'background' || nextState === 'inactive') {
        try { await channelRef.current.untrack(); } catch {}
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      appStateSub.remove();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
      setState({ onlineUsers: [], onlineCount: 0 });
    };
  }, [workspaceId, user?.id, trackSelf, buildMyPresence]);

  return state;
}