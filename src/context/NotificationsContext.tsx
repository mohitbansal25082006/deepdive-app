// src/context/NotificationsContext.tsx
// DeepDive AI — Part 53D: Shared notification state (single source of truth).
//
// WHY THIS EXISTS
//   Previously the bell owned its own copy of the notification list + unread
//   count via useAppNotifications(). That meant the profile-tab icon had no way
//   to show the SAME live unread number — there was no shared state. This
//   context lifts all notification state to one place so that:
//
//     • the bell (SocialNotificationBell) and
//     • the profile tab icon (tabs/_layout)
//
//   both read the exact same realtime unreadCount, and opening the bell clears
//   it everywhere at once.
//
// WHAT IT DOES
//   • Merges app_notifications (own content) + follow_notifications (social).
//   • Subscribes to realtime INSERTs on BOTH tables and updates instantly.
//   • Fires a local OS banner for social events as they arrive (foreground).
//   • Exposes { notifications, unreadCount, isLoading, refresh, markAllRead,
//     markOneRead } via useNotifications().
//
// NOTE: remote push (app closed) is handled separately by the Supabase Edge
//   Function + push-token registration — see lib/notifications.ts and
//   supabase/functions/send-push-notification. This context covers the
//   in-app/foreground realtime experience and the shared badge.

import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  getAppNotifications,
  getUnreadAppNotificationsCount,
  markAppNotificationsRead,
  markOneAppNotificationRead,
} from '../services/appNotificationService';
import {
  getFollowNotifications,
  getUnreadFollowNotificationsCount,
  markFollowNotificationsRead,
  pushNewFollower,
  pushNewReport,
  pushNewUnfollower,
} from '../services/socialNotificationService';
import { setBadgeCount, isAppForeground, hasUsablePushToken } from '../lib/notifications';
import type { AppNotification } from '../types/notifications';
import type { FollowNotification } from '../types/social';

// ─── Social → unified mapper ──────────────────────────────────────────────────

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
      icon:      'person-add',
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

  if (n.type === 'new_unfollower') {
    return {
      id:        `social:${n.id}`,
      type:      'new_unfollower',
      title:     'Unfollowed',
      body:      `${actorName} unfollowed you`,
      route:     '/(app)/user-profile',
      params:    n.actor_username ? { username: n.actor_username } : {},
      icon:      'person-remove',
      accent:    '#94A3B8',
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

function mergeSorted(
  app: AppNotification[],
  social: AppNotification[],
): AppNotification[] {
  return [...app, ...social].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount:   number;
  isLoading:     boolean;
  refresh:       () => Promise<void>;
  markAllRead:   () => Promise<void>;
  markOneRead:   (notif: AppNotification) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  unreadCount:   0,
  isLoading:     false,
  refresh:       async () => {},
  markAllRead:   async () => {},
  markOneRead:   async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationsProvider({
  userId,
  children,
}: {
  userId:   string | null;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);

  const appChannelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const socialChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load + merge ──────────────────────────────────────────────────────────

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
      const total = (appUnread ?? 0) + (socialUnread ?? 0);
      setUnreadCount(total);
      // Keep the OS app-icon badge in sync with the in-app unread total.
      setBadgeCount(total).catch(() => {});
    } catch (err) {
      console.warn('[NotificationsContext] refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ── Mark all read (both sources) ──────────────────────────────────────────

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setBadgeCount(0).catch(() => {});
    await Promise.all([
      markAppNotificationsRead(),
      markFollowNotificationsRead(),
    ]);
  }, [userId]);

  // ── Mark a single row read ────────────────────────────────────────────────

  const markOneRead = useCallback(async (notif: AppNotification) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    setUnreadCount(c => Math.max(0, c - (notif.read ? 0 : 1)));
    if (notif.source === 'app') {
      await markOneAppNotificationRead(notif.id).catch(() => {});
    }
  }, []);

  // ── Initial load + realtime subscriptions ─────────────────────────────────

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refresh();

    // app_notifications — own content events
    const appChannel = supabase
      .channel(`ctx_app_notifs_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
        async () => {
          setUnreadCount(c => c + 1);
          await refresh();
        },
      )
      .subscribe();
    appChannelRef.current = appChannel;

    // follow_notifications — social events (+ foreground local banner)
    const socialChannel = supabase
      .channel(`ctx_social_notifs_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follow_notifications', filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          const raw = (payload.new ?? {}) as Record<string, unknown>;
          setUnreadCount(c => c + 1);
          await refresh();

          const actorName =
            (raw.actor_full_name as string | null) ??
            (raw.actor_username  as string | null) ??
            'Someone';

          // Part 53F DEDUP: the same follow_notifications INSERT also triggers
          // the Edge Function → REMOTE push. Only fire a LOCAL banner as a
          // fallback when remote push is unavailable (no token) AND foreground,
          // otherwise the user sees two banners.
          const hasToken = await hasUsablePushToken();
          const shouldLocalFallback = !hasToken && isAppForeground();

          if (shouldLocalFallback) {
            if (raw.type === 'new_follower') {
              pushNewFollower({
                actorName,
                actorUsername: (raw.actor_username as string | null) ?? null,
              }).catch(() => {});
            } else if (raw.type === 'new_unfollower') {
              pushNewUnfollower({
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
          }
        },
      )
      .subscribe();
    socialChannelRef.current = socialChannel;

    // ── Part 53G: reconcile the badge when the app returns to the foreground ──
    // A push that arrived while backgrounded (or a read on another device)
    // could leave the OS app-icon badge stale. Refreshing on resume recomputes
    // the true unread total (app + social) and re-sets the badge.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') { refresh(); }
    });

    return () => {
      if (appChannelRef.current)    { supabase.removeChannel(appChannelRef.current);    appChannelRef.current = null; }
      if (socialChannelRef.current) { supabase.removeChannel(socialChannelRef.current); socialChannelRef.current = null; }
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, isLoading, refresh, markAllRead, markOneRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext);
}