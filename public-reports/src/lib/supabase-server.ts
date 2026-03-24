// src/lib/supabase-server.ts
// Public-Reports — Server-side Supabase client
//
// Uses the SERVICE ROLE key to bypass RLS.
// This is safe because this module is ONLY used in:
//   - Next.js Server Components
//   - Next.js API Route Handlers (server-side)
// It is NEVER imported by client components.
//
// The service role gives us read access to research_reports even though
// public visitors are not authenticated users.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl)        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

// Singleton — reused across requests within the same server process
let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken:    false,
        persistSession:      false,
        detectSessionInUrl:  false,
      },
    });
  }
  return _client;
}

// Convenience alias
export const supabaseServer = getSupabaseServer();