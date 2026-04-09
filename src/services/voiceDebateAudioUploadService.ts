// src/services/voiceDebateAudioUploadService.ts
// Part 41.2 — Voice Debate Cloud Audio Upload
//
// Uploads local voice debate TTS audio segments to Supabase Storage
// so the same debate can be played on any device logged into the same account.
//
// KEY DIFFERENCES from podcastAudioUploadService.ts:
//   • Storage path:  voice_debates/{voiceDebateId}/turn_{N}.mp3
//   • Bucket:        podcast-audio  (reuse existing bucket — no new bucket needed)
//   • Concurrency:   2 at a time (TTS files can be larger than podcast segments)
//   • Retry logic:   3 attempts per segment with exponential backoff
//   • Timeout:       30s per segment upload (avoids "network request failed" hangs)
//   • Terminal logs: console.log for every upload event so dev can track progress
//
// USAGE (called from voiceDebateOrchestrator after generation completes):
//   uploadVoiceDebateAudioBackground(voiceDebateId, audioPaths)
//   — fire-and-forget, never blocks the player from launching

import {
  readAsStringAsync,
  getInfoAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET          = 'podcast-audio';   // reuse existing bucket
const CONCURRENCY     = 2;                 // simultaneous uploads
const MAX_RETRIES     = 3;
const UPLOAD_TIMEOUT  = 30_000;            // 30 seconds per segment

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceDebateUploadProgress {
  uploaded:  number;
  total:     number;
  message:   string;
}

export type VoiceDebateUploadProgressCallback = (p: VoiceDebateUploadProgress) => void;

export interface VoiceDebateUploadResult {
  uploadedUrls:  (string | null)[];
  successCount:  number;
  failureCount:  number;
  allSucceeded:  boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLocalPath(path: string): boolean {
  return (
    path.startsWith('file://') ||
    path.startsWith('/var/') ||
    path.startsWith('/data/') ||
    path.startsWith('/storage/') ||
    (!path.startsWith('http://') && !path.startsWith('https://'))
  );
}

function buildStoragePath(voiceDebateId: string, turnIndex: number): string {
  return `voice_debates/${voiceDebateId}/turn_${turnIndex}.mp3`;
}

// Promise that rejects after `ms` milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[VoiceDebateUpload] Timeout after ${ms}ms: ${label}`)),
      ms,
    );
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Supabase result type helper ─────────────────────────────────────────────

interface SupabaseResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

// ─── Upload single segment (with retry + timeout) ─────────────────────────────

async function uploadSegment(
  localPath:   string,
  storagePath: string,
  turnIndex:   number,
): Promise<{ url: string | null; error: string | null }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ── Verify file exists ─────────────────────────────────────────────
      const info = await withTimeout(
        getInfoAsync(localPath),
        5_000,
        `getInfoAsync turn_${turnIndex}`,
      );
      if (!info.exists) {
        console.log(`[VoiceDebateUpload] ⚠️  Turn ${turnIndex}: file not found — ${localPath}`);
        return { url: null, error: 'File not found' };
      }

      // ── Read as Base64 ─────────────────────────────────────────────────
      const base64 = await withTimeout(
        readAsStringAsync(localPath, { encoding: EncodingType.Base64 }),
        10_000,
        `readAsString turn_${turnIndex}`,
      );
      if (!base64 || base64.length === 0) {
        return { url: null, error: 'Empty file' };
      }

      // ── Decode → ArrayBuffer ───────────────────────────────────────────
      const arrayBuffer = decodeBase64(base64);

      // ── Upload to Supabase Storage ─────────────────────────────────────
      console.log(
        `[VoiceDebateUpload] ⬆️  Turn ${turnIndex}: uploading (attempt ${attempt}/${MAX_RETRIES}) — ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB`,
      );

      const uploadQuery = supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
        contentType:  'audio/mpeg',
        upsert:        true,
        cacheControl: '31536000',
      });

      const { error: uploadError } = await withTimeout(
        uploadQuery as unknown as Promise<SupabaseResult>,
        UPLOAD_TIMEOUT,
        `storage.upload turn_${turnIndex}`,
      );

      if (uploadError) {
        if (attempt < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(
            `[VoiceDebateUpload] ⚠️  Turn ${turnIndex}: upload error (${uploadError.message}) — retrying in ${delay}ms`,
          );
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.log(`[VoiceDebateUpload] ❌  Turn ${turnIndex}: upload failed after ${MAX_RETRIES} attempts — ${uploadError.message}`);
        return { url: null, error: uploadError.message };
      }

      // ── Get public URL ─────────────────────────────────────────────────
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const url = publicData?.publicUrl ?? null;

      if (url) {
        console.log(`[VoiceDebateUpload] ✅  Turn ${turnIndex}: uploaded successfully → ${url.slice(0, 80)}…`);
        return { url, error: null };
      }

      // Fallback: try signed URL
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 31536000);

      if (signedData?.signedUrl) {
        console.log(`[VoiceDebateUpload] ✅  Turn ${turnIndex}: signed URL obtained`);
        return { url: signedData.signedUrl, error: null };
      }

      return { url: null, error: 'Could not get URL after upload' };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(
          `[VoiceDebateUpload] ⚠️  Turn ${turnIndex}: error (${msg}) — retrying in ${delay}ms`,
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.log(`[VoiceDebateUpload] ❌  Turn ${turnIndex}: gave up after ${MAX_RETRIES} attempts — ${msg}`);
        return { url: null, error: msg };
      }
    }
  }
  return { url: null, error: 'Max retries exceeded' };
}

// ─── Upload all turns for a voice debate ──────────────────────────────────────

export async function uploadVoiceDebateAudioToStorage(
  voiceDebateId: string,
  localPaths:    string[],
  onProgress?:   VoiceDebateUploadProgressCallback,
): Promise<VoiceDebateUploadResult> {
  const results: (string | null)[] = new Array(localPaths.length).fill(null);
  let successCount = 0;
  let failureCount = 0;

  // Already-uploaded (https) paths — keep as-is
  localPaths.forEach((path, index) => {
    if (path && !isLocalPath(path)) {
      results[index] = path;
      successCount++;
    }
  });

  const toUpload = localPaths
    .map((path, index) => ({ index, path }))
    .filter(({ path }) => path && isLocalPath(path));

  if (toUpload.length === 0) {
    console.log(`[VoiceDebateUpload] ℹ️  All ${localPaths.length} turns already at cloud URLs — nothing to upload`);
    return { uploadedUrls: results, successCount, failureCount, allSucceeded: failureCount === 0 };
  }

  console.log(
    `[VoiceDebateUpload] 🚀  Starting upload for voiceDebateId=${voiceDebateId} — ${toUpload.length} turns to upload (${CONCURRENCY} concurrent)`,
  );

  onProgress?.({ uploaded: 0, total: toUpload.length, message: `Uploading voice debate audio (0/${toUpload.length})…` });

  for (let i = 0; i < toUpload.length; i += CONCURRENCY) {
    const chunk = toUpload.slice(i, i + CONCURRENCY);

    const chunkResults = await Promise.allSettled(
      chunk.map(({ index, path }) =>
        uploadSegment(path, buildStoragePath(voiceDebateId, index), index)
          .then(result => ({ index, ...result }))
      )
    );

    for (const settled of chunkResults) {
      if (settled.status === 'fulfilled') {
        const { index, url, error } = settled.value;
        if (url && !error) {
          results[index] = url;
          successCount++;
        } else {
          failureCount++;
        }
      } else {
        failureCount++;
        console.log(`[VoiceDebateUpload] ❌  Chunk error:`, settled.reason);
      }
    }

    const uploaded = Math.min(i + CONCURRENCY, toUpload.length);
    onProgress?.({
      uploaded,
      total:   toUpload.length,
      message: `Uploading voice debate audio (${uploaded}/${toUpload.length})…`,
    });
  }

  console.log(
    `[VoiceDebateUpload] 🏁  Done — ${successCount} succeeded, ${failureCount} failed out of ${toUpload.length} turns`,
  );

  return {
    uploadedUrls: results,
    successCount,
    failureCount,
    allSucceeded: failureCount === 0,
  };
}

// ─── Background upload (fire-and-forget) ─────────────────────────────────────
// Call this after generation completes. Uploads in background, then updates
// the voice_debates row with the cloud URLs.

export async function uploadVoiceDebateAudioBackground(
  voiceDebateId: string,
  audioPaths:    string[],
): Promise<void> {
  const localPaths = audioPaths.filter(
    p => p && (p.startsWith('file://') || p.startsWith('/'))
  );

  if (localPaths.length === 0) {
    console.log(`[VoiceDebateUpload] ℹ️  No local paths to upload for voiceDebateId=${voiceDebateId}`);
    return;
  }

  console.log(
    `[VoiceDebateUpload] 📡  Background upload started for voiceDebateId=${voiceDebateId} — ${localPaths.length} local segments`,
  );

  try {
    const result = await uploadVoiceDebateAudioToStorage(voiceDebateId, audioPaths);

    if (result.successCount === 0) {
      console.log(`[VoiceDebateUpload] ⚠️  Background upload: 0 segments uploaded — skipping DB update`);
      return;
    }

    // ── Update DB row with cloud URLs (with retry) ─────────────────────
    const dbUpdatePayload = {
      audio_storage_urls: result.uploadedUrls,
      audio_all_uploaded: result.allSucceeded,
      audio_uploaded_at:  new Date().toISOString(),
    };

    let dbSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const updateQuery = supabase
          .from('voice_debates')
          .update(dbUpdatePayload)
          .eq('id', voiceDebateId);

        const { error: dbError } = await withTimeout(
          updateQuery as unknown as Promise<SupabaseResult>,
          15_000,
          `DB update attempt ${attempt}`,
        );

        if (dbError) {
          console.log(`[VoiceDebateUpload] ⚠️  DB update attempt ${attempt} failed: ${dbError.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          console.log(
            `[VoiceDebateUpload] ✅  DB updated — ${result.successCount}/${audioPaths.length} cloud URLs saved for voiceDebateId=${voiceDebateId}`,
          );
          dbSuccess = true;
          break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[VoiceDebateUpload] ⚠️  DB update attempt ${attempt} threw: ${msg}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (!dbSuccess) {
      console.log(`[VoiceDebateUpload] ❌  DB update failed after 3 attempts — cloud URLs NOT persisted (audio still uploaded)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[VoiceDebateUpload] ❌  Background upload fatal error: ${msg}`);
  }
}

// ─── Delete storage segments (for cleanup) ────────────────────────────────────

export async function deleteVoiceDebateStorageAudio(
  voiceDebateId: string,
  turnCount:     number,
): Promise<void> {
  try {
    const paths: string[] = [];
    for (let i = 0; i < turnCount; i++) {
      paths.push(buildStoragePath(voiceDebateId, i));
    }
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      console.log(`[VoiceDebateUpload] ⚠️  Storage cleanup error: ${error.message}`);
    } else {
      console.log(`[VoiceDebateUpload] 🗑️  Deleted ${paths.length} segments from storage for voiceDebateId=${voiceDebateId}`);
    }
  } catch (err) {
    console.log(`[VoiceDebateUpload] ⚠️  deleteVoiceDebateStorageAudio error (non-fatal):`, err);
  }
}

// ─── Check if a path/URL is playable ─────────────────────────────────────────

export async function isVoiceDebateAudioPlayable(pathOrUrl: string): Promise<boolean> {
  if (!pathOrUrl) return false;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return true;
  try {
    const info = await getInfoAsync(pathOrUrl);
    return info.exists;
  } catch {
    return false;
  }
}