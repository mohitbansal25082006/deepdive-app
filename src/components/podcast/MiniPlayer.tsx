// src/components/podcast/MiniPlayer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 41.2 — Show "Paused · Offline" label.
// Part 41.2 DRAGGABLE — Fully movable.
//
// Part 52.1 ANDROID DRAG FIX  (v2 — the definitive fix)
// ─────────────────────────────────────────────────────
// SYMPTOM (Android only): the mini player could be dragged ONCE, then froze —
// the next drag did nothing (or snapped wrong). iOS was always fine.
//
// WHY THE EARLIER ATTEMPTS DIDN'T WORK:
//   • v0 used Reanimated SharedValues read synchronously inside PanResponder
//     callbacks (JS thread) → stale-value reads after the first withSpring.
//   • v1 swapped to a plain RN Animated.ValueXY + setOffset/flattenOffset. This
//     removed the stale-read, but the freeze persisted because the ROOT problem
//     on Android is PanResponder itself: there are long-standing platform bugs
//     where a PanResponder view stops receiving a SECOND gesture
//     (facebook/react-native #27902, #28228, #26082) — e.g. when any ancestor
//     has an onLayout, or a ScrollView ancestor reclaims the responder, the
//     native responder is never released after the first drag on Android.
//
// THE REAL FIX:
//   Drop PanResponder entirely and use react-native-gesture-handler's
//   `Gesture.Pan()` driven by Reanimated `useAnimatedStyle`. Gesture Handler
//   uses the NATIVE gesture system (not the JS responder system), so:
//     • the gesture callbacks are worklets running on the UI thread — no
//       JS-thread stale reads, no thread hop;
//     • the native handler correctly resets between gestures on Android, so
//       repeated drags work indefinitely;
//     • it composes cleanly with Tap gestures for tap-to-open / toggle.
//
//   Pattern (canonical RNGH + Reanimated draggable):
//     translateX/Y  = useSharedValue(0)     ← live position
//     startX/Y      = useSharedValue(0)     ← committed position at gesture start
//     Gesture.Pan()
//       .onStart  → startX = translateX (snapshot)
//       .onUpdate → translateX = clamp(startX + e.translationX)  (clamp on UI thread)
//       .onEnd    → settle with withSpring
//     Gesture.Tap() → runOnJS(navigate); double-tap → reset position
//     Gesture.Race(pan, Exclusive(doubleTap, tap))
//
// NOTES:
//   • The OUTER positioning view has NO onLayout (that alone breaks Android
//     PanResponder; we avoid it regardless).
//   • Requires a GestureHandlerRootView at the app root. Expo Router wraps the
//     app in one by default; the global MiniPlayer is mounted inside it.
//   • Progress bar + enter/exit layout animation stay on Reanimated (UI-thread,
//     no hazard), isolated on separate views from the drag transform.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Platform,
  Dimensions,
}                                                            from 'react-native';
import { Ionicons }                                          from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
}                                                            from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
}                                                            from 'react-native-gesture-handler';
import { router }                                            from 'expo-router';
import { useSafeAreaInsets }                                 from 'react-native-safe-area-context';
import { LinearGradient }                                    from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS }                    from '../../constants/theme';
import { EpisodeArtwork }                                    from './EpisodeArtwork';
import {
  subscribeToEngine,
  AudioEngine,
  getEngineState,
  type EngineState,
}                                                            from '../../services/GlobalAudioEngine';
import {
  subscribeToVDEngine,
  VoiceDebateEngine,
  getVDEngineState,
  type VoiceDebateEngineState,
}                                                            from '../../services/VoiceDebateAudioEngine';
import type { MiniPlayerState }                              from '../../types/podcast_v2';

// ─── Mini Player Bus (backward compat) ────────────────────────────────────────

type MiniPlayerEvent = 'toggle' | 'dismiss';
type MiniPlayerListener = (event: MiniPlayerEvent) => void;

class MiniPlayerEventBus {
  private listeners: MiniPlayerListener[] = [];
  emit = (event: MiniPlayerEvent) => this.listeners.forEach(l => {
    try { l(event); } catch {}
  });
  subscribe = (listener: MiniPlayerListener) => {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  };
}

export const MiniPlayerBus = new MiniPlayerEventBus();

// ─── Screen dimensions ────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;

// ─── Combined Local State ─────────────────────────────────────────────────────

type ContentType = 'podcast' | 'voice_debate';

interface LocalState {
  isVisible:       boolean;
  contentType:     ContentType;
  title:           string;
  subtitle:        string;
  podcastId:       string | null;
  voiceDebateId:   string | null;
  isPlaying:       boolean;
  progressPercent: number;
  accentColor:     string;
  sourceScreen:    string | null;
  sourceParams:    Record<string, string> | null;
  pausedByOffline: boolean;
}

const DEFAULT_LOCAL: LocalState = {
  isVisible:       false,
  contentType:     'podcast',
  title:           '',
  subtitle:        '',
  podcastId:       null,
  voiceDebateId:   null,
  isPlaying:       false,
  progressPercent: 0,
  accentColor:     COLORS.primary,
  sourceScreen:    null,
  sourceParams:    null,
  pausedByOffline: false,
};

function podcastToLocal(es: EngineState): LocalState {
  const podcast = es.podcast;
  return {
    isVisible:       es.isVisible && !!es.podcastId,
    contentType:     'podcast',
    title:           podcast?.title             ?? '',
    subtitle:        `${podcast?.config?.hostName ?? 'Host'} & ${podcast?.config?.guestName ?? 'Guest'}`,
    podcastId:       es.podcastId,
    voiceDebateId:   null,
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
    accentColor:     COLORS.primary,
    sourceScreen:    es.sourceScreen ?? null,
    sourceParams:    es.sourceParams ?? null,
    pausedByOffline: es.pausedByOffline ?? false,
  };
}

function vdToLocal(es: VoiceDebateEngineState): LocalState {
  const vd = es.voiceDebate;
  return {
    isVisible:       es.isVisible && !!es.voiceDebateId,
    contentType:     'voice_debate',
    title:           vd?.topic ?? 'Voice Debate',
    subtitle:        `Turn ${es.currentTurnIndex + 1} of ${vd?.script?.turns?.length ?? 0}`,
    podcastId:       null,
    voiceDebateId:   es.voiceDebateId,
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
    accentColor:     '#6C63FF',
    sourceScreen:    null,
    sourceParams:    null,
    pausedByOffline: es.pausedByOffline ?? false,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MiniPlayerProps {
  /** @deprecated No longer used */
  state?: MiniPlayerState;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MiniPlayer(_props: MiniPlayerProps) {
  const insets = useSafeAreaInsets();

  const [podcastLocal, setPodcastLocal] = useState<LocalState>(
    () => podcastToLocal(getEngineState())
  );
  const [vdLocal, setVdLocal] = useState<LocalState>(
    () => vdToLocal(getVDEngineState())
  );

  useEffect(() => {
    return subscribeToEngine((es: EngineState) => {
      setPodcastLocal(podcastToLocal(es));
    });
  }, []);

  useEffect(() => {
    return subscribeToVDEngine((es: VoiceDebateEngineState) => {
      setVdLocal(vdToLocal(es));
    });
  }, []);

  // Voice debate takes priority
  const local = vdLocal.isVisible ? vdLocal : podcastLocal;

  // ── Progress bar (Reanimated — UI-thread, isolated view) ──────────────────
  const progressFill = useSharedValue(local.progressPercent);
  useEffect(() => {
    progressFill.value = withTiming(
      Math.min(1, Math.max(0, local.progressPercent)),
      { duration: 200 },
    );
  }, [local.progressPercent]);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progressFill.value * 100))}%` as any,
  }));

  // ── DRAG — react-native-gesture-handler + Reanimated (UI-thread, native) ──
  // translateX/Y hold the live position; startX/Y snapshot it at gesture start
  // so each new drag continues from where the last one ended (this is what makes
  // REPEATED drags work — and on Android it works because RNGH uses the native
  // gesture system, not the buggy JS PanResponder).
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX     = useSharedValue(0);
  const startY     = useSharedValue(0);

  const tabBarHeight  = 64 + insets.bottom;
  const defaultBottom = tabBarHeight + 4;

  // Clamp bounds (plain numbers captured into the worklets).
  const limitX     = SPACING.md + 80;
  const upLimitY   = -(SCREEN_H - defaultBottom - 70 - insets.top - 20);
  const downLimitY = 0;

  // Reset to home position (double-tap). Shared-value writes run on UI thread.
  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.6 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.6 });
  }, [translateX, translateY]);

  // Navigation (JS thread via runOnJS).
  const navigateToPlayer = useCallback(() => {
    if (local.contentType === 'voice_debate' && local.voiceDebateId) {
      router.push({ pathname: '/(app)/voice-debate-player' as any, params: { voiceDebateId: local.voiceDebateId } });
      return;
    }
    if (local.sourceScreen) {
      router.push({ pathname: local.sourceScreen as any, params: local.sourceParams ?? {} });
      return;
    }
    if (local.podcastId) {
      router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: local.podcastId } });
    }
  }, [local.contentType, local.voiceDebateId, local.sourceScreen, local.sourceParams, local.podcastId]);

  const handleToggle = useCallback(async () => {
    if (local.contentType === 'voice_debate') {
      await VoiceDebateEngine.toggle();
    } else {
      await AudioEngine.toggle();
    }
  }, [local.contentType]);

  const handleDismiss = useCallback(async () => {
    MiniPlayerBus.emit('dismiss');
    if (local.contentType === 'voice_debate') {
      await VoiceDebateEngine.stop();
    } else {
      await AudioEngine.stop();
    }
  }, [local.contentType]);

  // Pan gesture — worklet callbacks on the UI thread.
  const panGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])   // require ~6px before the pan claims the gesture…
    .activeOffsetY([-6, 6])   // …so quick taps still register as taps
    .onStart(() => {
      'worklet';
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e: { translationX: number; translationY: number }) => {
      'worklet';
      const nextX = startX.value + e.translationX;
      const nextY = startY.value + e.translationY;
      translateX.value = Math.min(limitX,     Math.max(-limitX,  nextX));
      translateY.value = Math.min(downLimitY, Math.max(upLimitY, nextY));
    })
    .onEnd(() => {
      'worklet';
      // Gentle settle + re-clamp in case of fling overshoot.
      translateX.value = withSpring(
        Math.min(limitX, Math.max(-limitX, translateX.value)),
        { damping: 20, stiffness: 280, mass: 0.7 },
      );
      translateY.value = withSpring(
        Math.min(downLimitY, Math.max(upLimitY, translateY.value)),
        { damping: 20, stiffness: 280, mass: 0.7 },
      );
    });

  // Single tap → open player. Double tap → reset position.
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .numberOfTaps(1)
    .onEnd(() => {
      'worklet';
      runOnJS(navigateToPlayer)();
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      resetPosition();
    });

  // Race: pan wins once finger moves >6px; otherwise the tap(s) fire.
  const composedGesture = Gesture.Race(
    panGesture,
    Gesture.Exclusive(doubleTapGesture, tapGesture),
  );

  // Independent tap gestures for the control buttons.
  const toggleTap  = Gesture.Tap().onEnd(() => { 'worklet'; runOnJS(handleToggle)(); });
  const dismissTap = Gesture.Tap().onEnd(() => { 'worklet'; runOnJS(handleDismiss)(); });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // ── Visibility ─────────────────────────────────────────────────────────────
  if (!local.isVisible) return null;

  const showOfflineLabel = local.pausedByOffline && !local.isPlaying;
  const effectiveAccent  = showOfflineLabel
    ? (COLORS.warning ?? '#F59E0B')
    : local.accentColor;

  return (
    // ── OUTER: Reanimated layout animation ONLY (entering / exiting) ──────
    // NO onLayout here (Android responder hazard) and NO transform (keeps the
    // layout animation isolated from the drag transform below).
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutDown.duration(200)}
      style={{
        position: 'absolute',
        bottom:   defaultBottom,
        left:     SPACING.md,
        right:    SPACING.md,
        zIndex:   9990,
      }}
    >
      {/* ── INNER: Reanimated.View carrying the drag transform ONLY ───────── */}
      <Animated.View style={dragStyle}>
        {/* The whole card + handle is wrapped in ONE GestureDetector so the drag
            works from anywhere on the player. Tap/double-tap are composed in.
            The control buttons have their OWN tap detectors which win via the
            native gesture arbitration. */}
        <GestureDetector gesture={composedGesture}>
          <View>
            {/* Drag handle pill (visual affordance) */}
            <View style={{ alignItems: 'center', paddingBottom: 5, paddingTop: 4 }}>
              <View style={{
                width:           36,
                height:          4,
                borderRadius:    2,
                backgroundColor: `${effectiveAccent}45`,
              }} />
            </View>

            {/* Card */}
            <View
              style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius:    RADIUS.xl,
                borderWidth:     1,
                borderColor:     showOfflineLabel
                                   ? `${COLORS.warning ?? '#F59E0B'}50`
                                   : local.contentType === 'voice_debate'
                                     ? `${local.accentColor}40`
                                     : COLORS.border,
                overflow:        'hidden',
                ...Platform.select({
                  ios:     {
                    shadowColor:   '#000',
                    shadowOpacity: 0.25,
                    shadowRadius:  12,
                    shadowOffset:  { width: 0, height: 4 },
                  },
                  android: { elevation: 10 },
                }),
              }}
            >
              {/* Progress strip (Reanimated) */}
              <View style={{ height: 2, backgroundColor: COLORS.backgroundElevated }}>
                <Animated.View style={[progressStyle, {
                  height:          '100%',
                  backgroundColor: effectiveAccent,
                }]} />
              </View>

              {/* Content row */}
              <View style={{
                flexDirection: 'row',
                alignItems:    'center',
                gap:           SPACING.sm,
                padding:       SPACING.sm + 2,
              }}>
                {/* Body (artwork + text) — plain View; tap handled by composed gesture */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm }}>
                  {local.contentType === 'voice_debate' ? (
                    <LinearGradient
                      colors={['#1A1035', '#0D0820']}
                      style={{
                        width:          40,
                        height:         40,
                        borderRadius:   12,
                        alignItems:     'center',
                        justifyContent: 'center',
                        borderWidth:    1,
                        borderColor:    `${local.accentColor}40`,
                      }}
                    >
                      <Ionicons name="mic" size={18} color={local.accentColor} />
                    </LinearGradient>
                  ) : (
                    <EpisodeArtwork title={local.title} size={40} borderRadius={12} />
                  )}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}
                      numberOfLines={1}
                    >
                      {local.title}
                    </Text>

                    {showOfflineLabel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="cloud-offline-outline" size={11} color={COLORS.warning ?? '#F59E0B'} />
                        <Text
                          style={{ color: COLORS.warning ?? '#F59E0B', fontSize: FONTS.sizes.xs, fontWeight: '600' }}
                          numberOfLines={1}
                        >
                          Paused · Offline
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}
                        numberOfLines={1}
                      >
                        {local.subtitle}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Play / Pause — own tap detector */}
                <GestureDetector gesture={toggleTap}>
                  <View
                    style={{
                      width:           38,
                      height:          38,
                      borderRadius:    19,
                      backgroundColor: effectiveAccent,
                      alignItems:      'center',
                      justifyContent:  'center',
                      flexShrink:      0,
                    }}
                  >
                    <Ionicons
                      name={local.isPlaying ? 'pause' : 'play'}
                      size={16}
                      color="#FFF"
                      style={{ marginLeft: local.isPlaying ? 0 : 1 }}
                    />
                  </View>
                </GestureDetector>

                {/* Dismiss — own tap detector */}
                <GestureDetector gesture={dismissTap}>
                  <View style={{ padding: 4 }}>
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </View>
                </GestureDetector>
              </View>
            </View>
          </View>
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
}