// src/lib/podcastAudioCache.ts
// Part 23 — Podcast Audio Cache.
//
// Downloads podcast audio segments to the device filesystem so podcasts
// can be played fully offline (not just transcript view).
//
// ARCHITECTURE:
//   • Each podcast's audio segments are downloaded to:
//       documentDirectory/deepdive_cache/audio/<podcastId>/segment_<N>.mp3
//   • The AudioCacheEntry for each podcast is stored in AsyncStorage.
//   • The AudioCacheIndex (list of all cached podcast IDs) is also in AsyncStorage.
//
// USAGE:
//   import { downloadPodcastAudio, getLocalAudioPaths } from '../lib/podcastAudioCache';
//
//   // Download audio for offline playback
//   await downloadPodcastAudio(podcast, (progress) => console.log(progress));
//
//   // Get local paths to pass to usePodcastPlayer
//   const localPaths = await getLocalAudioPaths(podcast.id);
//
// NOTE ON AUDIO DOWNLOAD STRATEGY:
//   • Segments that are already local file:/// paths are copied (not re-downloaded).
//   • Segments that are https:// URLs are downloaded via FileSystem.downloadAsync.
//   • Segments are downloaded 3 at a time (concurrent but not all at once).
//   • A podcast is considered "audio cached" if ≥ 50% of segments succeed.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { Podcast } from '../types';
import type {
  AudioCacheEntry,
  AudioCacheIndex,
  AudioCacheSegment,
  AudioDownloadProgress,
} from '../types/cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIO_INDEX_KEY  = 'deepdive:audio:index:v23';
const AUDIO_DIR_BASE   = `${FileSystem.documentDirectory}deepdive_cache/audio/`;
const CONCURRENCY      = 3;    // simultaneous segment downloads
const MIN_SUCCESS_RATE = 0.5;  // need ≥50% segments to mark as cached

// ─── Helpers ─────────────────────────────────────────────────────────────────

function audioDirForPodcast(podcastId: string): string {
  const safeId = podcastId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
  return `${AUDIO_DIR_BASE}${safeId}/`;
}

function segmentPath(podcastId: string, index: number): string {
  return `${audioDirForPodcast(podcastId)}segment_${index}.mp3`;
}

async function ensureAudioDir(podcastId: string): Promise<void> {
  const dir = audioDirForPodcast(podcastId);
  const info = await FileSystem.getInfoAsync(dir).catch(() => ({ exists: false }));
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  }
}

function isRemoteUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

// ─── Audio Index (AsyncStorage) ───────────────────────────────────────────────

async function loadAudioIndex(): Promise<AudioCacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(AUDIO_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AudioCacheIndex;
      if (parsed.version === 23) return parsed;
    }
  } catch {}
  return { entries: [], version: 23 };
}

async function saveAudioIndex(index: AudioCacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(AUDIO_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[PodcastAudioCache] saveAudioIndex error:', err);
  }
}

// ─── Per-podcast Audio Entry ──────────────────────────────────────────────────

const ENTRY_KEY = (id: string) => `deepdive:audio:cache:${id}`;

async function loadAudioEntry(podcastId: string): Promise<AudioCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(ENTRY_KEY(podcastId));
    if (raw) return JSON.parse(raw) as AudioCacheEntry;
  } catch {}
  return null;
}

async function saveAudioEntry(entry: AudioCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(ENTRY_KEY(entry.podcastId), JSON.stringify(entry));
  } catch (err) {
    console.warn('[PodcastAudioCache] saveAudioEntry error:', err);
  }
}

// ─── Download a single segment ────────────────────────────────────────────────

async function downloadSegment(
  sourcePath: string,
  destPath:   string,
): Promise<{ success: boolean; sizeBytes: number }> {
  try {
    // Check if destination already exists and is non-empty
    const existing = await FileSystem.getInfoAsync(destPath).catch(() => ({ exists: false }));
    if (existing.exists && (existing as any).size > 100) {
      return { success: true, sizeBytes: (existing as any).size ?? 0 };
    }

    if (isRemoteUrl(sourcePath)) {
      // Download from Supabase Storage or any https:// URL
      const result = await FileSystem.downloadAsync(sourcePath, destPath);
      if (result.status === 200) {
        const info = await FileSystem.getInfoAsync(destPath).catch(() => ({ exists: false }));
        return { success: true, sizeBytes: (info as any).size ?? 0 };
      }
      return { success: false, sizeBytes: 0 };
    } else {
      // Local file:/// path — copy to our cache directory
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath).catch(() => ({ exists: false }));
      if (!sourceInfo.exists) return { success: false, sizeBytes: 0 };

      await FileSystem.copyAsync({ from: sourcePath, to: destPath });
      const info = await FileSystem.getInfoAsync(destPath).catch(() => ({ exists: false }));
      return { success: true, sizeBytes: (info as any).size ?? 0 };
    }
  } catch (err) {
    console.warn(`[PodcastAudioCache] downloadSegment error (${sourcePath}):`, err);
    return { success: false, sizeBytes: 0 };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Download all audio segments for a podcast and store them locally.
 * Progress callback fires after each segment completes.
 *
 * @returns true if ≥50% of segments were cached successfully
 */
export async function downloadPodcastAudio(
  podcast:   Podcast,
  onProgress?: (progress: AudioDownloadProgress) => void,
  expiryDays?: number,
): Promise<boolean> {
  const paths = (podcast.audioSegmentPaths ?? []).filter(Boolean);
  if (paths.length === 0) {
    onProgress?.({
      podcastId: podcast.id,
      segmentsComplete: 0,
      segmentsTotal: 0,
      bytesDownloaded: 0,
      isComplete: true,
      error: 'No audio segments to cache',
    });
    return false;
  }

  try {
    await ensureAudioDir(podcast.id);
  } catch {
    return false;
  }

  const segments: AudioCacheSegment[] = [];
  let successCount   = 0;
  let totalBytes     = 0;
  let bytesDownloaded = 0;

  // Process segments in batches of CONCURRENCY
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (srcPath, batchIdx) => {
        const idx  = i + batchIdx;
        const dest = segmentPath(podcast.id, idx);
        const result = await downloadSegment(srcPath, dest);
        return { idx, dest, ...result };
      })
    );

    for (const r of batchResults) {
      const seg: AudioCacheSegment = {
        turnIndex:   r.idx,
        localPath:   r.dest,
        sizeBytes:   r.sizeBytes,
        isAvailable: r.success,
      };
      segments[r.idx] = seg;

      if (r.success) {
        successCount++;
        totalBytes += r.sizeBytes;
        bytesDownloaded += r.sizeBytes;
      }
    }

    onProgress?.({
      podcastId:        podcast.id,
      segmentsComplete: Math.min(i + CONCURRENCY, paths.length),
      segmentsTotal:    paths.length,
      bytesDownloaded,
      isComplete:       false,
    });
  }

  const successRate = paths.length > 0 ? successCount / paths.length : 0;
  const isSuccess   = successRate >= MIN_SUCCESS_RATE;

  // Fill in any missing segment slots
  for (let i = 0; i < paths.length; i++) {
    if (!segments[i]) {
      segments[i] = {
        turnIndex:   i,
        localPath:   segmentPath(podcast.id, i),
        sizeBytes:   0,
        isAvailable: false,
      };
    }
  }

  const expiryMs = (expiryDays ?? 30) * 24 * 60 * 60 * 1000;
  const now      = Date.now();

  const entry: AudioCacheEntry = {
    podcastId:    podcast.id,
    podcastTitle: podcast.title,
    segments,
    totalBytes,
    cachedAt:     now,
    expiresAt:    now + expiryMs,
    successCount,
    totalCount:   paths.length,
  };

  await saveAudioEntry(entry);

  // Update the global audio index
  const index = await loadAudioIndex();
  index.entries = index.entries.filter(e => e.podcastId !== podcast.id);
  if (isSuccess) {
    index.entries.push({
      podcastId:  podcast.id,
      totalBytes,
      cachedAt:   now,
      expiresAt:  now + expiryMs,
    });
  }
  await saveAudioIndex(index);

  onProgress?.({
    podcastId:        podcast.id,
    segmentsComplete: paths.length,
    segmentsTotal:    paths.length,
    bytesDownloaded,
    isComplete:       true,
  });

  return isSuccess;
}

/**
 * Get local file paths for all segments of a podcast.
 * Returns null if audio has not been cached or has expired.
 * The returned array maps 1:1 to podcast.script.turns.
 */
export async function getLocalAudioPaths(podcastId: string): Promise<string[] | null> {
  try {
    const entry = await loadAudioEntry(podcastId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      await evictPodcastAudio(podcastId);
      return null;
    }
    if (entry.successCount / entry.totalCount < MIN_SUCCESS_RATE) return null;

    // Return local paths — null for failed segments so caller can skip them
    return entry.segments.map(seg =>
      seg.isAvailable ? seg.localPath : ''
    );
  } catch {
    return null;
  }
}

/**
 * Check whether audio has been cached for a podcast (and not expired).
 */
export async function isPodcastAudioCached(podcastId: string): Promise<boolean> {
  try {
    const entry = await loadAudioEntry(podcastId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;
    return entry.successCount / entry.totalCount >= MIN_SUCCESS_RATE;
  } catch {
    return false;
  }
}

/**
 * Get the AudioCacheEntry for a podcast (for display in CacheManagerModal).
 * Returns null if not cached.
 */
export async function getPodcastAudioEntry(podcastId: string): Promise<AudioCacheEntry | null> {
  return loadAudioEntry(podcastId);
}

/**
 * Delete all cached audio files for a podcast.
 */
export async function evictPodcastAudio(podcastId: string): Promise<void> {
  try {
    const dir = audioDirForPodcast(podcastId);
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
    await AsyncStorage.removeItem(ENTRY_KEY(podcastId)).catch(() => {});

    const index = await loadAudioIndex();
    index.entries = index.entries.filter(e => e.podcastId !== podcastId);
    await saveAudioIndex(index);
  } catch (err) {
    console.warn('[PodcastAudioCache] evictPodcastAudio error:', err);
  }
}

/**
 * Delete ALL cached audio for all podcasts.
 */
export async function clearAllPodcastAudio(): Promise<void> {
  try {
    const index = await loadAudioIndex();
    for (const entry of index.entries) {
      const dir = audioDirForPodcast(entry.podcastId);
      await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
      await AsyncStorage.removeItem(ENTRY_KEY(entry.podcastId)).catch(() => {});
    }
    // Delete the whole audio cache directory
    await FileSystem.deleteAsync(AUDIO_DIR_BASE, { idempotent: true }).catch(() => {});
    await saveAudioIndex({ entries: [], version: 23 });
  } catch (err) {
    console.warn('[PodcastAudioCache] clearAllPodcastAudio error:', err);
  }
}

/**
 * Get total bytes used by all cached audio files.
 */
export async function getPodcastAudioTotalBytes(): Promise<number> {
  try {
    const index = await loadAudioIndex();
    const now   = Date.now();
    return index.entries
      .filter(e => now < e.expiresAt)
      .reduce((sum, e) => sum + e.totalBytes, 0);
  } catch {
    return 0;
  }
}

/**
 * Get list of all podcast IDs that have audio cached (non-expired).
 */
export async function getCachedAudioPodcastIds(): Promise<string[]> {
  try {
    const index = await loadAudioIndex();
    const now   = Date.now();
    return index.entries
      .filter(e => now < e.expiresAt)
      .map(e => e.podcastId);
  } catch {
    return [];
  }
}

/**
 * Verify that cached audio files actually exist on disk.
 * Returns true if the entry is valid, false if files are missing.
 * Evicts stale entries automatically.
 */
export async function verifyPodcastAudio(podcastId: string): Promise<boolean> {
  try {
    const entry = await loadAudioEntry(podcastId);
    if (!entry) return false;

    const availableSegs = entry.segments.filter(s => s.isAvailable);
    if (availableSegs.length === 0) return false;

    // Spot-check first available segment
    const first = availableSegs[0];
    const info  = await FileSystem.getInfoAsync(first.localPath).catch(() => ({ exists: false }));
    if (!info.exists) {
      await evictPodcastAudio(podcastId);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}