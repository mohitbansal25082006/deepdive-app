// src/services/socialNotificationService.ts
// DeepDive AI — Part 36: Social follow notifications + local push.
// Part 36 FIX — Lazy-loads expo-notifications to prevent PushNotificationIOS
// invariant violation crash in Expo Go.
// Part 53C — pushNewFollower/pushNewReport fired from realtime handler.
// Part 53D — ADDED pushNewUnfollower for unfollow notifications, and the local
//            push gate now only blocks on EXPLICIT mute (matches notifications.ts
//            Part 53 fix) so banners fire whenever OS permission is granted.

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { isExplicitlyMuted, getPermissionStatus } from '../lib/notifications';
import type { FollowNotification } from '../types/social';

// ─── Lazy loader ──────────────────────────────────────────────────────────────

let _N: typeof import('expo-notifications') | null = null;

function getNotifs(): typeof import('expo-notifications') | null {
  if (_N) return _N;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _N = require('expo-notifications') as typeof import('expo-notifications');
    return _N;
  } catch {
    console.warn('[SocialNotif] expo-notifications not available (Expo Go?).');
    return null;
  }
}

const CH_SOCIAL = 'social_updates';

async function ensureSocialChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const N = getNotifs();
  if (!N) return;
  try {
    await N.setNotificationChannelAsync(CH_SOCIAL, {
      name:             'Social Updates',
      importance:       N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#6C63FF',
      sound:            'default',
    });
  } catch (e) {
    console.warn('[SocialNotif] ensureSocialChannel error:', e);
  }
}

// Part 53D: fire whenever OS permission is granted and the user hasn't EXPLICITLY
// muted notifications in-app. (Previously this required the in-app flag to be
// true, which is false on fresh installs — silently dropping every banner.)
async function pushEnabled(): Promise<boolean> {
  const [muted, status] = await Promise.all([
    isExplicitlyMuted(), getPermissionStatus(),
  ]);
  return !muted && status === 'granted';
}

export async function pushNewFollower(params: {
  actorName:     string;
  actorUsername: string | null;
}): Promise<void> {
  if (!await pushEnabled()) return;
  const N = getNotifs();
  if (!N) return;
  await ensureSocialChannel();
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: '👋 New Follower',
        body:  `${params.actorName} started following you`,
        data:  {
          type:     'new_follower',
          route:    '/(app)/user-profile',
          params:   params.actorUsername ? { username: params.actorUsername } : {},
          username: params.actorUsername ?? '',
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CH_SOCIAL } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[SocialNotif] pushNewFollower error:', err);
  }
}

// Part 53D: unfollow notification.
export async function pushNewUnfollower(params: {
  actorName:     string;
  actorUsername: string | null;
}): Promise<void> {
  if (!await pushEnabled()) return;
  const N = getNotifs();
  if (!N) return;
  await ensureSocialChannel();
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: '👋 Unfollowed',
        body:  `${params.actorName} unfollowed you`,
        data:  {
          type:     'new_unfollower',
          route:    '/(app)/user-profile',
          params:   params.actorUsername ? { username: params.actorUsername } : {},
          username: params.actorUsername ?? '',
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CH_SOCIAL } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[SocialNotif] pushNewUnfollower error:', err);
  }
}

export async function pushNewReport(params: {
  actorName:   string;
  reportTitle: string;
  reportId:    string;
}): Promise<void> {
  if (!await pushEnabled()) return;
  const N = getNotifs();
  if (!N) return;
  await ensureSocialChannel();
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: `📄 ${params.actorName} published a report`,
        body:  params.reportTitle,
        data:  {
          type:     'new_report',
          route:    '/(app)/feed-report-view',
          params:   { reportId: params.reportId },
          reportId: params.reportId,
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CH_SOCIAL } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[SocialNotif] pushNewReport error:', err);
  }
}

export async function getFollowNotifications(limit = 30): Promise<FollowNotification[]> {
  try {
    const { data, error } = await supabase.rpc('get_follow_notifications', { p_limit: limit });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as FollowNotification[]) : [];
  } catch { return []; }
}

export async function markFollowNotificationsRead(): Promise<void> {
  try {
    await supabase.rpc('mark_follow_notifications_read');
  } catch (err) {
    console.warn('[SocialNotif] markRead error:', err);
  }
}

export async function getUnreadFollowNotificationsCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_unread_follow_notifications_count');
    if (error || data === null) return 0;
    return Number(data);
  } catch { return 0; }
}