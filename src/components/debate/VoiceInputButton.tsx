// src/components/debate/VoiceInputButton.tsx
// Part 20 — Animated mic button for the Debate tab voice input feature.
//
// States:
//   idle        — purple mic icon, tap to start
//   recording   — pulsing red animation, tap to stop
//   transcribing — spinner, not tappable

import React, { useEffect } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';
import type { DebateVoiceState } from '../../types';

// ─── Duration formatter ───────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceInputButtonProps {
  voiceState:  DebateVoiceState;
  onStart:     () => void;
  onStop:      () => void;
  /** Optional extra style for the outer wrapper */
  style?:      object;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceInputButton({
  voiceState,
  onStart,
  onStop,
  style,
}: VoiceInputButtonProps) {
  const { isRecording, isTranscribing, durationMs } = voiceState;

  // Pulsing ring animation while recording
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(1.0,  { duration: 700, easing: Easing.in(Easing.ease)  }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity:   1.2 - pulse.value * 0.3,
  }));

  // Determine button appearance
  const bgColor = isRecording
    ? COLORS.error
    : isTranscribing
    ? COLORS.warning
    : COLORS.primary;

  const isDisabled = isTranscribing;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Pulsing ring — only visible while recording */}
      {isRecording && (
        <Animated.View
          style={[
            styles.pulseRing,
            { borderColor: `${COLORS.error}60` },
            pulseStyle,
          ]}
          pointerEvents="none"
        />
      )}

      <TouchableOpacity
        onPress={isRecording ? onStop : onStart}
        disabled={isDisabled}
        activeOpacity={isDisabled ? 1 : 0.75}
        style={[
          styles.button,
          { backgroundColor: bgColor },
          isDisabled && styles.buttonDisabled,
        ]}
      >
        {isTranscribing ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons
            name={isRecording ? 'stop' : 'mic'}
            size={20}
            color="#FFF"
          />
        )}
      </TouchableOpacity>

      {/* Duration label below button while recording */}
      {isRecording && (
        <Text style={styles.duration}>
          {formatMs(durationMs)}
        </Text>
      )}

      {isTranscribing && (
        <Text style={styles.transcribingLabel}>
          Transcribing…
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BUTTON_SIZE = 44;

const styles = StyleSheet.create({
  wrapper: {
    alignItems:    'center',
    justifyContent: 'center',
    width:         BUTTON_SIZE + 16,
  },

  pulseRing: {
    position:     'absolute',
    width:         BUTTON_SIZE + 18,
    height:        BUTTON_SIZE + 18,
    borderRadius: (BUTTON_SIZE + 18) / 2,
    borderWidth:   2,
    zIndex:        0,
  },

  button: {
    width:         BUTTON_SIZE,
    height:        BUTTON_SIZE,
    borderRadius:  BUTTON_SIZE / 2,
    alignItems:    'center',
    justifyContent: 'center',
    zIndex:        1,
  },

  buttonDisabled: {
    opacity: 0.75,
  },

  duration: {
    color:      COLORS.error,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    marginTop:  SPACING.xs,
  },

  transcribingLabel: {
    color:      COLORS.warning,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
    marginTop:  SPACING.xs,
  },
});