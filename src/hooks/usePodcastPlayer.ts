// src/hooks/usePodcastPlayer.ts
// Part 39 FIX v4 — Three targeted fixes:
//
// FIX 1 — Mini player stops between segments (keepAlive bug):
//   ROOT CAUSE: The React cleanup function reset `keepAliveRef.current = false`
//   after screen unmount. So when `didJustFinish` fired on segment N and tried
//   to load segment N+1, `isUnmountedRef.current = true` AND `keepAliveRef = false`,
//   causing the brand-new Sound to be immediately unloaded.
//
//   SOLUTION: Introduce a module-level `globalKeepAlive` boolean that persists
//   across React mount/unmount cycles. It is:
//     • Set to `true`  by detachScreen() (user navigates away, keep playing)
//     • Reset to `false` at the TOP of the mount effect (screen remounts)
//     • Reset to `false` by stopPlayback() (user explicitly stops)
//     • NEVER reset inside the cleanup/unmount — that was the bug.
//
// FIX 2 — Play/pause button does nothing in mini player when screen unmounted:
//   ROOT CAUSE: MiniPlayerBus 'toggle' event had no subscriber when
//   podcast-player.tsx was not mounted. _layout.tsx only subscribed to 'dismiss'.
//
//   SOLUTION: Export `toggleGlobalAudio()` which directly calls play/pause on
//   `globalHolder.sound`, then pushes the new state to the mini player callback.
//   _layout.tsx subscribes to 'toggle' and calls this function.
//
// FIX 3 — Remove lock screen / background audio:
//   SOLUTION: `staysActiveInBackground: false` in audio session config.
//   `UIBackgroundModes: ["audio"]` removed from app.json separately.
//   Audio still plays in silent mode (playsInSilentModeIOS: true) and continues
//   while navigating between tabs (foreground). Only backgrounding the app stops it.
//
// All Part 25 / 39 cross-device cloud fallback preserved.
// All Part 39 series / chapter / continue-listening features preserved.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import type { Podcast, PodcastPlayerState } from '../types';
import type { MiniPlayerState }             from '../types/podcast_v2';
import { audioFileExists }                  from '../services/podcastTTSService';

// ─── Initial state ─────────────────────────────────────────────────────────────

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

// ─── Module-level flags ────────────────────────────────────────────────────────
// These survive React unmount/mount cycles — critical for the segment auto-advance fix.

let audioSessionConfigured = false;

/**
 * FIX 1: globalKeepAlive persists across React unmount/mount cycles.
 * When true, loadTurn() will NOT unload a newly created Sound even if
 * the screen component is unmounted (isUnmountedRef.current === true).
 * This allows segment N+1 to load automatically after segment N finishes
 * even while the user has navigated away from the player screen.
 */
let globalKeepAlive = false;

// ─── Singleton audio session ───────────────────────────────────────────────────
// Configured ONCE per app session. Foreground-only — no lock screen controls.

async function ensureAudioSession(): Promise<void> {
  if (audioSessionConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:         false,
      playsInSilentModeIOS:       true,   // Play even when iPhone physical silent switch is on
      staysActiveInBackground:    false,  // FIX 3: Do NOT keep playing when app is backgrounded
      shouldDuckAndroid:          true,
      playThroughEarpieceAndroid: false,
    });
    audioSessionConfigured = true;
    console.log('[PodcastPlayer] Audio session configured (foreground-only)');
  } catch (err) {
    console.warn('[PodcastPlayer] Audio session config error:', err);
  }
}

// ─── Global sound holder ──────────────────────────────────────────────────────
// Keeps the Audio.Sound object alive across screen unmounts.

interface GlobalSoundHolder {
  sound:     Audio.Sound | null;
  podcastId: string | null;
  turnIndex: number;
  isPlaying: boolean;
}

const globalHolder: GlobalSoundHolder = {
  sound:     null,
  podcastId: null,
  turnIndex: 0,
  isPlaying: false,
};

// ─── Global mini player callback ──────────────────────────────────────────────
// At module level so audio callbacks can reach it without React setState chains.

let globalMiniPlayerCallback: ((partial: Partial<MiniPlayerState>) => void) | null = null;

// ─── Exported global audio controls ───────────────────────────────────────────
// Used by _layout.tsx to control audio when podcast-player.tsx is NOT mounted.

/**
 * Stop and fully unload global audio. Called when user dismisses mini player
 * from outside the podcast-player screen.
 */
export async function stopGlobalAudio(): Promise<void> {
  globalKeepAlive = false;
  if (globalHolder.sound) {
    try {
      await globalHolder.sound.stopAsync();
      await globalHolder.sound.unloadAsync();
    } catch {}
    globalHolder.sound     = null;
    globalHolder.podcastId = null;
    globalHolder.turnIndex = 0;
    globalHolder.isPlaying = false;
  }
  setTimeout(() => {
    globalMiniPlayerCallback?.({ isVisible: false, isPlaying: false });
  }, 0);
}

/**
 * FIX 2: Toggle play/pause on the global sound holder.
 * Called by _layout.tsx when mini player play/pause is tapped and
 * podcast-player.tsx is NOT mounted (no hook instance active).
 * The setOnPlaybackStatusUpdate callback will auto-sync React state
 * if/when the player screen remounts.
 */
export async function toggleGlobalAudio(): Promise<void> {
  if (!globalHolder.sound) return;
  try {
    const status = await globalHolder.sound.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await globalHolder.sound.pauseAsync();
      globalHolder.isPlaying = false;
      setTimeout(() => {
        globalMiniPlayerCallback?.({ isPlaying: false });
      }, 0);
    } else {
      await globalHolder.sound.playAsync();
      globalHolder.isPlaying = true;
      setTimeout(() => {
        globalMiniPlayerCallback?.({ isPlaying: true });
      }, 0);
    }
  } catch (err) {
    console.warn('[PodcastPlayer] toggleGlobalAudio error:', err);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePodcastPlayer(
  podcast: Podcast | null,
  onMiniPlayerStateChange?: (miniState: Partial<MiniPlayerState>) => void,
) {
  // ── Refs ─────────────────────────────────────────────────────────────────────
  const isUnmountedRef  = useRef(false);
  const currentIndexRef = useRef(0);
  const rateRef         = useRef(1.0);
  const podcastRef      = useRef(podcast);
  const loadTurnRef     = useRef<(index: number, autoPlay: boolean) => Promise<void>>(async () => {});

  useEffect(() => { podcastRef.current = podcast; }, [podcast]);

  // Register mini player callback at module level so audio callbacks reach it
  // without going through React render cycles.
  useEffect(() => {
    if (onMiniPlayerStateChange) {
      globalMiniPlayerCallback = onMiniPlayerStateChange;
    }
    return () => {
      if (globalMiniPlayerCallback === onMiniPlayerStateChange) {
        globalMiniPlayerCallback = null;
      }
    };
  }, [onMiniPlayerStateChange]);

  // ── State ─────────────────────────────────────────────────────────────────────
  const [state, setState] = useState<PodcastPlayerState>(INITIAL_STATE);

  // ── Safe state patcher ────────────────────────────────────────────────────────
  const patchState = useCallback((partial: Partial<PodcastPlayerState>) => {
    if (!isUnmountedRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Mini player push — always via setTimeout to avoid setState chains ──────────
  const pushMiniPlayerUpdate = useCallback((partial: Partial<MiniPlayerState>) => {
    setTimeout(() => {
      globalMiniPlayerCallback?.(partial);
    }, 0);
  }, []);

  // ── Audio session setup & screen reattach ──────────────────────────────────────
  useEffect(() => {
    // FIX 1: Reset globalKeepAlive at mount time (not at unmount).
    // If the screen remounts after a detach, we're back in "normal" mode.
    isUnmountedRef.current = false;
    globalKeepAlive        = false;

    ensureAudioSession();

    // If global holder already has audio for THIS podcast (user navigated back),
    // reattach so the screen reflects current playback state.
    const p = podcastRef.current;
    if (p && globalHolder.podcastId === p.id && globalHolder.sound) {
      currentIndexRef.current = globalHolder.turnIndex;

      globalHolder.sound.getStatusAsync().then(status => {
        if (isUnmountedRef.current || !status.isLoaded) return;
        const turns      = podcastRef.current?.script?.turns ?? [];
        const cumMs      = turns.slice(0, globalHolder.turnIndex)
          .reduce((s, t) => s + (t.durationMs ?? 0), 0);
        const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);

        patchState({
          isPlaying:         status.isPlaying,
          currentTurnIndex:  globalHolder.turnIndex,
          positionMs:        status.positionMillis ?? 0,
          segmentDurationMs: status.durationMillis ?? 0,
          totalPositionMs:   cumMs + (status.positionMillis ?? 0),
          totalDurationMs:   totalDurMs,
          isLoading:         false,
        });
      }).catch(() => {});
    }

    return () => {
      isUnmountedRef.current = true;

      // FIX 1: Only unload if NOT in keepAlive mode.
      // CRITICAL: Do NOT reset globalKeepAlive here — it must stay true so
      // that the next segment (loaded by didJustFinish auto-advance) is also
      // allowed to survive when isUnmountedRef.current is true.
      if (!globalKeepAlive) {
        if (globalHolder.sound) {
          globalHolder.sound.unloadAsync().catch(() => {});
          globalHolder.sound     = null;
          globalHolder.podcastId = null;
          globalHolder.turnIndex = 0;
          globalHolder.isPlaying = false;
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pre-compute total duration ─────────────────────────────────────────────────
  useEffect(() => {
    if (!podcast) return;
    const total = (podcast.script?.turns ?? []).reduce((s, t) => s + (t.durationMs ?? 0), 0);
    patchState({ totalDurationMs: total });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcast?.id]);

  // ── Resolve audio URI — local first, then cloud ────────────────────────────────
  const resolveAudioUri = useCallback(async (segmentIndex: number): Promise<string | null> => {
    const p = podcastRef.current;
    if (!p) return null;

    const localPath = p.audioSegmentPaths?.[segmentIndex] ?? '';
    if (localPath) {
      if (localPath.startsWith('https://') || localPath.startsWith('http://')) {
        return localPath;
      }
      const exists = await audioFileExists(localPath);
      if (exists) return localPath;
    }

    const cloudUrl: string | null = (p as any).audioStorageUrls?.[segmentIndex] ?? null;
    if (cloudUrl && (cloudUrl.startsWith('https://') || cloudUrl.startsWith('http://'))) {
      return cloudUrl;
    }

    return null;
  }, []);

  // ── Core: Load a specific turn ─────────────────────────────────────────────────
  const loadTurn = async (index: number, autoPlay: boolean): Promise<void> => {
    const p = podcastRef.current;
    if (!p) return;

    const turns = p.script?.turns ?? [];
    if (index < 0 || index >= turns.length) return;

    // Unload previous sound
    if (globalHolder.sound) {
      if (globalHolder.podcastId !== p.id) {
        // Different podcast — full unload
        try { await globalHolder.sound.unloadAsync(); } catch {}
        globalHolder.sound     = null;
        globalHolder.podcastId = null;
        globalHolder.turnIndex = 0;
        globalHolder.isPlaying = false;
      } else {
        // Same podcast, new segment — unload current
        try { await globalHolder.sound.unloadAsync(); } catch {}
        globalHolder.sound = null;
      }
    }

    // FIX 1: Check globalKeepAlive (module-level) not keepAliveRef (hook-level).
    // isUnmountedRef can be true when screen navigated away but keepAlive is on.
    if (isUnmountedRef.current && !globalKeepAlive) return;

    currentIndexRef.current = index;
    globalHolder.turnIndex  = index;
    globalHolder.podcastId  = p.id;

    patchState({ currentTurnIndex: index, isLoading: true, positionMs: 0 });

    const turn     = turns[index];
    const audioUri = await resolveAudioUri(index);

    if (!audioUri) {
      patchState({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 80);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay:                   autoPlay,
          rate:                         rateRef.current,
          progressUpdateIntervalMillis: 300,
          shouldCorrectPitch:           true,
        }
      );

      // FIX 1: Guard uses globalKeepAlive, not a stale React ref.
      if (isUnmountedRef.current && !globalKeepAlive) {
        await sound.unloadAsync();
        return;
      }

      globalHolder.sound     = sound;
      globalHolder.isPlaying = autoPlay;

      const totalDurationMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
      const cumulativeMs    = turns.slice(0, index).reduce((s, t) => s + (t.durationMs ?? 0), 0);

      // ── Playback status update handler ─────────────────────────────────────
      // CRITICAL: Never call setState inside another setState updater.
      // Strategy:
      //   1. Compute all new values as plain objects
      //   2. Update React state once with a flat setState
      //   3. Push mini player update via setTimeout(0) — completely decoupled
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded) return;

        const posMs = status.positionMillis ?? 0;
        const durMs = status.durationMillis ?? (turn.durationMs ?? 0);

        // Step 1 & 2: Update React state (flat, no nesting)
        if (!isUnmountedRef.current) {
          setState(prev => ({
            ...prev,
            isLoading:         false,
            isBuffering:       status.isBuffering ?? false,
            isPlaying:         status.isPlaying   ?? false,
            positionMs:        posMs,
            segmentDurationMs: durMs,
            totalPositionMs:   cumulativeMs + posMs,
            totalDurationMs:   totalDurationMs,
            currentTurnIndex:  index,
          }));
        }

        // Step 3: Push mini player update — AFTER current call stack
        const currentPodcast = podcastRef.current;
        if (currentPodcast) {
          const totalPos = cumulativeMs + posMs;
          setTimeout(() => {
            globalMiniPlayerCallback?.({
              isVisible:       true,
              podcastId:       currentPodcast.id,
              podcastTitle:    currentPodcast.title,
              hostName:        currentPodcast.config?.hostName ?? 'Host',
              guestName:       currentPodcast.config?.guestName ?? 'Guest',
              isPlaying:       status.isPlaying ?? false,
              progressPercent: totalDurationMs > 0 ? totalPos / totalDurationMs : 0,
              currentTurnIdx:  index,
            });
          }, 0);
        }

        // Auto-advance to next segment when current one finishes
        if (status.didJustFinish) {
          globalHolder.isPlaying = false;
          const nextIdx = currentIndexRef.current + 1;
          if (nextIdx < turns.length) {
            // FIX 1: This will succeed even when isUnmountedRef.current === true
            // because globalKeepAlive === true (set by detachScreen).
            setTimeout(() => loadTurnRef.current(nextIdx, true), 120);
          } else {
            // Episode finished — reset
            if (!isUnmountedRef.current) {
              setState(prev => ({
                ...prev,
                isPlaying:       false,
                positionMs:      0,
                totalPositionMs: totalDurationMs,
              }));
            }
            setTimeout(() => {
              globalMiniPlayerCallback?.({ isPlaying: false, progressPercent: 1 });
            }, 0);
          }
        }
      });

      patchState({ isLoading: false, isPlaying: autoPlay });
      globalHolder.isPlaying = autoPlay;

      // Push initial mini player state
      pushMiniPlayerUpdate({
        isVisible:       true,
        podcastId:       p.id,
        podcastTitle:    p.title,
        hostName:        p.config?.hostName ?? 'Host',
        guestName:       p.config?.guestName ?? 'Guest',
        isPlaying:       autoPlay,
        progressPercent: totalDurationMs > 0 ? cumulativeMs / totalDurationMs : 0,
        currentTurnIdx:  index,
      });

    } catch (err) {
      console.warn(`[PodcastPlayer] Segment ${index} load error:`, err);
      patchState({ isLoading: false });
      if (autoPlay && index < turns.length - 1) {
        setTimeout(() => loadTurnRef.current(index + 1, true), 300);
      }
    }
  };

  loadTurnRef.current = loadTurn;

  // ── Public controls ────────────────────────────────────────────────────────────

  const startPlayback = useCallback(async () => {
    await loadTurnRef.current(0, true);
  }, []);

  const resumeFrom = useCallback(async (turnIndex: number) => {
    const turns   = podcastRef.current?.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(turnIndex, turns.length - 1));
    await loadTurnRef.current(clamped, true);
  }, []);

  const play = useCallback(async () => {
    if (globalHolder.sound) {
      await globalHolder.sound.playAsync();
      globalHolder.isPlaying = true;
      patchState({ isPlaying: true });
      pushMiniPlayerUpdate({ isPlaying: true });
    } else {
      await loadTurnRef.current(currentIndexRef.current, true);
    }
  }, [patchState, pushMiniPlayerUpdate]);

  const pause = useCallback(async () => {
    if (globalHolder.sound) {
      await globalHolder.sound.pauseAsync();
      globalHolder.isPlaying = false;
      patchState({ isPlaying: false });
      pushMiniPlayerUpdate({ isPlaying: false });
    }
  }, [patchState, pushMiniPlayerUpdate]);

  const togglePlayPause = useCallback(async () => {
    if (globalHolder.sound) {
      const status = await globalHolder.sound.getStatusAsync().catch(() => null);
      if (status?.isLoaded && status.isPlaying) {
        await pause();
      } else {
        await play();
      }
    } else {
      await play();
    }
  }, [play, pause]);

  const skipToTurn = useCallback(async (index: number) => {
    const turns   = podcastRef.current?.script?.turns ?? [];
    const clamped = Math.max(0, Math.min(index, turns.length - 1));
    let wasPlaying = false;
    if (globalHolder.sound) {
      const status = await globalHolder.sound.getStatusAsync().catch(() => null);
      wasPlaying = status?.isLoaded ? status.isPlaying : false;
    }
    await loadTurnRef.current(clamped, wasPlaying);
  }, []);

  const skipNext = useCallback(async () => {
    const turns = podcastRef.current?.script?.turns ?? [];
    const next  = currentIndexRef.current + 1;
    if (next < turns.length) {
      let wasPlaying = false;
      if (globalHolder.sound) {
        const status = await globalHolder.sound.getStatusAsync().catch(() => null);
        wasPlaying = status?.isLoaded ? status.isPlaying : false;
      }
      await loadTurnRef.current(next, wasPlaying);
    }
  }, []);

  const skipPrevious = useCallback(async () => {
    if (globalHolder.sound) {
      const status = await globalHolder.sound.getStatusAsync().catch(() => null);
      if (status?.isLoaded && (status.positionMillis ?? 0) > 2000) {
        await globalHolder.sound.setPositionAsync(0);
        return;
      }
    }
    const prev = currentIndexRef.current - 1;
    if (prev >= 0) {
      let wasPlaying = false;
      if (globalHolder.sound) {
        const status = await globalHolder.sound.getStatusAsync().catch(() => null);
        wasPlaying = status?.isLoaded ? status.isPlaying : false;
      }
      await loadTurnRef.current(prev, wasPlaying);
    }
  }, []);

  const setPlaybackRate = useCallback(async (rate: number) => {
    rateRef.current = rate;
    patchState({ playbackRate: rate });
    if (globalHolder.sound) {
      await globalHolder.sound.setRateAsync(rate, true);
    }
  }, [patchState]);

  // ── detachScreen ──────────────────────────────────────────────────────────────
  // Called by podcast-player.tsx before router.back().
  // FIX 1: Sets globalKeepAlive = true (module-level) so subsequent segment
  // loads in loadTurn() are NOT blocked by isUnmountedRef.current === true.
  const detachScreen = useCallback(async () => {
    // FIX 1: Set module-level flag — this survives the React cleanup
    globalKeepAlive = true;

    // Read LIVE status from the actual audio object (not stale React state)
    const p = podcastRef.current;
    if (globalHolder.sound && p) {
      try {
        const status = await globalHolder.sound.getStatusAsync();
        if (status.isLoaded) {
          const turns      = p.script?.turns ?? [];
          const totalDurMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
          const cumMs      = turns.slice(0, globalHolder.turnIndex)
            .reduce((s, t) => s + (t.durationMs ?? 0), 0);
          const totalPosMs = cumMs + (status.positionMillis ?? 0);

          pushMiniPlayerUpdate({
            isVisible:       true,
            podcastId:       p.id,
            podcastTitle:    p.title,
            hostName:        p.config?.hostName ?? 'Host',
            guestName:       p.config?.guestName ?? 'Guest',
            isPlaying:       status.isPlaying,
            progressPercent: totalDurMs > 0 ? totalPosMs / totalDurMs : 0,
            currentTurnIdx:  globalHolder.turnIndex,
          });
        }
      } catch {
        // Non-fatal — mini player will show with last known state
      }
    }
  }, [pushMiniPlayerUpdate]);

  // ── stopPlayback — fully stops and unloads ─────────────────────────────────
  const stopPlayback = useCallback(async () => {
    // FIX 1: Reset module-level keepAlive so cleanup will unload
    globalKeepAlive = false;

    if (globalHolder.sound) {
      try {
        await globalHolder.sound.stopAsync();
        await globalHolder.sound.unloadAsync();
      } catch {}
      globalHolder.sound     = null;
      globalHolder.podcastId = null;
      globalHolder.turnIndex = 0;
      globalHolder.isPlaying = false;
    }
    currentIndexRef.current = 0;
    patchState({
      isPlaying:        false,
      positionMs:       0,
      totalPositionMs:  0,
      currentTurnIndex: 0,
    });
    pushMiniPlayerUpdate({ isVisible: false, isPlaying: false });
  }, [patchState, pushMiniPlayerUpdate]);

  const formatTime = useCallback((ms: number): string => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const minutes  = Math.floor(totalSec / 60);
    const seconds  = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────────

  const progressPercent = state.totalDurationMs > 0
    ? Math.min(1, state.totalPositionMs / state.totalDurationMs)
    : 0;

  const currentTurn = podcast?.script?.turns?.[state.currentTurnIndex] ?? null;

  return {
    playerState: state,
    currentTurn,
    progressPercent,
    startPlayback,
    resumeFrom,
    play,
    pause,
    togglePlayPause,
    skipToTurn,
    skipNext,
    skipPrevious,
    setPlaybackRate,
    stopPlayback,
    detachScreen,
    formatTime,
  };
}