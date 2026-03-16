// src/lib/cacheStorage.ts
// Part 22 — Unified cache storage layer.
//
// ARCHITECTURE:
//   • Data files    → expo-file-system documentDirectory  (unlimited, persists across sessions)
//   • Index/metadata → AsyncStorage                       (tiny JSON, fast)
//
// WHY NOT ASYNCSTORAGE FOR DATA?
//   AsyncStorage has a hard 6 MB limit on Android.  A single deep research
//   report with knowledge graph can easily exceed 1 MB.  Storing the full JSON
//   in documentDirectory sidesteps this completely.
//
// SUPPORTED CONTENT TYPES:
//   report | podcast | debate | academic_paper | presentation
//
// AUTO-CACHE:
//   Called automatically from each completion hook (useResearch, usePodcast,
//   useDebate, useAcademicPaper, useSlideGenerator).  No manual action needed.
//
// EVICTION POLICY:
//   1. Expired entries (older than expiryDays) are purged first.
//   2. If total size still exceeds limitBytes, oldest entries are evicted (LRU).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  CacheEntry,
  CacheIndex,
  CacheSettings,
  CacheStats,
  CachedContentType,
} from '../types/cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const INDEX_KEY        = 'deepdive:cache:index:v22';
const SETTINGS_KEY     = 'deepdive:cache:settings:v22';
const CACHE_DIR        = `${FileSystem.documentDirectory}deepdive_cache/`;
const INDEX_VERSION    = 22;
const DEFAULT_LIMIT_MB = 100;
const DEFAULT_EXPIRY_D = 30;

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<CachedContentType, { icon: string; color: string; dir: string }> = {
  report:         { icon: 'document-text-outline', color: '#6C63FF', dir: 'reports'       },
  podcast:        { icon: 'radio-outline',          color: '#FF6584', dir: 'podcasts'      },
  debate:         { icon: 'chatbox-ellipses-outline',color: '#F97316', dir: 'debates'      },
  academic_paper: { icon: 'school-outline',          color: '#43E97B', dir: 'papers'       },
  presentation:   { icon: 'easel-outline',           color: '#29B6F6', dir: 'presentations' },
};

// ─── Ensure cache directories exist ──────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  try {
    const rootInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!rootInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    for (const meta of Object.values(TYPE_META)) {
      const dir = `${CACHE_DIR}${meta.dir}/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    }
  } catch (err) {
    console.warn('[CacheStorage] ensureDirs error:', err);
  }
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<CacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === INDEX_VERSION) return parsed;
    }
  } catch {}
  return {
    entries:    [],
    totalBytes: 0,
    limitBytes: DEFAULT_LIMIT_MB * 1024 * 1024,
    version:    INDEX_VERSION,
  };
}

async function saveIndex(index: CacheIndex): Promise<void> {
  try {
    // Recalculate totalBytes from entries to keep it accurate
    index.totalBytes = index.entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[CacheStorage] saveIndex error:', err);
  }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function loadSettings(): Promise<CacheSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as CacheSettings;
  } catch {}
  return {
    limitBytes:  DEFAULT_LIMIT_MB * 1024 * 1024,
    autoCache:   true,
    expiryDays:  DEFAULT_EXPIRY_D,
  };
}

export async function saveSettings(settings: CacheSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // Also sync the limit into the index
    const index = await loadIndex();
    index.limitBytes = settings.limitBytes;
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] saveSettings error:', err);
  }
}

// ─── File path builder ────────────────────────────────────────────────────────

function buildFilePath(type: CachedContentType, id: string): string {
  const dir = TYPE_META[type].dir;
  // Sanitize id to safe filename
  const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
  return `${CACHE_DIR}${dir}/${safeId}.json`;
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

async function evictExpired(index: CacheIndex): Promise<void> {
  const now = Date.now();
  const expired = index.entries.filter(e => e.expiresAt < now);
  for (const entry of expired) {
    try { await FileSystem.deleteAsync(entry.filePath, { idempotent: true }); } catch {}
  }
  index.entries = index.entries.filter(e => e.expiresAt >= now);
}

async function evictToFitLimit(index: CacheIndex): Promise<void> {
  // Sort oldest-first (LRU eviction)
  index.entries.sort((a, b) => a.cachedAt - b.cachedAt);
  while (index.totalBytes > index.limitBytes && index.entries.length > 0) {
    const victim = index.entries.shift()!;
    index.totalBytes -= victim.sizeBytes;
    try { await FileSystem.deleteAsync(victim.filePath, { idempotent: true }); } catch {}
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cache any supported content type.
 * The full data object is written as JSON to documentDirectory.
 * The index entry is updated in AsyncStorage.
 */
export async function cacheItem(
  type:    CachedContentType,
  id:      string,
  title:   string,
  data:    unknown,
  options?: { subtitle?: string; expiryDays?: number },
): Promise<void> {
  try {
    await ensureDirs();

    const settings   = await loadSettings();
    const expiryDays = options?.expiryDays ?? settings.expiryDays;
    const now        = Date.now();
    const filePath   = buildFilePath(type, id);

    // Serialize and write to file
    const serialized = JSON.stringify(data);
    await FileSystem.writeAsStringAsync(filePath, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Get actual size
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const sizeBytes = (fileInfo as any).size ?? serialized.length;

    const entry: CacheEntry = {
      id,
      type,
      title,
      subtitle:  options?.subtitle,
      cachedAt:  now,
      expiresAt: now + expiryDays * 24 * 60 * 60 * 1000,
      filePath,
      sizeBytes,
      icon:  TYPE_META[type].icon,
      color: TYPE_META[type].color,
    };

    const index = await loadIndex();

    // Remove existing entry for same id+type
    const existing = index.entries.find(e => e.id === id && e.type === type);
    if (existing) {
      index.entries = index.entries.filter(e => !(e.id === id && e.type === type));
      index.totalBytes -= existing.sizeBytes;
    }

    // Add new entry
    index.entries.unshift(entry);
    index.totalBytes += sizeBytes;

    // Evict expired and enforce size limit
    await evictExpired(index);
    if (index.totalBytes > index.limitBytes) {
      await evictToFitLimit(index);
    }

    await saveIndex(index);
  } catch (err) {
    console.warn(`[CacheStorage] cacheItem(${type}, ${id}) error:`, err);
  }
}

/**
 * Retrieve a cached item by id + type.
 * Returns null if not found or expired.
 */
export async function getCachedItem<T>(
  type: CachedContentType,
  id:   string,
): Promise<T | null> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);
    if (!entry) return null;

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      await evictItemById(type, id);
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(entry.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Check if an item is cached (and not expired).
 */
export async function isCached(type: CachedContentType, id: string): Promise<boolean> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.some(e => e.id === id && e.type === type && now < e.expiresAt);
}

/**
 * Get the full cache index (all entries, non-expired).
 */
export async function getCacheIndex(): Promise<CacheEntry[]> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt);
}

/**
 * Evict a single item by id + type.
 */
export async function evictItemById(type: CachedContentType, id: string): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);
    if (entry) {
      try { await FileSystem.deleteAsync(entry.filePath, { idempotent: true }); } catch {}
      index.entries = index.entries.filter(e => !(e.id === id && e.type === type));
    }
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] evictItemById error:', err);
  }
}

/**
 * Evict all items of a given type.
 */
export async function evictByType(type: CachedContentType): Promise<void> {
  try {
    const index   = await loadIndex();
    const victims = index.entries.filter(e => e.type === type);
    for (const v of victims) {
      try { await FileSystem.deleteAsync(v.filePath, { idempotent: true }); } catch {}
    }
    index.entries = index.entries.filter(e => e.type !== type);
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] evictByType error:', err);
  }
}

/**
 * Clear the entire cache (all types).
 */
export async function clearAllCache(): Promise<void> {
  try {
    const index = await loadIndex();
    for (const entry of index.entries) {
      try { await FileSystem.deleteAsync(entry.filePath, { idempotent: true }); } catch {}
    }
    // Delete the whole cache directory tree and recreate it
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch {}
    // Reset index
    await saveIndex({
      entries:    [],
      totalBytes: 0,
      limitBytes: index.limitBytes,
      version:    INDEX_VERSION,
    });
  } catch (err) {
    console.warn('[CacheStorage] clearAllCache error:', err);
  }
}

/**
 * Get detailed cache statistics.
 */
export async function getCacheStats(): Promise<CacheStats> {
  const index = await loadIndex();
  const now   = Date.now();
  const valid = index.entries.filter(e => now < e.expiresAt);

  const byType = {
    report:         { count: 0, bytes: 0 },
    podcast:        { count: 0, bytes: 0 },
    debate:         { count: 0, bytes: 0 },
    academic_paper: { count: 0, bytes: 0 },
    presentation:   { count: 0, bytes: 0 },
  } as Record<CachedContentType, { count: number; bytes: number }>;

  let totalBytes = 0;
  for (const e of valid) {
    byType[e.type].count++;
    byType[e.type].bytes += e.sizeBytes;
    totalBytes += e.sizeBytes;
  }

  return {
    totalItems:  valid.length,
    totalBytes,
    limitBytes:  index.limitBytes,
    percentUsed: index.limitBytes > 0 ? (totalBytes / index.limitBytes) * 100 : 0,
    byType,
  };
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Convenience wrappers (typed) ─────────────────────────────────────────────

export async function cacheReport(report: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('report', report.id, report.title, report, {
    subtitle: `Research Report`,
  });
}

export async function getCachedReport<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('report', id);
}

export async function cachePodcast(podcast: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('podcast', podcast.id, podcast.title, podcast, {
    subtitle: `Podcast Episode`,
  });
}

export async function getCachedPodcast<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('podcast', id);
}

export async function cacheDebate(debate: { id: string; topic: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('debate', debate.id, debate.topic, debate, {
    subtitle: `AI Debate`,
  });
}

export async function getCachedDebate<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('debate', id);
}

export async function cacheAcademicPaper(paper: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('academic_paper', paper.id, paper.title, paper, {
    subtitle: `Academic Paper`,
  });
}

export async function getCachedAcademicPaper<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('academic_paper', id);
}

export async function cachePresentation(pres: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('presentation', pres.id, pres.title, pres, {
    subtitle: `Presentation`,
  });
}

export async function getCachedPresentation<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('presentation', id);
}

// ─── Legacy compat (the old offlineCache.ts API) ──────────────────────────────
// These keep existing imports in research-report.tsx working without changes.

export { cacheReport as cacheReportLegacy };
export { getCachedReport as getCachedReportLegacy };

/**
 * Legacy: returns total number of valid cache entries.
 */
export async function getCacheSize(): Promise<number> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt).length;
}