// app/_layout.tsx
// Part 43 UPDATE — Added OAuth deep link handler for Google/GitHub callback.
//
// NEW in Part 43:
//   - Linking.addEventListener listens for deepdiveai://auth/callback URLs
//   - When the OAuth redirect fires, we extract the code and exchange it for
//     a session via supabase.auth.exchangeCodeForSession()
//   - onAuthStateChange in AuthContext picks up SIGNED_IN automatically
//   - WebBrowser.warmUpAsync() already called here from Part 24 — no change
//
// All Part 24 logic preserved unchanged.

import { useEffect }              from 'react';
import { Linking }                from 'react-native';
import { Stack }                  from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import * as WebBrowser            from 'expo-web-browser';
import { AuthProvider }           from '../src/context/AuthContext';
import { NetworkProvider }        from '../src/context/NetworkContext';
import { CreditsProvider }        from '../src/context/CreditsContext';
import { supabase }               from '../src/lib/supabase';
import { COLORS }                 from '../src/constants/theme';

// Required by expo-web-browser so it can close the auth session on Android
// when the app resumes from the OAuth redirect.
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {

  // Warm up the browser engine on startup so the first payment/OAuth open is instant
  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {});
    return () => { WebBrowser.coolDownAsync().catch(() => {}); };
  }, []);

  // ── OAuth deep link handler ──────────────────────────────────────────────
  // When the user completes OAuth on Google/GitHub, Supabase redirects to:
  //   deepdiveai://auth/callback?code=XXXX
  // expo-web-browser intercepts this and closes the browser. The Linking
  // event fires here with the full URL. We exchange the code for a session.
  useEffect(() => {
    // Handle deep links when the app is already open (foreground)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleOAuthCallback(url);
    });

    // Handle deep links that opened the app from a cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleOAuthCallback(url);
    });

    return () => subscription.remove();
  }, []);

  const handleOAuthCallback = async (url: string) => {
    if (!url) return;

    try {
      const parsedUrl = new URL(url);

      // Only handle our OAuth callback path
      if (
        parsedUrl.host === 'auth' &&
        parsedUrl.pathname === '/callback'
      ) {
        const code = parsedUrl.searchParams.get('code');
        if (code) {
          // Exchange the code for a Supabase session.
          // onAuthStateChange in AuthContext fires SIGNED_IN automatically.
          await supabase.auth.exchangeCodeForSession(code);
        }
      }
    } catch {
      // URL parse failed or exchange failed — user stays on auth screen
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <CreditsProvider>
              <Stack
                screenOptions={{
                  headerShown:  false,
                  contentStyle: { backgroundColor: COLORS.background },
                  animation:    'fade',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
                <Stack.Screen name="(app)"  options={{ animation: 'none' }} />
              </Stack>
            </CreditsProvider>
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}