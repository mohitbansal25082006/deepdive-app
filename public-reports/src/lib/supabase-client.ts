// src/lib/supabase-client.ts
// Public-Reports — Browser-side Supabase client
//
// Uses the ANON key — safe to expose to the browser.
// Used only by the ChatWidget client component for calling
// public RPC functions (check_chat_limit, etc.).
// NOT used for any authenticated operations.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl)     throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken:   false,
    persistSession:     false,
    detectSessionInUrl: false,
  },
});