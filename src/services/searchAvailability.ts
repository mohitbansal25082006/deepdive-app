// src/services/searchAvailability.ts
// Part 59.1 — NEW. Tell real Tavily results apart from the mock fallback.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Before Part 59, three agents decided whether to use web search like this:
//
//     const tavilyKey = process.env.EXPO_PUBLIC_TAVILY_API_KEY;
//     if (tavilyKey && tavilyKey !== 'your_tavily_api_key_here') { …search… }
//
// Part 59 deleted that variable. The condition became permanently false, so
// podcasts and voice debates silently stopped doing any web research — they
// still generated, just from the model's own knowledge, with `webSearchUsed`
// stuck at false and the "Searching the web…" progress line lying to the user.
//
// The obvious fix is to always call tavilySearchBatch, since tavilyClient now
// degrades to mock results instead of throwing. But that introduces a subtler
// problem: those mock results are deliberately realistic. They carry
// reuters.com, bloomberg.com and nature.com URLs, invented statistics, and
// plausible dates. Handed to a podcast agent, they become "According to Reuters,
// the market reached $47.3 billion" — a fabricated statistic with a real
// masthead attached to it. That is worse than no web research at all.
//
// The old code tried to guard against this with:
//
//     const hasReal = batches.some(b => b.results.some(r => !r.url.includes('example.com')));
//
// which never matched anything, because no mock URL contains example.com. It was
// a leftover from a much older mock set and had been a no-op since Part 58.2.
//
// So: identify the fallback set precisely, strip it, and let the agents fall
// back to report context or model knowledge rather than to invented citations.
//
// ── HOW ──────────────────────────────────────────────────────────────────────
//
// The mock set in tavilyClient.getMockResults() is eight fixed URLs. They are
// listed below. If you ever edit getMockResults(), edit this list too — the
// unit of truth is "these exact eight URLs are synthetic", and nothing else in
// the app should ever produce them.
//
// A real Tavily result colliding with one of these paths is not realistically
// possible: they are invented paths on real domains, not pages that exist.

import type { SearchBatch, SearchResult } from '../types';

/**
 * Exact URLs produced by tavilyClient.getMockResults().
 * Keep in sync with that function.
 */
const MOCK_URLS: ReadonlySet<string> = new Set([
  'https://reuters.com/research/comprehensive-analysis',
  'https://bloomberg.com/market-size-global-outlook',
  'https://statista.com/future-trends-forecast',
  'https://economist.com/challenges-opportunities',
  'https://ft.com/leading-companies',
  'https://nature.com/research/recent-findings',
  'https://ec.europa.eu/policy/regulation',
  'https://mckinsey.com/industry-report',
]);

/** True if this single result came from the mock fallback. */
export function isMockResult(result: SearchResult): boolean {
  if (!result?.url) return false;
  return MOCK_URLS.has(result.url.trim());
}

/** Drop mock results from a flat result list. */
export function stripMockResults(results: SearchResult[]): SearchResult[] {
  if (!Array.isArray(results)) return [];
  return results.filter(r => !isMockResult(r));
}

/**
 * Drop mock results from every batch, preserving batch structure (agents rely
 * on `batch.query` for progress labels and citation grouping).
 */
export function stripMockBatches(batches: SearchBatch[]): SearchBatch[] {
  if (!Array.isArray(batches)) return [];
  return batches.map(batch => ({
    ...batch,
    results: stripMockResults(batch?.results ?? []),
  }));
}

/** Total number of genuine results across all batches. */
export function countRealResults(batches: SearchBatch[]): number {
  if (!Array.isArray(batches)) return 0;
  return batches.reduce(
    (sum, b) => sum + stripMockResults(b?.results ?? []).length,
    0,
  );
}

/**
 * True if the search actually returned something worth putting in a prompt.
 *
 * The threshold is 1 rather than 0 on purpose — a single genuine source is
 * still a genuine source, and the agents already handle thin evidence by
 * lowering their confidence scores.
 */
export function hasRealResults(batches: SearchBatch[]): boolean {
  return countRealResults(batches) > 0;
}

/**
 * Convenience for the common agent pattern: search, strip, and find out in one
 * step whether the search was useful.
 *
 * Returns the cleaned batches plus a flag, so the caller can set
 * `webSearchUsed` honestly instead of guessing.
 */
export function resolveSearchBatches(batches: SearchBatch[]): {
  batches: SearchBatch[];
  usable:  boolean;
  count:   number;
} {
  const cleaned = stripMockBatches(batches);
  const count   = countRealResults(cleaned);
  return { batches: cleaned, usable: count > 0, count };
}