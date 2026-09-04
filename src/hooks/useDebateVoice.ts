// src/hooks/useDebateVoice.ts
// Part 21 — Voice input hook for the Debate tab.
// Migrated from deprecated `expo-av` to `expo-audio` (SDK 57 removed the
// expo-av native module entirely — see GlobalAudioEngine.ts header for the
// full rationale).
//
// Mirrors the pattern in voiceResearch.ts but as a self-contained hook so
// the Debate screen doesn't need to manage recording state manually.
//
// Usage:
//   const { voiceState, startVoice, stopVoice, cancelVoice } = useDebateVoice({
//     onTranscribed: (text) => setTopic(text),
//   });

import { useState, useCallback, useRef } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import * as FileSystem                    from 'expo-file-system/legacy';
import type { DebateVoiceState }          from '../types';

// NOTE: `AudioRecorder` is exported as a TYPE only from 'expo-audio' — there
// is no public top-level constructor. The real constructible class lives on
// the `AudioModule` namespace object (AudioModule.AudioRecorder), which is
// the pattern expo-audio itself uses internally for imperative (non-hook)
// recording. We use the type import purely for annotating the ref below.

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseDebateVoiceOptions {
  /** Called with the final transcribed text once Whisper returns. */
  onTranscribed: (text: string) => void;
  /** Optional max recording duration in milliseconds. Defaults to 60 000 ms. */
  maxDurationMs?: number;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL: DebateVoiceState = {
  isRecording:       false,
  isTranscribing:    false,
  permissionGranted: false,
  durationMs:        0,
  error:             null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDebateVoice({
  onTranscribed,
  maxDurationMs = 60_000,
}: UseDebateVoiceOptions) {
  const [voiceState, setVoiceState] = useState<DebateVoiceState>(INITIAL);

  const recorderRef     = useRef<AudioRecorder | null>(null);
  const durationRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCancelledRef  = useRef(false);

  // ── Internal helpers ───────────────────────────────────────────────────────

  const patch = useCallback((partial: Partial<DebateVoiceState>) => {
    setVoiceState(prev => ({ ...prev, ...partial }));
  }, []);

  const clearTimers = useCallback(() => {
    if (durationRef.current)  { clearInterval(durationRef.current);  durationRef.current  = null; }
    if (autoStopRef.current)  { clearTimeout(autoStopRef.current);   autoStopRef.current  = null; }
  }, []);

  // ── Permission check ───────────────────────────────────────────────────────

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    patch({ permissionGranted: granted });
    if (!granted) {
      patch({ error: 'Microphone permission is required to use voice input.' });
    }
    return granted;
  }, [patch]);

  // ── Start recording ────────────────────────────────────────────────────────

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

      // Reset duration counter
      let ms = 0;
      patch({ isRecording: true, isTranscribing: false, durationMs: 0, error: null });

      durationRef.current = setInterval(() => {
        ms += 100;
        patch({ durationMs: ms });
      }, 100);

      // Auto-stop at maxDurationMs
      autoStopRef.current = setTimeout(() => {
        stopVoice();
      }, maxDurationMs);

    } catch (err) {
      console.error('[DebateVoice] Start error:', err);
      patch({
        isRecording: false,
        error: 'Failed to start recording. Please try again.',
      });
    }
  }, [ensurePermission, maxDurationMs, patch]);

  // ── Stop recording & transcribe ────────────────────────────────────────────

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
      console.error('[DebateVoice] Stop/transcribe error:', err);
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      patch({ isTranscribing: false, error: msg });
    }
  }, [clearTimers, onTranscribed, patch]);

  // ── Cancel ────────────────────────────────────────────────────────────────

  const cancelVoice = useCallback(async () => {
    isCancelledRef.current = true;
    clearTimers();

    if (recorderRef.current) {
      try {
        await recorderRef.current.stop();
      } catch { /* ignore */ }
      recorderRef.current = null;
    }

    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setVoiceState(INITIAL);
  }, [clearTimers]);

  // ── Dismiss error ─────────────────────────────────────────────────────────

  const clearError = useCallback(() => {
    patch({ error: null });
  }, [patch]);

  return {
    voiceState,
    startVoice,
    stopVoice,
    cancelVoice,
    clearError,
  };
}

// ─── Whisper transcription ─────────────────────────────────────────────────────
// Uses expo-file-system uploadAsync (most reliable on both iOS & Android).

async function transcribeWithWhisper(audioUri: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured.');

  // expo-file-system uploadAsync handles the multipart form correctly on both platforms
  const response = await FileSystem.uploadAsync(
    'https://api.openai.com/v1/audio/transcriptions',
    audioUri,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      httpMethod:   'POST',
      uploadType:   FileSystem.FileSystemUploadType.MULTIPART,
      fieldName:    'file',
      mimeType:     'audio/m4a',
      parameters: {
        model:    'whisper-1',
        language: 'en',
      },
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