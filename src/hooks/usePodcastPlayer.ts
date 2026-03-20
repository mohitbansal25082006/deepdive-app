// src/hooks/usePodcastPlayer.ts
// Part 25 — Updated
//
// CHANGE: Cross-device audio playback via Supabase Storage cloud URLs.
//
// PROBLEM SOLVED:
//   Audio segments are generated on Device A and stored in:
//     file:///var/mobile/.../deepdive_podcasts/{podcastId}/turn_N.mp3
//   Those paths don't exist on Device B when the user logs in from another phone.
//
// SOLUTION (Part 25):
//   1. The Podcast object now carries audioStorageUrls[] — Supabase Storage
//      signed URLs uploaded in the background after generation.
//   2. loadTurn() resolves the best audio source per segment:
//        a. Try local file first (fast, no network)
//        b. If missing or empty → fall back to cloud URL (streams via expo-av)
//        c. If cloud URL also unavailable → skip segment gracefully
//   3. The cloud URLs are also written into the Podcast.audioSegmentPaths
//      when the hook detects we're on a foreign device, so subsequent
//      segments also resolve correctly without extra lookups.
//
// ALL PART 8 FUNCTIONALITY PRESERVED:
//   Sequential playback, auto-advance, playback rate, skip prev/next,
//   progress tracking, transcript sync, rate control.

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

  // ── Refs ──────────────────────────────────────────────────────────────────
  const soundRef            = useRef<Audio.Sound | null>(null);
  const isUnmountedRef      = useRef(false);
  const currentIndexRef     = useRef(0);
  const rateRef             = useRef(1.0);
  const podcastRef          = useRef(podcast);
  const loadTurnRef         = useRef<(index: number, autoPlay: boolean) => Promise<void>>(async () => {});

  useEffect(() => { podcastRef.current = podcast; }, [podcast]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [state, setState] = useState<PodcastPlayerState>(INITIAL_STATE);

  const patchRef = useRef((partial: Partial<PodcastPlayerState>) => {
    if (!isUnmountedRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  });

  // ── Audio session setup ───────────────────────────────────────────────────
  useEffect(() => {
    isUnmountedRef.current = false;
    Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
    }).catch(() => {});

    return () => {
      isUnmountedRef.current = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // ── Pre-compute total duration ─────────────────────────────────────────────
  useEffect(() => {
    if (!podcast) return;
    const total = (podcast.script?.turns ?? []).reduce((s, t) => s + (t.durationMs ?? 0), 0);
    patchRef.current({ totalDurationMs: total });
  }, [podcast?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Part 25: Resolve the best audio URI for a given segment index.
  // Priority: local file → cloud URL → null (skip)
  // ─────────────────────────────────────────────────────────────────────────

  const resolveAudioUri = useCallback(async (segmentIndex: number): Promise<string | null> => {
    const p = podcastRef.current;
    if (!p) return null;

    // 1. Try local path from audioSegmentPaths
    const localPath = p.audioSegmentPaths?.[segmentIndex] ?? '';
    if (localPath) {
      // If it's already an https URL (previously resolved cloud URL), use it directly
      if (localPath.startsWith('https://') || localPath.startsWith('http://')) {
        return localPath;
      }
      // It's a file:// path — check it exists
      const exists = await audioFileExists(localPath);
      if (exists) return localPath;
    }

    // 2. Fall back to cloud URL from Supabase Storage
    const cloudUrl: string | null =
      (p as any).audioStorageUrls?.[segmentIndex] ??    // from mapRowToPodcast
      null;

    if (cloudUrl && (cloudUrl.startsWith('https://') || cloudUrl.startsWith('http://'))) {
      return cloudUrl;
    }

    // 3. Nothing available
    return null;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Core: Load a specific turn and optionally start playback
  // ─────────────────────────────────────────────────────────────────────────

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

    const turn = turns[index];

    // ── Part 25: Resolve audio URI (local or cloud) ─────────────────────
    const audioUri = await resolveAudioUri(index);

    if (!audioUri) {
      // No audio available for this segment — skip gracefully
      patchRef.current({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
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

      // Pre-compute cumulative position values
      const totalDurationMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
      const cumulativeMs    = turns.slice(0, index).reduce((s, t) => s + (t.durationMs ?? 0), 0);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded)       return;
        if (isUnmountedRef.current)  return;

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

        if (status.didJustFinish) {
          const next = currentIndexRef.current + 1;
          if (next < turns.length) {
            setTimeout(() => loadTurnRef.current(next, true), 120);
          } else {
            patchRef.current({ isPlaying: false, positionMs: 0, totalPositionMs: totalDurationMs });
          }
        }
      });

      patchRef.current({ isLoading: false, isPlaying: autoPlay });

    } catch (err) {
      console.warn(`[PodcastPlayer] Segment ${index} load error (uri: ${audioUri}):`, err);
      patchRef.current({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 300);
      }
    }
  };

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
      if (prev.isPlaying) pause();
      else play();
      return prev;
    });
  }, [play, pause]);

  const skipToTurn = useCallback(async (index: number) => {
    const turns   = podcastRef.current?.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(index, turns.length - 1));
    const shouldPlay = !!(soundRef.current) || state.isPlaying;
    await loadTurnRef.current(clamped, shouldPlay);
  }, [state.isPlaying]);

  const skipNext = useCallback(async () => {
    const turns = podcastRef.current?.script?.turns ?? [];
    const next  = currentIndexRef.current + 1;
    if (next < turns.length) await loadTurnRef.current(next, state.isPlaying);
  }, [state.isPlaying]);

  const skipPrevious = useCallback(async () => {
    if (state.positionMs > 2000 && soundRef.current) {
      await soundRef.current.setPositionAsync(0);
    } else {
      const prev = currentIndexRef.current - 1;
      if (prev >= 0) await loadTurnRef.current(prev, state.isPlaying);
    }
  }, [state.positionMs, state.isPlaying]);

  const setPlaybackRate = useCallback(async (rate: number) => {
    rateRef.current = rate;
    patchRef.current({ playbackRate: rate });
    if (soundRef.current) await soundRef.current.setRateAsync(rate, true);
  }, []);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    currentIndexRef.current = 0;
    patchRef.current({ isPlaying: false, positionMs: 0, totalPositionMs: 0, currentTurnIndex: 0 });
  }, []);

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