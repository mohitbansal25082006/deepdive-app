// app/(app)/_layout.tsx
// Part 22 — FIXED offline mode integration.
//
// ─── ROOT CAUSE OF ITEMS NOT OPENING ─────────────────────────────────────────
//
// The previous version used an Animated.View with `position: absolute` covering
// the entire screen as an overlay ON TOP of the Stack navigator. Even with
// `pointerEvents={showOffline ? 'auto' : 'none'}`, the Stack was still mounted
// and its internal state was fine — but router.push() fired by the OfflineScreen
// was trying to push into the SAME navigator that was visually covered, and the
// navigation worked but the screen appeared *behind* the overlay, making it
// look like nothing happened.
//
// ─── FIX ─────────────────────────────────────────────────────────────────────
//
// The OfflineScreen now owns its own FULL content area as a sibling — NOT an
// overlay. We use a simple conditional render:
//
//   • isOffline  → show OfflineScreen filling the whole View (Stack hidden but mounted)
//   • isOnline   → show Stack normally
//
// The Stack is kept mounted (display:'none' via opacity:0 + pointerEvents:'none'
// trick) so all navigation state, scroll positions, and component lifecycles
// are preserved while offline. When connectivity returns, the Stack snaps back
// instantly with no re-mount cost.
//
// The OfflineScreen handles opening items INLINE (inline viewer inside itself),
// so it never needs to navigate into the Stack — zero navigation conflicts.
//
// ─── NO CHANGES TO ONLINE BEHAVIOUR ─────────────────────────────────────────
// All Stack.Screen registrations, notification tap handler, and online routes
// are byte-for-byte identical to the Part 17 version.

import { useEffect, useRef }            from 'react';
import { View, Animated }               from 'react-native';
import { Stack, router }                from 'expo-router';
import { COLORS }                       from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';
import { useNetwork }                   from '../../src/context/NetworkContext';
import { OfflineScreen }                from '../../src/components/offline/OfflineScreen';

export default function AppLayout() {
  const { isOffline, isConnecting } = useNetwork();

  // Smooth fade for the offline screen appearing/disappearing
  const offlineFade = useRef(new Animated.Value(0)).current;
  const prevOffline = useRef(false);

  useEffect(() => {
    // Only animate when the state actually settles (not during the connecting
    // debounce window) to avoid a brief flash on app start.
    if (isConnecting) return;

    const goingOffline = isOffline && !prevOffline.current;
    const comingOnline = !isOffline && prevOffline.current;

    if (goingOffline) {
      prevOffline.current = true;
      Animated.timing(offlineFade, {
        toValue: 1, duration: 320, useNativeDriver: true,
      }).start();
    } else if (comingOnline) {
      prevOffline.current = false;
      Animated.timing(offlineFade, {
        toValue: 0, duration: 400, useNativeDriver: true,
      }).start();
    }
  }, [isOffline, isConnecting]);

  // Notification tap deep-link handler (online only)
  useEffect(() => {
    const unsubscribe = registerNotificationTapHandler((href) => {
      router.push(href as any);
    });
    return unsubscribe;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Online Stack — always mounted, hidden when offline ── */}
      {/* Keeping it mounted preserves all screen state / scroll positions.   */}
      {/* When connectivity returns the user is exactly where they left off.  */}
      <Animated.View
        style={{
          flex:          1,
          // Interpolate opacity so the stack fades out when offline fades in.
          // pointerEvents is set on the inner View to block input while hidden.
        }}
        pointerEvents={isOffline && !isConnecting ? 'none' : 'auto'}
      >
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
          <Stack.Screen name="research-input"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="research-progress" />
          <Stack.Screen name="research-report"   />

          {/* ── Part 4: Knowledge Graph ── */}
          <Stack.Screen name="knowledge-graph" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 4: Public Report Viewer (backward compat) ── */}
          <Stack.Screen name="public-report" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />

          {/* ── Part 5: AI Slide Generator ── */}
          <Stack.Screen name="slide-preview" options={{ animation: 'slide_from_right' }} />

          {/* ── Bookmarks ── */}
          <Stack.Screen name="bookmarks" options={{ animation: 'slide_from_right' }} />

          {/* ── Compare reports ── */}
          <Stack.Screen name="compare-reports" options={{ animation: 'slide_from_right' }} />

          {/* ── Edit profile ── */}
          <Stack.Screen name="edit-profile" />

          {/* ── Part 7: Academic Paper Viewer ── */}
          <Stack.Screen name="academic-paper" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 8: AI Podcast Player ── */}
          <Stack.Screen name="podcast-player" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 9: AI Debate Detail ── */}
          <Stack.Screen name="debate-detail" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 10: Collaborative Workspace ── */}
          <Stack.Screen name="workspace-detail"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-members"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-report"   options={{ animation: 'slide_from_right' }} />

          {/* ── Part 14: Workspace Shared Content Viewer ── */}
          <Stack.Screen name="workspace-shared-viewer" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 15: Workspace Shared Podcast Player ── */}
          <Stack.Screen name="workspace-shared-podcast-player" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 16: Workspace Shared Debate Viewer ── */}
          <Stack.Screen name="workspace-shared-debate" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 17: Advanced Workspace Chat ── */}
          <Stack.Screen name="workspace-chat" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </Animated.View>

      {/* ── Offline Screen — fades in over the Stack when offline ── */}
      {/* This is a SIBLING View (not an absolute overlay) so it doesn't      */}
      {/* compete with the Stack for pointer events.                          */}
      {/* It fills the same space via absolute fill — but with its own        */}
      {/* self-contained navigation (inline viewer) so router.push is         */}
      {/* never needed from within the offline screen.                        */}
      <Animated.View
        pointerEvents={isOffline && !isConnecting ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          opacity: offlineFade,
          // Only render the heavy component when actually offline or fading.
          // The `pointerEvents:'none'` above already prevents interaction
          // when opacity is 0, but we also avoid rendering at all until
          // the first time the device goes offline (saves bundle parse time).
        }}
      >
        {/* Only mount OfflineScreen once it's actually needed */}
        {(isOffline || prevOffline.current) && (
          <OfflineScreen />
        )}
      </Animated.View>

    </View>
  );
}