// src/services/chatSoundService.ts
// Part 48b — Chat message send/receive sounds using expo-av
// Part 48e — Fix: Sound was playing when screen opened (lazy init fix)
// Part 48-NEW — Android sound fix:
//
//   Root cause of Android silence:
//   Previous code called Audio.setAudioModeAsync with:
//     shouldDuckAndroid: true   ← correct
//     playsInSilentModeIOS: false
//   But on Android the audio category was not being set to "duckOthers"
//   which is required for short UI sounds. Android also needs
//   interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS
//   to allow playback over other apps.
//
//   Additionally, Audio.Sound.createAsync with a base64 data URI can fail
//   silently on Android due to a known expo-av issue. We now:
//   1. Set interruptionModeAndroid correctly.
//   2. Set volume to 1.0 and also call sound.setVolumeAsync(1.0) explicitly
//      since some Android versions need the call AFTER createAsync.
//   3. Call sound.playAsync() explicitly rather than relying on shouldPlay:true
//      in createAsync (this is the most reliable cross-platform approach).
//   4. On Android, add a small artificial delay (80ms) before play so the
//      audio session has time to initialize — especially important for the
//      first sound after app launch.

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
// Part 48-NEW: Correct Android audio mode configuration.
// interruptionModeAndroid: DUCK_OTHERS lets short UI sounds play over music.
// playsInSilentModeIOS: false respects the ringer switch on iOS.

let _audioConfigured = false;

async function ensureAudioConfig(): Promise<void> {
  if (_audioConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      // iOS: respect the ringer/silent switch (false = muted when on silent)
      playsInSilentModeIOS:          false,
      allowsRecordingIOS:            false,
      staysActiveInBackground:       false,
      // Android: duck other audio (music/media) while playing our short tone,
      // then restore. This is required for UI sounds on Android.
      shouldDuckAndroid:             true,
      // INTERRUPTION_MODE_ANDROID_DUCK_OTHERS = 2
      // Without this the Android audio focus request fails silently.
      interruptionModeAndroid:       (Audio as any).INTERRUPTION_MODE_ANDROID_DUCK_OTHERS ?? 2,
      // iOS interruption mode: mix with others (we don't need exclusive focus)
      interruptionModeIOS:           (Audio as any).INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS ?? 2,
    });
    _audioConfigured = true;
  } catch { /* non-fatal */ }
}

// ─── Cooldown guard ───────────────────────────────────────────────────────────

let _lastReceiveSoundAt = 0;
const RECEIVE_SOUND_COOLDOWN_MS = 500;

// ─── Core player ─────────────────────────────────────────────────────────────
//
// Part 48-NEW Android fix:
//   1. ensureAudioConfig() first (sets audio mode).
//   2. createAsync with shouldPlay: false — we call playAsync() explicitly.
//   3. setVolumeAsync(1.0) — some Android versions ignore the createAsync volume.
//   4. Small delay on Android (80ms) so the audio session is ready.
//   5. playAsync() — the only reliable trigger on both platforms.

async function playTone(uri: string): Promise<void> {
  try {
    await ensureAudioConfig();

    // Android: give the audio session a moment to activate
    if (Platform.OS === 'android') {
      await new Promise<void>(resolve => setTimeout(resolve, 80));
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      {
        shouldPlay: false, // we start manually via playAsync()
        volume:     1.0,
      },
    );

    // Explicitly set volume (Android may ignore the option above)
    try { await sound.setVolumeAsync(1.0); } catch { /* non-fatal */ }

    // Start playback explicitly — most reliable cross-platform
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
 * Do NOT call on screen mount or initial message load.
 */
export async function playSendSound(): Promise<void> {
  await playTone(getSendToneUri());
}

/**
 * Play the message-received sound.
 * Call ONLY for genuinely new incoming messages from OTHER users.
 * Has a 500ms cooldown to prevent rapid-fire playback on batch load.
 */
export async function playReceiveSound(): Promise<void> {
  const now = Date.now();
  if (now - _lastReceiveSoundAt < RECEIVE_SOUND_COOLDOWN_MS) return;
  _lastReceiveSoundAt = now;
  await playTone(getReceiveToneUri());
}

/**
 * No-op — kept for API compatibility.
 * Audio session is configured lazily on first play.
 */
export async function prewarmChatSounds(): Promise<void> {
  // Intentionally empty.
}