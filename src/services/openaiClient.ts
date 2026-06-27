// src/services/openaiClient.ts
// FIXED: Reads EXPO_PUBLIC_OPENAI_API_KEY (required for Expo client bundle).
//
// ── Part 56: Cost reduction ───────────────────────────────────────────────────
// The hardcoded `MODEL = 'gpt-4o'` default is GONE. chatCompletion /
// chatCompletionJSON now accept an optional `model` and default to the central
// STANDARD tier (gpt-4.1-mini, ~6x cheaper than gpt-4o). Callers that want
// nano/standard/max pass `model: modelFor('<feature>')`. Nothing in the app
// hits gpt-4o anymore unless explicitly asked.
//
// ── Part 53G: AbortSignal support ────────────────────────────────────────────
// rawCreate/chatCompletion/chatCompletionJSON accept an optional AbortSignal.
// When the caller aborts (user cancels generation), the in-flight fetch is
// cancelled so NO further tokens are spent and the request stops immediately.

import { AI_TIER, type OpenAIModel } from '../constants/aiModels';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Part 56: default model is now the cheap STANDARD tier, not gpt-4o.
// Any call that doesn't pass a model gets gpt-4.1-mini.
const DEFAULT_MODEL: OpenAIModel = AI_TIER.STANDARD;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  error?: { message: string; type: string };
}

// ─── Shim types mirroring the OpenAI SDK surface used in the app ─────────────

interface CreateChatCompletionParams {
  model:        string;
  max_tokens?:  number;
  temperature?: number;
  messages:     ChatMessage[];
}

interface CreateChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
      role:    string;
    };
  }>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set.\n' +
      'Add it to your .env file and restart with: npx expo start --clear'
    );
  }
  return key.trim();
}

/** True if an error is an AbortError (user cancelled). */
export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

async function rawCreate(
  params: CreateChatCompletionParams & { jsonMode?: boolean; signal?: AbortSignal },
): Promise<CreateChatCompletionResponse> {
  const apiKey = getApiKey();

  // Part 53G: if already aborted before we even start, bail immediately.
  if (params.signal?.aborted) {
    const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
  }

  const body: Record<string, unknown> = {
    model:       params.model,
    messages:    params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens:  params.max_tokens  ?? 4096,
  };

  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      // Part 53G: pass the abort signal so cancel kills the request.
      signal: params.signal,
    });
  } catch (networkErr) {
    // Part 53G: rethrow aborts as-is so callers can detect cancellation.
    if (isAbortError(networkErr)) throw networkErr;
    throw new Error(`Network error reaching OpenAI: ${String(networkErr)}`);
  }

  const data: OpenAIResponse = await response.json();

  if (!response.ok || data.error) {
    const errMsg = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new Error('Invalid OpenAI API key. Check EXPO_PUBLIC_OPENAI_API_KEY in your .env file.');
    }
    if (response.status === 429) {
      throw new Error('OpenAI rate limit or quota exceeded. Check your OpenAI billing at platform.openai.com.');
    }
    throw new Error(`OpenAI API error: ${errMsg}`);
  }

  return {
    choices: (data.choices ?? []).map(c => ({
      message: {
        content: c.message?.content ?? null,
        role:    'assistant',
      },
    })),
  };
}

// ─── Named export: openaiClient shim ─────────────────────────────────────────

export const openaiClient = {
  chat: {
    completions: {
      create: (
        params: CreateChatCompletionParams & { signal?: AbortSignal },
      ): Promise<CreateChatCompletionResponse> =>
        rawCreate(params),
    },
  },
} as const;

// ─── Named exports: functional helpers ────────────────────────────────────────

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?:   number;
  jsonMode?:    boolean;
  signal?:      AbortSignal;
  /** Part 56: per-call model. Defaults to the cheap STANDARD tier. */
  model?:       OpenAIModel;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const result = await rawCreate({
    model:       options.model ?? DEFAULT_MODEL,   // ← Part 56: no more gpt-4o default
    messages,
    temperature: options.temperature,
    max_tokens:  options.maxTokens,
    jsonMode:    options.jsonMode,
    signal:      options.signal,
  });

  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}

export async function chatCompletionJSON<T>(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: OpenAIModel } = {},
): Promise<T> {
  const raw = await chatCompletion(messages, { ...options, jsonMode: true });

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i,    '')
    .replace(/\s*```$/i,    '')
    .trim();

  // First attempt: parse as-is.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Part 57: large generations (e.g. academic papers) can get truncated at
    // max_tokens, producing valid-but-incomplete JSON. Try to repair it by
    // closing any unterminated string and balancing open braces/brackets, then
    // re-parse. Only if that also fails do we throw.
    const repaired = repairTruncatedJSON(cleaned);
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        /* fall through to error */
      }
    }
    throw new Error(
      `Failed to parse OpenAI JSON. Raw response: ${cleaned.slice(0, 300)}`,
    );
  }
}

/**
 * Part 57: best-effort repair for JSON that was cut off mid-output (the #1 cause
 * of "Failed to parse OpenAI JSON" on long academic-paper generations).
 *
 * Strategy: walk the string tracking string/escape state and the stack of open
 * `{`/`[`. Drop any trailing partial token, close an unterminated string, remove
 * a dangling comma, then append the missing closers in reverse order. This won't
 * recover lost content, but it turns a truncated-but-otherwise-valid object into
 * parseable JSON so the caller gets the sections that *did* complete.
 */
function repairTruncatedJSON(input: string): string | null {
  if (!input || (input[0] !== '{' && input[0] !== '[')) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafeIndex = -1; // index just after the last balanced value boundary

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        lastSafeIndex = i;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      lastSafeIndex = i;
    } else if (ch === ',' || /\s/.test(ch) || ch === ':') {
      // structural — nothing to do
    } else {
      // part of a number / literal (true/false/null)
      lastSafeIndex = i;
    }
  }

  // If we ended inside a string, cut back to the last clean boundary so we don't
  // leave a half-written key/value, then close structures from there.
  let body: string;
  if (inString) {
    if (lastSafeIndex < 0) return null;
    body = input.slice(0, lastSafeIndex + 1);
    // Recompute the open-structure stack for the trimmed body.
    return closeStructures(body);
  }

  // Not in a string: strip a trailing comma or partial token after lastSafeIndex.
  body = lastSafeIndex >= 0 ? input.slice(0, lastSafeIndex + 1) : input;
  return closeStructures(body);
}

/** Recompute open braces/brackets for `body` and append the needed closers. */
function closeStructures(body: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Remove a dangling comma at the very end (", " or ",").
  let trimmed = body.replace(/,\s*$/, '');
  if (inString) trimmed += '"';
  while (stack.length) trimmed += stack.pop();

  return trimmed;
}