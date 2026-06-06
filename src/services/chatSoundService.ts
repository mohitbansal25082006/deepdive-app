// src/services/chatSoundService.ts
// Part 48b — Chat message send/receive sounds using expo-av
// Part 48e — Fix: Sound was playing when screen opened (lazy init fix)
// Part 48-FINAL — Android sound fix (root cause + correct solution):
//
//   ROOT CAUSE OF ANDROID SILENCE:
//   expo-av on Android uses Android's MediaPlayer under the hood.
//   Android's MediaPlayer CANNOT play inline base64 data URIs
//   ("data:audio/wav;base64,..."). This is a known, confirmed limitation:
//     https://github.com/expo/expo/issues/2035
//   The audio object is created successfully (no JS exception), but
//   MediaPlayer silently fails to decode the data URI and plays nothing.
//   This affects ALL Android versions and both Expo Go and dev builds.
//
//   CORRECT FIX:
//   1. Generate the WAV bytes (same as before).
//   2. Extract the raw base64 payload (strip the "data:audio/wav;base64," prefix).
//   3. Write it to a temp file in FileSystem.cacheDirectory using
//      expo-file-system's writeAsStringAsync with base64 encoding.
//   4. Pass the resulting file:// URI to Audio.Sound.createAsync.
//   Android's MediaPlayer handles file:// URIs perfectly.
//
//   DOES THIS WORK IN EXPO GO?
//   Yes — expo-file-system is available in Expo Go. The sound will play
//   in both Expo Go and dev builds on Android.
//
//   iOS is unchanged — it can handle data URIs fine, but we now also
//   use the file:// approach on iOS for consistency (it's equally fast).

import { Audio }      from 'expo-av';
// SDK 54: expo-file-system became a new class-based API.
// The old cacheDirectory / EncodingType / writeAsStringAsync / getInfoAsync
// are now in expo-file-system/legacy. Import from there for full compatibility.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform }   from 'react-native';

// ─── Lazy WAV generation ──────────────────────────────────────────────────────

let _sendToneBase64:    string | null = null;
let _receiveToneBase64: string | null = null;

// Cached file URIs — written once, reused
let _sendToneFileUri:    string | null = null;
let _receiveToneFileUri: string | null = null;

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
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
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

  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary); // raw base64 only (no data URI prefix)
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
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataLen, true);

  for (let i = 0; i < numSamples; i++) {
    const t       = i / sampleRate;
    const freq    = t < (durationMs / 2000) ? 660 : 880;
    const fadeIn  = Math.min(1, t / 0.010);
    const fadeOut = Math.max(0, 1 - (t - (durationMs / 1000 - 0.050)) / 0.050);
    const sample  = Math.sin(2 * Math.PI * freq * t) * 0.28 * fadeIn * fadeOut;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }

  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary); // raw base64 only
}

function getSendToneBase64(): string {
  if (!_sendToneBase64) _sendToneBase64 = generateToneWavBase64(880, 80, 0.30);
  return _sendToneBase64;
}

function getReceiveToneBase64(): string {
  if (!_receiveToneBase64) _receiveToneBase64 = generateReceiveToneBase64();
  return _receiveToneBase64;
}

// ─── Write WAV to filesystem ──────────────────────────────────────────────────
// On Android, MediaPlayer cannot play data: URIs.
// We write the WAV bytes to a temp file once and reuse the file:// URI.
// On iOS this also works perfectly and avoids any potential data URI issues.

async function getOrCreateSoundFile(
  fileName: string,
  base64Payload: string,
): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}${fileName}`;

  // Check if already written
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
  } catch { /* fall through to write */ }

  // Write raw base64 as binary file
  await FileSystem.writeAsStringAsync(uri, base64Payload, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uri;
}

// ─── Audio session ────────────────────────────────────────────────────────────

let _audioConfigured = false;

async function ensureAudioConfig(): Promise<void> {
  if (_audioConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS:    false,
      allowsRecordingIOS:      false,
      staysActiveInBackground: false,
      shouldDuckAndroid:       true,
      // INTERRUPTION_MODE_ANDROID_DUCK_OTHERS = 2
      interruptionModeAndroid: (Audio as any).INTERRUPTION_MODE_ANDROID_DUCK_OTHERS ?? 2,
      // INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS = 2
      interruptionModeIOS:     (Audio as any).INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS ?? 2,
    });
    _audioConfigured = true;
  } catch { /* non-fatal */ }
}

// ─── Cooldown guard ───────────────────────────────────────────────────────────

let _lastReceiveSoundAt = 0;
const RECEIVE_SOUND_COOLDOWN_MS = 500;

// ─── Core player ─────────────────────────────────────────────────────────────
//
// FIX: Pass a file:// URI to createAsync on ALL platforms.
// Android's MediaPlayer works correctly with file:// URIs.
// We write the WAV bytes to cacheDirectory once (lazy), then reuse.

async function playTone(fileUri: string): Promise<void> {
  try {
    await ensureAudioConfig();

    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUri },
      {
        shouldPlay: false,
        volume:     1.0,
      },
    );

    // Explicitly set volume (some Android versions ignore the option above)
    try { await sound.setVolumeAsync(1.0); } catch { /* non-fatal */ }

    // Start playback explicitly
    await sound.playAsync();

    // Unload after playback completes
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
 * Call ONLY when the user explicitly taps Send.
 */
export async function playSendSound(): Promise<void> {
  try {
    if (!_sendToneFileUri) {
      _sendToneFileUri = await getOrCreateSoundFile(
        'deepdive_chat_send.wav',
        getSendToneBase64(),
      );
    }
    await playTone(_sendToneFileUri);
  } catch { /* non-fatal */ }
}

/**
 * Play the message-received sound.
 * Call ONLY for genuinely new incoming messages from OTHER users.
 * Has a 500ms cooldown to prevent rapid-fire playback on batch load.
 */
export async function playReceiveSound(): Promise<void> {
  try {
    const now = Date.now();
    if (now - _lastReceiveSoundAt < RECEIVE_SOUND_COOLDOWN_MS) return;
    _lastReceiveSoundAt = now;

    if (!_receiveToneFileUri) {
      _receiveToneFileUri = await getOrCreateSoundFile(
        'deepdive_chat_receive.wav',
        getReceiveToneBase64(),
      );
    }
    await playTone(_receiveToneFileUri);
  } catch { /* non-fatal */ }
}

/**
 * Prewarm: pre-generates and writes the WAV files to disk so the first
 * sound plays without any file-write delay. Call once on app start or
 * when the chat screen mounts. Fire-and-forget.
 */
export async function prewarmChatSounds(): Promise<void> {
  try {
    if (!_sendToneFileUri) {
      _sendToneFileUri = await getOrCreateSoundFile(
        'deepdive_chat_send.wav',
        getSendToneBase64(),
      );
    }
    if (!_receiveToneFileUri) {
      _receiveToneFileUri = await getOrCreateSoundFile(
        'deepdive_chat_receive.wav',
        getReceiveToneBase64(),
      );
    }
    await ensureAudioConfig();
  } catch { /* non-fatal */ }
}