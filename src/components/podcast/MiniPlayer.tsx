// src/components/podcast/MiniPlayer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 41.2 UPDATE — Show "Paused · Offline" label.
// DRAGGABLE UPDATE — Fully movable via PanResponder.
// REANIMATED FIX — Splits layout animation (FadeInDown/FadeOutDown) and
//   drag transform onto separate Animated.Views so they don't conflict.
//   Root cause of the warning:
//     "Property 'transform' of AnimatedComponent(View) may be overwritten
//      by a layout animation."
//   Fix: outer Animated.View carries ONLY entering/exiting (layout animation).
//        inner Animated.View carries ONLY dragStyle (transform).
//   These two animated properties must never live on the same view.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
  PanResponder,
}                                                            from 'react-native';
import { Ionicons }                                          from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
}                                                            from 'react-native-reanimated';
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

  // ── Progress bar ───────────────────────────────────────────────────────────
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

  // ── Drag position ──────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const offsetX    = useSharedValue(0);
  const offsetY    = useSharedValue(0);

  const tabBarHeight  = 64 + insets.bottom;
  const defaultBottom = tabBarHeight + 4;

  const clampX = useCallback((raw: number): number => {
    const limit = SPACING.md + 80;
    return Math.min(limit, Math.max(-limit, raw));
  }, []);

  const clampY = useCallback((raw: number): number => {
    const upLimit   = -(SCREEN_H - defaultBottom - 70 - insets.top - 20);
    const downLimit = 0;
    return Math.min(downLimit, Math.max(upLimit, raw));
  }, [defaultBottom, insets.top]);

  const lastTapRef = useRef(0);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    offsetX.value    = 0;
    offsetY.value    = 0;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,

      onPanResponderGrant: () => {
        offsetX.value = translateX.value;
        offsetY.value = translateY.value;
      },

      onPanResponderMove: (_, g) => {
        translateX.value = clampX(offsetX.value + g.dx);
        translateY.value = clampY(offsetY.value + g.dy);
      },

      onPanResponderRelease: (_, g) => {
        const finalX = clampX(offsetX.value + g.dx);
        const finalY = clampY(offsetY.value + g.dy);

        if (Math.abs(finalX) < 20) {
          translateX.value = withSpring(0, { damping: 20, stiffness: 280 });
          offsetX.value    = 0;
        } else {
          translateX.value = withSpring(finalX, { damping: 20, stiffness: 280 });
          offsetX.value    = finalX;
        }
        translateY.value = withSpring(finalY, { damping: 20, stiffness: 200 });
        offsetY.value    = finalY;
      },

      onPanResponderTerminate: () => {},
    })
  ).current;

  // ── REANIMATED FIX: drag transform is on its OWN Animated.View ────────────
  // The outer Animated.View (below) carries ONLY entering/exiting.
  // This Animated.View carries ONLY the transform.
  // Mixing both on one view caused the Reanimated warning.
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

  // ── Navigation on body tap ─────────────────────────────────────────────────
  const handleBodyPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      resetPosition();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

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
  };

  const handleToggle = async () => {
    if (local.contentType === 'voice_debate') {
      await VoiceDebateEngine.toggle();
    } else {
      await AudioEngine.toggle();
    }
  };

  const handleDismiss = async () => {
    MiniPlayerBus.emit('dismiss');
    if (local.contentType === 'voice_debate') {
      await VoiceDebateEngine.stop();
    } else {
      await AudioEngine.stop();
    }
  };

  return (
    // ── OUTER: layout animation ONLY (entering / exiting) ─────────────────
    // No transform here — that's what caused the Reanimated warning.
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
      {/* ── INNER: drag transform ONLY — no layout animation ───────────── */}
      <Animated.View style={dragStyle}>

        {/* Drag handle pill */}
        <View
          {...panResponder.panHandlers}
          style={{ alignItems: 'center', paddingBottom: 5, paddingTop: 4 }}
        >
          <View style={{
            width:           36,
            height:          4,
            borderRadius:    2,
            backgroundColor: `${effectiveAccent}45`,
          }} />
        </View>

        {/* Card — also receives pan handlers so dragging works from body */}
        <View
          {...panResponder.panHandlers}
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
          {/* Progress strip */}
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
            {/* Tappable body */}
            <TouchableOpacity
              onPress={handleBodyPress}
              activeOpacity={0.85}
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm }}
            >
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
            </TouchableOpacity>

            {/* Play / Pause */}
            <TouchableOpacity
              onPress={handleToggle}
              hitSlop={{ top: 10, right: 4, bottom: 10, left: 10 }}
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
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 4 }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}