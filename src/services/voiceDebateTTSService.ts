// src/services/voiceDebateTTSService.ts
// Part 40 — Voice Debate Engine
// Part 59 — Routed through the `ai-audio-gateway` Edge Function. No key here.
//
// Generates audio for each VoiceDebateTurn using gpt-4o-mini-tts with a
// per-agent `instructions` field so every debater has a distinct voice.
//
// KEY DIFFERENCE from podcastTTSService.ts (unchanged by Part 59):
//   • Uses gpt-4o-mini-tts (NOT tts-1) so the `instructions` field works
//   • `instructions` sets per-agent speaking style/personality
//   • Speed is injected via the instructions, with the `speed` param as a
//     secondary lever
//   • Directory: deepdive_voice_debates/ (separate from podcast audio)
//
// The gateway allow-lists gpt-4o-mini-tts and forwards `instructions`, so the
// vocal personalities survive the migration intact. If a debate suddenly sounds
// flat and uniform, check that the gateway is still passing that field through.
//
// CONCURRENCY: 2 at a time (conservative for gpt-4o-mini-tts rate limits)

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { VOICE_PERSONAS, TTS_CONCURRENCY } from '../constants/voiceDebate';
import type { VoiceDebateTurn }            from '../types/voiceDebate';
import type { DebateAgentRole }            from '../types';
import { callGateway, GatewayError, isAbortError } from './apiGateway';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_DEBATE_BASE_DIR = (documentDirectory ?? '') + 'deepdive_voice_debates/';
const TTS_MODEL             = 'gpt-4o-mini-tts';

// ─── Directory Management (unchanged) ─────────────────────────────────────────

export function getVoiceDebateDir(voiceDebateId: string): string {
  return VOICE_DEBATE_BASE_DIR + voiceDebateId + '/';
}

export function getSegmentPath(voiceDebateId: string, turnIndex: number): string {
  return getVoiceDebateDir(voiceDebateId) + `turn_${turnIndex}.mp3`;
}

export async function ensureVoiceDebateDirectory(voiceDebateId: string): Promise<string> {
  const dir  = getVoiceDebateDir(voiceDebateId);
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

export async function deleteVoiceDebateAudio(voiceDebateId: string): Promise<void> {
  const dir = getVoiceDebateDir(voiceDebateId);
  try {
    const info = await getInfoAsync(dir);
    if (info.exists) await deleteAsync(dir, { idempotent: true });
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
  turn:        VoiceDebateTurn,
  outputPath:  string,
  retries    = 2,
  signal?:     AbortSignal,
): Promise<string> {
  const speaker = turn.speaker;
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];

  // Build combined instructions: persona style + emotion cue if present
  const baseInstructions = persona.instructions;
  const emotionAddendum  = turn.emotionCue
    ? ` Current emotion: ${turn.emotionCue}.`
    : '';
  const instructions = baseInstructions + emotionAddendum;

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
          instructions,                    // ← key: per-agent personality
          response_format: 'mp3',
          speed:           persona.speedFactor,
        },
        { signal },
      );

      if (!result?.audio || result.bytes < 100) {
        throw new Error('The audio service returned an empty clip');
      }

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

// ─── Batch TTS Generation (unchanged logic) ───────────────────────────────────

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

  const audioPaths: string[]  = new Array(turns.length).fill('');
  let   completedCount        = 0;

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

// ─── Check all segments exist ─────────────────────────────────────────────────

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
  const wpm   = 140 / speedFactor; // adjust for speaker speed
  return Math.round((words / wpm) * 60 * 1000);
}