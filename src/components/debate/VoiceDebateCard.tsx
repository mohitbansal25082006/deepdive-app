// src/components/debate/VoiceDebateCard.tsx
// Part 40 — Voice Debate Engine
//
// Card shown in the Overview tab of debate-detail.tsx.
// Triggers voice debate generation OR opens the player if one already exists.
// Uses useCreditGate for the 25-credit charge.
// Connects to useVoiceDebate hook for generation state.

import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router }            from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { VOICE_DEBATE_CREDIT_COST }                from '../../constants/voiceDebate';
import { CreditBalance }                           from '../credits/CreditBalance';
import { InsufficientCreditsModal }                from '../credits/InsufficientCreditsModal';
import { useCreditGate }                           from '../../hooks/useCreditGate';
import type { DebateSession }                      from '../../types';
import type { VoiceDebate, VoiceDebateGenerationState } from '../../types/voiceDebate';

// ─── Agent voice avatar strip ──────────────────────────────────────────────────

const AGENT_VOICE_AVATARS = [
  { role: 'moderator',    color: '#6C63FF', icon: 'ribbon-outline',           label: 'M' },
  { role: 'optimist',     color: '#43E97B', icon: 'sunny-outline',            label: 'O' },
  { role: 'skeptic',      color: '#FF6584', icon: 'alert-circle-outline',     label: 'S' },
  { role: 'economist',    color: '#FFD700', icon: 'trending-up-outline',      label: 'E' },
  { role: 'technologist', color: '#29B6F6', icon: 'hardware-chip-outline',    label: 'T' },
  { role: 'ethicist',     color: '#C084FC', icon: 'shield-checkmark-outline', label: 'Et' },
  { role: 'futurist',     color: '#FF8E53', icon: 'telescope-outline',        label: 'F' },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface VoiceDebateCardProps {
  session:         DebateSession;
  existingDebate:  VoiceDebate | null;
  genState:        VoiceDebateGenerationState;
  onGenerate:      () => void;
  isGenerating:    boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function VoiceDebateCard({
  session,
  existingDebate,
  genState,
  onGenerate,
  isGenerating,
}: VoiceDebateCardProps) {
  const { balance, guardedConsume, insufficientInfo, clearInsufficient, isConsuming } =
    useCreditGate();

  const isCompleted = existingDebate?.status === 'completed';
  const isFailed    = existingDebate?.status === 'failed';

  const handleGenerate = useCallback(async () => {
    const ok = await guardedConsume('voice_debate');
    if (!ok) return;
    onGenerate();
  }, [guardedConsume, onGenerate]);

  const handleOpenPlayer = useCallback(() => {
    if (!existingDebate) return;
    router.push({
      pathname: '/(app)/voice-debate-player' as any,
      params:   { voiceDebateId: existingDebate.id },
    });
  }, [existingDebate]);

  // ── Completed state — show play button ────────────────────────────────────
  if (isCompleted && existingDebate) {
    return (
      <Animated.View entering={FadeIn.duration(500)}>
        <LinearGradient
          colors={['#1A1035', '#0D0820']}
          style={{
            borderRadius: RADIUS.xl,
            padding:      SPACING.lg,
            borderWidth:  1,
            borderColor:  `${COLORS.primary}40`,
            marginBottom: SPACING.md,
            ...SHADOWS.medium,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.md }}>
            <View style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: `${COLORS.primary}20`,
              borderWidth: 1, borderColor: `${COLORS.primary}40`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="mic" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8 }}>
                🎙 VOICE DEBATE READY
              </Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: 2 }}>
                {Math.round(existingDebate.durationSeconds / 60)} min · {existingDebate.totalTurns} turns
              </Text>
            </View>
            <View style={{
              backgroundColor: `${COLORS.success}15`,
              borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4,
              borderWidth: 1, borderColor: `${COLORS.success}30`,
            }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>READY</Text>
            </View>
          </View>

          {/* Agent voice strip */}
          <View style={{ flexDirection: 'row', marginBottom: SPACING.md, gap: 6 }}>
            {AGENT_VOICE_AVATARS.map((a, i) => (
              <View key={a.role} style={{
                flex: 1, height: 36, borderRadius: 10,
                backgroundColor: `${a.color}15`,
                borderWidth: 1, borderColor: `${a.color}30`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={a.icon as any} size={14} color={a.color} />
              </View>
            ))}
          </View>

          {/* Play button */}
          <TouchableOpacity
            onPress={handleOpenPlayer}
            activeOpacity={0.85}
            style={{ borderRadius: RADIUS.lg, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={[COLORS.primary, '#9B59FF']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', paddingVertical: 14, gap: 8,
              }}
            >
              <Ionicons name="play-circle" size={22} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                Play Voice Debate
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: FONTS.sizes.xs }}>
                {Math.round(existingDebate.durationSeconds / 60)} min
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── Generating state — show progress ──────────────────────────────────────
  if (isGenerating) {
    return (
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={{
          borderRadius: RADIUS.xl,
          padding:      SPACING.lg,
          borderWidth:  1,
          borderColor:  `${COLORS.primary}40`,
          backgroundColor: COLORS.backgroundCard,
          marginBottom: SPACING.md,
          ...SHADOWS.small,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.md }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8 }}>
                🎙 GENERATING VOICE DEBATE
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={1}>
                {genState.phaseLabel}
              </Text>
            </View>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              {genState.progressPercent}%
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{
            height: 4, backgroundColor: COLORS.backgroundElevated,
            borderRadius: 2, overflow: 'hidden',
          }}>
            <View style={{
              height: '100%',
              width: `${genState.progressPercent}%` as any,
              backgroundColor: COLORS.primary,
              borderRadius: 2,
            }} />
          </View>

          {/* Audio progress if in audio phase */}
          {genState.phase === 'audio' && genState.audioProgress.total > 0 && (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: SPACING.sm, textAlign: 'center' }}>
              Generating audio: {genState.audioProgress.completed}/{genState.audioProgress.total} voice segments
            </Text>
          )}

          {/* Active agent */}
          {genState.activeAgentName ? (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: SPACING.xs, textAlign: 'center' }}>
              {genState.activeAgentName}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (isFailed || genState.phase === 'error') {
    return (
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={{
          borderRadius: RADIUS.xl, padding: SPACING.lg,
          borderWidth: 1, borderColor: `${COLORS.error}30`,
          backgroundColor: `${COLORS.error}08`, marginBottom: SPACING.md,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
            <Ionicons name="alert-circle-outline" size={20} color={COLORS.error} />
            <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
              Voice Debate Failed
            </Text>
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md, lineHeight: 18 }}>
            {genState.error ?? existingDebate?.errorMessage ?? 'Generation failed. Try again.'}
          </Text>
          <TouchableOpacity
            onPress={handleGenerate}
            disabled={isConsuming}
            activeOpacity={0.85}
            style={{
              backgroundColor: COLORS.error,
              borderRadius: RADIUS.lg, paddingVertical: 10,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Ionicons name="refresh-outline" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Retry (25 cr)</Text>
          </TouchableOpacity>
        </View>

        <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
      </Animated.View>
    );
  }

  // ── Default: Generate CTA ─────────────────────────────────────────────────
  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <View style={{
        borderRadius: RADIUS.xl,
        borderWidth:  1,
        borderColor:  `${COLORS.primary}25`,
        backgroundColor: COLORS.backgroundCard,
        overflow:     'hidden',
        marginBottom: SPACING.md,
        ...SHADOWS.small,
      }}>
        {/* Top accent strip */}
        <View style={{ height: 3, flexDirection: 'row' }}>
          {AGENT_VOICE_AVATARS.map(a => (
            <View key={a.role} style={{ flex: 1, backgroundColor: a.color }} />
          ))}
        </View>

        <View style={{ padding: SPACING.lg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: SPACING.md }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: `${COLORS.primary}15`,
              borderWidth: 1, borderColor: `${COLORS.primary}30`,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Ionicons name="mic-outline" size={24} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                Voice Debate
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, lineHeight: 18 }}>
                Hear all 7 agents debate with distinct AI voices — Opening, Cross-Exam, Rebuttals, Q&A & Verdict
              </Text>
            </View>
          </View>

          {/* Agent voice avatars */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
            {AGENT_VOICE_AVATARS.map(a => (
              <View key={a.role} style={{
                flex: 1, paddingVertical: 8,
                backgroundColor: `${a.color}10`,
                borderRadius: 10, borderWidth: 1, borderColor: `${a.color}25`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={a.icon as any} size={14} color={a.color} />
              </View>
            ))}
          </View>

          {/* Feature list */}
          <View style={{ gap: 6, marginBottom: SPACING.md }}>
            {[
              { icon: 'musical-notes-outline', text: '7 distinct AI voices — Moderator + 6 agents' },
              { icon: 'git-compare-outline',   text: 'Two-phase dialectic — rebuttals & cross-examination' },
              { icon: 'analytics-outline',     text: 'Confidence arc showing each agent\'s journey' },
              { icon: 'document-text-outline', text: 'Threaded transcript with argument references' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={item.icon as any} size={14} color={COLORS.primary} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Credit info + balance */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="flash" size={12} color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                Uses{' '}
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
                  {VOICE_DEBATE_CREDIT_COST} credits
                </Text>
              </Text>
            </View>
            <CreditBalance balance={balance} size="sm" />
          </View>

          {/* Generate button */}
          <TouchableOpacity
            onPress={handleGenerate}
            disabled={isConsuming || session.status !== 'completed'}
            activeOpacity={0.85}
            style={{ borderRadius: RADIUS.lg, overflow: 'hidden', opacity: session.status !== 'completed' ? 0.5 : 1 }}
          >
            <LinearGradient
              colors={[COLORS.primary, '#9B59FF']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', paddingVertical: 14, gap: 8,
              }}
            >
              {isConsuming ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="mic" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Generate Voice Debate
                  </Text>
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full,
                    paddingHorizontal: 8, paddingVertical: 3,
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                  }}>
                    <Ionicons name="flash" size={10} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
                      {VOICE_DEBATE_CREDIT_COST} cr
                    </Text>
                  </View>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {session.status !== 'completed' && (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.sm }}>
              Complete the debate first to generate voice audio
            </Text>
          )}
        </View>
      </View>

      <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
    </Animated.View>
  );
}