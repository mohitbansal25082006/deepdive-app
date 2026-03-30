// src/hooks/useSocialNotifications.ts
// DeepDive AI — Part 36: Social notification inbox with Realtime sync.
//
// Subscribes to INSERT events on follow_notifications filtered to the current
// user. When a new notification arrives, fires a local push and re-fetches.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getFollowNotifications,
  markFollowNotificationsRead,
  getUnreadFollowNotificationsCount,
  pushNewFollower,
  pushNewReport,
} from '../services/socialNotificationService';
import type { FollowNotification, SocialNotifState } from '../types/social';

export interface UseSocialNotificationsReturn extends SocialNotifState {
  refresh:    () => Promise<void>;
  markAsRead: () => Promise<void>;
}

/**
 * Manages the social notification inbox for the current user.
 *
 * @param userId - The current user's profile ID (auth.uid()).
 *                 Pass null when the user is not signed in.
 */
export function useSocialNotifications(
  userId: string | null,
): UseSocialNotificationsReturn {
  const [notifications, setNotifications] = useState<FollowNotification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load notifications + unread count ─────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [notifs, count] = await Promise.all([
        getFollowNotifications(30),
        getUnreadFollowNotificationsCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err) {
      console.warn('[useSocialNotifications] refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ── Mark all as read ──────────────────────────────────────────────────────

  const markAsRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    // Optimistic
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markFollowNotificationsRead();
  }, [userId, unreadCount]);

  // ── Initial load + Realtime subscription ──────────────────────────────────

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refresh();

    // Subscribe to new notifications inserted for this user
    const channel = supabase
      .channel(`social_notifs_${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'follow_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const raw = payload.new as Record<string, unknown>;

          // Bump unread count immediately (optimistic)
          setUnreadCount(c => c + 1);

          // Re-fetch full list to get actor name/avatar (denormalised by RPC)
          await refresh();

          // Fire local push based on notification type
          const actorName = (raw.actor_full_name as string | null)
            ?? (raw.actor_username as string | null)
            ?? 'Someone';

          if (raw.type === 'new_follower') {
            await pushNewFollower({
              actorName,
              actorUsername: raw.actor_username as string | null,
            });
          } else if (raw.type === 'new_report') {
            const reportId    = raw.report_id    as string | null;
            const reportTitle = raw.report_title as string | null;
            if (reportId && reportTitle) {
              await pushNewReport({ actorName, reportTitle, reportId });
            }
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { notifications, unreadCount, isLoading, refresh, markAsRead };
}