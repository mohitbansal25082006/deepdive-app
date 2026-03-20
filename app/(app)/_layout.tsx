// app/(app)/_layout.tsx
// Part 27 (Patch C) — Added onboarding gate directly in the app layout.
//
// WHY THIS IS NEEDED:
//   profile-setup.tsx navigates directly to /(app)/(tabs)/home after the user
//   completes their profile, bypassing index.tsx entirely. So the onboarding
//   check in index.tsx never runs for a fresh sign-up → user never sees the
//   onboarding flow.
//
// FIX:
//   This layout wraps every screen inside /(app)/. It mounts once per session
//   whenever the user enters the app section — whether from index.tsx, from
//   profile-setup, or from a fresh app open. Adding the onboarding check here
//   means it fires on EVERY entry path, not just through index.tsx.
//
// BEHAVIOUR:
//   • First open after fresh sign-up:
//     profile-setup → home → this layout mounts → check fires (DB hit) →
//     onboarding_completed=false → redirect to onboarding-flow.
//   • After completing onboarding:
//     completeOnboarding() writes cache → next check reads AsyncStorage
//     instantly → onboarding_completed=true → no redirect.
//   • All existing users (seeded by schema_part27.sql):
//     AsyncStorage cache returns true → no redirect, zero latency.
//   • onboardingChecked ref ensures the async check only fires once per mount,
//     even if the user or network state changes mid-check.
//   • If already on onboarding-flow screen the check is skipped to avoid a
//     redirect loop.

import { useEffect, useRef }               from 'react';
import { View, Animated }                  from 'react-native';
import { Stack, router, usePathname }      from 'expo-router';
import { COLORS }                          from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';
import { useNetwork }                      from '../../src/context/NetworkContext';
import { useAuth }                         from '../../src/context/AuthContext';
import { checkOnboardingStatus }           from '../../src/services/onboardingService';
import { OfflineScreen }                   from '../../src/components/offline/OfflineScreen';

export default function AppLayout() {
  const { isOffline, isConnecting }       = useNetwork();
  const { user, profile, profileLoading } = useAuth();
  const pathname                          = usePathname();

  // ── Offline animation ─────────────────────────────────────────────────────
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

  // ── Notification tap handler ──────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = registerNotificationTapHandler((href) => {
      router.push(href as any);
    });
    return unsubscribe;
  }, []);

  // ── Onboarding gate ───────────────────────────────────────────────────────
  // Fires once when the user + profile are ready.
  // Reads AsyncStorage cache first — zero latency for returning users.
  // If onboarding is incomplete, redirects to the 4-step flow.
  const onboardingChecked = useRef(false);

  useEffect(() => {
    // Wait for auth to fully resolve
    if (!user || profileLoading) return;

    // Profile not yet completed → profile-setup will handle routing, skip here
    if (profile && !profile.profile_completed) return;

    // Already on onboarding-flow → don't create a redirect loop
    if (pathname?.includes('onboarding-flow')) return;

    // Only run once per layout mount
    if (onboardingChecked.current) return;
    onboardingChecked.current = true;

    const runCheck = async () => {
      try {
        const status = await checkOnboardingStatus(user.id);
        if (!status.onboardingCompleted) {
          // Small delay so the screen stack is fully settled
          setTimeout(() => {
            router.replace('/(app)/onboarding-flow' as any);
          }, 80);
        }
      } catch (err) {
        // Non-fatal: if check fails, stay on home and retry next session
        console.warn('[AppLayout] Onboarding check error:', err);
      }
    };

    runCheck();
  }, [user?.id, profile?.profile_completed, profileLoading, pathname]);

  // ── Screen stack ──────────────────────────────────────────────────────────
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
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

          <Stack.Screen name="research-input"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="research-progress" />
          <Stack.Screen name="research-report"   />

          <Stack.Screen name="knowledge-graph" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="public-report"   options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />

          <Stack.Screen name="slide-preview"   options={{ animation: 'slide_from_right' }} />

          <Stack.Screen name="bookmarks"       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="compare-reports" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="edit-profile" />

          <Stack.Screen name="academic-paper"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="podcast-player"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="debate-detail"   options={{ animation: 'slide_from_right' }} />

          <Stack.Screen name="workspace-detail"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-members"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-report"   options={{ animation: 'slide_from_right' }} />

          <Stack.Screen name="workspace-shared-viewer"         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-podcast-player" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workspace-shared-debate"         options={{ animation: 'slide_from_right' }} />

          <Stack.Screen name="workspace-chat" options={{ animation: 'slide_from_right' }} />

          <Stack.Screen name="credits-store"       options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="transaction-history" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="knowledge-base"      options={{ animation: 'slide_from_right' }} />

          <Stack.Screen
            name="onboarding-flow"
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen
            name="insights"
            options={{ animation: 'slide_from_right' }}
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