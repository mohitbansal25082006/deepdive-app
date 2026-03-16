// src/types/cache.ts
// Part 22 — Unified cache type definitions for all content types.
// The cache system uses expo-file-system (documentDirectory) for data storage
// so it is NOT limited by AsyncStorage's 6 MB Android cap.
// AsyncStorage is used ONLY for the lightweight index/metadata.

// ─── Content type discriminator ───────────────────────────────────────────────

export type CachedContentType =
  | 'report'
  | 'podcast'
  | 'debate'
  | 'academic_paper'
  | 'presentation';

// ─── Cache entry (stored in the index) ───────────────────────────────────────

export interface CacheEntry {
  /** Unique content ID (report.id, podcast.id, etc.) */
  id: string;
  /** Content type discriminator */
  type: CachedContentType;
  /** Human-readable title */
  title: string;
  /** Optional subtitle / descriptor */
  subtitle?: string;
  /** Unix ms timestamp when this entry was cached */
  cachedAt: number;
  /** Unix ms timestamp when this entry expires (auto-evict) */
  expiresAt: number;
  /** File path on device where the JSON data is stored */
  filePath: string;
  /** Approximate file size in bytes (set after write) */
  sizeBytes: number;
  /** Optional icon name for display in cache manager */
  icon?: string;
  /** Optional accent color for display */
  color?: string;
}

// ─── Cache index (the root index stored in AsyncStorage) ──────────────────────

export interface CacheIndex {
  entries:     CacheEntry[];
  /** Total bytes used across all cached files */
  totalBytes:  number;
  /** User-configured limit in bytes (default 100 MB) */
  limitBytes:  number;
  /** Version stamp for migration */
  version:     number;
}

// ─── Cache settings ───────────────────────────────────────────────────────────

export interface CacheSettings {
  /** User-configured storage limit in bytes */
  limitBytes: number;
  /** Whether auto-cache is enabled after generation */
  autoCache:  boolean;
  /** Days before a cached item expires (default 30) */
  expiryDays: number;
}

// ─── Cache stats ──────────────────────────────────────────────────────────────

export interface CacheStats {
  totalItems:    number;
  totalBytes:    number;
  limitBytes:    number;
  percentUsed:   number;
  byType:        Record<CachedContentType, { count: number; bytes: number }>;
}

// ─── Filter type for offline screen ──────────────────────────────────────────

export type CacheFilterType = 'all' | CachedContentType;

// ─── Download state for cache manager ────────────────────────────────────────

export interface CacheDownloadState {
  id:       string;
  type:     CachedContentType;
  progress: number;   // 0-1
  status:   'idle' | 'downloading' | 'done' | 'error';
  error?:   string;
}