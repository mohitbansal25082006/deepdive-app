// src/hooks/useWorkspaceSearchVoice.ts
// Part 53 — Feature 3: Voice input for workspace search.
// Part 59 — Whisper transcription moved to transcriptionService.ts, which
//   routes through the `ai-audio-gateway` Edge Function. The local
//   transcribeWithWhisper() copy (and its OpenAI key) is gone.
//
// A self-contained voice-to-text hook for the WorkspaceSearchModal search bar.
// Mirrors useDebateVoice.ts exactly — record via expo-audio, transcribe, hand
// the text back — but tuned for short search queries (20s max) rather than long
// debate topics.
//
// Migrated from deprecated `expo-av` to `expo-audio` (SDK 57 removed the
// expo-av native module entirely — see GlobalAudioEngine.ts for the rationale).
//
//   Usage:
//     const { voiceState, startVoice, stopVoice, cancelVoice, clearError } =
//       useWorkspaceSearchVoice({ onTranscribed: (text) => search(text) });

import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { transcribeAudioFile } from '../services/transcriptionService';

// NOTE: `AudioRecorder` is exported as a TYPE only from 'expo-audio' — there
// is no public top-level constructor. The real constructible class lives on
// the `AudioModule` namespace object (AudioModule.AudioRecorder). The type
// import above is used purely for annotating the ref below.

// ─── State shape ──────────────────────────────────────────────────────────────

export interface WorkspaceSearchVoiceState {
  isRecording:       boolean;
  isTranscribing:    boolean;
  permissionGranted: boolean;
  durationMs:        number;
  error:             string | null;
}

interface UseWorkspaceSearchVoiceOptions {
  /** Called with the final transcribed text once Whisper returns. */
  onTranscribed: (text: string) => void;
  /** Max recording duration in ms. Defaults to 20 000 ms (search is short). */
  maxDurationMs?: number;
}

const INITIAL: WorkspaceSearchVoiceState = {
  isRecording:       false,
  isTranscribing:    false,
  permissionGranted: false,
  durationMs:        0,
  error:             null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceSearchVoice({
  onTranscribed,
  maxDurationMs = 20_000,
}: UseWorkspaceSearchVoiceOptions) {
  const [voiceState, setVoiceState] = useState<WorkspaceSearchVoiceState>(INITIAL);

  const recorderRef    = useRef<AudioRecorder | null>(null);
  const durationRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCancelledRef = useRef(false);
  const mountedRef     = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Best-effort cleanup if unmounted mid-record
      if (durationRef.current) clearInterval(durationRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
        recorderRef.current = null;
      }
    };
  }, []);

  const patch = useCallback((partial: Partial<WorkspaceSearchVoiceState>) => {
    if (mountedRef.current) setVoiceState(prev => ({ ...prev, ...partial }));
  }, []);

  const clearTimers = useCallback(() => {
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
  }, []);

  // ── Permission ───────────────────────────────────────────────────────────
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    patch({ permissionGranted: granted });
    if (!granted) patch({ error: 'Microphone permission is required for voice search.' });
    return granted;
  }, [patch]);

  // ── Stop + transcribe ──────────────────────────────────────────────────────
  const stopVoice = useCallback(async () => {
    clearTimers();
    if (!recorderRef.current) return;

    const rec = recorderRef.current;
    recorderRef.current = null;

    patch({ isRecording: false, isTranscribing: true });

    try {
      await rec.stop();
      await setAudioModeAsync({ allowsRecording: false });

      if (isCancelledRef.current) {
        patch({ isTranscribing: false });
        return;
      }

      const uri = rec.uri;
      if (!uri) throw new Error('No audio was captured. Please try again.');

      // Part 59: goes through the audio gateway — no key in the app.
      const text = await transcribeAudioFile(uri, { language: 'en' });

      if (!isCancelledRef.current && text.trim()) {
        onTranscribed(text.trim());
      }
      patch({ isTranscribing: false, durationMs: 0 });
    } catch (err) {
      console.error('[WorkspaceSearchVoice] Stop/transcribe error:', err);
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      patch({ isTranscribing: false, error: msg });
    }
  }, [clearTimers, onTranscribed, patch]);

  // ── Start ────────────────────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    isCancelledRef.current = false;

    const granted = await ensurePermission();
    if (!granted) return;

    try {
      await setAudioModeAsync({
        allowsRecording:   true,
        playsInSilentMode: true,
      });

      const rec = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await rec.prepareToRecordAsync();
      rec.record();
      recorderRef.current = rec;

      let ms = 0;
      patch({ isRecording: true, isTranscribing: false, durationMs: 0, error: null });

      durationRef.current = setInterval(() => {
        ms += 100;
        patch({ durationMs: ms });
      }, 100);

      autoStopRef.current = setTimeout(() => { stopVoice(); }, maxDurationMs);
    } catch (err) {
      console.error('[WorkspaceSearchVoice] Start error:', err);
      patch({ isRecording: false, error: 'Could not start recording. Please try again.' });
    }
  }, [ensurePermission, maxDurationMs, patch, stopVoice]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancelVoice = useCallback(async () => {
    isCancelledRef.current = true;
    clearTimers();
    if (recorderRef.current) {
      try { await recorderRef.current.stop(); } catch { /* ignore */ }
      recorderRef.current = null;
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (mountedRef.current) setVoiceState(INITIAL);
  }, [clearTimers]);

  const clearError = useCallback(() => patch({ error: null }), [patch]);

  return { voiceState, startVoice, stopVoice, cancelVoice, clearError };
}