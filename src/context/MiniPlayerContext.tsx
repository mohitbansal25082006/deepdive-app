// src/context/MiniPlayerContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Updated in Part 40 Fix — now handles BOTH podcast and voice debate playback.
//
// The mini player can show one of two content types:
//   • Podcast  — sourced from GlobalAudioEngine
//   • VoiceDebate — sourced from VoiceDebateAudioEngine
//
// Rule: Whichever engine has isVisible=true AND isPlaying (or just loaded)
// takes priority. They are mutually exclusive — starting a voice debate
// automatically stops the podcast engine and vice versa (each engine's
// start() calls Audio.setAudioModeAsync which interrupts the other).
//
// MiniPlayerState is extended with:
//   contentType: 'podcast' | 'voice_debate'
//   voiceDebateId: string | null
//   subtitle: string  (speaker names for podcast, topic for voice debate)
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { MiniPlayerState }    from '../types/podcast_v2';
import {
  subscribeToEngine,
  AudioEngine,
  type EngineState,
}                                  from '../services/GlobalAudioEngine';
import {
  subscribeToVDEngine,
  VoiceDebateEngine,
  type VoiceDebateEngineState,
}                                  from '../services/VoiceDebateAudioEngine';

// ─── Extended Mini Player State ───────────────────────────────────────────────

export interface ExtendedMiniPlayerState extends MiniPlayerState {
  contentType:    'podcast' | 'voice_debate';
  voiceDebateId:  string | null;
  subtitle:       string;
  topic?:         string;
}

// ─── Initial State ─────────────────────────────────────────────────────────────

const INITIAL_MINI_STATE: ExtendedMiniPlayerState = {
  isVisible:       false,
  podcastId:       null,
  podcastTitle:    '',
  hostName:        '',
  guestName:       '',
  isPlaying:       false,
  progressPercent: 0,
  currentTurnIdx:  0,
  // Extended
  contentType:     'podcast',
  voiceDebateId:   null,
  subtitle:        '',
};

// ─── Map EngineState → ExtendedMiniPlayerState ────────────────────────────────

function podcastEngineToMiniState(es: EngineState): ExtendedMiniPlayerState {
  const podcast = es.podcast;
  return {
    isVisible:       es.isVisible && es.podcastId !== null,
    podcastId:       es.podcastId,
    podcastTitle:    podcast?.title             ?? '',
    hostName:        podcast?.config?.hostName  ?? 'Host',
    guestName:       podcast?.config?.guestName ?? 'Guest',
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
    currentTurnIdx:  es.currentTurnIndex,
    // Extended
    contentType:     'podcast',
    voiceDebateId:   null,
    subtitle:        `${podcast?.config?.hostName ?? 'Host'} & ${podcast?.config?.guestName ?? 'Guest'}`,
  };
}

function vdEngineToMiniState(es: VoiceDebateEngineState): ExtendedMiniPlayerState {
  const vd = es.voiceDebate;
  return {
    isVisible:       es.isVisible && es.voiceDebateId !== null,
    podcastId:       null,
    podcastTitle:    vd?.topic ?? 'Voice Debate',
    hostName:        'Voice Debate',
    guestName:       '',
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
    currentTurnIdx:  es.currentTurnIndex,
    // Extended
    contentType:     'voice_debate',
    voiceDebateId:   es.voiceDebateId,
    subtitle:        vd?.topic ?? '',
    topic:           vd?.topic,
  };
}

// ─── Context Value ─────────────────────────────────────────────────────────────

interface MiniPlayerContextValue {
  miniPlayerState:      ExtendedMiniPlayerState;
  /** @deprecated No-op stub */
  updateMiniPlayer:     (partial: Partial<MiniPlayerState>) => void;
  hideMiniPlayer:       () => void;
  /** @deprecated No-op stub */
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
  const [miniState, setMiniState] = useState<ExtendedMiniPlayerState>(INITIAL_MINI_STATE);

  // Track each engine's state independently
  const [podcastState, setPodcastState] = useState<ExtendedMiniPlayerState>(INITIAL_MINI_STATE);
  const [vdState,      setVdState]      = useState<ExtendedMiniPlayerState>(INITIAL_MINI_STATE);

  // Subscribe to podcast engine
  useEffect(() => {
    const unsub = subscribeToEngine((es: EngineState) => {
      setPodcastState(podcastEngineToMiniState(es));
    });
    return unsub;
  }, []);

  // Subscribe to voice debate engine
  useEffect(() => {
    const unsub = subscribeToVDEngine((es: VoiceDebateEngineState) => {
      setVdState(vdEngineToMiniState(es));
    });
    return unsub;
  }, []);

  // Resolve which engine wins (most recent visible one)
  useEffect(() => {
    if (vdState.isVisible) {
      setMiniState(vdState);
    } else if (podcastState.isVisible) {
      setMiniState(podcastState);
    } else {
      setMiniState(INITIAL_MINI_STATE);
    }
  }, [podcastState, vdState]);

  const hideMiniPlayer = useCallback(async () => {
    if (miniState.contentType === 'voice_debate') {
      await VoiceDebateEngine.stop();
    } else {
      await AudioEngine.stop();
    }
  }, [miniState.contentType]);

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