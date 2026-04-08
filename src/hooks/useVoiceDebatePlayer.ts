// src/hooks/useVoiceDebatePlayer.ts
// Part 40 — Voice Debate Engine
//
// Manages audio playback for VoiceDebate using expo-av directly.
// Does NOT use GlobalAudioEngine (voice debates are a standalone experience —
// they don't persist to the mini player. The player is a fullscreen modal
// that handles its own audio lifecycle entirely.)
//
// Playback model:
//   • Sequential segment playback (turn by turn)
//   • Resolves audio URI: local file first → cloud URL fallback
//   • Tracks position within current segment + cumulative position
//   • Supports: play/pause, skip turn, seek by overall %, playback rate
//   • Cleans up sound on unmount (no keepAlive)
//
// Used by: app/(app)/voice-debate-player.tsx

import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio }                from 'expo-av';
import { audioFileExists }      from '../services/voiceDebateTTSService';
import type { VoiceDebate }     from '../types/voiceDebate';
import type { VoiceDebateTurn, VoiceDebatePlayerState, DebateSegmentType } from '../types/voiceDebate';

// ─── Initial player state ─────────────────────────────────────────────────────

const INITIAL_PLAYER_STATE: VoiceDebatePlayerState = {
  isPlaying:           false,
  currentTurnIndex:    0,
  positionMs:          0,
  segmentDurationMs:   0,
  totalPositionMs:     0,
  totalDurationMs:     0,
  isLoading:           false,
  isBuffering:         false,
  playbackRate:        1.0,
  currentSegmentType:  'opening',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAudioUri(
  voiceDebate: VoiceDebate,
  turnIndex:   number,
): Promise<string | null> {
  const localPath = voiceDebate.audioSegmentPaths?.[turnIndex] ?? '';
  if (localPath) {
    if (localPath.startsWith('https://') || localPath.startsWith('http://')) return localPath;
    if (await audioFileExists(localPath)) return localPath;
  }
  const cloudUrl: string | null = (voiceDebate.audioStorageUrls as any)?.[turnIndex] ?? null;
  if (cloudUrl && (cloudUrl.startsWith('https://') || cloudUrl.startsWith('http://'))) return cloudUrl;
  return null;
}

function getCumulativeMs(turns: VoiceDebateTurn[], upToIndex: number): number {
  return turns.slice(0, upToIndex).reduce((s, t) => s + (t.durationMs ?? 0), 0);
}

function getTotalDurationMs(turns: VoiceDebateTurn[]): number {
  return turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
}

function getTurnSegmentType(voiceDebate: VoiceDebate, turnIndex: number): DebateSegmentType {
  return voiceDebate.script?.turns?.[turnIndex]?.segmentType ?? 'opening';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebatePlayer(voiceDebate: VoiceDebate | null) {
  const [playerState, setPlayerState] = useState<VoiceDebatePlayerState>(INITIAL_PLAYER_STATE);

  const soundRef        = useRef<Audio.Sound | null>(null);
  const loadLockRef     = useRef(false);
  const isUnmountedRef  = useRef(false);
  const currentRateRef  = useRef(1.0);
  const voiceDebateRef  = useRef(voiceDebate);

  useEffect(() => { voiceDebateRef.current = voiceDebate; }, [voiceDebate]);

  // ── Patch state (safe after unmount) ─────────────────────────────────────

  const patch = useCallback((partial: Partial<VoiceDebatePlayerState>) => {
    if (!isUnmountedRef.current) {
      setPlayerState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    isUnmountedRef.current = false;

    Audio.setAudioModeAsync({
      allowsRecordingIOS:         false,
      playsInSilentModeIOS:       true,
      staysActiveInBackground:    false,
      shouldDuckAndroid:          true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});

    return () => {
      isUnmountedRef.current = true;
      if (soundRef.current) {
        soundRef.current.setOnPlaybackStatusUpdate(null);
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // ── Load a specific turn ──────────────────────────────────────────────────

  const loadTurn = useCallback(async (index: number, autoPlay: boolean): Promise<void> => {
    const vd = voiceDebateRef.current;
    if (!vd) return;

    const turns = vd.script?.turns ?? [];
    if (index < 0 || index >= turns.length) return;
    if (loadLockRef.current) return;

    loadLockRef.current = true;

    try {
      // Unload previous
      if (soundRef.current) {
        soundRef.current.setOnPlaybackStatusUpdate(null);
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      const cumulativeMs  = getCumulativeMs(turns, index);
      const totalDurMs    = getTotalDurationMs(turns);
      const segType       = getTurnSegmentType(vd, index);

      patch({
        currentTurnIndex:   index,
        isLoading:          true,
        positionMs:         0,
        segmentDurationMs:  0,
        totalPositionMs:    cumulativeMs,
        totalDurationMs:    totalDurMs,
        currentSegmentType: segType,
      });

      const audioUri = await resolveAudioUri(vd, index);

      if (!audioUri) {
        patch({ isLoading: false });
        loadLockRef.current = false;
        // Skip to next segment if this one has no audio
        if (autoPlay && index < turns.length - 1) {
          setTimeout(() => loadTurn(index + 1, true), 80);
        }
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay:                   autoPlay,
          rate:                         currentRateRef.current,
          progressUpdateIntervalMillis: 250,
          shouldCorrectPitch:           true,
        },
      );

      soundRef.current = sound;
      loadLockRef.current = false;

      patch({ isLoading: false, isPlaying: autoPlay });

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded) return;

        const posMs    = status.positionMillis ?? 0;
        const durMs    = status.durationMillis ?? turns[index]?.durationMs ?? 0;
        const totalPos = cumulativeMs + posMs;
        const totalDur = getTotalDurationMs(voiceDebateRef.current?.script?.turns ?? []);

        patch({
          isPlaying:          status.isPlaying ?? false,
          isBuffering:        status.isBuffering ?? false,
          positionMs:         posMs,
          segmentDurationMs:  durMs,
          totalPositionMs:    totalPos,
          totalDurationMs:    totalDur,
          isLoading:          false,
        });

        if (status.didJustFinish) {
          const nextIndex = index + 1;
          const allTurns  = voiceDebateRef.current?.script?.turns ?? [];
          if (nextIndex < allTurns.length) {
            setTimeout(() => loadTurn(nextIndex, true), 120);
          } else {
            // Episode finished
            patch({
              isPlaying:       false,
              totalPositionMs: totalDur,
            });
          }
        }
      });

    } catch (err) {
      console.warn(`[useVoiceDebatePlayer] Turn ${index} error:`, err);
      patch({ isLoading: false });
      loadLockRef.current = false;
      if (autoPlay && (voiceDebateRef.current?.script?.turns?.length ?? 0) > index + 1) {
        setTimeout(() => loadTurn(index + 1, true), 300);
      }
    }
  }, [patch]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const startPlayback = useCallback(async (fromTurnIndex = 0) => {
    await loadTurn(fromTurnIndex, true);
  }, [loadTurn]);

  const play = useCallback(async () => {
    if (!soundRef.current) return;
    try { await soundRef.current.playAsync(); patch({ isPlaying: true }); }
    catch (err) { console.warn('[useVoiceDebatePlayer] play error:', err); }
  }, [patch]);

  const pause = useCallback(async () => {
    if (!soundRef.current) return;
    try { await soundRef.current.pauseAsync(); patch({ isPlaying: false }); }
    catch (err) { console.warn('[useVoiceDebatePlayer] pause error:', err); }
  }, [patch]);

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) { await soundRef.current.pauseAsync(); patch({ isPlaying: false }); }
      else                  { await soundRef.current.playAsync();  patch({ isPlaying: true });  }
    } catch (err) {
      console.warn('[useVoiceDebatePlayer] togglePlayPause error:', err);
    }
  }, [patch]);

  const skipToTurn = useCallback(async (index: number) => {
    const wasPlaying = playerState.isPlaying;
    await loadTurn(index, wasPlaying);
  }, [playerState.isPlaying, loadTurn]);

  const skipNext = useCallback(async () => {
    const turns = voiceDebate?.script?.turns ?? [];
    const next  = playerState.currentTurnIndex + 1;
    if (next < turns.length) await skipToTurn(next);
  }, [voiceDebate, playerState.currentTurnIndex, skipToTurn]);

  const skipPrevious = useCallback(async () => {
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && (status.positionMillis ?? 0) > 2500) {
          await soundRef.current.setPositionAsync(0);
          patch({ positionMs: 0 });
          return;
        }
      } catch { /* ignore */ }
    }
    const prev = playerState.currentTurnIndex - 1;
    if (prev >= 0) await skipToTurn(prev);
  }, [playerState.currentTurnIndex, skipToTurn, patch]);

  const setPlaybackRate = useCallback(async (rate: number) => {
    currentRateRef.current = rate;
    patch({ playbackRate: rate });
    if (soundRef.current) {
      try { await soundRef.current.setRateAsync(rate, true); }
      catch { /* ignore */ }
    }
  }, [patch]);

  // Seek by episode percentage (0–1)
  const seekToPercent = useCallback(async (percent: number) => {
    const vd = voiceDebateRef.current;
    if (!vd) return;
    const turns     = vd.script?.turns ?? [];
    const totalDur  = getTotalDurationMs(turns);
    const targetMs  = percent * totalDur;

    let cum = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cum + dur >= targetMs || i === turns.length - 1) {
        await loadTurn(i, playerState.isPlaying);
        return;
      }
      cum += dur;
    }
  }, [playerState.isPlaying, loadTurn]);

  // Skip to a specific debate segment
  const skipToSegment = useCallback(async (segmentType: DebateSegmentType) => {
    const vd = voiceDebateRef.current;
    if (!vd) return;
    const seg = vd.script?.segments?.find(s => s.type === segmentType);
    if (seg) await skipToTurn(seg.startTurnIdx);
  }, [skipToTurn]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      soundRef.current.setOnPlaybackStatusUpdate(null);
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayerState(INITIAL_PLAYER_STATE);
  }, []);

  const formatTime = useCallback((ms: number): string => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const progressPercent = playerState.totalDurationMs > 0
    ? Math.min(1, playerState.totalPositionMs / playerState.totalDurationMs)
    : 0;

  const currentTurn = voiceDebate?.script?.turns?.[playerState.currentTurnIndex] ?? null;

  return {
    playerState,
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
    seekToPercent,
    skipToSegment,
    stopPlayback,
    formatTime,
  };
}