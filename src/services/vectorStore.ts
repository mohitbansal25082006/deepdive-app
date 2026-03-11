// src/services/vectorStore.ts
// Part 6 — RAG Pipeline: Vector Storage & Retrieval
//
// Responsibilities:
//   1. chunkReport()              — split a ResearchReport into semantic chunks
//   2. embedAndStoreReport()      — batch-embed all chunks & save to Supabase
//   3. isReportEmbedded()         — check if a report already has embeddings
//   4. retrieveRelevantChunks()   — cosine similarity search via Supabase RPC
//   5. getEmbeddingStats()        — debug info about stored embeddings

import { supabase }            from '../lib/supabase';
import { ResearchReport }      from '../types';
import { createEmbeddingBatch, createEmbedding, toPgVector } from './embeddingService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChunkType =
  | 'summary'
  | 'section'
  | 'finding'
  | 'prediction'
  | 'statistic'
  | 'citation';

export interface EmbeddingChunk {
  chunkId:   string;
  chunkType: ChunkType;
  content:   string;
  metadata:  Record<string, unknown>;
}

export interface RetrievedChunk {
  id:         string;
  chunkId:    string;
  chunkType:  string;
  content:    string;
  metadata:   Record<string, unknown>;
  similarity: number;
}

export interface EmbeddingStats {
  totalChunks: number;
  chunkTypes:  Record<string, number>;
  embeddedAt:  string | null;
}

// ─── 1. chunkReport ───────────────────────────────────────────────────────────

/**
 * Split a ResearchReport into meaningful, self-contained text chunks
 * suitable for embedding. Each chunk represents one semantic unit.
 *
 * Chunk strategy:
 *   • Executive Summary  → 1 chunk  (summary type)
 *   • Each Section       → 1 chunk  (section type)  — title + content + bullets
 *   • Key Findings       → 1 chunk  (finding type)  — all findings together
 *   • Future Predictions → 1 chunk  (prediction type)
 *   • Statistics         → 1 chunk  (statistic type) — top 20
 *
 * We keep related content together (not sentence-split) so the LLM gets
 * full, meaningful context rather than fragmented snippets.
 */
export function chunkReport(report: ResearchReport): EmbeddingChunk[] {
  const chunks: EmbeddingChunk[] = [];

  // ── Executive Summary ────────────────────────────────────────────────────
  if (report.executiveSummary?.trim()) {
    chunks.push({
      chunkId:   'summary',
      chunkType: 'summary',
      content:   `EXECUTIVE SUMMARY — ${report.title}\n\n${report.executiveSummary.trim()}`,
      metadata:  { reportTitle: report.title, query: report.query },
    });
  }

  // ── Report Sections ──────────────────────────────────────────────────────
  if (Array.isArray(report.sections)) {
    report.sections.forEach((section, idx) => {
      if (!section) return;

      const parts: string[] = [`SECTION: ${section.title ?? 'Untitled'}`];

      if (section.content?.trim()) {
        parts.push(section.content.trim());
      }

      if (Array.isArray(section.bullets) && section.bullets.length > 0) {
        parts.push(
          'Key points:\n' +
          section.bullets.map(b => `• ${b}`).join('\n')
        );
      }

      // Include inline statistics from the section
      if (Array.isArray(section.statistics) && section.statistics.length > 0) {
        const stats = section.statistics
          .slice(0, 5)
          .map(s => `• ${s.value}: ${s.context}`)
          .join('\n');
        parts.push(`Section statistics:\n${stats}`);
      }

      const content = parts.join('\n\n');
      if (content.length < 30) return; // skip empty/stub sections

      chunks.push({
        chunkId:   `section:${section.id ?? idx}`,
        chunkType: 'section',
        content,
        metadata: {
          sectionId:    section.id ?? String(idx),
          sectionTitle: section.title ?? 'Untitled',
          sectionIndex: idx,
        },
      });
    });
  }

  // ── Key Findings ─────────────────────────────────────────────────────────
  if (Array.isArray(report.keyFindings) && report.keyFindings.length > 0) {
    chunks.push({
      chunkId:   'findings',
      chunkType: 'finding',
      content:   'KEY FINDINGS:\n' +
                 report.keyFindings
                   .map((f, i) => `${i + 1}. ${f}`)
                   .join('\n'),
      metadata:  { count: report.keyFindings.length },
    });
  }

  // ── Future Predictions ───────────────────────────────────────────────────
  if (Array.isArray(report.futurePredictions) && report.futurePredictions.length > 0) {
    chunks.push({
      chunkId:   'predictions',
      chunkType: 'prediction',
      content:   'FUTURE PREDICTIONS:\n' +
                 report.futurePredictions
                   .map((p, i) => `${i + 1}. ${p}`)
                   .join('\n'),
      metadata:  { count: report.futurePredictions.length },
    });
  }

  // ── Statistics ────────────────────────────────────────────────────────────
  if (Array.isArray(report.statistics) && report.statistics.length > 0) {
    const statLines = report.statistics
      .slice(0, 20)
      .map(s => `• ${s.value}: ${s.context} (${s.source})`)
      .join('\n');
    chunks.push({
      chunkId:   'statistics',
      chunkType: 'statistic',
      content:   `KEY STATISTICS — ${report.title}:\n${statLines}`,
      metadata:  { count: report.statistics.length },
    });
  }

  return chunks;
}

// ─── 2. embedAndStoreReport ───────────────────────────────────────────────────

/**
 * Embed all chunks for a report and persist them to Supabase pgvector.
 *
 * Process:
 *   1. Delete any existing embeddings for the report (idempotent)
 *   2. Chunk the report
 *   3. Batch-embed all chunk texts via OpenAI
 *   4. Insert rows into report_embeddings in groups of 10
 *
 * @param onProgress  Optional callback: (chunksStored, totalChunks)
 */
export async function embedAndStoreReport(
  report:      ResearchReport,
  userId:      string,
  onProgress?: (done: number, total: number) => void
): Promise<{ chunksStored: number }> {

  const chunks = chunkReport(report);
  if (chunks.length === 0) {
    console.warn('[VectorStore] No chunks generated from report:', report.id);
    return { chunksStored: 0 };
  }

  // Step 1: Clear any stale embeddings for this report
  const { error: deleteError } = await supabase
    .from('report_embeddings')
    .delete()
    .eq('report_id', report.id)
    .eq('user_id', userId);

  if (deleteError) {
    console.warn('[VectorStore] Could not clear old embeddings:', deleteError.message);
    // Non-fatal — continue with insert
  }

  onProgress?.(0, chunks.length);

  // Step 2: Batch-embed all chunk texts
  const texts = chunks.map(c => c.content);
  let embeddings: number[][];
  try {
    embeddings = await createEmbeddingBatch(texts);
  } catch (err) {
    throw new Error(
      `Failed to embed report chunks: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`
    );
  }

  // Step 3: Insert in batches of 10
  const INSERT_BATCH = 10;
  let stored = 0;

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const chunkBatch     = chunks.slice(i, i + INSERT_BATCH);
    const embeddingBatch = embeddings.slice(i, i + INSERT_BATCH);

    const rows = chunkBatch.map((chunk, idx) => ({
      report_id:  report.id,
      user_id:    userId,
      chunk_id:   chunk.chunkId,
      chunk_type: chunk.chunkType,
      content:    chunk.content,
      // pgvector text literal format: '[0.1, 0.2, ...]'
      embedding:  toPgVector(embeddingBatch[idx]),
      metadata:   chunk.metadata,
    }));

    const { error: insertError } = await supabase
      .from('report_embeddings')
      .insert(rows);

    if (insertError) {
      throw new Error(
        `Failed to store embedding batch ${Math.floor(i / INSERT_BATCH) + 1}: ${insertError.message}`
      );
    }

    stored += chunkBatch.length;
    onProgress?.(stored, chunks.length);
  }

  console.log(`[VectorStore] Stored ${stored} chunks for report ${report.id}`);
  return { chunksStored: stored };
}

// ─── 3. isReportEmbedded ──────────────────────────────────────────────────────

/**
 * Check if a report already has embeddings stored in Supabase.
 * Uses an RPC function to avoid a full table scan.
 */
export async function isReportEmbedded(
  reportId: string,
  userId:   string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_report_embedded', {
      p_report_id: reportId,
      p_user_id:   userId,
    });
    if (error) {
      console.warn('[VectorStore] isReportEmbedded RPC error:', error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn('[VectorStore] isReportEmbedded failed:', err);
    return false;
  }
}

// ─── 4. retrieveRelevantChunks ────────────────────────────────────────────────

/**
 * Semantic search: embed a query and find the most similar report chunks.
 *
 * @param query      The user's question (will be embedded on-the-fly)
 * @param reportId   Which report to search within
 * @param userId     For RLS enforcement
 * @param topK       How many chunks to return (default 5)
 * @param threshold  Minimum cosine similarity 0–1 (default 0.30)
 */
export async function retrieveRelevantChunks(
  query:     string,
  reportId:  string,
  userId:    string,
  topK:      number = 5,
  threshold: number = 0.30
): Promise<RetrievedChunk[]> {

  // Embed the user's query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await createEmbedding(query);
  } catch (err) {
    throw new Error(
      `Failed to embed query: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Call the pgvector similarity search RPC
  const { data, error } = await supabase.rpc('match_report_chunks', {
    query_embedding: queryEmbedding, // supabase-js passes float[] to vector param
    p_report_id:     reportId,
    p_user_id:       userId,
    match_count:     topK,
    match_threshold: threshold,
  });

  if (error) {
    throw new Error(`Vector similarity search failed: ${error.message}`);
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  return (data as any[]).map(row => ({
    id:         row.id         as string,
    chunkId:    row.chunk_id   as string,
    chunkType:  row.chunk_type as string,
    content:    row.content    as string,
    metadata:   (row.metadata  as Record<string, unknown>) ?? {},
    similarity: Number(row.similarity),
  }));
}

// ─── 5. getEmbeddingStats ─────────────────────────────────────────────────────

/**
 * Return metadata about the stored embeddings for a report.
 * Useful for debug / UI badges showing "RAG ready".
 */
export async function getEmbeddingStats(
  reportId: string,
  userId:   string
): Promise<EmbeddingStats | null> {
  try {
    const { data, error } = await supabase.rpc('get_report_embedding_stats', {
      p_report_id: reportId,
      p_user_id:   userId,
    });

    if (error || !data || data.length === 0) return null;

    const row = data[0];
    return {
      totalChunks: Number(row.total_chunks ?? 0),
      chunkTypes:  (row.chunk_types as Record<string, number>) ?? {},
      embeddedAt:  row.embedded_at as string | null,
    };
  } catch {
    return null;
  }
}

// ─── 6. deleteEmbeddings ──────────────────────────────────────────────────────

/**
 * Remove all stored embeddings for a report (e.g. to force re-embedding
 * after a report is edited or enriched).
 */
export async function deleteEmbeddings(
  reportId: string,
  userId:   string
): Promise<void> {
  const { error } = await supabase.rpc('delete_report_embeddings', {
    p_report_id: reportId,
    p_user_id:   userId,
  });
  if (error) {
    console.warn('[VectorStore] deleteEmbeddings RPC error:', error.message);
  }
}