// app/_layout.tsx
// Root layout — handles deep links for public report sharing.
//
// Supported URL patterns:
//   deepdiveai://report/{token}          ← custom scheme (always works)
//   https://deepdive.app/report/{token}  ← universal / app link
//
// Both routes navigate to /(app)/public-report?token={token}

import { useEffect } from 'react';
import { Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { COLORS } from '../src/constants/theme';

// ─── Deep-link URL parser ─────────────────────────────────────────────────────

/**
 * Returns the public-report token if the URL matches either:
 *   deepdiveai://report/<token>
 *   https://deepdive.app/report/<token>
 * Returns null for any other URL.
 */
function extractPublicReportToken(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Custom scheme:  deepdiveai://report/<token>
    if (parsed.protocol === 'deepdiveai:') {
      // pathname looks like "//report/<token>" or "/report/<token>"
      const parts = parsed.pathname.replace(/^\/+/, '').split('/');
      // parts: ['report', '<token>']  OR  host = 'report', pathname = '/<token>'
      const host  = parsed.host ?? '';
      const token = host === 'report'
        ? parts[0]
        : parts[1]; // pathname after 'report'
      return token?.length > 0 ? token : null;
    }

    // Universal link:  https://deepdive.app/report/<token>
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.host === 'deepdive.app'
    ) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      // segments: ['report', '<token>']
      if (segments[0] === 'report' && segments[1]?.length > 0) {
        return segments[1];
      }
    }
  } catch {
    // URL() constructor can throw for custom schemes on some RN versions;
    // fall back to manual parsing below.
    const match = url.match(/deepdiveai:\/\/report\/([^/?#]+)/);
    if (match?.[1]) return match[1];

    const webMatch = url.match(/deepdive\.app\/report\/([^/?#]+)/);
    if (webMatch?.[1]) return webMatch[1];
  }

  return null;
}

function handleIncomingURL(url: string | null) {
  const token = extractPublicReportToken(url);
  if (!token) return;

  // Use a small timeout so navigation is ready before we push
  setTimeout(() => {
    router.push({
      pathname: '/(app)/public-report' as any,
      params: { token },
    });
  }, 200);
}

// ─── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  useEffect(() => {
    // 1. App was launched from a cold start via a deep link
    Linking.getInitialURL().then(url => {
      if (url) handleIncomingURL(url);
    });

    // 2. App was already running and a deep link arrives
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingURL(url);
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}