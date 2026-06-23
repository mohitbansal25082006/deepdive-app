// app/_layout.tsx
// Part 43 CORRECT FIX — clean layout, no Linking handler.
// Part 49 UPDATE — Wraps app in Stream Chat's OverlayProvider.
// Part 50 FIX — Removed invalid topInset/bottomInset/translucentStatusBar props.
// Part 53 UPDATE — initNotifications() on startup.
// Part 55 UPDATE — APP-WIDE THEME SYSTEM:
//   • <ThemeProvider> now wraps the entire app (above OverlayProvider) so the
//     mutable COLORS singleton is applied + a version counter is available
//     before any screen renders.
//   • A <ThemedRoot> inner component consumes useTheme() to:
//       1. Rebuild the Stream Chat theme from the live COLORS on every change
//          (buildStreamChatTheme), and re-key OverlayProvider so Stream recolors.
//       2. Drive a themed <StatusBar> (light bars on dark themes, dark bars on
//          light themes).
//       3. Key the navigation Stack by `version` so any memoized subtree and any
//          module-level styles patched in Part 55B are refreshed on theme switch.
//   • screenOptions.contentStyle reads COLORS.background inside ThemedRoot's
//     render, so it re-reads the fresh value on every theme change.
//
// WHY ThemeProvider SITS ABOVE OverlayProvider
//   OverlayProvider needs the Stream theme object; that object now depends on the
//   active app theme, which lives in ThemeProvider. So ThemeProvider must be the
//   outer-most provider.

import 'react-native-gesture-handler';  // MUST be first import per Stream docs
import { useEffect, useMemo }     from 'react';
import { View }                   from 'react-native';
import { Stack }                  from 'expo-router';
import { StatusBar }              from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import * as WebBrowser            from 'expo-web-browser';
import { OverlayProvider }        from 'stream-chat-expo';
import { AuthProvider }           from '../src/context/AuthContext';
import { NetworkProvider }        from '../src/context/NetworkContext';
import { CreditsProvider }        from '../src/context/CreditsContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { buildStreamChatTheme }   from '../src/constants/streamChatTheme';
import { COLORS }                 from '../src/constants/theme';
// ── Part 53: install the notification handler + Android channels at startup ──
import { initNotifications }      from '../src/lib/notifications';

// Required — closes the auth browser on Android when app resumes via deep link
WebBrowser.maybeCompleteAuthSession();

// ─── Themed root — consumes the theme and wires Stream + StatusBar + Stack ─────

function ThemedRoot() {
  const { version, isLight } = useTheme();

  // Rebuild the Stream Chat theme whenever the app theme changes (version bump).
  const streamTheme = useMemo(() => buildStreamChatTheme(), [version]);

  return (
    <OverlayProvider key={`overlay-${version}`} value={{ style: streamTheme }}>
      {/* Themed system bars: light content on dark themes, dark on light. */}
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <NetworkProvider>
        <AuthProvider>
          <CreditsProvider>
            {/* Keying the Stack by version forces a one-time remount on theme
                change so module-level styles (patched in Part 55B) and any
                memoized subtrees refresh. Inline styles already update via the
                re-render that the version bump triggers. */}
            <Stack
              key={`stack-${version}`}
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
    </OverlayProvider>
  );
}

export default function RootLayout() {

  // Warm up browser engine on startup for faster OAuth/payment opens
  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {});
    return () => { WebBrowser.coolDownAsync().catch(() => {}); };
  }, []);

  // ── Part 53: initialise notifications once. Safe + no-op in Expo Go. ──
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Part 55: ThemeProvider is the outer-most provider. */}
        <ThemeProvider>
          <ThemedRoot />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}