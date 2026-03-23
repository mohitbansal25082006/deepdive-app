// app/(app)/_layout.tsx
// Part 32 UPDATE (v3) — AccountDeletedScreen overlay refined.
// All Part 1–31 logic preserved unchanged.

import { useEffect, useRef }               from 'react';
import { View, Animated }                  from 'react-native';
import { Stack, router, usePathname }      from 'expo-router';
import { COLORS }                          from '../../src/constants/theme';
import { registerNotificationTapHandler } from '../../src/lib/notifications';
import { useNetwork }                      from '../../src/context/NetworkContext';
import { useAuth }                         from '../../src/context/AuthContext';
import { checkOnboardingStatus }           from '../../src/services/onboardingService';
import { OfflineScreen }                   from '../../src/components/offline/OfflineScreen';
import { AccountSuspendedScreen }          from '../../src/components/common/AccountSuspendedScreen';
import { AccountDeletedScreen }            from '../../src/components/common/AccountDeletedScreen';

export default function AppLayout() {
  const { isOffline, isConnecting }                       = useNetwork();
  const { user, profile, profileLoading, accountDeleted } = useAuth();
  const pathname                                          = usePathname();

  // ── Offline fade animation ────────────────────────────────────────────────
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
          setTimeout(() => {
            router.replace('/(app)/onboarding-flow' as any);
          }, 80);
        }
      } catch (err) {
        console.warn('[AppLayout] Onboarding check error:', err);
      }
    };

    runCheck();
  }, [user?.id, profile?.profile_completed, profileLoading, pathname]);

  // ── Part 32: account status flags ────────────────────────────────────────
  // accountDeleted: set by AuthContext when Realtime UPDATE fires with
  //                 account_status = 'deleted' (admin deleted the account)
  // isSuspended:    set when admin sets account_status = 'suspended'
  const isDeleted   = accountDeleted;
  const isSuspended = !isDeleted && profile?.account_status === 'suspended';

  // Block all stack interactions for any admin action or offline state
  const blockInteractions = (isOffline && !isConnecting) || isSuspended || isDeleted;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Main stack (always mounted so state is preserved) ────────────── */}
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

          <Stack.Screen name="research-input"    options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="research-progress" />
          <Stack.Screen name="research-report"   />

          <Stack.Screen name="knowledge-graph" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="public-report"   options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />

          <Stack.Screen name="slide-preview"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="slide-editor"    options={{ animation: 'slide_from_right' }} />

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

      {/* ── Account Deleted overlay (zIndex 10000 — highest) ─────────────────
           Shown when admin permanently deleted this account.
           accountDeleted is set by AuthContext when Realtime delivers the
           UPDATE with account_status='deleted' (while JWT is still valid).
           The "Go to Sign In" button calls clearDeletedState() which resets
           the flag and routes to onboarding.
      ──────────────────────────────────────────────────────────────────────── */}
      {isDeleted && (
        <View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 10000,
          }}
          pointerEvents="auto"
        >
          <AccountDeletedScreen />
        </View>
      )}

      {/* ── Account Suspended overlay (zIndex 9999) ────────────────────────
           Shown when profile.account_status === 'suspended'.
           Clears automatically when admin unsuspends (Realtime UPDATE fires).
           Hidden if the account is deleted (isDeleted check above).
      ──────────────────────────────────────────────────────────────────────── */}
      {isSuspended && (
        <View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
          }}
          pointerEvents="auto"
        >
          <AccountSuspendedScreen />
        </View>
      )}

      {/* ── Offline overlay (zIndex 9998) ──────────────────────────────────── */}
      <Animated.View
        pointerEvents={isOffline && !isConnecting ? 'auto' : 'none'}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          opacity:  offlineFade,
          zIndex:   9998,
        }}
      >
        {(isOffline || prevOffline.current) && <OfflineScreen />}
      </Animated.View>

    </View>
  );
}