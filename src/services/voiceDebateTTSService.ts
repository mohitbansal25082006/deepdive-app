// src/services/voiceDebateTTSService.ts
// Part 40 — Voice Debate Engine
// Part 59 — Routed through the `ai-audio-gateway` Edge Function. No key here.
//
// ── Part 59.2 FIX ───────────────────────────────────────────────────────────
//
// Identical to the podcast fix, and with a sharper consequence.
//
// audioFileExists() tested `info.exists && (info.size ?? 0) > 0` against the
// stored path verbatim. OfflineVoiceDebateViewer calls this function as its
// FIRST check ("Tier 1: original generation paths"). When it wrongly returned
// false — because the size was undefined, or because the container prefix had
// rotated since generation — the viewer fell straight through to
// transcript-only and displayed a notice telling the user to go online and
// enable a setting. The audio was on the device the entire time.
//
// The check now delegates to filePaths.fileExists(): size requested explicitly,
// unknown size treated as present, both file:// forms tried, and a stale
// prefix repaired against the current documentDirectory.
//
// The generation directory is likewise read live rather than captured at module
// load, so nothing here can bake in a prefix that later goes stale.

import {
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { VOICE_PERSONAS, TTS_CONCURRENCY } from '../constants/voiceDebate';
import type { VoiceDebateTurn }            from '../types/voiceDebate';
import type { DebateAgentRole }            from '../types';
import { callGateway, GatewayError, isAbortError } from './apiGateway';
import {
  docDir,
  ensureDir,
  fileExists as safeFileExists,
  resolveStoredPath,
} from '../lib/filePaths';

// ─── Constants ────────────────────────────────────────────────────────────────

const TTS_MODEL = 'gpt-4o-mini-tts';

/** Generation root, read live. See the Part 59.2 note in the header. */
export function getVoiceDebateBaseDir(): string {
  return `${docDir()}deepdive_voice_debates/`;
}

// ─── Directory Management ─────────────────────────────────────────────────────

export function getVoiceDebateDir(voiceDebateId: string): string {
  return `${getVoiceDebateBaseDir()}${voiceDebateId}/`;
}

export function getSegmentPath(voiceDebateId: string, turnIndex: number): string {
  return `${getVoiceDebateDir(voiceDebateId)}turn_${turnIndex}.mp3`;
}

export async function ensureVoiceDebateDirectory(voiceDebateId: string): Promise<string> {
  const dir = getVoiceDebateDir(voiceDebateId);
  await ensureDir(dir);
  return dir;
}

/**
 * Does this audio file exist and can we read it?
 * Part 59.2: size-safe and prefix-repairing. See header.
 */
export async function audioFileExists(path: string): Promise<boolean> {
  if (!path) return false;
  if (path.startsWith('http://') || path.startsWith('https://')) return true;
  return safeFileExists(path);
}

/** Part 59.2 — repaired absolute path for a stored turn path, or null. */
export async function resolveVoiceDebateAudioPath(path: string): Promise<string | null> {
  return resolveStoredPath(path);
}

export async function deleteVoiceDebateAudio(voiceDebateId: string): Promise<void> {
  try {
    await deleteAsync(getVoiceDebateDir(voiceDebateId), { idempotent: true });
  } catch (err) {
    console.warn('[VoiceDebateTTS] Failed to delete audio directory:', err);
  }
}

// ─── Single Turn TTS ──────────────────────────────────────────────────────────

interface TTSResponse {
  audio:  string;   // base64
  format: string;
  bytes:  number;
}

export async function generateTurnAudio(
  turn:       VoiceDebateTurn,
  outputPath: string,
  retries   = 2,
  signal?:    AbortSignal,
): Promise<string> {
  const speaker = turn.speaker;
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];

  const baseInstructions = persona.instructions;
  const emotionAddendum  = turn.emotionCue ? ` Current emotion: ${turn.emotionCue}.` : '';
  const instructions     = baseInstructions + emotionAddendum;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }

    try {
      const result = await callGateway<TTSResponse>(
        'ai-audio-gateway',
        {
          op:              'tts',
          model:           TTS_MODEL,
          input:           turn.text,
          voice:           persona.voice,
          instructions,                    // ← per-agent personality
          response_format: 'mp3',
          speed:           persona.speedFactor,
        },
        { signal },
      );

      if (!result?.audio || result.bytes < 100) {
        throw new Error('The audio service returned an empty clip');
      }

      // Part 59.2: guarantee the parent directory exists before writing.
      await ensureDir(outputPath.slice(0, outputPath.lastIndexOf('/') + 1));

      await writeAsStringAsync(outputPath, result.audio, { encoding: EncodingType.Base64 });
      return outputPath;

    } catch (err) {
      if (isAbortError(err)) throw err;

      if (err instanceof GatewayError && err.isRateLimited && attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }

      if (err instanceof GatewayError && err.isNotConfigured) {
        throw new Error('Voice generation is temporarily unavailable. Please try again later.');
      }

      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to generate audio after ${retries + 1} attempts`);
}

// ─── Batch TTS Generation ─────────────────────────────────────────────────────

export interface VoiceDebateTTSCallbacks {
  onSegmentComplete: (turnIndex: number, total: number, audioPath: string, succeeded: boolean) => void;
  onProgress?:       (message: string) => void;
}

export async function generateAllTurnAudio(
  turns:         VoiceDebateTurn[],
  voiceDebateId: string,
  callbacks:     VoiceDebateTTSCallbacks,
  signal?:       AbortSignal,
): Promise<string[]> {
  await ensureVoiceDebateDirectory(voiceDebateId);

  const audioPaths: string[] = new Array(turns.length).fill('');
  let   completedCount       = 0;

  for (let batchStart = 0; batchStart < turns.length; batchStart += TTS_CONCURRENCY) {
    if (signal?.aborted) {
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }

    const batch = turns.slice(batchStart, batchStart + TTS_CONCURRENCY);

    callbacks.onProgress?.(
      `Generating voice audio: ${completedCount}/${turns.length} turns complete`
    );

    await Promise.allSettled(
      batch.map(async turn => {
        const outputPath = getSegmentPath(voiceDebateId, turn.turnIndex);

        try {
          await generateTurnAudio(turn, outputPath, 2, signal);
          audioPaths[turn.turnIndex] = outputPath;
          completedCount++;
          callbacks.onSegmentComplete(turn.turnIndex, turns.length, outputPath, true);
        } catch (err) {
          if (isAbortError(err)) { completedCount++; return; }
          console.warn(
            `[VoiceDebateTTS] Turn ${turn.turnIndex} (${turn.speaker}) failed:`,
            err instanceof Error ? err.message : err,
          );
          completedCount++;
          callbacks.onSegmentComplete(turn.turnIndex, turns.length, '', false);
        }
      }),
    );
  }

  callbacks.onProgress?.(
    `Voice audio complete: ${audioPaths.filter(Boolean).length}/${turns.length} turns`
  );

  return audioPaths;
}

// ─── Segment existence checks ─────────────────────────────────────────────────

export async function checkAllSegmentsExist(paths: string[]): Promise<boolean> {
  if (!paths.length) return false;
  const results = await Promise.all(paths.map(audioFileExists));
  return results.every(Boolean);
}

export async function countExistingSegments(paths: string[]): Promise<number> {
  const results = await Promise.all(paths.map(audioFileExists));
  return results.filter(Boolean).length;
}

// ─── Estimate duration from word count ────────────────────────────────────────

export function estimateSegmentDurationMs(text: string, speedFactor = 1.0): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wpm   = 140 / speedFactor;
  return Math.round((words / wpm) * 60 * 1000);
}