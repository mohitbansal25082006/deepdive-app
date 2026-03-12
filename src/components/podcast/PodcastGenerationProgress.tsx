// src/components/podcast/PodcastGenerationProgress.tsx
// Part 8 — Inline generation progress card.
// Shown inside the podcast tab while the script is being written
// and while audio segments are being generated.

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
}                                       from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { WaveformVisualizer }             from './WaveformVisualizer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PodcastGenerationProgressProps {
  isGeneratingScript: boolean;
  isGeneratingAudio:  boolean;
  scriptGenerated:    boolean;
  audioProgress:      { completed: number; total: number };
  progressMessage:    string;
  onCancel?:          () => void;
}

// ─── Phase step row ───────────────────────────────────────────────────────────

function PhaseStep({
  icon,
  label,
  state,
}: {
  icon:  string;
  label: string;
  state: 'done' | 'active' | 'pending';
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(opacity);
    if (state === 'active') {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(state === 'done' ? 1 : 0.3, { duration: 300 });
    }
  }, [state]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const iconColor =
    state === 'done'   ? COLORS.success :
    state === 'active' ? COLORS.primary :
    COLORS.textMuted;

  const iconName: any =
    state === 'done'   ? 'checkmark-circle' :
    state === 'active' ? (icon as any)      :
    (icon + '-outline' as any);

  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 8 },
        animStyle,
      ]}
    >
      <Ionicons name={iconName} size={16} color={iconColor} />
      <Text style={{
        color:      state === 'pending' ? COLORS.textMuted : COLORS.textSecondary,
        fontSize:   FONTS.sizes.sm,
        fontWeight: state === 'active' ? '700' : '400',
      }}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PodcastGenerationProgress({
  isGeneratingScript,
  isGeneratingAudio,
  scriptGenerated,
  audioProgress,
  progressMessage,
  onCancel,
}: PodcastGenerationProgressProps) {

  const scriptState: 'done' | 'active' | 'pending' =
    scriptGenerated         ? 'done'   :
    isGeneratingScript      ? 'active' :
    'pending';

  const audioState: 'done' | 'active' | 'pending' =
    !scriptGenerated        ? 'pending' :
    isGeneratingAudio       ? 'active'  :
    'done';

  const audioPercent = audioProgress.total > 0
    ? audioProgress.completed / audioProgress.total
    : 0;

  // Progress bar animation
  const barWidth = useSharedValue(0);
  useEffect(() => {
    barWidth.value = withTiming(audioPercent, { duration: 400 });
  }, [audioPercent]);

  const barStyle = useAnimatedStyle(() => ({
    flex: barWidth.value,
  }));

  return (
    <LinearGradient
      colors={['#1A1A35', '#12122A']}
      style={{
        borderRadius: RADIUS.xl,
        padding:      SPACING.lg,
        borderWidth:  1,
        borderColor:  `${COLORS.primary}40`,
        marginBottom: SPACING.md,
      }}
    >
      {/* Header */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   SPACING.md,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width:           40,
            height:          40,
            borderRadius:    12,
            backgroundColor: `${COLORS.primary}20`,
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <WaveformVisualizer
              isPlaying={isGeneratingScript || isGeneratingAudio}
              color={COLORS.primary}
              barWidth={3}
              barGap={2}
              maxHeight={22}
            />
          </View>
          <View>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.base,
              fontWeight: '700',
            }}>
              Generating Podcast
            </Text>
            <Text
              style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {progressMessage}
            </Text>
          </View>
        </View>

        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="close-circle-outline" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Phase steps */}
      <View style={{ gap: 10, marginBottom: SPACING.md }}>
        <PhaseStep icon="document-text" label="Writing podcast script"  state={scriptState} />
        <PhaseStep icon="headset"       label="Generating AI voices"     state={audioState}  />
      </View>

      {/* Audio progress bar */}
      {audioState !== 'pending' && audioProgress.total > 0 && (
        <View>
          <View style={{
            flexDirection:  'row',
            justifyContent: 'space-between',
            marginBottom:   6,
          }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Voice segments
            </Text>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              {audioProgress.completed}/{audioProgress.total}
            </Text>
          </View>

          <View style={{
            height:          6,
            borderRadius:    3,
            backgroundColor: COLORS.backgroundElevated,
            overflow:        'hidden',
            flexDirection:   'row',
          }}>
            <Animated.View style={[barStyle, { backgroundColor: COLORS.primary, borderRadius: 3 }]} />
            <Animated.View
              style={[
                { flex: 1 - audioPercent, backgroundColor: 'transparent' },
              ]}
            />
          </View>
        </View>
      )}
    </LinearGradient>
  );
}