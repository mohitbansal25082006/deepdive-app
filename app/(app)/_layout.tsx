// app/(app)/_layout.tsx
// Stack navigator for all authenticated screens.
// Part 3: added bookmarks + compare-reports screens.
// Subscription screen REMOVED — delete app/(app)/subscription.tsx if it exists.

import { Stack } from 'expo-router';
import { COLORS } from '../../src/constants/theme';

export default function AppLayout() {
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