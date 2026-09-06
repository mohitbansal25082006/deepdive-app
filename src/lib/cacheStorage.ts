// src/lib/cacheStorage.ts
// Part 59.2 — derived paths + static imports (see the two bug notes below).
// Part 59.3 — audio is part of an item's size, not an optional extra.
//
// ─── BUG 1 (59.2): stale absolute filePath ──────────────────────────────────
//
// Every CacheEntry stored an absolute filePath and getCachedItem() read that
// exact string. After an app update, a reinstall, or the Expo Go → standalone
// move the container prefix changes and every one of those paths points
// nowhere. Users saw "Cache Miss — this item is no longer in the cache",
// followed by the entry being deleted, while the JSON sat on disk untouched.
//
// Fix: buildFilePath(type, id) is the single source of truth and is called on
// every read. entry.filePath is diagnostic only. The derivation is
// deterministic from (type, id), so entries written by any previous version
// resolve with no migration — the index stays at version 45 so nobody loses
// their cache on upgrade.
//
// ─── BUG 2 (59.2): dynamic import() in a release bundle ─────────────────────
//
// Eviction used `await import('./podcastAudioCache')` in five places. Under
// Hermes in a release build that can reject, and because these sit inside
// fire-and-forget cleanup the rejection surfaced as a black screen or a
// half-eviction — files left on disk, index rows removed, storage never
// reclaimed. All five are now static. There is no cycle: the audio and asset
// caches import filePaths and types only, never cacheStorage.
//
// ─── PART 59.3 CHANGES ──────────────────────────────────────────────────────
//
//   • loadSettings() no longer reads or writes cacheAudio / cacheVoiceDebate.
//     Audio is not optional any more, so a flag saying otherwise is a lie the
//     rest of the code would have to keep honouring.
//   • markAudioCached(type, id, bytes) replaces the two near-identical
//     mark*AudioCached functions (both kept as thin wrappers).
//   • cacheItem() sets audioPending for podcasts and voice debates so the UI
//     can distinguish "transcript only, audio on the way" from "complete".
//   • getCacheStats() reports itemsAwaitingAudio.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  CacheEntry,
  CacheIndex,
  CacheSettings,
  CacheStats,
  CachedContentType,
  hasAudioTrack,
} from '../types/cache';

import {
  docDir,
  safeId,
  ensureDir,
  deleteQuietly,
  fileExists,
  fileSize,
} from './filePaths';

// ── Part 59.2: static, not dynamic. See BUG 2 above. ─────────────────────────
import { evictPodcastAudio, clearAllPodcastAudio }      from './podcastAudioCache';
import { evictPresentationAssets }                       from './presentationAssetCache';
import { evictVoiceDebateJson, clearAllVoiceDebateJsonCache }   from './voiceDebateCache';
import { evictVoiceDebateAudio, clearAllVoiceDebateAudioCache } from './voiceDebateAudioCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const INDEX_KEY        = 'deepdive:cache:index:v45';
const SETTINGS_KEY     = 'deepdive:cache:settings:v45';
const INDEX_VERSION    = 45;   // deliberately NOT bumped — see header
const DEFAULT_LIMIT_MB = 100;
const DEFAULT_EXPIRY_D = 30;

/** Rebuilt live so it always reflects the current container. */
function cacheRoot(): string {
  return `${docDir()}deepdive_cache/`;
}

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<CachedContentType, { icon: string; color: string; dir: string }> = {
  report:         { icon: 'document-text-outline',    color: '#6C63FF', dir: 'reports'       },
  podcast:        { icon: 'radio-outline',            color: '#FF6584', dir: 'podcasts'      },
  debate:         { icon: 'chatbox-ellipses-outline', color: '#F97316', dir: 'debates'       },
  academic_paper: { icon: 'school-outline',           color: '#43E97B', dir: 'papers'        },
  presentation:   { icon: 'easel-outline',            color: '#29B6F6', dir: 'presentations' },
  voice_debate:   { icon: 'mic-circle-outline',       color: '#8B5CF6', dir: 'voice_debates' },
};

// ─── Directories ──────────────────────────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  const root = cacheRoot();
  if (!root) return;
  await ensureDir(root);
  for (const meta of Object.values(TYPE_META)) {
    await ensureDir(`${root}${meta.dir}/`);
  }
}

// ─── Path derivation (the fix for BUG 1) ─────────────────────────────────────

function portablePathFor(type: CachedContentType, id: string): string {
  return `deepdive_cache/${TYPE_META[type].dir}/${safeId(id, 80)}.json`;
}

/**
 * The authoritative on-disk location for a cached item.
 * Deterministic from (type, id) and always built against the current
 * documentDirectory, which is what makes a cache survive an app update.
 */
function buildFilePath(type: CachedContentType, id: string): string {
  return `${cacheRoot()}${TYPE_META[type].dir}/${safeId(id, 80)}.json`;
}

function readPathFor(entry: CacheEntry): string {
  return buildFilePath(entry.type, entry.id);
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<CacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === INDEX_VERSION) return parsed;
    }
    // Migrate a v22 index without discarding anything.
    const oldRaw = await AsyncStorage.getItem('deepdive:cache:index:v22');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as CacheIndex;
      const migrated: CacheIndex = {
        entries:    oldParsed.entries ?? [],
        totalBytes: oldParsed.totalBytes ?? 0,
        limitBytes: oldParsed.limitBytes ?? DEFAULT_LIMIT_MB * 1024 * 1024,
        version:    INDEX_VERSION,
      };
      await saveIndex(migrated);
      return migrated;
    }
  } catch { /* fall through to empty */ }

  return {
    entries:    [],
    totalBytes: 0,
    limitBytes: DEFAULT_LIMIT_MB * 1024 * 1024,
    version:    INDEX_VERSION,
  };
}

async function saveIndex(index: CacheIndex): Promise<void> {
  try {
    index.totalBytes = index.entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[CacheStorage] saveIndex error:', err);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Part 59.3: cacheAudio / cacheVoiceDebate are no longer read or written.
 * A settings blob from an older build still parses — the deprecated keys are
 * simply ignored and dropped the next time settings are saved.
 */
export async function loadSettings(): Promise<CacheSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CacheSettings>;
      return {
        limitBytes: parsed.limitBytes ?? DEFAULT_LIMIT_MB * 1024 * 1024,
        autoCache:  parsed.autoCache  ?? true,
        expiryDays: parsed.expiryDays ?? DEFAULT_EXPIRY_D,
      };
    }
    const oldRaw = await AsyncStorage.getItem('deepdive:cache:settings:v22');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as Partial<CacheSettings>;
      return {
        limitBytes: oldParsed.limitBytes ?? DEFAULT_LIMIT_MB * 1024 * 1024,
        autoCache:  oldParsed.autoCache  ?? true,
        expiryDays: oldParsed.expiryDays ?? DEFAULT_EXPIRY_D,
      };
    }
  } catch { /* fall through to defaults */ }

  return {
    limitBytes: DEFAULT_LIMIT_MB * 1024 * 1024,
    autoCache:  true,
    expiryDays: DEFAULT_EXPIRY_D,
  };
}

export async function saveSettings(settings: CacheSettings): Promise<void> {
  try {
    // Write only the live fields; the deprecated audio flags are dropped here.
    const clean: CacheSettings = {
      limitBytes: settings.limitBytes,
      autoCache:  settings.autoCache,
      expiryDays: settings.expiryDays,
    };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    const index      = await loadIndex();
    index.limitBytes = clean.limitBytes;
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] saveSettings error:', err);
  }
}

// ─── Side-car eviction (static imports — see BUG 2) ──────────────────────────

async function evictSideCars(type: CachedContentType, id: string): Promise<void> {
  try {
    if (type === 'podcast') {
      await evictPodcastAudio(id);
    } else if (type === 'presentation') {
      await evictPresentationAssets(id);
    } else if (type === 'voice_debate') {
      await Promise.allSettled([
        evictVoiceDebateJson(id),
        evictVoiceDebateAudio(id),
      ]);
    }
  } catch (err) {
    console.warn(`[CacheStorage] evictSideCars(${type}, ${id}) error:`, err);
  }
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

async function evictExpired(index: CacheIndex): Promise<void> {
  const now     = Date.now();
  const expired = index.entries.filter(e => e.expiresAt < now);
  for (const entry of expired) {
    await deleteQuietly(readPathFor(entry));
    await deleteQuietly(entry.filePath);
    await evictSideCars(entry.type, entry.id);
  }
  index.entries = index.entries.filter(e => e.expiresAt >= now);
}

async function evictToFitLimit(index: CacheIndex): Promise<void> {
  index.entries.sort((a, b) => a.cachedAt - b.cachedAt);
  while (index.totalBytes > index.limitBytes && index.entries.length > 0) {
    const victim = index.entries.shift()!;
    index.totalBytes -= victim.sizeBytes;
    await deleteQuietly(readPathFor(victim));
    await deleteQuietly(victim.filePath);
    await evictSideCars(victim.type, victim.id);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function cacheItem(
  type:  CachedContentType,
  id:    string,
  title: string,
  data:  unknown,
  options?: {
    subtitle?:       string;
    expiryDays?:     number;
    hasAudio?:       boolean;
    audioSizeBytes?: number;
  },
): Promise<void> {
  try {
    if (!docDir()) {
      console.warn('[CacheStorage] documentDirectory unavailable — skipping cache write');
      return;
    }
    await ensureDirs();

    const settings   = await loadSettings();
    const expiryDays = options?.expiryDays ?? settings.expiryDays;
    const now        = Date.now();
    const filePath   = buildFilePath(type, id);

    const serialized = JSON.stringify(data);
    await FileSystem.writeAsStringAsync(filePath, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const onDisk     = await fileSize(filePath);
    const jsonBytes  = onDisk > 0 ? onDisk : serialized.length;
    const audioBytes = options?.audioSizeBytes ?? 0;

    const entry: CacheEntry = {
      id,
      type,
      title,
      subtitle:       options?.subtitle,
      cachedAt:       now,
      expiresAt:      now + expiryDays * 24 * 60 * 60 * 1000,
      filePath,
      portablePath:   portablePathFor(type, id),
      sizeBytes:      jsonBytes + audioBytes,
      icon:           TYPE_META[type].icon,
      color:          TYPE_META[type].color,
      hasAudio:       options?.hasAudio ?? false,
      audioSizeBytes: audioBytes,
      // Part 59.3: audio-bearing types start "pending" and are cleared by
      // markAudioCached once the files land.
      audioPending:   hasAudioTrack(type) && !(options?.hasAudio ?? false),
    };

    const index    = await loadIndex();
    const existing = index.entries.find(e => e.id === id && e.type === type);
    if (existing) {
      index.entries    = index.entries.filter(e => !(e.id === id && e.type === type));
      index.totalBytes -= existing.sizeBytes;
      // Preserve audio accounting across a JSON re-cache. Without this,
      // re-caching a podcast whose audio is already downloaded silently zeroed
      // its audio size and made the Cache Manager under-report by megabytes.
      if (existing.hasAudio && !(options?.hasAudio ?? false)) {
        entry.hasAudio       = true;
        entry.audioSizeBytes = existing.audioSizeBytes ?? 0;
        entry.sizeBytes      = jsonBytes + (existing.audioSizeBytes ?? 0);
        entry.audioPending   = false;
      }
    }

    index.entries.unshift(entry);
    index.totalBytes += entry.sizeBytes;

    await evictExpired(index);
    if (index.totalBytes > index.limitBytes) {
      await evictToFitLimit(index);
    }

    await saveIndex(index);
  } catch (err) {
    console.warn(`[CacheStorage] cacheItem(${type}, ${id}) error:`, err);
  }
}

export async function getCachedItem<T>(
  type: CachedContentType,
  id:   string,
): Promise<T | null> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      await evictItemById(type, id);
      return null;
    }

    // Part 59.2: derived path first. Only fall back to the stored absolute
    // path when the derived one is missing (covers an odd legacy layout).
    let path: string | null = buildFilePath(type, id);
    if (!(await fileExists(path))) {
      path = (entry.filePath && await fileExists(entry.filePath)) ? entry.filePath : null;
    }

    if (!path) {
      await evictItemById(type, id);
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Index says cached AND the file is really there. */
export async function isCached(type: CachedContentType, id: string): Promise<boolean> {
  const index = await loadIndex();
  const now   = Date.now();
  const entry = index.entries.find(e => e.id === id && e.type === type && now < e.expiresAt);
  if (!entry) return false;
  return fileExists(buildFilePath(type, id));
}

export async function getCacheIndex(): Promise<CacheEntry[]> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt);
}

/** Part 59.3: one entry, for callers that need its audio state. */
export async function getCacheEntry(
  type: CachedContentType,
  id:   string,
): Promise<CacheEntry | null> {
  const index = await loadIndex();
  return index.entries.find(e => e.id === id && e.type === type) ?? null;
}

export async function evictItemById(type: CachedContentType, id: string): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);

    await deleteQuietly(buildFilePath(type, id));
    if (entry?.filePath) await deleteQuietly(entry.filePath);

    index.entries = index.entries.filter(e => !(e.id === id && e.type === type));
    await saveIndex(index);

    await evictSideCars(type, id);
  } catch (err) {
    console.warn('[CacheStorage] evictItemById error:', err);
  }
}

export async function evictByType(type: CachedContentType): Promise<void> {
  try {
    const index   = await loadIndex();
    const victims = index.entries.filter(e => e.type === type);

    for (const v of victims) {
      await deleteQuietly(buildFilePath(v.type, v.id));
      await deleteQuietly(v.filePath);
      if (v.type === 'presentation') await evictPresentationAssets(v.id);
    }

    index.entries = index.entries.filter(e => e.type !== type);
    await saveIndex(index);

    if (type === 'podcast') {
      await clearAllPodcastAudio();
    }
    if (type === 'voice_debate') {
      await Promise.allSettled([
        clearAllVoiceDebateJsonCache(),
        clearAllVoiceDebateAudioCache(),
      ]);
    }
  } catch (err) {
    console.warn('[CacheStorage] evictByType error:', err);
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const index = await loadIndex();

    for (const entry of index.entries) {
      await deleteQuietly(buildFilePath(entry.type, entry.id));
      await deleteQuietly(entry.filePath);
      if (entry.type === 'presentation') await evictPresentationAssets(entry.id);
    }

    await deleteQuietly(cacheRoot());

    await Promise.allSettled([
      clearAllPodcastAudio(),
      clearAllVoiceDebateJsonCache(),
      clearAllVoiceDebateAudioCache(),
    ]);

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
    voice_debate:   { count: 0, bytes: 0 },
  } as Record<CachedContentType, { count: number; bytes: number }>;

  let totalBytes            = 0;
  let podcastsWithAudio     = 0;
  let audioBytesTotal       = 0;
  let voiceDebatesWithAudio = 0;
  let voiceDebateAudioBytes = 0;
  let itemsAwaitingAudio    = 0;

  for (const e of valid) {
    byType[e.type].count++;
    byType[e.type].bytes += e.sizeBytes;
    totalBytes += e.sizeBytes;

    if (e.type === 'podcast' && e.hasAudio) {
      podcastsWithAudio++;
      audioBytesTotal += e.audioSizeBytes ?? 0;
    }
    if (e.type === 'voice_debate' && e.hasAudio) {
      voiceDebatesWithAudio++;
      voiceDebateAudioBytes += e.audioSizeBytes ?? 0;
    }
    if (hasAudioTrack(e.type) && !e.hasAudio) {
      itemsAwaitingAudio++;
    }
  }

  return {
    totalItems:  valid.length,
    totalBytes,
    limitBytes:  index.limitBytes,
    percentUsed: index.limitBytes > 0 ? (totalBytes / index.limitBytes) * 100 : 0,
    byType,
    podcastsWithAudio,
    audioBytesTotal,
    voiceDebatesWithAudio,
    voiceDebateAudioBytes,
    itemsAwaitingAudio,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Audio accounting ─────────────────────────────────────────────────────────

/**
 * Part 59.3 — record that an item's audio is on disk, with its real size.
 *
 * Replaces markPodcastAudioCached / markVoiceDebateAudioCached, which were the
 * same twelve lines twice and had drifted: one of them recomputed sizeBytes
 * before capturing the old audio value in an early revision, so the addition
 * and subtraction cancelled and the size never grew.
 *
 * Returns the byte delta applied to the index, so a caller reconciling many
 * entries can report how much the total moved.
 */
export async function markAudioCached(
  type:           CachedContentType,
  id:             string,
  audioSizeBytes: number,
): Promise<number> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);
    if (!entry) {
      console.warn(`[CacheStorage] markAudioCached: no index entry for ${type}:${id}`);
      return 0;
    }

    const oldAudioBytes = entry.audioSizeBytes ?? 0;
    entry.hasAudio       = audioSizeBytes > 0;
    entry.audioSizeBytes = audioSizeBytes;
    entry.audioPending   = audioSizeBytes <= 0 && hasAudioTrack(type);
    entry.sizeBytes      = Math.max(0, entry.sizeBytes - oldAudioBytes) + audioSizeBytes;

    await saveIndex(index);
    return audioSizeBytes - oldAudioBytes;
  } catch (err) {
    console.warn('[CacheStorage] markAudioCached error:', err);
    return 0;
  }
}

/** @deprecated Part 59.3 — use markAudioCached('podcast', …). */
export async function markPodcastAudioCached(
  podcastId: string,
  audioSizeBytes: number,
): Promise<void> {
  await markAudioCached('podcast', podcastId, audioSizeBytes);
}

/** @deprecated Part 59.3 — use markAudioCached('voice_debate', …). */
export async function markVoiceDebateAudioCached(
  voiceDebateId: string,
  audioSizeBytes: number,
): Promise<void> {
  await markAudioCached('voice_debate', voiceDebateId, audioSizeBytes);
}

/** Clear the audio flag when audio is evicted but the JSON is kept. */
export async function clearAudioFlag(
  type: CachedContentType,
  id:   string,
): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === id && e.type === type);
    if (!entry) return;
    entry.sizeBytes      = Math.max(0, entry.sizeBytes - (entry.audioSizeBytes ?? 0));
    entry.hasAudio       = false;
    entry.audioSizeBytes = 0;
    entry.audioPending   = hasAudioTrack(type);
    await saveIndex(index);
  } catch { /* non-fatal */ }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export async function cacheReport(report: { id: string; title: string; [k: string]: unknown }): Promise<void> {
  await cacheItem('report', report.id, report.title, report, { subtitle: 'Research Report' });
}
export async function getCachedReport<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('report', id);
}

export async function cachePodcast(podcast: { id: string; title: string; [k: string]: unknown }): Promise<void> {
  await cacheItem('podcast', podcast.id, podcast.title, podcast, { subtitle: 'Podcast Episode' });
}
export async function getCachedPodcast<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('podcast', id);
}

export async function cacheDebate(debate: { id: string; topic: string; [k: string]: unknown }): Promise<void> {
  await cacheItem('debate', debate.id, debate.topic, debate, { subtitle: 'AI Debate' });
}
export async function getCachedDebate<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('debate', id);
}

export async function cacheAcademicPaper(paper: { id: string; title: string; [k: string]: unknown }): Promise<void> {
  await cacheItem('academic_paper', paper.id, paper.title, paper, { subtitle: 'Academic Paper' });
}
export async function getCachedAcademicPaper<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('academic_paper', id);
}

export async function cachePresentation(pres: { id: string; title: string; [k: string]: unknown }): Promise<void> {
  await cacheItem('presentation', pres.id, pres.title, pres, { subtitle: 'Presentation' });
}
export async function getCachedPresentation<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('presentation', id);
}

export async function cacheVoiceDebate(vd: { id: string; topic: string; [k: string]: unknown }): Promise<void> {
  const turns    = (vd as { totalTurns?: number }).totalTurns ?? 0;
  const durMin   = Math.round(((vd as { durationSeconds?: number }).durationSeconds ?? 0) / 60);
  const subtitle = `${turns} turns · ${durMin} min`;
  await cacheItem('voice_debate', vd.id, vd.topic as string, vd, { subtitle });
}
export async function getCachedVoiceDebate<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('voice_debate', id);
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

export { cacheReport as cacheReportLegacy };
export { getCachedReport as getCachedReportLegacy };

export async function getCacheSize(): Promise<number> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt).length;
}

export { buildFilePath as buildCacheFilePath };