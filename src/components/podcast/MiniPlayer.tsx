// src/components/podcast/MiniPlayer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Refactored in Part 39 Fix (final).
//
// CHANGES:
//   • MiniPlayer now subscribes to GlobalAudioEngine directly for its own state
//   • This ensures the progress bar updates in real-time as audio plays,
//     even when podcast-player screen is not mounted
//   • Play/pause button now calls AudioEngine.toggle() directly (no event bus needed)
//   • Dismiss button calls AudioEngine.stop()
//   • Body tap navigates to podcast-player; on arrival, AudioEngine.reattach()
//     restores exact position
//
// BACKWARD COMPAT:
//   • MiniPlayerBus is still exported (podcast-player.tsx subscribes to 'dismiss')
//     but 'toggle' events are no longer used (AudioEngine handles toggle directly)
//   • MiniPlayerProps kept for any code that passes state prop
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState }                from 'react';
import { View, Text, TouchableOpacity, Platform }     from 'react-native';
import { Ionicons }                                   from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeOutDown,
  useSharedValue, useAnimatedStyle, withTiming,
}                                                     from 'react-native-reanimated';
import { router }                                     from 'expo-router';
import { useSafeAreaInsets }                          from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS }             from '../../constants/theme';
import { EpisodeArtwork }                             from './EpisodeArtwork';
import {
  subscribeToEngine,
  AudioEngine,
  getEngineState,
  type EngineState,
} from '../../services/GlobalAudioEngine';
import type { MiniPlayerState }                       from '../../types/podcast_v2';

// ─── Mini Player Bus ──────────────────────────────────────────────────────────
// Kept for backward compat. 'toggle' is no longer used but 'dismiss' is
// still listened to by podcast-player.tsx to save progress on dismiss.

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

// ─── Local State from Engine ──────────────────────────────────────────────────

interface LocalState {
  isVisible:       boolean;
  podcastId:       string | null;
  podcastTitle:    string;
  hostName:        string;
  guestName:       string;
  isPlaying:       boolean;
  progressPercent: number;
}

function engineToLocal(es: EngineState): LocalState {
  const podcast = es.podcast;
  return {
    isVisible:       es.isVisible && es.podcastId !== null,
    podcastId:       es.podcastId,
    podcastTitle:    podcast?.title               ?? '',
    hostName:        podcast?.config?.hostName    ?? 'Host',
    guestName:       podcast?.config?.guestName   ?? 'Guest',
    isPlaying:       es.isPlaying,
    progressPercent: es.progressPercent,
  };
}

// ─── Props (kept for backward compat but no longer required) ──────────────────

interface MiniPlayerProps {
  /** @deprecated No longer used — MiniPlayer subscribes to engine directly */
  state?: MiniPlayerState;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MiniPlayer(_props: MiniPlayerProps) {
  const insets = useSafeAreaInsets();

  // Subscribe to engine state directly — no prop drilling needed
  const [local, setLocal] = useState<LocalState>(() => engineToLocal(getEngineState()));

  useEffect(() => {
    const unsub = subscribeToEngine((es: EngineState) => {
      setLocal(engineToLocal(es));
    });
    return unsub;
  }, []);

  const progressFill = useSharedValue(local.progressPercent);

  useEffect(() => {
    progressFill.value = withTiming(
      Math.min(1, Math.max(0, local.progressPercent)),
      { duration: 200 }
    );
  }, [local.progressPercent]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progressFill.value * 100))}%` as any,
  }));

  if (!local.isVisible || !local.podcastId) return null;

  const tabBarHeight = 64 + insets.bottom;

  const handleBodyPress = () => {
    if (local.podcastId) {
      router.push({
        pathname: '/(app)/podcast-player' as any,
        params:   { podcastId: local.podcastId },
      });
    }
  };

  const handleToggle = async () => {
    await AudioEngine.toggle();
  };

  const handleDismiss = async () => {
    MiniPlayerBus.emit('dismiss');
    await AudioEngine.stop();
  };

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
        borderColor:     COLORS.border,
        overflow:        'hidden',
        zIndex:          9990,
        ...Platform.select({
          ios:     { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
          android: { elevation: 10 },
        }),
      }}
    >
      {/* Progress strip */}
      <View style={{ height: 2, backgroundColor: COLORS.backgroundElevated }}>
        <Animated.View style={[progressStyle, { height: '100%', backgroundColor: COLORS.primary }]} />
      </View>

      {/* Content row */}
      <TouchableOpacity
        onPress={handleBodyPress}
        activeOpacity={0.85}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm + 2 }}
      >
        {/* Artwork */}
        <EpisodeArtwork title={local.podcastTitle} size={40} borderRadius={12} />

        {/* Title + speakers */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {local.podcastTitle}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={1}>
            {local.hostName} & {local.guestName}
          </Text>
        </View>

        {/* Play / Pause */}
        <TouchableOpacity
          onPress={handleToggle}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={{
            width:           38,
            height:          38,
            borderRadius:    19,
            backgroundColor: COLORS.primary,
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