// app/_layout.tsx
// Root layout — wraps the entire app.
// FIXED: Added deep link handler so email verification and password
// reset links open the app correctly instead of redirecting to localhost.
//
// How it works:
//   1. User taps link in email → phone opens the app via deepdiveai:// scheme
//   2. Linking.useURL() catches the incoming URL
//   3. We extract access_token + refresh_token from the URL
//   4. We call supabase.auth.setSession() to log the user in automatically
//   5. AuthContext detects the new session and redirects to the right screen

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '../src/context/AuthContext';
import { supabase } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync();

// Parses key=value pairs out of a URL fragment or query string
// e.g. "access_token=abc&type=recovery" → { access_token: 'abc', type: 'recovery' }
function parseUrlParams(paramString: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!paramString) return params;
  paramString.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  });
  return params;
}

// Takes the full deep link URL and sets a Supabase session from it
// Supabase puts tokens after # (fragment) for implicit flow
// e.g. deepdiveai://auth/callback#access_token=xxx&refresh_token=yyy&type=signup
async function handleDeepLink(url: string) {
  if (!url) return;

  try {
    // Extract the fragment (everything after #)
    const fragment = url.split('#')[1] || '';
    // Also check query string (everything after ?) as fallback
    const queryString = url.split('?')[1]?.split('#')[0] || '';

    const fragmentParams = parseUrlParams(fragment);
    const queryParams = parseUrlParams(queryString);

    // Merge both — fragment takes priority
    const params = { ...queryParams, ...fragmentParams };

    const { access_token, refresh_token, type } = params;

    if (access_token && refresh_token) {
      // Set the session using the tokens from the email link
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (error) {
        console.error('Deep link session error:', error.message);
        return;
      }

      // Route user based on the link type:
      // 'signup'   → email verification complete → go to profile setup or home
      // 'recovery' → password reset → go to a reset password screen
      if (type === 'recovery') {
        // For password reset, navigate to the forgot-password screen
        // The user is now authenticated so they can set a new password
        router.replace('/(auth)/forgot-password');
      }
      // For 'signup' and other types, AuthContext + index.tsx handle the redirect
    }
  } catch (err) {
    console.error('Deep link handling error:', err);
  }
}

export default function RootLayout() {
  // Listen for incoming deep links while the app is already open
  const url = Linking.useURL();

  useEffect(() => {
    if (url) {
      handleDeepLink(url);
    }
  }, [url]);

  useEffect(() => {
    // Also handle the case where the app was opened cold from a deep link
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    });

    // Hide splash screen after a short delay
    const timer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}