// app/(app)/research-progress.tsx
// Real-time progress screen — shown while the multi-agent pipeline runs.
// Displays each agent's live status, details, and an animated progress bar.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { AgentStepCard } from '../../src/components/research/AgentStep';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ResearchDepth } from '../../src/types';
import { useResearch } from '../../src/hooks/useResearch';

export default function ResearchProgressScreen() {
  const params = useLocalSearchParams<{
    query: string;
    depth: string;
    focusAreas: string;
  }>();

  const {
    phase,
    steps,
    stepDetails,
    report,
    error,
    progressPercent,
    startResearch,
  } = useResearch();

  const hasStarted = useRef(false);

  // Rotating orb animation
  const rotateAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0.4);

  useEffect(() => {
    rotateAnim.value = withRepeat(withTiming(360, { duration: 8000 }), -1, false);
    glowAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0.4, { duration: 2000 })
      ),
      -1,
      false
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowAnim.value,
  }));

  // Start research once on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const input = {
      query: params.query ?? '',
      depth: (params.depth ?? 'deep') as ResearchDepth,
      focusAreas: params.focusAreas
        ? params.focusAreas.split('||').filter(Boolean)
        : [],
    };

    startResearch(input);
  }, []);

  // Navigate to report when complete
  useEffect(() => {
    if (phase === 'completed' && report) {
      setTimeout(() => {
        router.replace({
          pathname: '/(app)/research-report' as any,
          params: { reportId: report.id },
        });
      }, 800); // Brief pause so user sees 100%
    }
  }, [phase, report]);

  // Show error
  useEffect(() => {
    if (phase === 'error' && error) {
      Alert.alert(
        'Research Failed',
        `${error}\n\nPlease check your API keys and try again.`,
        [{ text: 'Go Back', onPress: () => router.back() }]
      );
    }
  }, [phase, error]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: withTiming(`${progressPercent}%`, { duration: 400 }),
  }));

  const currentStepLabel =
    steps.find((s) => s.status === 'running')?.label ?? 'Initializing...';

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Animated orb */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{ alignItems: 'center', marginBottom: SPACING.xl }}
          >
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
              {/* Glow rings */}
              <Animated.View style={[{
                position: 'absolute',
                width: 120, height: 120, borderRadius: 60,
                backgroundColor: `${COLORS.primary}10`,
                borderWidth: 1,
                borderColor: `${COLORS.primary}30`,
              }, glowStyle]} />
              <Animated.View style={[{
                position: 'absolute',
                width: 90, height: 90, borderRadius: 45,
                backgroundColor: `${COLORS.primary}15`,
                borderWidth: 1,
                borderColor: `${COLORS.primary}40`,
              }, glowStyle]} />

              {/* Center icon */}
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{
                  width: 64, height: 64, borderRadius: 32,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={phase === 'completed' ? 'checkmark' : 'telescope'}
                  size={30}
                  color="#FFF"
                />
              </LinearGradient>
            </View>

            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
              textAlign: 'center',
              marginTop: SPACING.lg,
            }}>
              {phase === 'completed' ? 'Research Complete!' : 'Researching...'}
            </Text>

            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              textAlign: 'center',
              marginTop: SPACING.xs,
              paddingHorizontal: SPACING.xl,
            }} numberOfLines={2}>
              {params.query}
            </Text>
          </Animated.View>

          {/* Progress bar */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)}>
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius: RADIUS.xl,
              padding: SPACING.md,
              marginBottom: SPACING.lg,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: SPACING.sm,
              }}>
                <Text style={{
                  color: COLORS.textSecondary,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '600',
                }}>
                  {currentStepLabel}
                </Text>
                <Text style={{
                  color: COLORS.primary,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '700',
                }}>
                  {progressPercent}%
                </Text>
              </View>

              {/* Progress track */}
              <View style={{
                height: 8,
                backgroundColor: COLORS.backgroundElevated,
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <Animated.View style={[{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: COLORS.primary,
                }, progressBarStyle]} />
              </View>
            </View>
          </Animated.View>

          {/* Agent steps */}
          <Animated.View entering={FadeInDown.duration(400).delay(300)}>
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              fontWeight: '600',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: SPACING.md,
            }}>
              Agent Pipeline
            </Text>

            {steps.map((step, i) => (
              <AgentStepCard
                key={step.agent}
                step={step}
                detail={stepDetails[step.agent]}
                index={i}
              />
            ))}

            {steps.length === 0 && (
              // Placeholder skeleton while first agent starts
              Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.lg,
                    height: 72,
                    marginBottom: SPACING.sm,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    opacity: 1 - i * 0.15,
                  }}
                />
              ))
            )}
          </Animated.View>

          {/* Info note */}
          <Animated.View entering={FadeInDown.duration(400).delay(500)}>
            <View style={{
              backgroundColor: `${COLORS.info}10`,
              borderRadius: RADIUS.lg,
              padding: SPACING.md,
              marginTop: SPACING.md,
              flexDirection: 'row',
              alignItems: 'flex-start',
              borderWidth: 1,
              borderColor: `${COLORS.info}20`,
            }}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.info} style={{ marginRight: SPACING.sm, marginTop: 1 }} />
              <Text style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                lineHeight: 18,
                flex: 1,
              }}>
                Our AI agents are searching the web, analyzing sources, and fact-checking claims in real time. Please keep the app open.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}