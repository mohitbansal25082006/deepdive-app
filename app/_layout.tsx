// app/_layout.tsx
// Part 43 CORRECT FIX — clean layout, no Linking handler.
// Part 49 UPDATE — Wraps app in Stream Chat's OverlayProvider.
// Part 50 FIX — Removed invalid topInset/bottomInset/translucentStatusBar props.
// Part 53 UPDATE — initNotifications() on startup.
// Part 55 UPDATE — APP-WIDE THEME SYSTEM.
//
// ── Part 55.1A FIX (Feature 1: "change name → then change theme → theme won't apply") ──
//
//   ROOT CAUSE
//     The previous version keyed the navigation Stack itself by the theme
//     `version`:  <Stack key={`stack-${version}`}>. Every theme change therefore
//     force-REMOUNTED the entire navigation tree (all screens, their state, every
//     hook). That remount is a very heavy, asynchronous operation.
//
//     The profile Edit-Profile flow calls refreshProfile() after saving the name.
//     refreshProfile() flips AuthContext state (profileLoading → true → false and
//     a new profile object), which re-renders the subtree. If the user then
//     changes the theme, the version bump tries to remount the Stack at almost
//     the same time React is still committing the profile-refresh re-render. The
//     two updates race: the in-flight remount swallows / supersedes the
//     version-bumped render, so the freshly-mutated COLORS are painted by the OLD
//     (pre-remount) tree and the new theme appears "not to apply" until something
//     else triggers a paint.
//
//   THE FIX (recommended pattern)
//     Do NOT remount the navigation Stack on theme change. The theme recolor does
//     not need a remount at all:
//       • Inline `COLORS.x` reads already pick up the new palette on the ordinary
//         re-render caused by the context `version` changing (every useTheme()
//         consumer re-renders, and ThemeProvider sits above the whole app).
//       • The handful of module-level captured styles are converted to
//         getter/factory styles in Part 55.1 (history.tsx, research-report.tsx,
//         ReportSection.tsx, … and the rest in 55.1B), so they too read the live
//         COLORS on each render — no remount required.
//
//     We keep a single lightweight keyed <View> (ThemedRecolorBoundary) BELOW all
//     the state-holding providers (Network / Auth / Credits) and ABOVE the Stack.
//     Re-keying that thin View on version change gives memoized subtrees a cheap
//     belt-and-suspenders refresh WITHOUT tearing down navigation state, auth,
//     credits, or the profile edit flow — so the name-edit ↔ theme-change race is
//     gone. Providers never remount, so refreshProfile() and a theme switch can
//     no longer collide.
//
//   contentStyle.background still reads COLORS inside ThemedRoot's render, so it
//   re-reads the fresh value on every theme change.
//
// WHY ThemeProvider SITS ABOVE OverlayProvider
//   OverlayProvider needs the Stream theme object; that object depends on the
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
  // Keying OverlayProvider by version is SAFE — it is above the navigation Stack
  // and does not hold per-screen state, so recoloring Stream here costs nothing
  // and does not race with screen-level state updates.
  const streamTheme = useMemo(() => buildStreamChatTheme(), [version]);

  return (
    <OverlayProvider key={`overlay-${version}`} value={{ style: streamTheme }}>
      {/* Themed system bars: light content on dark themes, dark on light. */}
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <NetworkProvider>
        <AuthProvider>
          <CreditsProvider>
            {/* Part 55.1A: a THIN keyed boundary instead of keying the Stack.
                Re-keying this View on `version` cheaply refreshes any memoized
                subtree on a theme switch, but it lives BELOW the providers, so
                auth/profile/credits state is preserved and the profile name-edit
                flow can never race with a theme change. The navigation Stack
                itself is NOT remounted. */}
            <ThemedRecolorBoundary version={version}>
              <Stack
                screenOptions={{
                  headerShown:  false,
                  // Reads the live COLORS on each render → updates on theme change.
                  contentStyle: { backgroundColor: COLORS.background },
                  animation:    'fade',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
                <Stack.Screen name="(app)"  options={{ animation: 'none' }} />
              </Stack>
            </ThemedRecolorBoundary>
          </CreditsProvider>
        </AuthProvider>
      </NetworkProvider>
    </OverlayProvider>
  );
}

// ─── Thin recolor boundary ─────────────────────────────────────────────────────
// A flex:1 wrapper whose `key` changes with the theme version. Because it sits
// below the providers and contains only the Stack, re-keying it does not tear
// down any provider state; it just gives the navigator subtree one clean re-mount
// of its *presentation* layer when needed. In practice the inline-COLORS + getter
// styles already recolor on the version re-render, so this is a safety net rather
// than the primary mechanism — and crucially it no longer collides with
// refreshProfile().
function ThemedRecolorBoundary({
  version,
  children,
}: {
  version: number;
  children: React.ReactNode;
}) {
  return (
    <View key={`recolor-${version}`} style={{ flex: 1, backgroundColor: COLORS.background }}>
      {children}
    </View>
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