// src/hooks/useSharedPodcastPlayer.ts
// Part 41 UPDATE — Two fixes:
//
// FIX 1: Mini player navigates back to workspace-shared-podcast-player
//   After startPlayback() we call AudioEngine.setSourceScreen() with the
//   workspace-shared-podcast-player pathname and { workspaceId, sharedId,
//   contentTitle } params. MiniPlayer reads this and navigates correctly
//   instead of opening podcast-player (which the workspace member can't use).
//
// FIX 2: Expose workspaceId for Video Mode
//   Added workspaceId to the return value so workspace-shared-podcast-player
//   can pass it to the new get_shared_podcast_full_for_workspace RPC call
//   made inside podcast-video-player.
//
// Everything else is identical to the Part 41 version in workspace-shared-podcast-player.tsx.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert }                                      from 'react-native';

import { getSharedPodcastForWorkspace }  from '../services/podcastSharingService';
import {
  trackPodcastPlay,
  trackPodcastDownload,
  sharedPodcastToPodcast,
}                                        from '../services/podcastSharingService';
import { isAudioPlayable }               from '../services/podcastAudioUploadService';
import { exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard }
                                         from '../services/podcastExport';
import {
  AudioEngine,
  subscribeToEngine,
  getEngineState,
  type EngineState,
}                                        from '../services/GlobalAudioEngine';
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function engineToPlayerState(es: EngineState): PodcastPlayerState {
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

export function useSharedPodcastPlayer(
  workspaceId: string | null | undefined,
  sharedId:    string | null | undefined,
  /** Optional title shown in mini player and passed back for navigation */
  contentTitle?: string,
) {
  const [state, setState] = useState<SharedPodcastPlayerState>(INITIAL_STATE);

  const isUnmountedRef   = useRef(false);
  const playTrackedRef   = useRef(false);
  const podcastRef       = useRef<Podcast | null>(null);
  const sharedPodcastRef = useRef<SharedPodcast | null>(null);

  const patch = useCallback((partial: Partial<SharedPodcastPlayerState>) => {
    if (!isUnmountedRef.current) setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Subscribe to GlobalAudioEngine ────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToEngine((es: EngineState) => {
      if (isUnmountedRef.current) return;

      const ourPodcastId = podcastRef.current?.id;
      if (!ourPodcastId || es.podcastId !== ourPodcastId) return;

      // Track first play
      if (es.isPlaying && !playTrackedRef.current && sharedPodcastRef.current) {
        playTrackedRef.current = true;
        trackPodcastPlay(sharedPodcastRef.current.id);
      }

      setState(prev => ({
        ...prev,
        player: engineToPlayerState(es),
      }));
    });

    return unsub;
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => { isUnmountedRef.current = true; };
  }, []);

  // ── Load shared podcast ────────────────────────────────────────────────────

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
    podcastRef.current       = podcast;
    sharedPodcastRef.current = sp;

    const paths = sp.audioSegmentPaths.filter(Boolean);
    let hasAudio = false;

    if (paths.length > 0) {
      hasAudio = await isAudioPlayable(paths[0]);
    }

    const turns         = podcast.script?.turns ?? [];
    const totalDuration = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

    if (AudioEngine.isActiveFor(podcast.id)) {
      await AudioEngine.reattach(podcast);
      patch({
        isLoadingPodcast: false,
        sharedPodcast:    sp,
        podcast,
        hasAudio,
        player: engineToPlayerState(getEngineState()),
      });
      return;
    }

    patch({
      isLoadingPodcast: false,
      sharedPodcast:    sp,
      podcast,
      hasAudio,
      player: { ...INITIAL_PLAYER_STATE, totalDurationMs: totalDuration },
    });
  }, [workspaceId, sharedId, patch]);

  useEffect(() => { loadPodcast(); }, [loadPodcast]);

  // ── Playback controls ─────────────────────────────────────────────────────

  /**
   * Start playback and register the workspace player as the source screen
   * so the MiniPlayer navigates back here (not to podcast-player).
   */
  const startPlayback = useCallback(async () => {
    const podcast = podcastRef.current;
    if (!podcast || !workspaceId || !sharedId) return;

    // Register source screen BEFORE starting so mini player has it immediately
    AudioEngine.setSourceScreen(
      '/(app)/workspace-shared-podcast-player',
      {
        workspaceId:  workspaceId,
        sharedId:     sharedId,
        contentTitle: contentTitle ?? podcast.title,
      },
    );

    await AudioEngine.startPodcast(podcast, 0);
  }, [workspaceId, sharedId, contentTitle]);

  const togglePlayPause = useCallback(async () => {
    await AudioEngine.toggle();
  }, []);

  const skipToTurn = useCallback(async (index: number) => {
    await AudioEngine.skipToTurn(index);
  }, []);

  const skipNext = useCallback(async () => {
    await AudioEngine.skipNext();
  }, []);

  const skipPrevious = useCallback(async () => {
    await AudioEngine.skipPrevious();
  }, []);

  const setPlaybackRate = useCallback(async (rate: number) => {
    await AudioEngine.setRate(rate);
  }, []);

  const stopPlayback = useCallback(async () => {
    await AudioEngine.stop();
    patch({ player: INITIAL_PLAYER_STATE });
  }, [patch]);

  /**
   * detachScreen — keep audio running in the engine (mini player continues).
   * The source screen is already registered so MiniPlayer knows where to navigate.
   */
  const detachScreen = useCallback(() => {
    AudioEngine.detach();
  }, []);

  // ── Export actions ────────────────────────────────────────────────────────

  const downloadMP3 = useCallback(async () => {
    const podcast       = state.podcast;
    const sharedPodcast = state.sharedPodcast;
    if (!podcast || state.isExporting) return;

    patch({ isExporting: true, exportError: null });
    try {
      await exportPodcastAsMP3(podcast);
      if (sharedPodcast) {
        await trackPodcastDownload(sharedPodcast.id);
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
    const podcast       = state.podcast;
    const sharedPodcast = state.sharedPodcast;
    if (!podcast || state.isExporting) return;

    patch({ isExporting: true, exportError: null });
    try {
      await exportPodcastAsPDF(podcast);
      if (sharedPodcast) {
        await trackPodcastDownload(sharedPodcast.id);
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
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
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
    togglePlayPause,
    skipToTurn,
    skipNext,
    skipPrevious,
    setPlaybackRate,
    stopPlayback,
    detachScreen,
    downloadMP3,
    downloadPDF,
    copyScript,
    formatTime,
    reload: loadPodcast,
    /** Exposed so workspace-shared-podcast-player can pass to video mode RPC */
    workspaceId: workspaceId ?? null,
  };
}