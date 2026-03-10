// src/lib/notifications.ts
// Push notification setup and scheduling for DeepDive AI Part 3.
// Handles permission requests, token registration, and local scheduling.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Permission & Token Registration ─────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Notifications] Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    return null;
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('research', {
      name: 'Research Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C63FF',
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'deepdive-app', // matches app.json slug
    });
    return tokenData.data;
  } catch (err) {
    console.warn('[Notifications] Token fetch failed:', err);
    return null;
  }
}

// Save token to Supabase so server-side notifications can be sent
export async function saveTokenToSupabase(
  userId: string,
  token: string
): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform },
      { onConflict: 'token' }
    );
  if (error) {
    console.warn('[Notifications] Failed to save token:', error.message);
  }
}

// ─── Schedule Local Notifications ────────────────────────────────────────────

export async function scheduleResearchCompleteNotification(
  reportTitle: string,
  delaySeconds: number = 0
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Research Complete!',
      body: `Your report on "${reportTitle}" is ready to read.`,
      data: { type: 'research_complete' },
      sound: true,
    },
    trigger: delaySeconds > 0
      ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
      : null,
  });
}

export async function scheduleWeeklyDigestNotification(): Promise<void> {
  // Schedule for every Monday at 9am
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Your Weekly Research Digest',
      body: 'See what\'s trending in your research topics this week.',
      data: { type: 'weekly_digest' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // Monday (1=Sunday, 2=Monday)
      hour: 9,
      minute: 0,
    },
  });
}

export async function scheduleTopicUpdateNotification(
  topic: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 New Research Available',
      body: `New information found on: "${topic}"`,
      data: { type: 'topic_update', topic },
    },
    trigger: null, // immediate
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}