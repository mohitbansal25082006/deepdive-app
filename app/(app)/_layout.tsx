// app/(app)/_layout.tsx
// Part 5: Added slide-preview route for AI Slide Generator.
//
// ─── FREEZE FIX ────────────────────────────────────────────────────────────────
//
//  THE FREEZE: navigating from research-report → slide-preview froze the app.
//
//  Root cause in THIS file:
//    slide-preview was configured as `presentation: 'modal'` with
//    `animation: 'slide_from_bottom'`. When the source screen (research-report)
//    has ANY active Reanimated `entering=` animations, the native modal
//    presentation transition tries to simultaneously run its own stack animation
//    while Reanimated still holds the responder chain. The result is a JS thread
//    deadlock — the screen visually moves but all touch input and navigation
//    callbacks freeze permanently.
//
//    Confirmed fix: disabling the animation on the modal makes it open without
//    freezing. The correct permanent fix is to remove `presentation: 'modal'`
//    and use a standard stack push animation instead.
//    Ref: github.com/expo/expo/issues/34367 (comment: "if I disable the
//         animation on the modal, it opens just fine and never crashes")
//    Ref: github.com/expo/expo/issues/32940 (modal + reanimated entering = glitch)
//
//  Fix applied:
//    - Removed `presentation: 'modal'` from slide-preview
//    - Changed animation to `'slide_from_right'` (standard stack push)
//    - This matches all other non-modal screens in this layout
// ──────────────────────────────────────────────────────────────────────────────

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

      {/*
        ── Part 5: AI Slide Generator ──
        FIX: Removed presentation: 'modal' and animation: 'slide_from_bottom'.
        Modal presentation + Reanimated entering= animations on the source
        screen = JS thread deadlock / navigation freeze.
        Using standard slide_from_right push navigation instead.
      */}
      <Stack.Screen
        name="slide-preview"
        options={{ animation: 'slide_from_right' }}
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