// src/services/podcastOrchestrator.ts
// Part 25 — Fixed
//
// FIXES:
//   1. Final DB UPDATE retries with minimal fields if full update fails.
//      This prevents "stuck on generating_audio in history" when columns
//      like completed_segments / duration_seconds don't exist in schema.
//   2. audio_storage_urls / audio_all_uploaded removed from INSERT (DB defaults).
//   3. Local audio paths preserved in finalPodcast — playback works immediately
//      on the generating device without waiting for cloud upload.
//
// PRESERVED: All Part 19 functionality — SerpAPI, 6 voice presets, report import,
//            voice input, chunked generation, duration fix, local storage.

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
}                                       from './podcastTTSService';
import {
  uploadPodcastAudioToStorage,
}                                       from './podcastAudioUploadService';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface PodcastInput {
  topic:        string;
  report?:      ResearchReport | null;
  presetStyle?: VoicePresetStyle;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runPodcastPipeline(
  userId:    string,
  input:     PodcastInput,
  config:    PodcastConfig,
  callbacks: PodcastGenerationCallbacks,
): Promise<void> {

  // ── Pre-flight ────────────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError(
      'OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart.'
    );
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session || sessionData.session.user.id !== userId) {
    callbacks.onError('Session expired. Please sign out and sign back in.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — WEB SEARCH + SCRIPT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  const serpKey    = process.env.EXPO_PUBLIC_SERPAPI_KEY;
  const hasSerpKey = !!(serpKey && serpKey.trim() && serpKey !== 'your_serpapi_key_here');

  callbacks.onProgress(
    hasSerpKey
      ? `🔍 Searching the web for latest "${input.topic}" data...`
      : 'Writing podcast script with AI...'
  );

  let script:       PodcastScript;
  let title:        string;
  let description:  string;
  let webSearchUsed = false;

  try {
    const result = await runPodcastScriptAgent({
      topic:       input.topic,
      report:      input.report ?? null,
      config,
      presetStyle: input.presetStyle,
    });

    script        = result.script;
    title         = result.title;
    description   = result.description;
    webSearchUsed = result.webSearchUsed;

    callbacks.onScriptGenerated(script);
    callbacks.onProgress(
      `Script ready — ${script.turns.length} turns · ~${script.estimatedDurationMinutes} min` +
      (webSearchUsed ? ' · web-grounded' : '')
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown script error';
    callbacks.onError(`Script generation failed: ${msg}`);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — CREATE DATABASE ROW
  // Omit audio_storage_urls + audio_all_uploaded — DB has defaults for these
  // from schema_part25.sql, so the INSERT works before that migration too.
  // ─────────────────────────────────────────────────────────────────────────

  const { data: podcastRow, error: insertError } = await supabase
    .from('podcasts')
    .insert({
      user_id:                 userId,
      report_id:               input.report?.id ?? null,
      title,
      description,
      topic:                   input.topic,
      script,
      host_voice:              config.hostVoice,
      guest_voice:             config.guestVoice,
      host_name:               config.hostName,
      guest_name:              config.guestName,
      target_duration_minutes: config.targetDurationMinutes,
      status:                  'generating_audio',
      segment_count:           script.turns.length,
      word_count:              script.totalWords,
      audio_segment_paths:     [],
    })
    .select()
    .single();

  if (insertError || !podcastRow) {
    callbacks.onError(`Database error: ${insertError?.message ?? 'Unknown error'}`);
    return;
  }

  const podcastId = podcastRow.id as string;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — TTS AUDIO GENERATION (stored locally first)
  // Audio is written to device filesystem — playback is immediate on this
  // device. Cloud upload happens later in the background (Step 5).
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
        onSegmentComplete: (segmentIndex, totalSegments, audioPath) => {
          callbacks.onSegmentGenerated(segmentIndex, totalSegments, audioPath);
          callbacks.onProgress(`Generating audio: ${segmentIndex + 1}/${totalSegments} voice segments`);
        },
        onProgress: (message) => callbacks.onProgress(message),
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Audio generation failed';
    await supabase.from('podcasts').update({ status: 'failed', error_message: msg }).eq('id', podcastId);
    callbacks.onError(`Audio generation failed: ${msg}`);
    return;
  }

  const successCount = audioPaths.filter(Boolean).length;
  if (successCount < Math.ceil(script.turns.length * 0.5)) {
    await supabase.from('podcasts').update({
      status:        'failed',
      error_message: `Only ${successCount}/${script.turns.length} audio segments generated.`,
    }).eq('id', podcastId);
    callbacks.onError(
      `Not enough audio segments generated (${successCount}/${script.turns.length}). ` +
      'Check your OpenAI API key and rate limits.'
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — FINALIZE LOCAL STATE & NOTIFY CALLER
  // ─────────────────────────────────────────────────────────────────────────

  const turnsWithAudio: PodcastTurn[] = script.turns.map((turn, i) => ({
    ...turn,
    audioPath:  audioPaths[i] ?? '',
    durationMs: estimateTTSDurationMs(turn.text),
  }));

  const totalDurationMs = turnsWithAudio.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const durationSeconds = Math.round(totalDurationMs / 1000);
  const finalScript: PodcastScript = { ...script, turns: turnsWithAudio };

  // ── Robust DB UPDATE strategy ─────────────────────────────────────────────
  // Try full update first. If it fails (missing columns in older schemas),
  // fall back to a minimal update that only touches columns present in every
  // schema version. Either path MUST set status = 'completed' so the history
  // list shows correctly after the next fetch.

  const { error: fullUpdateError } = await supabase
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

  if (fullUpdateError) {
    console.warn('[PodcastOrchestrator] Full update failed, trying minimal fallback:', fullUpdateError.message);

    const { error: minimalError } = await supabase
      .from('podcasts')
      .update({
        script:              finalScript,
        audio_segment_paths: audioPaths,
        status:              'completed',
        completed_at:        new Date().toISOString(),
      })
      .eq('id', podcastId);

    if (minimalError) {
      // Both updates failed — log for debugging. The podcast is still fully
      // functional in-memory. usePodcastHistory.upsertPodcast() injects
      // the correct completed state into the history list directly.
      console.error('[PodcastOrchestrator] Both DB updates failed:', minimalError.message);
    }
  }

  // Build final in-memory podcast — local file:// paths for immediate playback
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
    audioSegmentPaths: audioPaths,   // local file:// paths — play immediately
    exportCount:       0,
    createdAt:         podcastRow.created_at as string,
    completedAt:       new Date().toISOString(),
  };

  // Fire onComplete — in podcast.tsx this triggers:
  //   1. upsertPodcast(finalPodcast) → history list updated immediately
  //   2. refresh() → re-fetches from DB for long-term consistency
  callbacks.onComplete(finalPodcast);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5 (Part 25) — BACKGROUND CLOUD UPLOAD
  // Fires AFTER onComplete() — never blocks the "Episode Ready" banner.
  // Uploads local .mp3 segments to Supabase Storage so other devices can
  // stream the audio. Local playback on this device already works via Step 3.
  // ─────────────────────────────────────────────────────────────────────────

  uploadAudioToCloudBackground(podcastId, audioPaths, successCount);
}

// ─── Background Cloud Upload ──────────────────────────────────────────────────

async function uploadAudioToCloudBackground(
  podcastId:     string,
  audioPaths:    string[],
  _segmentCount: number,
): Promise<void> {
  const localPaths = audioPaths.filter(p => p && (p.startsWith('file://') || p.startsWith('/')));
  if (localPaths.length === 0) return;

  try {
    console.log(`[PodcastOrchestrator] Background upload: ${localPaths.length} segments for ${podcastId}`);

    const result = await uploadPodcastAudioToStorage(podcastId, audioPaths, undefined);

    if (result.successCount > 0) {
      // Columns only exist after schema_part25.sql — catch column errors silently
      const { error } = await supabase
        .from('podcasts')
        .update({
          audio_storage_urls: result.uploadedUrls,
          audio_all_uploaded: result.allSucceeded,
          audio_uploaded_at:  new Date().toISOString(),
        })
        .eq('id', podcastId);

      if (error) {
        console.warn('[PodcastOrchestrator] Cloud URLs DB update skipped (run schema_part25.sql):', error.message);
      } else {
        console.log(`[PodcastOrchestrator] Cloud upload done: ${result.successCount}/${audioPaths.length} segments`);
      }
    }
  } catch (err) {
    console.warn('[PodcastOrchestrator] Background audio upload failed (non-fatal):', err);
  }
}

// ─── Map DB row → Podcast ─────────────────────────────────────────────────────

export function mapRowToPodcast(row: Record<string, any>): Podcast {
  const config: PodcastConfig = {
    hostVoice:             row.host_voice  ?? 'alloy',
    guestVoice:            row.guest_voice ?? 'nova',
    hostName:              row.host_name   ?? 'Alex',
    guestName:             row.guest_name  ?? 'Sam',
    targetDurationMinutes: row.target_duration_minutes ?? row.script?.estimatedDurationMinutes ?? 10,
  };

  return {
    id:                row.id,
    userId:            row.user_id,
    reportId:          row.report_id  ?? undefined,
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
    // Part 25: cloud audio URLs (only present after schema_part25.sql)
    audioStorageUrls:  row.audio_storage_urls ?? [],
    audioAllUploaded:  row.audio_all_uploaded ?? false,
  };
}