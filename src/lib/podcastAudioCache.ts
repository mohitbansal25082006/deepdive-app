// src/lib/podcastAudioCache.ts
// Part 59.2 — REWRITTEN for portable paths and true offline downloading.
//
// WHAT WAS WRONG (the bug you reported)
//
//   With "Cache Podcast Audio" OFF, a completed podcast is cached as JSON only.
//   In offline mode the viewer offers a "Download Audio" button, which lands
//   here. The sources are the local files TTS wrote during generation, so the
//   whole operation is a local copy — no internet needed, by design.
//
//   The old implementation took podcast.audioSegmentPaths (absolute paths, read
//   from Postgres) and called getInfoAsync on them verbatim. In Expo Go the
//   prefix still matched, so it worked. In a preview/production build the
//   prefix belongs to a different app id (Android: host.exp.exponent →
//   com.deepdive.ai) or a dead container (iOS UUID), every probe returned
//   exists:false, and the copy silently produced zero segments.
//
//   A second, independent failure: downloadSegment() gated an existing file on
//   `size > 100`. getInfoAsync only guarantees `size` when you ask for it, and
//   when it came back undefined a perfectly good file was re-copied or judged
//   missing.
//
// WHAT CHANGED
//
//   • Sources go through offlineAudioResolver, which searches the cache dir,
//     then the generation dir rebuilt against TODAY's documentDirectory, then
//     every rebased/scheme/alias variant of the stored path, and only then the
//     cloud.
//   • `allowRemote` is explicit. Offline callers pass false and get a precise
//     error instead of a network timeout.
//   • Segments store a fileName; absolute paths are rebuilt on read. A cache
//     written by yesterday's install still resolves today.
//   • Every probe goes through filePaths.ts, so an unknown size never reads as
//     a missing file.
//   • MIN_SUCCESS_RATE is applied to what is REACHABLE, not what was requested,
//     so a podcast whose last two segments failed at TTS time is still
//     considered cached.
//
// Directory layout is unchanged, so caches written before 59.2 keep working:
//   documentDirectory/deepdive_cache/audio/<safeId>/segment_<N>.mp3

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Podcast } from '../types';
import type {
  AudioCacheEntry,
  AudioCacheIndex,
  AudioCacheSegment,
  AudioDownloadProgress,
} from '../types/cache';
import {
  ensureDir,
  deleteQuietly,
  fileExists,
  fileSize,
  copyFile,
  downloadFile,
  docDir,
} from './filePaths';
import {
  resolvePodcastAudio,
  podcastCacheDir,
  summarize,
  type ResolvedSegment,
} from './offlineAudioResolver';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIO_INDEX_KEY  = 'deepdive:audio:index:v23';
const CONCURRENCY      = 3;
const MIN_SUCCESS_RATE = 0.5;
const ENTRY_VERSION    = 2;   // 2 = portable

const ENTRY_KEY = (id: string) => `deepdive:audio:cache:${id}`;

// ─── Path helpers (rebuilt live, never persisted absolute) ───────────────────

function audioDirForPodcast(podcastId: string): string {
  return podcastCacheDir(podcastId);
}

function segmentFileName(index: number): string {
  return `segment_${index}.mp3`;
}

function segmentPath(podcastId: string, index: number): string {
  return `${audioDirForPodcast(podcastId)}${segmentFileName(index)}`;
}

/**
 * Rebuild a segment's absolute path from the CURRENT document directory.
 * Falls back to the stored localPath only for pre-59.2 entries that have no
 * fileName — and even then it derives the name from the stored basename.
 */
function resolveSegmentPath(podcastId: string, seg: AudioCacheSegment): string {
  const name =
    seg.fileName ??
    (seg.localPath ? seg.localPath.split('/').pop() : undefined) ??
    segmentFileName(seg.turnIndex);
  return `${audioDirForPodcast(podcastId)}${name}`;
}

// ─── Index (AsyncStorage) ─────────────────────────────────────────────────────

async function loadAudioIndex(): Promise<AudioCacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(AUDIO_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AudioCacheIndex;
      if (parsed.version === 23) return parsed;
    }
  } catch { /* fall through to empty */ }
  return { entries: [], version: 23 };
}

async function saveAudioIndex(index: AudioCacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(AUDIO_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[PodcastAudioCache] saveAudioIndex error:', err);
  }
}

async function loadAudioEntry(podcastId: string): Promise<AudioCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(ENTRY_KEY(podcastId));
    if (raw) return JSON.parse(raw) as AudioCacheEntry;
  } catch { /* corrupt entry — treat as absent */ }
  return null;
}

async function saveAudioEntry(entry: AudioCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(ENTRY_KEY(entry.podcastId), JSON.stringify(entry));
  } catch (err) {
    console.warn('[PodcastAudioCache] saveAudioEntry error:', err);
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface DownloadAudioOptions {
  /** Days before the cached audio expires. Defaults to 30. */
  expiryDays?: number;
  /**
   * Allow pulling segments from Supabase Storage.
   *
   * Pass false when the device is offline: the copy then uses only local
   * sources and reports precisely which segments were unreachable, instead of
   * hanging on a network request that cannot succeed.
   */
  allowRemote?: boolean;
}

// ─── Copy / download one segment ──────────────────────────────────────────────

interface SegmentOutcome {
  index:     number;
  ok:        boolean;
  sizeBytes: number;
  origin:    AudioCacheSegment['origin'];
  error?:    string;
}

async function materializeSegment(
  podcastId: string,
  resolved:  ResolvedSegment,
): Promise<SegmentOutcome> {
  const index = resolved.index;
  const dest  = segmentPath(podcastId, index);

  // Already cached and readable? Nothing to do.
  if (await fileExists(dest)) {
    return { index, ok: true, sizeBytes: await fileSize(dest), origin: 'cache' };
  }

  if (!resolved.uri) {
    return { index, ok: false, sizeBytes: 0, origin: 'unknown', error: 'No source found' };
  }

  // The resolver already pointed at the cache file — nothing to copy.
  if (resolved.kind === 'cache') {
    return { index, ok: true, sizeBytes: await fileSize(resolved.uri), origin: 'cache' };
  }

  const result = resolved.remote
    ? await downloadFile(resolved.uri, dest)
    : await copyFile(resolved.uri, dest);

  return {
    index,
    ok:        result.ok,
    sizeBytes: result.sizeBytes,
    origin:    resolved.kind === 'generation' ? 'generation'
             : resolved.kind === 'cloud'      ? 'cloud'
             : 'stored',
    error:     result.error,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cache every audio segment for a podcast so it can be played with no network.
 *
 * With allowRemote:false this is a purely local operation — it copies the files
 * TTS already wrote during generation into the offline cache directory. That is
 * what makes "Download Audio" work in airplane mode.
 *
 * @returns true if at least MIN_SUCCESS_RATE of the reachable segments cached.
 */
export async function downloadPodcastAudio(
  podcast:     Podcast,
  onProgress?: (progress: AudioDownloadProgress) => void,
  expiryDaysOrOptions?: number | DownloadAudioOptions,
): Promise<boolean> {

  // Back-compat: the old signature took a bare expiryDays number.
  const options: DownloadAudioOptions =
    typeof expiryDaysOrOptions === 'number'
      ? { expiryDays: expiryDaysOrOptions }
      : (expiryDaysOrOptions ?? {});

  const expiryDays  = options.expiryDays ?? 30;
  const allowRemote = options.allowRemote !== false;

  const storedPaths = podcast.audioSegmentPaths ?? [];
  const turnCount   = podcast.script?.turns?.length ?? storedPaths.length;

  if (turnCount === 0) {
    onProgress?.({
      podcastId:        podcast.id,
      segmentsComplete: 0,
      segmentsTotal:    0,
      bytesDownloaded:  0,
      isComplete:       true,
      phase:            'error',
      error:            'This episode has no audio segments.',
    });
    return false;
  }

  if (!docDir()) {
    onProgress?.({
      podcastId:        podcast.id,
      segmentsComplete: 0,
      segmentsTotal:    turnCount,
      bytesDownloaded:  0,
      isComplete:       true,
      phase:            'error',
      error:            'Storage is unavailable on this device.',
    });
    return false;
  }

  // ── 1. Resolve every source before touching the disk ────────────────────
  onProgress?.({
    podcastId:        podcast.id,
    segmentsComplete: 0,
    segmentsTotal:    turnCount,
    bytesDownloaded:  0,
    isComplete:       false,
    phase:            'resolving',
  });

  const resolved = await resolvePodcastAudio(
    {
      id:          podcast.id,
      storedPaths,
      cloudUrls:   (podcast as { audioStorageUrls?: (string | null)[] }).audioStorageUrls ?? [],
      turnCount,
    },
    { allowRemote },
  );

  const availability = summarize(resolved);
  const reachable    = availability.localCount + availability.remoteCount;

  if (reachable === 0) {
    onProgress?.({
      podcastId:        podcast.id,
      segmentsComplete: 0,
      segmentsTotal:    turnCount,
      bytesDownloaded:  0,
      isComplete:       true,
      phase:            'error',
      error: allowRemote
        ? 'Audio files could not be found on this device or in the cloud.'
        : 'Audio files are not on this device. Connect to the internet once to download them.',
    });
    return false;
  }

  await ensureDir(audioDirForPodcast(podcast.id));

  const usesNetwork = resolved.some(s => s.remote);

  // ── 2. Copy / download, CONCURRENCY at a time ───────────────────────────
  const segments: AudioCacheSegment[] = new Array(turnCount);
  let successCount    = 0;
  let bytesDownloaded = 0;
  let completed       = 0;
  let lastError: string | undefined;

  for (let i = 0; i < resolved.length; i += CONCURRENCY) {
    const batch = resolved.slice(i, i + CONCURRENCY);

    const outcomes = await Promise.all(
      batch.map(seg => materializeSegment(podcast.id, seg)),
    );

    for (const outcome of outcomes) {
      segments[outcome.index] = {
        turnIndex:   outcome.index,
        localPath:   segmentPath(podcast.id, outcome.index),
        fileName:    segmentFileName(outcome.index),
        sizeBytes:   outcome.sizeBytes,
        isAvailable: outcome.ok,
        origin:      outcome.origin,
      };
      if (outcome.ok) {
        successCount    += 1;
        bytesDownloaded += outcome.sizeBytes;
      } else if (outcome.error) {
        lastError = outcome.error;
      }
      completed += 1;
    }

    onProgress?.({
      podcastId:        podcast.id,
      segmentsComplete: completed,
      segmentsTotal:    turnCount,
      bytesDownloaded,
      isComplete:       false,
      phase:            usesNetwork ? 'downloading' : 'copying',
      offlineOnly:      !usesNetwork,
    });
  }

  // Fill any slot the loop didn't touch.
  for (let i = 0; i < turnCount; i++) {
    if (!segments[i]) {
      segments[i] = {
        turnIndex:   i,
        localPath:   segmentPath(podcast.id, i),
        fileName:    segmentFileName(i),
        sizeBytes:   0,
        isAvailable: false,
        origin:      'unknown',
      };
    }
  }

  // ── 3. Judge success against what was REACHABLE ─────────────────────────
  //
  // A podcast where TTS dropped its last two turns has permanently
  // unreachable segments. Measuring against turnCount would mark such an
  // episode uncacheable forever; measuring against `reachable` caches
  // everything that exists.
  const isSuccess = successCount / reachable >= MIN_SUCCESS_RATE;

  const now       = Date.now();
  const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  const entry: AudioCacheEntry = {
    podcastId:    podcast.id,
    podcastTitle: podcast.title,
    segments,
    totalBytes:   bytesDownloaded,
    cachedAt:     now,
    expiresAt,
    successCount,
    totalCount:   turnCount,
    version:      ENTRY_VERSION,
  };

  await saveAudioEntry(entry);

  const index = await loadAudioIndex();
  index.entries = index.entries.filter(e => e.podcastId !== podcast.id);
  if (isSuccess) {
    index.entries.push({
      podcastId:  podcast.id,
      totalBytes: bytesDownloaded,
      cachedAt:   now,
      expiresAt,
    });
  }
  await saveAudioIndex(index);

  onProgress?.({
    podcastId:        podcast.id,
    segmentsComplete: turnCount,
    segmentsTotal:    turnCount,
    bytesDownloaded,
    isComplete:       true,
    phase:            isSuccess ? 'done' : 'error',
    offlineOnly:      !usesNetwork,
    error: isSuccess
      ? undefined
      : (lastError ?? 'Audio could not be saved for offline use.'),
  });

  return isSuccess;
}

/**
 * Local file paths for every segment, index-aligned with script.turns.
 * Empty string for segments that are not cached. Null when nothing is cached.
 *
 * Paths are rebuilt against the current documentDirectory and verified on disk,
 * so a cache written by a previous install still returns usable paths.
 */
export async function getLocalAudioPaths(podcastId: string): Promise<string[] | null> {
  try {
    const entry = await loadAudioEntry(podcastId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      await evictPodcastAudio(podcastId);
      return null;
    }

    const paths = await Promise.all(
      entry.segments.map(async seg => {
        if (!seg.isAvailable) return '';
        const path = resolveSegmentPath(podcastId, seg);
        return (await fileExists(path)) ? path : '';
      }),
    );

    const available = paths.filter(Boolean).length;
    if (available === 0) {
      // The index says cached but the files are gone (OS purge, manual clear).
      await evictPodcastAudio(podcastId);
      return null;
    }

    return paths;
  } catch {
    return null;
  }
}

/** Is audio cached, unexpired, and actually present on disk? */
export async function isPodcastAudioCached(podcastId: string): Promise<boolean> {
  const paths = await getLocalAudioPaths(podcastId);
  if (!paths) return false;
  const available = paths.filter(Boolean).length;
  return available > 0 && available / paths.length >= MIN_SUCCESS_RATE;
}

/** Raw entry, for the cache manager UI. */
export async function getPodcastAudioEntry(podcastId: string): Promise<AudioCacheEntry | null> {
  return loadAudioEntry(podcastId);
}

/** Real bytes on disk right now (not the number recorded at write time). */
export async function getPodcastAudioDiskBytes(podcastId: string): Promise<number> {
  const paths = await getLocalAudioPaths(podcastId);
  if (!paths) return 0;
  const sizes = await Promise.all(paths.filter(Boolean).map(p => fileSize(p)));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Delete all cached audio files for one podcast. */
export async function evictPodcastAudio(podcastId: string): Promise<void> {
  try {
    await deleteQuietly(audioDirForPodcast(podcastId));
    await AsyncStorage.removeItem(ENTRY_KEY(podcastId)).catch(() => {});

    const index = await loadAudioIndex();
    index.entries = index.entries.filter(e => e.podcastId !== podcastId);
    await saveAudioIndex(index);
  } catch (err) {
    console.warn('[PodcastAudioCache] evictPodcastAudio error:', err);
  }
}

/** Delete ALL cached podcast audio. */
export async function clearAllPodcastAudio(): Promise<void> {
  try {
    const index = await loadAudioIndex();
    for (const entry of index.entries) {
      await deleteQuietly(audioDirForPodcast(entry.podcastId));
      await AsyncStorage.removeItem(ENTRY_KEY(entry.podcastId)).catch(() => {});
    }
    await deleteQuietly(`${docDir()}deepdive_cache/audio/`);
    await saveAudioIndex({ entries: [], version: 23 });
  } catch (err) {
    console.warn('[PodcastAudioCache] clearAllPodcastAudio error:', err);
  }
}

/** Total bytes across all non-expired cached audio. */
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

/** Podcast IDs with non-expired cached audio. */
export async function getCachedAudioPodcastIds(): Promise<string[]> {
  try {
    const index = await loadAudioIndex();
    const now   = Date.now();
    return index.entries.filter(e => now < e.expiresAt).map(e => e.podcastId);
  } catch {
    return [];
  }
}

/**
 * Verify the cached files still exist, evicting the entry if they don't.
 *
 * Part 59.2: this now checks every available segment through the rebuilt path
 * rather than spot-checking segment 0 at its stored absolute path — which was
 * the check that failed for every user on a fresh install.
 */
export async function verifyPodcastAudio(podcastId: string): Promise<boolean> {
  const paths = await getLocalAudioPaths(podcastId);
  return !!paths && paths.filter(Boolean).length > 0;
}