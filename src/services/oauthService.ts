// src/services/oauthService.ts
// Part 43 STALE URL FIX — prevents old OAuth URL from firing on sign-in after logout.
//
// ROOT CAUSE:
//   useLinkingURL() from expo-linking remembers the URL that opened/resumed
//   the app for the ENTIRE JS session. After a successful OAuth login, the
//   URL (deepdiveai://...#access_token=...) stays in memory.
//   When the user logs out and navigates back to the sign-in screen,
//   useLinkingURL() still returns the OLD OAuth URL. createSessionFromUrl()
//   tries to use the expired/revoked tokens. supabase.auth.setSession() fails
//   → Supabase fires SIGNED_OUT → AuthContext redirects to onboarding.
//   This is why the sign-in screen showed "sign in failed" immediately.
//
// THE FIX:
//   Track whether an OAuth flow is actively in progress using a module-level
//   flag (_oauthInProgress). The useLinkingURL() handler in signin/signup
//   only processes URLs when this flag is true. The flag is set when
//   signInWithOAuth() starts and cleared after the URL is processed or
//   when the user cancels. This ensures stale URLs from previous sessions
//   are always ignored.
//
//   Also track processed URLs in a Set so the same URL is never processed
//   twice even if the component re-mounts while the flag is still true.

import * as WebBrowser    from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase }       from '../lib/supabase';
import { User }           from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

// deepdiveai://** must be in Supabase Dashboard → Auth → Redirect URLs
export const OAUTH_REDIRECT_URI = makeRedirectUri({
  scheme: 'deepdiveai',
});

export type OAuthProvider = 'google' | 'github';

export interface OAuthResult {
  success:    boolean;
  error?:     string;
  errorType?: 'cancelled' | 'exchange_failed' | 'provider_error' | 'pending';
}

export interface SessionResult {
  user:  User | null;
  error: string | null;
}

// ── Module-level OAuth state ──────────────────────────────────────────────────
// These persist across component re-mounts within the same JS session.

/** True only while an OAuth browser flow is open or waiting for its deep link. */
let _oauthInProgress = false;

/** URLs we've already processed — prevents double-processing on re-renders. */
const _processedUrls = new Set<string>();

/** Called by signin/signup before checking isOAuthInProgress(). */
export function isOAuthInProgress(): boolean {
  return _oauthInProgress;
}

/** Called by oauthService internally. */
function setOAuthInProgress(value: boolean): void {
  _oauthInProgress = value;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses OAuth redirect URL and creates a Supabase session.
 * Returns user directly for explicit navigation (avoids onAuthStateChange race).
 *
 * IMPORTANT: Only call this when isOAuthInProgress() is true.
 * Calling it with a stale URL (after logout) will attempt setSession
 * with revoked tokens and trigger a spurious SIGNED_OUT event.
 */
export async function createSessionFromUrl(url: string): Promise<SessionResult> {
  if (!url) return { user: null, error: null };

  // Skip already-processed URLs (prevents double-processing on re-mount)
  if (_processedUrls.has(url)) {
    return { user: null, error: null };
  }

  // Only handle OAuth redirect URLs
  const isOAuthUrl =
    url.includes('access_token') ||
    url.includes('refresh_token') ||
    url.includes('code=');

  if (!isOAuthUrl) return { user: null, error: null };

  // Mark as processed and clear in-progress flag BEFORE async work
  // so concurrent calls are rejected immediately
  _processedUrls.add(url);
  setOAuthInProgress(false);

  try {
    // Android sends tokens in URL fragment (#). Replace # with ? so
    // URLSearchParams can read them.
    const normalizedUrl = url.includes('#') ? url.replace('#', '?') : url;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return { user: null, error: null };
    }

    const access_token  = parsedUrl.searchParams.get('access_token');
    const refresh_token = parsedUrl.searchParams.get('refresh_token') ?? '';
    const code          = parsedUrl.searchParams.get('code');
    const error_desc    = parsedUrl.searchParams.get('error_description')
                       ?? parsedUrl.searchParams.get('error');

    if (error_desc) {
      return { user: null, error: error_desc };
    }

    // Token flow (access_token in URL fragment)
    if (access_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) return { user: null, error: error.message };
      return { user: data.user ?? null, error: null };
    }

    // PKCE flow (code in URL query)
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { user: null, error: error.message };
      return { user: data.user ?? null, error: null };
    }

    return { user: null, error: null };

  } catch (err: any) {
    console.warn('[OAuth] createSessionFromUrl:', err?.message);
    return { user: null, error: err?.message ?? 'Unknown error' };
  }
}

/**
 * Opens the OAuth provider browser flow.
 *
 * Sets _oauthInProgress = true before opening the browser.
 * On Android, the OS intercepts the deep link — _oauthInProgress stays true
 * until useLinkingURL() handler calls createSessionFromUrl() which clears it.
 * On cancel/error, _oauthInProgress is cleared here immediately.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<OAuthResult> {
  // Set flag BEFORE opening browser
  setOAuthInProgress(true);

  try {
    const { data, error: urlError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo:          OAUTH_REDIRECT_URI,
        skipBrowserRedirect: true,
      },
    });

    if (urlError || !data?.url) {
      setOAuthInProgress(false);
      return {
        success:   false,
        error:     urlError?.message ?? 'Could not get provider URL',
        errorType: 'provider_error',
      };
    }

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      OAUTH_REDIRECT_URI,
      { showInRecents: false, preferEphemeralSession: false },
    );

    // User cancelled — clear flag immediately
    if (result.type === 'cancel' || result.type === 'dismiss') {
      setOAuthInProgress(false);
      return { success: false, error: 'Sign in was cancelled', errorType: 'cancelled' };
    }

    // Android: OS intercepted the deep link, browser returned without URL.
    // _oauthInProgress stays TRUE — useLinkingURL() in signin.tsx will
    // call createSessionFromUrl() which clears the flag after processing.
    if (result.type !== 'success' || !result.url) {
      return { success: false, errorType: 'pending' };
    }

    // iOS: URL returned directly — process it here
    const { user, error } = await createSessionFromUrl(result.url);
    // createSessionFromUrl already cleared _oauthInProgress
    if (error) return { success: false, error, errorType: 'exchange_failed' };
    if (user)  return { success: true };
    return { success: false, errorType: 'pending' };

  } catch (err: any) {
    setOAuthInProgress(false);
    return {
      success:   false,
      error:     err?.message ?? 'An unexpected error occurred',
      errorType: 'provider_error',
    };
  }
}