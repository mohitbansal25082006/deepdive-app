// src/services/podcastOrchestrator.ts
// Part 19 — Updated:
//   • SerpAPI web search now runs BEFORE script generation as a dedicated step
//   • Script agent receives fresh search results for grounding
//   • Progress callbacks updated with "Searching web..." step
//   • mapRowToPodcast updated to restore targetDurationMinutes from DB
//   • Duration fix: uses accurate TTS_WPM from script agent

import { supabase }                    from '../lib/supabase';
import {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastTurn,
  PodcastGenerationCallbacks,
}                                       from '../types';
import {
  runPodcastScriptAgent,
  estimateTTSDurationMs,
  type VoicePresetStyle,
}                                       from './agents/podcastScriptAgent';
import {
  generateAllTurnAudio,
  getSegmentPath,
  deletePodcastAudio,
}                                       from './podcastTTSService';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface PodcastInput {
  topic:        string;
  /** If provided, script agent uses its verified facts and statistics */
  report?:      ResearchReport | null;
  /** Voice preset style — passed through to script agent */
  presetStyle?: VoicePresetStyle;
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
      'OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart with: npx expo start --clear'
    );
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session || sessionData.session.user.id !== userId) {
    callbacks.onError('Session expired. Please sign out and sign back in.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — WEB SEARCH (if SerpAPI key is present)
  // ─────────────────────────────────────────────────────────────────────────

  const serpKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
  const hasSerpKey = !!(serpKey && serpKey.trim() && serpKey !== 'your_serpapi_key_here');

  if (hasSerpKey) {
    callbacks.onProgress(`🔍 Searching the web for latest "${input.topic}" data...`);
  } else {
    callbacks.onProgress('Writing podcast script with AI...');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — SCRIPT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  let script: PodcastScript;
  let title: string;
  let description: string;
  let webSearchUsed = false;

  try {
    const result = await runPodcastScriptAgent({
      topic:       input.topic,
      report:      input.report ?? null,
      config,
      presetStyle: input.presetStyle,
    });

    script       = result.script;
    title        = result.title;
    description  = result.description;
    webSearchUsed = result.webSearchUsed;

    const searchNote = webSearchUsed
      ? ` · web-grounded`
      : '';

    callbacks.onScriptGenerated(script);
    callbacks.onProgress(
      `Script ready — ${script.turns.length} turns · ~${script.estimatedDurationMinutes} min${searchNote}`
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown script error';
    callbacks.onError(`Script generation failed: ${msg}`);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — CREATE DATABASE ROW
  // ─────────────────────────────────────────────────────────────────────────

  const { data: podcastRow, error: insertError } = await supabase
    .from('podcasts')
    .insert({
      user_id:             userId,
      report_id:           input.report?.id ?? null,
      title,
      description,
      topic:               input.topic,
      script,
      host_voice:          config.hostVoice,
      guest_voice:         config.guestVoice,
      host_name:           config.hostName,
      guest_name:          config.guestName,
      target_duration_minutes: config.targetDurationMinutes,
      status:              'generating_audio',
      segment_count:       script.turns.length,
      word_count:          script.totalWords,
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
  // STEP 4 — TTS AUDIO GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  callbacks.onProgress(`Generating audio: 0/${script.turns.length} voice segments...`);

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
            `Generating audio: ${segmentIndex + 1}/${totalSegments} voice segments`
          );
        },
        onProgress: (message) => callbacks.onProgress(message),
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Audio generation failed';
    await supabase
      .from('podcasts')
      .update({ status: 'failed', error_message: msg })
      .eq('id', podcastId);
    callbacks.onError(`Audio generation failed: ${msg}`);
    return;
  }

  // Check minimum viability (≥ 50% segments generated)
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
  // STEP 5 — FINALIZE
  // ─────────────────────────────────────────────────────────────────────────

  // Hydrate turns with final audio paths and accurate TTS durations
  const turnsWithAudio: PodcastTurn[] = script.turns.map((turn, i) => ({
    ...turn,
    audioPath:  audioPaths[i] ?? '',
    // Use the accurate TTS estimator from script agent
    durationMs: estimateTTSDurationMs(turn.text),
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
    // Non-fatal — audio is generated, in-memory podcast is valid
  }

  // Build the Podcast object returned to the UI
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
 * Part 19: restores targetDurationMinutes from DB column when available.
 */
export function mapRowToPodcast(row: Record<string, any>): Podcast {
  const config: PodcastConfig = {
    hostVoice:             row.host_voice  ?? 'alloy',
    guestVoice:            row.guest_voice ?? 'nova',
    hostName:              row.host_name   ?? 'Alex',
    guestName:             row.guest_name  ?? 'Sam',
    // Part 19: use stored target duration — falls back to script estimate
    targetDurationMinutes:
      row.target_duration_minutes ??
      row.script?.estimatedDurationMinutes ??
      10,
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
    wordCount:         row.word_count         ?? 0,
    audioSegmentPaths: row.audio_segment_paths ?? [],
    errorMessage:      row.error_message ?? undefined,
    exportCount:       row.export_count  ?? 0,
    createdAt:         row.created_at,
    completedAt:       row.completed_at ?? undefined,
  };
}