// app/_layout.tsx
// Part 24 — UPDATED: Added CreditsProvider (wraps AuthProvider so every
// screen shares the same credit balance).
// Also calls WebBrowser.warmUpAsync() on startup for faster browser open.

import { useEffect }              from 'react';
import { Stack }                  from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import * as WebBrowser            from 'expo-web-browser';
import { AuthProvider }           from '../src/context/AuthContext';
import { NetworkProvider }        from '../src/context/NetworkContext';
import { CreditsProvider }        from '../src/context/CreditsContext';
import { COLORS }                 from '../src/constants/theme';

export default function RootLayout() {

  // Warm up the browser engine on startup so the first payment open is instant
  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {/* ignore on unsupported platforms */});
    return () => { WebBrowser.coolDownAsync().catch(() => {}); };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* NetworkProvider → AuthProvider → CreditsProvider */}
        <NetworkProvider>
          <AuthProvider>
            {/*
              CreditsProvider must be INSIDE AuthProvider so it can access
              useAuth() to load credits for the current user.
            */}
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