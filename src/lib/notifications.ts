// src/lib/notifications.ts
// Advanced push notification system for DeepDive AI.
//
// Key behaviours:
//  • Permission is requested once. If already granted, never opens Settings.
//  • "Enabled" state is persisted in AsyncStorage — survives app restarts / kills.
//  • notifyReportComplete() is called by the orchestrator when a report finishes.
//  • Deep-link data on the notification lets the app route to the report on tap.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Storage key ─────────────────────────────────────────────────────────────

const NOTIF_ENABLED_KEY = 'deepdive:notifications_enabled';

// ─── Foreground presentation ──────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ─── Persisted enabled flag ───────────────────────────────────────────────────

/** Read the persisted "notifications enabled" preference (survives app restarts). */
export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/** Persist the "notifications enabled" preference. */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Returns the current OS-level notification permission status.
 * Does NOT request anything — just checks.
 */
export async function getPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Requests notification permission if not already granted.
 * Returns true if permission is (now) granted, false otherwise.
 * Does NOT open Settings — that is the caller's responsibility.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Android channels ─────────────────────────────────────────────────────────

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('research', {
    name: 'Research Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6C63FF',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ─── Token Registration ───────────────────────────────────────────────────────

/**
 * Registers for push notifications and returns the Expo push token.
 * Safe to call multiple times — idempotent.
 * Returns null if permission is not granted or device is a simulator.
 */
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
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'deepdive-app',
    });
    return tokenData.data;
  } catch (err) {
    console.warn('[Notifications] Token fetch failed:', err);
    return null;
  }
}

/** Saves (or updates) the Expo push token in Supabase for server-side delivery. */
export async function saveTokenToSupabase(
  userId: string,
  token: string,
): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform }, { onConflict: 'token' });
  if (error) {
    console.warn('[Notifications] Failed to save token:', error.message);
  }
}

// ─── Enable / Disable (used by Profile toggle) ───────────────────────────────

/**
 * Full "enable notifications" flow:
 *  1. Request OS permission.
 *  2. If granted → register token, persist enabled=true, return 'enabled'.
 *  3. If denied  → return 'needs_settings' so the caller can open Settings once.
 *  4. If already granted → just persist and return 'enabled' (no Settings prompt).
 */
export async function enableNotifications(userId: string): Promise<'enabled' | 'needs_settings'> {
  const currentStatus = await getPermissionStatus();

  if (currentStatus === 'granted') {
    // Already have permission — register token, mark enabled, done.
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
    await setNotificationsEnabled(true);
    return 'enabled';
  }

  // Permission not yet granted → ask the OS
  const granted = await requestNotificationPermission();
  if (granted) {
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
    await setNotificationsEnabled(true);
    return 'enabled';
  }

  // OS denied (user previously said no / system restricted) → caller must open Settings
  return 'needs_settings';
}

/**
 * Full "disable notifications" flow:
 *  Cancels all scheduled notifications, clears badge, persists enabled=false.
 *  Does NOT revoke the OS permission — that has to be done by the user in Settings.
 */
export async function disableNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
  await setNotificationsEnabled(false);
}

// ─── Research Complete Notification ──────────────────────────────────────────

/**
 * Fires a local notification immediately when a research report is ready.
 * Called by researchOrchestrator after onComplete().
 *
 * @param reportId   - Supabase report UUID (embedded in notification data for deep-link)
 * @param reportTitle - Human-readable title shown in the notification body
 */
export async function notifyReportComplete(
  reportId: string,
  reportTitle: string,
): Promise<void> {
  // Only fire if the user has notifications enabled AND OS permission is granted
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(),
    getPermissionStatus(),
  ]);

  if (!enabled || status !== 'granted') return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Research Complete!',
        body: `Your report on "${reportTitle}" is ready to read.`,
        data: {
          type: 'research_complete',
          reportId,        // used by the notification tap handler to deep-link
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
      },
      trigger: null, // fire immediately
    });

    // Bump badge count
    const current = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(current + 1);
  } catch (err) {
    console.warn('[Notifications] Failed to schedule report-complete notification:', err);
  }
}

// ─── Notification Tap Handler (deep-link routing) ────────────────────────────

/**
 * Call this once at app startup (e.g. in _layout.tsx) to handle taps on
 * "Research Complete" notifications — it will route the user to the report.
 *
 * @param navigate - A function that accepts an href string, e.g. router.push
 */
export function registerNotificationTapHandler(
  navigate: (href: string) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'research_complete' && typeof data.reportId === 'string') {
        navigate(`/(app)/research-report?reportId=${data.reportId}`);
      }
    },
  );
  return () => subscription.remove();
}

// ─── Other Scheduled Notifications ───────────────────────────────────────────

export async function scheduleWeeklyDigestNotification(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Your Weekly Research Digest',
      body: "See what's trending in your research topics this week.",
      data: { type: 'weekly_digest' },
      ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // Monday (1=Sunday, 2=Monday)
      hour: 9,
      minute: 0,
    },
  });
}

export async function scheduleTopicUpdateNotification(topic: string): Promise<void> {
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(),
    getPermissionStatus(),
  ]);
  if (!enabled || status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 New Research Available',
      body: `New information found on: "${topic}"`,
      data: { type: 'topic_update', topic },
      ...(Platform.OS === 'android' ? { channelId: 'research' } : {}),
    },
    trigger: null,
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}