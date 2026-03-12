// src/services/podcastOrchestrator.ts
// Part 8 — Orchestrates the full AI Podcast generation pipeline:
//
//   STEP 1 → Script Agent  (GPT-4o dialogue generation)
//   STEP 2 → DB Insert     (persist podcast row in 'generating_audio' state)
//   STEP 3 → TTS Batch     (OpenAI TTS, 3 concurrent segments)
//   STEP 4 → DB Finalize   (update row with paths + completion timestamp)
//
// Non-fatal failures:
//   • Individual TTS segments may fail — the podcast is still marked 'completed'
//     as long as at least 50% of segments were generated.
//   • If the script agent fails, the pipeline aborts immediately (fatal).

import { supabase }                    from '../lib/supabase';
import {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastTurn,
  PodcastGenerationCallbacks,
}                                       from '../types';
import { runPodcastScriptAgent }        from './agents/podcastScriptAgent';
import {
  generateAllTurnAudio,
  estimateSegmentDurationMs,
  getSegmentPath,
  deletePodcastAudio,
}                                       from './podcastTTSService';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface PodcastInput {
  topic:   string;
  /** Optional — if provided, script agent uses its facts, stats, and findings */
  report?: ResearchReport | null;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runPodcastPipeline(
  userId:    string,
  input:     PodcastInput,
  config:    PodcastConfig,
  callbacks: PodcastGenerationCallbacks
): Promise<void> {

  // ── Pre-flight ────────────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError(
      'OpenAI API key is missing.\n\n' +
      'Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart with: npx expo start --clear'
    );
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session || sessionData.session.user.id !== userId) {
    callbacks.onError('Session expired. Please sign out and sign back in.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — SCRIPT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  callbacks.onProgress('Writing podcast script with AI...');

  let script: PodcastScript;
  let title: string;
  let description: string;

  try {
    const result = await runPodcastScriptAgent({
      topic:  input.topic,
      report: input.report ?? null,
      config,
    });
    script      = result.script;
    title       = result.title;
    description = result.description;

    callbacks.onScriptGenerated(script);
    callbacks.onProgress(
      `Script ready — ${script.turns.length} turns, ~${script.estimatedDurationMinutes} min`
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown script error';
    callbacks.onError(`Script generation failed: ${msg}`);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — CREATE DATABASE ROW
  // ─────────────────────────────────────────────────────────────────────────

  const { data: podcastRow, error: insertError } = await supabase
    .from('podcasts')
    .insert({
      user_id:           userId,
      report_id:         input.report?.id ?? null,
      title,
      description,
      topic:             input.topic,
      script,
      host_voice:        config.hostVoice,
      guest_voice:       config.guestVoice,
      host_name:         config.hostName,
      guest_name:        config.guestName,
      status:            'generating_audio',
      segment_count:     script.turns.length,
      word_count:        script.totalWords,
      audio_segment_paths: [],
    })
    .select()
    .single();

  if (insertError || !podcastRow) {
    const msg = insertError?.message ?? 'Unknown database error';
    callbacks.onError(`Database error: ${msg}`);
    return;
  }

  const podcastId = podcastRow.id as string;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — TTS AUDIO GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  callbacks.onProgress(`Generating audio: 0/${script.turns.length} segments...`);

  let audioPaths: string[];

  try {
    audioPaths = await generateAllTurnAudio(
      script.turns,
      podcastId,
      config.hostVoice,
      config.guestVoice,
      {
        onSegmentComplete: (segmentIndex, totalSegments, audioPath, succeeded) => {
          callbacks.onSegmentGenerated(segmentIndex, totalSegments, audioPath);
          callbacks.onProgress(
            `Generating audio: ${segmentIndex + 1}/${totalSegments} segments`
          );
        },
        onProgress: (message) => callbacks.onProgress(message),
      }
    );
  } catch (err) {
    // Unexpected batch-level failure — mark DB row as failed and abort
    const msg = err instanceof Error ? err.message : 'Audio generation failed';
    await supabase
      .from('podcasts')
      .update({ status: 'failed', error_message: msg })
      .eq('id', podcastId);

    callbacks.onError(`Audio generation failed: ${msg}`);
    return;
  }

  // Check if we have enough segments to be useful (≥ 50%)
  const successCount = audioPaths.filter(Boolean).length;
  if (successCount < Math.ceil(script.turns.length * 0.5)) {
    await supabase
      .from('podcasts')
      .update({
        status:        'failed',
        error_message: `Only ${successCount}/${script.turns.length} audio segments were generated.`,
      })
      .eq('id', podcastId);
    callbacks.onError(
      `Not enough audio segments were generated (${successCount}/${script.turns.length}). ` +
      'Check your OpenAI API key and rate limits, then try again.'
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — FINALIZE
  // ─────────────────────────────────────────────────────────────────────────

  // Hydrate turns with final audio paths and estimated durations
  const turnsWithAudio: PodcastTurn[] = script.turns.map((turn, i) => ({
    ...turn,
    audioPath:  audioPaths[i] ?? '',
    durationMs: estimateSegmentDurationMs(turn.text),
  }));

  const totalDurationMs = turnsWithAudio.reduce(
    (sum, t) => sum + (t.durationMs ?? 0), 0
  );
  const durationSeconds = Math.round(totalDurationMs / 1000);

  const finalScript: PodcastScript = {
    ...script,
    turns: turnsWithAudio,
  };

  const { error: updateError } = await supabase
    .from('podcasts')
    .update({
      script:              finalScript,
      audio_segment_paths: audioPaths,
      status:              'completed',
      completed_segments:  successCount,
      duration_seconds:    durationSeconds,
      completed_at:        new Date().toISOString(),
    })
    .eq('id', podcastId);

  if (updateError) {
    console.warn('[PodcastOrchestrator] Failed to persist final state:', updateError.message);
    // Don't abort — the audio is generated and the in-memory podcast is valid
  }

  // Build the in-memory Podcast object returned to the UI
  const finalPodcast: Podcast = {
    id:                podcastId,
    userId,
    reportId:          input.report?.id,
    title,
    description,
    topic:             input.topic,
    script:            finalScript,
    config,
    status:            'completed',
    completedSegments: successCount,
    durationSeconds,
    wordCount:         script.totalWords,
    audioSegmentPaths: audioPaths,
    exportCount:       0,
    createdAt:         podcastRow.created_at as string,
    completedAt:       new Date().toISOString(),
  };

  callbacks.onComplete(finalPodcast);
}

// ─── Map DB row → Podcast ─────────────────────────────────────────────────────

/**
 * Transform a raw Supabase `podcasts` row into the typed Podcast interface.
 * Used by usePodcastHistory and usePodcastPlayer when loading from DB.
 */
export function mapRowToPodcast(row: Record<string, any>): Podcast {
  const config: PodcastConfig = {
    hostVoice:             row.host_voice  ?? 'alloy',
    guestVoice:            row.guest_voice ?? 'nova',
    hostName:              row.host_name   ?? 'Alex',
    guestName:             row.guest_name  ?? 'Sam',
    targetDurationMinutes: 10,
  };

  return {
    id:                row.id,
    userId:            row.user_id,
    reportId:          row.report_id ?? undefined,
    title:             row.title,
    description:       row.description ?? '',
    topic:             row.topic,
    script:            row.script ?? { turns: [], totalWords: 0, estimatedDurationMinutes: 0 },
    config,
    status:            row.status,
    completedSegments: row.completed_segments ?? 0,
    durationSeconds:   row.duration_seconds   ?? 0,
    wordCount:         row.word_count          ?? 0,
    audioSegmentPaths: row.audio_segment_paths ?? [],
    errorMessage:      row.error_message ?? undefined,
    exportCount:       row.export_count ?? 0,
    createdAt:         row.created_at,
    completedAt:       row.completed_at ?? undefined,
  };
}