// app/(app)/_layout.tsx
// Layout for all screens that require authentication.
// If the user is not logged in, redirects to sign in.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../../src/constants/theme';

export default function AppLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    // If auth is done loading and there's no session, send to sign in
    if (!loading && !session) {
      router.replace('/(auth)/signin');
    }
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}