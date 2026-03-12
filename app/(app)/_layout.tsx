// app/(app)/_layout.tsx
// Part 10: Added workspace-detail, workspace-members, workspace-settings,
//          workspace-report stack routes.

import { useEffect }                       from 'react';
import { Stack, router }                   from 'expo-router';
import { COLORS }                          from '../../src/constants/theme';
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
      <Stack.Screen name="research-report" />

      {/* ── Part 4: Knowledge Graph ── */}
      <Stack.Screen name="knowledge-graph" options={{ animation: 'slide_from_right' }} />

      {/* ── Part 4: Public Report Viewer (backward compat) ── */}
      <Stack.Screen
        name="public-report"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />

      {/* ── Part 5: AI Slide Generator ── */}
      <Stack.Screen name="slide-preview" options={{ animation: 'slide_from_right' }} />

      {/* ── Bookmarks ── */}
      <Stack.Screen name="bookmarks"       options={{ animation: 'slide_from_right' }} />

      {/* ── Compare reports ── */}
      <Stack.Screen name="compare-reports" options={{ animation: 'slide_from_right' }} />

      {/* ── Edit profile ── */}
      <Stack.Screen name="edit-profile" />

      {/* ── Part 7: Academic Paper Viewer ── */}
      <Stack.Screen name="academic-paper"  options={{ animation: 'slide_from_right' }} />

      {/* ── Part 8: AI Podcast Player ── */}
      <Stack.Screen name="podcast-player"  options={{ animation: 'slide_from_right' }} />

      {/* ── Part 9: AI Debate Detail ── */}
      <Stack.Screen name="debate-detail"   options={{ animation: 'slide_from_right' }} />

      {/*
        ── Part 10: Collaborative Workspace ──
        workspace-detail    — workspace feed, activity, members overview
        workspace-members   — full member management (owner only)
        workspace-settings  — edit name/desc, export, danger zone (owner only)
        workspace-report    — report viewer with presence + section comments
      */}
      <Stack.Screen name="workspace-detail"   options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="workspace-members"  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="workspace-settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="workspace-report"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}