// app/index.tsx
// This is the first screen that runs.
// It checks auth state and redirects to the right screen:
// - Not logged in → Onboarding/Sign In
// - Logged in, no profile → Profile Setup
// - Logged in, has profile → Main App

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { COLORS } from '../src/constants/theme';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();

  useEffect(() => {
    // Wait until both auth and profile have finished loading
    if (loading || profileLoading) return;

    if (!session) {
      // User is not logged in — go to onboarding
      router.replace('/(auth)/onboarding');
    } else if (!profile?.profile_completed) {
      // User is logged in but hasn't completed profile setup
      router.replace('/(app)/profile-setup');
    } else {
      // User is logged in with a complete profile — go to main app
      router.replace('/(app)/(tabs)/home');
    }
  }, [session, profile, loading, profileLoading]);

  // Show a loading spinner while determining where to navigate
  return (
    <View style={{
      flex: 1,
      backgroundColor: COLORS.background,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}