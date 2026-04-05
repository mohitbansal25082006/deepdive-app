// src/context/MiniPlayerContext.tsx
// Part 39 FIX v3 — Solves "Cannot update a component while rendering a different component"
//
// ROOT CAUSE of the error:
//   The old approach called updateMiniPlayer() (which calls setState on this context)
//   from INSIDE a setState updater callback in usePodcastPlayer.ts.
//   React forbids calling setState on component A while component B is mid-render.
//
// FIX:
//   updateMiniPlayer() now schedules the update via setTimeout(fn, 0) when called
//   synchronously inside a render cycle. We detect this by checking if React is
//   currently flushing (via a simple flag set around setState calls).
//   This breaks the synchronous setState-inside-setState chain.
//
//   Additionally, the context exposes a ref accessor (getMiniPlayerUpdater) that
//   usePodcastPlayer can call directly without triggering the context consumer
//   re-render cycle.

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import type { MiniPlayerState } from '../types/podcast_v2';

// ─── Initial State ─────────────────────────────────────────────────────────────

const INITIAL_STATE: MiniPlayerState = {
  isVisible:       false,
  podcastId:       null,
  podcastTitle:    '',
  hostName:        '',
  guestName:       '',
  isPlaying:       false,
  progressPercent: 0,
  currentTurnIdx:  0,
};

// ─── Context Value ─────────────────────────────────────────────────────────────

interface MiniPlayerContextValue {
  miniPlayerState:    MiniPlayerState;
  updateMiniPlayer:   (partial: Partial<MiniPlayerState>) => void;
  hideMiniPlayer:     () => void;
  /** Direct ref accessor — call this from audio callbacks to avoid render conflicts */
  getMiniPlayerUpdater: () => (partial: Partial<MiniPlayerState>) => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue>({
  miniPlayerState:    INITIAL_STATE,
  updateMiniPlayer:   () => {},
  hideMiniPlayer:     () => {},
  getMiniPlayerUpdater: () => () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MiniPlayerState>(INITIAL_STATE);

  // Track whether we are currently inside a setState flush to avoid
  // calling setState synchronously inside another setState updater.
  const isFlushing = useRef(false);

  // Queue of pending partial updates to apply after current flush
  const pendingQueue = useRef<Array<Partial<MiniPlayerState>>>([]);

  // Flush the pending queue asynchronously
  const flushQueue = useRef(() => {
    if (pendingQueue.current.length === 0) return;
    const updates = pendingQueue.current.splice(0);
    setState(prev => {
      let next = prev;
      for (const partial of updates) {
        next = { ...next, ...partial };
      }
      return next;
    });
  });

  // Safe updater: if we are currently flushing, defer via setTimeout(0)
  const updateMiniPlayer = useCallback((partial: Partial<MiniPlayerState>) => {
    if (isFlushing.current) {
      // Defer — this is called from inside a setState updater somewhere
      pendingQueue.current.push(partial);
      setTimeout(flushQueue.current, 0);
    } else {
      isFlushing.current = true;
      setState(prev => {
        const next = { ...prev, ...partial };
        isFlushing.current = false;
        return next;
      });
    }
  }, []);

  const hideMiniPlayer = useCallback(() => {
    updateMiniPlayer({ isVisible: false, isPlaying: false });
  }, [updateMiniPlayer]);

  // Stable ref so usePodcastPlayer can grab it without triggering re-renders
  const updaterRef = useRef(updateMiniPlayer);
  updaterRef.current = updateMiniPlayer;

  const getMiniPlayerUpdater = useCallback(() => {
    return (partial: Partial<MiniPlayerState>) => {
      // Always go through setTimeout(0) when called from audio callbacks
      // This completely avoids the setState-during-render problem
      pendingQueue.current.push(partial);
      setTimeout(flushQueue.current, 0);
    };
  }, []);

  return (
    <MiniPlayerContext.Provider
      value={{ miniPlayerState: state, updateMiniPlayer, hideMiniPlayer, getMiniPlayerUpdater }}
    >
      {children}
    </MiniPlayerContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useMiniPlayerContext(): MiniPlayerContextValue {
  return useContext(MiniPlayerContext);
}