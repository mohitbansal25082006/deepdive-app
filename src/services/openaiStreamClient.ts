// src/services/openaiStreamClient.ts
// Part 21 — Streaming OpenAI client.
//
// CRITICAL FIX: React Native's built-in `fetch` polyfill does NOT implement
// `response.body` as a ReadableStream — it always returns null/undefined.
// We MUST use `expo/fetch` (available Expo SDK 52+) which is WinterCG-compliant
// and properly supports `response.body.getReader()` on iOS and Android.
//
// Reference:
//   https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api
//   https://expo.dev/changelog/2024-11-12-sdk-52

import { fetch as expoFetch } from 'expo/fetch';
import { ChatMessage, chatCompletion } from './openaiClient';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set.');
  return key.trim();
}

export interface StreamCallbacks {
  onToken:  (token: string) => void;
  onDone:   (fullText: string) => void;
  onError:  (error: Error) => void;
  onOpen?:  () => void;
  signal?:  AbortSignal;
}

export interface StreamOptions {
  temperature?: number;
  maxTokens?:   number;
}

/**
 * Streams a chat completion from OpenAI.
 * Uses expo/fetch (Expo SDK 52+) which correctly exposes response.body
 * as a ReadableStream on iOS and Android.
 * Falls back to non-streaming chatCompletion if body is unexpectedly unavailable.
 */
export async function chatCompletionStream(
  messages:  ChatMessage[],
  callbacks: StreamCallbacks,
  options:   StreamOptions = {},
): Promise<void> {
  const apiKey = getApiKey();

  let response: Response;
  try {
    response = await expoFetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
        Accept:         'text/event-stream',
      },
      body: JSON.stringify({
        model:       MODEL,
        messages,
        stream:      true,
        temperature: options.temperature ?? 0.4,
        max_tokens:  options.maxTokens  ?? 3000,
      }),
      signal: callbacks.signal,
    // expo/fetch uses FetchRequestInit, not RequestInit — 'as any' avoids body:null incompatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  } catch (networkErr) {
    if ((networkErr as Error).name === 'AbortError') return;
    callbacks.onError(new Error(`Network error: ${String(networkErr)}`));
    return;
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json() as { error?: { message?: string } };
      errMsg = errBody?.error?.message ?? errMsg;
    } catch { /* ignore */ }
    if (response.status === 401) {
      callbacks.onError(new Error('Invalid OpenAI API key.'));
    } else if (response.status === 429) {
      callbacks.onError(new Error('OpenAI rate limit exceeded.'));
    } else {
      callbacks.onError(new Error(`OpenAI API error: ${errMsg}`));
    }
    return;
  }

  callbacks.onOpen?.();

  const reader = response.body?.getReader();

  // ── Fallback: if expo/fetch body is somehow null, simulate streaming ──────
  if (!reader) {
    console.warn('[StreamClient] response.body unavailable — using non-streaming fallback');
    try {
      const fullText = await chatCompletion(messages, {
        temperature: options.temperature,
        maxTokens:   options.maxTokens ?? 3000,
      });
      // Emit word-by-word to keep the streaming UI alive
      const words = fullText.split(' ');
      for (const word of words) {
        if (callbacks.signal?.aborted) return;
        callbacks.onToken(word + ' ');
        await new Promise(r => setTimeout(r, 8));
      }
      callbacks.onDone(fullText);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  // ── Real SSE stream parsing ───────────────────────────────────────────────
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer   = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const jsonStr = trimmed.slice('data:'.length).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            callbacks.onToken(delta);
          }
        } catch { /* malformed chunk — skip */ }
      }
    }

    // Flush remaining buffer
    const remaining = buffer.trim();
    if (remaining.startsWith('data:')) {
      const jsonStr = remaining.slice('data:'.length).trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) { fullText += delta; callbacks.onToken(delta); }
        } catch { /* ignore */ }
      }
    }

    callbacks.onDone(fullText);
  } catch (readErr) {
    if ((readErr as Error).name === 'AbortError') return;
    callbacks.onError(readErr instanceof Error ? readErr : new Error(String(readErr)));
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

/**
 * Returns a Promise<string> of the full streamed text.
 */
export function chatCompletionStreamFull(
  messages: ChatMessage[],
  options:  StreamOptions & { signal?: AbortSignal } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    chatCompletionStream(
      messages,
      {
        onToken: () => {},
        onDone:  resolve,
        onError: reject,
        signal:  options.signal,
      },
      options,
    );
  });
}