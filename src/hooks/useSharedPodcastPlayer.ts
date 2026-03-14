// src/hooks/useSharedPodcastPlayer.ts
// Part 15 UPDATED — Supports streaming audio from Supabase Storage HTTPS URLs.
//
// KEY CHANGES:
//   • isAudioPlayable() now returns true for https:// URLs (expo-av streams them)
//   • Audio loading accepts both local file:/// paths AND https:// URLs
//   • hasAudio check updated: any non-empty path (local OR cloud) counts
//   • Download/export: concatenates segments from cloud URLs by fetching them

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert }                                      from 'react-native';
import { Audio }                                      from 'expo-av';

import { getSharedPodcastForWorkspace }  from '../services/podcastSharingService';
import {
  trackPodcastPlay,
  trackPodcastDownload,
  sharedPodcastToPodcast,
}                                        from '../services/podcastSharingService';
import { isAudioPlayable }               from '../services/podcastAudioUploadService';
import { exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard }
                                         from '../services/podcastExport';
import { SharedPodcast, Podcast, PodcastTurn, PodcastPlayerState } from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

export interface SharedPodcastPlayerState {
  isLoadingPodcast: boolean;
  loadError:        string | null;
  sharedPodcast:    SharedPodcast | null;
  podcast:          Podcast | null;
  hasAudio:         boolean;
  player:           PodcastPlayerState;
  isExporting:      boolean;
  exportError:      string | null;
}

const INITIAL_PLAYER_STATE: PodcastPlayerState = {
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

const INITIAL_STATE: SharedPodcastPlayerState = {
  isLoadingPodcast: true,
  loadError:        null,
  sharedPodcast:    null,
  podcast:          null,
  hasAudio:         false,
  player:           INITIAL_PLAYER_STATE,
  isExporting:      false,
  exportError:      null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSharedPodcastPlayer(
  workspaceId: string | null | undefined,
  sharedId:    string | null | undefined,
) {
  const [state, setState] = useState<SharedPodcastPlayerState>(INITIAL_STATE);

  const soundRef        = useRef<Audio.Sound | null>(null);
  const isUnmountedRef  = useRef(false);
  const currentIndexRef = useRef(0);
  const rateRef         = useRef(1.0);
  const podcastRef      = useRef<Podcast | null>(null);
  const loadTurnRef     = useRef<(idx: number, autoPlay: boolean) => Promise<void>>(
    async () => {}
  );
  const playTrackedRef  = useRef(false);

  const patch = useCallback((partial: Partial<SharedPodcastPlayerState>) => {
    if (!isUnmountedRef.current) setState(prev => ({ ...prev, ...partial }));
  }, []);

  const patchPlayer = useCallback((partial: Partial<PodcastPlayerState>) => {
    if (!isUnmountedRef.current) {
      setState(prev => ({ ...prev, player: { ...prev.player, ...partial } }));
    }
  }, []);

  // ── Audio session ─────────────────────────────────────────────────────────

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

  // ── Load shared podcast row ───────────────────────────────────────────────

  const loadPodcast = useCallback(async () => {
    if (!workspaceId || !sharedId) return;

    patch({
      isLoadingPodcast: true,
      loadError:        null,
      sharedPodcast:    null,
      podcast:          null,
      hasAudio:         false,
      player:           INITIAL_PLAYER_STATE,
    });

    playTrackedRef.current = false;

    const { data: sp, error } = await getSharedPodcastForWorkspace(workspaceId, sharedId);

    if (error || !sp) {
      patch({ isLoadingPodcast: false, loadError: error ?? 'Podcast not found.' });
      return;
    }

    const podcast = sharedPodcastToPodcast(sp);
    podcastRef.current = podcast;

    // Check audio availability:
    // - HTTPS URLs → always playable (expo-av streams them)
    // - Local file:/// → check if exists on this device
    const paths = sp.audioSegmentPaths.filter(Boolean);
    let hasAudio = false;

    if (paths.length > 0) {
      // Check the first segment to determine if audio is available
      hasAudio = await isAudioPlayable(paths[0]);
    }

    const turns         = podcast.script?.turns ?? [];
    const totalDuration = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

    patch({
      isLoadingPodcast: false,
      sharedPodcast:    sp,
      podcast,
      hasAudio,
      player: { ...INITIAL_PLAYER_STATE, totalDurationMs: totalDuration },
    });
  }, [workspaceId, sharedId, patch]);

  useEffect(() => { loadPodcast(); }, [loadPodcast]);

  // ── Core audio loader — supports both local and HTTPS ─────────────────────

  const loadTurn = async (index: number, autoPlay: boolean): Promise<void> => {
    const p = podcastRef.current;
    if (!p) return;

    const turns = p.script?.turns ?? [];
    if (index < 0 || index >= turns.length) return;

    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    if (isUnmountedRef.current) return;

    currentIndexRef.current = index;
    patchPlayer({ currentTurnIndex: index, isLoading: true, positionMs: 0 });

    const turn      = turns[index];
    const audioPath = p.audioSegmentPaths?.[index] ?? '';

    if (!audioPath) {
      patchPlayer({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    // Check playability:
    // HTTPS → always true; local path → check file exists
    const playable = await isAudioPlayable(audioPath);
    if (!playable) {
      patchPlayer({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioPath },
        {
          shouldPlay:                   autoPlay,
          rate:                         rateRef.current,
          progressUpdateIntervalMillis: 250,
          shouldCorrectPitch:           true,
        },
      );

      if (isUnmountedRef.current) { await sound.unloadAsync(); return; }
      soundRef.current = sound;

      const totalDurationMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
      const cumulativeMs    = turns.slice(0, index).reduce((s, t) => s + (t.durationMs ?? 0), 0);

      // Track first play
      if (autoPlay && index === 0 && !playTrackedRef.current) {
        playTrackedRef.current = true;
        setState(prev => {
          if (prev.sharedPodcast) trackPodcastPlay(prev.sharedPodcast.id);
          return prev;
        });
      }

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded || isUnmountedRef.current) return;

        const posMs = status.positionMillis ?? 0;
        const durMs = status.durationMillis ?? (turn.durationMs ?? 0);

        patchPlayer({
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
            patchPlayer({ isPlaying: false, positionMs: 0, totalPositionMs: totalDurationMs });
          }
        }
      });

      patchPlayer({ isLoading: false, isPlaying: autoPlay });

    } catch (err) {
      console.warn(`[SharedPodcastPlayer] turn ${index} error:`, err);
      patchPlayer({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 300);
      }
    }
  };

  loadTurnRef.current = loadTurn;

  // ── Playback controls ─────────────────────────────────────────────────────

  const startPlayback = useCallback(async () => {
    await loadTurnRef.current(0, true);
  }, []);

  const play = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.playAsync();
      patchPlayer({ isPlaying: true });
    } else {
      await loadTurnRef.current(currentIndexRef.current, true);
    }
  }, [patchPlayer]);

  const pause = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
      patchPlayer({ isPlaying: false });
    }
  }, [patchPlayer]);

  const togglePlayPause = useCallback(async () => {
    setState(prev => {
      if (prev.player.isPlaying) pause();
      else play();
      return prev;
    });
  }, [play, pause]);

  const skipToTurn = useCallback(async (index: number) => {
    const turns   = podcastRef.current?.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(index, turns.length - 1));
    setState(prev => {
      loadTurnRef.current(clamped, prev.player.isPlaying || prev.player.positionMs > 0);
      return prev;
    });
  }, []);

  const skipNext = useCallback(async () => {
    const turns = podcastRef.current?.script?.turns ?? [];
    const next  = currentIndexRef.current + 1;
    if (next < turns.length) {
      setState(prev => {
        loadTurnRef.current(next, prev.player.isPlaying);
        return prev;
      });
    }
  }, []);

  const skipPrevious = useCallback(async () => {
    setState(prev => {
      if (prev.player.positionMs > 2000 && soundRef.current) {
        soundRef.current.setPositionAsync(0);
      } else {
        const idx = currentIndexRef.current - 1;
        if (idx >= 0) loadTurnRef.current(idx, prev.player.isPlaying);
      }
      return prev;
    });
  }, []);

  const setPlaybackRate = useCallback(async (rate: number) => {
    rateRef.current = rate;
    patchPlayer({ playbackRate: rate });
    if (soundRef.current) await soundRef.current.setRateAsync(rate, true);
  }, [patchPlayer]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    currentIndexRef.current = 0;
    patchPlayer({ isPlaying: false, positionMs: 0, totalPositionMs: 0, currentTurnIndex: 0 });
  }, [patchPlayer]);

  // ── Export actions ────────────────────────────────────────────────────────

  const downloadMP3 = useCallback(async () => {
    const podcast = state.podcast;
    if (!podcast || state.isExporting) return;

    patch({ isExporting: true, exportError: null });
    try {
      await exportPodcastAsMP3(podcast);
      if (state.sharedPodcast) {
        await trackPodcastDownload(state.sharedPodcast.id);
        setState(prev => ({
          ...prev,
          sharedPodcast: prev.sharedPodcast
            ? { ...prev.sharedPodcast, downloadCount: prev.sharedPodcast.downloadCount + 1 }
            : null,
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      patch({ exportError: msg });
      Alert.alert('Export Error', msg);
    } finally {
      patch({ isExporting: false });
    }
  }, [state.podcast, state.sharedPodcast, state.isExporting, patch]);

  const downloadPDF = useCallback(async () => {
    const podcast = state.podcast;
    if (!podcast || state.isExporting) return;

    patch({ isExporting: true, exportError: null });
    try {
      await exportPodcastAsPDF(podcast);
      if (state.sharedPodcast) {
        await trackPodcastDownload(state.sharedPodcast.id);
        setState(prev => ({
          ...prev,
          sharedPodcast: prev.sharedPodcast
            ? { ...prev.sharedPodcast, downloadCount: prev.sharedPodcast.downloadCount + 1 }
            : null,
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed';
      patch({ exportError: msg });
      Alert.alert('Export Error', msg);
    } finally {
      patch({ isExporting: false });
    }
  }, [state.podcast, state.sharedPodcast, state.isExporting, patch]);

  const copyScript = useCallback(async (): Promise<boolean> => {
    const podcast = state.podcast;
    if (!podcast) return false;
    try {
      await copyPodcastScriptToClipboard(podcast);
      return true;
    } catch {
      return false;
    }
  }, [state.podcast]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = useCallback((ms: number): string => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const minutes  = Math.floor(totalSec / 60);
    const seconds  = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const progressPercent = state.player.totalDurationMs > 0
    ? Math.min(1, state.player.totalPositionMs / state.player.totalDurationMs)
    : 0;

  const currentTurn: PodcastTurn | null =
    state.podcast?.script?.turns?.[state.player.currentTurnIndex] ?? null;

  return {
    state,
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
    downloadMP3,
    downloadPDF,
    copyScript,
    formatTime,
    reload: loadPodcast,
  };
}