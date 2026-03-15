// app/(app)/research-progress.tsx
// Part 21 — Fully updated with streaming report generation UI.
//
// Two visual modes that switch automatically:
//   Phase 'agents'           → Classic agent step list (Steps 1-4)
//   Phase 'streaming_report' → Live section writing panel (Step 5)
//   Phase 'streaming_visuals'→ Visual intelligence step + completion prep
//
// The streaming panel renders StreamingSectionCard for each of the 6 sections,
// showing tokens arriving in real-time with a blinking cursor on the active one.
// A sticky "Now writing:" header shows which section is currently being generated.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  Animated as RNAnimated,
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
import { useResearch, StreamingPhase }             from '../../src/hooks/useResearch';
import { AgentStep, AgentStatus }                  from '../../src/types';
import { ResearchMode }                            from '../../src/types';
import { StreamingSectionCard }                    from '../../src/components/research/StreamingSectionCard';

const SCREEN_W = Dimensions.get('window').width;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AgentStatus, {
  icon:    string;
  color:   string;
  bgColor: string;
}> = {
  pending:   { icon: 'ellipse-outline',   color: COLORS.textMuted, bgColor: COLORS.backgroundElevated },
  running:   { icon: 'sync-outline',      color: COLORS.primary,   bgColor: `${COLORS.primary}18`    },
  completed: { icon: 'checkmark-circle',  color: COLORS.success,   bgColor: `${COLORS.success}18`    },
  failed:    { icon: 'close-circle',      color: COLORS.error,     bgColor: `${COLORS.error}18`      },
};

const AGENT_ICONS: Record<string, string> = {
  planner:     'map-outline',
  searcher:    'search-outline',
  analyst:     'analytics-outline',
  factchecker: 'shield-checkmark-outline',
  reporter:    'document-text-outline',
  visualizer:  'bar-chart-outline',
  academic:    'school-outline',
};

// ─── StepRow ──────────────────────────────────────────────────────────────────

interface StepRowProps {
  step:    AgentStep;
  detail?: string;
  index:   number;
  compact?: boolean;
}

function StepRow({ step, detail, index, compact = false }: StepRowProps) {
  const cfg       = STATUS_CONFIG[step.status];
  const isRunning = step.status === 'running';

  const spinVal  = useSharedValue(0);
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

  if (compact) {
    // Compact row for the top summary when streaming is active
    return (
      <View style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:              8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      }}>
        <View style={{
          width:  28, height: 28, borderRadius: 8,
          backgroundColor: cfg.bgColor,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {isRunning ? (
            <Animated.View style={spinStyle}>
              <Ionicons name="sync-outline" size={14} color={COLORS.primary} />
            </Animated.View>
          ) : (
            <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
          )}
        </View>
        <Text style={{
          color:     step.status === 'completed' ? COLORS.textMuted : COLORS.textSecondary,
          fontSize:  FONTS.sizes.xs,
          flex:      1,
          fontWeight: step.status === 'running' ? '600' : '400',
          textDecorationLine: step.status === 'completed' ? 'line-through' : 'none',
        }}>
          {step.label}
        </Text>
        {elapsed && (
          <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{elapsed}</Text>
        )}
      </View>
    );
  }

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
      <View style={{
        width: 42, height: 42, borderRadius: 12,
        backgroundColor: COLORS.backgroundCard,
        alignItems: 'center', justifyContent: 'center',
        marginRight: SPACING.sm, flexShrink: 0,
        borderWidth: 1, borderColor: COLORS.border,
      }}>
        <Ionicons
          name={AGENT_ICONS[step.agent] as any ?? 'cog-outline'}
          size={20}
          color={isRunning ? COLORS.primary : COLORS.textMuted}
        />
      </View>

      <View style={{ flex: 1, marginRight: SPACING.sm }}>
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
          fontWeight: '700', marginBottom: 2,
        }}>
          {step.label}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
          {detail ?? step.description}
        </Text>
      </View>

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

// ─── Section Progress Bar ─────────────────────────────────────────────────────

interface SectionProgressProps {
  completed: number;
  total:     number;
  current:   string;
}

function SectionProgressBar({ completed, total, current }: SectionProgressProps) {
  const pct = Math.round((completed / total) * 100);
  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={{
        backgroundColor: `${COLORS.primary}10`,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     `${COLORS.primary}25`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
            Now Writing
          </Text>
        </View>
        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
          {completed}/{total}
        </Text>
      </View>

      {/* Section name */}
      <Text style={{
        color:      COLORS.textSecondary,
        fontSize:   FONTS.sizes.xs,
        marginBottom: 10,
        fontStyle:  'italic',
      }}
        numberOfLines={1}
      >
        "{current}"
      </Text>

      {/* Progress track */}
      <View style={{
        height: 6, backgroundColor: COLORS.backgroundElevated,
        borderRadius: RADIUS.full, overflow: 'hidden',
      }}>
        <View style={{
          height: 6, width: `${pct}%`,
          borderRadius: RADIUS.full, backgroundColor: COLORS.primary,
        }} />
      </View>

      {/* Section dots */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, justifyContent: 'center' }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width:           i < completed ? 18 : i === completed ? 10 : 6,
              height:          6,
              borderRadius:    3,
              backgroundColor: i < completed
                ? COLORS.success
                : i === completed
                ? COLORS.primary
                : COLORS.backgroundElevated,
            }}
          />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResearchProgressScreen() {
  const params = useLocalSearchParams<{
    query:          string;
    depth:          string;
    focusAreas:     string;
    researchMode?:  string;
    citationStyle?: string;
  }>();

  const {
    phase, steps, stepDetails, report, error,
    startResearch, reset,
    streamingPhase,
    streamingSections,
    streamingSectionIndex,
    streamingSectionTitle,
    sectionsCompleted,
  } = useResearch();

  const launched = useRef(false);

  // Pulse animation for header orb
  const pulseScale   = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const pulseStyle   = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   pulseOpacity.value,
  }));

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.35, { duration: 900 }), withTiming(1.0, { duration: 900 })),
      -1, false,
    );
    pulseOpacity.value = withRepeat(
      withSequence(withTiming(0.15, { duration: 900 }), withTiming(0.6, { duration: 900 })),
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
      query:     params.query ?? '',
      depth:     (params.depth as any) ?? 'deep',
      focusAreas,
      mode:      researchMode,
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
        'Research Failed', error,
        [
          { text: 'Go Back', style: 'cancel', onPress: () => { reset(); router.back(); } },
          { text: 'Retry', onPress: () => { reset(); launched.current = false; } },
        ],
      );
    }
  }, [phase, error]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isAcademic   = (params.researchMode ?? 'standard') === 'academic';
  const totalSteps   = isAcademic ? 7 : 6;
  const completedCnt = steps.filter(s => s.status === 'completed').length;

  // Overall progress: agents phase + streaming phase weighted
  const agentWeight     = 0.5;  // first 4 steps = 50%
  const streamingWeight = 0.4;  // streaming 6 sections = 40%
  const visualWeight    = 0.1;  // visualizer = 10%

  let overallProgress = 0;
  if (streamingPhase === 'agents') {
    const agentSteps = steps.filter(s =>
      ['planner','searcher','analyst','factchecker'].includes(s.agent),
    );
    const agentDone = agentSteps.filter(s => s.status === 'completed').length;
    overallProgress = Math.round((agentDone / 4) * agentWeight * 100);
  } else if (streamingPhase === 'streaming_report') {
    overallProgress = Math.round(
      agentWeight * 100 + (sectionsCompleted / 6) * streamingWeight * 100,
    );
  } else if (streamingPhase === 'streaming_visuals') {
    overallProgress = Math.round((agentWeight + streamingWeight) * 100);
  } else {
    overallProgress = 100;
  }

  const currentStep = steps.find(s => s.status === 'running');
  const isStreaming  = streamingPhase === 'streaming_report';

  // ── Phase labels ──────────────────────────────────────────────────────────
  const phaseLabel = (() => {
    if (streamingPhase === 'agents')            return 'Gathering intelligence…';
    if (streamingPhase === 'streaming_report')  return 'Writing report — live';
    if (streamingPhase === 'streaming_visuals') return 'Generating visuals…';
    return 'Finalizing report…';
  })();

  const phaseSubLabel = (() => {
    if (streamingPhase === 'streaming_report') {
      return `${sectionsCompleted} of 6 sections complete · Sections appear as they're written`;
    }
    if (streamingPhase === 'agents') {
      return `${totalSteps} AI agents working in sequence`;
    }
    return 'Almost done…';
  })();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
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
            {/* Orb */}
            <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[
                { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary },
                pulseStyle,
              ]} />
              <LinearGradient
                colors={isStreaming
                  ? [COLORS.success, COLORS.success + 'CC']
                  : isAcademic
                  ? ['#6C63FF', '#8B5CF6']
                  : COLORS.gradientPrimary}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  alignItems: 'center', justifyContent: 'center', ...SHADOWS.medium,
                }}
              >
                <Ionicons
                  name={
                    isStreaming    ? 'pencil'
                    : isAcademic  ? 'school'
                    : 'sparkles'
                  }
                  size={22}
                  color="#FFF"
                />
              </LinearGradient>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
                {phaseLabel}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                {phaseSubLabel}
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
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1 }} numberOfLines={2}>
              {params.query}
            </Text>
          </View>

          {/* Academic mode badge */}
          {isAcademic && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: `${COLORS.primary}10`,
                borderRadius: RADIUS.md,
                paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
                marginTop: SPACING.sm,
                borderWidth: 1, borderColor: `${COLORS.primary}25`,
              }}
            >
              <Ionicons name="school-outline" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>
                Academic Paper Mode · {(params.citationStyle ?? 'apa').toUpperCase()} citations
                {' '}· Generates 3500–5000 word paper after standard report
              </Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Overall Progress Bar ──────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {isStreaming
                ? `${sectionsCompleted}/6 sections written`
                : `${completedCnt}/${steps.length || totalSteps} agents complete`
              }
            </Text>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
              {overallProgress}%
            </Text>
          </View>
          <View style={{
            height: 8, backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.full, overflow: 'hidden',
          }}>
            {/* Background segments */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
              <View style={{ flex: 50, borderRightWidth: 1, borderRightColor: COLORS.border + '40' }} />
              <View style={{ flex: 40, borderRightWidth: 1, borderRightColor: COLORS.border + '40' }} />
              <View style={{ flex: 10 }} />
            </View>
            {/* Fill */}
            <LinearGradient
              colors={isStreaming ? [COLORS.success, COLORS.primary] : COLORS.gradientPrimary}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 8, width: `${overallProgress}%`, borderRadius: RADIUS.full }}
            />
          </View>

          {/* Phase labels under bar */}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <Text style={{ flex: 50, color: COLORS.textMuted, fontSize: 9, textAlign: 'left' }}>Agents</Text>
            <Text style={{ flex: 40, color: COLORS.textMuted, fontSize: 9, textAlign: 'center' }}>Report</Text>
            <Text style={{ flex: 10, color: COLORS.textMuted, fontSize: 9, textAlign: 'right' }}>Visuals</Text>
          </View>
        </Animated.View>

        {/* ── Main Scrollable Area ──────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.xl,
            paddingBottom:     SPACING.xl,
          }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── AGENTS PHASE: classic step list ────────────────────────── */}
          {!isStreaming && (
            <>
              {steps.map((step, i) => (
                <StepRow
                  key={step.agent}
                  step={step}
                  detail={stepDetails[step.agent]}
                  index={i}
                  compact={false}
                />
              ))}

              {/* Current agent detail banner */}
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
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 16 }}>
                    {stepDetails[currentStep.agent]}
                  </Text>
                </Animated.View>
              )}

              {/* Academic paper queued notice */}
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
                  <Ionicons name="school-outline" size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 2 }}>
                      Academic Paper Queued
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                      After the standard report completes, the Academic Paper Agent
                      will write a full journal-style paper with 7 sections.
                    </Text>
                  </View>
                </Animated.View>
              )}
            </>
          )}

          {/* ── STREAMING PHASE: live section writing ──────────────────── */}
          {isStreaming && (
            <>
              {/* Compact completed-agents summary at top */}
              <Animated.View
                entering={FadeIn.duration(300)}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.md,
                  marginBottom:    SPACING.md,
                  borderWidth:     1,
                  borderColor:     `${COLORS.success}25`,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                    Intelligence Gathered
                  </Text>
                </View>
                {steps
                  .filter(s => ['planner','searcher','analyst','factchecker'].includes(s.agent))
                  .map((step, i) => (
                    <StepRow key={step.agent} step={step} detail={stepDetails[step.agent]} index={i} compact />
                  ))
                }
              </Animated.View>

              {/* Section writing progress bar */}
              <SectionProgressBar
                completed={sectionsCompleted}
                total={6}
                current={streamingSectionTitle || 'Preparing first section…'}
              />

              {/* Live section cards */}
              {streamingSections.map((section, i) => (
                <StreamingSectionCard
                  key={i}
                  section={section}
                  isActive={i === streamingSectionIndex && !section.isComplete}
                />
              ))}

              {/* Pending sections (not yet started) */}
              {Array.from({ length: Math.max(0, 6 - streamingSections.length) }).map((_, i) => {
                const sectionNames = [
                  'Topic Overview & Current State',
                  'Key Players & Market Landscape',
                  'Technology & Innovation Trends',
                  'Market Data & Statistics',
                  'Challenges & Risks',
                  'Future Outlook & Predictions',
                ];
                const idx = streamingSections.length + i;
                return (
                  <Animated.View
                    key={`pending_${idx}`}
                    entering={FadeInDown.duration(300).delay(i * 50)}
                    style={{
                      backgroundColor: COLORS.backgroundCard,
                      borderRadius:    RADIUS.xl,
                      padding:         SPACING.md,
                      marginBottom:    SPACING.md,
                      borderWidth:     1,
                      borderColor:     COLORS.border,
                      opacity:         0.5,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: COLORS.backgroundElevated,
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                          {sectionNames[idx] ?? `Section ${idx + 1}`}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                          Queued…
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                );
              })}

              {/* Fun tip while waiting */}
              <Animated.View
                entering={FadeInDown.duration(400).delay(200)}
                style={{
                  backgroundColor: `${COLORS.primary}08`,
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.md,
                  borderWidth:     1,
                  borderColor:     `${COLORS.primary}15`,
                  flexDirection:   'row',
                  alignItems:      'flex-start',
                  gap:              10,
                  marginTop:       SPACING.sm,
                }}
              >
                <Ionicons name="bulb-outline" size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
                  <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Live generation: </Text>
                  Each section is written by a separate GPT-4o call. Sections appear as they finish —
                  your report will be fully complete once all 6 sections are done.
                </Text>
              </Animated.View>
            </>
          )}

          {/* ── VISUALS PHASE ────────────────────────────────────────────── */}
          {streamingPhase === 'streaming_visuals' && (
            <Animated.View
              entering={FadeInDown.duration(400)}
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
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                  Generating visuals
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                  {stepDetails['visualizer'] ?? 'Building knowledge graph & infographics…'}
                </Text>
              </View>
            </Animated.View>
          )}

        </ScrollView>

        {/* ── Cancel Button ─────────────────────────────────────────────── */}
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
                    text: 'Cancel', style: 'destructive',
                    onPress: () => { reset(); router.replace('/(app)/(tabs)/home' as any); },
                  },
                ],
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
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
              Cancel Research
            </Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}