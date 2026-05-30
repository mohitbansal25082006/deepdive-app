// src/services/oauthService.ts
// Part 43 — Google & GitHub OAuth via Supabase + expo-web-browser.
//
// HOW IT WORKS:
//   1. Call signInWithOAuth('google') or signInWithOAuth('github')
//   2. Supabase returns a provider URL — we open it in expo-web-browser
//   3. User authenticates on Google/GitHub's own page
//   4. Supabase redirects back to: deepdiveai://auth/callback?code=...
//   5. expo-web-browser intercepts the redirect and closes itself
//   6. We extract the URL from the browser result and exchange the code
//      for a session via supabase.auth.exchangeCodeForSession()
//   7. onAuthStateChange in AuthContext picks up SIGNED_IN automatically
//
// REQUIREMENTS:
//   - expo-web-browser (already installed in Part 24)
//   - expo-auth-session (install: npx expo install expo-auth-session)
//   - app.json scheme must be "deepdiveai" (already set)
//   - Supabase dashboard: Auth → URL Configuration → Redirect URLs
//     Add: deepdiveai://auth/callback
//   - Google Cloud Console: Authorized redirect URIs
//     Add: https://<your-project-ref>.supabase.co/auth/v1/callback
//   - GitHub OAuth App: Callback URL
//     Add: https://<your-project-ref>.supabase.co/auth/v1/callback

import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';

// Tell expo-web-browser to complete the auth session when the app resumes.
// This must be called at the module level — it handles the Android back-stack.
WebBrowser.maybeCompleteAuthSession();

// The deep link that Supabase will redirect to after OAuth.
// On a dev build: deepdiveai://auth/callback
// expo-auth-session constructs this from app.json scheme automatically.
const REDIRECT_URI = makeRedirectUri({
  scheme: 'deepdiveai',
  path:   'auth/callback',
});

export type OAuthProvider = 'google' | 'github';

export interface OAuthResult {
  success: boolean;
  error?:  string;
  // 'cancelled' = user closed the browser without completing
  // 'exchange_failed' = browser returned but code exchange failed
  // 'no_url' = browser returned but no URL (unexpected)
  errorType?: 'cancelled' | 'exchange_failed' | 'no_url' | 'provider_error';
}

/**
 * Sign in with an OAuth provider (Google or GitHub).
 * Opens an in-app browser, handles the redirect, and exchanges the code.
 * Returns { success: true } on success — AuthContext picks up the session.
 * Returns { success: false, error, errorType } on any failure.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<OAuthResult> {
  try {
    // 1. Ask Supabase for the provider's authorization URL
    const { data, error: urlError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo:       REDIRECT_URI,
        skipBrowserRedirect: true, // We open the browser manually below
      },
    });

    if (urlError || !data?.url) {
      return {
        success:   false,
        error:     urlError?.message ?? 'Could not get provider URL',
        errorType: 'provider_error',
      };
    }

    // 2. Open the provider's auth page in an in-app browser
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      REDIRECT_URI,
      {
        // On Android, show a browser chooser instead of defaulting to Chrome
        showInRecents:    false,
        // iOS: prefer Safari View Controller for credential sharing
        preferEphemeralSession: false,
      }
    );

    // 3. Handle browser result
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return {
        success:   false,
        error:     'Sign in was cancelled',
        errorType: 'cancelled',
      };
    }

    if (result.type !== 'success' || !result.url) {
      return {
        success:   false,
        error:     'No redirect URL received from provider',
        errorType: 'no_url',
      };
    }

    // 4. Extract code from the redirect URL and exchange it for a session.
    //    The URL looks like: deepdiveai://auth/callback?code=xxxx&...
    const url  = new URL(result.url);
    const code = url.searchParams.get('code');

    if (!code) {
      // Some providers return error in the URL (e.g. user denied access)
      const oauthError = url.searchParams.get('error_description')
        ?? url.searchParams.get('error')
        ?? 'Authentication was denied by the provider';
      return {
        success:   false,
        error:     oauthError,
        errorType: 'exchange_failed',
      };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return {
        success:   false,
        error:     exchangeError.message,
        errorType: 'exchange_failed',
      };
    }

    // 5. Success — AuthContext's onAuthStateChange will fire with SIGNED_IN
    return { success: true };

  } catch (err: any) {
    return {
      success:   false,
      error:     err?.message ?? 'An unexpected error occurred',
      errorType: 'provider_error',
    };
  }
}