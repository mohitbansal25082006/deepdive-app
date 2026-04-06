// src/services/podcastTTSService.ts
// Part 39 FIX — Audio Quality now actually changes the OpenAI TTS model & format.
//
// ROOT CAUSE (Parts 8–39):
//   generateTurnAudio() ALWAYS called the API with:
//     model: 'tts-1'   ← hardcoded
//     response_format: 'mp3'  ← hardcoded
//   Even though AUDIO_QUALITY_CONFIG defined model/format per quality tier,
//   and the orchestrator stored audioQuality in the DB row — it was never
//   passed down to the actual API call. The selector was purely cosmetic.
//
// FIX SUMMARY:
//   1. generateTurnAudio()      → new `quality: AudioQuality` param (default 'standard')
//   2. generateAllTurnAudio()   → new `quality` param, forwarded per segment
//   3. regenerateMissingSegments() → new `quality` param
//   4. getSegmentPath()         → now returns .wav extension for lossless quality
//      (expo-av needs the correct extension to select the right decoder)
//   5. resolveQualityParams()   → reads AUDIO_QUALITY_CONFIG to pick model+format
//
// Quality tiers (from AUDIO_QUALITY_CONFIG in podcast_v2.ts):
//   standard → tts-1    + mp3  (fast, ~128kbps, smallest files)
//   high     → tts-1-hd + mp3  (richer voice, same container)
//   lossless → tts-1-hd + wav  (studio quality, uncompressed, largest files)

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { PodcastTurn, PodcastVoice } from '../types';
import { AUDIO_QUALITY_CONFIG }      from '../types/podcast_v2';
import type { AudioQuality }         from '../types/podcast_v2';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENAI_TTS_URL   = 'https://api.openai.com/v1/audio/speech';
const PODCAST_BASE_DIR = (documentDirectory ?? '') + 'deepdive_podcasts/';
const CONCURRENCY      = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to your .env and restart.'
    );
  }
  return key.trim();
}

/**
 * Resolves TTS model + response_format from an AudioQuality tier.
 * Falls back to standard if quality is undefined/invalid.
 *
 *   standard → { model: 'tts-1',    format: 'mp3' }
 *   high     → { model: 'tts-1-hd', format: 'mp3' }
 *   lossless → { model: 'tts-1-hd', format: 'wav' }
 */
function resolveQualityParams(quality: AudioQuality = 'standard'): {
  model:  'tts-1' | 'tts-1-hd';
  format: 'mp3' | 'wav';
} {
  const cfg = AUDIO_QUALITY_CONFIG[quality] ?? AUDIO_QUALITY_CONFIG.standard;
  return { model: cfg.model, format: cfg.format };
}

/**
 * Convert an ArrayBuffer to a base64 string.
 * Uses chunked processing (8 KB chunks) to avoid a stack overflow
 * when spreading large Uint8Arrays in String.fromCharCode.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer);
  const CHUNK  = 8192;
  let   binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end   = Math.min(i + CHUNK, bytes.length);
    const slice = bytes.subarray(i, end);
    binary += String.fromCharCode(...Array.from(slice));
  }

  return btoa(binary);
}

/** Estimate playback duration (ms) from word count at ~150 wpm */
export function estimateSegmentDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60 * 1000);
}

// ─── Directory Management ─────────────────────────────────────────────────────

export function getPodcastDir(podcastId: string): string {
  return PODCAST_BASE_DIR + podcastId + '/';
}

/**
 * Returns the local filesystem path for a segment file.
 * Uses the correct extension for the quality tier:
 *   standard / high → .mp3
 *   lossless        → .wav
 *
 * expo-av (and iOS/Android audio decoders) require the correct file
 * extension to pick the right decoder — a WAV file saved as .mp3 will
 * fail or sound corrupted.
 */
export function getSegmentPath(
  podcastId:    string,
  segmentIndex: number,
  quality:      AudioQuality = 'standard',
): string {
  const { format } = resolveQualityParams(quality);
  return getPodcastDir(podcastId) + `turn_${segmentIndex}.${format}`;
}

export async function ensurePodcastDirectory(podcastId: string): Promise<string> {
  const dir  = getPodcastDir(podcastId);
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function audioFileExists(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    const info = await getInfoAsync(path);
    return info.exists && ((info as any).size ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function checkAllAudioFilesExist(paths: string[]): Promise<boolean> {
  if (!paths.length) return false;
  const results = await Promise.all(paths.map(audioFileExists));
  return results.every(Boolean);
}

export async function countAvailableSegments(paths: string[]): Promise<number> {
  const results = await Promise.all(paths.map(audioFileExists));
  return results.filter(Boolean).length;
}

export async function deletePodcastAudio(podcastId: string): Promise<void> {
  const dir = getPodcastDir(podcastId);
  try {
    const info = await getInfoAsync(dir);
    if (info.exists) {
      await deleteAsync(dir, { idempotent: true });
    }
  } catch (err) {
    console.warn('[PodcastTTS] Failed to delete podcast audio directory:', err);
  }
}

// ─── Single-Segment TTS ───────────────────────────────────────────────────────

/**
 * Generate audio for one dialogue turn via OpenAI TTS.
 *
 * @param text        Text to synthesize (prosody hints already stripped by agent).
 * @param voice       OpenAI voice name (alloy, nova, echo, etc.).
 * @param outputPath  Absolute local path to write the audio file.
 * @param retries     Retry attempts on transient API errors (default 2).
 * @param quality     Audio quality tier — drives model selection AND format:
 *                      'standard' → tts-1    + mp3   fastest, ~128 kbps
 *                      'high'     → tts-1-hd + mp3   richer voice, ~192 kbps
 *                      'lossless' → tts-1-hd + wav   studio, uncompressed PCM
 */
export async function generateTurnAudio(
  text:       string,
  voice:      PodcastVoice,
  outputPath: string,
  retries     = 2,
  quality:    AudioQuality = 'standard',
): Promise<string> {
  const apiKey = getApiKey();
  const { model, format } = resolveQualityParams(quality);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENAI_TTS_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,                   // ← FIX: was always 'tts-1', now quality-driven
          input:           text,
          voice,
          response_format: format, // ← FIX: was always 'mp3', now 'wav' for lossless
          speed:           1.0,
        }),
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = await response.json() as any;
          errMsg = errBody?.error?.message ?? errMsg;
        } catch { /* ignore */ }

        if (response.status === 429 && attempt < retries) {
          // Exponential back-off: 2 s, 4 s
          await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
          continue;
        }
        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key. Check EXPO_PUBLIC_OPENAI_API_KEY.');
        }
        throw new Error(`TTS API error: ${errMsg}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      if (!arrayBuffer || arrayBuffer.byteLength < 100) {
        throw new Error('TTS returned an empty audio buffer');
      }

      const base64 = arrayBufferToBase64(arrayBuffer);

      await writeAsStringAsync(outputPath, base64, {
        encoding: EncodingType.Base64,
      });

      return outputPath;

    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to generate audio after ${retries + 1} attempts`);
}

// ─── Batch TTS Generation ─────────────────────────────────────────────────────

export interface BatchProgressCallback {
  onSegmentComplete: (
    segmentIndex:  number,
    totalSegments: number,
    audioPath:     string,
    succeeded:     boolean
  ) => void;
  onProgress?: (message: string) => void;
}

/**
 * Generate audio for all turns in a 2-speaker podcast.
 * Processes segments in batches of CONCURRENCY=3 to avoid rate limits.
 *
 * @param quality  Forwarded to every generateTurnAudio() call.
 */
export async function generateAllTurnAudio(
  turns:      PodcastTurn[],
  podcastId:  string,
  hostVoice:  PodcastVoice,
  guestVoice: PodcastVoice,
  callbacks:  BatchProgressCallback,
  quality:    AudioQuality = 'standard',
): Promise<string[]> {

  await ensurePodcastDirectory(podcastId);

  const audioPaths: string[] = new Array(turns.length).fill('');
  let completedCount = 0;

  for (let batchStart = 0; batchStart < turns.length; batchStart += CONCURRENCY) {
    const batch = turns.slice(batchStart, batchStart + CONCURRENCY);

    callbacks.onProgress?.(
      `Generating audio: ${completedCount}/${turns.length} segments complete`
    );

    await Promise.allSettled(
      batch.map(async (turn) => {
        // Quality-aware path: .mp3 or .wav depending on quality tier
        const outputPath = getSegmentPath(podcastId, turn.segmentIndex, quality);
        const voice      = turn.speaker === 'host' ? hostVoice : guestVoice;

        try {
          await generateTurnAudio(turn.text, voice, outputPath, 2, quality);
          audioPaths[turn.segmentIndex] = outputPath;
          completedCount++;
          callbacks.onSegmentComplete(turn.segmentIndex, turns.length, outputPath, true);
        } catch (err) {
          console.warn(
            `[PodcastTTS] Segment ${turn.segmentIndex} failed:`,
            err instanceof Error ? err.message : err
          );
          completedCount++;
          callbacks.onSegmentComplete(turn.segmentIndex, turns.length, '', false);
        }
      })
    );
  }

  callbacks.onProgress?.(
    `Audio generation complete: ${audioPaths.filter(Boolean).length}/${turns.length} segments`
  );

  return audioPaths;
}

// ─── Regenerate Missing Segments ─────────────────────────────────────────────

export async function regenerateMissingSegments(
  turns:      PodcastTurn[],
  podcastId:  string,
  hostVoice:  PodcastVoice,
  guestVoice: PodcastVoice,
  callbacks:  BatchProgressCallback,
  quality:    AudioQuality = 'standard',
): Promise<string[]> {

  await ensurePodcastDirectory(podcastId);

  const existChecks = await Promise.all(
    turns.map(turn => audioFileExists(getSegmentPath(podcastId, turn.segmentIndex, quality)))
  );

  const missingTurns = turns.filter((_, i) => !existChecks[i]);

  if (missingTurns.length === 0) {
    return turns.map(t => getSegmentPath(podcastId, t.segmentIndex, quality));
  }

  callbacks.onProgress?.(`Regenerating ${missingTurns.length} missing segments...`);

  const newPaths = await generateAllTurnAudio(
    missingTurns,
    podcastId,
    hostVoice,
    guestVoice,
    callbacks,
    quality,
  );

  return turns.map((turn, i) => {
    if (existChecks[i]) return getSegmentPath(podcastId, turn.segmentIndex, quality);
    const newPath = newPaths[missingTurns.indexOf(turn)];
    return newPath ?? '';
  });
}