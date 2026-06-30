// src/services/imageSearchService.ts
// Part 58.2 — SERPAPI → TAVILY MIGRATION
// Google Images search now uses Tavily's search API with includeImages: true

import type { OnlineImageResult } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAVILY_API_KEY = process.env.EXPO_PUBLIC_TAVILY_API_KEY ?? '';
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';

/** Max results to request per search */
const MAX_RESULTS = 40;

/** In-memory cache: query → results */
const searchCache = new Map<string, OnlineImageResult[]>();

// ─── Types ───────────────────────────────────────────────────────────────────

interface TavilyImageResult {
  url: string;
  description?: string;
}

interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
  }>;
  images?: TavilyImageResult[];
  responseTime?: number;
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Search for images online via Tavily API.
 * Tavily returns images alongside search results when includeImages: true.
 */
export async function searchOnlineImages(
  query: string,
  maxResults: number = 20,
): Promise<OnlineImageResult[]> {
  if (!query.trim()) return [];
  if (!TAVILY_API_KEY) {
    console.warn('[imageSearchService] EXPO_PUBLIC_TAVILY_API_KEY not set');
    return [];
  }

  const cacheKey = `${query.toLowerCase().trim()}:${maxResults}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query: query.trim(),
        searchDepth: 'basic',
        maxResults: Math.min(maxResults, 20),
        includeImages: true,
        includeAnswer: false,
        includeRawContent: false,
        topic: 'general',
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[imageSearchService] HTTP error:', response.status, text.slice(0, 200));
      return [];
    }

    const data: TavilySearchResponse = await response.json();

    if (!data.images || data.images.length === 0) {
      return [];
    }

    // Filter and map images
    const results: OnlineImageResult[] = data.images
      .filter(img => img.url && isValidImageUrl(img.url))
      .slice(0, maxResults)
      .map(img => ({
        url: img.url,
        thumbnailUrl: img.url, // Tavily doesn't provide separate thumbnails
        title: img.description || query,
        sourceUrl: img.url,
      }));

    searchCache.set(cacheKey, results);
    return results;

  } catch (err) {
    console.error('[imageSearchService] searchOnlineImages error:', err);
    return [];
  }
}

// ─── Suggested queries for the image picker ───────────────────────────────────

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

  if (slideTitle && slideTitle.length > 3) {
    const words = slideTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const topWords = words.slice(0, 3);
    if (topWords.length > 0) {
      base.unshift(`${topWords.join(' ')} concept illustration`);
      base.unshift(`${slideTitle} background`);
    }
  }

  if (slideLayout === 'stats' || slideLayout === 'data_driven') {
    base.unshift('data analytics dashboard', 'business metrics chart');
  } else if (slideLayout === 'quote') {
    base.unshift('inspirational minimal background', 'abstract gradient texture');
  } else if (slideLayout === 'section' || slideLayout === 'closing') {
    base.unshift('abstract gradient background', 'modern minimal wallpaper');
  } else if (slideLayout === 'content' || slideLayout === 'bullets') {
    base.unshift('office workspace flat lay', 'business concept overhead');
  }

  return [...new Set(base)].slice(0, 8);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  if (!url.startsWith('http')) return false;
  const lower = url.toLowerCase();
  if (lower.includes('favicon')) return false;
  if (lower.includes('pixel')) return false;
  if (lower.endsWith('.gif')) return false;
  return true;
}

// ─── Clear cache ──────────────────────────────────────────────────────────────

export function clearImageSearchCache(): void {
  searchCache.clear();
}