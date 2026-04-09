// src/services/VoiceDebateAudioEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 41.2 UPDATE — Offline-aware audio pause/resume.
//
// Mirrors the same pauseForOffline / clearOfflinePause pattern added to
// GlobalAudioEngine so the voice-debate mini player behaves consistently:
//
//   • Going offline while debate is playing → audio pauses, mini player
//     stays visible in "paused" state, pausedByOffline = true
//   • Coming back online → flag cleared, audio stays paused, user taps Play
//   • User taps Play/toggle → pausedByOffline cleared, normal playback
//
// NEW fields in VoiceDebateEngineState:
//   pausedByOffline: boolean
//
// NEW methods on VoiceDebateEngine:
//   pauseForOffline()    — pause + set flag
//   clearOfflinePause()  — clear flag only, no auto-resume
//
// Everything else is identical to the Part 41 version.
// ─────────────────────────────────────────────────────────────────────────────

import { Audio }             from 'expo-av';
import { audioFileExists }   from './voiceDebateTTSService';
import type { VoiceDebate, VoiceDebateTurn, DebateSegmentType } from '../types/voiceDebate';

// ─── Engine State ─────────────────────────────────────────────────────────────

export interface VoiceDebateEngineState {
  voiceDebateId:      string | null;
  voiceDebate:        VoiceDebate | null;
  isPlaying:          boolean;
  isLoading:          boolean;
  isBuffering:        boolean;
  currentTurnIndex:   number;
  positionMs:         number;
  segmentDurationMs:  number;
  totalPositionMs:    number;
  totalDurationMs:    number;
  playbackRate:       number;
  currentSegmentType: DebateSegmentType;
  // Mini player fields
  isVisible:          boolean;
  progressPercent:    number;
  // ── Part 41.2: offline pause flag ────────────────────────────────────────
  pausedByOffline:    boolean;
}

const INITIAL_STATE: VoiceDebateEngineState = {
  voiceDebateId:      null,
  voiceDebate:        null,
  isPlaying:          false,
  isLoading:          false,
  isBuffering:        false,
  currentTurnIndex:   0,
  positionMs:         0,
  segmentDurationMs:  0,
  totalPositionMs:    0,
  totalDurationMs:    0,
  playbackRate:       1.0,
  currentSegmentType: 'opening',
  isVisible:          false,
  progressPercent:    0,
  pausedByOffline:    false,
};

// ─── Module singletons ────────────────────────────────────────────────────────

let engineState: VoiceDebateEngineState = { ...INITIAL_STATE };
let globalSound:       Audio.Sound | null = null;
let loadTurnLock                          = false;
let audioSessionReady                     = false;
let currentRate                           = 1.0;
let keepAlive                             = false;
let cumulativeMs                          = 0;

let loadTurnRef: (index: number, autoPlay: boolean) => Promise<void> = async () => {};

// ─── Subscribers ──────────────────────────────────────────────────────────────

type Subscriber = (state: VoiceDebateEngineState) => void;
const subscribers = new Set<Subscriber>();

export function subscribeToVDEngine(cb: Subscriber): () => void {
  subscribers.add(cb);
  cb(engineState);
  return () => { subscribers.delete(cb); };
}

export function getVDEngineState(): VoiceDebateEngineState {
  return engineState;
}

function broadcast(partial: Partial<VoiceDebateEngineState>): void {
  engineState = { ...engineState, ...partial };
  subscribers.forEach(cb => { try { cb(engineState); } catch {} });
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
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveAudioUri(vd: VoiceDebate, index: number): Promise<string | null> {
  const local = vd.audioSegmentPaths?.[index] ?? '';
  if (local) {
    if (local.startsWith('https://') || local.startsWith('http://')) return local;
    if (await audioFileExists(local)) return local;
  }
  const cloud: string | null = (vd.audioStorageUrls as any)?.[index] ?? null;
  if (cloud && (cloud.startsWith('https://') || cloud.startsWith('http://'))) return cloud;
  return null;
}

function getCumMs(turns: VoiceDebateTurn[], upTo: number): number {
  return turns.slice(0, upTo).reduce((s, t) => s + (t.durationMs ?? 0), 0);
}

function getTotalMs(turns: VoiceDebateTurn[]): number {
  return turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
}

function getSegmentType(vd: VoiceDebate, idx: number): DebateSegmentType {
  return vd.script?.turns?.[idx]?.segmentType ?? 'opening';
}

// ─── Status Handler ───────────────────────────────────────────────────────────

function makeStatusHandler(
  vd:            VoiceDebate,
  turnIndex:     number,
  turnCumMs:     number,
  totalDurMs:    number,
) {
  return (status: any) => {
    if (!status?.isLoaded) return;

    const posMs    = status.positionMillis ?? 0;
    const durMs    = status.durationMillis ?? 0;
    const totalPos = turnCumMs + posMs;
    const progress = totalDurMs > 0 ? totalPos / totalDurMs : 0;

    broadcast({
      isLoading:          false,
      isBuffering:        status.isBuffering ?? false,
      isPlaying:          status.isPlaying   ?? false,
      positionMs:         posMs,
      segmentDurationMs:  durMs,
      totalPositionMs:    totalPos,
      totalDurationMs:    totalDurMs,
      currentTurnIndex:   turnIndex,
      progressPercent:    progress,
      isVisible:          true,
    });

    if (status.didJustFinish) {
      const turns   = vd.script?.turns ?? [];
      const nextIdx = turnIndex + 1;
      if (nextIdx < turns.length) {
        setTimeout(() => loadTurnRef(nextIdx, true), 120);
      } else {
        broadcast({ isPlaying: false, positionMs: 0, totalPositionMs: totalDurMs, progressPercent: 1 });
      }
    }
  };
}

// ─── Core: Load Turn ──────────────────────────────────────────────────────────

async function loadTurn(index: number, autoPlay: boolean): Promise<void> {
  const vd = engineState.voiceDebate;
  if (!vd) return;

  const turns = vd.script?.turns ?? [];
  if (index < 0 || index >= turns.length) return;
  if (loadTurnLock) return;

  loadTurnLock = true;

  try {
    if (globalSound) {
      try { globalSound.setOnPlaybackStatusUpdate(null); await globalSound.unloadAsync(); } catch {}
      globalSound = null;
    }

    cumulativeMs    = getCumMs(turns, index);
    const totalDurMs = getTotalMs(turns);
    const segType    = getSegmentType(vd, index);

    broadcast({
      currentTurnIndex:   index,
      isLoading:          true,
      positionMs:         0,
      segmentDurationMs:  0,
      totalPositionMs:    cumulativeMs,
      totalDurationMs:    totalDurMs,
      progressPercent:    totalDurMs > 0 ? cumulativeMs / totalDurMs : 0,
      currentSegmentType: segType,
    });

    const audioUri = await resolveAudioUri(vd, index);

    if (!audioUri) {
      broadcast({ isLoading: false });
      loadTurnLock = false;
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef(index + 1, true), 80);
      }
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUri },
      {
        shouldPlay:                   autoPlay,
        rate:                         currentRate,
        progressUpdateIntervalMillis: 250,
        shouldCorrectPitch:           true,
      },
    );

    globalSound = sound;

    const handler = makeStatusHandler(vd, index, cumulativeMs, totalDurMs);
    sound.setOnPlaybackStatusUpdate(handler);

    broadcast({
      isLoading:   false,
      isPlaying:   autoPlay,
      isVisible:   true,
      voiceDebateId: vd.id,
      voiceDebate:   vd,
    });

    loadTurnLock = false;
  } catch (err) {
    console.warn(`[VDEngine] Turn ${index} error:`, err);
    broadcast({ isLoading: false });
    loadTurnLock = false;
    if (autoPlay && (engineState.voiceDebate?.script?.turns?.length ?? 0) > index + 1) {
      setTimeout(() => loadTurnRef(index + 1, true), 300);
    }
  }
}

loadTurnRef = loadTurn;

// ─── Public API ───────────────────────────────────────────────────────────────

export const VoiceDebateEngine = {

  isActiveFor(voiceDebateId: string): boolean {
    return engineState.voiceDebateId === voiceDebateId && globalSound !== null;
  },

  // ── Part 41.2: Offline pause ──────────────────────────────────────────────

  /**
   * Called when the device goes offline.
   * Pauses audio if currently playing and sets the pausedByOffline flag.
   */
  async pauseForOffline(): Promise<void> {
    if (!globalSound) return;
    if (!engineState.isPlaying) return;
    try {
      await globalSound.pauseAsync();
      broadcast({ isPlaying: false, pausedByOffline: true });
    } catch (err) {
      console.warn('[VDEngine] pauseForOffline error:', err);
    }
  },

  /**
   * Called when the device comes back online.
   * Clears the flag — does NOT auto-resume.
   */
  clearOfflinePause(): void {
    if (engineState.pausedByOffline) {
      broadcast({ pausedByOffline: false });
    }
  },

  // ── Existing API ──────────────────────────────────────────────────────────

  async start(vd: VoiceDebate, fromTurnIndex = 0): Promise<void> {
    await ensureAudioSession();
    keepAlive = false;

    const turns      = vd.script?.turns ?? [];
    const totalDurMs = getTotalMs(turns);

    broadcast({
      voiceDebateId:    vd.id,
      voiceDebate:      vd,
      isVisible:        true,
      totalDurationMs:  totalDurMs,
      currentTurnIndex: fromTurnIndex,
      pausedByOffline:  false, // clear stale flag on fresh start
    });

    await loadTurn(fromTurnIndex, true);
  },

  async reattach(vd: VoiceDebate): Promise<void> {
    if (!globalSound) return;
    broadcast({ voiceDebate: vd, voiceDebateId: vd.id });

    const turns      = vd.script?.turns ?? [];
    const totalDurMs = getTotalMs(turns);
    const idx        = engineState.currentTurnIndex;

    const handler = makeStatusHandler(vd, idx, cumulativeMs, totalDurMs);
    globalSound.setOnPlaybackStatusUpdate(handler);

    try {
      const status = await globalSound.getStatusAsync();
      if (status.isLoaded) {
        const posMs    = status.positionMillis ?? 0;
        const durMs    = status.durationMillis ?? 0;
        const totalPos = cumulativeMs + posMs;
        broadcast({
          isPlaying:          status.isPlaying,
          isLoading:          false,
          isBuffering:        false,
          positionMs:         posMs,
          segmentDurationMs:  durMs,
          totalPositionMs:    totalPos,
          totalDurationMs:    totalDurMs > 0 ? totalDurMs : engineState.totalDurationMs,
          progressPercent:    totalDurMs > 0 ? totalPos / totalDurMs : engineState.progressPercent,
          currentTurnIndex:   idx,
          isVisible:          true,
        });
      }
    } catch {}
  },

  async play(): Promise<void> {
    if (!globalSound) return;
    try {
      await globalSound.playAsync();
      // User explicitly resumed — clear offline flag
      broadcast({ isPlaying: true, pausedByOffline: false });
    } catch {}
  },

  async pause(): Promise<void> {
    if (!globalSound) return;
    try {
      await globalSound.pauseAsync();
      // User-initiated — not offline
      broadcast({ isPlaying: false, pausedByOffline: false });
    } catch {}
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
        // User manually resumed — clear offline flag
        broadcast({ isPlaying: true, pausedByOffline: false });
      }
    } catch {}
  },

  async skipToTurn(index: number): Promise<void> {
    const wasPlaying = engineState.isPlaying;
    await loadTurn(index, wasPlaying);
  },

  async skipNext(): Promise<void> {
    const turns = engineState.voiceDebate?.script?.turns ?? [];
    const next  = engineState.currentTurnIndex + 1;
    if (next < turns.length) await this.skipToTurn(next);
  },

  async skipPrevious(): Promise<void> {
    if (globalSound) {
      try {
        const status = await globalSound.getStatusAsync();
        if (status.isLoaded && (status.positionMillis ?? 0) > 2500) {
          await globalSound.setPositionAsync(0);
          broadcast({ positionMs: 0, totalPositionMs: cumulativeMs });
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
    const vd = engineState.voiceDebate;
    if (!vd) return;
    const turns    = vd.script?.turns ?? [];
    const totalDur = getTotalMs(turns);
    const targetMs = percent * totalDur;
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
    keepAlive    = false;
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
    broadcast({ ...INITIAL_STATE, isVisible: false });
  },

  get shouldKeepAlive(): boolean { return keepAlive; },
  set shouldKeepAlive(v: boolean) { keepAlive = v; },

  formatTime(ms: number): string {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
  },
};

export function isVDEngineActiveFor(id: string): boolean {
  return VoiceDebateEngine.isActiveFor(id);
}