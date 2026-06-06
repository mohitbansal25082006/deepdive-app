// src/services/chatSoundService.ts
// Part 48b — Chat message send/receive sounds
// Part 48-FINAL — Android fix: expo-audio + bundled MP3 asset
//
// WHY expo-av DOESN'T WORK ON ANDROID (SDK 53+):
//   expo-av is officially deprecated and broken on Android with the New
//   Architecture (default in SDK 53+). Audio.Sound.createAsync silently
//   fails — no exception thrown, no sound plays. Confirmed unfixed bug.
//   expo-av will be removed in SDK 55.
//
// SOLUTION — expo-audio + require() bundled MP3:
//   expo-audio is the official replacement. Works correctly on Android
//   New Architecture in Expo Go, dev builds, and production.
//   Using require() on a local MP3 is the most reliable audio approach
//   in any React Native / Expo environment on both platforms.
//
// SETUP:
//   1. npx expo install expo-audio
//   2. Copy chat_notification.mp3 → assets/sounds/chat_notification.mp3
//   3. npx expo start --clear

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// ─── Bundled sound asset ──────────────────────────────────────────────────────
// One file used for both send and receive — same notification sound.
// Path is relative to this file: src/services/ → ../../assets/sounds/

const NOTIFICATION_SOUND = require('../../assets/sounds/chat_notification.mp3');

// ─── Audio session ────────────────────────────────────────────────────────────

let _audioConfigured = false;

async function ensureAudioConfig(): Promise<void> {
  if (_audioConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode:      false,  // respect iOS silent switch
      shouldPlayInBackground: false,  // no background audio needed for UI sounds
      interruptionMode:       'duckOthers', // briefly duck music while tone plays
    });
    _audioConfigured = true;
  } catch { /* non-fatal */ }
}

// ─── Cooldown guard ───────────────────────────────────────────────────────────

let _lastReceiveSoundAt = 0;
const RECEIVE_SOUND_COOLDOWN_MS = 500;

// ─── Core player ─────────────────────────────────────────────────────────────

async function playNotificationSound(): Promise<void> {
  try {
    await ensureAudioConfig();
    const player = createAudioPlayer(NOTIFICATION_SOUND);
    player.volume = 1.0;
    player.play();
    // Release after sound finishes (~1.78s + buffer)
    setTimeout(() => {
      try { player.release(); } catch { /* non-fatal */ }
    }, 2500);
  } catch { /* non-fatal — never crash UI for a sound */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Play sound when the user sends a message.
 * Call ONLY when the user taps Send.
 */
export async function playSendSound(): Promise<void> {
  await playNotificationSound();
}

/**
 * Play sound when a new message arrives from another user.
 * Has a 500ms cooldown to prevent rapid-fire playback.
 */
export async function playReceiveSound(): Promise<void> {
  const now = Date.now();
  if (now - _lastReceiveSoundAt < RECEIVE_SOUND_COOLDOWN_MS) return;
  _lastReceiveSoundAt = now;
  await playNotificationSound();
}

/**
 * Configure audio session early so first sound plays without delay.
 * Call once when the chat screen mounts. Fire-and-forget.
 */
export async function prewarmChatSounds(): Promise<void> {
  await ensureAudioConfig().catch(() => {});
}