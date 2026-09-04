// src/services/GlobalAudioEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 42 UPDATE — Migrated from deprecated `expo-av` to `expo-audio`.
//
// WHY THIS CHANGED:
//   expo-av is deprecated as of SDK 55 and its native module is no longer
//   registered starting SDK 55+ (this project is on SDK 57). Any import of
//   `expo-av` now throws `Cannot find native module 'ExponentAV'` at module
//   evaluation time — which crashes the entire route tree, since this file
//   is imported (transitively) from the root layout via AuthContext.
//
// KEY API DIFFERENCES vs expo-av (Audio.Sound):
//   • expo-audio uses a single long-lived player object created via
//     `createAudioPlayer(source, { updateInterval: ms })` instead of
//     `Audio.Sound.createAsync()` returning a new sound per load. Note the
//     second argument is an `AudioPlayerOptions` object, NOT a bare number
//     — passing a number there silently breaks TS's overload resolution
//     and makes `addListener` disappear from the inferred type.
//   • Status times are in SECONDS (`currentTime`, `duration`), not
//     milliseconds like expo-av's `positionMillis` / `durationMillis`.
//     All internal state below still tracks milliseconds (to avoid
//     touching every consumer of EngineState), so we convert at the
//     boundary.
//   • Status updates come via `player.addListener('playbackStatusUpdate', cb)`
//     instead of `sound.setOnPlaybackStatusUpdate(cb)`.
//   • To load a new track we call `player.replace(source)` rather than
//     creating a brand new Sound object; there is one player per engine
//     lifetime, replaced/reused as turns advance.
//   • Global audio mode is set via `setAudioModeAsync()` (same shape as
//     before, but field names differ slightly — see ensureAudioSession).
//
// PART 42.1 FIX — TS2339 "Property 'addListener' does not exist on type
// 'AudioPlayer'":
//   `AudioPlayer` extends `SharedObject<AudioEvents>`, and `addListener` is
//   inherited from that generic base (expo-modules-core's EventEmitter).
//   The method is real and present at runtime on every AudioPlayer — this
//   was purely a TypeScript narrowing problem, not a missing API. The
//   module-level `globalPlayer` variable is typed `AudioPlayer | null`;
//   once other statements (broadcast(), setPlaybackRate(), property reads)
//   sit between the `if (!globalPlayer)` guard / assignment and the
//   `.addListener(...)` call, TS can re-widen `globalPlayer`'s narrowed
//   type back to `AudioPlayer | null` before the call, and the intersection
//   it falls back to for a bare `SharedObject` doesn't carry the
//   `AudioEvents` generic's methods. The fix is to bind the player to a
//   `const` (`player: AudioPlayer`) immediately once known-non-null, and
//   perform every subsequent operation (setPlaybackRate, addListener, play)
//   through that local binding instead of re-reading the mutable module
//   variable. This is a type-only change — runtime behavior is identical.
//
// Everything else (turn-advance logic, offline pause/resume, progress
// save callback, public AudioEngine API) is functionally unchanged from
// Part 41.2 so existing callers (MiniPlayer, podcast screens) do not need
// to change.
// ─────────────────────────────────────────────────────────────────────────────

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
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
let globalPlayer: AudioPlayer | null = null;
let statusUnsubscribe: (() => void) | null = null;
let loadTurnLock = false;
let audioSessionReady = false;
let currentRate = 1.0;
let keepAlive = false;
let cumulativeMs = 0;
let loadTurnRef: (index: number, autoPlay: boolean) => Promise<void> = async () => {};

const STATUS_UPDATE_INTERVAL_MS = 250;

// ─── Subscribers ────────────────────────────────────────────────────────────

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
    await setAudioModeAsync({
      allowsRecording:        false,
      playsInSilentMode:      true,
      shouldPlayInBackground:  false,
      interruptionMode:       'duckOthers',
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
// NOTE: expo-audio reports currentTime/duration in SECONDS. We convert to ms
// here at the single boundary point so the rest of the engine (and all
// external consumers of EngineState) keep working in milliseconds unchanged.

function makeStatusHandler(
  podcast: Podcast,
  turnIndex: number,
  turnCumulativeMs: number,
  totalDurMs: number,
) {
  return (status: AudioStatus) => {
    if (!status?.isLoaded) return;

    const posMs    = Math.round((status.currentTime ?? 0) * 1000);
    const durMs    = Math.round((status.duration ?? 0) * 1000);
    const totalPos = turnCumulativeMs + posMs;
    const progress = totalDurMs > 0 ? totalPos / totalDurMs : 0;

    broadcast({
      isLoading:         false,
      isBuffering:       status.playbackState === 'buffering',
      isPlaying:         status.playing ?? false,
      positionMs:        posMs,
      segmentDurationMs: durMs,
      totalPositionMs:   totalPos,
      totalDurationMs:   totalDurMs,
      currentTurnIndex:  turnIndex,
      progressPercent:   progress,
      isVisible:         true,
    });

    if (status.playing) {
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
    // Tear down any previous status listener before we replace/create.
    if (statusUnsubscribe) {
      try { statusUnsubscribe(); } catch {}
      statusUnsubscribe = null;
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

    const handler = makeStatusHandler(podcast, index, cumulativeMs, totalDurMs);

    // ── Bind to a local, definitely-typed `const` right away. ────────────
    // This is the actual fix for TS2339: performing every subsequent
    // operation through `player` (instead of re-reading the mutable
    // `globalPlayer` module variable) keeps TypeScript's narrowing intact
    // all the way down to the `.addListener(...)` call below.
    let player: AudioPlayer;
    if (!globalPlayer) {
      player = createAudioPlayer({ uri: audioUri }, { updateInterval: STATUS_UPDATE_INTERVAL_MS });
      globalPlayer = player;
    } else {
      player = globalPlayer;
      player.replace({ uri: audioUri });
    }

    player.setPlaybackRate(currentRate);

    const subscription = player.addListener('playbackStatusUpdate', handler);
    statusUnsubscribe = () => subscription.remove();

    if (autoPlay) {
      player.play();
    }

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
    return engineState.podcastId === podcastId && globalPlayer !== null;
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
    const player = globalPlayer;
    if (!player) return;
    if (!engineState.isPlaying) return; // already paused — nothing to do
    try {
      player.pause();
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
    const player = globalPlayer;
    if (!player) return;

    broadcast({ podcast, podcastId: podcast.id });

    const turns      = podcast.script?.turns ?? [];
    const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
    const idx        = engineState.currentTurnIndex;

    if (statusUnsubscribe) {
      try { statusUnsubscribe(); } catch {}
      statusUnsubscribe = null;
    }
    const handler = makeStatusHandler(podcast, idx, cumulativeMs, totalDurMs);
    const subscription = player.addListener('playbackStatusUpdate', handler);
    statusUnsubscribe = () => subscription.remove();

    try {
      const posMs    = Math.round((player.currentTime ?? 0) * 1000);
      const durMs    = Math.round((player.duration ?? 0) * 1000);
      const totalPos = cumulativeMs + posMs;
      broadcast({
        isPlaying:         player.playing ?? false,
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
    } catch {}
  },

  async play(): Promise<void> {
    const player = globalPlayer;
    if (!player) return;
    try {
      player.play();
      // User explicitly resumed — clear the offline-pause flag
      broadcast({ isPlaying: true, pausedByOffline: false });
    } catch (err) {
      console.warn('[AudioEngine] play error:', err);
    }
  },

  async pause(): Promise<void> {
    const player = globalPlayer;
    if (!player) return;
    try {
      player.pause();
      // User-initiated pause — not an offline pause
      broadcast({ isPlaying: false, pausedByOffline: false });
    } catch (err) {
      console.warn('[AudioEngine] pause error:', err);
    }
  },

  async toggle(): Promise<void> {
    const player = globalPlayer;
    if (!player) return;
    try {
      if (player.playing) {
        player.pause();
        broadcast({ isPlaying: false, pausedByOffline: false });
      } else {
        player.play();
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
    const player = globalPlayer;
    if (player) {
      try {
        const posMs = Math.round((player.currentTime ?? 0) * 1000);
        if (posMs > 2000) {
          player.seekTo(0);
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
    const player = globalPlayer;
    if (player) {
      try { player.setPlaybackRate(rate); } catch {}
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

    if (statusUnsubscribe) {
      try { statusUnsubscribe(); } catch {}
      statusUnsubscribe = null;
    }

    if (globalPlayer) {
      try {
        globalPlayer.pause();
        globalPlayer.remove();
      } catch {}
      globalPlayer = null;
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