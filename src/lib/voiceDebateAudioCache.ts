// src/lib/voiceDebateAudioCache.ts
// Part 41.2 — Voice Debate Audio Cache
//
// Downloads and caches voice debate TTS segments locally so the debate
// can be played offline or on a different device after initial generation.
//
// STRATEGY:
//   1. On generation complete, audio is already local → played immediately.
//   2. Background upload to Supabase Storage runs (voiceDebateAudioUploadService).
//   3. When user opens the player on ANOTHER device, cloud URLs are fetched
//      and streamed directly by VoiceDebateAudioEngine (HTTPS → expo-av).
//   4. Optionally, segments can be pre-downloaded locally for true offline play.
//
// CACHE DIRECTORY:
//   documentDirectory/deepdive_voice_debate_cache/{voiceDebateId}/turn_{N}.mp3
//
// INDEX:
//   AsyncStorage key: deepdive:vd:audio:index:v41
//   Per-entry key:    deepdive:vd:audio:{voiceDebateId}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_INDEX_KEY  = 'deepdive:vd:audio:index:v41';
const CACHE_DIR_BASE   = `${FileSystem.documentDirectory}deepdive_voice_debate_cache/`;
const CONCURRENCY      = 2;
const MIN_SUCCESS_RATE = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceDebateAudioCacheEntry {
  voiceDebateId:  string;
  topic:          string;
  cachedAt:       number;
  expiresAt:      number;
  totalBytes:     number;
  successCount:   number;
  totalCount:     number;
  segments:       { turnIndex: number; localPath: string; isAvailable: boolean; sizeBytes: number }[];
}

interface CacheIndex {
  entries: { voiceDebateId: string; totalBytes: number; cachedAt: number; expiresAt: number }[];
  version: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheDir(voiceDebateId: string): string {
  const safe = voiceDebateId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
  return `${CACHE_DIR_BASE}${safe}/`;
}

function segmentPath(voiceDebateId: string, index: number): string {
  return `${cacheDir(voiceDebateId)}turn_${index}.mp3`;
}

async function ensureDir(voiceDebateId: string): Promise<void> {
  const dir = cacheDir(voiceDebateId);
  const info = await FileSystem.getInfoAsync(dir).catch(() => ({ exists: false }));
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  }
}

function isRemote(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<CacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === 41) return parsed;
    }
  } catch {}
  return { entries: [], version: 41 };
}

async function saveIndex(index: CacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

const entryKey = (id: string) => `deepdive:vd:audio:${id}`;

async function loadEntry(voiceDebateId: string): Promise<VoiceDebateAudioCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(entryKey(voiceDebateId));
    if (raw) return JSON.parse(raw) as VoiceDebateAudioCacheEntry;
  } catch {}
  return null;
}

async function saveEntry(entry: VoiceDebateAudioCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(entryKey(entry.voiceDebateId), JSON.stringify(entry));
  } catch {}
}

// ─── Download single segment ──────────────────────────────────────────────────

async function downloadSegment(
  source: string,
  dest:   string,
): Promise<{ success: boolean; sizeBytes: number }> {
  try {
    // Already cached?
    const existing = await FileSystem.getInfoAsync(dest).catch(() => ({ exists: false }));
    if (existing.exists && (existing as any).size > 100) {
      return { success: true, sizeBytes: (existing as any).size ?? 0 };
    }

    if (isRemote(source)) {
      const result = await FileSystem.downloadAsync(source, dest);
      if (result.status === 200) {
        const info = await FileSystem.getInfoAsync(dest).catch(() => ({ exists: false }));
        return { success: true, sizeBytes: (info as any).size ?? 0 };
      }
      return { success: false, sizeBytes: 0 };
    } else {
      // Local file — copy
      const srcInfo = await FileSystem.getInfoAsync(source).catch(() => ({ exists: false }));
      if (!srcInfo.exists) return { success: false, sizeBytes: 0 };
      await FileSystem.copyAsync({ from: source, to: dest });
      const info = await FileSystem.getInfoAsync(dest).catch(() => ({ exists: false }));
      return { success: true, sizeBytes: (info as any).size ?? 0 };
    }
  } catch (err) {
    console.warn(`[VoiceDebateAudioCache] segment error (${source}):`, err);
    return { success: false, sizeBytes: 0 };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AudioDownloadProgress {
  voiceDebateId:    string;
  segmentsComplete: number;
  segmentsTotal:    number;
  bytesDownloaded:  number;
  isComplete:       boolean;
}

/**
 * Download all audio turns for a voice debate and store them locally.
 * Accepts both local file:// paths and cloud https:// URLs as sources.
 */
export async function downloadVoiceDebateAudio(
  voiceDebateId: string,
  topic:         string,
  audioPaths:    string[],
  onProgress?:   (p: AudioDownloadProgress) => void,
  expiryDays     = 30,
): Promise<boolean> {
  const paths = audioPaths.filter(Boolean);
  if (paths.length === 0) return false;

  await ensureDir(voiceDebateId);

  const segments: VoiceDebateAudioCacheEntry['segments'] = [];
  let successCount    = 0;
  let totalBytes      = 0;
  let bytesDownloaded = 0;

  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (src, bi) => {
        const idx  = i + bi;
        const dest = segmentPath(voiceDebateId, idx);
        const r    = await downloadSegment(src, dest);
        return { idx, dest, ...r };
      })
    );

    for (const r of results) {
      segments[r.idx] = {
        turnIndex:   r.idx,
        localPath:   r.dest,
        sizeBytes:   r.sizeBytes,
        isAvailable: r.success,
      };
      if (r.success) {
        successCount++;
        totalBytes      += r.sizeBytes;
        bytesDownloaded += r.sizeBytes;
      }
    }

    onProgress?.({
      voiceDebateId,
      segmentsComplete: Math.min(i + CONCURRENCY, paths.length),
      segmentsTotal:    paths.length,
      bytesDownloaded,
      isComplete:       false,
    });
  }

  // Fill missing slots
  for (let i = 0; i < paths.length; i++) {
    if (!segments[i]) {
      segments[i] = {
        turnIndex:   i,
        localPath:   segmentPath(voiceDebateId, i),
        sizeBytes:   0,
        isAvailable: false,
      };
    }
  }

  const success   = successCount / paths.length >= MIN_SUCCESS_RATE;
  const now       = Date.now();
  const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  const entry: VoiceDebateAudioCacheEntry = {
    voiceDebateId,
    topic,
    segments,
    totalBytes,
    cachedAt:     now,
    expiresAt,
    successCount,
    totalCount:   paths.length,
  };

  await saveEntry(entry);

  const index = await loadIndex();
  index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
  if (success) {
    index.entries.push({ voiceDebateId, totalBytes, cachedAt: now, expiresAt });
  }
  await saveIndex(index);

  onProgress?.({
    voiceDebateId,
    segmentsComplete: paths.length,
    segmentsTotal:    paths.length,
    bytesDownloaded,
    isComplete:       true,
  });

  return success;
}

/**
 * Get local file paths for all turns of a voice debate.
 * Returns null if not cached or expired.
 */
export async function getLocalVoiceDebateAudioPaths(voiceDebateId: string): Promise<string[] | null> {
  try {
    const entry = await loadEntry(voiceDebateId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { await evictVoiceDebateAudio(voiceDebateId); return null; }
    if (entry.successCount / entry.totalCount < MIN_SUCCESS_RATE) return null;
    return entry.segments.map(s => s.isAvailable ? s.localPath : '');
  } catch {
    return null;
  }
}

/**
 * Check if a voice debate has audio cached locally.
 */
export async function isVoiceDebateAudioCached(voiceDebateId: string): Promise<boolean> {
  try {
    const entry = await loadEntry(voiceDebateId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;
    return entry.successCount / entry.totalCount >= MIN_SUCCESS_RATE;
  } catch {
    return false;
  }
}

/**
 * Delete all cached audio for a voice debate.
 */
export async function evictVoiceDebateAudio(voiceDebateId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(cacheDir(voiceDebateId), { idempotent: true }).catch(() => {});
    await AsyncStorage.removeItem(entryKey(voiceDebateId)).catch(() => {});
    const index = await loadIndex();
    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
    await saveIndex(index);
  } catch {}
}

/**
 * Total bytes used by all cached voice debate audio.
 */
export async function getVoiceDebateAudioCacheBytes(): Promise<number> {
  try {
    const index = await loadIndex();
    const now   = Date.now();
    return index.entries
      .filter(e => now < e.expiresAt)
      .reduce((s, e) => s + e.totalBytes, 0);
  } catch {
    return 0;
  }
}

/**
 * Clear ALL cached voice debate audio.
 */
export async function clearAllVoiceDebateAudioCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR_BASE, { idempotent: true }).catch(() => {});
    const index = await loadIndex();
    for (const e of index.entries) {
      await AsyncStorage.removeItem(entryKey(e.voiceDebateId)).catch(() => {});
    }
    await saveIndex({ entries: [], version: 41 });
  } catch {}
}