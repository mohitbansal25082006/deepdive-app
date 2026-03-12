// src/components/debate/DebateProgressIndicator.tsx
// Part 9 — Shows real-time progress of all 6 debate agents running in parallel.
//
// Each agent row cycles through: pending → searching → thinking → completed/failed
// A global progress bar tracks overall completion.

import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
}                          from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { DebateAgentProgressItem }        from '../../types';

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  color,
}: {
  status: DebateAgentProgressItem['status'];
  color:  string;
}) {
  if (status === 'completed') {
    return (
      <View style={{
        width:           22,
        height:          22,
        borderRadius:    11,
        backgroundColor: `${COLORS.success}20`,
        alignItems:      'center',
        justifyContent:  'center',
      }}>
        <Ionicons name="checkmark" size={13} color={COLORS.success} />
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={{
        width:           22,
        height:          22,
        borderRadius:    11,
        backgroundColor: `${COLORS.error}20`,
        alignItems:      'center',
        justifyContent:  'center',
      }}>
        <Ionicons name="close" size={13} color={COLORS.error} />
      </View>
    );
  }

  if (status === 'pending') {
    return (
      <View style={{
        width:           22,
        height:          22,
        borderRadius:    11,
        backgroundColor: `${color}15`,
        borderWidth:     1,
        borderColor:     `${color}30`,
      }} />
    );
  }

  // searching or thinking
  return <ActivityIndicator size="small" color={color} style={{ width: 22, height: 22 }} />;
}

// ─── Individual agent row ─────────────────────────────────────────────────────

function AgentRow({
  item,
  index,
}: {
  item:  DebateAgentProgressItem;
  index: number;
}) {
  const isActive = item.status === 'searching' || item.status === 'thinking';
  const isDone   = item.status === 'completed';
  const isFailed = item.status === 'failed';

  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isActive) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      opacity.value = withTiming(1, { duration: 300 });
    }
  }, [isActive]);

  const rowStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const statusLabel =
    item.status === 'pending'   ? 'Waiting...'   :
    item.status === 'searching' ? 'Searching web...' :
    item.status === 'thinking'  ? 'Forming arguments...' :
    item.status === 'completed' ? (item.detail ?? 'Done') :
    item.status === 'failed'    ? (item.detail ?? 'Failed') :
    '';

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(index * 60)}
      style={[
        {
          flexDirection:   'row',
          alignItems:      'center',
          gap:             12,
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.md,
          backgroundColor:
            isDone   ? `${item.color}08`   :
            isActive ? `${item.color}12`   :
            isFailed ? `${COLORS.error}08` :
            'transparent',
          borderRadius:   RADIUS.md,
          marginBottom:   4,
          borderWidth:    isActive ? 1 : 0,
          borderColor:    `${item.color}25`,
        },
        rowStyle,
      ]}
    >
      {/* Agent icon */}
      <View style={{
        width:           36,
        height:          36,
        borderRadius:    11,
        backgroundColor: `${item.color}18`,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     isDone ? 1 : 0,
        borderColor:     `${item.color}35`,
      }}>
        <Ionicons name={item.icon as any} size={17} color={item.color} />
      </View>

      {/* Label + status */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{
          color:      isDone ? item.color : COLORS.textPrimary,
          fontSize:   FONTS.sizes.sm,
          fontWeight: isDone ? '700' : '600',
          marginBottom: 2,
        }}>
          {item.label}
        </Text>
        <Text
          style={{
            color:    isFailed ? COLORS.error : COLORS.textMuted,
            fontSize: FONTS.sizes.xs,
            lineHeight: 16,
          }}
          numberOfLines={1}
        >
          {statusLabel}
        </Text>
      </View>

      {/* Status icon */}
      <StatusIcon status={item.status} color={item.color} />
    </Animated.View>
  );
}

// ─── Global progress bar ──────────────────────────────────────────────────────

function GlobalProgressBar({
  percent,
  isModerating,
}: {
  percent:     number;
  isModerating: boolean;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(percent, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [percent]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <View style={{
        flexDirection:   'row',
        justifyContent:  'space-between',
        alignItems:      'center',
        marginBottom:    8,
      }}>
        <Text style={{
          color:      COLORS.textSecondary,
          fontSize:   FONTS.sizes.sm,
          fontWeight: '600',
        }}>
          {isModerating
            ? '🎯 Moderator synthesising...'
            : `${percent}% Complete`}
        </Text>
        <Text style={{
          color:     COLORS.primary,
          fontSize:  FONTS.sizes.sm,
          fontWeight: '700',
        }}>
          {percent}%
        </Text>
      </View>

      <View style={{
        height:          8,
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    4,
        overflow:        'hidden',
      }}>
        <Animated.View style={[{ height: '100%', borderRadius: 4 }, barStyle]}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DebateProgressIndicatorProps {
  agentProgress:   DebateAgentProgressItem[];
  progressPercent: number;
  progressMessage: string;
  isModerating:    boolean;
  onCancel?:       () => void;
}

export function DebateProgressIndicator({
  agentProgress,
  progressPercent,
  progressMessage,
  isModerating,
  onCancel,
}: DebateProgressIndicatorProps) {
  const completedCount = agentProgress.filter(p => p.status === 'completed').length;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.lg,
        borderWidth:     1,
        borderColor:     COLORS.border,
        marginBottom:    SPACING.lg,
      }}>
        {/* Header */}
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          gap:            10,
          marginBottom:   SPACING.lg,
        }}>
          <View style={{
            width:           40,
            height:          40,
            borderRadius:    12,
            backgroundColor: `${COLORS.primary}18`,
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <Ionicons name="people-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.base,
              fontWeight: '800',
            }}>
              Debate in Progress
            </Text>
            <Text style={{
              color:    COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 2,
            }}>
              {completedCount}/{agentProgress.length} agents completed
            </Text>
          </View>
          {onCancel && (
            <View
              onTouchEnd={onCancel}
              style={{
                padding: 4,
              }}
            >
              <Ionicons name="close-circle-outline" size={22} color={COLORS.textMuted} />
            </View>
          )}
        </View>

        {/* Global progress bar */}
        <GlobalProgressBar
          percent={progressPercent}
          isModerating={isModerating}
        />

        {/* Status message */}
        {progressMessage ? (
          <View style={{
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.md,
            padding:         SPACING.sm + 2,
            marginBottom:    SPACING.md,
            flexDirection:   'row',
            alignItems:      'center',
            gap:             8,
          }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text
              style={{
                flex:       1,
                color:      COLORS.textSecondary,
                fontSize:   FONTS.sizes.xs,
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {progressMessage}
            </Text>
          </View>
        ) : null}

        {/* Agent rows */}
        <View>
          {agentProgress.map((item, i) => (
            <AgentRow key={item.role} item={item} index={i} />
          ))}
        </View>

        {/* Moderator row when active */}
        {isModerating && (
          <Animated.View
            entering={FadeIn.duration(400)}
            style={{
              marginTop:       SPACING.sm,
              flexDirection:   'row',
              alignItems:      'center',
              gap:             12,
              padding:         SPACING.md,
              backgroundColor: `${COLORS.primary}10`,
              borderRadius:    RADIUS.md,
              borderWidth:     1,
              borderColor:     `${COLORS.primary}25`,
            }}
          >
            <ActivityIndicator size="small" color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{
                color:      COLORS.primary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                Moderator Agent
              </Text>
              <Text style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
              }}>
                Synthesising all perspectives...
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}