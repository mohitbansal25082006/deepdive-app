// src/services/voiceResearch.ts
// Voice-to-text for research queries using expo-audio recording
// and OpenAI Whisper transcription.
//
// Part 59 — The Whisper call moved to transcriptionService.ts, which goes
// through the `ai-audio-gateway` Edge Function. There is no OpenAI key in this
// file, and no hand-rolled FormData either — uploadAsync streams the recording
// from disk instead of loading it into memory first.
//
// Recording behaviour is untouched. Migrated from deprecated `expo-av` to
// `expo-audio` (SDK 57 removed the expo-av native module entirely — see
// GlobalAudioEngine.ts for the full rationale).

import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { transcribeAudioFile } from './transcriptionService';

// NOTE: `AudioRecorder` is exported as a TYPE only from 'expo-audio' — there
// is no public top-level constructor. The real constructible class lives on
// the `AudioModule` namespace object (AudioModule.AudioRecorder). The type
// import above is used purely for annotating the module-level singleton below.

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

// ─── Transcription ────────────────────────────────────────────────────────────
// Part 59: delegated to the shared service so all three voice entry points
// (research, debate, workspace search) share one implementation and one key.

export async function transcribeAudio(audioUri: string): Promise<string> {
  return transcribeAudioFile(audioUri, { language: 'en' });
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}