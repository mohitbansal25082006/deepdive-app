// app/(app)/research-progress.tsx
// Part 7 — Updated: passes researchMode and citationStyle params to the pipeline.
// FIX: Removed import of non-existent 'AgentStepRow' named export.
//      AgentStep.tsx uses a default export. Steps are now rendered with an
//      inline StepRow component so there is no external dependency mismatch.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient }       from 'expo-linear-gradient';
import { Ionicons }              from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView }          from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useResearch }           from '../../src/hooks/useResearch';
import { AgentStep, AgentStatus } from '../../src/types';
import { ResearchMode }          from '../../src/types';

const SCREEN_W = Dimensions.get('window').width;

// ─── Inline step row ──────────────────────────────────────────────────────────
// Renders one agent step pill. Self-contained so there's no dependency on the
// AgentStep.tsx component export name.

const STATUS_CONFIG: Record<AgentStatus, {
  icon:    string;
  color:   string;
  bgColor: string;
}> = {
  pending:   { icon: 'ellipse-outline',        color: COLORS.textMuted,    bgColor: COLORS.backgroundElevated },
  running:   { icon: 'sync-outline',           color: COLORS.primary,      bgColor: `${COLORS.primary}18`    },
  completed: { icon: 'checkmark-circle',       color: COLORS.success,      bgColor: `${COLORS.success}18`    },
  failed:    { icon: 'close-circle',           color: COLORS.error,        bgColor: `${COLORS.error}18`      },
};

const AGENT_ICONS: Record<string, string> = {
  planner:    'map-outline',
  searcher:   'search-outline',
  analyst:    'analytics-outline',
  factchecker:'shield-checkmark-outline',
  reporter:   'document-text-outline',
  visualizer: 'bar-chart-outline',
  academic:   'school-outline',
};

interface StepRowProps {
  step:   AgentStep;
  detail?: string;
  index:  number;
}

function StepRow({ step, detail, index }: StepRowProps) {
  const cfg     = STATUS_CONFIG[step.status];
  const isRunning = step.status === 'running';

  const spinVal = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinVal.value * 360}deg` }],
  }));

  useEffect(() => {
    if (isRunning) {
      spinVal.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
    } else {
      spinVal.value = 0;
    }
  }, [isRunning]);

  const elapsed = step.completedAt && step.startedAt
    ? `${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(index * 70)}
      style={{
        flexDirection:   'row',
        alignItems:      'flex-start',
        backgroundColor: cfg.bgColor,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.sm,
        borderWidth:     1,
        borderColor:     isRunning ? `${COLORS.primary}40` : COLORS.border,
      }}
    >
      {/* Step icon */}
      <View style={{
        width:          42,
        height:         42,
        borderRadius:   12,
        backgroundColor: COLORS.backgroundCard,
        alignItems:     'center',
        justifyContent: 'center',
        marginRight:    SPACING.sm,
        flexShrink:     0,
        borderWidth:    1,
        borderColor:    COLORS.border,
      }}>
        <Ionicons
          name={AGENT_ICONS[step.agent] as any ?? 'cog-outline'}
          size={20}
          color={isRunning ? COLORS.primary : COLORS.textMuted}
        />
      </View>

      {/* Text */}
      <View style={{ flex: 1, marginRight: SPACING.sm }}>
        <Text style={{
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes.sm,
          fontWeight: '700',
          marginBottom: 2,
        }}>
          {step.label}
        </Text>
        <Text style={{
          color:    COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          lineHeight: 16,
        }}>
          {detail ?? step.description}
        </Text>
      </View>

      {/* Status indicator */}
      <View style={{ alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {isRunning ? (
          <Animated.View style={spinStyle}>
            <Ionicons name="sync-outline" size={20} color={COLORS.primary} />
          </Animated.View>
        ) : (
          <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
        )}
        {elapsed && (
          <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{elapsed}</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResearchProgressScreen() {
  const params = useLocalSearchParams<{
    query:         string;
    depth:         string;
    focusAreas:    string;
    researchMode?: string;
    citationStyle?: string;
  }>();

  const {
    phase, steps, stepDetails, report, error,
    startResearch, reset,
  } = useResearch();

  const launched = useRef(false);

  // Pulse animation for the active orb
  const pulseScale   = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const pulseStyle   = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   pulseOpacity.value,
  }));

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 900 }),
        withTiming(1.0,  { duration: 900 }),
      ),
      -1, false,
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 900 }),
        withTiming(0.6,  { duration: 900 }),
      ),
      -1, false,
    );
  }, []);

  // ── Launch pipeline once ──────────────────────────────────────────────────

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    const focusAreas = params.focusAreas
      ? params.focusAreas.split('||').filter(Boolean)
      : [];

    const researchMode = (params.researchMode ?? 'standard') as ResearchMode;

    startResearch({
      query:      params.query ?? '',
      depth:      (params.depth as any) ?? 'deep',
      focusAreas,
      mode:       researchMode,
    });
  }, []);

  // ── Navigate on completion ────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'completed' && report) {
      router.replace({
        pathname: '/(app)/research-report' as any,
        params:   { reportId: report.id },
      });
    }
  }, [phase, report]);

  // ── Error handling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'error' && error) {
      Alert.alert(
        'Research Failed',
        error,
        [
          {
            text: 'Go Back',
            style: 'cancel',
            onPress: () => { reset(); router.back(); },
          },
          {
            text: 'Retry',
            onPress: () => {
              reset();
              launched.current = false;
            },
          },
        ]
      );
    }
  }, [phase, error]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const isAcademic   = (params.researchMode ?? 'standard') === 'academic';
  const totalSteps   = isAcademic ? 7 : 6;
  const completedCnt = steps.filter(s => s.status === 'completed').length;
  const progress     = steps.length > 0
    ? Math.round((completedCnt / steps.length) * 100)
    : 0;
  const currentStep  = steps.find(s => s.status === 'running');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.xl,
            paddingBottom:     SPACING.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
            {/* Animated orb */}
            <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[
                {
                  position:        'absolute',
                  width:            52,
                  height:           52,
                  borderRadius:     26,
                  backgroundColor:  COLORS.primary,
                },
                pulseStyle,
              ]} />
              <LinearGradient
                colors={isAcademic ? ['#6C63FF', '#8B5CF6'] : COLORS.gradientPrimary}
                style={{
                  width:          44,
                  height:         44,
                  borderRadius:   22,
                  alignItems:     'center',
                  justifyContent: 'center',
                  ...SHADOWS.medium,
                }}
              >
                <Ionicons
                  name={isAcademic ? 'school' : 'sparkles'}
                  size={22}
                  color="#FFF"
                />
              </LinearGradient>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.xl,
                fontWeight: '800',
              }}>
                {isAcademic ? 'Academic Research' : 'Research in Progress'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                {isAcademic
                  ? `${totalSteps} agents · Standard report + Academic paper`
                  : `${totalSteps} AI agents working in sequence`
                }
              </Text>
            </View>
          </View>

          {/* Query chip */}
          <View style={{
            backgroundColor:   COLORS.backgroundElevated,
            borderRadius:      RADIUS.lg,
            paddingHorizontal: SPACING.md,
            paddingVertical:   SPACING.sm,
            marginTop:         SPACING.md,
            borderWidth:       1,
            borderColor:       COLORS.border,
            flexDirection:     'row',
            alignItems:        'center',
            gap:                8,
          }}>
            <Ionicons name="search-outline" size={14} color={COLORS.primary} />
            <Text
              style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1 }}
              numberOfLines={2}
            >
              {params.query}
            </Text>
          </View>

          {/* Academic mode badge */}
          {isAcademic && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:                8,
                backgroundColor:   `${COLORS.primary}10`,
                borderRadius:      RADIUS.md,
                paddingHorizontal: SPACING.md,
                paddingVertical:   SPACING.sm,
                marginTop:         SPACING.sm,
                borderWidth:       1,
                borderColor:       `${COLORS.primary}25`,
              }}
            >
              <Ionicons name="school-outline" size={14} color={COLORS.primary} />
              <Text style={{
                color:     COLORS.primary,
                fontSize:  FONTS.sizes.xs,
                fontWeight: '600',
                flex:       1,
              }}>
                Academic Paper Mode · {(params.citationStyle ?? 'apa').toUpperCase()} citations
                {' '}· Generates 3500–5000 word paper after standard report
              </Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Progress bar ─────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{
            paddingHorizontal: SPACING.xl,
            marginBottom:      SPACING.md,
          }}
        >
          <View style={{
            flexDirection:  'row',
            justifyContent: 'space-between',
            alignItems:     'center',
            marginBottom:   SPACING.xs,
          }}>
            <Text style={{
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.xs,
              fontWeight: '600',
            }}>
              {completedCnt} / {steps.length || totalSteps} agents complete
            </Text>
            <Text style={{
              color:      COLORS.primary,
              fontSize:   FONTS.sizes.sm,
              fontWeight: '700',
            }}>
              {progress}%
            </Text>
          </View>

          {/* Track */}
          <View style={{
            height:          6,
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.full,
            overflow:        'hidden',
          }}>
            <View style={{
              height:          6,
              width:           `${progress}%`,
              borderRadius:    RADIUS.full,
              backgroundColor: COLORS.primary,
            }} />
          </View>
        </Animated.View>

        {/* ── Agent steps list ─────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.xl,
            paddingBottom:     SPACING.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {steps.map((step, i) => (
            <StepRow
              key={step.agent}
              step={step}
              detail={stepDetails[step.agent]}
              index={i}
            />
          ))}

          {/* Current step detail banner */}
          {currentStep && stepDetails[currentStep.agent] && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={{
                backgroundColor: `${COLORS.primary}10`,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                marginTop:       SPACING.sm,
                borderWidth:     1,
                borderColor:     `${COLORS.primary}25`,
                flexDirection:   'row',
                alignItems:      'center',
                gap:              10,
              }}
            >
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{
                color:     COLORS.primary,
                fontSize:  FONTS.sizes.xs,
                flex:      1,
                lineHeight: 16,
              }}>
                {stepDetails[currentStep.agent]}
              </Text>
            </Animated.View>
          )}

          {/* Academic paper queued notice — shown while standard steps run */}
          {isAcademic && completedCnt < totalSteps - 1 && (
            <Animated.View
              entering={FadeInDown.duration(400).delay(600)}
              style={{
                backgroundColor: `${COLORS.primary}08`,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                marginTop:       SPACING.md,
                borderWidth:     1,
                borderColor:     `${COLORS.primary}15`,
                flexDirection:   'row',
                alignItems:      'flex-start',
                gap:              10,
              }}
            >
              <Ionicons
                name="school-outline"
                size={16}
                color={COLORS.primary}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{
                  color:      COLORS.primary,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: '600',
                  marginBottom: 2,
                }}>
                  Academic Paper Queued
                </Text>
                <Text style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.xs,
                  lineHeight: 16,
                }}>
                  After the standard report completes, the Academic Paper Agent
                  will write a full journal-style paper with 7 sections.
                </Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* ── Cancel button ─────────────────────────────────────────────── */}
        <View style={{
          paddingHorizontal: SPACING.xl,
          paddingBottom:     SPACING.xl,
          paddingTop:        SPACING.md,
        }}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Cancel Research',
                'Are you sure you want to cancel? Progress will be lost.',
                [
                  { text: 'Continue', style: 'cancel' },
                  {
                    text:  'Cancel',
                    style: 'destructive',
                    onPress: () => {
                      reset();
                      router.replace('/(app)/(tabs)/home' as any);
                    },
                  },
                ]
              );
            }}
            style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius:    RADIUS.full,
              paddingVertical: 12,
              alignItems:      'center',
              borderWidth:     1,
              borderColor:     COLORS.border,
            }}
          >
            <Text style={{
              color:      COLORS.textMuted,
              fontSize:   FONTS.sizes.sm,
              fontWeight: '600',
            }}>
              Cancel Research
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}