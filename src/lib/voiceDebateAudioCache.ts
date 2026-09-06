// src/lib/voiceDebateAudioCache.ts
// Part 59.2 — REWRITTEN. Same fix as podcastAudioCache, same reasoning.
//
// Voice debates had the identical failure and one extra twist: the offline
// viewer never offered a download button at all, so when the "Cache Voice
// Debate Audio" toggle was off there was no way to get audio offline. It
// silently degraded to transcript-only and told the user to go back online.
// Part 59.2 adds downloadVoiceDebateAudioLocal() and wires it to a button in
// OfflineVoiceDebateViewer.
//
// CACHE DIRECTORY (unchanged, so existing caches survive):
//   documentDirectory/deepdive_voice_debate_cache/<safeId>/turn_<N>.mp3
//
// SOURCES, in order: cache → deepdive_voice_debates/<id>/turn_N.mp3 rebuilt
// against today's documentDirectory → rebased stored path → cloud (opt-in).

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  resolveVoiceDebateAudio,
  voiceDebateCacheDir,
  summarize,
  type ResolvedSegment,
} from './offlineAudioResolver';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_INDEX_KEY  = 'deepdive:vd:audio:index:v41';
const CONCURRENCY      = 2;
const MIN_SUCCESS_RATE = 0.5;
const ENTRY_VERSION    = 2;

const entryKey = (id: string) => `deepdive:vd:audio:${id}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceDebateAudioSegment {
  turnIndex:   number;
  /** Absolute at write time. Derived on read — do not trust directly. */
  localPath:   string;
  /** Part 59.2: file name only. Stable across installs. */
  fileName?:   string;
  sizeBytes:   number;
  isAvailable: boolean;
  origin?:     'cache' | 'generation' | 'stored' | 'cloud' | 'unknown';
}

export interface VoiceDebateAudioCacheEntry {
  voiceDebateId: string;
  topic:         string;
  cachedAt:      number;
  expiresAt:     number;
  totalBytes:    number;
  successCount:  number;
  totalCount:    number;
  segments:      VoiceDebateAudioSegment[];
  version?:      number;
}

interface CacheIndex {
  entries: { voiceDebateId: string; totalBytes: number; cachedAt: number; expiresAt: number }[];
  version: number;
}

export interface AudioDownloadProgress {
  voiceDebateId:    string;
  segmentsComplete: number;
  segmentsTotal:    number;
  bytesDownloaded:  number;
  isComplete:       boolean;
  phase?:           'resolving' | 'copying' | 'downloading' | 'done' | 'error';
  offlineOnly?:     boolean;
  error?:           string;
}

export interface DownloadVoiceDebateAudioOptions {
  expiryDays?:  number;
  /** Pass false when offline — restricts sources to local disk. */
  allowRemote?: boolean;
  topic?:       string;
  /** Turn count, when the caller knows more than storedPaths.length. */
  turnCount?:   number;
  cloudUrls?:   (string | null | undefined)[];
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function cacheDirFor(voiceDebateId: string): string {
  return voiceDebateCacheDir(voiceDebateId);
}

function segmentFileName(index: number): string {
  return `turn_${index}.mp3`;
}

function segmentPath(voiceDebateId: string, index: number): string {
  return `${cacheDirFor(voiceDebateId)}${segmentFileName(index)}`;
}

function resolveSegmentPath(voiceDebateId: string, seg: VoiceDebateAudioSegment): string {
  const name =
    seg.fileName ??
    (seg.localPath ? seg.localPath.split('/').pop() : undefined) ??
    segmentFileName(seg.turnIndex);
  return `${cacheDirFor(voiceDebateId)}${name}`;
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<CacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheIndex;
      if (parsed.version === 41) return parsed;
    }
  } catch { /* fall through */ }
  return { entries: [], version: 41 };
}

async function saveIndex(index: CacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch { /* non-fatal */ }
}

async function loadEntry(voiceDebateId: string): Promise<VoiceDebateAudioCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(entryKey(voiceDebateId));
    if (raw) return JSON.parse(raw) as VoiceDebateAudioCacheEntry;
  } catch { /* corrupt — treat as absent */ }
  return null;
}

async function saveEntry(entry: VoiceDebateAudioCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(entryKey(entry.voiceDebateId), JSON.stringify(entry));
  } catch { /* non-fatal */ }
}

// ─── Materialize one segment ──────────────────────────────────────────────────

interface SegmentOutcome {
  index:     number;
  ok:        boolean;
  sizeBytes: number;
  origin:    VoiceDebateAudioSegment['origin'];
  error?:    string;
}

async function materializeSegment(
  voiceDebateId: string,
  resolved:      ResolvedSegment,
): Promise<SegmentOutcome> {
  const index = resolved.index;
  const dest  = segmentPath(voiceDebateId, index);

  if (await fileExists(dest)) {
    return { index, ok: true, sizeBytes: await fileSize(dest), origin: 'cache' };
  }

  if (!resolved.uri) {
    return { index, ok: false, sizeBytes: 0, origin: 'unknown', error: 'No source found' };
  }

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
 * Cache every audio turn for a voice debate.
 *
 * Back-compat: the Part 41.2 signature
 *   downloadVoiceDebateAudio(id, topic, audioPaths, onProgress?, expiryDays?)
 * still works. The fifth argument may now also be an options object.
 */
export async function downloadVoiceDebateAudio(
  voiceDebateId: string,
  topic:         string,
  audioPaths:    (string | null | undefined)[],
  onProgress?:   (p: AudioDownloadProgress) => void,
  expiryDaysOrOptions?: number | DownloadVoiceDebateAudioOptions,
): Promise<boolean> {

  const options: DownloadVoiceDebateAudioOptions =
    typeof expiryDaysOrOptions === 'number'
      ? { expiryDays: expiryDaysOrOptions }
      : (expiryDaysOrOptions ?? {});

  const expiryDays  = options.expiryDays ?? 30;
  const allowRemote = options.allowRemote !== false;
  const turnCount   = Math.max(options.turnCount ?? 0, audioPaths?.length ?? 0);

  if (turnCount === 0) {
    onProgress?.({
      voiceDebateId,
      segmentsComplete: 0,
      segmentsTotal:    0,
      bytesDownloaded:  0,
      isComplete:       true,
      phase:            'error',
      error:            'This debate has no audio turns.',
    });
    return false;
  }

  if (!docDir()) {
    onProgress?.({
      voiceDebateId,
      segmentsComplete: 0,
      segmentsTotal:    turnCount,
      bytesDownloaded:  0,
      isComplete:       true,
      phase:            'error',
      error:            'Storage is unavailable on this device.',
    });
    return false;
  }

  onProgress?.({
    voiceDebateId,
    segmentsComplete: 0,
    segmentsTotal:    turnCount,
    bytesDownloaded:  0,
    isComplete:       false,
    phase:            'resolving',
  });

  const resolved = await resolveVoiceDebateAudio(
    {
      id:          voiceDebateId,
      storedPaths: audioPaths ?? [],
      cloudUrls:   options.cloudUrls ?? [],
      turnCount,
    },
    { allowRemote },
  );

  const availability = summarize(resolved);
  const reachable    = availability.localCount + availability.remoteCount;

  if (reachable === 0) {
    onProgress?.({
      voiceDebateId,
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

  await ensureDir(cacheDirFor(voiceDebateId));

  const usesNetwork = resolved.some(s => s.remote);

  const segments: VoiceDebateAudioSegment[] = new Array(turnCount);
  let successCount    = 0;
  let bytesDownloaded = 0;
  let completed       = 0;
  let lastError: string | undefined;

  for (let i = 0; i < resolved.length; i += CONCURRENCY) {
    const batch = resolved.slice(i, i + CONCURRENCY);

    const outcomes = await Promise.all(
      batch.map(seg => materializeSegment(voiceDebateId, seg)),
    );

    for (const outcome of outcomes) {
      segments[outcome.index] = {
        turnIndex:   outcome.index,
        localPath:   segmentPath(voiceDebateId, outcome.index),
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
      voiceDebateId,
      segmentsComplete: completed,
      segmentsTotal:    turnCount,
      bytesDownloaded,
      isComplete:       false,
      phase:            usesNetwork ? 'downloading' : 'copying',
      offlineOnly:      !usesNetwork,
    });
  }

  for (let i = 0; i < turnCount; i++) {
    if (!segments[i]) {
      segments[i] = {
        turnIndex:   i,
        localPath:   segmentPath(voiceDebateId, i),
        fileName:    segmentFileName(i),
        sizeBytes:   0,
        isAvailable: false,
        origin:      'unknown',
      };
    }
  }

  const success   = successCount / reachable >= MIN_SUCCESS_RATE;
  const now       = Date.now();
  const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  const entry: VoiceDebateAudioCacheEntry = {
    voiceDebateId,
    topic:        options.topic ?? topic,
    segments,
    totalBytes:   bytesDownloaded,
    cachedAt:     now,
    expiresAt,
    successCount,
    totalCount:   turnCount,
    version:      ENTRY_VERSION,
  };

  await saveEntry(entry);

  const index = await loadIndex();
  index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
  if (success) {
    index.entries.push({ voiceDebateId, totalBytes: bytesDownloaded, cachedAt: now, expiresAt });
  }
  await saveIndex(index);

  onProgress?.({
    voiceDebateId,
    segmentsComplete: turnCount,
    segmentsTotal:    turnCount,
    bytesDownloaded,
    isComplete:       true,
    phase:            success ? 'done' : 'error',
    offlineOnly:      !usesNetwork,
    error: success ? undefined : (lastError ?? 'Audio could not be saved for offline use.'),
  });

  return success;
}

/**
 * Part 59.2 — convenience wrapper for the offline viewer's Download button.
 * Local sources only: no network is contacted, so it works in airplane mode.
 */
export async function downloadVoiceDebateAudioLocal(
  voiceDebateId: string,
  topic:         string,
  audioPaths:    (string | null | undefined)[],
  onProgress?:   (p: AudioDownloadProgress) => void,
  expiryDays     = 30,
): Promise<boolean> {
  return downloadVoiceDebateAudio(voiceDebateId, topic, audioPaths, onProgress, {
    expiryDays,
    allowRemote: false,
  });
}

/**
 * Local paths for every turn, index-aligned. '' for uncached turns,
 * null when nothing is cached. Paths are rebuilt and verified on disk.
 */
export async function getLocalVoiceDebateAudioPaths(
  voiceDebateId: string,
): Promise<string[] | null> {
  try {
    const entry = await loadEntry(voiceDebateId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      await evictVoiceDebateAudio(voiceDebateId);
      return null;
    }

    const paths = await Promise.all(
      entry.segments.map(async seg => {
        if (!seg.isAvailable) return '';
        const path = resolveSegmentPath(voiceDebateId, seg);
        return (await fileExists(path)) ? path : '';
      }),
    );

    if (paths.filter(Boolean).length === 0) {
      await evictVoiceDebateAudio(voiceDebateId);
      return null;
    }

    return paths;
  } catch {
    return null;
  }
}

/** Is audio cached, unexpired, and present on disk? */
export async function isVoiceDebateAudioCached(voiceDebateId: string): Promise<boolean> {
  const paths = await getLocalVoiceDebateAudioPaths(voiceDebateId);
  if (!paths) return false;
  const available = paths.filter(Boolean).length;
  return available > 0 && available / paths.length >= MIN_SUCCESS_RATE;
}

/** Raw entry (used by autoCacheMiddleware and the cache manager). */
export async function getVoiceDebateAudioEntry(
  voiceDebateId: string,
): Promise<VoiceDebateAudioCacheEntry | null> {
  return loadEntry(voiceDebateId);
}

/** Real bytes on disk right now. */
export async function getVoiceDebateAudioDiskBytes(voiceDebateId: string): Promise<number> {
  const paths = await getLocalVoiceDebateAudioPaths(voiceDebateId);
  if (!paths) return 0;
  const sizes = await Promise.all(paths.filter(Boolean).map(p => fileSize(p)));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Delete cached audio for one voice debate. */
export async function evictVoiceDebateAudio(voiceDebateId: string): Promise<void> {
  try {
    await deleteQuietly(cacheDirFor(voiceDebateId));
    await AsyncStorage.removeItem(entryKey(voiceDebateId)).catch(() => {});
    const index = await loadIndex();
    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
    await saveIndex(index);
  } catch { /* non-fatal */ }
}

/** Total bytes across all non-expired cached voice debate audio. */
export async function getVoiceDebateAudioCacheBytes(): Promise<number> {
  try {
    const index = await loadIndex();
    const now   = Date.now();
    return index.entries.filter(e => now < e.expiresAt).reduce((s, e) => s + e.totalBytes, 0);
  } catch {
    return 0;
  }
}

/** Delete ALL cached voice debate audio. */
export async function clearAllVoiceDebateAudioCache(): Promise<void> {
  try {
    const index = await loadIndex();
    for (const e of index.entries) {
      await AsyncStorage.removeItem(entryKey(e.voiceDebateId)).catch(() => {});
    }
    await deleteQuietly(`${docDir()}deepdive_voice_debate_cache/`);
    await saveIndex({ entries: [], version: 41 });
  } catch { /* non-fatal */ }
}

/** Verify files still exist; evicts the entry if they don't. */
export async function verifyVoiceDebateAudio(voiceDebateId: string): Promise<boolean> {
  const paths = await getLocalVoiceDebateAudioPaths(voiceDebateId);
  return !!paths && paths.filter(Boolean).length > 0;
}