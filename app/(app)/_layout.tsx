// app/(app)/_layout.tsx
// Part 24 — UPDATED: Registered credits-store + transaction-history screens.

import { useEffect, useRef }            from 'react';
import { View, Animated }               from 'react-native';
import { Stack, router }                from 'expo-router';
import { COLORS }                       from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';
import { useNetwork }                   from '../../src/context/NetworkContext';
import { OfflineScreen }                from '../../src/components/offline/OfflineScreen';

export default function AppLayout() {
  const { isOffline, isConnecting } = useNetwork();

  const offlineFade = useRef(new Animated.Value(0)).current;
  const prevOffline = useRef(false);

  useEffect(() => {
    if (isConnecting) return;

    const goingOffline = isOffline && !prevOffline.current;
    const comingOnline = !isOffline && prevOffline.current;

    if (goingOffline) {
      prevOffline.current = true;
      Animated.timing(offlineFade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    } else if (comingOnline) {
      prevOffline.current = false;
      Animated.timing(offlineFade, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }
  }, [isOffline, isConnecting]);

  useEffect(() => {
    const unsubscribe = registerNotificationTapHandler((href) => {
      router.push(href as any);
    });
    return unsubscribe;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      <Animated.View
        style={{ flex: 1 }}
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

          {/* ── Part 4 ── */}
          <Stack.Screen name="knowledge-graph"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="public-report"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />

          {/* ── Part 5: AI Slide Generator ── */}
          <Stack.Screen name="slide-preview" options={{ animation: 'slide_from_right' }} />

          {/* ── Misc ── */}
          <Stack.Screen name="bookmarks"       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="compare-reports" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="edit-profile" />

          {/* ── Part 7: Academic Paper ── */}
          <Stack.Screen name="academic-paper" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 8: Podcast Player ── */}
          <Stack.Screen name="podcast-player" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 9: Debate Detail ── */}
          <Stack.Screen name="debate-detail" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 10: Workspace ── */}
          <Stack.Screen name="workspace-detail"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-members"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-report"   options={{ animation: 'slide_from_right' }} />

          {/* ── Part 14 ── */}
          <Stack.Screen name="workspace-shared-viewer"          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-podcast-player"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-debate"          options={{ animation: 'slide_from_right' }} />

          {/* ── Part 17: Chat ── */}
          <Stack.Screen name="workspace-chat" options={{ animation: 'slide_from_right' }} />

          {/* ── Part 24: Credits Store ── */}
          <Stack.Screen
            name="credits-store"
            options={{
              animation:    'slide_from_bottom',
              presentation: 'modal',
            }}
          />

          {/* ── Part 24: Transaction History ── */}
          <Stack.Screen
            name="transaction-history"
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack>
      </Animated.View>

      <Animated.View
        pointerEvents={isOffline && !isConnecting ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          opacity: offlineFade,
        }}
      >
        {(isOffline || prevOffline.current) && <OfflineScreen />}
      </Animated.View>

    </View>
  );
}