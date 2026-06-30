// src/services/imageSearchService.ts
// Part 58.3 — TAVILY → PEXELS MIGRATION
// Online image search for the presentation editor now uses Pexels' curated,
// royalty-free stock photo library instead of Tavily's general web search
// (which returned arbitrary, often low-quality or licensing-uncertain web
// images). Pexels photos are free for commercial use, high resolution, and
// come with proper pre-sized URLs (thumbnail → full-res) so the picker no
// longer has to fall back to a single re-used URL for both thumbnail and
// full image as it did with Tavily.

import { pexelsSearchPhotos, pexelsCuratedPhotos, hasPexelsApiKey } from './pexelsClient';
import type { PexelsPhoto } from './pexelsClient';
import type { OnlineImageResult } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

/** In-memory cache: query → results */
const searchCache = new Map<string, OnlineImageResult[]>();

// ─── Mapping helper ───────────────────────────────────────────────────────────

function mapPexelsPhoto(photo: PexelsPhoto, query: string): OnlineImageResult {
  return {
    // Full-resolution image used when the image is actually inserted/exported.
    // 'large2x' caps at 1880×1300 — sharp on slides without being excessive.
    url:          photo.src.large2x,
    // Small, fast-loading thumbnail for the picker grid.
    thumbnailUrl: photo.src.medium,
    title:        photo.alt?.trim() || query,
    width:        photo.width,
    height:       photo.height,
    sourceUrl:    photo.url,
    // Pexels requires attribution where possible — surfaced in the picker UI.
    photographer:    photo.photographer,
    photographerUrl: photo.photographer_url,
  };
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Search for presentation-ready images via the Pexels API.
 * Falls back to Pexels' curated feed if the query returns zero results,
 * so the picker is never empty for an API key that's valid but a query
 * that's too narrow/unusual.
 */
export async function searchOnlineImages(
  query: string,
  maxResults: number = 24,
): Promise<OnlineImageResult[]> {
  if (!query.trim()) return [];

  if (!hasPexelsApiKey()) {
    console.warn('[imageSearchService] EXPO_PUBLIC_PEXELS_API_KEY not set');
    return [];
  }

  const cacheKey = `${query.toLowerCase().trim()}:${maxResults}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  try {
    const photos = await pexelsSearchPhotos({
      query:   query.trim(),
      perPage: Math.min(maxResults, 80),
    });

    let results: OnlineImageResult[] = photos.map(p => mapPexelsPhoto(p, query));

    // Fallback to curated feed if the specific query had no matches
    if (results.length === 0) {
      const curated = await pexelsCuratedPhotos(1, Math.min(maxResults, 24));
      results = curated.map(p => mapPexelsPhoto(p, query));
    }

    searchCache.set(cacheKey, results);
    return results;

  } catch (err) {
    console.error('[imageSearchService] searchOnlineImages error:', err);
    return [];
  }
}

// ─── Suggested queries for the image picker ───────────────────────────────────
// Unchanged from Part 30/58.2 — these are general-purpose stock-photo search
// terms that work equally well against Pexels' library.

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

// ─── Clear cache ──────────────────────────────────────────────────────────────

export function clearImageSearchCache(): void {
  searchCache.clear();
}