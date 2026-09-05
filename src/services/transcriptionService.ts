// src/services/transcriptionService.ts
// Part 59 — NEW. One Whisper path for the whole app.
//
// Before Part 59 three files each held their own copy of the transcription
// call (voiceResearch.ts, useDebateVoice.ts, useWorkspaceSearchVoice.ts), and
// each copy embedded the OpenAI key. Rather than fix the same bug three times,
// they now all call transcribeAudioFile().
//
// Transport: expo-file-system's uploadAsync streams the recording straight from
// disk as multipart/form-data. That matters — a 60-second m4a base64-encoded
// into a JSON body would be roughly a third larger and would have to be held in
// memory twice.
//
// The Edge Function rebuilds the form and forwards it to OpenAI with the key,
// so the audio itself is never stored anywhere in between.

import * as FileSystem from 'expo-file-system/legacy';
import {
  gatewayUrl,
  gatewayUploadHeaders,
  parseUploadError,
  GatewayError,
} from './apiGateway';

export interface TranscribeOptions {
  /** ISO-639-1 hint. Improves accuracy and latency. Defaults to 'en'. */
  language?: string;
  /** Optional context to bias the model (names, jargon). Max 1000 chars. */
  prompt?:   string;
  /** MIME type of the recording. Defaults to audio/m4a (expo-audio's output). */
  mimeType?: string;
}

/**
 * Transcribe a local audio file and return the recognised text.
 *
 * Throws with a message that is safe to show directly to a person — every
 * caller currently does `patch({ error: err.message })`, so vague or technical
 * text here lands straight in the UI.
 */
export async function transcribeAudioFile(
  audioUri: string,
  options: TranscribeOptions = {},
): Promise<string> {
  if (!audioUri) throw new Error('No recording was captured. Please try again.');

  const headers = await gatewayUploadHeaders();

  const parameters: Record<string, string> = {
    model:    'whisper-1',
    language: options.language ?? 'en',
  };
  if (options.prompt) parameters.prompt = options.prompt.slice(0, 1000);

  let response: FileSystem.FileSystemUploadResult;
  try {
    response = await FileSystem.uploadAsync(
      gatewayUrl('ai-audio-gateway'),
      audioUri,
      {
        headers,
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName:  'file',
        mimeType:   options.mimeType ?? 'audio/m4a',
        parameters,
      },
    );
  } catch (err) {
    throw new Error(
      'Could not reach the transcription service. Check your connection and try again.',
    );
  }

  if (response.status !== 200) {
    const gatewayError = parseUploadError(response.status, response.body ?? '');

    if (gatewayError.isNotConfigured) {
      throw new Error('Voice input is temporarily unavailable. Please type instead.');
    }
    if (gatewayError.isRateLimited) {
      throw new Error('Too many voice requests. Please wait a moment and try again.');
    }
    if (gatewayError.isAuthError) {
      throw new Error('Your session has expired. Please sign out and sign back in.');
    }
    if (gatewayError.code === 'file_too_large') {
      throw new Error('That recording is too long. Please keep it under a minute.');
    }
    throw new Error(gatewayError.message);
  }

  let text = '';
  try {
    const data = JSON.parse(response.body ?? '{}') as { text?: string };
    text = (data.text ?? '').trim();
  } catch {
    throw new Error('The transcription service returned an unreadable response.');
  }

  return text;
}

/** Re-exported so callers can special-case gateway failures if they want to. */
export { GatewayError };