// app/_layout.tsx
// Part 43 CORRECT FIX — clean layout, no Linking handler.
//
// The OAuth deep link is handled by Linking.useLinkingURL() in each
// auth screen (signin.tsx, signup.tsx). This is the official Supabase
// React Native pattern. No route file needed, no Linking handler here.
//
// All Part 24 logic preserved (WebBrowser.warmUpAsync, all providers).

import { useEffect }              from 'react';
import { Stack }                  from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import * as WebBrowser            from 'expo-web-browser';
import { AuthProvider }           from '../src/context/AuthContext';
import { NetworkProvider }        from '../src/context/NetworkContext';
import { CreditsProvider }        from '../src/context/CreditsContext';
import { COLORS }                 from '../src/constants/theme';

// Required — closes the auth browser on Android when app resumes via deep link
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {

  // Warm up browser engine on startup for faster OAuth/payment opens
  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {});
    return () => { WebBrowser.coolDownAsync().catch(() => {}); };
  }, []);

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