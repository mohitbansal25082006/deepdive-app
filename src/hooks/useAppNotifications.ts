// src/hooks/useAppNotifications.ts
// DeepDive AI — Part 53: Unified notification hook for the bell.
//
// Replaces the social-only useSocialNotifications for the bell. It MERGES two
// sources into a single, time-sorted list of AppNotification:
//
//   1. app_notifications   — the user's own content-ready events (Part 53)
//   2. follow_notifications — social events (Part 36), mapped to AppNotification
//
// REALTIME
//   • Subscribes to INSERT on app_notifications filtered to user_id — the bell
//     updates the instant a report/podcast/debate/paper/presentation finishes.
//   • Subscribes to INSERT on follow_notifications so social events (new
//     follower / new published report) arrive live AND fire a local OS banner
//     immediately (Part 53C) — matching how content events alert. The payload
//     carries actor + report fields (REPLICA IDENTITY FULL + cache trigger in
//     schema_part53c_social_realtime.sql), so the banner needs no refetch.
//   (Realtime for app_notifications + follow_notifications is enabled in code by
//    schema_part53.sql / schema_part53c_social_realtime.sql — no Dashboard
//    toggling required.)
//
// READ STATE
//   unreadCount is the SUM of unread app + unread social notifications.
//   markAsRead() marks BOTH sources read so the badge clears completely.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getAppNotifications,
  getUnreadAppNotificationsCount,
  markAppNotificationsRead,
} from '../services/appNotificationService';
import {
  getFollowNotifications,
  getUnreadFollowNotificationsCount,
  markFollowNotificationsRead,
  // Part 53C: fire local OS banners for social events in realtime too.
  pushNewFollower,
  pushNewReport,
} from '../services/socialNotificationService';
import type { AppNotification, AppNotificationsState } from '../types/notifications';
import type { FollowNotification } from '../types/social';

export interface UseAppNotificationsReturn extends AppNotificationsState {
  refresh:    () => Promise<void>;
  markAsRead: () => Promise<void>;
}

// ─── Map a social FollowNotification → unified AppNotification ─────────────────
//
// Social notifications keep their actor fields so the bell can show the avatar +
// name. Routes:
//   new_follower → /(app)/user-profile   { username }
//   new_report   → /(app)/feed-report-view { reportId, author* }

function mapSocialToApp(n: FollowNotification): AppNotification {
  const actorName = n.actor_full_name ?? n.actor_username ?? 'Someone';

  if (n.type === 'new_follower') {
    return {
      id:        `social:${n.id}`,
      type:      'new_follower',
      title:     'New follower',
      body:      `${actorName} started following you`,
      route:     '/(app)/user-profile',
      params:    n.actor_username ? { username: n.actor_username } : {},
      icon:      'person',
      accent:    '#6C63FF',
      read:      n.read,
      createdAt: n.created_at,
      actorId:        n.actor_id,
      actorUsername:  n.actor_username,
      actorFullName:  n.actor_full_name,
      actorAvatarUrl: n.actor_avatar_url,
      source:    'social',
    };
  }

  // new_report
  return {
    id:        `social:${n.id}`,
    type:      'new_report',
    title:     'New report published',
    body:      `${actorName} published: ${n.report_title ?? 'a new report'}`,
    contentId: n.report_id,
    reportId:  n.report_id,
    route:     '/(app)/feed-report-view',
    params:    {
      ...(n.report_id ? { reportId: n.report_id } : {}),
      authorName:      n.actor_full_name ?? n.actor_username ?? '',
      authorUsername:  n.actor_username ?? '',
      authorAvatarUrl: n.actor_avatar_url ?? '',
    },
    icon:      'document-text',
    accent:    '#43E97B',
    read:      n.read,
    createdAt: n.created_at,
    actorId:        n.actor_id,
    actorUsername:  n.actor_username,
    actorFullName:  n.actor_full_name,
    actorAvatarUrl: n.actor_avatar_url,
    source:    'social',
  };
}

// ─── Merge + sort newest-first ────────────────────────────────────────────────

function mergeSorted(
  app:    AppNotification[],
  social: AppNotification[],
): AppNotification[] {
  return [...app, ...social].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Unified notification inbox for the current user.
 *
 * @param userId current user's profile id (auth.uid()). Pass null when signed out.
 */
export function useAppNotifications(
  userId: string | null,
): UseAppNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);

  const appChannelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const socialChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load + merge both sources ─────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [appNotifs, socialNotifs, appUnread, socialUnread] = await Promise.all([
        getAppNotifications(40),
        getFollowNotifications(30),
        getUnreadAppNotificationsCount(),
        getUnreadFollowNotificationsCount(),
      ]);

      const socialMapped = (socialNotifs ?? []).map(mapSocialToApp);
      setNotifications(mergeSorted(appNotifs ?? [], socialMapped));
      setUnreadCount((appUnread ?? 0) + (socialUnread ?? 0));
    } catch (err) {
      console.warn('[useAppNotifications] refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ── Mark all (both sources) read ──────────────────────────────────────────

  const markAsRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    // Optimistic
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await Promise.all([
      markAppNotificationsRead(),
      markFollowNotificationsRead(),
    ]);
  }, [userId, unreadCount]);

  // ── Initial load + realtime subscriptions ─────────────────────────────────

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refresh();

    // App notifications — content-ready events (Part 53)
    const appChannel = supabase
      .channel(`app_notifs_${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // A new content notification landed — refresh the merged list.
          setUnreadCount(c => c + 1);
          await refresh();
        },
      )
      .subscribe();
    appChannelRef.current = appChannel;

    // Social notifications — follows / new published reports (Part 36)
    // Part 53C: also fire a LOCAL OS banner the instant the row arrives, so
    // social events alert exactly like content events. The payload now carries
    // the actor + report fields (REPLICA IDENTITY FULL + BEFORE INSERT cache
    // trigger from schema_part53c), so we can build the banner with no refetch.
    const socialChannel = supabase
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
          const raw = (payload.new ?? {}) as Record<string, unknown>;

          // Bump the badge immediately, then refresh the merged bell list.
          setUnreadCount(c => c + 1);
          await refresh();

          // Fire the local OS banner based on the notification type.
          const actorName =
            (raw.actor_full_name as string | null) ??
            (raw.actor_username  as string | null) ??
            'Someone';

          if (raw.type === 'new_follower') {
            pushNewFollower({
              actorName,
              actorUsername: (raw.actor_username as string | null) ?? null,
            }).catch(() => {});
          } else if (raw.type === 'new_report') {
            const reportId    = (raw.report_id    as string | null) ?? null;
            const reportTitle = (raw.report_title as string | null) ?? null;
            if (reportId && reportTitle) {
              pushNewReport({ actorName, reportTitle, reportId }).catch(() => {});
            }
          }
        },
      )
      .subscribe();
    socialChannelRef.current = socialChannel;

    return () => {
      if (appChannelRef.current) {
        supabase.removeChannel(appChannelRef.current);
        appChannelRef.current = null;
      }
      if (socialChannelRef.current) {
        supabase.removeChannel(socialChannelRef.current);
        socialChannelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { notifications, unreadCount, isLoading, refresh, markAsRead };
}