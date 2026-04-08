// src/services/voiceDebateOrchestrator.ts
// Part 40 — Voice Debate Engine
//
// Coordinates the full voice debate generation pipeline:
//   1. Validate session + auth
//   2. Create DB row (voice_debates)
//   3. Call voiceDebateScriptAgent → VoiceDebateScript
//   4. Call voiceDebateTTSService → audio files per turn
//   5. Finalize DB row with audio paths + status
//   6. Background upload to Supabase Storage (non-blocking)
//
// Mirrors the architecture of podcastOrchestrator.ts.
// Error handling: script failure → fatal; individual TTS segment failure → non-fatal
// (≥60% success required to mark as completed).

import { supabase }                        from '../lib/supabase';
import { generateVoiceDebateScript }       from './agents/voiceDebateScriptAgent';
import {
  generateAllTurnAudio,
  getSegmentPath,
  ensureVoiceDebateDirectory,
  estimateSegmentDurationMs,
}                                          from './voiceDebateTTSService';
import { VOICE_PERSONAS }                  from '../constants/voiceDebate';
import type { DebateSession }              from '../types';
import type {
  VoiceDebate,
  VoiceDebateScript,
  VoiceDebateTurn,
  VoiceDebateGenerationPhase,
  VoiceDebateOrchestratorCallbacks,
} from '../types/voiceDebate';

// ─── Derive the key type from VOICE_PERSONAS ──────────────────────────────────
type VoicePersonaKey = keyof typeof VOICE_PERSONAS;

// ─── Map DB row → VoiceDebate ─────────────────────────────────────────────────

export function mapRowToVoiceDebate(row: Record<string, any>): VoiceDebate {
  return {
    id:                row.id,
    userId:            row.user_id,
    debateSessionId:   row.debate_session_id,
    topic:             row.topic             ?? '',
    question:          row.question          ?? '',
    script:            row.script            ?? { turns: [], segments: [], totalWords: 0, estimatedDurationMinutes: 0, generatedAt: '' },
    status:            row.status,
    errorMessage:      row.error_message     ?? undefined,
    audioSegmentPaths: row.audio_segment_paths ?? [],
    audioStorageUrls:  row.audio_storage_urls  ?? [],
    audioAllUploaded:  row.audio_all_uploaded  ?? false,
    totalTurns:        row.total_turns        ?? 0,
    completedSegments: row.completed_segments ?? 0,
    durationSeconds:   row.duration_seconds   ?? 0,
    wordCount:         row.word_count         ?? 0,
    exportCount:       row.export_count       ?? 0,
    playCount:         row.play_count         ?? 0,
    createdAt:         row.created_at,
    completedAt:       row.completed_at       ?? undefined,
  };
}

// ─── Fetch existing voice debate for a session ────────────────────────────────

export async function fetchVoiceDebateForSession(
  sessionId: string,
): Promise<VoiceDebate | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_voice_debate_by_session', { p_session_id: sessionId });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return mapRowToVoiceDebate(row as Record<string, any>);
  } catch {
    return null;
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runVoiceDebatePipeline(
  userId:    string,
  session:   DebateSession,
  callbacks: VoiceDebateOrchestratorCallbacks,
): Promise<void> {

  // ── Pre-flight ─────────────────────────────────────────────────────────────

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

  if (session.status !== 'completed') {
    callbacks.onError('The debate must be completed before generating a voice debate.');
    return;
  }

  if (!session.perspectives || session.perspectives.length === 0) {
    callbacks.onError('No debate perspectives found. Run the debate first.');
    return;
  }

  // ── Helper: update DB status ───────────────────────────────────────────────

  let voiceDebateId: string | null = null;

  const updateStatus = async (
    status: string,
    extra?: Record<string, unknown>,
  ) => {
    if (!voiceDebateId) return;
    const { error } = await supabase
      .from('voice_debates')
      .update({ status, ...extra })
      .eq('id', voiceDebateId);
    if (error) console.warn('[VoiceDebateOrchestrator] Status update failed:', error.message);
  };

  // ── Phase: Briefing ────────────────────────────────────────────────────────

  callbacks.onPhaseUpdate('briefing', 'Briefing agents with debate context...', 5);

  // ── Create DB row ──────────────────────────────────────────────────────────

  const { data: dbRow, error: insertError } = await supabase
    .from('voice_debates')
    .insert({
      user_id:           userId,
      debate_session_id: session.id,
      topic:             session.topic,
      question:          session.question,
      status:            'generating_script',
      script:            { turns: [], segments: [], totalWords: 0, estimatedDurationMinutes: 0, generatedAt: '' },
      audio_segment_paths: [],
    })
    .select()
    .single();

  if (insertError || !dbRow) {
    const msg = insertError?.message ?? 'Unknown database error';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      callbacks.onError('A voice debate already exists for this session. Refresh to load it.');
    } else if (msg.includes('does not exist') || msg.includes('relation')) {
      callbacks.onError('Database table not found.\n\nRun schema_part40.sql in your Supabase SQL Editor.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

  voiceDebateId = dbRow.id as string;

  try {

    // ── STEP 1: Script Generation ──────────────────────────────────────────

    callbacks.onPhaseUpdate('phase1', 'Phase 1: Agents forming opening arguments...', 10);

    let script: VoiceDebateScript;
    try {
      script = await generateVoiceDebateScript({
        topic:          session.topic,
        question:       session.question,
        perspectives:   session.perspectives,
        moderator:      session.moderator,
        agentRoles:     (session.agentRoles ?? []).filter(r =>
          ['optimist', 'skeptic', 'economist', 'technologist', 'ethicist', 'futurist'].includes(r)
        ) as any,
        onPhaseProgress: (label, agentName) => {
          // Map script agent phase labels → orchestrator phases + percents
          let phase: VoiceDebateGenerationPhase = 'phase1';
          let pct   = 20;

          if (label.includes('Cross-analysis')) { phase = 'cross_analysis'; pct = 45; }
          else if (label.includes('Phase 2'))   { phase = 'rebuttals';      pct = 60; }
          else if (label.includes('Assembling'))  { phase = 'assembly';      pct = 72; }

          callbacks.onPhaseUpdate(phase, label, pct, agentName);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Script generation failed';
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(`Script generation failed: ${msg}`);
      return;
    }

    // Save script to DB
    await supabase
      .from('voice_debates')
      .update({
        script,
        total_turns:  script.turns.length,
        word_count:   script.totalWords,
        status:       'generating_audio',
      })
      .eq('id', voiceDebateId);

    // ── STEP 2: TTS Audio Generation ──────────────────────────────────────

    callbacks.onPhaseUpdate('audio', 'Generating voice audio for each speaker...', 75, 'Starting audio...');
    callbacks.onAudioProgress(0, script.turns.length);

    await ensureVoiceDebateDirectory(voiceDebateId);

    let audioPaths: string[];
    try {
      audioPaths = await generateAllTurnAudio(
        script.turns,
        voiceDebateId,
        {
          onSegmentComplete: (turnIndex, total, audioPath, succeeded) => {
            callbacks.onAudioProgress(turnIndex + 1, total);
            const pct = 75 + Math.round(((turnIndex + 1) / total) * 25);

            // ── FIX 1 (TS7053): cast speaker to VoicePersonaKey before indexing ──
            const turn        = script.turns[turnIndex];
            const speakerKey  = (turn?.speaker ?? 'moderator') as VoicePersonaKey;
            const displayName = VOICE_PERSONAS[speakerKey]?.displayName ?? '';

            callbacks.onPhaseUpdate(
              'audio',
              `Generating voice audio: ${turnIndex + 1}/${total} turns`,
              Math.min(99, pct),
              displayName,
            );
          },
          onProgress: (message) => {
            callbacks.onPhaseUpdate('audio', message, 80);
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audio generation failed';
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(`Audio generation failed: ${msg}`);
      return;
    }

    const successCount = audioPaths.filter(Boolean).length;
    const minRequired  = Math.ceil(script.turns.length * 0.60);

    if (successCount < minRequired) {
      const msg = `Only ${successCount}/${script.turns.length} audio segments generated (minimum ${minRequired} required).`;
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(msg);
      return;
    }

    // ── STEP 3: Finalize ───────────────────────────────────────────────────

    // Attach audio paths to turns + compute durations
    const turnsWithAudio: VoiceDebateTurn[] = script.turns.map((turn, i) => {
      // ── FIX 2 (TS7053): cast speaker to VoicePersonaKey before indexing ──
      const speakerKey = (turn.speaker ?? 'moderator') as VoicePersonaKey;
      const persona    = VOICE_PERSONAS[speakerKey] ?? VOICE_PERSONAS['moderator'];
      return {
        ...turn,
        audioPath:  audioPaths[i] ?? '',
        durationMs: estimateSegmentDurationMs(turn.text, persona.speedFactor),
      };
    });

    const totalDurationMs = turnsWithAudio.reduce((s, t) => s + (t.durationMs ?? 0), 0);
    const durationSeconds = Math.round(totalDurationMs / 1000);

    const finalScript: VoiceDebateScript = {
      ...script,
      turns: turnsWithAudio,
    };

    const completedAt = new Date().toISOString();

    const { error: finalError } = await supabase
      .from('voice_debates')
      .update({
        script:              finalScript,
        audio_segment_paths: audioPaths,
        status:              'completed',
        completed_segments:  successCount,
        total_turns:         turnsWithAudio.length,
        duration_seconds:    durationSeconds,
        word_count:          script.totalWords,
        completed_at:        completedAt,
      })
      .eq('id', voiceDebateId);

    if (finalError) {
      console.warn('[VoiceDebateOrchestrator] Final save failed:', finalError.message);
      // Try minimal update
      await supabase
        .from('voice_debates')
        .update({
          status:       'completed',
          completed_at: completedAt,
          audio_segment_paths: audioPaths,
        })
        .eq('id', voiceDebateId);
    }

    const finalVoiceDebate: VoiceDebate = {
      id:                voiceDebateId,
      userId,
      debateSessionId:   session.id,
      topic:             session.topic,
      question:          session.question,
      script:            finalScript,
      status:            'completed',
      audioSegmentPaths: audioPaths,
      audioStorageUrls:  [],
      audioAllUploaded:  false,
      totalTurns:        turnsWithAudio.length,
      completedSegments: successCount,
      durationSeconds,
      wordCount:         script.totalWords,
      exportCount:       0,
      playCount:         0,
      createdAt:         dbRow.created_at as string,
      completedAt,
    };

    callbacks.onPhaseUpdate('done', 'Voice debate ready!', 100);
    callbacks.onComplete(finalVoiceDebate);

    // ── STEP 4: Background cloud upload (non-blocking) ─────────────────────
    uploadAudioBackground(voiceDebateId, audioPaths);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown voice debate pipeline error';
    console.error('[VoiceDebateOrchestrator] Fatal pipeline error:', error);
    if (voiceDebateId) {
      await updateStatus('failed', { error_message: message });
    }
    callbacks.onError(message);
  }
}

// ─── Background Cloud Upload ───────────────────────────────────────────────────
// Uploads audio to Supabase Storage so other devices can stream.
// Non-blocking — failure is logged but doesn't affect the user.

async function uploadAudioBackground(
  voiceDebateId: string,
  audioPaths:    string[],
): Promise<void> {
  const localPaths = audioPaths.filter(
    p => p && (p.startsWith('file://') || p.startsWith('/'))
  );
  if (localPaths.length === 0) return;

  try {
    // Reuse the podcast-audio bucket if it exists, or skip gracefully
    const bucket = 'podcast-audio'; // shared bucket
    const uploadResults: (string | null)[] = [];

    for (let i = 0; i < audioPaths.length; i++) {
      const localPath = audioPaths[i];
      if (!localPath) { uploadResults.push(null); continue; }

      try {
        const { getInfoAsync: gi, readAsStringAsync } = await import('expo-file-system/legacy');
        const info = await gi(localPath);
        if (!info.exists) { uploadResults.push(null); continue; }

        const base64 = await readAsStringAsync(localPath, { encoding: 'base64' as any });
        const blob   = base64ToBlob(base64, 'audio/mpeg');
        const storagePath = `voice_debates/${voiceDebateId}/turn_${i}.mp3`;

        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(storagePath, blob, {
            contentType: 'audio/mpeg',
            upsert:      true,
          });

        if (error) { uploadResults.push(null); continue; }

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        uploadResults.push(urlData.publicUrl ?? null);
      } catch {
        uploadResults.push(null);
      }
    }

    const uploaded = uploadResults.filter(Boolean).length;
    if (uploaded > 0) {
      await supabase
        .from('voice_debates')
        .update({
          audio_storage_urls:  uploadResults,
          audio_all_uploaded:  uploaded === audioPaths.length,
          audio_uploaded_at:   new Date().toISOString(),
        })
        .eq('id', voiceDebateId);
    }
  } catch (err) {
    console.warn('[VoiceDebateOrchestrator] Background upload failed (non-fatal):', err);
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}