// src/services/GlobalAudioEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 41.2 UPDATE — Offline-aware audio pause/resume.
//
// NEW BEHAVIOUR:
//   When the device goes offline, AudioEngine.pauseForOffline() is called
//   from _layout.tsx. This pauses the audio AND sets a `pausedByOffline`
//   flag so we know it was not a user-initiated pause.
//
//   When the device comes back online, the engine does NOT auto-resume.
//   Instead the MiniPlayer continues to show in "paused" state and the user
//   can manually tap Play to resume. This is the correct UX — we never
//   auto-resume media the user didn't ask us to resume.
//
//   `pausedByOffline` is exposed in EngineState so MiniPlayer (and any
//   player screen) can optionally show a "Paused — offline" label.
//
// NEW API:
//   AudioEngine.pauseForOffline()
//     Call when network goes offline. Pauses if playing, sets flag.
//
//   AudioEngine.clearOfflinePause()
//     Call when network comes back online. Clears the flag (audio stays
//     paused — user must tap play).
//
//   EngineState.pausedByOffline: boolean
//
// Everything else is unchanged from Part 41.
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
  positionMs:        number;
  segmentDurationMs: number;
  totalPositionMs:   number;
  totalDurationMs:   number;
  playbackRate:      number;
  isVisible:         boolean;
  progressPercent:   number;
  // ── Part 41: source screen navigation ────────────────────────────────────
  sourceScreen:  string | null;
  sourceParams:  Record<string, string> | null;
  // ── Part 41.2: offline pause flag ────────────────────────────────────────
  // true when WE paused the audio because the device went offline.
  // false once the user manually taps play (even while still offline,
  // if audio is local/cached they can still play it).
  pausedByOffline: boolean;
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
  sourceScreen:      null,
  sourceParams:      null,
  pausedByOffline:   false,
};

// ─── Module-level singletons ──────────────────────────────────────────────────

let engineState: EngineState = { ...INITIAL_ENGINE_STATE };
let globalSound: Audio.Sound | null = null;
let loadTurnLock = false;
let audioSessionReady = false;
let currentRate = 1.0;
let keepAlive = false;
let cumulativeMs = 0;
let loadTurnRef: (index: number, autoPlay: boolean) => Promise<void> = async () => {};

// ─── Subscribers ──────────────────────────────────────────────────────────────

type EngineSubscriber = (state: EngineState) => void;
const subscribers = new Set<EngineSubscriber>();

export function subscribeToEngine(cb: EngineSubscriber): () => void {
  subscribers.add(cb);
  cb(engineState);
  return () => { subscribers.delete(cb); };
}

export function getEngineState(): EngineState {
  return engineState;
}

function broadcast(partial: Partial<EngineState>): void {
  engineState = { ...engineState, ...partial };
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

    const posMs    = status.positionMillis ?? 0;
    const durMs    = status.durationMillis ?? 0;
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

    if (status.isPlaying) {
      maybeSaveProgress(turnIndex, totalPos, totalDurMs);
    }

    if (status.didJustFinish) {
      const turns  = podcast.script?.turns ?? [];
      const nextIdx = turnIndex + 1;
      if (nextIdx < turns.length) {
        setTimeout(() => loadTurnRef(nextIdx, true), 120);
      } else {
        broadcast({
          isPlaying:       false,
          positionMs:      0,
          totalPositionMs: totalDurMs,
          progressPercent: 1,
        });
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

  if (loadTurnLock) return;
  loadTurnLock = true;

  try {
    if (globalSound) {
      try {
        globalSound.setOnPlaybackStatusUpdate(null);
        await globalSound.unloadAsync();
      } catch {}
      globalSound = null;
    }

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
      isLoading:        false,
      isPlaying:        autoPlay,
      isVisible:        true,
      podcastId:        podcast.id,
      podcast:          podcast,
      currentTurnIndex: index,
    });

    loadTurnLock = false;
  } catch (err) {
    console.warn(`[AudioEngine] Segment ${index} error:`, err);
    broadcast({ isLoading: false });
    loadTurnLock = false;
    if (autoPlay && (engineState.podcast?.script?.turns?.length ?? 0) > index + 1) {
      setTimeout(() => loadTurnRef(index + 1, true), 300);
    }
  }
}

loadTurnRef = loadTurn;

// ─── Public API ───────────────────────────────────────────────────────────────

export const AudioEngine = {

  isActiveFor(podcastId: string): boolean {
    return engineState.podcastId === podcastId && globalSound !== null;
  },

  /**
   * Set the source screen so MiniPlayer knows where to navigate on tap.
   */
  setSourceScreen(
    screen: string,
    params: Record<string, string> = {},
  ): void {
    broadcast({ sourceScreen: screen, sourceParams: params });
  },

  // ── Part 41.2: Offline pause ────────────────────────────────────────────

  /**
   * Called when the device goes offline.
   * Pauses audio if currently playing and marks it as offline-paused.
   * The MiniPlayer remains visible so the user can resume when ready.
   */
  async pauseForOffline(): Promise<void> {
    if (!globalSound) return;
    if (!engineState.isPlaying) return; // already paused — nothing to do
    try {
      await globalSound.pauseAsync();
      broadcast({ isPlaying: false, pausedByOffline: true });
    } catch (err) {
      console.warn('[AudioEngine] pauseForOffline error:', err);
    }
  },

  /**
   * Called when the device comes back online.
   * ONLY clears the pausedByOffline flag — does NOT auto-resume.
   * The user must tap Play themselves.
   */
  clearOfflinePause(): void {
    if (engineState.pausedByOffline) {
      broadcast({ pausedByOffline: false });
    }
  },

  // ── Existing API (unchanged) ────────────────────────────────────────────

  async startPodcast(podcast: Podcast, fromTurnIndex = 0): Promise<void> {
    await ensureAudioSession();
    keepAlive = false;

    const turns      = podcast.script?.turns ?? [];
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

    broadcast({
      podcastId:        podcast.id,
      podcast:          podcast,
      isVisible:        true,
      totalDurationMs:  totalDurMs,
      currentTurnIndex: fromTurnIndex,
      pausedByOffline:  false, // clear any stale offline flag on fresh start
    });

    await loadTurn(fromTurnIndex, true);
  },

  async reattach(podcast: Podcast): Promise<void> {
    if (!globalSound) return;

    broadcast({ podcast, podcastId: podcast.id });

    const turns      = podcast.script?.turns ?? [];
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
    const idx        = engineState.currentTurnIndex;

    const handler = makeStatusHandler(podcast, idx, cumulativeMs, totalDurMs);
    globalSound.setOnPlaybackStatusUpdate(handler);

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
      // User explicitly resumed — clear the offline-pause flag
      broadcast({ isPlaying: true, pausedByOffline: false });
    } catch (err) {
      console.warn('[AudioEngine] play error:', err);
    }
  },

  async pause(): Promise<void> {
    if (!globalSound) return;
    try {
      await globalSound.pauseAsync();
      // User-initiated pause — not an offline pause
      broadcast({ isPlaying: false, pausedByOffline: false });
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
        broadcast({ isPlaying: false, pausedByOffline: false });
      } else {
        await globalSound.playAsync();
        // User manually resumed — clear offline flag regardless of connectivity
        broadcast({ isPlaying: true, pausedByOffline: false });
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
          broadcast({
            positionMs:      0,
            totalPositionMs: cumulativeMs,
            progressPercent: engineState.totalDurationMs > 0
              ? cumulativeMs / engineState.totalDurationMs : 0,
          });
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

  detach(): void {
    keepAlive = true;
  },

  async stop(): Promise<void> {
    keepAlive      = false;
    progressSaveCb = null;
    loadTurnLock   = false;

    if (globalSound) {
      try {
        globalSound.setOnPlaybackStatusUpdate(null);
        await globalSound.stopAsync();
        await globalSound.unloadAsync();
      } catch {}
      globalSound = null;
    }

    cumulativeMs = 0;
    broadcast({ ...INITIAL_ENGINE_STATE, isVisible: false });
  },

  get shouldKeepAlive(): boolean { return keepAlive; },
  set shouldKeepAlive(v: boolean) { keepAlive = v; },

  formatTime(ms: number): string {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
  },
};

// ─── Backward-compat exports ──────────────────────────────────────────────────

export function isGlobalAudioActiveForPodcast(podcastId: string): boolean {
  return AudioEngine.isActiveFor(podcastId);
}

export async function stopGlobalAudio(): Promise<void> {
  await AudioEngine.stop();
}

export async function toggleGlobalAudio(): Promise<void> {
  await AudioEngine.toggle();
}