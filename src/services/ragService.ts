// src/services/ragService.ts
// Part 6 — RAG Pipeline: Orchestrator
//
// This module is the single entry point for the RAG pipeline.
// It coordinates:
//   1. Check if the report is already embedded
//   2. Embed on demand (with progress callback)
//   3. Retrieve the most relevant chunks for a query
//   4. Build a formatted context string for the LLM
//   5. Fallback to keyword-based context when embedding is unavailable
//
// Usage:
//   const ctx = await getRAGContext(query, report, userId, options);
//   // ctx.contextText → inject into LLM system prompt
//   // ctx.chunks      → store as metadata on the message

import { ResearchReport }               from '../types';
import {
  embedAndStoreReport,
  isReportEmbedded,
  retrieveRelevantChunks,
  RetrievedChunk,
}                                        from './vectorStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RAGContext {
  /** Relevant chunks retrieved from vector store */
  chunks: RetrievedChunk[];
  /** Pre-formatted context string to inject into the LLM system prompt */
  contextText: string;
  /** Whether the report has been embedded (false = fell back to keyword context) */
  isEmbedded: boolean;
  /** Was vector search used (true) or keyword fallback (false)? */
  usedVectorSearch: boolean;
}

export interface RAGOptions {
  /** Number of chunks to retrieve (default: 5) */
  topK?: number;
  /** Minimum similarity threshold 0–1 (default: 0.30) */
  threshold?: number;
  /** Force re-embedding even if embeddings already exist */
  forceReEmbed?: boolean;
  /** Called during embedding: (chunksProcessed, totalChunks) */
  onEmbedProgress?: (done: number, total: number) => void;
}

// ─── Main: getRAGContext ──────────────────────────────────────────────────────

/**
 * Core RAG pipeline entry point.
 *
 * Flow:
 *   1. [Embed] Check if the report has stored embeddings → embed if not
 *   2. [Retrieve] Embed the user query → cosine similarity search
 *   3. [Build] Format retrieved chunks into an LLM-ready context string
 *   4. [Fallback] If embedding or retrieval fails → use keyword context
 *
 * Always resolves (never throws) — errors fall back gracefully.
 */
export async function getRAGContext(
  query:   string,
  report:  ResearchReport,
  userId:  string,
  options: RAGOptions = {}
): Promise<RAGContext> {
  const {
    topK           = 5,
    threshold      = 0.30,
    forceReEmbed   = false,
    onEmbedProgress,
  } = options;

  // ── Step 1: Ensure embeddings exist ──────────────────────────────────────

  try {
    const alreadyEmbedded = forceReEmbed ? false : await isReportEmbedded(report.id, userId);

    if (!alreadyEmbedded) {
      await embedAndStoreReport(report, userId, onEmbedProgress);
    }
  } catch (embedErr) {
    console.warn('[RAGService] Embedding failed, using fallback context:', embedErr);
    // Fall through to keyword fallback
    const fallbackContext = buildFallbackContext(report, query);
    return {
      chunks:          [],
      contextText:     fallbackContext,
      isEmbedded:      false,
      usedVectorSearch: false,
    };
  }

  // ── Step 2: Retrieve relevant chunks ─────────────────────────────────────

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveRelevantChunks(query, report.id, userId, topK, threshold);
  } catch (retrieveErr) {
    console.warn('[RAGService] Retrieval failed, using fallback context:', retrieveErr);
    const fallbackContext = buildFallbackContext(report, query);
    return {
      chunks:           [],
      contextText:      fallbackContext,
      isEmbedded:       true,
      usedVectorSearch: false,
    };
  }

  // ── Step 3: If no chunks met the threshold → widen search ────────────────
  // Try again with a lower threshold before falling back to keyword search

  if (chunks.length === 0 && threshold > 0.15) {
    try {
      chunks = await retrieveRelevantChunks(query, report.id, userId, topK, 0.15);
    } catch {
      // ignore — fall through to fallback below
    }
  }

  // ── Step 4: Still nothing → fallback ─────────────────────────────────────

  if (chunks.length === 0) {
    const fallbackContext = buildFallbackContext(report, query);
    return {
      chunks:           [],
      contextText:      fallbackContext,
      isEmbedded:       true,
      usedVectorSearch: false,
    };
  }

  // ── Step 5: Build context text ────────────────────────────────────────────

  const contextText = buildVectorContext(chunks);

  return {
    chunks,
    contextText,
    isEmbedded:       true,
    usedVectorSearch: true,
  };
}

// ─── buildVectorContext ───────────────────────────────────────────────────────

/**
 * Format retrieved chunks into a readable context block for the LLM.
 * Sorted by descending similarity so the most relevant content comes first.
 */
function buildVectorContext(chunks: RetrievedChunk[]): string {
  const sorted = [...chunks].sort((a, b) => b.similarity - a.similarity);

  return sorted
    .map((c, i) => {
      const label     = chunkTypeLabel(c.chunkType);
      const relevance = Math.round(c.similarity * 100);
      return (
        `[CONTEXT ${i + 1} — ${label} · ${relevance}% relevance]\n` +
        c.content
      );
    })
    .join('\n\n' + '─'.repeat(60) + '\n\n');
}

function chunkTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    summary:    'Executive Summary',
    section:    'Report Section',
    finding:    'Key Findings',
    prediction: 'Future Predictions',
    statistic:  'Statistics',
    citation:   'Citations',
  };
  return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// ─── buildFallbackContext ─────────────────────────────────────────────────────

/**
 * Keyword-based context builder used when vector search is unavailable.
 * Selects the most query-relevant report content using simple string matching.
 * This guarantees the LLM always has something to work with.
 */
export function buildFallbackContext(report: ResearchReport, query: string): string {
  const q = query.toLowerCase();
  const parts: string[] = [];

  // Always include executive summary
  if (report.executiveSummary?.trim()) {
    parts.push(
      `EXECUTIVE SUMMARY:\n${report.executiveSummary.trim().slice(0, 800)}`
    );
  }

  // Key findings
  if (Array.isArray(report.keyFindings) && report.keyFindings.length > 0) {
    parts.push(
      `KEY FINDINGS:\n${report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    );
  }

  // Sections: prefer query-matched ones, fall back to first 2
  if (Array.isArray(report.sections)) {
    const matched = report.sections.filter(s =>
      (s.title ?? '').toLowerCase().includes(q) ||
      (s.content ?? '').toLowerCase().split(' ').some(word => q.includes(word) && word.length > 4)
    );
    const toInclude = matched.length > 0 ? matched.slice(0, 2) : report.sections.slice(0, 2);
    toInclude.forEach(s => {
      parts.push(`SECTION "${s.title}":\n${(s.content ?? '').slice(0, 600)}`);
    });
  }

  // Statistics for numerical queries
  const wantsStats = /\b(statistic|data|number|percent|%|figure|market size|growth|revenue)\b/.test(q);
  if (wantsStats && Array.isArray(report.statistics) && report.statistics.length > 0) {
    const statLines = report.statistics
      .slice(0, 10)
      .map(s => `• ${s.value}: ${s.context}`)
      .join('\n');
    parts.push(`STATISTICS:\n${statLines}`);
  }

  // Future predictions for forward-looking queries
  const wantsFuture = /\b(future|predict|forecast|trend|next|upcoming|outlook|2025|2026|2027|2030)\b/.test(q);
  if (wantsFuture && Array.isArray(report.futurePredictions) && report.futurePredictions.length > 0) {
    parts.push(
      `FUTURE PREDICTIONS:\n${report.futurePredictions.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    );
  }

  const DIVIDER = '\n\n' + '─'.repeat(40) + '\n\n';
  return parts.join(DIVIDER);
}

// ─── getRAGContextFast ────────────────────────────────────────────────────────

/**
 * A fast, non-embedding version of getRAGContext.
 * Returns keyword-matched fallback context immediately.
 * Use this for the first message while embedding happens in the background.
 */
export function getRAGContextFast(
  query:  string,
  report: ResearchReport
): RAGContext {
  const contextText = buildFallbackContext(report, query);
  return {
    chunks:           [],
    contextText,
    isEmbedded:       false,
    usedVectorSearch: false,
  };
}