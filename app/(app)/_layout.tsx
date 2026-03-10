// app/(app)/_layout.tsx
// Stack navigator for all authenticated screens.
// Part 3: added bookmarks + compare-reports screens.
// Subscription screen REMOVED — delete app/(app)/subscription.tsx if it exists.
// Part 3 notifications: registers tap handler so "Research Complete" push
// notifications deep-link directly to the finished report.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { COLORS } from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';

export default function AppLayout() {
  // Register notification tap handler once when the authenticated layout mounts.
  // Tapping a "Research Complete" notification will call router.push with
  // the deep-link href  →  /(app)/research-report?reportId=<id>
  // The cleanup function removes the listener when the layout unmounts.
  useEffect(() => {
    const unsubscribe = registerNotificationTapHandler((href) => {
      router.push(href as any);
    });
    return unsubscribe;
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      {/* ── Tab root ──────────────────────────────────────────────────── */}
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

      {/* ── Research flow ─────────────────────────────────────────────── */}
      <Stack.Screen
        name="research-input"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen name="research-progress" />
      <Stack.Screen name="research-report" />

      {/* ── Bookmarks ─────────────────────────────────────────────────── */}
      <Stack.Screen
        name="bookmarks"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Compare reports ───────────────────────────────────────────── */}
      <Stack.Screen
        name="compare-reports"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Profile / settings ────────────────────────────────────────── */}
      <Stack.Screen name="edit-profile" />

      {/* NOTE: subscription screen deliberately omitted — subscription
          feature has been removed from the app. Delete the file:
            app/(app)/subscription.tsx
          and remove any import / navigation references to it.       */}
    </Stack>
  );
}