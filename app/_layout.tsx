// app/_layout.tsx
// Part 43 CORRECT FIX — clean layout, no Linking handler.
// Part 49 UPDATE — Wraps app in Stream Chat's OverlayProvider.
// Part 50 FIX — Removed invalid topInset/bottomInset/translucentStatusBar props
//   from OverlayProvider (moved to <Channel> in stream-chat-expo v8).
// Part 53 UPDATE — Calls initNotifications() once on startup so the SDK 54
//   notification handler (foreground banner + list) is installed and the Android
//   channels are created early. Without this, foreground notifications wouldn't
//   present as banners and the very first content notification of a session
//   might have no Android channel to land in.
//
// WHY OverlayProvider AT ROOT:
//   Stream's OverlayProvider must sit ABOVE the navigation stack so the
//   long-press message overlay and fullscreen image gallery render on top
//   of all navigation headers. No inset props needed here — just the theme.

import 'react-native-gesture-handler';  // MUST be first import per Stream docs
import { useEffect }              from 'react';
import { Stack }                  from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider }       from 'react-native-safe-area-context';
import * as WebBrowser            from 'expo-web-browser';
import { OverlayProvider }        from 'stream-chat-expo';
import { AuthProvider }           from '../src/context/AuthContext';
import { NetworkProvider }        from '../src/context/NetworkContext';
import { CreditsProvider }        from '../src/context/CreditsContext';
import { streamChatTheme }        from '../src/constants/streamChatTheme';
import { COLORS }                 from '../src/constants/theme';
// ── Part 53: install the notification handler + Android channels at startup ──
import { initNotifications }      from '../src/lib/notifications';

// Required — closes the auth browser on Android when app resumes via deep link
WebBrowser.maybeCompleteAuthSession();

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
        {/*
          Stream Chat OverlayProvider — wraps everything so overlays render
          above all navigation layers.

          v8 API: OverlayProvider only takes `value` for theming.
          topInset / bottomInset are Channel props (set in workspace-chat.tsx).

          value={{ style: streamChatTheme }} applies the DeepDive dark theme
          to all Stream Chat UI components globally.
        */}
        <OverlayProvider value={{ style: streamChatTheme }}>
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
        </OverlayProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}