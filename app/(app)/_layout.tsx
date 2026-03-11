// app/(app)/_layout.tsx
// Part 7 — Updated: Added academic-paper route.
//
// ─── FREEZE FIX (from Part 5) ─────────────────────────────────────────────────
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
//    Ref: github.com/expo/expo/issues/34367
//    Ref: github.com/expo/expo/issues/32940
//
//  Fix applied:
//    - Removed `presentation: 'modal'` from slide-preview
//    - Changed animation to `'slide_from_right'` (standard stack push)
//    - Same fix applied to academic-paper for the same reason
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
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

      {/*
        ── Part 4: Public Report Viewer ──
        Kept for backward compat — file was deleted in Part 4 but route
        registration is harmless if the file doesn't exist.
      */}
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
        FIX: Using slide_from_right (NOT modal) for the same reason as
        slide-preview above — modal presentation + Reanimated entering=
        animations on research-report = freeze.
      */}
      <Stack.Screen
        name="academic-paper"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}