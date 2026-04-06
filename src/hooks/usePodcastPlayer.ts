// src/hooks/usePodcastPlayer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Refactored in Part 39 Fix (final) to use GlobalAudioEngine as the single
// source of truth for all audio state.
//
// KEY CHANGES vs the old version:
//   • No more module-level globalHolder, globalKeepAlive, globalMiniPlayerCallback
//   • No more dual-path state (React state + mini player state diverging)
//   • No more stale isUnmountedRef closing over old setState
//   • No more getMiniPlayerUpdater() or pushToMiniPlayer() needing setTimeout queues
//
// HOW IT WORKS NOW:
//   1. usePodcastPlayer subscribes to GlobalAudioEngine on mount
//   2. Every state change (play, pause, turn advance, seek) flows through
//      AudioEngine and is broadcast to ALL subscribers simultaneously
//   3. MiniPlayer subscribes independently — it always sees the same state
//   4. When podcast-player unmounts (back nav), AudioEngine.detach() keeps
//      audio alive; on re-mount, AudioEngine.reattach() re-syncs state
//   5. The "position reset" bug is eliminated because both the mini player
//      progress bar AND the podcast-player progress bar read from the same
//      engineState object
//
// BACKWARD COMPAT EXPORTS (used by _layout.tsx, podcast.tsx, etc.):
//   • isGlobalAudioActiveForPodcast  — re-exported from GlobalAudioEngine
//   • stopGlobalAudio                — re-exported
//   • toggleGlobalAudio              — re-exported
//   • registerProgressSaveCallback   — re-exported
//   • registerFallbackMiniPlayerCallback — no-op stub (no longer needed)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Podcast, PodcastPlayerState }          from '../types';
import type { MiniPlayerState }                      from '../types/podcast_v2';
import {
  AudioEngine,
  subscribeToEngine,
  getEngineState,
  registerProgressSaveCallback,
  isGlobalAudioActiveForPodcast,
  stopGlobalAudio,
  toggleGlobalAudio,
  type EngineState,
} from '../services/GlobalAudioEngine';

// Re-export for backward compat
export {
  isGlobalAudioActiveForPodcast,
  stopGlobalAudio,
  toggleGlobalAudio,
  registerProgressSaveCallback,
};

// Stub — no longer needed but kept so existing imports don't break
export function registerFallbackMiniPlayerCallback(
  _cb: (partial: Partial<MiniPlayerState>) => void,
): void {
  // No-op: MiniPlayer now subscribes to GlobalAudioEngine directly
}

// ─── Map engine state → PodcastPlayerState ───────────────────────────────────

function engineToPodcastPlayerState(es: EngineState): PodcastPlayerState {
  return {
    isPlaying:         es.isPlaying,
    currentTurnIndex:  es.currentTurnIndex,
    positionMs:        es.positionMs,
    segmentDurationMs: es.segmentDurationMs,
    totalPositionMs:   es.totalPositionMs,
    totalDurationMs:   es.totalDurationMs,
    isLoading:         es.isLoading,
    isBuffering:       es.isBuffering,
    playbackRate:      es.playbackRate,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePodcastPlayer(
  podcast: Podcast | null,
  // Kept for API compat — no longer used (MiniPlayer subscribes directly)
  _onMiniPlayerStateChange?: (miniState: Partial<MiniPlayerState>) => void,
) {
  const podcastRef    = useRef(podcast);
  const isActiveRef   = useRef(false);   // true while this hook instance is mounted

  useEffect(() => { podcastRef.current = podcast; }, [podcast]);

  // Initialise from engine state (avoids flash of INITIAL_STATE on re-mount)
  const [state, setState] = useState<PodcastPlayerState>(() =>
    engineToPodcastPlayerState(getEngineState())
  );

  // ── Subscribe to engine on mount ──────────────────────────────────────────
  useEffect(() => {
    isActiveRef.current = true;

    const unsub = subscribeToEngine((es: EngineState) => {
      if (!isActiveRef.current) return;
      setState(engineToPodcastPlayerState(es));
    });

    // If audio is already running for this podcast, reattach
    if (podcast && AudioEngine.isActiveFor(podcast.id)) {
      AudioEngine.reattach(podcast);
    }

    return () => {
      isActiveRef.current = false;
      unsub();
      // Only keep audio alive if detach() was already called (i.e. back navigation)
      // If component unmounts for any other reason, stop audio
      if (!AudioEngine.shouldKeepAlive) {
        AudioEngine.stop();
      }
      // Always reset keepAlive after cleanup so next mount starts fresh
      AudioEngine.shouldKeepAlive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const startPlayback = useCallback(async () => {
    if (!podcastRef.current) return;
    await AudioEngine.startPodcast(podcastRef.current, 0);
  }, []);

  const resumeFrom = useCallback(async (turnIndex: number) => {
    if (!podcastRef.current) return;
    const turns   = podcastRef.current.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(turnIndex, turns.length - 1));
    await AudioEngine.startPodcast(podcastRef.current, clamped);
  }, []);

  const play              = useCallback(() => AudioEngine.play(), []);
  const pause             = useCallback(() => AudioEngine.pause(), []);
  const togglePlayPause   = useCallback(() => AudioEngine.toggle(), []);
  const skipToTurn        = useCallback((i: number) => AudioEngine.skipToTurn(i), []);
  const skipNext          = useCallback(() => AudioEngine.skipNext(), []);
  const skipPrevious      = useCallback(() => AudioEngine.skipPrevious(), []);
  const setPlaybackRate   = useCallback((r: number) => AudioEngine.setRate(r), []);

  const detachScreen = useCallback(() => {
    AudioEngine.detach();
  }, []);

  const stopPlayback = useCallback(async () => {
    await AudioEngine.stop();
  }, []);

  const formatTime = useCallback((ms: number) => AudioEngine.formatTime(ms), []);

  const progressPercent = state.totalDurationMs > 0
    ? Math.min(1, state.totalPositionMs / state.totalDurationMs)
    : 0;

  const currentTurn = podcast?.script?.turns?.[state.currentTurnIndex] ?? null;

  return {
    playerState: state,
    currentTurn,
    progressPercent,
    startPlayback,
    resumeFrom,
    play,
    pause,
    togglePlayPause,
    skipToTurn,
    skipNext,
    skipPrevious,
    setPlaybackRate,
    stopPlayback,
    detachScreen,
    formatTime,
  };
}