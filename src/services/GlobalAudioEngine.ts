// src/services/GlobalAudioEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for podcast playback state.
//
// WHY THIS FILE EXISTS:
//   Previously, usePodcastPlayer and MiniPlayerContext each maintained their
//   own state copies and tried to sync via callbacks. This caused:
//     1. Position resets when navigating back to podcast-player (mount snapshot
//        fired after a status callback with positionMillis=0 from a turn transition)
//     2. Mini player progress bar not advancing (setTimeout queuing delays)
//     3. Continue Listening not updating (globalProgressCallback cleared too eagerly)
//
// HOW IT WORKS:
//   - One Audio.Sound object lives here (globalSound)
//   - One canonical state object (engineState) is the truth
//   - Any component/hook subscribes via subscribeToEngine()
//   - State changes fire all subscribers synchronously (no setTimeout)
//   - podcast-player.tsx and MiniPlayer both subscribe to the same stream
//
// EXPORTS:
//   - subscribeToEngine(cb)   → unsubscribe fn
//   - getEngineState()        → current snapshot
//   - AudioEngine.loadTurn()
//   - AudioEngine.play/pause/toggle
//   - AudioEngine.skipNext/skipPrevious/skipToTurn
//   - AudioEngine.setRate()
//   - AudioEngine.seekToPercent()
//   - AudioEngine.detach()    → keep audio alive, mark screen gone
//   - AudioEngine.stop()      → full stop + unload
//   - AudioEngine.isActiveFor(podcastId)
//   - registerProgressSaveCallback / clearProgressSaveCallback
// ─────────────────────────────────────────────────────────────────────────────

import { Audio } from 'expo-av';
import type { Podcast, PodcastTurn } from '../types';
import type { MiniPlayerState } from '../types/podcast_v2';
import { audioFileExists } from '../services/podcastTTSService';

// ─── Engine State ──────────────────────────────────────────────────────────────

export interface EngineState {
  podcastId:         string | null;
  podcast:           Podcast | null;
  isPlaying:         boolean;
  isLoading:         boolean;
  isBuffering:       boolean;
  currentTurnIndex:  number;
  positionMs:        number;       // position within current segment
  segmentDurationMs: number;
  totalPositionMs:   number;       // cumulative position across all segments
  totalDurationMs:   number;
  playbackRate:      number;
  // Mini player fields
  isVisible:         boolean;
  progressPercent:   number;       // 0–1
}

const INITIAL_ENGINE_STATE: EngineState = {
  podcastId:         null,
  podcast:           null,
  isPlaying:         false,
  isLoading:         false,
  isBuffering:       false,
  currentTurnIndex:  0,
  positionMs:        0,
  segmentDurationMs: 0,
  totalPositionMs:   0,
  totalDurationMs:   0,
  playbackRate:      1.0,
  isVisible:         false,
  progressPercent:   0,
};

// ─── Module-level singletons ──────────────────────────────────────────────────

let engineState: EngineState = { ...INITIAL_ENGINE_STATE };
let globalSound: Audio.Sound | null = null;
let loadTurnLock = false;           // prevent concurrent loadTurn calls
let audioSessionReady = false;
let currentRate = 1.0;

// Keeps audio alive when podcast-player screen unmounts (back navigation)
let keepAlive = false;

// Cumulative ms before the start of the current segment
let cumulativeMs = 0;

// loadTurnRef — points to the latest loadTurn closure so didJustFinish
// always calls the most-current version (avoids stale closure bugs)
let loadTurnRef: (index: number, autoPlay: boolean) => Promise<void> = async () => {};

// ─── Subscribers ──────────────────────────────────────────────────────────────

type EngineSubscriber = (state: EngineState) => void;
const subscribers = new Set<EngineSubscriber>();

export function subscribeToEngine(cb: EngineSubscriber): () => void {
  subscribers.add(cb);
  // Immediately call with current state so subscriber is up-to-date
  cb(engineState);
  return () => { subscribers.delete(cb); };
}

export function getEngineState(): EngineState {
  return engineState;
}

function broadcast(partial: Partial<EngineState>): void {
  engineState = { ...engineState, ...partial };
  // Synchronous fan-out — no setTimeout, no queue
  subscribers.forEach(cb => {
    try { cb(engineState); } catch {}
  });
}

// ─── Progress Save Callback ───────────────────────────────────────────────────

const PROGRESS_SAVE_INTERVAL_MS = 10_000;
let progressSaveCb: ((turnIdx: number, totalPosMs: number, totalDurMs: number) => void) | null = null;
let lastProgressSaveTime = 0;

export function registerProgressSaveCallback(
  cb: ((turnIdx: number, totalPosMs: number, totalDurMs: number) => void) | null
): void {
  progressSaveCb = cb;
  if (cb) lastProgressSaveTime = 0;
}

export function clearProgressSaveCallback(): void {
  progressSaveCb = null;
}

function maybeSaveProgress(turnIdx: number, totalPosMs: number, totalDurMs: number): void {
  if (!progressSaveCb || totalDurMs <= 0) return;
  const now = Date.now();
  if (now - lastProgressSaveTime < PROGRESS_SAVE_INTERVAL_MS) return;
  lastProgressSaveTime = now;
  progressSaveCb(turnIdx, totalPosMs, totalDurMs);
}

// ─── Audio Session ────────────────────────────────────────────────────────────

async function ensureAudioSession(): Promise<void> {
  if (audioSessionReady) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:         false,
      playsInSilentModeIOS:       true,
      staysActiveInBackground:    false,
      shouldDuckAndroid:          true,
      playThroughEarpieceAndroid: false,
    });
    audioSessionReady = true;
  } catch (err) {
    console.warn('[AudioEngine] Audio session error:', err);
  }
}

// ─── Resolve Audio URI ────────────────────────────────────────────────────────

async function resolveAudioUri(podcast: Podcast, segmentIndex: number): Promise<string | null> {
  const localPath = podcast.audioSegmentPaths?.[segmentIndex] ?? '';
  if (localPath) {
    if (localPath.startsWith('https://') || localPath.startsWith('http://')) return localPath;
    if (await audioFileExists(localPath)) return localPath;
  }
  const cloudUrl: string | null = (podcast as any).audioStorageUrls?.[segmentIndex] ?? null;
  if (cloudUrl && (cloudUrl.startsWith('https://') || cloudUrl.startsWith('http://'))) return cloudUrl;
  return null;
}

// ─── Status Update Handler ────────────────────────────────────────────────────

function makeStatusHandler(
  podcast: Podcast,
  turnIndex: number,
  turnCumulativeMs: number,
  totalDurMs: number,
) {
  return (status: any) => {
    if (!status?.isLoaded) return;

    const posMs = status.positionMillis ?? 0;
    const durMs = status.durationMillis ?? 0;
    const totalPos = turnCumulativeMs + posMs;
    const progress = totalDurMs > 0 ? totalPos / totalDurMs : 0;

    broadcast({
      isLoading:         false,
      isBuffering:       status.isBuffering ?? false,
      isPlaying:         status.isPlaying   ?? false,
      positionMs:        posMs,
      segmentDurationMs: durMs,
      totalPositionMs:   totalPos,
      totalDurationMs:   totalDurMs,
      currentTurnIndex:  turnIndex,
      progressPercent:   progress,
      isVisible:         true,
    });

    // Save progress to DB every 10s
    if (status.isPlaying) {
      maybeSaveProgress(turnIndex, totalPos, totalDurMs);
    }

    // Advance to next segment
    if (status.didJustFinish) {
      const turns = podcast.script?.turns ?? [];
      const nextIdx = turnIndex + 1;
      if (nextIdx < turns.length) {
        setTimeout(() => loadTurnRef(nextIdx, true), 120);
      } else {
        // Episode finished
        broadcast({
          isPlaying:       false,
          positionMs:      0,
          totalPositionMs: totalDurMs,
          progressPercent: 1,
        });
        // Save completion
        if (progressSaveCb && totalDurMs > 0) {
          progressSaveCb(turnIndex, totalDurMs, totalDurMs);
        }
      }
    }
  };
}

// ─── Core: Load a Turn ────────────────────────────────────────────────────────

async function loadTurn(index: number, autoPlay: boolean): Promise<void> {
  const podcast = engineState.podcast;
  if (!podcast) return;

  const turns = podcast.script?.turns ?? [];
  if (index < 0 || index >= turns.length) return;

  // Prevent concurrent loads
  if (loadTurnLock) return;
  loadTurnLock = true;

  try {
    // Unload previous sound
    if (globalSound) {
      try {
        globalSound.setOnPlaybackStatusUpdate(null);
        await globalSound.unloadAsync();
      } catch {}
      globalSound = null;
    }

    const turn = turns[index];
    cumulativeMs = turns.slice(0, index).reduce((s, t) => s + (t.durationMs ?? 0), 0);
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

    broadcast({
      currentTurnIndex:  index,
      isLoading:         true,
      positionMs:        0,
      segmentDurationMs: 0,
      totalPositionMs:   cumulativeMs,
      totalDurationMs:   totalDurMs,
      progressPercent:   totalDurMs > 0 ? cumulativeMs / totalDurMs : 0,
    });

    const audioUri = await resolveAudioUri(podcast, index);

    if (!audioUri) {
      broadcast({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        loadTurnLock = false;
        setTimeout(() => loadTurnRef(index + 1, true), 80);
        return;
      }
      loadTurnLock = false;
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUri },
      {
        shouldPlay:                   autoPlay,
        rate:                         currentRate,
        progressUpdateIntervalMillis: 250,
        shouldCorrectPitch:           true,
      }
    );

    globalSound = sound;

    const handler = makeStatusHandler(podcast, index, cumulativeMs, totalDurMs);
    sound.setOnPlaybackStatusUpdate(handler);

    broadcast({
      isLoading:   false,
      isPlaying:   autoPlay,
      isVisible:   true,
      podcastId:   podcast.id,
      podcast:     podcast,
    });

    loadTurnLock = false;

    // Emit mini player update with fresh data
    broadcast({
      podcastId:    podcast.id,
      podcast:      podcast,
      isVisible:    true,
      isPlaying:    autoPlay,
      progressPercent: totalDurMs > 0 ? cumulativeMs / totalDurMs : 0,
      currentTurnIndex: index,
    });

  } catch (err) {
    console.warn(`[AudioEngine] Segment ${index} error:`, err);
    broadcast({ isLoading: false });
    loadTurnLock = false;
    if (autoPlay && (engineState.podcast?.script?.turns?.length ?? 0) > index + 1) {
      setTimeout(() => loadTurnRef(index + 1, true), 300);
    }
  }
}

// Point loadTurnRef at the real function
loadTurnRef = loadTurn;

// ─── Public API ───────────────────────────────────────────────────────────────

export const AudioEngine = {

  isActiveFor(podcastId: string): boolean {
    return engineState.podcastId === podcastId && globalSound !== null;
  },

  async startPodcast(podcast: Podcast, fromTurnIndex = 0): Promise<void> {
    await ensureAudioSession();
    keepAlive = false;

    // Pre-compute total duration
    const turns = podcast.script?.turns ?? [];
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

    broadcast({
      podcastId:        podcast.id,
      podcast:          podcast,
      isVisible:        true,
      totalDurationMs:  totalDurMs,
      currentTurnIndex: fromTurnIndex,
    });

    await loadTurn(fromTurnIndex, true);
  },

  // Called when podcast-player mounts and audio is already running for this podcast.
  // Reattaches all state to the current sound without restarting playback.
  async reattach(podcast: Podcast): Promise<void> {
    if (!globalSound) return;

    // Update podcast reference (may have fresh data from DB re-fetch)
    broadcast({ podcast, podcastId: podcast.id });

    // Re-register status handler with fresh closure
    const turns = podcast.script?.turns ?? [];
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
    const idx = engineState.currentTurnIndex;

    const handler = makeStatusHandler(podcast, idx, cumulativeMs, totalDurMs);
    globalSound.setOnPlaybackStatusUpdate(handler);

    // Snap state immediately from a one-time status read
    try {
      const status = await globalSound.getStatusAsync();
      if (status.isLoaded) {
        const posMs    = status.positionMillis ?? 0;
        const durMs    = status.durationMillis ?? 0;
        const totalPos = cumulativeMs + posMs;
        broadcast({
          isPlaying:         status.isPlaying,
          isLoading:         false,
          isBuffering:       false,
          positionMs:        posMs,
          segmentDurationMs: durMs,
          totalPositionMs:   totalPos,
          totalDurationMs:   totalDurMs > 0 ? totalDurMs : engineState.totalDurationMs,
          progressPercent:   totalDurMs > 0 ? totalPos / totalDurMs : engineState.progressPercent,
          currentTurnIndex:  idx,
          isVisible:         true,
        });
      }
    } catch {}
  },

  async play(): Promise<void> {
    if (!globalSound) return;
    try {
      await globalSound.playAsync();
      broadcast({ isPlaying: true });
    } catch (err) {
      console.warn('[AudioEngine] play error:', err);
    }
  },

  async pause(): Promise<void> {
    if (!globalSound) return;
    try {
      await globalSound.pauseAsync();
      broadcast({ isPlaying: false });
    } catch (err) {
      console.warn('[AudioEngine] pause error:', err);
    }
  },

  async toggle(): Promise<void> {
    if (!globalSound) return;
    try {
      const status = await globalSound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await globalSound.pauseAsync();
        broadcast({ isPlaying: false });
      } else {
        await globalSound.playAsync();
        broadcast({ isPlaying: true });
      }
    } catch (err) {
      console.warn('[AudioEngine] toggle error:', err);
    }
  },

  async skipToTurn(index: number): Promise<void> {
    const wasPlaying = engineState.isPlaying;
    await loadTurn(index, wasPlaying);
  },

  async skipNext(): Promise<void> {
    const turns = engineState.podcast?.script?.turns ?? [];
    const next  = engineState.currentTurnIndex + 1;
    if (next < turns.length) await this.skipToTurn(next);
  },

  async skipPrevious(): Promise<void> {
    if (globalSound) {
      try {
        const status = await globalSound.getStatusAsync();
        if (status.isLoaded && (status.positionMillis ?? 0) > 2000) {
          await globalSound.setPositionAsync(0);
          broadcast({ positionMs: 0, totalPositionMs: cumulativeMs, progressPercent: engineState.totalDurationMs > 0 ? cumulativeMs / engineState.totalDurationMs : 0 });
          return;
        }
      } catch {}
    }
    const prev = engineState.currentTurnIndex - 1;
    if (prev >= 0) await this.skipToTurn(prev);
  },

  async setRate(rate: number): Promise<void> {
    currentRate = rate;
    broadcast({ playbackRate: rate });
    if (globalSound) {
      try { await globalSound.setRateAsync(rate, true); } catch {}
    }
  },

  // Seek by overall episode percentage (0–1)
  async seekToPercent(percent: number): Promise<void> {
    const { podcast, totalDurationMs } = engineState;
    if (!podcast || totalDurationMs <= 0) return;

    const turns    = podcast.script?.turns ?? [];
    const targetMs = percent * totalDurationMs;
    let cum = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cum + dur >= targetMs || i === turns.length - 1) {
        await this.skipToTurn(i);
        return;
      }
      cum += dur;
    }
  },

  // Call before navigating away from podcast-player.
  // Sets keepAlive=true so audio continues and cleanup doesn't unload the sound.
  detach(): void {
    keepAlive = true;
  },

  // Full stop — unloads everything.
  async stop(): Promise<void> {
    keepAlive = false;
    progressSaveCb = null;
    loadTurnLock = false;

    if (globalSound) {
      try {
        globalSound.setOnPlaybackStatusUpdate(null);
        await globalSound.stopAsync();
        await globalSound.unloadAsync();
      } catch {}
      globalSound = null;
    }

    cumulativeMs = 0;
    broadcast({
      ...INITIAL_ENGINE_STATE,
      isVisible: false,
    });
  },

  // Whether audio should survive the next screen cleanup
  get shouldKeepAlive(): boolean { return keepAlive; },
  set shouldKeepAlive(v: boolean) { keepAlive = v; },

  formatTime(ms: number): string {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
  },
};

// Export for backward compat with any code that calls the old globals
export function isGlobalAudioActiveForPodcast(podcastId: string): boolean {
  return AudioEngine.isActiveFor(podcastId);
}

export async function stopGlobalAudio(): Promise<void> {
  await AudioEngine.stop();
}

export async function toggleGlobalAudio(): Promise<void> {
  await AudioEngine.toggle();
}