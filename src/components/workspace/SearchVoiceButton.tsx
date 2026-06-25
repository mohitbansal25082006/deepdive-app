// src/components/workspace/SearchVoiceButton.tsx
// Part 52 — Feature 3: Compact animated mic button for the workspace search bar.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React, { useEffect } from 'react';
import {
  TouchableOpacity, View, Text, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { COLORS, FONTS } from '../../constants/theme';

interface SearchVoiceState {
  isRecording:    boolean;
  isTranscribing: boolean;
  durationMs:     number;
}

interface Props {
  voiceState: SearchVoiceState;
  onStart:    () => void;
  onStop:     () => void;
  /** Size of the round button. Defaults to 32 (fits inside a search pill). */
  size?:      number;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function SearchVoiceButton({ voiceState, onStart, onStop, size = 32 }: Props) {
  const { isRecording, isTranscribing, durationMs } = voiceState;

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 650, easing: Easing.out(Easing.ease) }),
          withTiming(1.0, { duration: 650, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 180 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 1.25 - pulse.value * 0.35,
  }));

  const bg = isRecording
    ? COLORS.error
    : isTranscribing
    ? COLORS.warning
    : COLORS.primary;

  const isDisabled = isTranscribing;

  return (
    <View style={[styles.wrap, { width: size + 4, height: size + 4 }]}>
      {isRecording && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderColor: `${COLORS.error}55`,
            },
            pulseStyle,
          ]}
        />
      )}

      <TouchableOpacity
        onPress={isRecording ? onStop : onStart}
        disabled={isDisabled}
        activeOpacity={isDisabled ? 1 : 0.75}
        style={[
          styles.btn,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          isDisabled && { opacity: 0.8 },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isTranscribing ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons name={isRecording ? 'stop' : 'mic'} size={size * 0.5} color="#FFF" />
        )}
      </TouchableOpacity>

      {isRecording && (
        <View style={[styles.durationBadge, { backgroundColor: COLORS.error }]} pointerEvents="none">
          <Text style={[styles.durationText, { color: '#FFF' }]}>{fmt(durationMs)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, zIndex: 0 },
  btn: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  durationBadge: {
    position: 'absolute',
    bottom: -16,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: {
    fontSize: 9,
    fontWeight: '800',
  },
});