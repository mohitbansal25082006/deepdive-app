// app/(app)/_layout.tsx
// Part 44 UPDATE — Registers workspace-shared-voice-debate-player screen route.
// Part 49 UPDATE — workspace-chat screen powered by Stream Chat (same route/params).
// Part 50.6 UPDATE — Registers workspace-ai-chat route.
// Part 53D UPDATE —
//   1. Wraps the whole app stack in <NotificationsProvider> so the bell and the
//      Profile tab badge share ONE realtime unread count.
//   2. Registers the Expo push token on login (registerAndSaveToken) so REMOTE
//      push works when the app is closed.
//   3. Handles COLD-START deep links: if the app was launched by tapping a push
//      while closed, getInitialNotificationResponse() routes to that content.
//      (The warm case — app already running — stays on registerNotificationTap-
//      Handler below.)

import { useEffect, useRef }             from 'react';
import { View, Animated }                from 'react-native';
import { Stack, router, usePathname }    from 'expo-router';
import { COLORS }                        from '../../src/constants/theme';
import {
  registerNotificationTapHandler,
  getInitialNotificationResponse,
  registerAndSaveToken,
} from '../../src/lib/notifications';
import { markNotificationReadFromData } from '../../src/services/appNotificationService';
import { useNetwork }                    from '../../src/context/NetworkContext';
import { useAuth }                       from '../../src/context/AuthContext';
import { NotificationsProvider }         from '../../src/context/NotificationsContext';
import { checkOnboardingStatus }         from '../../src/services/onboardingService';
import { OfflineScreen }                 from '../../src/components/offline/OfflineScreen';
import { AccountSuspendedScreen }        from '../../src/components/common/AccountSuspendedScreen';
import { AccountDeletedScreen }          from '../../src/components/common/AccountDeletedScreen';
import { MiniPlayer, MiniPlayerBus }     from '../../src/components/podcast/MiniPlayer';
import {
  MiniPlayerProvider,
  useMiniPlayerContext,
} from '../../src/context/MiniPlayerContext';
import { stopGlobalAudio }               from '../../src/hooks/usePodcastPlayer';

// Audio engines (Part 41.2)
import { AudioEngine }        from '../../src/services/GlobalAudioEngine';
import { VoiceDebateEngine }  from '../../src/services/VoiceDebateAudioEngine';

// ─── Inner layout ──────────────────────────────────────────────────────────────

function AppLayoutInner() {
  const { isOffline, isConnecting }                       = useNetwork();
  const { user, profile, profileLoading, accountDeleted } = useAuth();
  const pathname                                          = usePathname();

  const { hideMiniPlayer } = useMiniPlayerContext();

  const offlineFade = useRef(new Animated.Value(0)).current;
  const prevOffline = useRef(false);

  // ── Offline fade animation ────────────────────────────────────────────────
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

  // ── Part 41.2: Pause audio when going offline, clear flag when online ────
  const audioPrevOffline = useRef(false);

  useEffect(() => {
    if (isConnecting) return;

    const goingOffline = isOffline && !audioPrevOffline.current;
    const comingOnline = !isOffline && audioPrevOffline.current;

    if (goingOffline) {
      audioPrevOffline.current = true;
      AudioEngine.pauseForOffline().catch(() => {});
      VoiceDebateEngine.pauseForOffline().catch(() => {});
    } else if (comingOnline) {
      audioPrevOffline.current = false;
      AudioEngine.clearOfflinePause();
      VoiceDebateEngine.clearOfflinePause();
    }
  }, [isOffline, isConnecting]);

  // ── Part 53D: register push token once the user is known ──────────────────
  const tokenRegistered = useRef(false);
  useEffect(() => {
    if (!user?.id || tokenRegistered.current) return;
    tokenRegistered.current = true;
    registerAndSaveToken(user.id).catch(() => {});
  }, [user?.id]);

  // ── Deep-link routing from notification taps (WARM — app already running) ──
  useEffect(() => {
    const unsubscribe = registerNotificationTapHandler(
      (href) => { router.push(href as any); },
      (data) => { markNotificationReadFromData(data).catch(() => {}); },
    );
    return unsubscribe;
  }, []);

  // ── Part 53D: COLD-START deep link (app was closed, opened via push tap) ──
  const coldStartHandled = useRef(false);
  useEffect(() => {
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;
    (async () => {
      try {
        const res = await getInitialNotificationResponse();
        if (res) {
          // Clear this notification's unread state + reconcile the badge.
          markNotificationReadFromData(res.data).catch(() => {});
          if (res.href) {
            // Small delay so the navigation tree is mounted before we push.
            setTimeout(() => router.push(res.href as any), 350);
          }
        }
      } catch {}
    })();
  }, []);

  // ── Mini player bus — global subscriber ───────────────────────────────────
  useEffect(() => {
    const unsub = MiniPlayerBus.subscribe(async (event: string) => {
      if (event === 'dismiss') {
        await stopGlobalAudio();
        hideMiniPlayer();
      }
    });
    return unsub;
  }, [hideMiniPlayer]);

  // ── Onboarding check ──────────────────────────────────────────────────────
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

  // Hide mini player while full player screens are open
  const isOnPlayerScreen =
    (pathname?.includes('podcast-player') ||
     pathname?.includes('voice-debate-player') ||
     pathname?.includes('workspace-shared-voice-debate-player')) ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Animated.View style={{ flex: 1 }} pointerEvents={blockInteractions ? 'none' : 'auto'}>
        <Stack
          screenOptions={{
            headerShown:   false,
            contentStyle:  { backgroundColor: COLORS.background },
            animation:     'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

          {/* Research */}
          <Stack.Screen name="research-input"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="research-progress" />
          <Stack.Screen name="research-report"   />
          <Stack.Screen name="knowledge-graph"   options={{ animation: 'slide_from_right' }} />

          {/* Presentations */}
          <Stack.Screen name="slide-preview"     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="slide-editor"      options={{ animation: 'slide_from_right' }} />

          {/* Legacy */}
          <Stack.Screen name="bookmarks"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="compare-reports"   options={{ animation: 'slide_from_right' }} />

          {/* Content formats */}
          <Stack.Screen name="academic-paper"    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="paper-editor"      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="podcast-player"    options={{ animation: 'slide_from_right' }} />

          {/* Podcast Video Player */}
          <Stack.Screen
            name="podcast-video-player"
            options={{
              headerShown:      false,
              presentation:     'fullScreenModal',
              animation:        'fade',
              gestureEnabled:   true,
              gestureDirection: 'vertical',
            }}
          />

          {/* Debate */}
          <Stack.Screen name="debate-detail"     options={{ animation: 'slide_from_right' }} />

          {/* Voice Debate Player */}
          <Stack.Screen
            name="voice-debate-player"
            options={{
              headerShown:      false,
              presentation:     'fullScreenModal',
              animation:        'slide_from_bottom',
              gestureEnabled:   true,
              gestureDirection: 'vertical',
            }}
          />

          {/* Podcast Series */}
          <Stack.Screen name="podcast-series"    options={{ animation: 'slide_from_right' }} />

          {/* Workspace */}
          <Stack.Screen name="workspace-detail"                options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-members"               options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-settings"              options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-report"                options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-viewer"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-podcast-player" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-debate"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-chat"                  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-ai-chat"               options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-voice-debate-player" options={{ animation: 'slide_from_right' }} />

          {/* Credits */}
          <Stack.Screen name="credits-store"       options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="transaction-history" options={{ animation: 'slide_from_right' }} />

          {/* Knowledge Base */}
          <Stack.Screen name="knowledge-base"     options={{ animation: 'slide_from_right' }} />

          {/* Search & Collections */}
          <Stack.Screen name="global-search"      options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="collection-detail"  options={{ animation: 'slide_from_right' }} />

          {/* Onboarding & Insights */}
          <Stack.Screen name="onboarding-flow"    options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="insights"           options={{ animation: 'slide_from_right' }} />

          {/* Social */}
          <Stack.Screen name="user-profile"        options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="followers"           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="explore-researchers" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="feed-report-view"    options={{ animation: 'slide_from_right' }} />
        </Stack>
      </Animated.View>

      {/* Account status overlays */}
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

      {/* Offline overlay — stack stays mounted underneath */}
      <Animated.View
        pointerEvents={isOffline && !isConnecting ? 'auto' : 'none'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: offlineFade, zIndex: 9998 }}
      >
        {(isOffline || prevOffline.current) && <OfflineScreen />}
      </Animated.View>

      {/* Mini Player */}
      {!isOnPlayerScreen && <MiniPlayer />}
    </View>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { user } = useAuth();
  return (
    <NotificationsProvider userId={user?.id ?? null}>
      <MiniPlayerProvider>
        <AppLayoutInner />
      </MiniPlayerProvider>
    </NotificationsProvider>
  );
}