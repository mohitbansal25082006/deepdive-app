// src/lib/supabase-server.ts
// Public-Reports — Server-side Supabase client
//
// KEY FIX: Creates a FRESH client on every call instead of a module-level
// singleton. Next.js 15 Turbopack can share module state across requests,
// causing stale RPC responses. A new client per request guarantees a fresh
// fetch with no cached data.
//
// Also disables Next.js fetch caching via { cache: 'no-store' } so that
// Supabase RPC calls never return cached "limit reached" responses to new
// visitors.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return { url, key };
}

/**
 * Creates a fresh Supabase server client for each call.
 * Uses service role to bypass RLS.
 * Disables Next.js fetch caching so every RPC gets a live DB result.
 */
export function createSupabaseServer(): SupabaseClient {
  const { url, key } = getEnvVars();

  return createClient(url, key, {
    auth: {
      autoRefreshToken:   false,
      persistSession:     false,
      detectSessionInUrl: false,
    },
    global: {
      // Disable Next.js fetch cache — critical for rate limiter correctness
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

// Named export for convenience — each import site gets a fresh client
// by calling this function, not by importing a shared instance.
export const supabaseServer = createSupabaseServer();