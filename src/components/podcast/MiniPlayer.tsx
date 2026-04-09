// src/components/podcast/MiniPlayer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 41.2 UPDATE — Show "Paused · Offline" label when audio was paused
// by a network loss, so users understand why it stopped.
//
// CHANGES:
//   1. Reads `pausedByOffline` from both engine states.
//   2. When pausedByOffline=true and the player is paused, the subtitle
//      line shows "Paused · Offline" with an offline icon instead of the
//      normal speaker/host info.
//   3. Tapping Play in the mini player still works (calls toggle) which
//      clears the pausedByOffline flag inside the engine. Audio will play
//      if it's local/cached, or attempt to play if back online.
//   4. All Part 41 navigation logic (sourceScreen / sourceParams) is
//      100% preserved.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState }            from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons }                               from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeOutDown,
  useSharedValue, useAnimatedStyle, withTiming,
}                                                 from 'react-native-reanimated';
import { router }                                 from 'expo-router';
import { useSafeAreaInsets }                      from 'react-native-safe-area-context';
import { LinearGradient }                         from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS }         from '../../constants/theme';
import { EpisodeArtwork }                         from './EpisodeArtwork';
import {
  subscribeToEngine,
  AudioEngine,
  getEngineState,
  type EngineState,
}                                                 from '../../services/GlobalAudioEngine';
import {
  subscribeToVDEngine,
  VoiceDebateEngine,
  getVDEngineState,
  type VoiceDebateEngineState,
}                                                 from '../../services/VoiceDebateAudioEngine';
import type { MiniPlayerState }                   from '../../types/podcast_v2';

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

// ─── Combined Local State ─────────────────────────────────────────────────────

type ContentType = 'podcast' | 'voice_debate';

interface LocalState {
  isVisible:        boolean;
  contentType:      ContentType;
  title:            string;
  subtitle:         string;
  podcastId:        string | null;
  voiceDebateId:    string | null;
  isPlaying:        boolean;
  progressPercent:  number;
  accentColor:      string;
  sourceScreen:     string | null;
  sourceParams:     Record<string, string> | null;
  // Part 41.2
  pausedByOffline:  boolean;
}

const DEFAULT_STATE: LocalState = {
  isVisible:        false,
  contentType:      'podcast',
  title:            '',
  subtitle:         '',
  podcastId:        null,
  voiceDebateId:    null,
  isPlaying:        false,
  progressPercent:  0,
  accentColor:      COLORS.primary,
  sourceScreen:     null,
  sourceParams:     null,
  pausedByOffline:  false,
};

function podcastToLocal(es: EngineState): LocalState {
  const podcast = es.podcast;
  return {
    isVisible:        es.isVisible && !!es.podcastId,
    contentType:      'podcast',
    title:            podcast?.title             ?? '',
    subtitle:         `${podcast?.config?.hostName ?? 'Host'} & ${podcast?.config?.guestName ?? 'Guest'}`,
    podcastId:        es.podcastId,
    voiceDebateId:    null,
    isPlaying:        es.isPlaying,
    progressPercent:  es.progressPercent,
    accentColor:      COLORS.primary,
    sourceScreen:     es.sourceScreen ?? null,
    sourceParams:     es.sourceParams ?? null,
    pausedByOffline:  es.pausedByOffline ?? false,
  };
}

function vdToLocal(es: VoiceDebateEngineState): LocalState {
  const vd = es.voiceDebate;
  return {
    isVisible:        es.isVisible && !!es.voiceDebateId,
    contentType:      'voice_debate',
    title:            vd?.topic ?? 'Voice Debate',
    subtitle:         `Turn ${es.currentTurnIndex + 1} of ${vd?.script?.turns?.length ?? 0}`,
    podcastId:        null,
    voiceDebateId:    es.voiceDebateId,
    isPlaying:        es.isPlaying,
    progressPercent:  es.progressPercent,
    accentColor:      '#6C63FF',
    sourceScreen:     null,
    sourceParams:     null,
    pausedByOffline:  es.pausedByOffline ?? false,
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
    const unsub = subscribeToEngine((es: EngineState) => {
      setPodcastLocal(podcastToLocal(es));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToVDEngine((es: VoiceDebateEngineState) => {
      setVdLocal(vdToLocal(es));
    });
    return unsub;
  }, []);

  // Voice debate takes priority
  const local = vdLocal.isVisible ? vdLocal : podcastLocal;

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

  if (!local.isVisible) return null;

  const tabBarHeight = 64 + insets.bottom;

  // ── Subtitle with offline indicator ───────────────────────────────────────
  const showOfflineLabel = local.pausedByOffline && !local.isPlaying;

  // ── Navigation on body tap ─────────────────────────────────────────────────
  const handleBodyPress = () => {
    if (local.contentType === 'voice_debate' && local.voiceDebateId) {
      router.push({
        pathname: '/(app)/voice-debate-player' as any,
        params:   { voiceDebateId: local.voiceDebateId },
      });
      return;
    }

    if (local.sourceScreen) {
      router.push({
        pathname: local.sourceScreen as any,
        params:   local.sourceParams ?? {},
      });
      return;
    }

    if (local.podcastId) {
      router.push({
        pathname: '/(app)/podcast-player' as any,
        params:   { podcastId: local.podcastId },
      });
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

  // Use a muted amber accent for the progress bar when offline-paused
  const effectiveAccent = showOfflineLabel
    ? COLORS.warning ?? '#F59E0B'
    : local.accentColor;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutDown.duration(200)}
      style={{
        position:        'absolute',
        bottom:          tabBarHeight + 4,
        left:            SPACING.md,
        right:           SPACING.md,
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     showOfflineLabel
                           ? `${COLORS.warning ?? '#F59E0B'}50`
                           : local.contentType === 'voice_debate'
                             ? `${local.accentColor}40`
                             : COLORS.border,
        overflow:        'hidden',
        zIndex:          9990,
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
      <TouchableOpacity
        onPress={handleBodyPress}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row',
          alignItems:    'center',
          gap:           SPACING.sm,
          padding:       SPACING.sm + 2,
        }}
      >
        {/* Artwork / Icon */}
        {local.contentType === 'voice_debate' ? (
          <LinearGradient
            colors={['#1A1035', '#0D0820']}
            style={{
              width:           40,
              height:          40,
              borderRadius:    12,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${local.accentColor}40`,
            }}
          >
            <Ionicons name="mic" size={18} color={local.accentColor} />
          </LinearGradient>
        ) : (
          <EpisodeArtwork title={local.title} size={40} borderRadius={12} />
        )}

        {/* Title + subtitle */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.sm,
              fontWeight: '700',
            }}
            numberOfLines={1}
          >
            {local.title}
          </Text>

          {/* ── Part 41.2: offline label or normal subtitle ── */}
          {showOfflineLabel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons
                name="cloud-offline-outline"
                size={11}
                color={COLORS.warning ?? '#F59E0B'}
              />
              <Text
                style={{
                  color:     COLORS.warning ?? '#F59E0B',
                  fontSize:  FONTS.sizes.xs,
                  fontWeight: '600',
                }}
                numberOfLines={1}
              >
                Paused · Offline
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.xs,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {local.subtitle}
            </Text>
          )}
        </View>

        {/* Play / Pause */}
        <TouchableOpacity
          onPress={handleToggle}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
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
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={{ padding: 4 }}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}