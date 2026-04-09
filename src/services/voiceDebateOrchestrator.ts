// src/services/voiceDebateOrchestrator.ts
// Part 40 + Part 41.2 UPDATE
//
// KEY CHANGES in 41.2:
//   1. Background upload now uses voiceDebateAudioUploadService (dedicated,
//      with retry + timeout + terminal logs) instead of the old inline function.
//   2. Final DB save (status=completed) wrapped in a retry loop with 15s timeout
//      each attempt — fixes "network request failed" / "timed out" errors that
//      happened when the device was on a slow connection at end of generation.
//   3. supabase DB calls that could hang now use a withTimeout() wrapper.
//   4. Cleaner error messages surfaced to the UI for network failures.

import { supabase }                        from '../lib/supabase';
import { generateVoiceDebateScript }       from './agents/voiceDebateScriptAgent';
import {
  generateAllTurnAudio,
  ensureVoiceDebateDirectory,
  estimateSegmentDurationMs,
}                                          from './voiceDebateTTSService';
import { VOICE_PERSONAS }                  from '../constants/voiceDebate';
import { uploadVoiceDebateAudioBackground } from './voiceDebateAudioUploadService';
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

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Network timeout after ${ms / 1000}s: ${label}`)),
      ms,
    );
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Map DB row → VoiceDebate ─────────────────────────────────────────────────

export function mapRowToVoiceDebate(row: Record<string, unknown>): VoiceDebate {
  return {
    id:                row.id as string,
    userId:            row.user_id as string,
    debateSessionId:   row.debate_session_id as string,
    topic:             (row.topic             as string) ?? '',
    question:          (row.question          as string) ?? '',
    script:            (row.script            as VoiceDebateScript) ?? { turns: [], segments: [], totalWords: 0, estimatedDurationMinutes: 0, generatedAt: '' },
    status:            row.status as VoiceDebate['status'],
    errorMessage:      (row.error_message     as string | undefined) ?? undefined,
    audioSegmentPaths: (row.audio_segment_paths as string[]) ?? [],
    audioStorageUrls:  (row.audio_storage_urls  as string[]) ?? [],
    audioAllUploaded:  (row.audio_all_uploaded  as boolean) ?? false,
    totalTurns:        (row.total_turns        as number) ?? 0,
    completedSegments: (row.completed_segments as number) ?? 0,
    durationSeconds:   (row.duration_seconds   as number) ?? 0,
    wordCount:         (row.word_count         as number) ?? 0,
    exportCount:       (row.export_count       as number) ?? 0,
    playCount:         (row.play_count         as number) ?? 0,
    createdAt:         row.created_at as string,
    completedAt:       (row.completed_at       as string | undefined) ?? undefined,
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
    return mapRowToVoiceDebate(row as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ─── Delete any stale (non-completed) voice debate for a session ──────────────

async function deleteStaleVoiceDebate(
  userId:    string,
  sessionId: string,
): Promise<void> {
  try {
    const query = supabase
      .from('voice_debates')
      .delete()
      .eq('user_id', userId)
      .eq('debate_session_id', sessionId)
      .neq('status', 'completed');

    const { error } = await withTimeout(
      query as unknown as Promise<{ error: { message: string } | null }>,
      10_000,
      'deleteStaleVoiceDebate',
    );
    if (error) {
      console.warn('[VoiceDebateOrchestrator] Could not delete stale row:', error.message);
    }
  } catch (err) {
    console.warn('[VoiceDebateOrchestrator] deleteStaleVoiceDebate error (non-fatal):', err);
  }
}

// ─── Retry-wrapped DB update ──────────────────────────────────────────────────
// Wraps supabase.from().update() with up to 3 attempts and a per-attempt
// timeout so we don't hang forever on slow connections.

async function updateWithRetry(
  table:   string,
  id:      string,
  payload: Record<string, unknown>,
  label:   string,
  maxAttempts = 3,
  timeoutMs   = 15_000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const query = supabase.from(table).update(payload).eq('id', id);

      const { error } = await withTimeout(
        query as unknown as Promise<{ error: { message: string } | null }>,
        timeoutMs,
        `${label} attempt ${attempt}`,
      );
      if (!error) {
        return true;
      }
      console.warn(
        `[VoiceDebateOrchestrator] ${label} attempt ${attempt} failed: ${error.message}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[VoiceDebateOrchestrator] ${label} attempt ${attempt} threw: ${msg}`);
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  return false;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runVoiceDebatePipeline(
  userId:    string,
  session:   DebateSession,
  callbacks: VoiceDebateOrchestratorCallbacks,
  signal?:   AbortSignal,
): Promise<void> {

  const isAborted = () => signal?.aborted ?? false;

  const checkAbort = () => {
    if (isAborted()) {
      throw new DOMException('Voice debate generation was cancelled.', 'AbortError');
    }
  };

  // ── Pre-flight checks ──────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError('OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart.');
    return;
  }

  checkAbort();

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

  // ── Delete any stale row ───────────────────────────────────────────────────

  checkAbort();
  await deleteStaleVoiceDebate(userId, session.id);
  checkAbort();

  // ── Helper: update DB status (non-fatal) ──────────────────────────────────

  let voiceDebateId: string | null = null;

  const updateStatus = async (
    status: string,
    extra?: Record<string, unknown>,
  ) => {
    if (!voiceDebateId) return;
    await updateWithRetry('voice_debates', voiceDebateId, { status, ...extra }, `updateStatus(${status})`);
  };

  // ── Phase: Briefing ────────────────────────────────────────────────────────

  callbacks.onPhaseUpdate('briefing', 'Briefing agents with debate context...', 5);
  checkAbort();

  // ── Create DB row ──────────────────────────────────────────────────────────

  let dbRow: Record<string, unknown> | null = null;
  let insertError: unknown = null;

  try {
    const insertQuery = supabase
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

    const result = await withTimeout(
      insertQuery as unknown as Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>,
      15_000,
      'INSERT voice_debates',
    );
    dbRow        = result.data;
    insertError  = result.error;
  } catch (err) {
    insertError = err;
  }

  if (insertError || !dbRow) {
    const msg = (insertError instanceof Error ? insertError.message : (insertError as { message?: string })?.message) ?? 'Unknown database error';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      callbacks.onError(
        'A completed voice debate already exists for this session.\n\nDelete it first using the trash icon, then regenerate.',
      );
    } else if (msg.includes('does not exist') || msg.includes('relation')) {
      callbacks.onError('Database table not found.\n\nRun schema_part40.sql in your Supabase SQL Editor.');
    } else if (msg.includes('timeout') || msg.includes('Network')) {
      callbacks.onError('Network timeout while starting generation. Please check your connection and try again.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

  voiceDebateId = dbRow.id as string;

  try {

    // ── STEP 1: Script Generation ──────────────────────────────────────────

    checkAbort();
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
          if (isAborted()) return;
          let phase: VoiceDebateGenerationPhase = 'phase1';
          let pct   = 20;
          if (label.includes('Cross-analysis')) { phase = 'cross_analysis'; pct = 45; }
          else if (label.includes('Phase 2'))   { phase = 'rebuttals';      pct = 60; }
          else if (label.includes('Assembling'))  { phase = 'assembly';     pct = 72; }
          callbacks.onPhaseUpdate(phase, label, pct, agentName);
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      const msg = err instanceof Error ? err.message : 'Script generation failed';
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(`Script generation failed: ${msg}`);
      return;
    }

    checkAbort();

    // ── Save script to DB (with retry) ─────────────────────────────────────

    const scriptSaved = await updateWithRetry(
      'voice_debates',
      voiceDebateId,
      {
        script,
        total_turns:  script.turns.length,
        word_count:   script.totalWords,
        status:       'generating_audio',
      },
      'save script',
      3,
      15_000,
    );

    if (!scriptSaved) {
      console.warn('[VoiceDebateOrchestrator] Script save failed — continuing anyway (audio generation will proceed)');
    }

    // ── STEP 2: TTS Audio Generation ──────────────────────────────────────

    checkAbort();
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
            if (isAborted()) return;
            callbacks.onAudioProgress(turnIndex + 1, total);
            const pct         = 75 + Math.round(((turnIndex + 1) / total) * 25);
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
            if (isAborted()) return;
            callbacks.onPhaseUpdate('audio', message, 80);
          },
        },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      const msg = err instanceof Error ? err.message : 'Audio generation failed';
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(`Audio generation failed: ${msg}`);
      return;
    }

    checkAbort();

    const successCount = audioPaths.filter(Boolean).length;
    const minRequired  = Math.ceil(script.turns.length * 0.60);

    if (successCount < minRequired) {
      const msg = `Only ${successCount}/${script.turns.length} audio segments generated (minimum ${minRequired} required).`;
      await updateStatus('failed', { error_message: msg });
      callbacks.onError(msg);
      return;
    }

    // ── STEP 3: Finalize ───────────────────────────────────────────────────

    const turnsWithAudio: VoiceDebateTurn[] = script.turns.map((turn, i) => {
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

    // ── Save final state to DB — retry up to 3 times, 15s timeout each ────

    const finalPayload = {
      script:              finalScript,
      audio_segment_paths: audioPaths,
      status:              'completed',
      completed_segments:  successCount,
      total_turns:         turnsWithAudio.length,
      duration_seconds:    durationSeconds,
      word_count:          script.totalWords,
      completed_at:        completedAt,
    };

    const finalSaved = await updateWithRetry(
      'voice_debates',
      voiceDebateId,
      finalPayload,
      'final save (completed)',
      3,
      15_000,
    );

    if (!finalSaved) {
      // Last-ditch attempt with minimal payload (just mark completed)
      console.warn('[VoiceDebateOrchestrator] Full final save failed — attempting minimal save');
      await updateWithRetry(
        'voice_debates',
        voiceDebateId,
        {
          status:              'completed',
          completed_at:        completedAt,
          audio_segment_paths: audioPaths,
        },
        'minimal final save',
        2,
        10_000,
      );
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
    // Uses the new dedicated upload service with retry + timeout + terminal logs
    console.log(`[VoiceDebateOrchestrator] 📡  Kicking off background audio upload for voiceDebateId=${voiceDebateId}`);
    uploadVoiceDebateAudioBackground(voiceDebateId, audioPaths);

  } catch (error) {
    // ── Cancelled ─────────────────────────────────────────────────────────
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (voiceDebateId) {
        supabase
          .from('voice_debates')
          .delete()
          .eq('id', voiceDebateId)
          .neq('status', 'completed')
          .then(({ error: delError }) => {
            if (delError) console.warn('[VoiceDebateOrchestrator] Could not delete cancelled row:', delError.message);
          });
      }
      callbacks.onError('AbortError');
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown voice debate pipeline error';
    console.error('[VoiceDebateOrchestrator] Fatal pipeline error:', error);
    if (voiceDebateId) {
      await updateWithRetry('voice_debates', voiceDebateId, { status: 'failed', error_message: message }, 'mark failed', 2, 10_000);
    }
    callbacks.onError(message);
  }
}