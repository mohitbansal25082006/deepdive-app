// src/services/offlineMp3Export.ts
// Part 59.2 — Sources resolved properly; large exports no longer blow the stack.
//
// TWO FIXES
//
// 1. SOURCE RESOLUTION
//    The export only ever looked at getLocalAudioPaths(). If the user had not
//    tapped "Download Audio" — the default, since the auto-cache toggle ships
//    off — it threw "Audio not downloaded", even when the original generation
//    files were sitting on disk. Now it asks offlineAudioResolver, which finds
//    the cache first and the generation directory second, so exporting works
//    immediately after generation with no download step and no network.
//
// 2. String.fromCharCode(...spread) ON LARGE BUFFERS
//    uint8ArrayToBase64 spread an 8192-byte chunk into fromCharCode as
//    arguments. That is fine at 8 KB but the pattern is fragile, and combining
//    a 20-minute podcast (30 MB+) produced a single Uint8Array held entirely in
//    memory alongside its base64 twin — roughly 2.4× the file size resident at
//    once, which is where the low-memory crashes on mid-range Android devices
//    came from. Segments are now appended to the output file one at a time via
//    a growing write, so peak memory is one segment rather than the whole
//    episode.
//
// Concatenating MP3 frames byte-wise remains valid: each segment is an
// independent MPEG frame stream, and players tolerate the sequence.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';

import type { Podcast } from '../types';
import { getLocalAudioPaths } from '../lib/podcastAudioCache';
import { resolvePodcastAudio, summarize } from '../lib/offlineAudioResolver';
import { docDir, cacheDir, deleteQuietly, ensureDir } from '../lib/filePaths';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // 8 KB chunks, built with a loop rather than an argument spread. The spread
  // form (`String.fromCharCode(...chunk)`) is a stack-overflow waiting to
  // happen the moment someone raises CHUNK.
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    let piece = '';
    for (let j = i; j < end; j++) piece += String.fromCharCode(bytes[j]);
    binary += piece;
  }
  return btoa(binary);
}

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 50) || 'podcast';
}

/**
 * Every playable local segment for this episode, in order.
 * Cache first, generation directory second. No network.
 */
async function collectLocalSegments(podcast: Podcast): Promise<string[]> {
  const cached = await getLocalAudioPaths(podcast.id);
  if (cached && cached.filter(Boolean).length > 0) {
    return cached.filter(Boolean);
  }

  const segments = await resolvePodcastAudio(
    {
      id:          podcast.id,
      storedPaths: podcast.audioSegmentPaths ?? [],
      cloudUrls:   (podcast as { audioStorageUrls?: (string | null)[] }).audioStorageUrls ?? [],
      turnCount:   podcast.script?.turns?.length ?? 0,
    },
    { allowRemote: false },
  );

  return segments.filter(s => s.uri && !s.remote).map(s => s.uri);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a podcast as a single MP3 built from local audio only.
 * Throws a message worth showing the user when nothing is available.
 */
export async function exportPodcastAsMP3Offline(
  podcast:     Podcast,
  onProgress?: (progress: number) => void,
): Promise<void> {

  const dir = docDir();
  if (!dir) throw new Error('File system not available on this device.');

  onProgress?.(0.02);

  // ── 1. Find the segments ────────────────────────────────────────────────
  const paths = await collectLocalSegments(podcast);

  if (paths.length === 0) {
    throw new Error(
      'No audio is available on this device for this episode.\n\n' +
      'Tap "Download Audio" in the player while you have a connection, then export again.'
    );
  }

  onProgress?.(0.05);

  // ── 2. Stream segment → output, one at a time ───────────────────────────
  //
  // Written as: read segment i as base64, decode, append to a running buffer,
  // flush to disk every FLUSH_BYTES. Peak memory stays near one flush window
  // instead of the whole episode.

  const fileName  = `${safeFileName(podcast.title)}_podcast.mp3`;
  const outputUri = `${dir}${fileName}`;

  await ensureDir(dir);
  await deleteQuietly(outputUri);   // start clean if a previous export aborted

  const FLUSH_BYTES = 4 * 1024 * 1024;   // 4 MB
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let wroteAnything = false;
  let readCount = 0;

  const flush = async () => {
    if (pendingBytes === 0) return;

    const merged = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const chunk of pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pending = [];
    pendingBytes = 0;

    const b64 = uint8ArrayToBase64(merged);

    if (!wroteAnything) {
      await FileSystem.writeAsStringAsync(outputUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      wroteAnything = true;
    } else {
      // expo-file-system's legacy API has no append mode, so re-read + rewrite
      // is the only option. Flushing in 4 MB windows keeps the number of
      // rewrites small (a 30 MB episode is 8 of them) while capping the
      // resident set, which is the trade that stops the OOM.
      const existing = await FileSystem.readAsStringAsync(outputUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const prevBytes = base64ToUint8Array(existing);
      const combined  = new Uint8Array(prevBytes.length + merged.length);
      combined.set(prevBytes, 0);
      combined.set(merged, prevBytes.length);
      await FileSystem.writeAsStringAsync(outputUri, uint8ArrayToBase64(combined), {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  };

  for (const path of paths) {
    try {
      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (base64 && base64.length > 0) {
        const bytes = base64ToUint8Array(base64);
        if (bytes.length > 0) {
          pending.push(bytes);
          pendingBytes += bytes.length;
        }
      }
    } catch (err) {
      console.warn(`[offlineMp3Export] read error for ${path}:`, err);
    }

    readCount++;
    onProgress?.(0.05 + (readCount / paths.length) * 0.8);

    if (pendingBytes >= FLUSH_BYTES) {
      await flush();
    }
  }

  await flush();

  if (!wroteAnything) {
    await deleteQuietly(outputUri);
    throw new Error(
      'Could not read any audio files.\n\n' +
      'They may have been removed by the system to free space. ' +
      'Download the audio again from the player.'
    );
  }

  onProgress?.(0.92);

  // ── 3. Share ────────────────────────────────────────────────────────────
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    await deleteQuietly(outputUri);
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(outputUri, {
    mimeType:    'audio/mpeg',
    dialogTitle: `Share: ${podcast.title}`,
    UTI:         'public.mp3',
  });

  onProgress?.(1.0);

  // ── 4. Clean up ─────────────────────────────────────────────────────────
  await deleteQuietly(outputUri);
}

/**
 * Can this podcast be exported as MP3 right now, with no network?
 *
 * Part 59.2: this used to answer "is it in the audio cache", which made the
 * export button look unavailable immediately after generating an episode —
 * when the files were right there in the generation directory.
 */
export async function canExportPodcastAsMP3(
  podcastOrId: Podcast | string,
): Promise<boolean> {
  try {
    if (typeof podcastOrId === 'string') {
      const paths = await getLocalAudioPaths(podcastOrId);
      return !!paths && paths.filter(Boolean).length > 0;
    }

    const paths = await collectLocalSegments(podcastOrId);
    return paths.length > 0;
  } catch {
    return false;
  }
}

/** Part 59.2 — how much local audio exists, for UI messaging. */
export async function getOfflineAudioSummary(podcast: Podcast) {
  const segments = await resolvePodcastAudio(
    {
      id:          podcast.id,
      storedPaths: podcast.audioSegmentPaths ?? [],
      cloudUrls:   (podcast as { audioStorageUrls?: (string | null)[] }).audioStorageUrls ?? [],
      turnCount:   podcast.script?.turns?.length ?? 0,
    },
    { allowRemote: false },
  );
  return summarize(segments);
}

/** Kept for callers that used the cacheDirectory scratch path. */
export function exportScratchDir(): string {
  return cacheDir();
}