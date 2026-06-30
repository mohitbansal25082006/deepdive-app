// src/services/imageExtractor.ts
// Part 58.2 — TAVILY API MIGRATION
// Updated comments to reflect Tavily instead of SerpAPI.
// No functional changes needed — Tavily returns images in the same format
// (thumbnail, imageUrl, title, sourceUrl) as SerpAPI did.
//
// Extracts and curates image URLs from Tavily search results.
// Filters out low-quality, broken, or irrelevant thumbnails.
//
// Tavily's includeImages flag returns image URLs directly in the search response,
// so the extraction logic works identically to SerpAPI.

import { SearchBatch, SourceImage } from '../types';

const BLOCKED_DOMAINS = [
  'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
  'placeholder.com', 'via.placeholder', 'dummyimage.com',
];

const MIN_THUMBNAIL_LENGTH = 30; // URL must be meaningful

function isValidImageUrl(url: string): boolean {
  if (!url || url.length < MIN_THUMBNAIL_LENGTH) return false;
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) return false;
  // Must be a proper URL
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Extract source images from Tavily search results.
 * 
 * Part 58.2: Tavily's search results include image URLs via the includeImages
 * flag. These are available as either thumbnail or imageUrl fields on the
 * SearchResult type, which is shared between SerpAPI and Tavily implementations.
 * 
 * The extraction logic is identical regardless of which search API was used.
 */
export function extractSourceImages(
  searchBatches: SearchBatch[],
  maxImages = 12
): SourceImage[] {
  const seen = new Set<string>();
  const images: SourceImage[] = [];

  for (const batch of searchBatches) {
    const results = Array.isArray(batch?.results) ? batch.results : [];

    for (const result of results) {
      // Try thumbnail first, then imageUrl
      const candidateUrl = result.thumbnail ?? result.imageUrl;
      if (!candidateUrl) continue;
      if (!isValidImageUrl(candidateUrl)) continue;
      if (seen.has(candidateUrl)) continue;

      seen.add(candidateUrl);
      images.push({
        url: candidateUrl,
        thumbnailUrl: result.thumbnail,
        title: result.title,
        sourceUrl: result.url,
      });

      if (images.length >= maxImages) return images;
    }
  }

  return images;
}