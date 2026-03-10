// app/(app)/_layout.tsx
// Part 4: Added knowledge-graph and public-report routes.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { COLORS } from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';

export default function AppLayout() {
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
      {/* ── Tab root ── */}
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

      {/* ── Research flow ── */}
      <Stack.Screen
        name="research-input"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen name="research-progress" />
      <Stack.Screen name="research-report" />

      {/* ── Part 4: Knowledge Graph ── */}
      <Stack.Screen
        name="knowledge-graph"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Part 4: Public Report Viewer ── */}
      <Stack.Screen
        name="public-report"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />

      {/* ── Bookmarks ── */}
      <Stack.Screen name="bookmarks" options={{ animation: 'slide_from_right' }} />

      {/* ── Compare reports ── */}
      <Stack.Screen name="compare-reports" options={{ animation: 'slide_from_right' }} />

      {/* ── Profile ── */}
      <Stack.Screen name="edit-profile" />
    </Stack>
  );
}