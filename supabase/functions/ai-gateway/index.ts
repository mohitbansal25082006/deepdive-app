// supabase/functions/ai-gateway/index.ts
// Part 59 — OpenAI text proxy. The app never sees an OpenAI key again.
//
// OPERATIONS (POST JSON, `op` field)
//   op: 'chat'        -> non-streaming chat completion. Returns OpenAI's JSON.
//   op: 'chat_stream' -> streaming chat completion. Returns raw SSE, passed
//                        straight through so the client parser is unchanged.
//   op: 'embeddings'  -> text-embedding-3-small. Returns OpenAI's JSON.
//
// CANCELLATION (this is the important one)
//   Part 53 threaded an AbortController from the hook down to the fetch so
//   "Cancel" actually stops token spend. That contract survives the proxy:
//     client aborts -> HTTP connection to this function drops
//                   -> Deno aborts `req.signal`
//                   -> we passed req.signal to the upstream fetch
//                   -> OpenAI connection closes, generation stops.
//   Removing `signal: req.signal` below silently reintroduces runaway billing
//   on every cancelled report. Don't.
//
// GUARDRAILS
//   • Caller must present a valid, non-suspended Supabase JWT.
//   • Model must be on ALLOWED_MODELS — a stolen token can't switch us to an
//     expensive model.
//   • max_tokens and input sizes are clamped server-side.
//   • On a 401 from OpenAI we assume the key was rotated: drop the cache and
//     retry exactly once with a fresh key.
//
// Deploy:
//   supabase functions deploy ai-gateway

import {
  CORS, getApiKey, invalidateApiKey, requireUser, rateLimit,
  jsonResponse, errorResponse, toErrorResponse,
} from '../_shared/keyStore.ts';

const OPENAI_CHAT_URL  = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';

/**
 * Mirrors src/constants/aiModels.ts. When you add a tier there, add it here or
 * the gateway will reject it.
 */
const ALLOWED_MODELS = new Set([
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-4o-mini',
  'gpt-4o',
]);

const ALLOWED_EMBEDDING_MODELS = new Set([
  'text-embedding-3-small',
  'text-embedding-3-large',
]);

const MAX_TOKENS_CEILING   = 8000;
const MAX_MESSAGES         = 60;
const MAX_MESSAGE_CHARS    = 120_000;   // total across all messages
const MAX_EMBED_INPUTS     = 32;
const MAX_EMBED_CHARS      = 8_000;     // per input, matches the app

// Generous ceilings — a Deep Dive report legitimately makes dozens of calls.
const RATE_CHAT   = 240;   // per user per minute
const RATE_EMBED  = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ChatMessage { role: string; content: string; }

function validateMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequest('messages must be a non-empty array');
  }
  if (raw.length > MAX_MESSAGES) {
    throw new BadRequest(`Too many messages (max ${MAX_MESSAGES})`);
  }

  let totalChars = 0;
  const out: ChatMessage[] = [];

  for (const m of raw) {
    const role    = (m?.role ?? '').toString();
    const content = (m?.content ?? '').toString();
    if (!['system', 'user', 'assistant'].includes(role)) {
      throw new BadRequest(`Invalid message role: ${role}`);
    }
    totalChars += content.length;
    if (totalChars > MAX_MESSAGE_CHARS) {
      throw new BadRequest('Prompt is too large');
    }
    out.push({ role, content });
  }
  return out;
}

function resolveModel(raw: unknown, allowed: Set<string>, fallback: string): string {
  const model = (raw ?? fallback).toString();
  if (!allowed.has(model)) {
    throw new BadRequest(`Model not allowed: ${model}`);
  }
  return model;
}

class BadRequest extends Error {
  constructor(msg: string) { super(msg); this.name = 'BadRequest'; }
}

/**
 * POST to OpenAI with the vault key. On 401, refresh the key once and retry —
 * this is what makes a dashboard rotation take effect immediately instead of
 * after the 60s cache TTL expires.
 */
async function openaiFetch(
  url: string,
  payload: unknown,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  let key = await getApiKey('openai');

  const send = (k: string) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${k}`,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    signal,
  });

  let res = await send(key);

  if (res.status === 401) {
    // Drain the failed body so the connection can be reused.
    try { await res.text(); } catch { /* ignore */ }
    invalidateApiKey('openai');
    key = await getApiKey('openai', { forceRefresh: true });
    res = await send(key);
  }

  return res;
}

/** Never echo an upstream body that might quote the key back at us. */
async function upstreamError(res: Response): Promise<Response> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json() as { error?: { message?: string } };
    if (body?.error?.message) detail = body.error.message;
  } catch { /* keep the status-only message */ }

  if (res.status === 401 || res.status === 403) {
    console.error('[ai-gateway] OpenAI rejected our key:', detail);
    return errorResponse(
      'The AI service is not configured correctly. Please contact support.',
      503,
      'provider_auth_failed',
    );
  }
  if (res.status === 429) {
    return errorResponse(
      'The AI service is busy right now. Please try again in a moment.',
      429,
      'provider_rate_limited',
    );
  }
  return errorResponse(`AI service error: ${detail}`, 502, 'provider_error');
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return errorResponse('Method not allowed', 405);

  try {
    const user = await requireUser(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, 'bad_json');
    }

    const op = (body.op ?? '').toString();

    // ── Embeddings ──────────────────────────────────────────────────────────
    if (op === 'embeddings') {
      rateLimit(user.id, 'embed', RATE_EMBED);

      const model = resolveModel(body.model, ALLOWED_EMBEDDING_MODELS, 'text-embedding-3-small');
      const rawInput = body.input;

      let input: string | string[];
      if (Array.isArray(rawInput)) {
        if (rawInput.length === 0) return errorResponse('input is empty', 400);
        if (rawInput.length > MAX_EMBED_INPUTS) {
          return errorResponse(`Too many inputs (max ${MAX_EMBED_INPUTS})`, 400);
        }
        input = rawInput.map((t) => String(t).slice(0, MAX_EMBED_CHARS));
      } else {
        input = String(rawInput ?? '').slice(0, MAX_EMBED_CHARS);
        if (!input.trim()) return errorResponse('input is empty', 400);
      }

      const payload: Record<string, unknown> = { model, input };
      if (typeof body.dimensions === 'number') payload.dimensions = body.dimensions;

      const res = await openaiFetch(OPENAI_EMBED_URL, payload, req.signal);
      if (!res.ok) return upstreamError(res);

      return jsonResponse(await res.json());
    }

    // ── Chat (streaming and not) ────────────────────────────────────────────
    if (op === 'chat' || op === 'chat_stream') {
      rateLimit(user.id, 'chat', RATE_CHAT);

      const messages = validateMessages(body.messages);
      const model    = resolveModel(body.model, ALLOWED_MODELS, 'gpt-4.1-mini');

      const payload: Record<string, unknown> = {
        model,
        messages,
        temperature: typeof body.temperature === 'number'
          ? Math.max(0, Math.min(2, body.temperature))
          : 0.3,
        max_tokens: Math.max(
          1,
          Math.min(MAX_TOKENS_CEILING, Number(body.max_tokens ?? 4096) || 4096),
        ),
      };

      if (body.json_mode === true) {
        payload.response_format = { type: 'json_object' };
      }

      // ── Non-streaming ─────────────────────────────────────────────────────
      if (op === 'chat') {
        const res = await openaiFetch(OPENAI_CHAT_URL, payload, req.signal);
        if (!res.ok) return upstreamError(res);
        return jsonResponse(await res.json());
      }

      // ── Streaming: pass the SSE body straight through ──────────────────────
      payload.stream = true;

      const res = await openaiFetch(
        OPENAI_CHAT_URL,
        payload,
        req.signal,
        { Accept: 'text/event-stream' },
      );

      if (!res.ok || !res.body) {
        return upstreamError(res);
      }

      // res.body is a ReadableStream. Handing it to Response streams it to the
      // client chunk by chunk — no buffering, so the typewriter UI still works.
      return new Response(res.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type':      'text/event-stream; charset=utf-8',
          'Cache-Control':     'no-cache, no-transform',
          'Connection':        'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    return errorResponse(`Unknown op: ${op || '(missing)'}`, 400, 'unknown_op');

  } catch (err) {
    if (err instanceof BadRequest) {
      return errorResponse(err.message, 400, 'bad_request');
    }
    // A client disconnect mid-stream surfaces as an AbortError. That's a normal
    // cancellation, not a fault — don't log it as one.
    if ((err as { name?: string })?.name === 'AbortError') {
      return new Response(null, { status: 499, headers: CORS });
    }
    return toErrorResponse(err);
  }
});