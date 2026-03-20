// app/index.tsx
// Entry point — handles all navigation routing based on auth state.
//
// FIX 1 — GO_BACK error on mount:
//   The error was caused by router.replace() being called synchronously
//   inside a useEffect that runs during the first render commit, before
//   expo-router's navigator has fully mounted its screen stack.
//   Calling router.replace at that point leaves the stack in a broken state
//   with no history, so any future back() call crashes with GO_BACK error.
//   Fix: wrap every router.replace() in setTimeout(..., 0) so navigation
//   is deferred to the next event loop tick, after the navigator is ready.
//
// FIX 2 — Home screen not shown after login without restart:
//   The useEffect dependency array was correct but the timing was wrong.
//   After sign-in, onAuthStateChange fires and updates session in AuthContext,
//   which triggers a re-render of this component. But if the effect ran
//   synchronously, the navigator stack wasn't ready to accept navigation.
//   The same setTimeout fix solves this too.
//
// Part 27 — Added onboarding gate:
//   After auth + profile resolve, checkOnboardingStatus() is called.
//   It reads AsyncStorage first (instant, no DB call) for existing users.
//   New users whose row has onboarding_completed = false are routed to
//   /(app)/onboarding-flow. Existing users pass through immediately.
//   The onboarding check is non-fatal — any error falls through to home.

import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { checkOnboardingStatus } from '../src/services/onboardingService';
import { COLORS } from '../src/constants/theme';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();

  // Track pending navigation timeout so we can clear it if state changes
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending navigation — state changed again before it fired
    if (navTimer.current) {
      clearTimeout(navTimer.current);
      navTimer.current = null;
    }

    // Still loading initial session from AsyncStorage — wait
    if (loading) return;

    // Session exists but profile hasn't loaded yet — wait
    if (session && profileLoading) return;

    // Defer navigation to next tick so the navigator stack is fully mounted
    navTimer.current = setTimeout(async () => {
      if (!session) {
        // No user → onboarding splash
        router.replace('/(auth)/onboarding');
        return;
      }

      if (!profile?.profile_completed) {
        // Logged in but profile setup not done
        router.replace('/(app)/profile-setup');
        return;
      }

      // ── Part 27: onboarding gate ──────────────────────────────────────
      // Reads AsyncStorage cache first — zero latency for existing users.
      // Existing users seeded by schema_part27.sql have
      // onboarding_completed = true and skip this branch entirely.
      try {
        const status = await checkOnboardingStatus(session.user.id);
        if (!status.onboardingCompleted) {
          router.replace('/(app)/onboarding-flow' as any);
          return;
        }
      } catch (err) {
        // Non-fatal: if the check fails, proceed to home so the user is
        // never stuck on the loading spinner.
        console.warn('[Index] Onboarding check failed, proceeding to home:', err);
      }

      // Fully ready → home
      router.replace('/(app)/(tabs)/home');
    }, 0);

    return () => {
      if (navTimer.current) {
        clearTimeout(navTimer.current);
        navTimer.current = null;
      }
    };
  }, [session, profile, loading, profileLoading]);

  // Show spinner while auth state is being determined
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}