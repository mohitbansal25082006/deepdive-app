// src/services/imageSearchService.ts
// Part 30 — Online Image Search via SerpAPI (Google Images)
// ─────────────────────────────────────────────────────────────────────────────
// Uses the existing EXPO_PUBLIC_SERPAPI_KEY from .env (already used by
// researchOrchestrator for web search).
//
// Endpoint: https://serpapi.com/search.json
//   engine:    google_images
//   q:         search query
//   num:       number of results (max 100)
//   safe:      active (safe search)
//   ijn:       page offset
//
// Returns OnlineImageResult[] sorted by estimated quality (prefers larger images).
// Results are cached per-query to avoid burning API quota on repeated searches.
// ─────────────────────────────────────────────────────────────────────────────

import type { OnlineImageResult } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERPAPI_BASE  = 'https://serpapi.com/search.json';
const SERPAPI_KEY   = process.env.EXPO_PUBLIC_SERPAPI_KEY ?? '';

/** Max results to request per search */
const MAX_RESULTS = 40;

/** In-memory cache: query → results */
const searchCache = new Map<string, OnlineImageResult[]>();

// ─── Types (SerpAPI response) ─────────────────────────────────────────────────

interface SerpAPIImageResult {
  original:           string;
  original_width?:    number;
  original_height?:   number;
  thumbnail:          string;
  title?:             string;
  source?:            string;
  link?:              string;
}

interface SerpAPIResponse {
  images_results?: SerpAPIImageResult[];
  error?:          string;
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Search for images online via SerpAPI Google Images.
 *
 * @param query        Search term, e.g. "quantum computing concept"
 * @param maxResults   How many results to return (default 20, max 40)
 * @returns            Array of OnlineImageResult sorted by quality
 */
export async function searchOnlineImages(
  query:      string,
  maxResults: number = 20,
): Promise<OnlineImageResult[]> {
  if (!query.trim()) return [];
  if (!SERPAPI_KEY) {
    console.warn('[imageSearchService] EXPO_PUBLIC_SERPAPI_KEY not set');
    return [];
  }

  const cacheKey = `${query.toLowerCase().trim()}:${maxResults}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  try {
    const params = new URLSearchParams({
      engine:  'google_images',
      q:       query.trim(),
      num:     String(Math.min(maxResults * 2, MAX_RESULTS)), // fetch extra, filter
      safe:    'active',
      api_key: SERPAPI_KEY,
    });

    const url = `${SERPAPI_BASE}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[imageSearchService] HTTP error:', res.status, text.slice(0, 200));
      return [];
    }

    const data: SerpAPIResponse = await res.json();

    if (data.error) {
      console.warn('[imageSearchService] API error:', data.error);
      return [];
    }

    const raw = data.images_results ?? [];

    // Filter out results without usable URLs
    const filtered = raw.filter(
      r => r.original && r.thumbnail && isValidImageUrl(r.original),
    );

    // Sort by estimated quality: prefer images that have width/height info
    // and larger dimensions (better for slide embeds)
    const sorted = [...filtered].sort((a, b) => {
      const aScore = qualityScore(a);
      const bScore = qualityScore(b);
      return bScore - aScore;
    });

    const results: OnlineImageResult[] = sorted
      .slice(0, maxResults)
      .map(r => ({
        url:          r.original,
        thumbnailUrl: r.thumbnail,
        title:        r.title ?? query,
        width:        r.original_width,
        height:       r.original_height,
        sourceUrl:    r.link,
      }));

    searchCache.set(cacheKey, results);
    return results;

  } catch (err) {
    console.error('[imageSearchService] searchOnlineImages error:', err);
    return [];
  }
}

// ─── Suggested queries for the image picker ───────────────────────────────────

/**
 * Returns suggested search queries based on the current slide's content.
 * These are shown as chips in the online image search UI.
 */
export function getImageSuggestions(
  slideTitle?: string,
  slideLayout?: string,
): string[] {
  const base: string[] = [
    'professional business meeting',
    'technology concept abstract',
    'data visualization chart',
    'teamwork collaboration',
    'innovation future',
    'global network',
    'growth success',
    'strategy planning',
  ];

  // Add context-aware suggestions from slide title
  if (slideTitle && slideTitle.length > 3) {
    const words = slideTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const topWords = words.slice(0, 3);
    if (topWords.length > 0) {
      base.unshift(`${topWords.join(' ')} concept illustration`);
      base.unshift(`${slideTitle} background`);
    }
  }

  // Layout-specific suggestions
  if (slideLayout === 'stats' || slideLayout === 'data_driven') {
    base.unshift('data analytics dashboard', 'business metrics chart');
  } else if (slideLayout === 'quote') {
    base.unshift('inspirational minimal background', 'abstract gradient texture');
  } else if (slideLayout === 'section' || slideLayout === 'closing') {
    base.unshift('abstract gradient background', 'modern minimal wallpaper');
  } else if (slideLayout === 'content' || slideLayout === 'bullets') {
    base.unshift('office workspace flat lay', 'business concept overhead');
  }

  // Return unique suggestions, max 8
  return [...new Set(base)].slice(0, 8);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  if (!url.startsWith('http')) return false;
  // Filter out tiny icons, tracking pixels, etc.
  const lower = url.toLowerCase();
  if (lower.includes('favicon')) return false;
  if (lower.includes('pixel')) return false;
  if (lower.endsWith('.gif')) return false; // GIFs don't embed well
  return true;
}

function qualityScore(r: SerpAPIImageResult): number {
  let score = 0;
  const w = r.original_width  ?? 0;
  const h = r.original_height ?? 0;

  // Prefer landscape images (16:9 or similar) for slides
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio >= 1.2 && ratio <= 2.0) score += 30; // landscape
    if (w >= 800 && h >= 400)          score += 20; // reasonable size
    if (w >= 1200)                     score += 10; // high res bonus
  }

  // HTTPS preferred
  if (r.original.startsWith('https')) score += 5;

  // Known good image hosts
  const goodHosts = ['unsplash', 'shutterstock', 'pexels', 'istockphoto', 'getty', 'pixabay'];
  if (goodHosts.some(h => r.original.includes(h))) score += 15;

  return score;
}

// ─── Clear cache ──────────────────────────────────────────────────────────────

export function clearImageSearchCache(): void {
  searchCache.clear();
}