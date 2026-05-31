// app/+not-found.tsx
// Part 43 FINAL FIX — safety net for any remaining unmatched routes.
//
// If +native-intent.tsx doesn't catch an OAuth URL for any reason,
// this screen catches it, checks if it contains auth tokens,
// and creates the session before routing to signin.
//
// Also handles any other genuinely unmatched routes gracefully.

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '../src/lib/supabase';
import { COLORS } from '../src/constants/theme';

export default function NotFoundScreen() {
  useEffect(() => {
    handleNotFound();
  }, []);

  const handleNotFound = async () => {
    try {
      // Check if we got here from an OAuth redirect
      const initialUrl = await Linking.getInitialURL();

      if (initialUrl) {
        const { params } = QueryParams.getQueryParams(initialUrl);
        const { access_token, refresh_token } = params;

        if (access_token) {
          // This is an OAuth callback — create the session
          await supabase.auth.setSession({ access_token, refresh_token });
          // AuthContext will handle routing after session is set
          return;
        }
      }
    } catch {
      // Ignore errors
    }

    // Not an OAuth callback — go to signin
    router.replace('/(auth)/signin');
  };

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