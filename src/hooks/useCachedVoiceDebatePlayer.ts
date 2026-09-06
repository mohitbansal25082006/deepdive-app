// src/hooks/useCachedVoiceDebatePlayer.ts
// Part 59.2 — NEW. The voice-debate counterpart of useCachedPodcastPlayer.
//
// WHY THIS EXISTS
//
//   OfflineVoiceDebateViewer did its audio check inline: it probed
//   audioSegmentPaths[0] with audioFileExists(), then fell back to
//   getLocalVoiceDebateAudioPaths(). Both of those read stored absolute paths,
//   so in a release build both failed and the viewer showed "Audio not
//   available offline" with no way forward — the notice literally told the user
//   to go back online and turn on a setting.
//
//   Podcasts at least had a Download button. Voice debates had nothing. This
//   hook gives them the same capability and the same offline-first semantics:
//   if the generation files are on disk, one tap copies them into the cache,
//   with no network involved.

import { useState, useEffect, useCallback, useRef } from 'react';

import type { VoiceDebate } from '../types/voiceDebate';
import { useNetwork } from '../context/NetworkContext';
import {
  getLocalVoiceDebateAudioPaths,
  downloadVoiceDebateAudio,
  getVoiceDebateAudioDiskBytes,
  type AudioDownloadProgress,
} from '../lib/voiceDebateAudioCache';
import { markVoiceDebateAudioCached } from '../lib/cacheStorage';
import {
  resolveVoiceDebateAudio,
  summarize,
  type AudioAvailability,
} from '../lib/offlineAudioResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedVDMode = 'loading' | 'audio' | 'transcript_only';

export interface VDDownloadState {
  isDownloading:    boolean;
  progress:         number;   // 0-1
  segmentsComplete: number;
  segmentsTotal:    number;
  error:            string | null;
  phase:            'idle' | 'resolving' | 'copying' | 'downloading' | 'done' | 'error';
  /** False when neither local files nor a connection can produce audio. */
  canDownload:      boolean;
  /** True when the copy needs no internet at all. */
  offlineCapable:   boolean;
}

export interface UseCachedVoiceDebatePlayerReturn {
  mode:                 CachedVDMode;
  /** VoiceDebate with verified, currently-valid local paths injected. */
  voiceDebateWithLocal: VoiceDebate | null;
  hasLocalAudio:        boolean;
  availability:         AudioAvailability | null;
  downloadState:        VDDownloadState;
  downloadAudio:        () => Promise<void>;
  refresh:              () => Promise<void>;
}

const INITIAL: VDDownloadState = {
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

export function useCachedVoiceDebatePlayer(
  voiceDebate: VoiceDebate | null,
): UseCachedVoiceDebatePlayerReturn {
  const { isOnline } = useNetwork();

  const [mode,          setMode]          = useState<CachedVDMode>('loading');
  const [patched,       setPatched]       = useState<VoiceDebate | null>(null);
  const [hasLocalAudio, setHasLocalAudio] = useState(false);
  const [availability,  setAvailability]  = useState<AudioAvailability | null>(null);
  const [downloadState, setDownloadState] = useState<VDDownloadState>(INITIAL);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Resolve ────────────────────────────────────────────────────────────────

  const check = useCallback(async () => {
    if (!voiceDebate) {
      setMode('transcript_only');
      return;
    }

    if (!mountedRef.current) return;
    setMode('loading');

    const turnCount =
      voiceDebate.script?.turns?.length ??
      voiceDebate.totalTurns ??
      (voiceDebate.audioSegmentPaths?.length ?? 0);

    try {
      // 1. Offline cache — already rebuilt and verified by the cache module.
      const cachedPaths = await getLocalVoiceDebateAudioPaths(voiceDebate.id);
      if (cachedPaths && cachedPaths.filter(Boolean).length > 0) {
        if (mountedRef.current) {
          setPatched({ ...voiceDebate, audioSegmentPaths: cachedPaths });
          setHasLocalAudio(true);
          setMode('audio');
          setDownloadState(prev => ({ ...prev, canDownload: false, error: null }));
        }
        return;
      }

      // 2. Generation directory / rebased stored paths / cloud.
      const segments = await resolveVoiceDebateAudio(
        {
          id:          voiceDebate.id,
          storedPaths: voiceDebate.audioSegmentPaths ?? [],
          cloudUrls:   voiceDebate.audioStorageUrls ?? [],
          turnCount,
        },
        { allowRemote: isOnline },
      );

      const avail = summarize(segments);
      if (mountedRef.current) setAvailability(avail);

      const usable = avail.playableOffline || (isOnline && avail.remoteCount > 0);

      if (usable) {
        if (mountedRef.current) {
          setPatched({
            ...voiceDebate,
            audioSegmentPaths: segments.map(s => s.uri || ''),
          });
          setHasLocalAudio(true);
          setMode('audio');
          setDownloadState(prev => ({
            ...prev,
            canDownload:    avail.localCount < avail.total || avail.remoteCount > 0,
            offlineCapable: avail.localCount > 0,
            error:          null,
          }));
        }
        return;
      }

      if (mountedRef.current) {
        setPatched(voiceDebate);
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
      console.warn('[useCachedVoiceDebatePlayer] check error:', err);
      if (mountedRef.current) {
        setPatched(voiceDebate);
        setHasLocalAudio(false);
        setMode('transcript_only');
      }
    }
  }, [voiceDebate?.id, isOnline]);

  useEffect(() => {
    void check();
  }, [check]);

  // ── Manual download ────────────────────────────────────────────────────────

  const downloadAudio = useCallback(async () => {
    if (!voiceDebate || downloadState.isDownloading) return;
    if (!mountedRef.current) return;

    const total =
      voiceDebate.script?.turns?.length ??
      voiceDebate.totalTurns ??
      (voiceDebate.audioSegmentPaths?.length ?? 0);

    setDownloadState({
      ...INITIAL,
      isDownloading:  true,
      segmentsTotal:  total,
      phase:          'resolving',
      offlineCapable: (availability?.localCount ?? 0) > 0,
    });

    try {
      const onProgress = (p: AudioDownloadProgress) => {
        if (!mountedRef.current) return;
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

      const success = await downloadVoiceDebateAudio(
        voiceDebate.id,
        voiceDebate.topic,
        voiceDebate.audioSegmentPaths ?? [],
        onProgress,
        {
          allowRemote: isOnline,
          cloudUrls:   voiceDebate.audioStorageUrls ?? [],
          turnCount:   total,
        },
      );

      if (!mountedRef.current) return;

      if (success) {
        const bytes = await getVoiceDebateAudioDiskBytes(voiceDebate.id);
        if (bytes > 0) await markVoiceDebateAudioCached(voiceDebate.id, bytes);

        setDownloadState({ ...INITIAL, phase: 'done', canDownload: false });
        await check();
        return;
      }

      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        phase:         'error',
        error: isOnline
          ? 'Some audio turns could not be saved. The transcript is still available.'
          : 'Audio files are not on this device. Connect to the internet once to download them.',
      }));
    } catch (err) {
      if (!mountedRef.current) return;
      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        phase:         'error',
        error: err instanceof Error ? err.message : 'Audio download failed',
      }));
    }
  }, [voiceDebate, downloadState.isDownloading, isOnline, availability, check]);

  return {
    mode,
    voiceDebateWithLocal: patched,
    hasLocalAudio,
    availability,
    downloadState,
    downloadAudio,
    refresh: check,
  };
}