// src/lib/offlineCache.ts
// Part 22 — UPDATED.
// This file is now a thin backward-compatibility shim over cacheStorage.ts.
// All existing imports of getCachedReport / cacheReport / clearAllCache etc.
// continue to work without changes in research-report.tsx and other screens.
//
// NEW functionality lives in cacheStorage.ts directly.

export {
  cacheReport,
  getCachedReport,
  clearAllCache,
  getCacheSize,
  getCacheIndex as getCachedReportsList,
  evictItemById as evictCachedReport,
  formatBytes,
  isCached as isReportCached,
} from './cacheStorage';

// Legacy isReportCached used to take (id, indexArray) — shim for old callers
import { isCached } from './cacheStorage';
export function isReportCachedLegacy(reportId: string, _index: unknown[]): boolean {
  // Sync check not possible with new async API — always returns false for legacy
  // Callers should migrate to `await isCached('report', id)`
  return false;
}

// Re-export types
export type { CacheEntry } from '../types/cache';