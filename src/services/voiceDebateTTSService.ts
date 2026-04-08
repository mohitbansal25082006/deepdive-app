// src/services/voiceDebateTTSService.ts
// Part 40 — Voice Debate Engine
//
// Generates audio for each VoiceDebateTurn using gpt-4o-mini-tts
// with per-agent `instructions` field for distinct vocal personalities.
//
// KEY DIFFERENCE from podcastTTSService.ts:
//   • Uses gpt-4o-mini-tts (NOT tts-1) so `instructions` field works
//   • `instructions` field sets per-agent speaking style/personality
//   • Speed is injected via the instructions rather than the `speed` param
//     (speed param still used as a secondary lever)
//   • Directory: deepdive_voice_debates/ (separate from podcast audio)
//
// CONCURRENCY: 2 at a time (conservative for rate limits on gpt-4o-mini-tts)

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

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENAI_TTS_URL        = 'https://api.openai.com/v1/audio/speech';
const VOICE_DEBATE_BASE_DIR = (documentDirectory ?? '') + 'deepdive_voice_debates/';
const TTS_MODEL             = 'gpt-4o-mini-tts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to your .env and restart.');
  }
  return key.trim();
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

// ─── Directory Management ─────────────────────────────────────────────────────

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

export async function generateTurnAudio(
  turn:        VoiceDebateTurn,
  outputPath:  string,
  retries    = 2,
): Promise<string> {
  const apiKey  = getApiKey();
  const speaker = turn.speaker;
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];

  // Build combined instructions: persona style + emotion cue if present
  const baseInstructions = persona.instructions;
  const emotionAddendum  = turn.emotionCue
    ? ` Current emotion: ${turn.emotionCue}.`
    : '';
  const instructions = baseInstructions + emotionAddendum;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENAI_TTS_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:           TTS_MODEL,
          input:           turn.text,
          voice:           persona.voice,
          instructions,                    // ← key: per-agent personality
          response_format: 'mp3',
          speed:           persona.speedFactor,
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
      await writeAsStringAsync(outputPath, base64, { encoding: EncodingType.Base64 });

      return outputPath;

    } catch (err) {
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
): Promise<string[]> {
  await ensureVoiceDebateDirectory(voiceDebateId);

  const audioPaths: string[]  = new Array(turns.length).fill('');
  let   completedCount        = 0;

  for (let batchStart = 0; batchStart < turns.length; batchStart += TTS_CONCURRENCY) {
    const batch = turns.slice(batchStart, batchStart + TTS_CONCURRENCY);

    callbacks.onProgress?.(
      `Generating voice audio: ${completedCount}/${turns.length} turns complete`
    );

    await Promise.allSettled(
      batch.map(async turn => {
        const outputPath = getSegmentPath(voiceDebateId, turn.turnIndex);

        try {
          await generateTurnAudio(turn, outputPath);
          audioPaths[turn.turnIndex] = outputPath;
          completedCount++;
          callbacks.onSegmentComplete(turn.turnIndex, turns.length, outputPath, true);
        } catch (err) {
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