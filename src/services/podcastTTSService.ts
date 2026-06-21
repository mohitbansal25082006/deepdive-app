// src/services/podcastTTSService.ts
// Part 39 FIX — Audio Quality now actually changes the OpenAI TTS model & format.
// Part 53G — AbortSignal support: generateTurnAudio passes the signal to fetch,
//   and generateAllTurnAudio checks signal.aborted between batches so a cancelled
//   podcast stops generating audio immediately (no further TTS token spend).

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

const OPENAI_TTS_URL   = 'https://api.openai.com/v1/audio/speech';
const PODCAST_BASE_DIR = (documentDirectory ?? '') + 'deepdive_podcasts/';
const CONCURRENCY      = 3;

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to your .env and restart.');
  }
  return key.trim();
}

/** True if an error is an AbortError (user cancelled). */
function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function resolveQualityParams(quality: AudioQuality = 'standard'): {
  model:  'tts-1' | 'tts-1-hd';
  format: 'mp3' | 'wav';
} {
  const cfg = AUDIO_QUALITY_CONFIG[quality] ?? AUDIO_QUALITY_CONFIG.standard;
  return { model: cfg.model, format: cfg.format };
}

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

export function estimateSegmentDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60 * 1000);
}

// ─── Directory Management ─────────────────────────────────────────────────────

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

export async function generateTurnAudio(
  text:       string,
  voice:      PodcastVoice,
  outputPath: string,
  retries     = 2,
  quality:    AudioQuality = 'standard',
  signal?:    AbortSignal,          // ── Part 53G ──
): Promise<string> {
  const apiKey = getApiKey();
  const { model, format } = resolveQualityParams(quality);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {           // ── Part 53G: stop before each attempt ──
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }
    try {
      const response = await fetch(OPENAI_TTS_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input:           text,
          voice,
          response_format: format,
          speed:           1.0,
        }),
        signal,                       // ── Part 53G: abort the TTS fetch ──
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = await response.json() as any;
          errMsg = errBody?.error?.message ?? errMsg;
        } catch { /* ignore */ }

        if (response.status === 429 && attempt < retries) {
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
      await writeAsStringAsync(outputPath, base64, { encoding: EncodingType.Base64 });
      return outputPath;

    } catch (err) {
      if (isAbortError(err)) throw err;   // ── Part 53G: propagate cancellation ──
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