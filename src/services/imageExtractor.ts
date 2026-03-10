// src/services/imageExtractor.ts
// Extracts and curates image URLs from SerpAPI search results.
// Filters out low-quality, broken, or irrelevant thumbnails.

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