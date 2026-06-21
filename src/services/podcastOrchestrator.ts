// src/services/podcastOrchestrator.ts
// Part 39 FIX — audioQuality passed through the full generation pipeline.
// Part 53G — AbortSignal threaded so cancelling a podcast stops script + audio
//   generation immediately (no further OpenAI / TTS token spend).

import { supabase }                    from '../lib/supabase';
import type {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastTurn,
  PodcastGenerationCallbacks,
}                                       from '../types';
import {
  runPodcastScriptAgent,
  runPodcastScriptAgentV2,
  estimateTTSDurationMs,
  type VoicePresetStyle,
  type ScriptAgentV2Input,
}                                       from './agents/podcastScriptAgentV2';
import {
  generateAllTurnAudio,
  getPodcastDir,
  ensurePodcastDirectory,
  generateTurnAudio,
  getSegmentPath,
}                                       from './podcastTTSService';
import {
  uploadPodcastAudioToStorage,
}                                       from './podcastAudioUploadService';
import type {
  SpeakerConfig,
  VoicePresetStyleV2,
  PodcastScriptV2,
  PodcastTurnV2,
  AudioQuality,
}                                       from '../types/podcast_v2';
import type { PodcastVoice }            from '../types';

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

// Part 53G: mark a podcast row cancelled without throwing. supabase query
// builders are thenable but NOT Promises, so they have no .catch() — we await
// inside a try/catch instead.
async function markPodcastCancelled(podcastId: string): Promise<void> {
  try {
    await supabase.from('podcasts').update({ status: 'cancelled' }).eq('id', podcastId);
  } catch {
    // non-fatal
  }
}

export interface PodcastInput {
  topic:        string;
  report?:      ResearchReport | null;
  presetStyle?: VoicePresetStyle;
  speakers?:      SpeakerConfig[];
  speakerCount?:  2 | 3;
  presetStyleV2?: VoicePresetStyleV2;
  audioQuality?:  AudioQuality;
  seriesId?:      string;
  episodeNumber?: number;
}

function getSpeakerVoiceForV2Turn(
  turn:     PodcastTurnV2,
  speakers: SpeakerConfig[],
  config:   PodcastConfig,
): PodcastVoice {
  if (turn.speaker === 'guest2') return speakers[2]?.voice ?? config.guestVoice;
  if (turn.speaker === 'guest1') return speakers[1]?.voice ?? config.guestVoice;
  return speakers[0]?.voice ?? config.hostVoice;
}

const CONCURRENCY = 3;

interface BatchCallbacksV2 {
  onSegmentComplete: (idx: number, total: number, path: string) => void;
  onProgress?: (msg: string) => void;
}

async function generateAllTurnAudioV2(
  turns:        PodcastTurnV2[],
  podcastId:    string,
  speakers:     SpeakerConfig[],
  config:       PodcastConfig,
  callbacks:    BatchCallbacksV2,
  audioQuality: AudioQuality = 'standard',
  signal?:      AbortSignal,          // ── Part 53G ──
): Promise<string[]> {
  const audioPaths: string[] = new Array(turns.length).fill('');
  let completedCount = 0;

  for (let batchStart = 0; batchStart < turns.length; batchStart += CONCURRENCY) {
    if (signal?.aborted) {            // ── Part 53G: stop on cancel ──
      const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
    }
    const batch = turns.slice(batchStart, batchStart + CONCURRENCY);

    callbacks.onProgress?.(
      `Generating audio: ${completedCount}/${turns.length} segments complete`
    );

    await Promise.allSettled(
      batch.map(async (turn) => {
        const outputPath = getSegmentPath(podcastId, turn.segmentIndex, audioQuality);
        const voice      = getSpeakerVoiceForV2Turn(turn, speakers, config);
        try {
          await generateTurnAudio(turn.text, voice, outputPath, 2, audioQuality, signal);
          audioPaths[turn.segmentIndex] = outputPath;
          completedCount++;
          callbacks.onSegmentComplete(turn.segmentIndex, turns.length, outputPath);
        } catch (err) {
          if (isAbortError(err)) { completedCount++; return; }
          console.warn(
            `[PodcastTTS V2] Segment ${turn.segmentIndex} failed:`,
            err instanceof Error ? err.message : err
          );
          completedCount++;
          callbacks.onSegmentComplete(turn.segmentIndex, turns.length, '');
        }
      })
    );
  }

  return audioPaths;
}

function v2TurnsToV1Compatible(turns: PodcastTurnV2[]): PodcastTurn[] {
  return turns.map(t => ({
    id:           t.id,
    segmentIndex: t.segmentIndex,
    speaker:      t.speaker,
    speakerName:  t.speakerName,
    text:         t.text,
    audioPath:    t.audioPath,
    durationMs:   t.durationMs,
  }));
}

export async function runPodcastPipeline(
  userId:    string,
  input:     PodcastInput,
  config:    PodcastConfig,
  callbacks: PodcastGenerationCallbacks,
  signal?:   AbortSignal,            // ── Part 53G ──
): Promise<void> {

  const aborted = () => signal?.aborted === true;

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError('OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart.');
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session || sessionData.session.user.id !== userId) {
    callbacks.onError('Session expired. Please sign out and sign back in.');
    return;
  }

  if (aborted()) return;             // ── Part 53G ──

  const useV2 = !!(input.speakers && input.speakers.length >= 2 && input.speakerCount);
  const audioQuality: AudioQuality = input.audioQuality ?? 'standard';

  const qualityLabel = audioQuality === 'lossless'
    ? '🎵 Studio WAV quality'
    : audioQuality === 'high'
    ? '🎧 High quality (tts-1-hd)'
    : '🎙 Standard quality';

  callbacks.onProgress(`Writing podcast script with AI... (${qualityLabel})`);

  // ── STEP 1: SCRIPT ──
  let script:     PodcastScript;
  let scriptV2:   PodcastScriptV2 | null = null;
  let title:      string;
  let description: string;

  const speakers = input.speakers ?? [
    { name: config.hostName,  voice: config.hostVoice,  role: 'host'   as const },
    { name: config.guestName, voice: config.guestVoice, role: 'guest1' as const },
  ];

  try {
    if (useV2 && input.speakers && input.speakerCount) {
      const v2Input: ScriptAgentV2Input = {
        topic:                 input.topic,
        report:                input.report ?? null,
        speakers:              input.speakers,
        speakerCount:          input.speakerCount,
        targetDurationMinutes: config.targetDurationMinutes,
        presetStyleV2:         input.presetStyleV2 ?? 'casual',
        config,
      };
      const result = await runPodcastScriptAgentV2(v2Input);
      scriptV2    = result.script;
      title       = result.title;
      description = result.description;
      script = {
        turns: v2TurnsToV1Compatible(result.script.turns),
        totalWords: result.script.totalWords,
        estimatedDurationMinutes: result.script.estimatedDurationMinutes,
      };
      callbacks.onScriptGenerated(script);
    } else {
      const result = await runPodcastScriptAgent({
        topic:       input.topic,
        report:      input.report ?? null,
        config,
        presetStyle: input.presetStyle,
      });
      script        = result.script;
      title         = result.title;
      description   = result.description;
      callbacks.onScriptGenerated(script);
    }
  } catch (err) {
    if (isAbortError(err) || aborted()) return;   // ── Part 53G ──
    const msg = err instanceof Error ? err.message : 'Unknown script error';
    callbacks.onError(`Script generation failed: ${msg}`);
    return;
  }

  if (aborted()) return;             // ── Part 53G: don't create a DB row if cancelled ──

  // ── STEP 2: DB ROW ──
  const scriptToStore = scriptV2 ?? script;
  const insertPayload: Record<string, unknown> = {
    user_id:                 userId,
    report_id:               input.report?.id ?? null,
    title, description,
    topic:                   input.topic,
    script:                  scriptToStore,
    host_voice:              config.hostVoice,
    guest_voice:             config.guestVoice,
    host_name:               config.hostName,
    guest_name:              config.guestName,
    target_duration_minutes: config.targetDurationMinutes,
    status:                  'generating_audio',
    segment_count:           script.turns.length,
    word_count:              script.totalWords,
    audio_segment_paths:     [],
    speaker_count:           input.speakerCount ?? 2,
    speakers_config:         speakers,
    audio_quality:           audioQuality,
    preset_style_v2:         input.presetStyleV2 ?? (input.presetStyle ?? 'casual'),
    ...(input.seriesId      ? { series_id:      input.seriesId      } : {}),
    ...(input.episodeNumber ? { episode_number: input.episodeNumber } : {}),
  };

  const { data: podcastRow, error: insertError } = await supabase
    .from('podcasts').insert(insertPayload).select().single();

  if (insertError || !podcastRow) {
    callbacks.onError(`Database error: ${insertError?.message ?? 'Unknown error'}`);
    return;
  }
  const podcastId = podcastRow.id as string;

  if (aborted()) return;             // ── Part 53G ──

  // ── STEP 3: AUDIO ──
  callbacks.onProgress(`Generating audio: 0/${script.turns.length} voice segments (${qualityLabel})...`);

  let audioPaths: string[];
  try {
    await ensurePodcastDirectory(podcastId);
    if (useV2 && scriptV2) {
      audioPaths = await generateAllTurnAudioV2(
        scriptV2.turns, podcastId, speakers, config,
        {
          onSegmentComplete: (segmentIndex, totalSegments, audioPath) => {
            callbacks.onSegmentGenerated(segmentIndex, totalSegments, audioPath);
            callbacks.onProgress(`Generating audio: ${segmentIndex + 1}/${totalSegments} voice segments`);
          },
          onProgress: (message) => callbacks.onProgress(message),
        },
        audioQuality, signal,        // ── Part 53G ──
      );
    } else {
      audioPaths = await generateAllTurnAudio(
        script.turns, podcastId, config.hostVoice, config.guestVoice,
        {
          onSegmentComplete: (segmentIndex, totalSegments, audioPath) => {
            callbacks.onSegmentGenerated(segmentIndex, totalSegments, audioPath);
            callbacks.onProgress(`Generating audio: ${segmentIndex + 1}/${totalSegments} voice segments`);
          },
          onProgress: (message) => callbacks.onProgress(message),
        },
        audioQuality, signal,        // ── Part 53G ──
      );
    }
  } catch (err) {
    if (isAbortError(err) || aborted()) {
      // Cancelled — mark the row so it doesn't linger as "generating".
      await markPodcastCancelled(podcastId);
      return;
    }
    const msg = err instanceof Error ? err.message : 'Audio generation failed';
    await supabase.from('podcasts').update({ status: 'failed', error_message: msg }).eq('id', podcastId);
    callbacks.onError(`Audio generation failed: ${msg}`);
    return;
  }

  if (aborted()) {                   // ── Part 53G: cancelled after audio — stop ──
    await markPodcastCancelled(podcastId);
    return;
  }

  const successCount = audioPaths.filter(Boolean).length;
  if (successCount < Math.ceil(script.turns.length * 0.5)) {
    await supabase.from('podcasts').update({
      status: 'failed',
      error_message: `Only ${successCount}/${script.turns.length} audio segments generated.`,
    }).eq('id', podcastId);
    callbacks.onError(
      `Not enough audio segments generated (${successCount}/${script.turns.length}). ` +
      'Check your OpenAI API key and rate limits.'
    );
    return;
  }

  // ── STEP 4: FINALIZE ──
  const turnsWithAudio: PodcastTurn[] = useV2 && scriptV2
    ? scriptV2.turns.map((t, i) => ({
        id: t.id, segmentIndex: t.segmentIndex, speaker: t.speaker,
        speakerName: t.speakerName, text: t.text,
        audioPath: audioPaths[i] ?? '', durationMs: estimateTTSDurationMs(t.text),
      }))
    : script.turns.map((turn, i) => ({
        ...turn, audioPath: audioPaths[i] ?? '', durationMs: estimateTTSDurationMs(turn.text),
      }));

  const totalDurationMs = turnsWithAudio.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const durationSeconds = Math.round(totalDurationMs / 1000);

  const finalScriptToStore = scriptV2
    ? { ...scriptV2, turns: scriptV2.turns.map((t, i) => ({
        ...t, audioPath: audioPaths[i] ?? '', durationMs: estimateTTSDurationMs(t.text),
      })) }
    : { ...script, turns: turnsWithAudio };

  const { error: fullUpdateError } = await supabase
    .from('podcasts')
    .update({
      script:              finalScriptToStore,
      audio_segment_paths: audioPaths,
      status:              'completed',
      completed_segments:  successCount,
      duration_seconds:    durationSeconds,
      completed_at:        new Date().toISOString(),
    })
    .eq('id', podcastId);

  if (fullUpdateError) {
    console.warn('[PodcastOrchestrator] Full update failed, minimal fallback:', fullUpdateError.message);
    await supabase.from('podcasts').update({
      script: finalScriptToStore, audio_segment_paths: audioPaths,
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', podcastId);
  }

  const finalPodcast: Podcast = {
    id: podcastId, userId, reportId: input.report?.id,
    title, description, topic: input.topic,
    script: {
      turns: turnsWithAudio,
      totalWords: script.totalWords,
      estimatedDurationMinutes: script.estimatedDurationMinutes,
    },
    config, status: 'completed', completedSegments: successCount,
    durationSeconds, wordCount: script.totalWords,
    audioSegmentPaths: audioPaths, exportCount: 0,
    createdAt: podcastRow.created_at as string,
    completedAt: new Date().toISOString(),
  };

  // ── Part 53G: final cancel check before surfacing/notifying ──
  if (aborted()) {
    await markPodcastCancelled(podcastId);
    return;
  }

  callbacks.onComplete(finalPodcast);

  // Background upload (only if not cancelled).
  uploadAudioToCloudBackground(podcastId, audioPaths);
}

async function uploadAudioToCloudBackground(
  podcastId:  string,
  audioPaths: string[],
): Promise<void> {
  const localPaths = audioPaths.filter(p => p && (p.startsWith('file://') || p.startsWith('/')));
  if (localPaths.length === 0) return;
  try {
    const result = await uploadPodcastAudioToStorage(podcastId, audioPaths, undefined);
    if (result.successCount > 0) {
      await supabase.from('podcasts').update({
        audio_storage_urls: result.uploadedUrls,
        audio_all_uploaded: result.allSucceeded,
        audio_uploaded_at:  new Date().toISOString(),
      }).eq('id', podcastId);
    }
  } catch (err) {
    console.warn('[PodcastOrchestrator] Background audio upload failed (non-fatal):', err);
  }
}

export function mapRowToPodcast(row: Record<string, any>): Podcast {
  const config: PodcastConfig = {
    hostVoice:             row.host_voice  ?? 'alloy',
    guestVoice:            row.guest_voice ?? 'nova',
    hostName:              row.host_name   ?? 'Alex',
    guestName:             row.guest_name  ?? 'Sam',
    targetDurationMinutes: row.target_duration_minutes ?? row.script?.estimatedDurationMinutes ?? 10,
  };
  return {
    id: row.id, userId: row.user_id,
    reportId: row.report_id ?? undefined,
    title: row.title, description: row.description ?? '', topic: row.topic,
    script: row.script ?? { turns: [], totalWords: 0, estimatedDurationMinutes: 0 },
    config, status: row.status,
    completedSegments: row.completed_segments ?? 0,
    durationSeconds:   row.duration_seconds   ?? 0,
    wordCount:         row.word_count         ?? 0,
    audioSegmentPaths: row.audio_segment_paths ?? [],
    errorMessage:      row.error_message ?? undefined,
    exportCount:       row.export_count  ?? 0,
    createdAt:         row.created_at,
    completedAt:       row.completed_at ?? undefined,
    audioStorageUrls:  row.audio_storage_urls ?? [],
    audioAllUploaded:  row.audio_all_uploaded ?? false,
    ...(row.speaker_count   ? { speakerCount:   row.speaker_count   } : {}),
    ...(row.speakers_config ? { speakersConfig: row.speakers_config } : {}),
    ...(row.series_id       ? { seriesId:       row.series_id       } : {}),
    ...(row.episode_number  ? { episodeNumber:  row.episode_number  } : {}),
    ...(row.last_played_at  ? { lastPlayedAt:   row.last_played_at  } : {}),
  } as Podcast;
}