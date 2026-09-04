// src/hooks/useWorkspaceSearchVoice.ts
// Part 53 — Feature 3: Voice input for workspace search.
// Migrated from deprecated `expo-av` to `expo-audio` (SDK 57 removed the
// expo-av native module entirely — see GlobalAudioEngine.ts header for the
// full rationale).
//
//   A self-contained voice-to-text hook for the WorkspaceSearchModal search
//   bar. It mirrors useDebateVoice.ts (Part 21) exactly — record via
//   expo-audio, transcribe via OpenAI Whisper, hand the text back to the
//   caller — but is tuned for short search queries (20s max) rather than
//   long debate topics.
//
//   Usage:
//     const { voiceState, startVoice, stopVoice, cancelVoice, clearError } =
//       useWorkspaceSearchVoice({ onTranscribed: (text) => search(text) });

import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import * as FileSystem                    from 'expo-file-system/legacy';

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
      patch({ isRecording: false, error: 'Failed to start recording. Please try again.' });
    }
  }, [ensurePermission, maxDurationMs, patch]);

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
      if (!uri) throw new Error('No audio URI returned from recording.');

      const text = await transcribeWithWhisper(uri);

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

// ─── Whisper transcription ─────────────────────────────────────────────────────
// Uses expo-file-system uploadAsync (most reliable on both iOS & Android).

async function transcribeWithWhisper(audioUri: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured.');

  const response = await FileSystem.uploadAsync(
    'https://api.openai.com/v1/audio/transcriptions',
    audioUri,
    {
      headers:    { Authorization: `Bearer ${apiKey}` },
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName:  'file',
      mimeType:   'audio/m4a',
      parameters: { model: 'whisper-1', language: 'en' },
    },
  );

  if (response.status !== 200) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const body = JSON.parse(response.body);
      errMsg = body?.error?.message ?? errMsg;
    } catch { /* ignore */ }
    throw new Error(`Whisper API error: ${errMsg}`);
  }

  const data = JSON.parse(response.body);
  return (data.text ?? '').trim();
}