// app/+native-intent.tsx
// Part 43 FINAL FIX — intercepts OAuth deep links before Expo Router routing.
//
// WHY THIS FILE EXISTS:
//   Expo Router intercepts ALL custom scheme deep links and tries to match
//   them to route files. deepdiveai://auth/callback has no matching route,
//   so it shows "Unmatched Route". No JS code fix can stop this — it happens
//   at the native routing layer before any React code runs.
//
//   +native-intent.tsx is Expo Router's official solution for exactly this:
//   it runs BEFORE the router matches any route, receives the raw URL/path,
//   and can redirect it to a real route or return it unchanged.
//
// HOW IT WORKS:
//   1. OAuth completes → Supabase redirects to deepdiveai://?access_token=...
//      OR deepdiveai://auth/callback?code=...
//   2. Android opens the app with that URL
//   3. This file runs first — sees the URL contains auth params
//   4. Redirects to /(auth)/signin which has useLinkingURL() listening
//   5. useLinkingURL() fires with the original URL → createSessionFromUrl()
//   6. Session created → AuthContext routes to home
//
// REQUIRES REBUILD: This file is processed at build time by Expo Router.
// Run: eas build -p android --profile preview

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    // Check if this is an OAuth callback from Supabase.
    // Supabase returns tokens as URL fragment: deepdiveai://#access_token=...
    // OR as query params: deepdiveai://auth/callback?code=...
    // OR base scheme: deepdiveai://?access_token=...
    const isOAuthCallback =
      path.includes('access_token') ||
      path.includes('refresh_token') ||
      path.includes('auth/callback') ||
      path.includes('code=') ||
      (path.startsWith('deepdiveai') && path.includes('token'));

    if (isOAuthCallback) {
      // Store the original URL so signin screen can pick it up via useLinkingURL
      // Redirect to signin screen which has the useLinkingURL hook listening
      return '/(auth)/signin';
    }

    // All other paths pass through unchanged
    return path;
  } catch {
    // Never crash in this function — return a safe default
    return '/';
  }
}