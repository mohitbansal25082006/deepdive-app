// src/components/research/AgentStep.tsx
// Animated card for a single agent step in the progress screen.
// Shows status icon, label, timing, and live detail text.
//
// ── Part 55.1A — THEME SYSTEM ─────────────────────────────────────────────────
//   AGENT_GRADIENTS was a MODULE-LEVEL map of hardcoded hex tuples, so the agent
//   accents were frozen to the default palette and never recolored on a theme
//   switch. It is now produced by getAgentGradients(), a render-time function that
//   maps each agent to a hue drawn from the LIVE palette (primary / info /
//   secondary / success / accent …). Each agent keeps a distinct identity while
//   following the active theme. The hardcoded done-state ['#43E97B','#38F9D7'] and
//   pending ['#2A2A4A','#1A1A35'] gradients are likewise theme-derived now.
//
//   WORKLETS-SAFE: pulseStyle only animates `opacity` from a shared value — it
//   never reads COLORS — so it was already safe and is unchanged.

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeInDown,
} from 'react-native-reanimated';
import { AgentStep as AgentStepType } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const AGENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  planner: 'map-outline',
  searcher: 'search-outline',
  analyst: 'analytics-outline',
  factchecker: 'shield-checkmark-outline',
  reporter: 'document-text-outline',
};

// Part 55.1A: per-agent accent gradients derived from the LIVE palette (was a
// module-level hardcoded map). Each agent maps to a palette role so identities
// stay distinct AND themed.
function getAgentGradients(): Record<string, readonly [string, string]> {
  return {
    planner:     [COLORS.primary,   COLORS.secondary],
    searcher:    [COLORS.info,       COLORS.primary],
    analyst:     [COLORS.warning,    COLORS.error],
    factchecker: [COLORS.success,    `${COLORS.success}CC`],
    reporter:    [COLORS.accent,     COLORS.error],
  };
}

interface Props {
  step: AgentStepType;
  detail?: string;
  index: number;
}

export function AgentStepCard({ step, detail, index }: Props) {
  const pulseAnim = useSharedValue(1);
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    if (step.status === 'running') {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
      progressAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(1);
      if (step.status === 'completed') {
        progressAnim.value = withTiming(1, { duration: 300 });
      }
    }
  }, [step.status]);

  // Worklet-safe: only reads the shared value, never COLORS.
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: step.status === 'running' ? pulseAnim.value : 1,
  }));

  // Part 55.1A: resolve gradients at render from the live palette.
  const AGENT_GRADIENTS = getAgentGradients();
  const iconBg = AGENT_GRADIENTS[step.agent] ?? COLORS.gradientPrimary;
  const isRunning = step.status === 'running';
  const isDone = step.status === 'completed';
  const isFailed = step.status === 'failed';
  const isPending = step.status === 'pending';

  const duration = step.startedAt && step.completedAt
    ? ((step.completedAt - step.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 80)}
      style={{
        backgroundColor: isRunning
          ? `${COLORS.primary}12`
          : COLORS.backgroundCard,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: isRunning
          ? `${COLORS.primary}40`
          : isDone
          ? `${COLORS.success}30`
          : isFailed
          ? `${COLORS.error}30`
          : COLORS.border,
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      {/* Icon */}
      <Animated.View style={[{ marginRight: SPACING.md }, isRunning ? pulseStyle : {}]}>
        {isDone ? (
          <LinearGradient
            colors={[COLORS.success, `${COLORS.success}AA`]}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={22} color="#FFF" />
          </LinearGradient>
        ) : isFailed ? (
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: `${COLORS.error}20`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="close" size={22} color={COLORS.error} />
          </View>
        ) : (
          <LinearGradient
            colors={isPending ? [COLORS.backgroundElevated, COLORS.backgroundCard] : (iconBg as [string, string])}
            style={{
              width: 44, height: 44, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={AGENT_ICONS[step.agent] ?? 'ellipse-outline'}
              size={22}
              color="#FFF"
            />
          </LinearGradient>
        )}
      </Animated.View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{
            color: isPending ? COLORS.textMuted : COLORS.textPrimary,
            fontSize: FONTS.sizes.base,
            fontWeight: '600',
          }}>
            {step.label}
          </Text>
          {duration && (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {duration}s
            </Text>
          )}
          {isRunning && (
            <View style={{
              backgroundColor: `${COLORS.primary}20`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                LIVE
              </Text>
            </View>
          )}
        </View>

        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.sm,
          marginTop: 2,
        }}>
          {step.description}
        </Text>

        {/* Live detail text */}
        {(isRunning || isDone) && detail && (
          <Text style={{
            color: isRunning ? COLORS.primary : COLORS.textSecondary,
            fontSize: FONTS.sizes.xs,
            marginTop: 6,
            lineHeight: 16,
          }}>
            {detail}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}