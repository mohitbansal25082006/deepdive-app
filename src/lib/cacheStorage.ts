// src/lib/cacheStorage.ts
// Part 45 — Updated: added 'voice_debate' to TYPE_META and all helpers.
//
// CHANGES from Part 41.7:
//   • voice_debate added to TYPE_META with icon, color, dir
//   • evictItemById / evictByType / clearAllCache handle voice_debate eviction
//     (calls evictVoiceDebateJson + evictVoiceDebateAudio)
//   • getCacheStats includes voiceDebatesWithAudio / voiceDebateAudioBytes
//   • markVoiceDebateAudioCached helper added (mirrors markPodcastAudioCached)
//   • cacheVoiceDebate / getCachedVoiceDebate convenience wrappers added
//   • INDEX_VERSION bumped to 45 (migration: existing v22 entries are read
//     as-is; version mismatch triggers a clean index which forces re-cache)
//
// All other code is byte-for-byte identical to Part 41.7.

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

const INDEX_KEY        = 'deepdive:cache:index:v45';
const SETTINGS_KEY     = 'deepdive:cache:settings:v45';
const CACHE_DIR        = `${FileSystem.documentDirectory}deepdive_cache/`;
const INDEX_VERSION    = 45;
const DEFAULT_LIMIT_MB = 100;
const DEFAULT_EXPIRY_D = 30;

// ─── Type metadata ────────────────────────────────────────────────────────────
// Part 45: voice_debate added

const TYPE_META: Record<CachedContentType, { icon: string; color: string; dir: string }> = {
  report:         { icon: 'document-text-outline',   color: '#6C63FF', dir: 'reports'        },
  podcast:        { icon: 'radio-outline',            color: '#FF6584', dir: 'podcasts'       },
  debate:         { icon: 'chatbox-ellipses-outline', color: '#F97316', dir: 'debates'        },
  academic_paper: { icon: 'school-outline',           color: '#43E97B', dir: 'papers'         },
  presentation:   { icon: 'easel-outline',            color: '#29B6F6', dir: 'presentations'  },
  voice_debate:   { icon: 'mic-circle-outline',       color: '#8B5CF6', dir: 'voice_debates'  },
};

// ─── Ensure cache directories exist ──────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  try {
    const rootInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!rootInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    for (const meta of Object.values(TYPE_META)) {
      const dir  = `${CACHE_DIR}${meta.dir}/`;
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
    // Try reading old v22 index and migrate entries
    const oldRaw = await AsyncStorage.getItem('deepdive:cache:index:v22');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as CacheIndex;
      // Migrate: keep existing entries but bump version
      const migrated: CacheIndex = {
        entries:    oldParsed.entries ?? [],
        totalBytes: oldParsed.totalBytes ?? 0,
        limitBytes: oldParsed.limitBytes ?? DEFAULT_LIMIT_MB * 1024 * 1024,
        version:    INDEX_VERSION,
      };
      await saveIndex(migrated);
      return migrated;
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
    index.totalBytes = index.entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[CacheStorage] saveIndex error:', err);
  }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function loadSettings(): Promise<CacheSettings> {
  try {
    // Try new key first
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheSettings;
      if (typeof parsed.cacheAudio === 'undefined') parsed.cacheAudio = false;
      if (typeof parsed.cacheVoiceDebate === 'undefined') parsed.cacheVoiceDebate = false;
      return parsed;
    }
    // Try migrating old settings key
    const oldRaw = await AsyncStorage.getItem('deepdive:cache:settings:v22');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as Partial<CacheSettings>;
      return {
        limitBytes:       oldParsed.limitBytes       ?? DEFAULT_LIMIT_MB * 1024 * 1024,
        autoCache:        oldParsed.autoCache        ?? true,
        expiryDays:       oldParsed.expiryDays       ?? DEFAULT_EXPIRY_D,
        cacheAudio:       oldParsed.cacheAudio       ?? false,
        cacheVoiceDebate: false,
      };
    }
  } catch {}
  return {
    limitBytes:       DEFAULT_LIMIT_MB * 1024 * 1024,
    autoCache:        true,
    expiryDays:       DEFAULT_EXPIRY_D,
    cacheAudio:       false,
    cacheVoiceDebate: false,
  };
}

export async function saveSettings(settings: CacheSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    const index      = await loadIndex();
    index.limitBytes = settings.limitBytes;
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] saveSettings error:', err);
  }
}

// ─── File path builder ────────────────────────────────────────────────────────

function buildFilePath(type: CachedContentType, id: string): string {
  const dir    = TYPE_META[type].dir;
  const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
  return `${CACHE_DIR}${dir}/${safeId}.json`;
}

// ─── Eviction helpers ─────────────────────────────────────────────────────────

/** Clean up podcast audio for an evicted podcast entry. */
async function evictPodcastAudioFor(id: string): Promise<void> {
  try {
    const { evictPodcastAudio } = await import('./podcastAudioCache');
    await evictPodcastAudio(id);
  } catch {}
}

/** Clean up downloaded image/SVG assets for an evicted presentation entry. */
async function evictPresentationAssetsFor(id: string): Promise<void> {
  try {
    const { evictPresentationAssets } = await import('./presentationAssetCache');
    await evictPresentationAssets(id);
  } catch {}
}

/**
 * Part 45: Clean up voice debate JSON + audio for an evicted voice_debate entry.
 */
async function evictVoiceDebateFor(id: string): Promise<void> {
  try {
    const { evictVoiceDebateJson }   = await import('./voiceDebateCache');
    const { evictVoiceDebateAudio }  = await import('./voiceDebateAudioCache');
    await Promise.allSettled([
      evictVoiceDebateJson(id),
      evictVoiceDebateAudio(id),
    ]);
  } catch {}
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

async function evictExpired(index: CacheIndex): Promise<void> {
  const now     = Date.now();
  const expired = index.entries.filter(e => e.expiresAt < now);
  for (const entry of expired) {
    try { await FileSystem.deleteAsync(entry.filePath, { idempotent: true }); } catch {}
    if (entry.type === 'podcast')      await evictPodcastAudioFor(entry.id);
    if (entry.type === 'presentation') await evictPresentationAssetsFor(entry.id);
    if (entry.type === 'voice_debate') await evictVoiceDebateFor(entry.id);
  }
  index.entries = index.entries.filter(e => e.expiresAt >= now);
}

async function evictToFitLimit(index: CacheIndex): Promise<void> {
  index.entries.sort((a, b) => a.cachedAt - b.cachedAt);
  while (index.totalBytes > index.limitBytes && index.entries.length > 0) {
    const victim = index.entries.shift()!;
    index.totalBytes -= victim.sizeBytes;
    try { await FileSystem.deleteAsync(victim.filePath, { idempotent: true }); } catch {}
    if (victim.type === 'podcast')      await evictPodcastAudioFor(victim.id);
    if (victim.type === 'presentation') await evictPresentationAssetsFor(victim.id);
    if (victim.type === 'voice_debate') await evictVoiceDebateFor(victim.id);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function cacheItem(
  type:    CachedContentType,
  id:      string,
  title:   string,
  data:    unknown,
  options?: {
    subtitle?:       string;
    expiryDays?:     number;
    hasAudio?:       boolean;
    audioSizeBytes?: number;
  },
): Promise<void> {
  try {
    await ensureDirs();

    const settings   = await loadSettings();
    const expiryDays = options?.expiryDays ?? settings.expiryDays;
    const now        = Date.now();
    const filePath   = buildFilePath(type, id);

    const serialized = JSON.stringify(data);
    await FileSystem.writeAsStringAsync(filePath, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const fileInfo   = await FileSystem.getInfoAsync(filePath);
    const jsonBytes  = (fileInfo as any).size ?? serialized.length;
    const audioBytes = options?.audioSizeBytes ?? 0;
    const sizeBytes  = jsonBytes + audioBytes;

    const entry: CacheEntry = {
      id,
      type,
      title,
      subtitle:       options?.subtitle,
      cachedAt:       now,
      expiresAt:      now + expiryDays * 24 * 60 * 60 * 1000,
      filePath,
      sizeBytes,
      icon:           TYPE_META[type].icon,
      color:          TYPE_META[type].color,
      hasAudio:       options?.hasAudio ?? false,
      audioSizeBytes: audioBytes,
    };

    const index    = await loadIndex();
    const existing = index.entries.find(e => e.id === id && e.type === type);
    if (existing) {
      index.entries    = index.entries.filter(e => !(e.id === id && e.type === type));
      index.totalBytes -= existing.sizeBytes;
    }

    index.entries.unshift(entry);
    index.totalBytes += sizeBytes;

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
    const raw = await FileSystem.readAsStringAsync(entry.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function isCached(type: CachedContentType, id: string): Promise<boolean> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.some(e => e.id === id && e.type === type && now < e.expiresAt);
}

export async function getCacheIndex(): Promise<CacheEntry[]> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt);
}

/**
 * Evict a single item by id + type.
 * Part 45: also evicts voice_debate audio+JSON for 'voice_debate' type.
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

    if (type === 'podcast')      await evictPodcastAudioFor(id);
    if (type === 'presentation') await evictPresentationAssetsFor(id);
    if (type === 'voice_debate') await evictVoiceDebateFor(id);
  } catch (err) {
    console.warn('[CacheStorage] evictItemById error:', err);
  }
}

/**
 * Evict all items of a given type.
 * Part 45: also clears all voice_debate audio+JSON when type === 'voice_debate'.
 */
export async function evictByType(type: CachedContentType): Promise<void> {
  try {
    const index   = await loadIndex();
    const victims = index.entries.filter(e => e.type === type);
    for (const v of victims) {
      try { await FileSystem.deleteAsync(v.filePath, { idempotent: true }); } catch {}
      if (v.type === 'presentation') await evictPresentationAssetsFor(v.id);
    }
    index.entries = index.entries.filter(e => e.type !== type);
    await saveIndex(index);

    if (type === 'podcast') {
      try {
        const { clearAllPodcastAudio } = await import('./podcastAudioCache');
        await clearAllPodcastAudio();
      } catch {}
    }
    if (type === 'voice_debate') {
      try {
        const { clearAllVoiceDebateJsonCache } = await import('./voiceDebateCache');
        const { clearAllVoiceDebateAudioCache } = await import('./voiceDebateAudioCache');
        await Promise.allSettled([
          clearAllVoiceDebateJsonCache(),
          clearAllVoiceDebateAudioCache(),
        ]);
      } catch {}
    }
  } catch (err) {
    console.warn('[CacheStorage] evictByType error:', err);
  }
}

/**
 * Clear the entire cache (all types).
 * Part 45: also clears all voice_debate audio+JSON.
 */
export async function clearAllCache(): Promise<void> {
  try {
    const index = await loadIndex();
    for (const entry of index.entries) {
      try { await FileSystem.deleteAsync(entry.filePath, { idempotent: true }); } catch {}
      if (entry.type === 'presentation') await evictPresentationAssetsFor(entry.id);
    }
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch {}

    try {
      const { clearAllPodcastAudio } = await import('./podcastAudioCache');
      await clearAllPodcastAudio();
    } catch {}

    try {
      const { clearAllVoiceDebateJsonCache }  = await import('./voiceDebateCache');
      const { clearAllVoiceDebateAudioCache } = await import('./voiceDebateAudioCache');
      await Promise.allSettled([
        clearAllVoiceDebateJsonCache(),
        clearAllVoiceDebateAudioCache(),
      ]);
    } catch {}

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

  let totalBytes             = 0;
  let podcastsWithAudio      = 0;
  let audioBytesTotal        = 0;
  let voiceDebatesWithAudio  = 0;
  let voiceDebateAudioBytes  = 0;

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
  }

  return {
    totalItems:           valid.length,
    totalBytes,
    limitBytes:           index.limitBytes,
    percentUsed:          index.limitBytes > 0 ? (totalBytes / index.limitBytes) * 100 : 0,
    byType,
    podcastsWithAudio,
    audioBytesTotal,
    voiceDebatesWithAudio,
    voiceDebateAudioBytes,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function markPodcastAudioCached(
  podcastId:      string,
  audioSizeBytes: number,
): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === podcastId && e.type === 'podcast');
    if (entry) {
      // Capture the OLD audio size BEFORE overwriting — otherwise the subtraction
      // cancels the addition and sizeBytes never increases.
      const oldAudioBytes    = entry.audioSizeBytes ?? 0;
      entry.hasAudio         = true;
      entry.audioSizeBytes   = audioSizeBytes;
      entry.sizeBytes        = (entry.sizeBytes - oldAudioBytes) + audioSizeBytes;
    }
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] markPodcastAudioCached error:', err);
  }
}

/**
 * Part 45: Mark voice debate as having audio cached (updates index entry).
 */
export async function markVoiceDebateAudioCached(
  voiceDebateId:  string,
  audioSizeBytes: number,
): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.id === voiceDebateId && e.type === 'voice_debate');
    if (entry) {
      // Capture the OLD audio size BEFORE overwriting — same fix as markPodcastAudioCached.
      const oldAudioBytes    = entry.audioSizeBytes ?? 0;
      entry.hasAudio         = true;
      entry.audioSizeBytes   = audioSizeBytes;
      entry.sizeBytes        = (entry.sizeBytes - oldAudioBytes) + audioSizeBytes;
    }
    await saveIndex(index);
  } catch (err) {
    console.warn('[CacheStorage] markVoiceDebateAudioCached error:', err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export async function cacheReport(report: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('report', report.id, report.title, report, { subtitle: 'Research Report' });
}
export async function getCachedReport<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('report', id);
}

export async function cachePodcast(podcast: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('podcast', podcast.id, podcast.title, podcast, { subtitle: 'Podcast Episode' });
}
export async function getCachedPodcast<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('podcast', id);
}

export async function cacheDebate(debate: { id: string; topic: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('debate', debate.id, debate.topic, debate, { subtitle: 'AI Debate' });
}
export async function getCachedDebate<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('debate', id);
}

export async function cacheAcademicPaper(paper: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('academic_paper', paper.id, paper.title, paper, { subtitle: 'Academic Paper' });
}
export async function getCachedAcademicPaper<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('academic_paper', id);
}

export async function cachePresentation(pres: { id: string; title: string; [key: string]: unknown }): Promise<void> {
  await cacheItem('presentation', pres.id, pres.title, pres, { subtitle: 'Presentation' });
}
export async function getCachedPresentation<T = unknown>(id: string): Promise<T | null> {
  return getCachedItem<T>('presentation', id);
}

/**
 * Part 45: Cache a voice debate object in the main index.
 * Also see voiceDebateCache.ts for the separate JSON cache (used by OfflineVoiceDebateViewer).
 */
export async function cacheVoiceDebate(vd: { id: string; topic: string; [key: string]: unknown }): Promise<void> {
  const turns    = (vd as any).totalTurns ?? 0;
  const durMin   = Math.round(((vd as any).durationSeconds ?? 0) / 60);
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