// app/(app)/_layout.tsx
// Part 8: Added podcast-player screen route.
// Uses slide_from_right (not modal) to avoid the Reanimated freeze
// documented in previous parts.

import { useEffect }                         from 'react';
import { Stack, router }                     from 'expo-router';
import { COLORS }                            from '../../src/constants/theme';
import { registerNotificationTapHandler }   from '../../src/lib/notifications';

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
        headerShown:  false,
        contentStyle: { backgroundColor: COLORS.background },
        animation:    'slide_from_right',
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
      <Stack.Screen name="research-report"   />

      {/* ── Part 4: Knowledge Graph ── */}
      <Stack.Screen
        name="knowledge-graph"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Part 4: Public Report Viewer (backward compat) ── */}
      <Stack.Screen
        name="public-report"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />

      {/*
        ── Part 5: AI Slide Generator ──
        slide_from_right (NOT modal) to avoid Reanimated freeze.
        See Part 5 comment block for full explanation.
      */}
      <Stack.Screen
        name="slide-preview"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Bookmarks ── */}
      <Stack.Screen
        name="bookmarks"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Compare reports ── */}
      <Stack.Screen
        name="compare-reports"
        options={{ animation: 'slide_from_right' }}
      />

      {/* ── Edit profile ── */}
      <Stack.Screen name="edit-profile" />

      {/*
        ── Part 7: Academic Paper Viewer ──
        slide_from_right (NOT modal) — same freeze-prevention reason.
      */}
      <Stack.Screen
        name="academic-paper"
        options={{ animation: 'slide_from_right' }}
      />

      {/*
        ── Part 8: AI Podcast Player ──
        slide_from_right keeps it consistent with the rest of the stack.
        Using slide_from_bottom here would be fine too (no Reanimated
        entering= animations on the source screen for this route).
      */}
      <Stack.Screen
        name="podcast-player"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}