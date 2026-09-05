// supabase/functions/_shared/keyStore.ts
// Part 59 — Shared key store for every Edge Function.
//
// WHAT IT DOES
//   getApiKey('openai') returns the plaintext OpenAI key, resolved in this
//   order:
//     1. In-memory cache (60s TTL) — avoids a DB round trip per request.
//     2. app_api_keys table — AES-256-GCM ciphertext, decrypted here with
//        API_KEY_ENCRYPTION_SECRET.
//     3. Deno.env.get('OPENAI_API_KEY') — the legacy Supabase secret.
//
//   Step 3 is the migration safety net: deploy the functions, and everything
//   keeps working on the old secrets until you paste the keys into the admin
//   dashboard. It also means a bad encryption secret degrades to "still works"
//   rather than "app is down".
//
// WHY DECRYPT HERE AND NOT IN POSTGRES
//   The encryption secret lives in Edge Function secrets and the admin
//   dashboard env — never in the database. So a stolen database backup, a
//   leaked service_role key used against PostgREST, or a SQL injection in some
//   unrelated feature all yield ciphertext and nothing else.
//
// ROTATION
//   Save a new key in the admin dashboard -> next request after the 60s TTL
//   picks it up. If a request gets a 401 from the provider, call
//   invalidateApiKey(provider) and retry once; the gateways already do this,
//   so a rotation takes effect on the very next call rather than after a
//   minute of failures.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENC_SECRET   = Deno.env.get('API_KEY_ENCRYPTION_SECRET') ?? '';

/** How long a decrypted key stays in isolate memory. */
const CACHE_TTL_MS = 60_000;

/** Legacy Supabase secret names, used when the vault has no row/key yet. */
const ENV_FALLBACK: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  tavily: 'TAVILY_API_KEY',
  pexels: 'PEXELS_API_KEY',
  giphy:  'GIPHY_API_KEY',
};

export type Provider = 'openai' | 'tavily' | 'pexels' | 'giphy';

// ─── CORS (shared by every gateway) ───────────────────────────────────────────

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, X-Request-Id',
};

export function jsonResponse(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(extra as Record<string, string>) },
  });
}

export function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({ error: message, code: code ?? null }, status);
}

// ─── Service-role client (singleton per isolate) ──────────────────────────────

let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!_service) {
    _service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth:   { autoRefreshToken: false, persistSession: false },
      // Pin the Authorization header so a forwarded user JWT can never demote
      // this client to the `authenticated` role (the Part 57 RLS lesson).
      global: { headers: { Authorization: `Bearer ${SERVICE_KEY}` } },
    });
  }
  return _service;
}

// ─── AES-256-GCM ──────────────────────────────────────────────────────────────
// Format: 'v1.<base64url iv>.<base64url ciphertext+tag>'
// The same scheme is implemented in Admin-Dashboard/src/lib/keyCrypto.ts.

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let _aesKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;
  if (!ENC_SECRET) {
    throw new Error('API_KEY_ENCRYPTION_SECRET is not set on this function');
  }
  // Derive a fixed 32-byte key from the secret so the secret can be any length.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENC_SECRET));
  _aesKey = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  return _aesKey;
}

export async function decryptSecret(payload: string): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Unrecognised ciphertext format');
  }
  const key = await getAesKey();
  const iv  = b64urlToBytes(parts[1]);
  const ct  = b64urlToBytes(parts[2]);
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { value: string; at: number; }
const cache = new Map<string, CacheEntry>();

export function invalidateApiKey(provider: string): void {
  cache.delete(provider);
}

export function invalidateAllApiKeys(): void {
  cache.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class ProviderNotConfiguredError extends Error {
  public readonly provider: string;
  constructor(provider: string) {
    super(`No active API key configured for "${provider}"`);
    this.name = 'ProviderNotConfiguredError';
    this.provider = provider;
  }
}

/**
 * Resolve the plaintext key for a provider.
 * Throws ProviderNotConfiguredError if there is no usable key anywhere.
 */
export async function getApiKey(
  provider: Provider | string,
  opts: { forceRefresh?: boolean } = {},
): Promise<string> {
  const now = Date.now();

  if (!opts.forceRefresh) {
    const hit = cache.get(provider);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
  }

  // ── 1. Vault ───────────────────────────────────────────────────────────────
  try {
    const { data, error } = await serviceClient()
      .from('app_api_keys')
      .select('ciphertext, is_active')
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      console.warn(`[keyStore] vault read failed for ${provider}: ${error.message}`);
    } else if (data?.is_active && data.ciphertext) {
      try {
        const plaintext = (await decryptSecret(data.ciphertext)).trim();
        if (plaintext) {
          cache.set(provider, { value: plaintext, at: now });
          return plaintext;
        }
      } catch (decErr) {
        // Wrong/rotated API_KEY_ENCRYPTION_SECRET. Do NOT hard-fail — fall
        // through to the env secret so the app degrades rather than dies.
        console.error(
          `[keyStore] decrypt failed for ${provider} — check ` +
          `API_KEY_ENCRYPTION_SECRET matches the admin dashboard: ${decErr}`,
        );
      }
    }
  } catch (err) {
    console.warn(`[keyStore] vault lookup threw for ${provider}: ${err}`);
  }

  // ── 2. Legacy Supabase secret ──────────────────────────────────────────────
  const envName = ENV_FALLBACK[provider];
  const envKey  = envName ? (Deno.env.get(envName) ?? '').trim() : '';
  if (envKey) {
    cache.set(provider, { value: envKey, at: now });
    return envKey;
  }

  throw new ProviderNotConfiguredError(provider);
}

// ─── Caller authentication ────────────────────────────────────────────────────

export interface AuthedUser {
  id:    string;
  email: string;
}

/**
 * Verify the Supabase JWT on the request and confirm the account is in good
 * standing. Every gateway calls this BEFORE touching a provider key, so a key
 * is never spent on an anonymous or suspended caller.
 */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing authorization header', 401, 'no_auth');
  }

  const jwt = authHeader.slice('Bearer '.length);
  const db  = serviceClient();

  const { data, error } = await db.auth.getUser(jwt);
  const user = data?.user;
  if (error || !user) {
    throw new AuthError('Your session has expired. Please sign in again.', 401, 'invalid_jwt');
  }

  // Suspended and deleted accounts must not be able to spend our API quota.
  const { data: profile } = await db
    .from('profiles')
    .select('account_status')
    .eq('id', user.id)
    .maybeSingle();

  const status = profile?.account_status ?? 'active';
  if (status === 'suspended' || status === 'deleted') {
    throw new AuthError('This account is not active.', 403, 'account_' + status);
  }

  return { id: user.id, email: user.email ?? '' };
}

export class AuthError extends Error {
  public readonly status: number;
  public readonly code:   string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name   = 'AuthError';
    this.status = status;
    this.code   = code;
  }
}

// ─── Best-effort per-user rate limiting ───────────────────────────────────────
//
// Per-isolate and therefore approximate — Supabase may run several isolates in
// parallel. It is not a billing control (credits already do that job); it is a
// blast-radius limiter so one stolen JWT can't burn the whole OpenAI balance in
// a minute. Set the ceiling well above legitimate usage.

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

export function rateLimit(
  userId: string,
  scope: string,
  maxRequests: number,
  windowMs = 60_000,
): void {
  const key = `${scope}:${userId}`;
  const now = Date.now();
  const b   = buckets.get(key);

  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup so the map can't grow unbounded in a long-lived isolate.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    }
    return;
  }

  b.count += 1;
  if (b.count > maxRequests) {
    throw new AuthError(
      'You are sending requests too quickly. Please wait a moment and try again.',
      429,
      'rate_limited',
    );
  }
}

// ─── Error → Response helper ──────────────────────────────────────────────────

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return errorResponse(err.message, err.status, err.code);
  }
  if (err instanceof ProviderNotConfiguredError) {
    return errorResponse(err.message, 503, 'provider_not_configured');
  }
  console.error('[gateway] unhandled error:', err);
  return errorResponse(
    err instanceof Error ? err.message : 'Internal error',
    500,
    'internal_error',
  );
}