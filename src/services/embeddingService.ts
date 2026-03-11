// src/services/embeddingService.ts
// Part 6 — RAG Pipeline: OpenAI Embeddings
//
// Uses text-embedding-3-small (1536 dimensions):
//   • Fast, cost-effective (~$0.00002 / 1K tokens)
//   • Excellent semantic quality for retrieval tasks
//   • Dimensions match our pgvector column: vector(1536)
//
// Exports:
//   createEmbedding(text)       → number[]
//   createEmbeddingBatch(texts) → number[][]
//   EMBEDDING_DIM               → 1536

const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL   = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

// Maximum characters per chunk before truncation (≈ 2000 tokens)
const MAX_CHARS_PER_INPUT = 8000;

// OpenAI allows up to 2048 inputs per batch request; we use 20 for safety
const BATCH_SIZE = 20;

// ─── API Key ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set.\n' +
      'Add it to your .env file and restart with: npx expo start --clear'
    );
  }
  return key.trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenAIEmbeddingResponse {
  object: string;
  data: { object: 'embedding'; index: number; embedding: number[] }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
  error?: { message: string; type: string; code?: string };
}

// ─── Single Embedding ─────────────────────────────────────────────────────────

/**
 * Create a single embedding vector for a text string.
 * Automatically truncates text to MAX_CHARS_PER_INPUT.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  const safeText = text.trim().slice(0, MAX_CHARS_PER_INPUT);

  let response: Response;
  try {
    response = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      EMBEDDING_MODEL,
        input:      safeText,
        dimensions: EMBEDDING_DIM,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Network error reaching OpenAI embeddings API: ${String(networkErr)}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401) throw new Error('Invalid OpenAI API key. Check EXPO_PUBLIC_OPENAI_API_KEY.');
    if (response.status === 429) throw new Error('OpenAI rate limit exceeded. Please wait a moment and retry.');
    throw new Error(`Embedding API error: ${msg}`);
  }

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dimensions: got ${embedding?.length ?? 0}, expected ${EMBEDDING_DIM}`);
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
    const batch = batches[batchIdx];
    const safeBatch = batch.map(t => t.trim().slice(0, MAX_CHARS_PER_INPUT));

    // Retry up to 3 times with exponential backoff for rate-limit errors
    let attempt = 0;
    let batchData: OpenAIEmbeddingResponse | null = null;

    while (attempt < 3) {
      try {
        const apiKey = getApiKey();
        const response = await fetch(EMBEDDING_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model:      EMBEDDING_MODEL,
            input:      safeBatch,
            dimensions: EMBEDDING_DIM,
          }),
        });

        batchData = await response.json() as OpenAIEmbeddingResponse;

        if (!response.ok || batchData.error) {
          // Rate limit — wait and retry
          if (response.status === 429) {
            const waitMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            await new Promise(r => setTimeout(r, waitMs));
            attempt++;
            continue;
          }
          const msg = batchData.error?.message ?? `HTTP ${response.status}`;
          throw new Error(`Embedding batch error: ${msg}`);
        }

        break; // Success
      } catch (err) {
        if (attempt >= 2) throw err;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        attempt++;
      }
    }

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