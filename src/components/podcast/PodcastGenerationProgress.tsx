// src/components/podcast/PodcastGenerationProgress.tsx
// Part 19 — Updated:
//   • Added "Web Search" phase step shown when SerpAPI is active
//   • Shows real estimated duration based on accurate 125 WPM TTS rate
//   • Progress message includes web-grounded indicator
//   • Cancel button is more prominent

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
  isGeneratingScript:  boolean;
  isGeneratingAudio:   boolean;
  scriptGenerated:     boolean;
  audioProgress:       { completed: number; total: number };
  progressMessage:     string;
  targetDurationMins?: number;
  webSearchActive?:    boolean;
  onCancel?:           () => void;
}

// ─── Phase Step Row ───────────────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending';

function PhaseStep({
  icon,
  label,
  sublabel,
  state,
}: {
  icon:      string;
  label:     string;
  sublabel?: string;
  state:     StepState;
}) {
  const opacity = useSharedValue(state === 'pending' ? 0.35 : 1);

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
      opacity.value = withTiming(state === 'done' ? 1 : 0.35, { duration: 300 });
    }
  }, [state]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const iconColor =
    state === 'done'   ? COLORS.success :
    state === 'active' ? COLORS.primary :
    COLORS.textMuted;

  const iconName: any =
    state === 'done'   ? 'checkmark-circle' :
    state === 'active' ? (icon as any) :
    (icon + '-outline' as any);

  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, animStyle]}>
      {/* Step indicator */}
      <View style={{
        width:           28,
        height:          28,
        borderRadius:    8,
        backgroundColor: state === 'done'
          ? `${COLORS.success}18`
          : state === 'active'
            ? `${COLORS.primary}18`
            : `${COLORS.textMuted}10`,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1,
        borderColor:     state === 'done'
          ? `${COLORS.success}30`
          : state === 'active'
            ? `${COLORS.primary}30`
            : COLORS.border,
      }}>
        <Ionicons name={iconName} size={14} color={iconColor} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{
          color:      state === 'pending' ? COLORS.textMuted : COLORS.textSecondary,
          fontSize:   FONTS.sizes.sm,
          fontWeight: state === 'active' ? '700' : '500',
        }}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{
            color:     COLORS.textMuted,
            fontSize:  FONTS.sizes.xs,
            marginTop: 1,
          }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {state === 'active' && (
        <View style={{
          backgroundColor: `${COLORS.primary}20`,
          borderRadius:    RADIUS.full,
          paddingHorizontal: 8,
          paddingVertical:   3,
          borderWidth:     1,
          borderColor:     `${COLORS.primary}35`,
        }}>
          <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>
            RUNNING
          </Text>
        </View>
      )}
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
  targetDurationMins,
  webSearchActive,
  onCancel,
}: PodcastGenerationProgressProps) {

  // Determine step states
  // Step 1: Web Search (only shown when SerpAPI active)
  // Step 2: Script Writing
  // Step 3: Audio Generation
  const searchState: StepState =
    !webSearchActive               ? 'done'    :   // not applicable → skip visual
    scriptGenerated                ? 'done'    :
    isGeneratingScript             ? 'active'  :
    'pending';

  const scriptState: StepState =
    scriptGenerated                ? 'done'    :
    isGeneratingScript             ? 'active'  :
    'pending';

  const audioState: StepState =
    !scriptGenerated               ? 'pending' :
    isGeneratingAudio              ? 'active'  :
    audioProgress.completed > 0    ? 'done'    :
    'pending';

  const audioPercent = audioProgress.total > 0
    ? audioProgress.completed / audioProgress.total
    : 0;

  // Progress bar fill animation
  const barFill = useSharedValue(0);
  useEffect(() => {
    barFill.value = withTiming(audioPercent, { duration: 400 });
  }, [audioPercent]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barFill.value * 100}%` as any,
  }));

  // Overall progress calculation for the header bar
  // Web search ~5%, script ~35%, audio ~60%
  const overallProgress =
    scriptGenerated
      ? 0.4 + (audioPercent * 0.6)
      : isGeneratingScript
        ? 0.05 + 0.35 * 0.5   // midway through script
        : 0.02;

  const overallBarFill = useSharedValue(0);
  useEffect(() => {
    overallBarFill.value = withTiming(overallProgress, { duration: 600 });
  }, [overallProgress]);

  const overallBarStyle = useAnimatedStyle(() => ({
    width: `${overallBarFill.value * 100}%` as any,
  }));

  // Estimated time remaining
  const estimatedMinLabel = targetDurationMins
    ? `~${targetDurationMins} min episode`
    : undefined;

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
      {/* ── Header ── */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   SPACING.md,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{
            width:           42,
            height:          42,
            borderRadius:    13,
            backgroundColor: `${COLORS.primary}20`,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     `${COLORS.primary}30`,
          }}>
            <WaveformVisualizer
              isPlaying={isGeneratingScript || isGeneratingAudio}
              color={COLORS.primary}
              barWidth={3}
              barGap={2}
              maxHeight={22}
            />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
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
              numberOfLines={2}
            >
              {progressMessage}
            </Text>
          </View>
        </View>

        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{
              width:           34,
              height:          34,
              borderRadius:    10,
              backgroundColor: `${COLORS.error}15`,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${COLORS.error}25`,
              marginLeft:      SPACING.sm,
            }}
          >
            <Ionicons name="stop-outline" size={16} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Overall progress bar ── */}
      <View style={{
        height:          4,
        borderRadius:    2,
        backgroundColor: COLORS.backgroundElevated,
        overflow:        'hidden',
        marginBottom:    SPACING.md,
      }}>
        <Animated.View style={[
          overallBarStyle,
          { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
        ]} />
      </View>

      {/* ── Phase steps ── */}
      <View style={{ gap: 10, marginBottom: SPACING.md }}>
        {webSearchActive && (
          <PhaseStep
            icon="search"
            label="Searching the web"
            sublabel="Pulling latest facts & data via SerpAPI"
            state={searchState}
          />
        )}

        <PhaseStep
          icon="document-text"
          label="Writing podcast script"
          sublabel={estimatedMinLabel
            ? `AI dialogue for ${estimatedMinLabel}`
            : 'AI-generated natural dialogue'
          }
          state={scriptState}
        />

        <PhaseStep
          icon="headset"
          label="Generating AI voices"
          sublabel={
            audioState === 'active' && audioProgress.total > 0
              ? `${audioProgress.completed}/${audioProgress.total} voice segments`
              : 'OpenAI TTS rendering'
          }
          state={audioState}
        />
      </View>

      {/* ── Audio segment progress bar ── */}
      {audioState !== 'pending' && audioProgress.total > 0 && (
        <View>
          <View style={{
            flexDirection:  'row',
            justifyContent: 'space-between',
            alignItems:     'center',
            marginBottom:   6,
          }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Voice segments
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{
                color:      COLORS.primary,
                fontSize:   FONTS.sizes.xs,
                fontWeight: '700',
              }}>
                {audioProgress.completed}/{audioProgress.total}
              </Text>
              {audioState === 'done' && (
                <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
              )}
            </View>
          </View>

          <View style={{
            height:          6,
            borderRadius:    3,
            backgroundColor: COLORS.backgroundElevated,
            overflow:        'hidden',
          }}>
            <Animated.View style={[
              barStyle,
              {
                height:          '100%',
                backgroundColor: audioState === 'done' ? COLORS.success : COLORS.primary,
                borderRadius:    3,
              },
            ]} />
          </View>

          {/* Duration estimate */}
          {targetDurationMins && audioState === 'active' && (
            <Text style={{
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.xs,
              marginTop: 6,
              textAlign: 'center',
            }}>
              Generating ~{targetDurationMins} min of audio · This may take a few minutes
            </Text>
          )}
        </View>
      )}

      {/* ── Web-grounded badge ── */}
      {webSearchActive && scriptGenerated && (
        <View style={{
          flexDirection:    'row',
          alignItems:       'center',
          gap:              6,
          marginTop:        SPACING.sm,
          backgroundColor:  `${COLORS.success}10`,
          borderRadius:     RADIUS.md,
          paddingHorizontal: SPACING.sm,
          paddingVertical:   6,
          borderWidth:      1,
          borderColor:      `${COLORS.success}20`,
        }}>
          <Ionicons name="globe-outline" size={12} color={COLORS.success} />
          <Text style={{
            color:      COLORS.success,
            fontSize:   FONTS.sizes.xs,
            fontWeight: '600',
          }}>
            Script grounded with live web research
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}