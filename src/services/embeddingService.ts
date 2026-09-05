// src/services/embeddingService.ts
// Part 6 — RAG Pipeline: OpenAI Embeddings
// Part 59 — Routed through the `ai-gateway` Edge Function. No key in the app.
//
// Uses text-embedding-3-small (1536 dimensions):
//   • Fast, cost-effective (~$0.00002 / 1K tokens)
//   • Excellent semantic quality for retrieval tasks
//   • Dimensions match our pgvector column: vector(1536)
//
// One behaviour change worth knowing: the batch size dropped from 20 to 16.
// The gateway caps a request at 32 inputs, and 16 keeps each request small
// enough to stay well inside the Edge Function response budget while still
// embedding a full report in one or two round trips.
//
// Exports (unchanged):
//   createEmbedding(text)       → number[]
//   createEmbeddingBatch(texts) → number[][]
//   EMBEDDING_DIM               → 1536

import { callGateway, GatewayError, isAbortError } from './apiGateway';

const EMBEDDING_MODEL   = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

// Maximum characters per chunk before truncation (≈ 2000 tokens)
const MAX_CHARS_PER_INPUT = 8000;

// Part 59: 16 per request (gateway ceiling is 32).
const BATCH_SIZE = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbeddingResponse {
  data?: { object?: string; index: number; embedding: number[] }[];
  model?: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapError(err: unknown, context: string): Error {
  if (err instanceof GatewayError) {
    if (err.isNotConfigured) {
      return new Error('The AI service is temporarily unavailable. Please try again later.');
    }
    if (err.isRateLimited) {
      return new Error('Rate limit reached. Please wait a moment and retry.');
    }
    if (err.isAuthError) {
      return new Error('Your session has expired. Please sign out and sign back in.');
    }
    return new Error(`${context}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(`${context}: ${String(err)}`);
}

/** True when retrying could plausibly succeed. */
function isRetryable(err: unknown): boolean {
  if (err instanceof GatewayError) {
    return err.isRateLimited || err.status >= 500 || err.status === 0;
  }
  return false;
}

// ─── Single Embedding ─────────────────────────────────────────────────────────

/**
 * Create a single embedding vector for a text string.
 * Automatically truncates text to MAX_CHARS_PER_INPUT.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const safeText = text.trim().slice(0, MAX_CHARS_PER_INPUT);
  if (!safeText) throw new Error('Cannot embed empty text');

  let data: EmbeddingResponse;
  try {
    data = await callGateway<EmbeddingResponse>('ai-gateway', {
      op:         'embeddings',
      model:      EMBEDDING_MODEL,
      input:      safeText,
      dimensions: EMBEDDING_DIM,
    });
  } catch (err) {
    throw mapError(err, 'Embedding request failed');
  }

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding dimensions: got ${embedding?.length ?? 0}, expected ${EMBEDDING_DIM}`,
    );
  }

  return embedding;
}

// ─── Batch Embedding ─────────────────────────────────────────────────────────

/**
 * Create embeddings for multiple texts efficiently.
 * Automatically splits into batches of BATCH_SIZE and handles rate-limit
 * retries with exponential backoff.
 *
 * Returns embeddings in the SAME ORDER as the input array.
 */
export async function createEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const allEmbeddings: number[][] = new Array(texts.length);
  let globalIndex = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const safeBatch = batches[batchIdx].map(t => t.trim().slice(0, MAX_CHARS_PER_INPUT));

    // Retry up to 3 times with exponential backoff for transient errors
    let attempt = 0;
    let batchData: EmbeddingResponse | null = null;
    let lastError: unknown = null;

    while (attempt < 3) {
      try {
        batchData = await callGateway<EmbeddingResponse>('ai-gateway', {
          op:         'embeddings',
          model:      EMBEDDING_MODEL,
          input:      safeBatch,
          dimensions: EMBEDDING_DIM,
        });
        lastError = null;
        break; // Success
      } catch (err) {
        lastError = err;
        if (isAbortError(err)) throw err;

        // A non-retryable error (bad request, auth) fails immediately —
        // burning three attempts on it just delays the inevitable.
        if (!isRetryable(err) || attempt >= 2) {
          throw mapError(err, `Embedding batch ${batchIdx + 1} failed`);
        }

        const waitMs = Math.pow(2, attempt) * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
      }
    }

    if (lastError) throw mapError(lastError, `Embedding batch ${batchIdx + 1} failed`);
    if (!batchData?.data) {
      throw new Error(`Embedding batch ${batchIdx + 1} returned no data`);
    }

    // OpenAI may return results in any order — sort by index
    const sorted = [...batchData.data].sort((a, b) => a.index - b.index);

    for (const item of sorted) {
      if (!item.embedding || item.embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Embedding at index ${item.index} has wrong dimensions`);
      }
      allEmbeddings[globalIndex++] = item.embedding;
    }

    // Small delay between batches to stay within rate limits
    if (batchIdx < batches.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return allEmbeddings;
}

// ─── Cosine Similarity (client-side fallback) ─────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Used as a local fallback when pgvector is unavailable.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Utility: Format for pgvector ────────────────────────────────────────────

/**
 * Convert a number[] to the pgvector text literal format: '[0.1,0.2,...]'
 * Required when inserting via supabase-js INSERT (not RPC).
 */
export function toPgVector(embedding: number[]): string {
  return '[' + embedding.join(',') + ']';
}