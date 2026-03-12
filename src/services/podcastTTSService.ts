// src/services/podcastTTSService.ts
// Part 8 — Handles all OpenAI TTS audio generation and local filesystem management.
//
// FIX: expo-file-system v17+ (Expo 54) removed documentDirectory and EncodingType
// from the default namespace object. They must be imported as named exports.
// Using: import { documentDirectory, writeAsStringAsync, ... } from 'expo-file-system'

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { PodcastTurn, PodcastVoice } from '../types';

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

export function getSegmentPath(podcastId: string, segmentIndex: number): string {
  return getPodcastDir(podcastId) + `turn_${segmentIndex}.mp3`;
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
  retries     = 2
): Promise<string> {
  const apiKey = getApiKey();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENAI_TTS_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:           'tts-1',
          input:           text,
          voice,
          response_format: 'mp3',
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

      // FIX: EncodingType is now a named import, not FileSystem.EncodingType
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

export async function generateAllTurnAudio(
  turns:      PodcastTurn[],
  podcastId:  string,
  hostVoice:  PodcastVoice,
  guestVoice: PodcastVoice,
  callbacks:  BatchProgressCallback
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
        const outputPath = getSegmentPath(podcastId, turn.segmentIndex);
        const voice      = turn.speaker === 'host' ? hostVoice : guestVoice;

        try {
          await generateTurnAudio(turn.text, voice, outputPath);
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
  callbacks:  BatchProgressCallback
): Promise<string[]> {

  await ensurePodcastDirectory(podcastId);

  const existChecks = await Promise.all(
    turns.map(turn => audioFileExists(getSegmentPath(podcastId, turn.segmentIndex)))
  );

  const missingTurns = turns.filter((_, i) => !existChecks[i]);

  if (missingTurns.length === 0) {
    return turns.map(t => getSegmentPath(podcastId, t.segmentIndex));
  }

  callbacks.onProgress?.(`Regenerating ${missingTurns.length} missing segments...`);

  const newPaths = await generateAllTurnAudio(
    missingTurns,
    podcastId,
    hostVoice,
    guestVoice,
    callbacks
  );

  return turns.map((turn, i) => {
    if (existChecks[i]) return getSegmentPath(podcastId, turn.segmentIndex);
    const newPath = newPaths[missingTurns.indexOf(turn)];
    return newPath ?? '';
  });
}