// src/services/imageSearchService.ts
// Part 58.5 — ONLINE IMAGE INSERT FIX
//   1. `mediumUrl` (Pexels `src.large`) is mapped through, giving the renderer a
//      three-rung fallback chain: large2x → large → medium. Previously a failed
//      large2x fetch left the block blank on the canvas.
//   2. Results are requested with `orientation: 'landscape'` by default, since
//      the slide canvas is 16:9 — portrait photos inserted at the default 90%
//      width could not fit vertically and were clipped away.
//   3. `searchOnlineImages` returns dimension data unconditionally, so the
//      inserter can always compute a real aspect ratio (an undefined ratio
//      produced NaN heights and an invisible image).
//
// Part 59 — ONE LINE CHANGED: `hasPexelsApiKey()` is now async, because the key
//   moved to the server and availability is answered by an RPC rather than by
//   reading process.env. Everything else in this file is untouched — the Pexels
//   response shape is identical through the gateway, so mapPexelsPhoto and the
//   whole fallback chain still work exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import { pexelsSearchPhotos, pexelsCuratedPhotos, hasPexelsApiKey } from './pexelsClient';
import type { PexelsPhoto, PexelsOrientation } from './pexelsClient';
import type { OnlineImageResult } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

/** In-memory cache: query → results */
const searchCache = new Map<string, OnlineImageResult[]>();

// ─── Mapping helper ───────────────────────────────────────────────────────────

function mapPexelsPhoto(photo: PexelsPhoto, query: string): OnlineImageResult {
  const src = photo.src ?? ({} as PexelsPhoto['src']);

  // Every rung of the chain falls back to the next non-empty URL so a photo
  // with an unusual `src` payload still yields something renderable.
  const full   = src.large2x || src.large  || src.original || src.medium || '';
  const medium = src.large   || src.medium || full;
  const thumb  = src.medium  || src.small  || src.tiny     || full;

  return {
    // Full-resolution image used when the image is inserted / exported.
    // 'large2x' caps at 1880×1300 — sharp on slides without being excessive.
    url:          full,
    // Small, fast-loading thumbnail for the picker grid and last-resort render.
    thumbnailUrl: thumb,
    // Part 58.5 — first render fallback if the full-res asset fails.
    mediumUrl:    medium,
    title:        photo.alt?.trim() || query,
    width:        photo.width,
    height:       photo.height,
    sourceUrl:    photo.url,
    // Pexels asks for attribution where possible — surfaced in the picker UI.
    photographer:    photo.photographer,
    photographerUrl: photo.photographer_url,
  };
}

/** Drop any result that has no usable URL — those render as blank blocks. */
function isRenderable(r: OnlineImageResult): boolean {
  return typeof r.url === 'string' && r.url.startsWith('http');
}

// ─── Main search function ─────────────────────────────────────────────────────

export interface SearchOnlineImagesOptions {
  /**
   * Slides are 16:9, so landscape photos are the sensible default. Pass
   * `undefined` to search every orientation.
   */
  orientation?: PexelsOrientation;
}

/**
 * Search for presentation-ready images via the Pexels API.
 *
 * Falls back twice: first to an unfiltered search (in case the landscape filter
 * was too strict for a narrow query), then to the curated feed. The picker is
 * therefore never empty for a configured project.
 */
export async function searchOnlineImages(
  query: string,
  maxResults: number = 24,
  options: SearchOnlineImagesOptions = { orientation: 'landscape' },
): Promise<OnlineImageResult[]> {
  if (!query.trim()) return [];

  // Part 59: now an await — availability is a server fact, not an env var.
  if (!(await hasPexelsApiKey())) {
    console.warn('[imageSearchService] Pexels is not configured on the server');
    return [];
  }

  const orientation = options.orientation;
  const cacheKey    = `${query.toLowerCase().trim()}:${maxResults}:${orientation ?? 'any'}`;

  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  try {
    const perPage = Math.min(maxResults, 80);

    let photos = await pexelsSearchPhotos({
      query: query.trim(),
      perPage,
      orientation,
    });

    // Retry without the orientation filter before giving up on the query
    if (photos.length === 0 && orientation) {
      photos = await pexelsSearchPhotos({ query: query.trim(), perPage });
    }

    let results = photos.map(p => mapPexelsPhoto(p, query)).filter(isRenderable);

    // Final fallback: curated feed, so the grid is never empty
    if (results.length === 0) {
      const curated = await pexelsCuratedPhotos(1, Math.min(maxResults, 24));
      results = curated.map(p => mapPexelsPhoto(p, query)).filter(isRenderable);
    }

    searchCache.set(cacheKey, results);
    return results;

  } catch (err) {
    console.error('[imageSearchService] searchOnlineImages error:', err);
    return [];
  }
}

// ─── Suggested queries for the image picker ───────────────────────────────────
// Unchanged from Part 30/58.2 — general-purpose stock-photo search terms that
// work equally well against Pexels' library.

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
    const words    = slideTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
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