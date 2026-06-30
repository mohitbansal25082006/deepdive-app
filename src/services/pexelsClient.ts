// src/services/pexelsClient.ts
// Part 58.3 — NEW: Pexels API client for presentation image search
//
// Pexels is a curated, royalty-free stock photo library — a much better fit
// for presentation/slide imagery than a general-purpose web search engine.
// All photos are free for commercial use with no attribution required
// (attribution is still encouraged and shown in the UI).
//
// API Reference: https://www.pexels.com/api/documentation/
// Endpoint:      https://api.pexels.com/v1/search
// Endpoint:      https://api.pexels.com/v1/curated
// Auth:          Authorization: <API_KEY>   (no "Bearer " prefix)
// Rate limit:    200 requests/hour, 20,000 requests/month (default free tier)
//
// Response shape (per photo), `src` includes 8 pre-sized URLs:
//   original, large2x, large, medium, small, portrait, landscape, tiny
// ─────────────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const PEXELS_API_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY ?? '';
const PEXELS_BASE = 'https://api.pexels.com/v1';
const PEXELS_SEARCH_ENDPOINT = `${PEXELS_BASE}/search`;
const PEXELS_CURATED_ENDPOINT = `${PEXELS_BASE}/curated`;

/** Max results Pexels allows per page */
const MAX_PER_PAGE = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── API Key Helper ───────────────────────────────────────────────────────────

function getApiKey(): string | null {
  const key = PEXELS_API_KEY;
  if (!key || key === 'your_pexels_api_key_here' || key.trim() === '') return null;
  return key.trim();
}

export function hasPexelsApiKey(): boolean {
  return getApiKey() !== null;
}

// ─── Core Search ──────────────────────────────────────────────────────────────

/**
 * Search Pexels for photos matching a query.
 * Returns the raw Pexels photo objects (with all 8 pre-sized URLs).
 */
export async function pexelsSearchPhotos(
  options: PexelsSearchOptions,
): Promise<PexelsPhoto[]> {
  const apiKey = getApiKey();
  if (!apiKey || !options.query.trim()) return [];

  const params = new URLSearchParams({
    query:    options.query.trim(),
    page:     String(options.page ?? 1),
    per_page: String(Math.min(options.perPage ?? 24, MAX_PER_PAGE)),
  });
  if (options.orientation) params.set('orientation', options.orientation);
  if (options.size)        params.set('size', options.size);
  if (options.color)       params.set('color', options.color);
  if (options.locale)      params.set('locale', options.locale);

  try {
    const response = await fetch(`${PEXELS_SEARCH_ENDPOINT}?${params.toString()}`, {
      method:  'GET',
      headers: {
        // Pexels expects the raw API key, NOT a "Bearer " prefix
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[pexelsClient] HTTP error:', response.status, text.slice(0, 200));
      return [];
    }

    const data: PexelsSearchResponse = await response.json();
    return Array.isArray(data.photos) ? data.photos : [];

  } catch (err) {
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
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    page:     String(page),
    per_page: String(Math.min(perPage, MAX_PER_PAGE)),
  });

  try {
    const response = await fetch(`${PEXELS_CURATED_ENDPOINT}?${params.toString()}`, {
      method:  'GET',
      headers: { Authorization: apiKey },
    });

    if (!response.ok) return [];

    const data: PexelsSearchResponse = await response.json();
    return Array.isArray(data.photos) ? data.photos : [];

  } catch (err) {
    console.error('[pexelsClient] pexelsCuratedPhotos error:', err);
    return [];
  }
}

/**
 * Retrieve a single photo by its Pexels ID.
 */
export async function pexelsGetPhoto(id: number): Promise<PexelsPhoto | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${PEXELS_BASE}/photos/${id}`, {
      method:  'GET',
      headers: { Authorization: apiKey },
    });
    if (!response.ok) return null;
    return await response.json() as PexelsPhoto;
  } catch (err) {
    console.error('[pexelsClient] pexelsGetPhoto error:', err);
    return null;
  }
}