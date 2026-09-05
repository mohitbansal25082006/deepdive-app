// src/services/pexelsClient.ts
// Part 58.3 — Pexels API client for presentation image search.
// Part 59 — Routed through the `search-gateway` Edge Function. No key here.
//
// Pexels is a curated, royalty-free stock photo library — a much better fit for
// presentation imagery than a general-purpose web search engine. All photos are
// free for commercial use; attribution is optional but we show it anyway.
//
// The gateway returns Pexels' raw JSON, so PexelsPhoto and its eight pre-sized
// `src` URLs arrive exactly as before and mapPexelsPhoto() in
// imageSearchService.ts is unchanged.
//
// ONE BREAKING CHANGE: hasPexelsApiKey() is now async, because the answer lives
// on the server. Its only caller (imageSearchService.searchOnlineImages) was
// already async, so it just needed an `await`.
//
// API Reference: https://www.pexels.com/api/documentation/
// Rate limit:    200 requests/hour, 20,000/month on the free tier — now shared
//                across all users, since the calls come from one server key.

import { callGateway, GatewayError } from './apiGateway';
import { isProviderConfigured }      from './aiProviderStatus';

// ─── Types (unchanged — this is Pexels' own response shape) ───────────────────

export interface PexelsPhotoSource {
  original:  string;
  large2x:   string;
  large:     string;
  medium:    string;
  small:     string;
  portrait:  string;
  landscape: string;
  tiny:      string;
}

export interface PexelsPhoto {
  id:               number;
  width:            number;
  height:           number;
  url:              string;          // pexels.com page URL
  photographer:     string;
  photographer_url: string;
  photographer_id:  number;
  avg_color:        string | null;
  src:              PexelsPhotoSource;
  liked?:           boolean;
  alt?:             string;
}

export interface PexelsSearchResponse {
  total_results: number;
  page:          number;
  per_page:      number;
  photos:        PexelsPhoto[];
  next_page?:    string;
  prev_page?:    string;
}

export type PexelsOrientation = 'landscape' | 'portrait' | 'square';
export type PexelsSize        = 'large' | 'medium' | 'small';

export interface PexelsSearchOptions {
  query:        string;
  page?:        number;
  perPage?:     number;
  orientation?: PexelsOrientation;
  size?:        PexelsSize;
  color?:       string;
  locale?:      string;
}

/** Envelope returned by the search-gateway. */
interface GatewayEnvelope<T> { data: T; }

/** Max results Pexels allows per page */
const MAX_PER_PAGE = 80;

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * Part 59: now async. Asks the server whether a Pexels key is configured,
 * without ever learning what it is. Cached for 10 minutes by aiProviderStatus.
 */
export async function hasPexelsApiKey(): Promise<boolean> {
  return isProviderConfigured('pexels');
}

// ─── Core Search ──────────────────────────────────────────────────────────────

/**
 * Search Pexels for photos matching a query.
 * Returns the raw Pexels photo objects (with all 8 pre-sized URLs).
 */
export async function pexelsSearchPhotos(
  options: PexelsSearchOptions,
): Promise<PexelsPhoto[]> {
  if (!options.query.trim()) return [];

  try {
    const envelope = await callGateway<GatewayEnvelope<PexelsSearchResponse>>(
      'search-gateway',
      {
        provider: 'pexels',
        op:       'search',
        params: {
          query:       options.query.trim(),
          page:        options.page ?? 1,
          perPage:     Math.min(options.perPage ?? 24, MAX_PER_PAGE),
          orientation: options.orientation,
          size:        options.size,
          color:       options.color,
          locale:      options.locale,
        },
      },
    );

    const photos = envelope?.data?.photos;
    return Array.isArray(photos) ? photos : [];

  } catch (err) {
    if (err instanceof GatewayError && err.isNotConfigured) {
      console.warn('[pexelsClient] No Pexels key configured — stock photo search is off.');
      return [];
    }
    console.error('[pexelsClient] pexelsSearchPhotos error:', err);
    return [];
  }
}

/**
 * Fetch Pexels' real-time curated photo feed (no query needed).
 * Useful as a fallback / "trending" set when a search returns nothing.
 */
export async function pexelsCuratedPhotos(
  page = 1,
  perPage = 24,
): Promise<PexelsPhoto[]> {
  try {
    const envelope = await callGateway<GatewayEnvelope<PexelsSearchResponse>>(
      'search-gateway',
      {
        provider: 'pexels',
        op:       'curated',
        params:   { page, perPage: Math.min(perPage, MAX_PER_PAGE) },
      },
    );

    const photos = envelope?.data?.photos;
    return Array.isArray(photos) ? photos : [];

  } catch (err) {
    if (err instanceof GatewayError && err.isNotConfigured) return [];
    console.error('[pexelsClient] pexelsCuratedPhotos error:', err);
    return [];
  }
}

/**
 * Retrieve a single photo by its Pexels ID.
 */
export async function pexelsGetPhoto(id: number): Promise<PexelsPhoto | null> {
  try {
    const envelope = await callGateway<GatewayEnvelope<PexelsPhoto>>(
      'search-gateway',
      {
        provider: 'pexels',
        op:       'photo',
        params:   { id },
      },
    );
    return envelope?.data ?? null;
  } catch (err) {
    if (err instanceof GatewayError && err.isNotConfigured) return null;
    console.error('[pexelsClient] pexelsGetPhoto error:', err);
    return null;
  }
}