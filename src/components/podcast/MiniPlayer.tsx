// src/components/podcast/MiniPlayer.tsx
// Part 39 — Persistent Mini Player
//
// A compact bottom bar that persists while the user navigates away from
// the podcast player. Shows title, speaker names, play/pause, and a
// thin progress strip at the top.
//
// Usage:
//   - Mounted in app/(app)/(tabs)/_layout.tsx above the tab bar
//   - Visible when miniPlayerState.isVisible === true
//   - Tapping body → navigates to podcast-player
//   - Play/pause button controls the active usePodcastPlayer instance
//     via a global event emitter (MiniPlayerBus)

import React                                     from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons }                              from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeOutDown, useSharedValue,
  useAnimatedStyle, withTiming,
}                                               from 'react-native-reanimated';
import { router }                               from 'expo-router';
import { useSafeAreaInsets }                    from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS }       from '../../constants/theme';
import { EpisodeArtwork }                       from './EpisodeArtwork';
import type { MiniPlayerState }                 from '../../types/podcast_v2';

// ─── Mini Player Bus ──────────────────────────────────────────────────────────
// Simple event system so MiniPlayer can trigger play/pause without
// needing a shared context. The podcast player subscribes on mount.

type MiniPlayerEvent = 'toggle' | 'dismiss';
type MiniPlayerListener = (event: MiniPlayerEvent) => void;

class MiniPlayerEventBus {
  private listeners: MiniPlayerListener[] = [];
  emit = (event: MiniPlayerEvent) => this.listeners.forEach(l => l(event));
  subscribe = (listener: MiniPlayerListener) => {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  };
}

export const MiniPlayerBus = new MiniPlayerEventBus();

// ─── Props ────────────────────────────────────────────────────────────────────

interface MiniPlayerProps {
  state: MiniPlayerState;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MiniPlayer({ state }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();

  const progressFill = useSharedValue(state.progressPercent);
  React.useEffect(() => {
    progressFill.value = withTiming(state.progressPercent, { duration: 300 });
  }, [state.progressPercent]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progressFill.value * 100))}%` as any,
  }));

  if (!state.isVisible || !state.podcastId) return null;

  const tabBarHeight = 64 + insets.bottom;

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
        // Subtle elevation
        ...Platform.select({
          ios:     { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
          android: { elevation: 10 },
        }),
      }}
    >
      {/* Progress strip at top */}
      <View style={{ height: 2, backgroundColor: COLORS.backgroundElevated }}>
        <Animated.View style={[progressStyle, { height: '100%', backgroundColor: COLORS.primary }]} />
      </View>

      {/* Content row */}
      <TouchableOpacity
        onPress={() => {
          if (state.podcastId) {
            router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: state.podcastId } });
          }
        }}
        activeOpacity={0.85}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm + 2 }}
      >
        {/* Artwork */}
        <EpisodeArtwork title={state.podcastTitle} size={40} borderRadius={12} />

        {/* Title + speakers */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {state.podcastTitle}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={1}>
            {state.hostName} & {state.guestName}
          </Text>
        </View>

        {/* Play / Pause */}
        <TouchableOpacity
          onPress={() => MiniPlayerBus.emit('toggle')}
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
            name={state.isPlaying ? 'pause' : 'play'}
            size={16}
            color="#FFF"
            style={{ marginLeft: state.isPlaying ? 0 : 1 }}
          />
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity
          onPress={() => MiniPlayerBus.emit('dismiss')}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={{ padding: 4 }}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}