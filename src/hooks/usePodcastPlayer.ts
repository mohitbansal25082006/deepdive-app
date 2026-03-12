// src/hooks/usePodcastPlayer.ts
// Part 8 — Sequential audio playback of podcast segments using expo-av.
//
// ARCHITECTURE:
//  • Each podcast turn is a separate .mp3 file on the local filesystem.
//  • The hook loads and plays turns sequentially, auto-advancing when each
//    segment finishes (didJustFinish === true in the status callback).
//  • All mutable playback values are kept in refs to avoid stale closures
//    inside the expo-av status callback. React state is only updated for
//    UI rendering (position, currentIndex, isPlaying, etc.)
//  • loadTurnRef.current is updated after every render so the status
//    callback (which cannot change after it's registered) always has access
//    to the most recent version of loadTurn via the ref.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio }                                     from 'expo-av';
import { Podcast, PodcastPlayerState }               from '../types';
import { audioFileExists }                           from '../services/podcastTTSService';

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: PodcastPlayerState = {
  isPlaying:         false,
  currentTurnIndex:  0,
  positionMs:        0,
  segmentDurationMs: 0,
  totalPositionMs:   0,
  totalDurationMs:   0,
  isLoading:         false,
  isBuffering:       false,
  playbackRate:      1.0,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePodcastPlayer(podcast: Podcast | null) {

  // ── Refs (never cause re-renders) ─────────────────────────────────────────
  const soundRef           = useRef<Audio.Sound | null>(null);
  const isUnmountedRef     = useRef(false);
  const currentIndexRef    = useRef(0);
  const rateRef            = useRef(1.0);
  const podcastRef         = useRef(podcast);

  // Self-reference so the status callback can trigger auto-advance
  const loadTurnRef = useRef<(index: number, autoPlay: boolean) => Promise<void>>(
    async () => {}
  );

  // Keep podcast ref in sync
  useEffect(() => { podcastRef.current = podcast; }, [podcast]);

  // ── State (drives UI rendering) ───────────────────────────────────────────
  const [state, setState] = useState<PodcastPlayerState>(INITIAL_STATE);

  // Stable patch helper — no-ops after unmount
  const patchRef = useRef((partial: Partial<PodcastPlayerState>) => {
    if (!isUnmountedRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  });

  // ── Audio session config (once on mount) ──────────────────────────────────
  useEffect(() => {
    isUnmountedRef.current = false;

    Audio.setAudioModeAsync({
      allowsRecordingIOS:   false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => { /* ignore — some environments don't support this */ });

    return () => {
      isUnmountedRef.current = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // ── Pre-compute cumulative turn durations ─────────────────────────────────
  useEffect(() => {
    if (!podcast) return;
    const turns = podcast.script?.turns ?? [];
    const total  = turns.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
    patchRef.current({ totalDurationMs: total });
  }, [podcast?.id]);

  // ── Core: load a specific turn and optionally start playback ──────────────

  const loadTurn = async (index: number, autoPlay: boolean): Promise<void> => {
    const p = podcastRef.current;
    if (!p) return;

    const turns = p.script?.turns ?? [];
    if (index < 0 || index >= turns.length) return;

    // Teardown previous sound
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }

    if (isUnmountedRef.current) return;

    currentIndexRef.current = index;
    patchRef.current({ currentTurnIndex: index, isLoading: true, positionMs: 0 });

    const turn      = turns[index];
    const audioPath = p.audioSegmentPaths?.[index] ?? '';

    if (!audioPath) {
      patchRef.current({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    const exists = await audioFileExists(audioPath);
    if (!exists) {
      patchRef.current({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioPath },
        {
          shouldPlay:                    autoPlay,
          rate:                          rateRef.current,
          progressUpdateIntervalMillis:  250,
          shouldCorrectPitch:            true,
        }
      );

      if (isUnmountedRef.current) {
        await sound.unloadAsync();
        return;
      }

      soundRef.current = sound;

      // Pre-compute values used in the status callback (no React state access)
      const totalDurationMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
      const cumulativeMs    = turns
        .slice(0, index)
        .reduce((s, t) => s + (t.durationMs ?? 0), 0);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        // Loaded-status guard — works across expo-av versions
        if (!status?.isLoaded)    return;
        if (isUnmountedRef.current) return;

        const posMs = status.positionMillis ?? 0;
        const durMs = status.durationMillis ?? (turn.durationMs ?? 0);

        patchRef.current({
          isLoading:         false,
          isBuffering:       status.isBuffering ?? false,
          isPlaying:         status.isPlaying   ?? false,
          positionMs:        posMs,
          segmentDurationMs: durMs,
          totalPositionMs:   cumulativeMs + posMs,
          totalDurationMs,
        });

        // Auto-advance to next segment
        if (status.didJustFinish) {
          const next = currentIndexRef.current + 1;
          if (next < turns.length) {
            setTimeout(() => loadTurnRef.current(next, true), 120);
          } else {
            // Podcast finished
            patchRef.current({ isPlaying: false, positionMs: 0, totalPositionMs: totalDurationMs });
          }
        }
      });

      patchRef.current({ isLoading: false, isPlaying: autoPlay });

    } catch (err) {
      console.warn(`[PodcastPlayer] Segment ${index} load error:`, err);
      patchRef.current({ isLoading: false });
      // Non-fatal: skip to next
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 300);
      }
    }
  };

  // Always keep ref pointing to the latest closure
  loadTurnRef.current = loadTurn;

  // ── Public controls ───────────────────────────────────────────────────────

  const startPlayback = useCallback(async () => {
    await loadTurnRef.current(0, true);
  }, []);

  const play = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.playAsync();
      patchRef.current({ isPlaying: true });
    } else {
      await loadTurnRef.current(currentIndexRef.current, true);
    }
  }, []);

  const pause = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
      patchRef.current({ isPlaying: false });
    }
  }, []);

  const togglePlayPause = useCallback(async () => {
    setState(prev => {
      // Read current playing state to decide action
      if (prev.isPlaying) {
        pause();
      } else {
        play();
      }
      return prev;
    });
  }, [play, pause]);

  const skipToTurn = useCallback(async (index: number) => {
    const turns = podcastRef.current?.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(index, turns.length - 1));
    // Preserve current play/pause intent
    const shouldPlay = !!(soundRef.current) || state.isPlaying;
    await loadTurnRef.current(clamped, shouldPlay);
  }, [state.isPlaying]);

  const skipNext = useCallback(async () => {
    const turns  = podcastRef.current?.script?.turns ?? [];
    const next   = currentIndexRef.current + 1;
    if (next < turns.length) {
      await loadTurnRef.current(next, state.isPlaying);
    }
  }, [state.isPlaying]);

  const skipPrevious = useCallback(async () => {
    // If > 2 s into current segment — restart it. Otherwise go to previous turn.
    if (state.positionMs > 2000 && soundRef.current) {
      await soundRef.current.setPositionAsync(0);
    } else {
      const prev = currentIndexRef.current - 1;
      if (prev >= 0) {
        await loadTurnRef.current(prev, state.isPlaying);
      }
    }
  }, [state.positionMs, state.isPlaying]);

  const setPlaybackRate = useCallback(async (rate: number) => {
    rateRef.current = rate;
    patchRef.current({ playbackRate: rate });
    if (soundRef.current) {
      await soundRef.current.setRateAsync(rate, true);
    }
  }, []);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    currentIndexRef.current = 0;
    patchRef.current({
      isPlaying: false, positionMs: 0,
      totalPositionMs: 0, currentTurnIndex: 0,
    });
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = useCallback((ms: number): string => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const minutes  = Math.floor(totalSec / 60);
    const seconds  = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const progressPercent = state.totalDurationMs > 0
    ? Math.min(1, state.totalPositionMs / state.totalDurationMs)
    : 0;

  const currentTurn = podcast?.script?.turns?.[state.currentTurnIndex] ?? null;

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
    stopPlayback,
    formatTime,
  };
}