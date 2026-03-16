// src/hooks/useCachedPodcastPlayer.ts
// Part 23 — Offline-capable podcast player hook.
//
// Wraps the existing usePodcastPlayer hook but:
//   1. Checks if audio is locally cached (getLocalAudioPaths)
//   2. If cached: injects local file:/// paths into the podcast object
//   3. If NOT cached: shows transcript-only mode (no audio playback)
//   4. Exposes downloadAudio() to let user cache audio on-demand
//
// This hook is used exclusively in OfflinePodcastViewer — the online
// podcast-player.tsx continues to use usePodcastPlayer directly.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Podcast } from '../types';
import {
  getLocalAudioPaths,
  isPodcastAudioCached,
  downloadPodcastAudio,
  verifyPodcastAudio,
} from '../lib/podcastAudioCache';
import {
  markPodcastAudioCached,
  getCachedPodcast,
} from '../lib/cacheStorage';
import type { AudioDownloadProgress } from '../types/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedPlayerMode = 'loading' | 'audio' | 'transcript_only';

export interface CachedPlayerDownloadState {
  isDownloading:    boolean;
  progress:         number;    // 0-1
  segmentsComplete: number;
  segmentsTotal:    number;
  error:            string | null;
}

export interface UseCachedPodcastPlayerReturn {
  /** Which mode we're in */
  mode:               CachedPlayerMode;
  /** Podcast data with local audio paths injected (if mode === 'audio') */
  podcastWithLocal:   Podcast | null;
  /** Whether audio is available for this podcast */
  hasLocalAudio:      boolean;
  /** Download state for on-demand audio caching */
  downloadState:      CachedPlayerDownloadState;
  /** Download audio segments for offline playback */
  downloadAudio:      () => Promise<void>;
  /** Reload: re-check if audio is now available */
  refresh:            () => Promise<void>;
}

const INITIAL_DOWNLOAD_STATE: CachedPlayerDownloadState = {
  isDownloading:    false,
  progress:         0,
  segmentsComplete: 0,
  segmentsTotal:    0,
  error:            null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCachedPodcastPlayer(podcast: Podcast | null): UseCachedPodcastPlayerReturn {
  const [mode,             setMode]             = useState<CachedPlayerMode>('loading');
  const [podcastWithLocal, setPodcastWithLocal] = useState<Podcast | null>(null);
  const [hasLocalAudio,    setHasLocalAudio]    = useState(false);
  const [downloadState,    setDownloadState]    = useState<CachedPlayerDownloadState>(INITIAL_DOWNLOAD_STATE);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Check local audio on mount / podcast change ────────────────────────────

  const checkAndLoadAudio = useCallback(async () => {
    if (!podcast) {
      setMode('transcript_only');
      return;
    }

    if (!isMountedRef.current) return;
    setMode('loading');

    try {
      // First verify files actually exist on disk (not just indexed)
      const verified = await verifyPodcastAudio(podcast.id);

      if (verified) {
        const localPaths = await getLocalAudioPaths(podcast.id);

        if (localPaths && localPaths.filter(Boolean).length > 0) {
          // Inject local paths into a copy of the podcast
          const turns   = podcast.script?.turns ?? [];
          const patched: Podcast = {
            ...podcast,
            audioSegmentPaths: turns.map((_, i) => localPaths[i] ?? ''),
          };

          if (isMountedRef.current) {
            setPodcastWithLocal(patched);
            setHasLocalAudio(true);
            setMode('audio');
          }
          return;
        }
      }

      // No audio cached — transcript only mode
      if (isMountedRef.current) {
        setPodcastWithLocal(podcast);
        setHasLocalAudio(false);
        setMode('transcript_only');
      }
    } catch (err) {
      console.warn('[useCachedPodcastPlayer] checkAndLoadAudio error:', err);
      if (isMountedRef.current) {
        setPodcastWithLocal(podcast);
        setHasLocalAudio(false);
        setMode('transcript_only');
      }
    }
  }, [podcast?.id]);

  useEffect(() => {
    checkAndLoadAudio();
  }, [checkAndLoadAudio]);

  // ── On-demand audio download ───────────────────────────────────────────────

  const downloadAudio = useCallback(async () => {
    if (!podcast || downloadState.isDownloading) return;

    if (!isMountedRef.current) return;

    setDownloadState({
      isDownloading:    true,
      progress:         0,
      segmentsComplete: 0,
      segmentsTotal:    podcast.script?.turns?.length ?? 0,
      error:            null,
    });

    try {
      const onProgress = (p: AudioDownloadProgress) => {
        if (!isMountedRef.current) return;
        const total    = p.segmentsTotal || 1;
        const progress = p.segmentsComplete / total;
        setDownloadState(prev => ({
          ...prev,
          progress,
          segmentsComplete: p.segmentsComplete,
          segmentsTotal:    p.segmentsTotal,
        }));
      };

      const success = await downloadPodcastAudio(podcast, onProgress);

      if (!isMountedRef.current) return;

      if (success) {
        // Update cache entry to reflect audio is now cached
        try {
          const { getPodcastAudioEntry } = await import('../lib/podcastAudioCache');
          const audioEntry = await getPodcastAudioEntry(podcast.id);
          if (audioEntry) {
            await markPodcastAudioCached(podcast.id, audioEntry.totalBytes);
          }
        } catch {}

        setDownloadState({ ...INITIAL_DOWNLOAD_STATE });
        // Re-check to inject local paths
        await checkAndLoadAudio();
      } else {
        setDownloadState(prev => ({
          ...prev,
          isDownloading: false,
          error: 'Some audio segments could not be downloaded. Transcript is still available.',
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audio download failed';
      if (isMountedRef.current) {
        setDownloadState(prev => ({
          ...prev,
          isDownloading: false,
          error: msg,
        }));
      }
    }
  }, [podcast, downloadState.isDownloading, checkAndLoadAudio]);

  return {
    mode,
    podcastWithLocal,
    hasLocalAudio,
    downloadState,
    downloadAudio,
    refresh: checkAndLoadAudio,
  };
}