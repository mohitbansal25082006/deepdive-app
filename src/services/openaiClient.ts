// src/services/openaiClient.ts
//
// ── Part 59: keys moved server-side ──────────────────────────────────────────
// The OpenAI key is GONE from this file and from the app bundle. Every call now
// goes to the `ai-gateway` Edge Function, which holds the key, checks the
// caller's session, and forwards to OpenAI.
//
// The public API is deliberately unchanged — `openaiClient`, `chatCompletion`,
// `chatCompletionJSON` and `isAbortError` keep the same signatures and the same
// behaviour, so none of the ~20 agent files needed edits. Only the transport
// underneath rawCreate() moved.
//
// ── Part 56: cost reduction (unchanged) ──────────────────────────────────────
// Defaults to the STANDARD tier (gpt-4.1-mini). Callers pass
// `model: modelFor('<feature>')` to pick nano/standard/max.
//
// ── Part 53G: AbortSignal support (unchanged, and still real) ────────────────
// The signal now travels: caller -> callGateway -> HTTP connection -> Edge
// Function req.signal -> upstream OpenAI fetch. Cancelling still stops token
// spend rather than merely hiding the UI.

import { AI_TIER, type OpenAIModel } from '../constants/aiModels';
import {
  callGateway,
  GatewayError,
  isAbortError as isGatewayAbortError,
} from './apiGateway';

// Part 56: default model is the cheap STANDARD tier, not gpt-4o.
const DEFAULT_MODEL: OpenAIModel = AI_TIER.STANDARD;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

/** Shape returned by the gateway (OpenAI's own response, passed through). */
interface GatewayChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

// ─── Abort detection ──────────────────────────────────────────────────────────

/** True if an error is an AbortError (user cancelled). */
export function isAbortError(err: unknown): boolean {
  return isGatewayAbortError(err);
}

// ─── Core call ────────────────────────────────────────────────────────────────

async function rawCreate(
  params: CreateChatCompletionParams & { jsonMode?: boolean; signal?: AbortSignal },
): Promise<CreateChatCompletionResponse> {
  // Part 53G: if already aborted before we even start, bail immediately.
  if (params.signal?.aborted) {
    const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
  }

  let data: GatewayChatResponse;

  try {
    data = await callGateway<GatewayChatResponse>(
      'ai-gateway',
      {
        op:          'chat',
        model:       params.model,
        messages:    params.messages,
        temperature: params.temperature ?? 0.3,
        max_tokens:  params.max_tokens  ?? 4096,
        json_mode:   params.jsonMode === true,
      },
      { signal: params.signal },
    );
  } catch (err) {
    // Part 53G: rethrow aborts as-is so callers can detect cancellation.
    if (isAbortError(err)) throw err;

    if (err instanceof GatewayError) {
      // These messages surface directly in the UI, so keep them human.
      if (err.isNotConfigured) {
        throw new Error(
          'The AI service is temporarily unavailable. Please try again later.',
        );
      }
      if (err.isRateLimited) {
        throw new Error('The AI service is busy right now. Please try again in a moment.');
      }
      if (err.isAuthError) {
        throw new Error('Your session has expired. Please sign out and sign back in.');
      }
      throw new Error(err.message);
    }
    throw err;
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
    model:       options.model ?? DEFAULT_MODEL,   // Part 56: no gpt-4o default
    messages,
    temperature: options.temperature,
    max_tokens:  options.maxTokens,
    jsonMode:    options.jsonMode,
    signal:      options.signal,
  });

  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from the AI service');
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
      `Failed to parse AI JSON response. Raw response: ${cleaned.slice(0, 300)}`,
    );
  }
}

/**
 * Part 57: best-effort repair for JSON that was cut off mid-output (the #1 cause
 * of "Failed to parse JSON" on long academic-paper generations).
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