// src/lib/cacheSettings.ts
// Part 59.3 — the two audio toggles are gone.
//
// setAudioCache() / setVoiceDebateCache() / isAudioCacheEnabled() /
// isVoiceDebateCacheEnabled() are kept as deprecated shims so any screen not
// yet updated still compiles and behaves sensibly: the setters do nothing, the
// getters answer true, because audio is now always cached with its item.
//
// DEFAULT_CACHE_SETTINGS no longer carries the audio flags.

import {
  loadSettings as _load,
  saveSettings as _save,
  getCacheStats,
  formatBytes,
} from './cacheStorage';
import { CacheSettings } from '../types/cache';

// ─── Default settings ─────────────────────────────────────────────────────────

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  limitBytes: 100 * 1024 * 1024, // 100 MB
  autoCache:  true,
  expiryDays: 30,
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
  const updated = { ...current, ...partial };
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

// ─── Deprecated audio toggles (Part 59.3) ─────────────────────────────────────

/**
 * @deprecated Audio is always cached with its item. This is a no-op.
 * Kept so an un-migrated caller compiles rather than silently changing meaning.
 */
export async function setAudioCache(_enabled: boolean): Promise<void> {
  // Intentionally does nothing.
}

/** @deprecated Audio is always cached with its item. This is a no-op. */
export async function setVoiceDebateCache(_enabled: boolean): Promise<void> {
  // Intentionally does nothing.
}

/** @deprecated Always true — audio caching is not optional. */
export async function isAudioCacheEnabled(): Promise<boolean> {
  return true;
}

/** @deprecated Always true — audio caching is not optional. */
export async function isVoiceDebateCacheEnabled(): Promise<boolean> {
  return true;
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

export { getCacheStats, formatBytes };

/**
 * Human-readable one-liner for the Cache Manager header.
 * Part 59.3: audio is folded into the item counts rather than called out as a
 * separate opt-in feature, and pending audio is surfaced because a podcast
 * without its audio is an incomplete cache, not a complete one.
 */
export async function getCacheSummary(): Promise<string> {
  const stats = await getCacheStats();
  const used  = formatBytes(stats.totalBytes);
  const limit = formatBytes(stats.limitBytes);
  const pct   = Math.round(stats.percentUsed);

  let base = `${stats.totalItems} items · ${used} / ${limit} (${pct}%)`;

  const withAudio =
    (stats.podcastsWithAudio ?? 0) + (stats.voiceDebatesWithAudio ?? 0);
  if (withAudio > 0) {
    const audioBytes =
      (stats.audioBytesTotal ?? 0) + (stats.voiceDebateAudioBytes ?? 0);
    base += ` · ${withAudio} with audio (${formatBytes(audioBytes)})`;
  }

  if ((stats.itemsAwaitingAudio ?? 0) > 0) {
    base += ` · ${stats.itemsAwaitingAudio} awaiting audio`;
  }

  return base;
}

/** Is automatic caching of new content enabled? */
export async function isAutoCacheEnabled(): Promise<boolean> {
  const settings = await _load();
  return settings.autoCache;
}