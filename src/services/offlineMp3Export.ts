// src/services/offlineMp3Export.ts
// Part 23 — Offline podcast MP3 export.
//
// Reads locally cached audio segment files (downloaded by podcastAudioCache.ts)
// and concatenates them into a single .mp3 file for sharing.
//
// STRATEGY:
//   1. Get local file paths from the audio cache (getLocalAudioPaths).
//   2. Read each segment as base64 using FileSystem.readAsStringAsync.
//   3. Decode all base64 chunks to Uint8Array, concatenate into one buffer.
//   4. Re-encode the combined buffer as base64, write to documentDirectory.
//   5. Share via expo-sharing.
//
// If audio is NOT locally cached, throws with a user-friendly message that
// tells the user to download the audio first.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';
import type { Podcast } from '../types';
import { getLocalAudioPaths } from '../lib/podcastAudioCache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  // Use global atob (available in Hermes / React Native JS runtime)
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunk to avoid call-stack overflow on large files
  const CHUNK  = 8192;
  let   binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...Array.from(slice));
  }
  return btoa(binary);
}

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 50);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a podcast episode as MP3 using locally cached audio segments.
 * Throws a user-friendly error if audio is not cached.
 *
 * @param podcast        The Podcast object from cache.
 * @param onProgress     Optional progress callback (0–1).
 */
export async function exportPodcastAsMP3Offline(
  podcast:     Podcast,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // ── Step 1: Get local paths ──────────────────────────────────────────────
  const localPaths = await getLocalAudioPaths(podcast.id);

  if (!localPaths || localPaths.filter(Boolean).length === 0) {
    throw new Error(
      'Audio not downloaded for offline playback yet.\n\n' +
      'Tap "Download Audio" in the podcast player first, then try exporting again.'
    );
  }

  const validPaths = localPaths.filter(Boolean);
  onProgress?.(0.05);

  // ── Step 2: Read all segments as base64 ──────────────────────────────────
  const chunks: Uint8Array[] = [];
  let   loaded = 0;

  for (const localPath of validPaths) {
    try {
      // Verify the file actually exists before trying to read it
      const info = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));
      if (!info.exists) {
        console.warn(`[offlineMp3Export] segment not found: ${localPath}`);
        loaded++;
        continue;
      }

      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (base64 && base64.length > 0) {
        const bytes = base64ToUint8Array(base64);
        if (bytes.length > 0) chunks.push(bytes);
      }
    } catch (err) {
      console.warn(`[offlineMp3Export] read error for ${localPath}:`, err);
    }

    loaded++;
    onProgress?.(0.05 + (loaded / validPaths.length) * 0.75);
  }

  if (chunks.length === 0) {
    throw new Error(
      'Could not read any audio files from the cache.\n\n' +
      'The audio files may have been deleted by the OS to free space. ' +
      'Try downloading the audio again from the podcast player.'
    );
  }

  onProgress?.(0.82);

  // ── Step 3: Concatenate all chunks ────────────────────────────────────────
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined    = new Uint8Array(totalLength);
  let   offset      = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress?.(0.88);

  // ── Step 4: Write combined file ───────────────────────────────────────────
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('File system not available on this device.');

  const fileName  = `${safeFileName(podcast.title)}_podcast.mp3`;
  const outputUri = `${docDir}${fileName}`;

  await FileSystem.writeAsStringAsync(outputUri, uint8ArrayToBase64(combined), {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.(0.95);

  // ── Step 5: Share ─────────────────────────────────────────────────────────
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(outputUri, {
    mimeType:    'audio/mpeg',
    dialogTitle: `Share: ${podcast.title}`,
    UTI:         'public.mp3',
  });

  onProgress?.(1.0);

  // ── Step 6: Cleanup temp output file ─────────────────────────────────────
  try {
    await FileSystem.deleteAsync(outputUri, { idempotent: true });
  } catch {}
}

/**
 * Check if a podcast has audio cached and available for MP3 export.
 */
export async function canExportPodcastAsMP3(podcastId: string): Promise<boolean> {
  try {
    const paths = await getLocalAudioPaths(podcastId);
    return paths !== null && paths.filter(Boolean).length > 0;
  } catch {
    return false;
  }
}