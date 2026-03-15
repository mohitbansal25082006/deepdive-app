// src/hooks/useDebateVoice.ts
// Part 20 — Voice input hook for the Debate tab.
//
// Mirrors the pattern in voiceResearch.ts but as a self-contained hook so
// the Debate screen doesn't need to manage recording state manually.
//
// Usage:
//   const { voiceState, startVoice, stopVoice, cancelVoice } = useDebateVoice({
//     onTranscribed: (text) => setTopic(text),
//   });

import { useState, useCallback, useRef } from 'react';
import { Audio }                          from 'expo-av';
import * as FileSystem                    from 'expo-file-system/legacy';
import type { DebateVoiceState }          from '../types';

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

  const recordingRef    = useRef<Audio.Recording | null>(null);
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
    const { status } = await Audio.requestPermissionsAsync();
    const granted = status === 'granted';
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;

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

    if (!recordingRef.current) return;

    const rec = recordingRef.current;
    recordingRef.current = null;

    patch({ isRecording: false, isTranscribing: true });

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (isCancelledRef.current) {
        patch({ isTranscribing: false });
        return;
      }

      const uri = rec.getURI();
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

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch { /* ignore */ }
      recordingRef.current = null;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
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