// src/lib/notifications.ts
// DeepDive AI — Part 53D (supersedes the Part 53 rewrite)
//
// CHANGES IN PART 53D (on top of the earlier projectId/local-notification fixes)
//
//   A. MUTE MODEL FIXED.
//      The in-app flag is now an OPTIONAL MUTE, not a required enable. On a fresh
//      install the flag is absent → notifications are ALLOWED (as long as the OS
//      permission is granted). Only an explicit 'false' (user toggled the Profile
//      switch off) suppresses banners. Previously the absent flag read as false
//      and silently dropped every notification.
//        • getNotificationsEnabled(): absent → true.
//        • isExplicitlyMuted(): true only when the flag === 'false'.
//        • scheduleLocalNotification(): gates on isExplicitlyMuted() + permission,
//          and requests permission on the fly if undetermined.
//
//   B. PERMISSION REQUESTED AT STARTUP.
//      initNotifications() now requests OS permission (if undetermined) and
//      registers the Expo push token, so REMOTE push (app closed) works without
//      the user first visiting the Profile screen. Guarded by _initDone.
//
//   C. REMOTE PUSH SUPPORT (app closed).
//      Local notifications can't fire when the app process is dead. We register
//      the Expo push token at startup and save it to Supabase; a Database
//      Webhook → Edge Function (supabase/functions/send-push-notification) sends
//      the actual remote push. registerForPushNotifications() uses the real EAS
//      projectId (the original root-cause fix).
//
//   D. COLD-START DEEP LINK.
//      getInitialNotificationResponse() reads the notification that launched the
//      app from a cold start (getLastNotificationResponseAsync). The app layout
//      calls it once on mount so tapping a push while the app was CLOSED routes
//      to the right screen.
//
//   E. emulators: requestNotificationPermission() no longer blocks on
//      Device.isDevice (local notifications work on emulators).

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Expo Go detection ────────────────────────────────────────────────────────

const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient' ||
  (Constants as any).appOwnership === 'expo';

// ─── Foreground tracker (Part 53F) ───────────────────────────────────────────
// We use this to avoid DOUBLE notifications. Remote push (Edge Function on DB
// insert) fires for EVERY notification, foreground and background. So local
// banners must only ever fire when remote push is NOT the delivery path.
// In practice we let remote push own the OS banner entirely, and use this flag
// only for badge reconciliation + (optional) foreground-only local fallback.

let _appForeground = AppState.currentState === 'active';
AppState.addEventListener('change', (next: AppStateStatus) => {
  _appForeground = next === 'active';
});

export function isAppForeground(): boolean {
  return _appForeground;
}

// ─── Push-token availability (Part 53F) ──────────────────────────────────────
// Used by notification services to decide whether REMOTE push will deliver the
// banner (in which case we must NOT also fire a local one, to avoid duplicates).
// Cached after the first successful check to avoid a DB round-trip every time.

let _cachedHasToken: boolean | null = null;

export async function hasUsablePushToken(): Promise<boolean> {
  if (_cachedHasToken !== null) return _cachedHasToken;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) return false;
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', uid)
      .limit(1);
    if (error) return false;
    _cachedHasToken = Array.isArray(data) && data.length > 0;
    return _cachedHasToken;
  } catch {
    return false;
  }
}

// Call after a token is freshly saved so the cache reflects reality immediately.
export function markPushTokenAvailable(): void {
  _cachedHasToken = true;
}


// ─── Lazy-load expo-notifications ────────────────────────────────────────────

let _Notifications: typeof import('expo-notifications') | null = null;

function getNotifications(): typeof import('expo-notifications') | null {
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

// ─── EAS project id resolver (root-cause fix) ────────────────────────────────

function resolveProjectId(): string | undefined {
  const fromExpoConfig = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig  = (Constants as any)?.easConfig?.projectId;
  return fromExpoConfig ?? fromEasConfig ?? undefined;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NOTIF_ENABLED_KEY = 'deepdive:notifications_enabled';

// ─── Init guard ───────────────────────────────────────────────────────────────

let _initDone = false;

// ─── Init — call once from app/_layout.tsx inside useEffect ──────────────────

export function initNotifications(userId?: string | null): void {
  try {
    const N = getNotifications();
    if (!N) return;

    N.setNotificationHandler({
      handleNotification: async () => ({
        // SDK 54 keys — shouldShowAlert is deprecated and intentionally omitted.
        shouldShowBanner: true,
        shouldShowList:   true,
        shouldPlaySound:  true,
        shouldSetBadge:   true,
      }),
    });

    void ensureAndroidChannels();

    if (_initDone) return;
    _initDone = true;

    // Request permission early + register the push token so remote push works
    // even before the user opens the Profile screen.
    void (async () => {
      try {
        const status = await getPermissionStatus();
        if (status === 'undetermined') {
          await requestNotificationPermission();
        }
        const granted = (await getPermissionStatus()) === 'granted';
        if (granted && userId) {
          const token = await registerForPushNotifications();
          if (token) await saveTokenToSupabase(userId, token);
        }
      } catch (e) {
        console.warn('[Notifications] startup permission/token error:', e);
      }
    })();
  } catch (e) {
    console.warn('[Notifications] init failed:', e);
  }
}

// ─── Persisted enabled / mute flag ───────────────────────────────────────────

// Part 53D: absent flag → enabled (true). Only explicit 'false' disables.
export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

// True ONLY when the user has explicitly muted (flag === 'false').
export async function isExplicitlyMuted(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return val === 'false';
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
  // Part 53D: do NOT block on Device.isDevice — local notifications work on
  // emulators, and the permission prompt is harmless there.
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

    await N.setNotificationChannelAsync('content', {
      name:             'Content Ready',
      importance:       N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#6C63FF',
      sound:            'default',
    });
    await N.setNotificationChannelAsync('social_updates', {
      name:             'Social Updates',
      importance:       N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#6C63FF',
      sound:            'default',
    });
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
    console.log('[Notifications] Push token only works on physical devices.');
    return null;
  }
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  await ensureAndroidChannels();
  try {
    const N = getNotifications();
    if (!N) return null;

    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn(
        '[Notifications] EAS projectId not found. Local notifications still ' +
        'work; remote push token skipped.',
      );
      return null;
    }

    const tokenData = await N.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.warn('[Notifications] Token fetch failed (local still works):', err);
    return null;
  }
}

export async function saveTokenToSupabase(userId: string, token: string): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' });
    if (error) console.warn('[Notifications] Failed to save token:', error.message);
    else markPushTokenAvailable();
  } catch (e) {
    console.warn('[Notifications] saveTokenToSupabase error:', e);
  }
}

// Convenience: register + save in one call (used by the app layout on login).
export async function registerAndSaveToken(userId: string): Promise<void> {
  try {
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
  } catch (e) {
    console.warn('[Notifications] registerAndSaveToken error:', e);
  }
}

// ─── Enable / Disable (Profile toggle) ────────────────────────────────────────

export async function enableNotifications(
  userId: string,
): Promise<'enabled' | 'needs_settings'> {
  const currentStatus = await getPermissionStatus();

  const finalize = async () => {
    const token = await registerForPushNotifications();
    if (token) await saveTokenToSupabase(userId, token);
    await ensureAndroidChannels();
    await setNotificationsEnabled(true);
  };

  if (currentStatus === 'granted') {
    await finalize();
    return 'enabled';
  }

  const granted = await requestNotificationPermission();
  if (granted) {
    await finalize();
    return 'enabled';
  }
  return 'needs_settings';
}

export async function disableNotifications(): Promise<void> {
  try {
    const N = getNotifications();
    if (N) {
      await N.cancelAllScheduledNotificationsAsync();
      await N.setBadgeCountAsync(0);
    }
  } catch {}
  await setNotificationsEnabled(false);
}

// ─── Generic local notification scheduler ────────────────────────────────────

export interface LocalNotificationInput {
  title:    string;
  body:     string;
  data?:    Record<string, unknown>;
  channel?: 'content' | 'research' | 'social_updates' | 'default';
}

export async function scheduleLocalNotification(
  input: LocalNotificationInput,
): Promise<boolean> {
  // Part 53D: only blocks on EXPLICIT mute. Absent flag = allowed.
  if (await isExplicitlyMuted()) return false;

  const N = getNotifications();
  if (!N) return false;

  // Request permission on the fly if still undetermined.
  let status = await getPermissionStatus();
  if (status === 'undetermined') {
    await requestNotificationPermission();
    status = await getPermissionStatus();
  }
  if (status !== 'granted') return false;

  await ensureAndroidChannels();
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: input.title,
        body:  input.body,
        data:  input.data ?? {},
        sound: true,
        ...(Platform.OS === 'android'
          ? {
              channelId: input.channel ?? 'content',
              priority:  N.AndroidNotificationPriority.MAX,
            }
          : {}),
      },
      trigger: null,
    });

    try {
      const current = await N.getBadgeCountAsync();
      await N.setBadgeCountAsync(current + 1);
    } catch {}

    return true;
  } catch (err) {
    console.warn('[Notifications] scheduleLocalNotification failed:', err);
    return false;
  }
}

// ─── Research Complete Notification (legacy convenience — kept) ───────────────

export async function notifyReportComplete(
  reportId: string,
  reportTitle: string,
): Promise<void> {
  await scheduleLocalNotification({
    title: '✅ Research Complete!',
    body:  `Your report on "${reportTitle}" is ready to read.`,
    data:  {
      type:   'report_ready',
      route:  '/(app)/research-report',
      reportId,
      params: { reportId },
    },
    channel: 'content',
  });
}

// ─── Deep-link href builder (shared) ─────────────────────────────────────────

function buildHref(route: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return route;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && `${v}` !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${route}?${qs}` : route;
}

// Resolve a notification's data payload to an href (preferred route+params,
// then legacy per-type fallbacks). Returns null if nothing routable.
function hrefFromData(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;

  if (typeof data.route === 'string' && data.route.length > 0) {
    const params =
      data.params && typeof data.params === 'object'
        ? (data.params as Record<string, unknown>)
        : undefined;
    return buildHref(data.route, params);
  }

  if (
    (data.type === 'research_complete' || data.type === 'report_ready') &&
    typeof data.reportId === 'string'
  ) {
    return `/(app)/research-report?reportId=${data.reportId}`;
  }
  if (
    (data.type === 'new_follower' || data.type === 'new_unfollower') &&
    typeof data.username === 'string' &&
    data.username.length > 0
  ) {
    return `/(app)/user-profile?username=${encodeURIComponent(data.username)}`;
  }
  if (data.type === 'new_report' && typeof data.reportId === 'string') {
    return `/(app)/feed-report-view?reportId=${data.reportId}`;
  }
  return null;
}

// ─── Notification Tap Handler (warm — app already running) ────────────────────

export function registerNotificationTapHandler(
  navigate: (href: string) => void,
  onTap?: (data: Record<string, unknown>) => void,
): () => void {
  try {
    const N = getNotifications();
    if (!N) return () => {};

    const subscription = N.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response.notification.request.content.data as Record<string, unknown>;
        // Part 53F: clear this notification's unread state + reconcile the badge.
        onTap?.(data);
        const href = hrefFromData(data);
        if (href) navigate(href);
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

// ─── Cold-start deep link (app was CLOSED, opened by tapping a push) ─────────
//
// Call once on app mount. Returns the href to navigate to, or null if the app
// wasn't launched from a notification tap. Pairs with registerNotificationTap-
// Handler (which covers the warm case while the app is already running).

export async function getInitialNotificationResponse(): Promise<
  { href: string | null; data: Record<string, unknown> } | null
> {
  try {
    const N = getNotifications();
    if (!N) return null;
    const response = await N.getLastNotificationResponseAsync();
    if (!response) return null;
    const data = response.notification.request.content.data as Record<string, unknown>;
    return { href: hrefFromData(data), data };
  } catch (e) {
    console.warn('[Notifications] getInitialNotificationResponse error:', e);
    return null;
  }
}

// ─── Other Scheduled Notifications (kept) ────────────────────────────────────

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

export async function scheduleTopicUpdateNotification(topic: string): Promise<void> {
  await scheduleLocalNotification({
    title: '🔔 New Research Available',
    body:  `New information found on: "${topic}"`,
    data:  { type: 'topic_update', topic },
    channel: 'research',
  });
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
    await N.setBadgeCountAsync(Math.max(0, count));
  } catch {}
}

export async function clearBadge(): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.setBadgeCountAsync(0);
  } catch {}
}

// ─── Diagnostics (handy for debugging on-device) ─────────────────────────────

export async function getNotificationDiagnostics(): Promise<Record<string, unknown>> {
  return {
    isExpoGo:        IS_EXPO_GO,
    moduleLoaded:    !!getNotifications(),
    isDevice:        Device.isDevice,
    projectId:       resolveProjectId() ?? null,
    permission:      await getPermissionStatus(),
    explicitlyMuted: await isExplicitlyMuted(),
    platform:        Platform.OS,
  };
}