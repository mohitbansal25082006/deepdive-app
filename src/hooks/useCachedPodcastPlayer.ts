// src/hooks/useCachedPodcastPlayer.ts
// Part 59.2 — Offline-aware. Return shape unchanged, so OfflinePodcastViewer
// needs no edits.
//
// WHAT WAS WRONG
//
//   1. checkAndLoadAudio() called verifyPodcastAudio(), which spot-checked
//      segment 0 at its STORED absolute path. In a release build that path
//      belongs to a previous container, so verification failed and the viewer
//      dropped to transcript-only even when every mp3 was on disk.
//
//   2. downloadAudio() contained `await import('../lib/podcastAudioCache')` in
//      its success branch. Under Hermes in a release bundle this can reject;
//      the copy had already succeeded, but the error handler ran, the UI showed
//      a failure, and checkAndLoadAudio() was never called — so the freshly
//      cached audio was not picked up until the screen was reopened.
//
//   3. Nothing distinguished "offline, and the source files are not on this
//      device" from "offline, but we can copy from the generation directory".
//      Both produced the same generic failure text.
//
// WHAT CHANGED
//
//   • Verification and path resolution go through the rebuilt-path cache API.
//   • All imports are static.
//   • The hook reads NetworkContext and passes allowRemote accordingly, so a
//     download while offline is a pure local copy and a download while online
//     can also pull anything missing from Supabase Storage.
//   • downloadState gains `phase` and `canDownload` (both optional additions;
//     existing consumers that only read isDownloading/progress/error still
//     compile unchanged).

import { useState, useEffect, useCallback, useRef } from 'react';

import type { Podcast } from '../types';
import type { AudioDownloadProgress, AudioDownloadPhase } from '../types/cache';
import { useNetwork } from '../context/NetworkContext';
import {
  getLocalAudioPaths,
  downloadPodcastAudio,
  getPodcastAudioDiskBytes,
} from '../lib/podcastAudioCache';
import { markPodcastAudioCached } from '../lib/cacheStorage';
import {
  resolvePodcastAudio,
  summarize,
  type AudioAvailability,
} from '../lib/offlineAudioResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedPlayerMode = 'loading' | 'audio' | 'transcript_only';

export interface CachedPlayerDownloadState {
  isDownloading:    boolean;
  progress:         number;    // 0-1
  segmentsComplete: number;
  segmentsTotal:    number;
  error:            string | null;
  /** Part 59.2 */
  phase?:           AudioDownloadPhase;
  /** Part 59.2: false when neither local files nor a connection can help. */
  canDownload?:     boolean;
  /** Part 59.2: true when the download will need no internet at all. */
  offlineCapable?:  boolean;
}

export interface UseCachedPodcastPlayerReturn {
  mode:             CachedPlayerMode;
  podcastWithLocal: Podcast | null;
  hasLocalAudio:    boolean;
  downloadState:    CachedPlayerDownloadState;
  downloadAudio:    () => Promise<void>;
  refresh:          () => Promise<void>;
  /** Part 59.2: what the resolver found, for diagnostics/UI. */
  availability:     AudioAvailability | null;
}

const INITIAL_DOWNLOAD_STATE: CachedPlayerDownloadState = {
  isDownloading:    false,
  progress:         0,
  segmentsComplete: 0,
  segmentsTotal:    0,
  error:            null,
  phase:            'idle',
  canDownload:      true,
  offlineCapable:   false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCachedPodcastPlayer(podcast: Podcast | null): UseCachedPodcastPlayerReturn {
  const { isOnline } = useNetwork();

  const [mode,             setMode]             = useState<CachedPlayerMode>('loading');
  const [podcastWithLocal, setPodcastWithLocal] = useState<Podcast | null>(null);
  const [hasLocalAudio,    setHasLocalAudio]    = useState(false);
  const [availability,     setAvailability]     = useState<AudioAvailability | null>(null);
  const [downloadState,    setDownloadState]    = useState<CachedPlayerDownloadState>(
    INITIAL_DOWNLOAD_STATE,
  );

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Look for usable audio ──────────────────────────────────────────────────

  const checkAndLoadAudio = useCallback(async () => {
    if (!podcast) {
      setMode('transcript_only');
      return;
    }

    if (!isMountedRef.current) return;
    setMode('loading');

    try {
      // 1. Already in the offline cache? Paths are rebuilt + verified for us.
      const cachedPaths = await getLocalAudioPaths(podcast.id);

      if (cachedPaths && cachedPaths.filter(Boolean).length > 0) {
        const turns = podcast.script?.turns ?? [];
        const patched: Podcast = {
          ...podcast,
          audioSegmentPaths: turns.map((_, i) => cachedPaths[i] ?? ''),
        };
        if (isMountedRef.current) {
          setPodcastWithLocal(patched);
          setHasLocalAudio(true);
          setMode('audio');
          setDownloadState(prev => ({ ...prev, canDownload: false, error: null }));
        }
        return;
      }

      // 2. Not cached. Are the generation files still on disk? If so we can
      //    play straight from them AND offer a one-tap offline copy.
      const segments = await resolvePodcastAudio(
        {
          id:          podcast.id,
          storedPaths: podcast.audioSegmentPaths ?? [],
          cloudUrls:   (podcast as { audioStorageUrls?: (string | null)[] }).audioStorageUrls ?? [],
          turnCount:   podcast.script?.turns?.length ?? 0,
        },
        { allowRemote: isOnline },
      );

      const avail = summarize(segments);
      if (isMountedRef.current) setAvailability(avail);

      if (avail.playableOffline) {
        // Playable right now from the generation directory. Hand the resolved
        // paths to the player so it never touches the stale stored ones.
        const patched: Podcast = {
          ...podcast,
          audioSegmentPaths: segments.map(s => (s.remote ? '' : s.uri)),
        };
        if (isMountedRef.current) {
          setPodcastWithLocal(patched);
          setHasLocalAudio(true);
          setMode('audio');
          setDownloadState(prev => ({
            ...prev,
            canDownload:    true,
            offlineCapable: true,
            error:          null,
          }));
        }
        return;
      }

      // 3. Transcript only. Say precisely why, and whether download can help.
      if (isMountedRef.current) {
        setPodcastWithLocal(podcast);
        setHasLocalAudio(false);
        setMode('transcript_only');
        setDownloadState(prev => ({
          ...prev,
          canDownload:    avail.localCount > 0 || (isOnline && avail.remoteCount > 0),
          offlineCapable: avail.localCount > 0,
          error:          null,
        }));
      }
    } catch (err) {
      console.warn('[useCachedPodcastPlayer] checkAndLoadAudio error:', err);
      if (isMountedRef.current) {
        setPodcastWithLocal(podcast);
        setHasLocalAudio(false);
        setMode('transcript_only');
      }
    }
  }, [podcast?.id, isOnline]);

  useEffect(() => {
    void checkAndLoadAudio();
  }, [checkAndLoadAudio]);

  // ── Manual download ────────────────────────────────────────────────────────
  //
  // Deliberately NOT gated on the "Cache Podcast Audio" setting. That toggle
  // governs automatic caching; a user tapping this button has asked for this
  // episode specifically.

  const downloadAudio = useCallback(async () => {
    if (!podcast || downloadState.isDownloading) return;
    if (!isMountedRef.current) return;

    const total = podcast.script?.turns?.length ?? podcast.audioSegmentPaths?.length ?? 0;

    setDownloadState({
      isDownloading:    true,
      progress:         0,
      segmentsComplete: 0,
      segmentsTotal:    total,
      error:            null,
      phase:            'resolving',
      canDownload:      true,
      offlineCapable:   availability?.localCount ? availability.localCount > 0 : false,
    });

    try {
      const onProgress = (p: AudioDownloadProgress) => {
        if (!isMountedRef.current) return;
        const denom = p.segmentsTotal || 1;
        setDownloadState(prev => ({
          ...prev,
          progress:         p.segmentsComplete / denom,
          segmentsComplete: p.segmentsComplete,
          segmentsTotal:    p.segmentsTotal,
          phase:            p.phase ?? prev.phase,
          offlineCapable:   p.offlineOnly ?? prev.offlineCapable,
        }));
      };

      const success = await downloadPodcastAudio(podcast, onProgress, {
        // Offline: local copy only, and fail fast with a clear message rather
        // than waiting out a network timeout that cannot succeed.
        allowRemote: isOnline,
      });

      if (!isMountedRef.current) return;

      if (success) {
        // Record the real size. Static import — the dynamic one here used to
        // reject in release builds and swallow a successful download.
        const bytes = await getPodcastAudioDiskBytes(podcast.id);
        if (bytes > 0) await markPodcastAudioCached(podcast.id, bytes);

        setDownloadState({ ...INITIAL_DOWNLOAD_STATE, phase: 'done', canDownload: false });
        await checkAndLoadAudio();
        return;
      }

      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        phase:         'error',
        error: isOnline
          ? 'Some audio segments could not be saved. The transcript is still available.'
          : 'Audio files are not on this device. Connect to the internet once to download them.',
      }));
    } catch (err) {
      if (!isMountedRef.current) return;
      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        phase:         'error',
        error: err instanceof Error ? err.message : 'Audio download failed',
      }));
    }
  }, [podcast, downloadState.isDownloading, isOnline, availability, checkAndLoadAudio]);

  return {
    mode,
    podcastWithLocal,
    hasLocalAudio,
    downloadState,
    downloadAudio,
    refresh: checkAndLoadAudio,
    availability,
  };
}