// src/components/debate/VoiceDebateCard.tsx
// Part 40 Fix — Added cancel generation with confirmation dialog
//
// Changes:
//   1. Generating state now shows "Cancel" button
//   2. Cancel triggers Alert.alert confirmation before calling onCancel
//   3. isCancelling prop shows spinner + "Cancelling..." state
//   4. Duration display fix preserved from previous fix

import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Alert,
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

// ─── Duration helper ──────────────────────────────────────────────────────────

function computeDisplayMinutes(vd: VoiceDebate): number {
  const turns    = vd.script?.turns ?? [];
  const totalMs  = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
  if (totalMs > 0) return Math.max(1, Math.round(totalMs / 60000));
  if (vd.durationSeconds > 0) return Math.max(1, Math.round(vd.durationSeconds / 60));
  if (vd.wordCount > 0) return Math.max(1, Math.round(vd.wordCount / 120));
  return 0;
}

// ─── Agent voice avatar strip ─────────────────────────────────────────────────

const AGENT_VOICE_AVATARS = [
  { role: 'moderator',    color: '#6C63FF', icon: 'ribbon-outline',           label: 'M'  },
  { role: 'optimist',     color: '#43E97B', icon: 'sunny-outline',            label: 'O'  },
  { role: 'skeptic',      color: '#FF6584', icon: 'alert-circle-outline',     label: 'S'  },
  { role: 'economist',    color: '#FFD700', icon: 'trending-up-outline',      label: 'E'  },
  { role: 'technologist', color: '#29B6F6', icon: 'hardware-chip-outline',    label: 'T'  },
  { role: 'ethicist',     color: '#C084FC', icon: 'shield-checkmark-outline', label: 'Et' },
  { role: 'futurist',     color: '#FF8E53', icon: 'telescope-outline',        label: 'F'  },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface VoiceDebateCardProps {
  session:        DebateSession;
  existingDebate: VoiceDebate | null;
  genState:       VoiceDebateGenerationState;
  onGenerate:     () => void;
  onCancel?:      () => void;
  isGenerating:   boolean;
  isCancelling?:  boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function VoiceDebateCard({
  session,
  existingDebate,
  genState,
  onGenerate,
  onCancel,
  isGenerating,
  isCancelling = false,
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

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel Generation?',
      'Are you sure you want to cancel the voice debate generation? Any progress will be lost.',
      [
        {
          text:  'Keep Generating',
          style: 'cancel',
        },
        {
          text:    'Cancel Generation',
          style:   'destructive',
          onPress: () => {
            if (onCancel) onCancel();
          },
        },
      ],
      { cancelable: true }
    );
  }, [onCancel]);

  const handleOpenPlayer = useCallback(() => {
    if (!existingDebate) return;
    router.push({
      pathname: '/(app)/voice-debate-player' as any,
      params:   { voiceDebateId: existingDebate.id },
    });
  }, [existingDebate]);

  // ── Completed state ───────────────────────────────────────────────────────
  if (isCompleted && existingDebate) {
    const displayMinutes = computeDisplayMinutes(existingDebate);

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
              <Text style={{
                color: COLORS.primary, fontSize: FONTS.sizes.xs,
                fontWeight: '700', letterSpacing: 0.8,
              }}>
                🎙 VOICE DEBATE READY
              </Text>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                fontWeight: '700', marginTop: 2,
              }}>
                {displayMinutes > 0 ? `~${displayMinutes} min` : `${existingDebate.totalTurns} turns`}
                {' · '}
                {existingDebate.totalTurns} turns
              </Text>
            </View>
            <View style={{
              backgroundColor: `${COLORS.success}15`,
              borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4,
              borderWidth: 1, borderColor: `${COLORS.success}30`,
            }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                READY
              </Text>
            </View>
          </View>

          {/* Agent voice strip */}
          <View style={{ flexDirection: 'row', marginBottom: SPACING.md, gap: 6 }}>
            {AGENT_VOICE_AVATARS.map(a => (
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
              {displayMinutes > 0 && (
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: FONTS.sizes.xs }}>
                  ~{displayMinutes} min
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── Generating state ──────────────────────────────────────────────────────
  if (isGenerating || isCancelling) {
    return (
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={{
          borderRadius: RADIUS.xl,
          padding:      SPACING.lg,
          borderWidth:  1,
          borderColor:  isCancelling ? `${COLORS.error}30` : `${COLORS.primary}40`,
          backgroundColor: COLORS.backgroundCard,
          marginBottom: SPACING.md,
          ...SHADOWS.small,
        }}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.md }}>
            <ActivityIndicator size="small" color={isCancelling ? COLORS.error : COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{
                color: isCancelling ? COLORS.error : COLORS.primary,
                fontSize: FONTS.sizes.xs,
                fontWeight: '700', letterSpacing: 0.8,
              }}>
                {isCancelling ? '⏹ CANCELLING...' : '🎙 GENERATING VOICE DEBATE'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={1}>
                {isCancelling ? 'Stopping generation, please wait...' : genState.phaseLabel}
              </Text>
            </View>
            {!isCancelling && (
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                {genState.progressPercent}%
              </Text>
            )}
          </View>

          {/* Progress bar */}
          <View style={{
            height: 4, backgroundColor: COLORS.backgroundElevated,
            borderRadius: 2, overflow: 'hidden', marginBottom: SPACING.md,
          }}>
            <View style={{
              height:          '100%',
              width:           isCancelling ? '100%' : `${genState.progressPercent}%` as any,
              backgroundColor: isCancelling ? COLORS.error : COLORS.primary,
              borderRadius:    2,
              opacity:         isCancelling ? 0.4 : 1,
            }} />
          </View>

          {genState.phase === 'audio' && genState.audioProgress.total > 0 && !isCancelling && (
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              marginBottom: SPACING.sm, textAlign: 'center',
            }}>
              Generating audio: {genState.audioProgress.completed}/{genState.audioProgress.total} voice segments
            </Text>
          )}

          {genState.activeAgentName && !isCancelling ? (
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              marginBottom: SPACING.md, textAlign: 'center',
            }}>
              {genState.activeAgentName}
            </Text>
          ) : null}

          {/* Cancel button — only shown when actually generating (not already cancelling) */}
          {!isCancelling && onCancel && (
            <TouchableOpacity
              onPress={handleCancel}
              activeOpacity={0.8}
              style={{
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             6,
                paddingVertical: 10,
                backgroundColor: `${COLORS.error}10`,
                borderRadius:    RADIUS.lg,
                borderWidth:     1,
                borderColor:     `${COLORS.error}25`,
              }}
            >
              <Ionicons name="stop-circle-outline" size={16} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                Cancel Generation
              </Text>
            </TouchableOpacity>
          )}
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
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
            marginBottom: SPACING.md, lineHeight: 18,
          }}>
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
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
              Retry ({VOICE_DEBATE_CREDIT_COST} cr)
            </Text>
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
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     `${COLORS.primary}25`,
        backgroundColor: COLORS.backgroundCard,
        overflow:        'hidden',
        marginBottom:    SPACING.md,
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
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800',
              }}>
                Voice Debate
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, lineHeight: 18,
              }}>
                Hear all 7 agents debate with distinct AI voices — Opening, Cross-Exam,
                Rebuttals, Q&A & Verdict
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
              { icon: 'analytics-outline',     text: "Confidence arc showing each agent's journey" },
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
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: SPACING.sm,
          }}>
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
            style={{
              borderRadius: RADIUS.lg, overflow: 'hidden',
              opacity: session.status !== 'completed' ? 0.5 : 1,
            }}
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
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              textAlign: 'center', marginTop: SPACING.sm,
            }}>
              Complete the debate first to generate voice audio
            </Text>
          )}
        </View>
      </View>

      <InsufficientCreditsModal
        visible={!!insufficientInfo}
        info={insufficientInfo}
        onClose={clearInsufficient}
      />
    </Animated.View>
  );
}