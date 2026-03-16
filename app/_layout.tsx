// app/_layout.tsx
// Part 22 — UPDATED: Wrapped with NetworkProvider for offline detection.
// NetworkProvider uses @react-native-community/netinfo to track connectivity
// globally. All screens can call useNetwork() / useNetworkStatus().

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider }    from '../src/context/AuthContext';
import { NetworkProvider } from '../src/context/NetworkContext';
import { COLORS }          from '../src/constants/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* NetworkProvider must wrap AuthProvider so auth screens also
            get correct network state (e.g. show errors on sign-in offline) */}
        <NetworkProvider>
          <AuthProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
              <Stack.Screen name="(app)"  options={{ animation: 'none' }} />
            </Stack>
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}