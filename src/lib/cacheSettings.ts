// src/lib/cacheSettings.ts
// Part 23 — Updated.
//
// CHANGES from Part 22:
//   • CacheSettings now includes `cacheAudio: boolean`
//   • Added setAudioCache() helper
//   • getCacheSummary() includes audio info when podcasts have audio cached

import {
  loadSettings as _load,
  saveSettings as _save,
  getCacheStats,
  formatBytes,
} from './cacheStorage';
import { CacheSettings, CacheStats } from '../types/cache';

// ─── Default settings ─────────────────────────────────────────────────────────

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  limitBytes:  100 * 1024 * 1024, // 100 MB
  autoCache:   true,
  expiryDays:  30,
  cacheAudio:  false,             // Part 23: off by default
};

// ─── Preset limit options shown in UI ────────────────────────────────────────

export interface LimitPreset {
  label:   string;
  bytes:   number;
  display: string;
}

export const LIMIT_PRESETS: LimitPreset[] = [
  { label: '50 MB',  bytes: 50  * 1024 * 1024,  display: '50 MB'  },
  { label: '100 MB', bytes: 100 * 1024 * 1024,  display: '100 MB' },
  { label: '200 MB', bytes: 200 * 1024 * 1024,  display: '200 MB' },
  { label: '500 MB', bytes: 500 * 1024 * 1024,  display: '500 MB' },
  { label: '1 GB',   bytes: 1024 * 1024 * 1024, display: '1 GB'   },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSettings(): Promise<CacheSettings> {
  return _load();
}

export async function updateSettings(partial: Partial<CacheSettings>): Promise<CacheSettings> {
  const current = await _load();
  const updated  = { ...current, ...partial };
  await _save(updated);
  return updated;
}

export async function setStorageLimit(bytes: number): Promise<void> {
  const current = await _load();
  await _save({ ...current, limitBytes: bytes });
}

export async function setAutoCache(enabled: boolean): Promise<void> {
  const current = await _load();
  await _save({ ...current, autoCache: enabled });
}

export async function setExpiryDays(days: number): Promise<void> {
  const current = await _load();
  await _save({ ...current, expiryDays: days });
}

/** Part 23: toggle audio caching for podcasts */
export async function setAudioCache(enabled: boolean): Promise<void> {
  const current = await _load();
  await _save({ ...current, cacheAudio: enabled });
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

export { getCacheStats, formatBytes };

/**
 * Returns a human-readable summary string.
 * Part 23: includes audio info if any podcasts have audio cached.
 */
export async function getCacheSummary(): Promise<string> {
  const stats = await getCacheStats();
  const used  = formatBytes(stats.totalBytes);
  const limit = formatBytes(stats.limitBytes);
  const pct   = Math.round(stats.percentUsed);
  let base    = `${stats.totalItems} items · ${used} / ${limit} (${pct}%)`;
  if ((stats.podcastsWithAudio ?? 0) > 0) {
    base += ` · ${stats.podcastsWithAudio} podcast${stats.podcastsWithAudio === 1 ? '' : 's'} with audio`;
  }
  return base;
}

/**
 * Returns whether auto-caching is currently enabled.
 */
export async function isAutoCacheEnabled(): Promise<boolean> {
  const settings = await _load();
  return settings.autoCache;
}

/**
 * Returns whether audio caching is currently enabled.
 */
export async function isAudioCacheEnabled(): Promise<boolean> {
  const settings = await _load();
  return settings.cacheAudio ?? false;
}