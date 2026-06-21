// src/services/openaiClient.ts
// FIXED: Reads EXPO_PUBLIC_OPENAI_API_KEY (required for Expo client bundle).
//
// ── Part 53G: AbortSignal support ────────────────────────────────────────────
// rawCreate/chatCompletion/chatCompletionJSON now accept an optional
// AbortSignal. When the caller aborts (user cancels generation), the in-flight
// fetch is cancelled so NO further tokens are spent and the request stops
// immediately. AbortError is swallowed and surfaced as a lightweight
// 'AbortError' so callers can detect cancellation and bail out of their loops.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

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
  model:       string;
  max_tokens?: number;
  temperature?: number;
  messages:    ChatMessage[];
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

export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?:   number;
    jsonMode?:    boolean;
    signal?:      AbortSignal;   // ← Part 53G
  } = {},
): Promise<string> {
  const result = await rawCreate({
    model:       MODEL,
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
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const raw = await chatCompletion(messages, { ...options, jsonMode: true });

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i,    '')
    .replace(/\s*```$/i,    '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse OpenAI JSON. Raw response: ${cleaned.slice(0, 300)}`,
    );
  }
}