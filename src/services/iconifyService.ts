// ═══════════════════════════════════════════════════════════════════════════════
// FIX FILE 1 of 3
// src/services/iconifyService.ts
// BUG FIX: Remove invalid `prefixes` query parameter from Iconify search API.
// The Iconify search endpoint does NOT support a `prefixes` filter — passing it
// caused the API to return 0 results. Fix: search all icon sets (no prefix
// filter), rely on `limit` and keyword quality to get good results.
// ═══════════════════════════════════════════════════════════════════════════════

import type { IconifySearchResult } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.iconify.design';

/** Search categories with preset keywords for the browser */
export const ICONIFY_CATEGORIES = [
  { id: 'popular',    label: 'Popular',    query: 'home star settings user search notification' },
  { id: 'tech',       label: 'Tech',       query: 'code cpu server cloud database wifi chip' },
  { id: 'business',   label: 'Business',   query: 'briefcase chart graph money dollar analytics' },
  { id: 'arrows',     label: 'Arrows',     query: 'arrow chevron navigate direction back forward' },
  { id: 'media',      label: 'Media',      query: 'play pause video camera music photo gallery' },
  { id: 'social',     label: 'Social',     query: 'share like heart comment message person' },
  { id: 'nature',     label: 'Nature',     query: 'leaf tree sun moon star fire water globe' },
  { id: 'people',     label: 'People',     query: 'person user team group profile face avatar' },
  { id: 'science',    label: 'Science',    query: 'flask atom dna microscope planet telescope' },
  { id: 'finance',    label: 'Finance',    query: 'wallet coin bank credit card payment receipt' },
];

// ─── In-memory cache ──────────────────────────────────────────────────────────

const searchCache  = new Map<string, IconifySearchResult[]>();
const svgCache     = new Map<string, string>();
const svgDataCache = new Map<string, { path: string; viewBox: string }>();

// ─── Search Icons ─────────────────────────────────────────────────────────────

/**
 * Search Iconify for icons matching `query`.
 * FIX: Do NOT pass `prefixes` param — the Iconify search API doesn't support
 * multi-prefix filtering and returns empty results when it's included.
 */
export async function searchIcons(
  query:  string,
  limit:  number = 64,
): Promise<IconifySearchResult[]> {
  if (!query.trim()) return [];

  const cacheKey = `${query.toLowerCase().trim()}:${limit}`;
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;

  try {
    // FIX: only pass query + limit — no prefixes filter
    const params = new URLSearchParams({
      query: query.trim(),
      limit: String(Math.min(limit, 999)),
    });

    const url = `${BASE_URL}/search?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!res.ok) {
      console.warn('[iconifyService] search failed:', res.status, await res.text().catch(() => ''));
      return [];
    }

    const data = await res.json() as { icons?: string[]; total?: number };
    const icons: string[] = data.icons ?? [];

    const results: IconifySearchResult[] = icons.map(fullId => {
      const colonIdx = fullId.indexOf(':');
      const prefix   = colonIdx >= 0 ? fullId.slice(0, colonIdx) : 'mdi';
      const name     = colonIdx >= 0 ? fullId.slice(colonIdx + 1) : fullId;
      return { id: fullId, prefix, name };
    });

    searchCache.set(cacheKey, results);
    return results;

  } catch (err) {
    console.error('[iconifyService] searchIcons error:', err);
    return [];
  }
}

// ─── Fetch SVG for one icon ───────────────────────────────────────────────────

export async function fetchIconSVG(iconId: string): Promise<string | null> {
  if (svgCache.has(iconId)) return svgCache.get(iconId)!;

  const colonIdx = iconId.indexOf(':');
  if (colonIdx < 0) return null;

  const prefix = iconId.slice(0, colonIdx);
  const name   = iconId.slice(colonIdx + 1);

  try {
    const url = `${BASE_URL}/${prefix}/${name}.svg`;
    const res = await fetch(url, { headers: { 'Accept': 'image/svg+xml' } });
    if (!res.ok) return null;
    const svg = await res.text();
    svgCache.set(iconId, svg);
    return svg;
  } catch (err) {
    console.error('[iconifyService] fetchIconSVG error:', err);
    return null;
  }
}

// ─── Parse SVG path data ──────────────────────────────────────────────────────

export function parseIconSVGPath(svg: string): { path: string; viewBox: string } | null {
  const vbMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  const viewBox = vbMatch ? vbMatch[1] : '0 0 24 24';
  const pathMatches = [...svg.matchAll(/<path[^>]+\sd="([^"]+)"/gi)];
  if (pathMatches.length === 0) {
    const altMatches = [...svg.matchAll(/<path[^>]+\sd='([^']+)'/gi)];
    if (altMatches.length === 0) return null;
    return { path: altMatches.map(m => m[1]).join(' '), viewBox };
  }
  return { path: pathMatches.map(m => m[1]).join(' '), viewBox };
}

// ─── Get icon with full SVG data ──────────────────────────────────────────────

export async function getIconWithSVG(
  iconId: string,
): Promise<IconifySearchResult & { svgData: string; viewBox: string } | null> {
  const colonIdx = iconId.indexOf(':');
  if (colonIdx < 0) return null;
  const prefix = iconId.slice(0, colonIdx);
  const name   = iconId.slice(colonIdx + 1);
  if (svgDataCache.has(iconId)) {
    const cached = svgDataCache.get(iconId)!;
    return { id: iconId, prefix, name, svgData: cached.path, viewBox: cached.viewBox };
  }
  const rawSVG = await fetchIconSVG(iconId);
  if (!rawSVG) return null;
  const parsed = parseIconSVGPath(rawSVG);
  if (!parsed) return { id: iconId, prefix, name, svgData: rawSVG, viewBox: '0 0 24 24' };
  svgDataCache.set(iconId, parsed);
  return { id: iconId, prefix, name, svgData: parsed.path, viewBox: parsed.viewBox };
}

// ─── Batch prefetch ───────────────────────────────────────────────────────────

export async function prefetchIconSVGs(iconIds: string[]): Promise<void> {
  const BATCH = 8;
  for (let i = 0; i < iconIds.length; i += BATCH) {
    await Promise.allSettled(iconIds.slice(i, i + BATCH).map(id => fetchIconSVG(id)));
  }
}

// ─── Get SVG URL for display ──────────────────────────────────────────────────

export function getIconSVGUrl(iconId: string, color?: string, size: number = 24): string {
  const colonIdx = iconId.indexOf(':');
  if (colonIdx < 0) return '';
  const prefix = iconId.slice(0, colonIdx);
  const name   = iconId.slice(colonIdx + 1);
  // Encode the color properly for the URL (remove # prefix, Iconify uses hex without #)
  const colorParam = color ? color.replace('#', '') : undefined;
  const params = new URLSearchParams({ width: String(size), height: String(size) });
  if (colorParam) params.set('color', `%23${colorParam}`); // %23 = URL-encoded #
  return `${BASE_URL}/${prefix}/${name}.svg?${params.toString()}`;
}

// ─── Clear caches ─────────────────────────────────────────────────────────────

export function clearIconifyCache(): void {
  searchCache.clear();
  svgCache.clear();
  svgDataCache.clear();
}