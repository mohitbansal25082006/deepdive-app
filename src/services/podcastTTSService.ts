// src/services/podcastTTSService.ts
// Part 39 FIX — Audio Quality actually changes the OpenAI TTS model & format.
// Part 53G — AbortSignal support: a cancelled podcast stops generating audio
//   immediately, with no further TTS spend.
// Part 59 — Routed through the `ai-audio-gateway` Edge Function.
//
//   The gateway returns base64 rather than binary. That is not a compromise —
//   base64 is exactly what writeAsStringAsync(EncodingType.Base64) wants, so
//   this version actually does LESS work than the old one, which fetched an
//   ArrayBuffer and hand-rolled a chunked base64 encoder to convert it. That
//   encoder is gone.
//
// Everything else — directory layout, file naming, concurrency, retry policy,
// the exported surface — is unchanged, so podcastOrchestrator, the cache layer
// and the players need no edits.

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
import { callGateway, GatewayError, isAbortError as isGatewayAbort } from './apiGateway';

const PODCAST_BASE_DIR = (documentDirectory ?? '') + 'deepdive_podcasts/';
const CONCURRENCY      = 3;

/** True if an error is an AbortError (user cancelled). */
function isAbortError(err: unknown): boolean {
  return isGatewayAbort(err);
}

function resolveQualityParams(quality: AudioQuality = 'standard'): {
  model:  'tts-1' | 'tts-1-hd';
  format: 'mp3' | 'wav';
} {
  const cfg = AUDIO_QUALITY_CONFIG[quality] ?? AUDIO_QUALITY_CONFIG.standard;
  return { model: cfg.model, format: cfg.format };
}

export function estimateSegmentDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60 * 1000);
}

// ─── Directory Management (unchanged) ─────────────────────────────────────────

export function getPodcastDir(podcastId: string): string {
  return PODCAST_BASE_DIR + podcastId + '/';
}

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

interface TTSResponse {
  audio:  string;   // base64
  format: string;
  bytes:  number;
}

export async function generateTurnAudio(
  text:       string,
  voice:      PodcastVoice,
  outputPath: string,
  retries     = 2,
  quality:    AudioQuality = 'standard',
  signal?:    AbortSignal,          // ── Part 53G ──
): Promise<string> {
  const { model, format } = resolveQualityParams(quality);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {           // ── Part 53G: stop before each attempt ──
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }

    try {
      const result = await callGateway<TTSResponse>(
        'ai-audio-gateway',
        {
          op:              'tts',
          model,
          input:           text,
          voice,
          response_format: format,
          speed:           1.0,
        },
        { signal },                   // ── Part 53G: abort the TTS call ──
      );

      if (!result?.audio || result.bytes < 100) {
        throw new Error('The audio service returned an empty clip');
      }

      // The gateway already gave us base64 — write it straight to disk.
      await writeAsStringAsync(outputPath, result.audio, { encoding: EncodingType.Base64 });
      return outputPath;

    } catch (err) {
      if (isAbortError(err)) throw err;   // ── Part 53G: propagate cancellation ──

      // Back off on throttling, exactly as before.
      if (err instanceof GatewayError && err.isRateLimited && attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }

      // A missing/invalid key will fail identically on every retry — stop now
      // so a 42-segment podcast doesn't take three minutes to report it.
      if (err instanceof GatewayError && err.isNotConfigured) {
        throw new Error('Audio generation is temporarily unavailable. Please try again later.');
      }

      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to generate audio after ${retries + 1} attempts`);
}

// ─── Batch TTS Generation (unchanged logic) ───────────────────────────────────

export interface BatchProgressCallback {
  onSegmentComplete: (
    segmentIndex:  number,
    totalSegments: number,
    audioPath:     string,
    succeeded:     boolean
  ) => void;
  onProgress?: (message: string) => void;
}

export async function generateAllTurnAudio(
  turns:      PodcastTurn[],
  podcastId:  string,
  hostVoice:  PodcastVoice,
  guestVoice: PodcastVoice,
  callbacks:  BatchProgressCallback,
  quality:    AudioQuality = 'standard',
  signal?:    AbortSignal,          // ── Part 53G ──
): Promise<string[]> {

  await ensurePodcastDirectory(podcastId);

  const audioPaths: string[] = new Array(turns.length).fill('');
  let completedCount = 0;

  for (let batchStart = 0; batchStart < turns.length; batchStart += CONCURRENCY) {
    // ── Part 53G: stop spending TTS tokens the moment the user cancels ──
    if (signal?.aborted) {
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }

    const batch = turns.slice(batchStart, batchStart + CONCURRENCY);

    callbacks.onProgress?.(
      `Generating audio: ${completedCount}/${turns.length} segments complete`
    );

    await Promise.allSettled(
      batch.map(async (turn) => {
        const outputPath = getSegmentPath(podcastId, turn.segmentIndex, quality);
        const voice      = turn.speaker === 'host' ? hostVoice : guestVoice;

        try {
          await generateTurnAudio(turn.text, voice, outputPath, 2, quality, signal);
          audioPaths[turn.segmentIndex] = outputPath;
          completedCount++;
          callbacks.onSegmentComplete(turn.segmentIndex, turns.length, outputPath, true);
        } catch (err) {
          if (isAbortError(err)) { completedCount++; return; }  // cancelled — silent
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

export async function regenerateMissingSegments(
  turns:      PodcastTurn[],
  podcastId:  string,
  hostVoice:  PodcastVoice,
  guestVoice: PodcastVoice,
  callbacks:  BatchProgressCallback,
  quality:    AudioQuality = 'standard',
  signal?:    AbortSignal,          // ── Part 53G ──
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
    missingTurns, podcastId, hostVoice, guestVoice, callbacks, quality, signal,
  );

  return turns.map((turn, i) => {
    if (existChecks[i]) return getSegmentPath(podcastId, turn.segmentIndex, quality);
    const newPath = newPaths[missingTurns.indexOf(turn)];
    return newPath ?? '';
  });
}