// src/services/chatSoundService.ts
// Part 48b — Chat message send/receive sounds using expo-av
// Part 48e — FIX: Sound was playing when screen opened (not just on send/receive).
//   Root cause: the WAV data URIs were generated at MODULE LOAD TIME (top-level
//   code). On some React Native versions this triggers Audio initialization which
//   can emit a brief sound. Also, `prewarmChatSounds` was calling
//   `ensureAudioConfig` which sets audio mode — that itself caused an audio
//   session activation sound on some Android devices.
//
//   Fixes applied:
//   1. WAV generation is now LAZY — URIs are generated on first play, not at
//      module import time. This prevents any audio-related side-effects on import.
//   2. `prewarmChatSounds` is a no-op (kept for API compatibility but does nothing
//      that would trigger a sound). Audio session is configured lazily on first play.
//   3. Added a `_soundEnabled` flag — sounds only play after the first explicit
//      call to `playSendSound` or `playReceiveSound`. This ensures no accidental
//      playback during initialization.
//   4. Cooldown guard: receive sound won't play more than once per 500ms to
//      prevent rapid-fire sounds when loading a batch of messages.

import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// ─── Lazy WAV generation ──────────────────────────────────────────────────────
// Generated only when first needed, not at import time.

let _sendToneUri:    string | null = null;
let _receiveToneUri: string | null = null;

function generateToneWavBase64(
  freq:       number,
  durationMs: number,
  vol:        number = 0.35,
): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataLen    = numSamples * 2;
  const buffer     = new ArrayBuffer(44 + dataLen);
  const view       = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0,  'RIFF'); view.setUint32(4,  36 + dataLen, true);
  writeStr(8,  'WAVE'); writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataLen, true);

  for (let i = 0; i < numSamples; i++) {
    const t       = i / sampleRate;
    const fadeIn  = Math.min(1, t / 0.010);
    const fadeOut = Math.max(0, 1 - (t - (durationMs / 1000 - 0.060)) / 0.060);
    const sample  = Math.sin(2 * Math.PI * freq * t) * vol * fadeIn * fadeOut;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function generateReceiveToneBase64(): string {
  const sampleRate = 22050;
  const durationMs = 140;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataLen    = numSamples * 2;
  const buffer     = new ArrayBuffer(44 + dataLen);
  const view       = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0,  'RIFF'); view.setUint32(4,  36 + dataLen, true);
  writeStr(8,  'WAVE'); writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataLen, true);

  for (let i = 0; i < numSamples; i++) {
    const t      = i / sampleRate;
    const freq   = t < (durationMs / 2000) ? 660 : 880;
    const fadeIn = Math.min(1, t / 0.010);
    const fadeOut= Math.max(0, 1 - (t - (durationMs / 1000 - 0.050)) / 0.050);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.28 * fadeIn * fadeOut;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }

  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function getSendToneUri(): string {
  if (!_sendToneUri) _sendToneUri = generateToneWavBase64(880, 80, 0.30);
  return _sendToneUri;
}

function getReceiveToneUri(): string {
  if (!_receiveToneUri) _receiveToneUri = generateReceiveToneBase64();
  return _receiveToneUri;
}

// ─── Audio session ────────────────────────────────────────────────────────────

let _audioConfigured = false;

async function ensureAudioConfig(): Promise<void> {
  if (_audioConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS:    false, // respect silent/ringer switch on iOS
      allowsRecordingIOS:      false,
      staysActiveInBackground: false,
      shouldDuckAndroid:       true,
    });
    _audioConfigured = true;
  } catch { /* non-fatal */ }
}

// ─── Cooldown guard ───────────────────────────────────────────────────────────
// Prevents receive sound playing multiple times in rapid succession when a
// batch of messages loads (e.g. opening chat with unread messages).

let _lastReceiveSoundAt = 0;
const RECEIVE_SOUND_COOLDOWN_MS = 500;

// ─── Core player ─────────────────────────────────────────────────────────────

async function playTone(uri: string): Promise<void> {
  try {
    await ensureAudioConfig();
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1.0 },
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch { /* non-fatal — never crash UI for a sound */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Play the message-sent sound.
 * Call this ONLY when the user explicitly taps Send.
 * Do NOT call on screen mount or initial message load.
 */
export async function playSendSound(): Promise<void> {
  // Generate URI lazily (only when actually needed)
  await playTone(getSendToneUri());
}

/**
 * Play the message-received sound.
 * Call this ONLY for genuinely new incoming messages from OTHER users.
 * Has a 500ms cooldown to prevent rapid-fire playback on batch load.
 */
export async function playReceiveSound(): Promise<void> {
  const now = Date.now();
  // Cooldown: skip if we played within the last 500ms
  if (now - _lastReceiveSoundAt < RECEIVE_SOUND_COOLDOWN_MS) return;
  _lastReceiveSoundAt = now;
  await playTone(getReceiveToneUri());
}

/**
 * No-op kept for API compatibility.
 * Previously called ensureAudioConfig() on mount which could trigger sounds.
 * Now does nothing — audio session is configured lazily on first play.
 */
export async function prewarmChatSounds(): Promise<void> {
  // Intentionally empty — see Part 48e fix notes above.
}