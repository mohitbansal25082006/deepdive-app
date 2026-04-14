// src/lib/notifications.ts
// DeepDive AI — All Parts up to 41.7
//
// ROOT FIX (Expo Go / SDK 53):
//   Any require('expo-notifications') triggers DevicePushTokenAutoRegistration.fx.js
//   as a module-level side effect. That file calls addPushTokenListener, which
//   calls warnOfExpoGoPushUsage and logs a red console.error in Expo Go — even
//   inside a useEffect, even wrapped in try/catch, because the side effect runs
//   at require() time before any user code executes.
//
//   The only complete fix: detect Expo Go via Constants.executionEnvironment and
//   return null from getNotifications() before ever calling require().
//   All call-sites already handle null gracefully, so the rest of the app is
//   entirely unaffected. Push notifications simply become no-ops in Expo Go,
//   which matches Expo's own recommendation to use a development build for push.

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Expo Go detection ────────────────────────────────────────────────────────
// executionEnvironment === 'storeClient'  →  running inside Expo Go
// executionEnvironment === 'standalone'   →  production build
// executionEnvironment === 'bare'         →  development build (EAS / local)

const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient' ||
  // fallback for older expo-constants versions
  (Constants as any).appOwnership === 'expo';

// ─── Lazy-load expo-notifications ────────────────────────────────────────────
// NEVER called at module scope. Only called inside async functions.
// Returns null immediately in Expo Go so require() is never reached
// and DevicePushTokenAutoRegistration.fx.js never runs.

let _Notifications: typeof import('expo-notifications') | null = null;

function getNotifications(): typeof import('expo-notifications') | null {
  // ← THE KEY GUARD: bail out before require() in Expo Go
  if (IS_EXPO_GO) return null;

  if (_Notifications) return _Notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _Notifications = require('expo-notifications') as typeof import('expo-notifications');
    return _Notifications;
  } catch {
    console.warn('[Notifications] expo-notifications not available.');
    return null;
  }
}

// ─── Storage key ─────────────────────────────────────────────────────────────

const NOTIF_ENABLED_KEY = 'deepdive:notifications_enabled';

// ─── Init — call once from app/_layout.tsx inside useEffect ──────────────────
// Safe to call anywhere; silently does nothing in Expo Go.

export function initNotifications(): void {
  try {
    const N = getNotifications();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert:  true,
        shouldPlaySound:  true,
        shouldSetBadge:   true,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    });
  } catch (e) {
    console.warn('[Notifications] setNotificationHandler failed:', e);
  }
}

// ─── Persisted enabled flag ───────────────────────────────────────────────────

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
}

// ─── Permission helpers ───────────────────────────────────────────────────────

export async function getPermissionStatus(): Promise<string> {
  try {
    const N = getNotifications();
    if (!N) return 'undetermined';
    const { status } = await N.getPermissionsAsync();
    return status;
  } catch {
    return 'undetermined';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  try {
    const N = getNotifications();
    if (!N) return false;
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Android channels ─────────────────────────────────────────────────────────

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const N = getNotifications();
    if (!N) return;
    await N.setNotificationChannelAsync('research', {
      name:             'Research Updates',
      importance:       N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#6C63FF',
      sound:            'default',
    });
    await N.setNotificationChannelAsync('default', {
      name:       'Default',
      importance: N.AndroidImportance.DEFAULT,
    });
  } catch (e) {
    console.warn('[Notifications] ensureAndroidChannels failed:', e);
  }
}

// ─── Token Registration ───────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Notifications] Push only works on physical devices.');
    return null;
  }
  const granted = await requestNotificationPermission();
  if (!granted) {
    console.log('[Notifications] Permission not granted.');
    return null;
  }
  await ensureAndroidChannels();
  try {
    const N = getNotifications();
    if (!N) return null;
    const tokenData = await N.getExpoPushTokenAsync({ projectId: 'deepdive-app' });
    return tokenData.data;
  } catch (err) {
    console.warn('[Notifications] Token fetch failed:', err);
    return null;
  }
}

export async function saveTokenToSupabase(userId: string, token: string): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform }, { onConflict: 'token' });
  if (error) console.warn('[Notifications] Failed to save token:', error.message);
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

export async function enableNotifications(
  userId: string,
): Promise<'enabled' | 'needs_settings'> {
  const currentStatus = await getPermissionStatus();
  if (currentStatus === 'granted') {
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
    await setNotificationsEnabled(true);
    return 'enabled';
  }
  const granted = await requestNotificationPermission();
  if (granted) {
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
    await setNotificationsEnabled(true);
    return 'enabled';
  }
  return 'needs_settings';
}

export async function disableNotifications(): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
    await N.setBadgeCountAsync(0);
  } catch {}
  await setNotificationsEnabled(false);
}

// ─── Research Complete Notification ──────────────────────────────────────────

export async function notifyReportComplete(
  reportId: string,
  reportTitle: string,
): Promise<void> {
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(),
    getPermissionStatus(),
  ]);
  if (!enabled || status !== 'granted') return;
  try {
    const N = getNotifications();
    if (!N) return;
    await N.scheduleNotificationAsync({
      content: {
        title: '✅ Research Complete!',
        body:  `Your report on "${reportTitle}" is ready to read.`,
        data:  { type: 'research_complete', reportId },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
      },
      trigger: null,
    });
    const current = await N.getBadgeCountAsync();
    await N.setBadgeCountAsync(current + 1);
  } catch (err) {
    console.warn('[Notifications] Failed to schedule report-complete notification:', err);
  }
}

// ─── Notification Tap Handler (deep-link routing) ─────────────────────────────
//
// Handles three notification types:
//   • research_complete → research-report screen  (own report)
//   • new_follower      → user-profile screen
//   • new_report        → feed-report-view screen (social — view-only)

export function registerNotificationTapHandler(
  navigate: (href: string) => void,
): () => void {
  try {
    const N = getNotifications();
    if (!N) return () => {}; // ← no-op in Expo Go, require() never called

    const subscription = N.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response.notification.request.content.data as Record<
          string,
          unknown
        >;

        if (
          data?.type === 'research_complete' &&
          typeof data.reportId === 'string'
        ) {
          navigate(`/(app)/research-report?reportId=${data.reportId}`);
          return;
        }

        if (
          data?.type === 'new_follower' &&
          typeof data.username === 'string' &&
          data.username.length > 0
        ) {
          navigate(
            `/(app)/user-profile?username=${encodeURIComponent(data.username)}`,
          );
          return;
        }

        if (
          data?.type === 'new_report' &&
          typeof data.reportId === 'string'
        ) {
          navigate(`/(app)/feed-report-view?reportId=${data.reportId}`);
          return;
        }
      } catch (e) {
        console.warn('[Notifications] Tap handler error:', e);
      }
    });

    return () => {
      try { subscription.remove(); } catch {}
    };
  } catch (e) {
    console.warn('[Notifications] registerNotificationTapHandler failed:', e);
    return () => {};
  }
}

// ─── Other Scheduled Notifications ───────────────────────────────────────────

export async function scheduleWeeklyDigestNotification(): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
    await N.scheduleNotificationAsync({
      content: {
        title: '📊 Your Weekly Research Digest',
        body:  "See what's trending in your research topics this week.",
        data:  { type: 'weekly_digest' },
        ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
      },
      trigger: {
        type:    N.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2,
        hour:    9,
        minute:  0,
      },
    });
  } catch (e) {
    console.warn('[Notifications] scheduleWeeklyDigest failed:', e);
  }
}

export async function scheduleTopicUpdateNotification(
  topic: string,
): Promise<void> {
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(),
    getPermissionStatus(),
  ]);
  if (!enabled || status !== 'granted') return;
  try {
    const N = getNotifications();
    if (!N) return;
    await N.scheduleNotificationAsync({
      content: {
        title: '🔔 New Research Available',
        body:  `New information found on: "${topic}"`,
        data:  { type: 'topic_update', topic },
        ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[Notifications] scheduleTopicUpdate failed:', e);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export async function getBadgeCount(): Promise<number> {
  try {
    const N = getNotifications();
    if (!N) return 0;
    return N.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.setBadgeCountAsync(count);
  } catch {}
}

export async function clearBadge(): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.setBadgeCountAsync(0);
  } catch {}
}