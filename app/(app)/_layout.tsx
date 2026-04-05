// app/(app)/_layout.tsx
// Part 39 FIX v4:
//
// FIX 2 — Mini player play/pause does nothing when podcast-player screen is NOT mounted:
//   ROOT CAUSE: MiniPlayerBus 'toggle' event was only subscribed in podcast-player.tsx.
//   When that screen unmounts (user navigated away), no handler exists for 'toggle'.
//
//   SOLUTION: Subscribe to 'toggle' here in _layout.tsx (which is ALWAYS mounted
//   while the app is running) and call the exported `toggleGlobalAudio()` function.
//   This directly calls play/pause on globalHolder.sound — no React state needed.
//
//   When podcast-player.tsx IS mounted (and mini player is hidden), the screen's
//   own subscription handles 'toggle'. But since the mini player is hidden when on
//   the player screen, the user can't trigger 'toggle' from there anyway —
//   so there's zero double-handling risk.
//
// FIX 3 — Lock screen / background audio removed:
//   Audio session configured without staysActiveInBackground.
//   UIBackgroundModes ["audio"] removed from app.json.
//   The mini player (within-app navigation) is completely unaffected.
//
// All Part 32/36/38 logic preserved: offline, suspended, deleted, onboarding, social.

import { useEffect, useRef }             from 'react';
import { View, Animated }                from 'react-native';
import { Stack, router, usePathname }    from 'expo-router';
import { COLORS }                        from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';
import { useNetwork }                    from '../../src/context/NetworkContext';
import { useAuth }                       from '../../src/context/AuthContext';
import { checkOnboardingStatus }         from '../../src/services/onboardingService';
import { OfflineScreen }                 from '../../src/components/offline/OfflineScreen';
import { AccountSuspendedScreen }        from '../../src/components/common/AccountSuspendedScreen';
import { AccountDeletedScreen }          from '../../src/components/common/AccountDeletedScreen';
import { MiniPlayer, MiniPlayerBus }     from '../../src/components/podcast/MiniPlayer';
import {
  MiniPlayerProvider,
  useMiniPlayerContext,
} from '../../src/context/MiniPlayerContext';
import {
  stopGlobalAudio,
  toggleGlobalAudio,
} from '../../src/hooks/usePodcastPlayer';

// ─── Inner layout ──────────────────────────────────────────────────────────────

function AppLayoutInner() {
  const { isOffline, isConnecting }                       = useNetwork();
  const { user, profile, profileLoading, accountDeleted } = useAuth();
  const pathname                                          = usePathname();

  const { miniPlayerState, hideMiniPlayer } = useMiniPlayerContext();

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

  // ── Mini player bus — global subscriber (always mounted) ──────────────────────
  // FIX 2: Handle BOTH 'toggle' and 'dismiss' here so they work even when
  // podcast-player.tsx is not in the navigation stack.
  //
  // 'toggle' → toggleGlobalAudio() operates directly on globalHolder.sound.
  //            When podcast-player.tsx IS on screen the mini player is hidden,
  //            so the user physically cannot trigger 'toggle' from there.
  //            No double-handling can occur.
  //
  // 'dismiss' → stopGlobalAudio() + hideMiniPlayer().
  //             podcast-player.tsx also subscribes to 'dismiss' for its own
  //             cleanup when mounted — both are safe to call (idempotent).
  useEffect(() => {
    const unsub = MiniPlayerBus.subscribe(async (event: string) => {
      if (event === 'toggle') {
        // FIX 2: This is the global handler for play/pause when the player
        // screen is NOT mounted. Works by directly manipulating globalHolder.sound.
        await toggleGlobalAudio();
      }
      if (event === 'dismiss') {
        // Stop the audio and hide the mini player UI
        await stopGlobalAudio();
        hideMiniPlayer();
      }
    });
    return unsub;
  }, [hideMiniPlayer]);

  const onboardingChecked = useRef(false);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (profile && !profile.profile_completed) return;
    if (pathname?.includes('onboarding-flow')) return;
    if (onboardingChecked.current) return;
    onboardingChecked.current = true;

    const runCheck = async () => {
      try {
        const status = await checkOnboardingStatus(user.id);
        if (!status.onboardingCompleted) {
          setTimeout(() => { router.replace('/(app)/onboarding-flow' as any); }, 80);
        }
      } catch (err) {
        console.warn('[AppLayout] Onboarding check error:', err);
      }
    };
    runCheck();
  }, [user?.id, profile?.profile_completed, profileLoading, pathname]);

  const isDeleted         = accountDeleted;
  const isSuspended       = !isDeleted && profile?.account_status === 'suspended';
  const blockInteractions = (isOffline && !isConnecting) || isSuspended || isDeleted;

  // Hide mini player while ON the podcast-player screen (full player is showing).
  // This also ensures 'toggle' from the mini player can never fire while the
  // full player is on-screen — eliminating any double-handling risk.
  const isOnPlayerScreen = pathname?.includes('podcast-player') ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Animated.View
        style={{ flex: 1 }}
        pointerEvents={blockInteractions ? 'none' : 'auto'}
      >
        <Stack
          screenOptions={{
            headerShown:  false,
            contentStyle: { backgroundColor: COLORS.background },
            animation:    'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

          {/* ── Research ── */}
          <Stack.Screen name="research-input"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="research-progress" />
          <Stack.Screen name="research-report"   />
          <Stack.Screen name="knowledge-graph"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="public-report"     options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />

          {/* ── Presentations ── */}
          <Stack.Screen name="slide-preview"     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="slide-editor"      options={{ animation: 'slide_from_right' }} />

          {/* ── Legacy ── */}
          <Stack.Screen name="bookmarks"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="compare-reports"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="edit-profile" />

          {/* ── Content formats ── */}
          <Stack.Screen name="academic-paper"    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="paper-editor"      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="podcast-player"    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="debate-detail"     options={{ animation: 'slide_from_right' }} />

          {/* ── Part 39: Podcast Series ── */}
          <Stack.Screen name="podcast-series"    options={{ animation: 'slide_from_right' }} />

          {/* ── Workspace ── */}
          <Stack.Screen name="workspace-detail"                options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-members"               options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-settings"              options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-report"                options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-viewer"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-podcast-player" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-debate"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-chat"                  options={{ animation: 'slide_from_right' }} />

          {/* ── Credits ── */}
          <Stack.Screen name="credits-store"       options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="transaction-history" options={{ animation: 'slide_from_right' }} />

          {/* ── Knowledge Base ── */}
          <Stack.Screen name="knowledge-base"     options={{ animation: 'slide_from_right' }} />

          {/* ── Search & Collections ── */}
          <Stack.Screen name="global-search"      options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="collection-detail"  options={{ animation: 'slide_from_right' }} />

          {/* ── Onboarding & Insights ── */}
          <Stack.Screen name="onboarding-flow"    options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="insights"           options={{ animation: 'slide_from_right' }} />

          {/* ── Social ── */}
          <Stack.Screen name="user-profile"        options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="followers"           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="explore-researchers" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="feed-report-view"    options={{ animation: 'slide_from_right' }} />
        </Stack>
      </Animated.View>

      {isDeleted && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }} pointerEvents="auto">
          <AccountDeletedScreen />
        </View>
      )}

      {isSuspended && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} pointerEvents="auto">
          <AccountSuspendedScreen />
        </View>
      )}

      <Animated.View
        pointerEvents={isOffline && !isConnecting ? 'auto' : 'none'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: offlineFade, zIndex: 9998 }}
      >
        {(isOffline || prevOffline.current) && <OfflineScreen />}
      </Animated.View>

      {/* Only render MiniPlayer when NOT on the player screen itself.
          This keeps the full-screen player and mini player from overlapping,
          and prevents any accidental double-handling of 'toggle' events. */}
      {!isOnPlayerScreen && <MiniPlayer state={miniPlayerState} />}
    </View>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────

export default function AppLayout() {
  return (
    <MiniPlayerProvider>
      <AppLayoutInner />
    </MiniPlayerProvider>
  );
}