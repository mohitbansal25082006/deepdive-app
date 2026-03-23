// app/index.tsx
// Part 32 UPDATE — Added suspended account check before routing.
//
// NEW in Part 32:
//   Before routing to home, we check if profile.account_status === 'suspended'.
//   A suspended user who opens the app fresh (e.g. after force-quitting) is
//   routed into the app stack as normal, and app/(app)/_layout.tsx immediately
//   shows <AccountSuspendedScreen /> on top.
//
//   We do NOT block here at the index level (redirect to a separate screen)
//   because the suspension is managed as an overlay inside the app stack.
//   This ensures when the admin lifts the suspension, the Realtime event
//   clears the overlay and the user is already on the right screen.
//
// All Part 1–27 logic preserved unchanged.

import { useEffect, useRef }        from 'react';
import { View, ActivityIndicator }  from 'react-native';
import { router }                   from 'expo-router';
import { useAuth }                  from '../src/context/AuthContext';
import { checkOnboardingStatus }    from '../src/services/onboardingService';
import { COLORS }                   from '../src/constants/theme';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();

  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (navTimer.current) {
      clearTimeout(navTimer.current);
      navTimer.current = null;
    }

    if (loading) return;
    if (session && profileLoading) return;

    navTimer.current = setTimeout(async () => {
      if (!session) {
        router.replace('/(auth)/onboarding');
        return;
      }

      if (!profile?.profile_completed) {
        router.replace('/(app)/profile-setup');
        return;
      }

      // ── Part 32: Suspended users route into the app normally ─────────────
      // app/(app)/_layout.tsx will detect account_status === 'suspended'
      // and show the <AccountSuspendedScreen /> overlay immediately.
      // We don't intercept here so that when the admin lifts the suspension,
      // the Realtime update clears the overlay without any re-navigation.
      //
      // Note: 'flagged' accounts retain full access — flagging is just an
      // admin review marker, not a restriction.

      // ── Part 27: onboarding gate ──────────────────────────────────────────
      try {
        const status = await checkOnboardingStatus(session.user.id);
        if (!status.onboardingCompleted) {
          router.replace('/(app)/onboarding-flow' as any);
          return;
        }
      } catch (err) {
        console.warn('[Index] Onboarding check failed, proceeding to home:', err);
      }

      router.replace('/(app)/(tabs)/home');
    }, 0);

    return () => {
      if (navTimer.current) {
        clearTimeout(navTimer.current);
        navTimer.current = null;
      }
    };
  }, [session, profile, loading, profileLoading]);

  return (
    <View
      style={{
        flex:            1,
        backgroundColor: COLORS.background,
        alignItems:      'center',
        justifyContent:  'center',
      }}
    >
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}