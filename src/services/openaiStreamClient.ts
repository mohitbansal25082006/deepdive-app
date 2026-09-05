// src/services/openaiStreamClient.ts
//
// ── Part 59: keys moved server-side ──────────────────────────────────────────
// Streams from the `ai-gateway` Edge Function instead of OpenAI directly. The
// function sets `stream: true` upstream and returns OpenAI's SSE body
// untouched, so the parser below is byte-for-byte the same as before — the only
// change is the URL, the headers, and where the key lives.
//
// Why this still cancels properly: aborting `callbacks.signal` closes our socket
// to the Edge Function, Deno fires `req.signal` on that request, and the
// function passes that signal to its own fetch to OpenAI. The generation stops
// at the source. If you ever see tokens billed after a cancel, that chain is
// what to check.
//
// ── Part 56: cost reduction (unchanged) ──────────────────────────────────────
// Defaults to the STANDARD tier (gpt-4.1-mini). Report-section streaming is the
// highest token-volume task in the app, so this default matters most here.
//
// ── Part 21 note that still applies ──────────────────────────────────────────
// React Native's built-in `fetch` does NOT implement `response.body` as a
// ReadableStream. We use `expo/fetch` (via openGatewayStream), which does.

import { ChatMessage, chatCompletion } from './openaiClient';
import { AI_TIER, type OpenAIModel } from '../constants/aiModels';
import { openGatewayStream, GatewayError, isAbortError } from './apiGateway';

// Part 56: default streaming model is the cheap STANDARD tier, not gpt-4o.
const DEFAULT_STREAM_MODEL: OpenAIModel = AI_TIER.STANDARD;

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
  /** Part 56: per-call model. Defaults to the cheap STANDARD tier. */
  model?:       OpenAIModel;
}

/** Turn a GatewayError into the message a person should actually read. */
function friendlyError(err: GatewayError): Error {
  if (err.isNotConfigured) {
    return new Error('The AI service is temporarily unavailable. Please try again later.');
  }
  if (err.isRateLimited) {
    return new Error('The AI service is busy right now. Please try again in a moment.');
  }
  if (err.isAuthError) {
    return new Error('Your session has expired. Please sign out and sign back in.');
  }
  return new Error(err.message);
}

/**
 * Streams a chat completion through the AI gateway.
 * Falls back to the non-streaming path if the body is unexpectedly unavailable.
 */
export async function chatCompletionStream(
  messages:  ChatMessage[],
  callbacks: StreamCallbacks,
  options:   StreamOptions = {},
): Promise<void> {
  const model = options.model ?? DEFAULT_STREAM_MODEL;   // Part 56

  if (callbacks.signal?.aborted) return;

  let response: Response;
  try {
    response = await openGatewayStream(
      'ai-gateway',
      {
        op:          'chat_stream',
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens:  options.maxTokens  ?? 3000,
      },
      { signal: callbacks.signal },
    );
  } catch (err) {
    if (isAbortError(err)) return;
    if (err instanceof GatewayError) {
      callbacks.onError(friendlyError(err));
      return;
    }
    callbacks.onError(new Error(`Network error: ${String(err)}`));
    return;
  }

  callbacks.onOpen?.();

  const reader = response.body?.getReader();

  // ── Fallback: if the stream body is somehow null, simulate streaming ──────
  if (!reader) {
    console.warn('[StreamClient] response.body unavailable — using non-streaming fallback');
    try {
      const fullText = await chatCompletion(messages, {
        temperature: options.temperature,
        maxTokens:   options.maxTokens ?? 3000,
        model,                                   // Part 56: keep same cheap model
        signal:      callbacks.signal,
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
      if (isAbortError(err)) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  // ── Real SSE stream parsing (unchanged from Part 21) ──────────────────────
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
    if (isAbortError(readErr)) return;
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