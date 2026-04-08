// src/hooks/useVoiceDebatePlayer.ts
// Part 40 Fix — Improved reattach logic for MiniPlayer continuity
//
// Changes vs original:
//   1. On mount, if VoiceDebateEngine.isActiveFor(voiceDebate.id) → call reattach()
//      so coming back from MiniPlayer continues from where it left off.
//   2. Cleanup only calls stop() if !shouldKeepAlive (unchanged but made explicit).
//   3. All other logic unchanged.

import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceDebate }                          from '../types/voiceDebate';
import type { VoiceDebatePlayerState, DebateSegmentType } from '../types/voiceDebate';
import {
  VoiceDebateEngine,
  subscribeToVDEngine,
  getVDEngineState,
  type VoiceDebateEngineState,
} from '../services/VoiceDebateAudioEngine';

// ─── Map engine state → VoiceDebatePlayerState ───────────────────────────────

function engineToPlayerState(es: VoiceDebateEngineState): VoiceDebatePlayerState {
  return {
    isPlaying:           es.isPlaying,
    currentTurnIndex:    es.currentTurnIndex,
    positionMs:          es.positionMs,
    segmentDurationMs:   es.segmentDurationMs,
    totalPositionMs:     es.totalPositionMs,
    totalDurationMs:     es.totalDurationMs,
    isLoading:           es.isLoading,
    isBuffering:         es.isBuffering,
    playbackRate:        es.playbackRate,
    currentSegmentType:  es.currentSegmentType,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebatePlayer(voiceDebate: VoiceDebate | null) {
  const voiceDebateRef = useRef(voiceDebate);
  const isActiveRef    = useRef(false);

  useEffect(() => { voiceDebateRef.current = voiceDebate; }, [voiceDebate]);

  // Initialise from engine state so there's no flash of zeros on re-mount
  const [state, setState] = useState<VoiceDebatePlayerState>(() =>
    engineToPlayerState(getVDEngineState())
  );

  // ── Subscribe to VoiceDebateEngine on mount ───────────────────────────────

  useEffect(() => {
    isActiveRef.current = true;

    const unsub = subscribeToVDEngine((es: VoiceDebateEngineState) => {
      if (!isActiveRef.current) return;
      setState(engineToPlayerState(es));
    });

    // FIX 1: If audio is already running for this debate (returned from MiniPlayer),
    // call reattach() so we re-register the status handler with fresh closures
    // and immediately sync state. Without this, the screen would show stale
    // position/turn data from before the MiniPlayer detach.
    if (voiceDebate && VoiceDebateEngine.isActiveFor(voiceDebate.id)) {
      VoiceDebateEngine.reattach(voiceDebate);
    }

    return () => {
      isActiveRef.current = false;
      unsub();
      // Only stop if we haven't explicitly detached (i.e. back button wasn't pressed)
      // detach() sets shouldKeepAlive=true; back button fires beforeRemove → detachScreen()
      // which calls VoiceDebateEngine.detach() before this cleanup runs.
      if (!VoiceDebateEngine.shouldKeepAlive) {
        VoiceDebateEngine.stop();
      }
      VoiceDebateEngine.shouldKeepAlive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const startPlayback = useCallback(async (fromTurnIndex = 0) => {
    if (!voiceDebateRef.current) return;
    await VoiceDebateEngine.start(voiceDebateRef.current, fromTurnIndex);
  }, []);

  const play            = useCallback(() => VoiceDebateEngine.play(), []);
  const pause           = useCallback(() => VoiceDebateEngine.pause(), []);
  const togglePlayPause = useCallback(() => VoiceDebateEngine.toggle(), []);
  const skipToTurn      = useCallback((i: number) => VoiceDebateEngine.skipToTurn(i), []);
  const skipNext        = useCallback(() => VoiceDebateEngine.skipNext(), []);
  const skipPrevious    = useCallback(() => VoiceDebateEngine.skipPrevious(), []);
  const setPlaybackRate = useCallback((r: number) => VoiceDebateEngine.setRate(r), []);
  const seekToPercent   = useCallback((p: number) => VoiceDebateEngine.seekToPercent(p), []);

  const skipToSegment = useCallback(async (segmentType: DebateSegmentType) => {
    const vd  = voiceDebateRef.current;
    if (!vd) return;
    const seg = vd.script?.segments?.find(s => s.type === segmentType);
    if (seg) await VoiceDebateEngine.skipToTurn(seg.startTurnIdx);
  }, []);

  // Called from the screen's beforeRemove listener (back button / swipe down)
  // Sets shouldKeepAlive=true so cleanup above doesn't stop the audio engine.
  const detachScreen = useCallback(() => {
    VoiceDebateEngine.detach();
  }, []);

  const stopPlayback = useCallback(async () => {
    await VoiceDebateEngine.stop();
  }, []);

  const formatTime = useCallback((ms: number) => VoiceDebateEngine.formatTime(ms), []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const progressPercent = state.totalDurationMs > 0
    ? Math.min(1, state.totalPositionMs / state.totalDurationMs)
    : 0;

  const currentTurn = voiceDebate?.script?.turns?.[state.currentTurnIndex] ?? null;

  return {
    playerState: state,
    currentTurn,
    progressPercent,
    startPlayback,
    play,
    pause,
    togglePlayPause,
    skipToTurn,
    skipNext,
    skipPrevious,
    setPlaybackRate,
    seekToPercent,
    skipToSegment,
    detachScreen,
    stopPlayback,
    formatTime,
  };
}