// supabase/functions/ai-audio-gateway/index.ts
// Part 59 — OpenAI audio proxy: text-to-speech and Whisper transcription.
//
// Audio needs its own function because the two directions have awkward shapes
// that don't fit the JSON gateway:
//
//   TTS        — OpenAI returns binary audio. We base64 it and return JSON,
//                because that is exactly what the app writes to disk anyway
//                (writeAsStringAsync with EncodingType.Base64). No extra
//                conversion, no React Native ArrayBuffer quirks.
//
//   Transcribe — the client sends multipart/form-data straight from the
//                recording file via FileSystem.uploadAsync. We re-assemble the
//                form and forward it. The audio never round-trips through
//                base64, which matters for a 60-second recording.
//
// The request shape is chosen by Content-Type:
//   application/json      -> TTS
//   multipart/form-data   -> transcription
//
// Deploy:
//   supabase functions deploy ai-audio-gateway

import {
  CORS, getApiKey, invalidateApiKey, requireUser, rateLimit,
  jsonResponse, errorResponse, toErrorResponse,
} from '../_shared/keyStore.ts';

const OPENAI_TTS_URL        = 'https://api.openai.com/v1/audio/speech';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

const ALLOWED_TTS_MODELS = new Set(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']);
const ALLOWED_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse',
]);
const ALLOWED_FORMATS = new Set(['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm']);
const ALLOWED_TRANSCRIBE_MODELS = new Set([
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
]);

/** OpenAI's own cap is 4096 characters per TTS request. */
const MAX_TTS_INPUT_CHARS = 4096;
/** Whisper's cap is 25 MB. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// A 20-minute podcast is ~42 segments generated 3 at a time, so this is roomy.
const RATE_TTS        = 200;
const RATE_TRANSCRIBE = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Chunked so a multi-MB buffer doesn't blow the argument limit of fromCharCode. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

async function upstreamError(res: Response): Promise<Response> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json() as { error?: { message?: string } };
    if (body?.error?.message) detail = body.error.message;
  } catch { /* status only */ }

  if (res.status === 401 || res.status === 403) {
    console.error('[ai-audio-gateway] OpenAI rejected our key:', detail);
    return errorResponse(
      'The audio service is not configured correctly. Please contact support.',
      503,
      'provider_auth_failed',
    );
  }
  if (res.status === 429) {
    return errorResponse(
      'The audio service is busy. Please try again shortly.',
      429,
      'provider_rate_limited',
    );
  }
  return errorResponse(`Audio service error: ${detail}`, 502, 'provider_error');
}

// ─── Text to speech ───────────────────────────────────────────────────────────

async function handleTTS(req: Request, userId: string): Promise<Response> {
  rateLimit(userId, 'tts', RATE_TTS);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, 'bad_json');
  }

  const input = String(body.input ?? '').trim();
  if (!input) return errorResponse('input is required', 400);
  if (input.length > MAX_TTS_INPUT_CHARS) {
    return errorResponse(`input exceeds ${MAX_TTS_INPUT_CHARS} characters`, 400);
  }

  const model = String(body.model ?? 'tts-1');
  if (!ALLOWED_TTS_MODELS.has(model)) {
    return errorResponse(`Model not allowed: ${model}`, 400);
  }

  const voice = String(body.voice ?? 'alloy');
  if (!ALLOWED_VOICES.has(voice)) {
    return errorResponse(`Voice not allowed: ${voice}`, 400);
  }

  const format = String(body.response_format ?? 'mp3');
  if (!ALLOWED_FORMATS.has(format)) {
    return errorResponse(`Format not allowed: ${format}`, 400);
  }

  const payload: Record<string, unknown> = {
    model,
    input,
    voice,
    response_format: format,
    speed: Math.max(0.25, Math.min(4, Number(body.speed ?? 1.0) || 1.0)),
  };

  // gpt-4o-mini-tts only: per-agent vocal personality (Part 40 voice debates).
  if (typeof body.instructions === 'string' && body.instructions.trim()) {
    payload.instructions = body.instructions.slice(0, 2000);
  }

  let key = await getApiKey('openai');
  const send = (k: string) => fetch(OPENAI_TTS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k}` },
    body:    JSON.stringify(payload),
    signal:  req.signal,
  });

  let res = await send(key);
  if (res.status === 401) {
    try { await res.text(); } catch { /* ignore */ }
    invalidateApiKey('openai');
    key = await getApiKey('openai', { forceRefresh: true });
    res = await send(key);
  }

  if (!res.ok) return upstreamError(res);

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength < 100) {
    return errorResponse('The audio service returned an empty clip.', 502, 'empty_audio');
  }

  return jsonResponse({
    audio:  bytesToBase64(buffer),
    format,
    bytes:  buffer.byteLength,
  });
}

// ─── Transcription ────────────────────────────────────────────────────────────

async function handleTranscribe(req: Request, userId: string): Promise<Response> {
  rateLimit(userId, 'transcribe', RATE_TRANSCRIBE);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse('Invalid multipart body', 400, 'bad_form');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return errorResponse('file field is required', 400, 'no_file');
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return errorResponse('Recording is too large (max 25 MB).', 413, 'file_too_large');
  }
  if (file.size === 0) {
    return errorResponse('Recording is empty.', 400, 'empty_file');
  }

  const model = String(form.get('model') ?? 'whisper-1');
  if (!ALLOWED_TRANSCRIBE_MODELS.has(model)) {
    return errorResponse(`Model not allowed: ${model}`, 400);
  }

  const outbound = new FormData();
  outbound.append('file', file, file.name || 'audio.m4a');
  outbound.append('model', model);

  const language = form.get('language');
  if (typeof language === 'string' && language) outbound.append('language', language);

  const prompt = form.get('prompt');
  if (typeof prompt === 'string' && prompt) outbound.append('prompt', prompt.slice(0, 1000));

  let key = await getApiKey('openai');
  // NOTE: no Content-Type header — fetch sets the multipart boundary itself.
  const send = (k: string) => fetch(OPENAI_TRANSCRIBE_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${k}` },
    body:    outbound,
    signal:  req.signal,
  });

  let res = await send(key);
  if (res.status === 401) {
    try { await res.text(); } catch { /* ignore */ }
    invalidateApiKey('openai');
    key = await getApiKey('openai', { forceRefresh: true });
    res = await send(key);
  }

  if (!res.ok) return upstreamError(res);

  const data = await res.json() as { text?: string };
  return jsonResponse({ text: (data.text ?? '').trim() });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return errorResponse('Method not allowed', 405);

  try {
    const user        = await requireUser(req);
    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

    if (contentType.includes('multipart/form-data')) {
      return await handleTranscribe(req, user.id);
    }
    return await handleTTS(req, user.id);

  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return new Response(null, { status: 499, headers: CORS });
    }
    return toErrorResponse(err);
  }
});