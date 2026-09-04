// src/services/voiceResearch.ts
// Voice-to-text for research queries using expo-audio recording
// and OpenAI Whisper transcription.
//
// Migrated from deprecated `expo-av` to `expo-audio` (SDK 57 removed the
// expo-av native module entirely — see GlobalAudioEngine.ts header for the
// full rationale).

import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';

// NOTE: `AudioRecorder` is exported as a TYPE only from 'expo-audio' — there
// is no public top-level constructor. The real constructible class lives on
// the `AudioModule` namespace object (AudioModule.AudioRecorder). The type
// import above is used purely for annotating the module-level singleton
// below.

export interface VoiceRecordingState {
  isRecording: boolean;
  permissionGranted: boolean;
  durationMs: number;
  uri: string | null;
}

let recorder: AudioRecorder | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestMicrophonePermission(): Promise<boolean> {
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  return granted;
}

// ─── Recording ────────────────────────────────────────────────────────────────

export async function startRecording(
  onDurationUpdate?: (ms: number) => void
): Promise<boolean> {
  try {
    const granted = await requestMicrophonePermission();
    if (!granted) return false;

    await setAudioModeAsync({
      allowsRecording:   true,
      playsInSilentMode: true,
    });

    recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();

    // Track duration
    let ms = 0;
    durationInterval = setInterval(() => {
      ms += 100;
      onDurationUpdate?.(ms);
    }, 100);

    return true;
  } catch (err) {
    console.error('[Voice] Start recording error:', err);
    return false;
  }
}

export async function stopRecording(): Promise<string | null> {
  if (!recorder) return null;

  try {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });

    const uri = recorder.uri;
    recorder = null;
    return uri ?? null;
  } catch (err) {
    console.error('[Voice] Stop recording error:', err);
    recorder = null;
    return null;
  }
}

export function cancelRecording(): void {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
  if (recorder) {
    recorder.stop().catch(() => {});
    recorder = null;
  }
}

// ─── Transcription via OpenAI Whisper ────────────────────────────────────────

export async function transcribeAudio(audioUri: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not set');

  // Pass the file URI directly — no base64 read needed
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    name: 'audio.m4a',
    type: 'audio/m4a',
  } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Whisper error: ${err?.error?.message ?? response.status}`);
  }

  const data = await response.json();
  return (data.text ?? '').trim();
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}