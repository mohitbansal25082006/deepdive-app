// src/context/MiniPlayerContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Refactored in Part 39 Fix (final).
//
// OLD APPROACH (broken):
//   • Maintained its own MiniPlayerState, updated via updateMiniPlayer() callbacks
//   • usePodcastPlayer called updateMiniPlayer() from inside audio status callbacks
//     → triggered "setState while rendering" React warnings
//   • Used setTimeout(0) queues to defer updates, causing visible lag in the
//     progress bar and play/pause button
//
// NEW APPROACH (correct):
//   • MiniPlayerProvider subscribes directly to GlobalAudioEngine
//   • Engine broadcasts one canonical state → MiniPlayerContext maps it to
//     MiniPlayerState and sets React state
//   • No more callback threading, no more setTimeout queues, no more dual-path
//   • updateMiniPlayer() kept as a no-op stub for backward compat
//   • hideMiniPlayer() still works: calls AudioEngine.stop()
//   • getMiniPlayerUpdater() kept as stub (podcast-player no longer needs it)
//
// The net result:
//   • Mini player progress bar advances in real-time with no lag
//   • Play/pause button is always in sync with actual audio state
//   • No "cannot update a component while rendering" warnings
//   • Position shown in mini player == position podcast-player resumes from
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { MiniPlayerState } from '../types/podcast_v2';
import {
  subscribeToEngine,
  AudioEngine,
  type EngineState,
} from '../services/GlobalAudioEngine';

// ─── Initial State ─────────────────────────────────────────────────────────────

const INITIAL_MINI_STATE: MiniPlayerState = {
  isVisible:       false,
  podcastId:       null,
  podcastTitle:    '',
  hostName:        '',
  guestName:       '',
  isPlaying:       false,
  progressPercent: 0,
  currentTurnIdx:  0,
};

// ─── Map EngineState → MiniPlayerState ────────────────────────────────────────

function engineToMiniState(es: EngineState): MiniPlayerState {
  const podcast = es.podcast;
  const turns   = podcast?.script?.turns ?? [];

  return {
    isVisible:       es.isVisible && es.podcastId !== null,
    podcastId:       es.podcastId,
    podcastTitle:    podcast?.title          ?? '',
    hostName:        podcast?.config?.hostName  ?? 'Host',
    guestName:       podcast?.config?.guestName ?? 'Guest',
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
    currentTurnIdx:  es.currentTurnIndex,
  };
}

// ─── Context Value ─────────────────────────────────────────────────────────────

interface MiniPlayerContextValue {
  miniPlayerState:      MiniPlayerState;
  /** @deprecated No-op stub — engine handles all updates */
  updateMiniPlayer:     (partial: Partial<MiniPlayerState>) => void;
  hideMiniPlayer:       () => void;
  /** @deprecated No-op stub — podcast-player no longer needs this */
  getMiniPlayerUpdater: () => (partial: Partial<MiniPlayerState>) => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue>({
  miniPlayerState:      INITIAL_MINI_STATE,
  updateMiniPlayer:     () => {},
  hideMiniPlayer:       () => {},
  getMiniPlayerUpdater: () => () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
  const [miniState, setMiniState] = useState<MiniPlayerState>(INITIAL_MINI_STATE);

  // Subscribe to the global audio engine
  useEffect(() => {
    const unsub = subscribeToEngine((es: EngineState) => {
      setMiniState(engineToMiniState(es));
    });
    return unsub;
  }, []);

  // hideMiniPlayer: stop audio entirely and hide the player
  const hideMiniPlayer = useCallback(async () => {
    await AudioEngine.stop();
  }, []);

  // Stubs for backward compat
  const updateMiniPlayer     = useCallback((_partial: Partial<MiniPlayerState>) => {}, []);
  const getMiniPlayerUpdater = useCallback(() => (_partial: Partial<MiniPlayerState>) => {}, []);

  return (
    <MiniPlayerContext.Provider
      value={{ miniPlayerState: miniState, updateMiniPlayer, hideMiniPlayer, getMiniPlayerUpdater }}
    >
      {children}
    </MiniPlayerContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useMiniPlayerContext(): MiniPlayerContextValue {
  return useContext(MiniPlayerContext);
}