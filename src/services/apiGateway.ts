// src/services/apiGateway.ts
// Part 59 — NEW. The single door between the app and every third-party API.
//
// Before Part 59 each service held its own key and called the vendor directly.
// Now every one of them calls through here, and here talks only to our own
// Supabase Edge Functions. The app ships with exactly two credentials, both of
// which are designed to be public: the Supabase URL and the anon key.
//
// WHAT THIS FILE OWNS
//   • Attaching the user's Supabase session to every gateway call.
//   • Refreshing a stale session once, transparently, instead of surfacing a
//     confusing "session expired" mid-report.
//   • Turning gateway error codes into messages worth showing a person.
//   • Preserving AbortSignal semantics end to end (Part 53's cancel button).
//
// WHAT IT DOESN'T
//   No retries on 5xx. The callers already have their own retry/backoff
//   policies tuned per feature (TTS retries twice, embeddings back off
//   exponentially), and stacking a second retry layer underneath them turns a
//   brief outage into a multi-minute hang.

import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '../lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL   ?? '';
const ANON_KEY     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Default timeout for non-streaming calls. Streaming calls pass their own. */
const DEFAULT_TIMEOUT_MS = 120_000;

export type GatewayFunction = 'ai-gateway' | 'ai-audio-gateway' | 'search-gateway';

export function gatewayUrl(fn: GatewayFunction | string): string {
  if (!SUPABASE_URL) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set. Check your .env file.');
  }
  return `${SUPABASE_URL}/functions/v1/${fn}`;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  public readonly status: number;
  public readonly code:   string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name   = 'GatewayError';
    this.status = status;
    this.code   = code;
  }

  /** The provider has no key configured — callers should degrade, not crash. */
  get isNotConfigured(): boolean {
    return this.code === 'provider_not_configured' || this.code === 'provider_auth_failed';
  }

  /** Transient: the provider (or we) throttled this request. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** The user needs to sign in again. */
  get isAuthError(): boolean {
    return this.status === 401 && this.code !== 'provider_auth_failed';
  }
}

export function isAbortError(err: unknown): boolean {
  return !!err
    && typeof err === 'object'
    && (err as { name?: string }).name === 'AbortError';
}

// ─── Session handling ─────────────────────────────────────────────────────────

async function accessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      throw new GatewayError('Your session has expired. Please sign in again.', 401, 'no_session');
    }
    return data.session.access_token;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new GatewayError('Your session has expired. Please sign in again.', 401, 'no_session');
  }
  return data.session.access_token;
}

export async function gatewayHeaders(
  extra: Record<string, string> = {},
  forceRefresh = false,
): Promise<Record<string, string>> {
  const token = await accessToken(forceRefresh);
  return {
    Authorization: `Bearer ${token}`,
    apikey:        ANON_KEY,
    ...extra,
  };
}

// ─── Error parsing ────────────────────────────────────────────────────────────

async function readError(res: Response): Promise<GatewayError> {
  let message = `Request failed (HTTP ${res.status})`;
  let code: string | null = null;

  try {
    const body = await res.json() as { error?: string; code?: string };
    if (body?.error) message = body.error;
    if (body?.code)  code    = body.code;
  } catch { /* keep the status-based message */ }

  return new GatewayError(message, res.status, code);
}

// ─── JSON calls ───────────────────────────────────────────────────────────────

export interface CallOptions {
  signal?:    AbortSignal;
  timeoutMs?: number;
}

/**
 * POST JSON to a gateway function and parse the JSON response.
 *
 * A 401 is retried exactly once with a force-refreshed session, which covers
 * the common case of an access token expiring during a long research run.
 */
export async function callGateway<T>(
  fn: GatewayFunction | string,
  body: unknown,
  opts: CallOptions = {},
): Promise<T> {
  const url = gatewayUrl(fn);

  const attempt = async (forceRefresh: boolean): Promise<Response> => {
    const headers = await gatewayHeaders({ 'Content-Type': 'application/json' }, forceRefresh);

    // Combine the caller's signal with our timeout so whichever fires first wins.
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const onCallerAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timeout);
        const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
      }
      opts.signal.addEventListener('abort', onCallerAbort);
    }

    try {
      return await fetch(url, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }
  };

  let res: Response;
  try {
    res = await attempt(false);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new GatewayError(
      'Could not reach the server. Check your connection and try again.',
      0,
      'network_error',
    );
  }

  if (res.status === 401) {
    const first = await readError(res);
    // provider_auth_failed means OUR key is bad, not the user's session —
    // refreshing would be pointless.
    if (first.code !== 'provider_auth_failed') {
      try {
        res = await attempt(true);
      } catch (err) {
        if (isAbortError(err)) throw err;
        throw first;
      }
    } else {
      throw first;
    }
  }

  if (!res.ok) throw await readError(res);

  return await res.json() as T;
}

// ─── Streaming calls ──────────────────────────────────────────────────────────

/**
 * Open a streaming (SSE) connection to a gateway function.
 *
 * Uses expo/fetch rather than React Native's built-in fetch because RN's fetch
 * does not implement `response.body` as a ReadableStream — the same reason
 * openaiStreamClient.ts has used expo/fetch since Part 21.
 *
 * Returns the raw Response so the caller can drive `response.body.getReader()`
 * itself. Aborting `opts.signal` closes the socket, which aborts the Edge
 * Function's request, which aborts its upstream OpenAI call. That chain is what
 * makes "Cancel" stop token spend rather than just hide the UI.
 */
export async function openGatewayStream(
  fn: GatewayFunction | string,
  body: unknown,
  opts: { signal?: AbortSignal } = {},
): Promise<Response> {
  const url     = gatewayUrl(fn);
  const headers = await gatewayHeaders({
    'Content-Type': 'application/json',
    Accept:         'text/event-stream',
  });

  const res = await expoFetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
    signal:  opts.signal,
    // expo/fetch types as FetchRequestInit, not RequestInit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as unknown as Response;

  if (!res.ok) throw await readError(res);
  return res;
}

// ─── Multipart upload (audio transcription) ───────────────────────────────────

/**
 * Headers for FileSystem.uploadAsync. Deliberately omits Content-Type so
 * expo-file-system can set the multipart boundary itself — setting it manually
 * produces a body OpenAI silently rejects.
 */
export async function gatewayUploadHeaders(): Promise<Record<string, string>> {
  return await gatewayHeaders();
}

/** Turn a non-2xx uploadAsync result into the same GatewayError shape. */
export function parseUploadError(status: number, rawBody: string): GatewayError {
  let message = `Upload failed (HTTP ${status})`;
  let code: string | null = null;
  try {
    const body = JSON.parse(rawBody) as { error?: string; code?: string };
    if (body?.error) message = body.error;
    if (body?.code)  code    = body.code;
  } catch { /* keep the status-based message */ }
  return new GatewayError(message, status, code);
}