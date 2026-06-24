// src/components/debate/VoiceDebateCard.tsx
// Part 40 + 44 + 55.2 — FULL THEME-COMPATIBILITY PASS
// All colors now use COLORS tokens for theme compatibility.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }             from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
}                               from 'react-native-reanimated';
import { router }               from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { InsufficientCreditsModal }                 from '../credits/InsufficientCreditsModal';
import { FEATURE_COSTS }                            from '../../constants/credits';
import { useCredits }                               from '../../context/CreditsContext';
import type { DebateSession }                       from '../../types';
import type {
  VoiceDebate,
  VoiceDebateGenerationState,
  VoiceDebateGenerationPhase,
}                               from '../../types/voiceDebate';
import type { InsufficientCreditsInfo } from '../../types/credits';

const ACCENT = '#8B5CF6';
const COST = FEATURE_COSTS['voice_debate'];

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceDebateCardProps {
  session:              DebateSession;
  existingDebate:       VoiceDebate | null;
  genState:             VoiceDebateGenerationState;
  onGenerate:           () => Promise<void>;
  onCancel:             () => void;
  isGenerating:         boolean;
  isCancelling:         boolean;
  isLoadingExisting?:   boolean;
  onShareToWorkspace?:  () => void;
  sharedToCount?:       number;
  audioAllUploaded?:    boolean;
  insufficientCreditsInfo?:  InsufficientCreditsInfo | null;
  clearInsufficientCredits?: () => void;
  isConsumingCredits?:       boolean;
}

// ─── Phase label helpers ──────────────────────────────────────────────────────

const PHASE_LABELS: Record<VoiceDebateGenerationPhase, string> = {
  idle:           '',
  briefing:       'Briefing agents…',
  phase1:         'Phase 1: Opening arguments…',
  cross_analysis: 'Cross-examining perspectives…',
  rebuttals:      'Phase 2: Generating rebuttals…',
  assembly:       'Assembling debate script…',
  audio:          'Generating voice audio…',
  done:           'Voice debate ready!',
  error:          'Generation failed',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

// ─── Cloud upload status badge ────────────────────────────────────────────────

function CloudBadge({ audioAllUploaded }: { audioAllUploaded: boolean }) {
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               4,
      backgroundColor:   audioAllUploaded ? `${COLORS.success}15` : `${COLORS.warning}12`,
      borderRadius:      RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical:   3,
      borderWidth:       1,
      borderColor:       audioAllUploaded ? `${COLORS.success}30` : `${COLORS.warning}30`,
    }}>
      {audioAllUploaded ? (
        <>
          <Ionicons name="cloud-done-outline" size={10} color={COLORS.success} />
          <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
            Cloud ready
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator
            size="small"
            color={COLORS.warning}
            style={{ transform: [{ scale: 0.6 }] }}
          />
          <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '700' }}>
            Uploading…
          </Text>
        </>
      )}
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withTiming(Math.min(100, Math.max(0, percent)), { duration: 400 });
  }, [percent]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return (
    <View style={{
      height:          6,
      backgroundColor: `${ACCENT}25`,
      borderRadius:    3,
      overflow:        'hidden',
      marginTop:       SPACING.sm,
    }}>
      <Animated.View style={[style, {
        height: '100%', backgroundColor: ACCENT, borderRadius: 3,
      }]} />
    </View>
  );
}

// ─── Generation progress view ─────────────────────────────────────────────────

function GenerationProgress({
  genState, onCancel, isCancelling,
}: {
  genState:     VoiceDebateGenerationState;
  onCancel:     () => void;
  isCancelling: boolean;
}) {
  const phaseLabel = PHASE_LABELS[genState.phase] || genState.phaseLabel || 'Processing…';
  return (
    <View style={{
      backgroundColor: COLORS.backgroundElevated,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      borderWidth:     1,
      borderColor:     `${ACCENT}30`,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ActivityIndicator size="small" color={ACCENT} />
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
          fontWeight: '600', flex: 1,
        }}>
          {phaseLabel}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
          {genState.progressPercent}%
        </Text>
      </View>
      {genState.activeAgentName !== '' && (
        <Text style={{ color: ACCENT, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>
          {genState.activeAgentName}
        </Text>
      )}
      {genState.phase === 'audio' && genState.audioProgress.total > 0 && (
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: 4 }}>
          Turn {genState.audioProgress.completed} / {genState.audioProgress.total}
        </Text>
      )}
      <ProgressBar percent={genState.progressPercent} />
      <TouchableOpacity
        onPress={onCancel}
        disabled={isCancelling}
        style={{
          marginTop:         SPACING.sm,
          alignSelf:         'flex-end',
          flexDirection:     'row',
          alignItems:        'center',
          gap:               4,
          backgroundColor:   `${COLORS.error}12`,
          borderRadius:      RADIUS.md,
          paddingHorizontal: 10,
          paddingVertical:   5,
          borderWidth:       1,
          borderColor:       `${COLORS.error}25`,
        }}
      >
        {isCancelling
          ? <ActivityIndicator size="small" color={COLORS.error} />
          : <Ionicons name="close-circle-outline" size={14} color={COLORS.error} />
        }
        <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
          {isCancelling ? 'Cancelling…' : 'Cancel'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Completed debate view ────────────────────────────────────────────────────

function CompletedDebateView({
  debate, audioAllUploaded, onShareToWorkspace, sharedToCount,
}: {
  debate:              VoiceDebate;
  audioAllUploaded:    boolean;
  onShareToWorkspace?: () => void;
  sharedToCount:       number;
}) {
  const handlePlay = useCallback(() => {
    router.push({
      pathname: '/(app)/voice-debate-player' as any,
      params:   { voiceDebateId: debate.id, sessionId: debate.debateSessionId },
    });
  }, [debate.id, debate.debateSessionId]);

  return (
    <View style={{
      backgroundColor: COLORS.backgroundElevated,
      borderRadius:    RADIUS.lg,
      borderWidth:     1,
      borderColor:     `${ACCENT}30`,
      overflow:        'hidden',
    }}>
      {/* Purple accent top bar */}
      <LinearGradient
        colors={[ACCENT, '#A78BFA']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 2 }}
      />
      <View style={{ padding: SPACING.md }}>
        {/* Metadata row */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          gap: 8, marginBottom: SPACING.sm, flexWrap: 'wrap',
        }}>
          {debate.durationSeconds > 0 && (
            <View style={[styles.metaChip, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
              <Ionicons name="time-outline" size={10} color={ACCENT} />
              <Text style={[styles.metaChipText, { color: ACCENT }]}>
                {formatDuration(debate.durationSeconds)}
              </Text>
            </View>
          )}
          {debate.totalTurns > 0 && (
            <View style={[styles.metaChip, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
              <Ionicons name="chatbubbles-outline" size={10} color={COLORS.primary} />
              <Text style={[styles.metaChipText, { color: COLORS.primary }]}>
                {debate.totalTurns} turns
              </Text>
            </View>
          )}
          <CloudBadge audioAllUploaded={audioAllUploaded} />
        </View>

        {/* Action buttons row */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handlePlay}
            style={{
              flex:            1,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             6,
              backgroundColor: ACCENT,
              borderRadius:    RADIUS.lg,
              paddingVertical: 10,
              ...SHADOWS.small,
            }}
          >
            <Ionicons name="play-circle" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
              Play Voice Debate
            </Text>
          </TouchableOpacity>

          {onShareToWorkspace && (
            <TouchableOpacity
              onPress={onShareToWorkspace}
              style={{
                width:           44,
                height:          44,
                borderRadius:    RADIUS.lg,
                backgroundColor: sharedToCount > 0
                  ? `${COLORS.success}18` : `${ACCENT}15`,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     sharedToCount > 0
                  ? `${COLORS.success}40` : `${ACCENT}30`,
                position:        'relative',
              }}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color={sharedToCount > 0 ? COLORS.success : ACCENT}
              />
              {sharedToCount > 0 && (
                <View style={{
                  position:        'absolute',
                  top:             -4, right: -4,
                  width:           16, height: 16,
                  borderRadius:    8,
                  backgroundColor: COLORS.success,
                  alignItems:      'center', justifyContent: 'center',
                  borderWidth:     1.5, borderColor: COLORS.backgroundCard,
                }}>
                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>
                    {sharedToCount > 9 ? '9+' : sharedToCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Upload progress hint */}
        {!audioAllUploaded && (
          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             6,
            marginTop:       SPACING.sm,
            backgroundColor: `${COLORS.warning}08`,
            borderRadius:    RADIUS.md,
            padding:         8,
            borderWidth:     1,
            borderColor:     `${COLORS.warning}20`,
          }}>
            <Ionicons name="information-circle-outline" size={13} color={COLORS.warning} />
            <Text style={{ color: COLORS.warning, fontSize: 10, lineHeight: 14, flex: 1 }}>
              Audio is uploading to cloud for cross-device playback.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────

interface ConfirmModalProps {
  visible:   boolean;
  balance:   number;
  onConfirm: () => void;
  onCancel:  () => void;
  isLoading: boolean;
}

function ConfirmGenerateModal({
  visible, balance, onConfirm, onCancel, isLoading,
}: ConfirmModalProps) {
  const canAfford    = balance >= COST;
  const balanceAfter = Math.max(0, balance - COST);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={{
          flex:              1,
          backgroundColor:   'rgba(0,0,0,0.60)',
          alignItems:        'center',
          justifyContent:    'flex-end',
          paddingBottom:     36,
          paddingHorizontal: SPACING.md,
        }}
        onPress={onCancel}
      >
        <Pressable onPress={e => e.stopPropagation()} style={{ width: '100%' }}>
          <Animated.View
            entering={FadeInDown.duration(260)}
            style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius:    RADIUS.xl + 4,
              overflow:        'hidden',
              borderWidth:     1,
              borderColor:     `${ACCENT}30`,
              ...SHADOWS.large,
            }}
          >
            <LinearGradient
              colors={[ACCENT, '#A78BFA']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 3 }}
            />

            <View style={{
              padding:           SPACING.lg,
              alignItems:        'center',
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            }}>
              <View style={{
                width:           52,
                height:          52,
                borderRadius:    16,
                backgroundColor: `${ACCENT}18`,
                alignItems:      'center',
                justifyContent:  'center',
                marginBottom:    SPACING.sm,
                borderWidth:     1,
                borderColor:     `${ACCENT}35`,
              }}>
                <Ionicons name="mic-circle-outline" size={28} color={ACCENT} />
              </View>
              <Text style={{
                color:        COLORS.textPrimary,
                fontSize:     FONTS.sizes.lg,
                fontWeight:   '800',
                marginBottom: 4,
              }}>
                Generate Voice Debate?
              </Text>
              <Text style={{
                color:      COLORS.textMuted,
                fontSize:   FONTS.sizes.sm,
                textAlign:  'center',
                lineHeight: 20,
              }}>
                7 AI agents will voice a full debate with opening
                statements, rebuttals & moderator verdict.
              </Text>
            </View>

            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <View style={{
                backgroundColor: COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                borderWidth:     1,
                borderColor:     COLORS.border,
                gap:             10,
              }}>
                <View style={{
                  flexDirection:  'row',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{
                    color:      COLORS.textMuted,
                    fontSize:   FONTS.sizes.xs,
                    fontWeight: '600',
                  }}>
                    Cost
                  </Text>
                  <View style={{
                    flexDirection:     'row',
                    alignItems:        'center',
                    gap:               5,
                    backgroundColor:   `${ACCENT}15`,
                    paddingHorizontal: 10,
                    paddingVertical:   4,
                    borderRadius:      RADIUS.md,
                  }}>
                    <Ionicons name="flash" size={12} color={ACCENT} />
                    <Text style={{
                      color:      ACCENT,
                      fontSize:   FONTS.sizes.sm,
                      fontWeight: '800',
                    }}>
                      {COST} credits
                    </Text>
                  </View>
                </View>

                <View style={{
                  flexDirection:  'row',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    Your balance
                  </Text>
                  <Text style={{
                    color:      canAfford ? COLORS.textSecondary : COLORS.error,
                    fontSize:   FONTS.sizes.xs,
                    fontWeight: '600',
                  }}>
                    {balance} cr{!canAfford ? ' (insufficient)' : ''}
                  </Text>
                </View>

                {canAfford && (
                  <View style={{
                    flexDirection:  'row',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    paddingTop:     8,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                  }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      Balance after
                    </Text>
                    <Text style={{
                      color:      COLORS.success,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: '700',
                    }}>
                      {balanceAfter} cr
                    </Text>
                  </View>
                )}
              </View>

              <View style={{
                backgroundColor: `${ACCENT}08`,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                gap:             8,
              }}>
                {[
                  { icon: 'people-outline',      text: '7 unique AI voice personas per agent' },
                  { icon: 'chatbubbles-outline',  text: 'Opening, cross-exam & rebuttal rounds' },
                  { icon: 'ribbon-outline',       text: 'Moderator final verdict with audio' },
                  { icon: 'cloud-upload-outline', text: 'Auto-uploads for cross-device playback' },
                ].map(item => (
                  <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width:           26,
                      height:          26,
                      borderRadius:    8,
                      backgroundColor: `${ACCENT}18`,
                      alignItems:      'center',
                      justifyContent:  'center',
                      flexShrink:      0,
                    }}>
                      <Ionicons name={item.icon as any} size={13} color={ACCENT} />
                    </View>
                    <Text style={{
                      color:     COLORS.textSecondary,
                      fontSize:  FONTS.sizes.xs,
                      flex:      1,
                      lineHeight: 16,
                    }}>
                      {item.text}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <TouchableOpacity
                  onPress={onCancel}
                  disabled={isLoading}
                  style={{
                    flex:            1,
                    paddingVertical: 13,
                    borderRadius:    RADIUS.lg,
                    alignItems:      'center',
                    backgroundColor: COLORS.backgroundElevated,
                    borderWidth:     1,
                    borderColor:     COLORS.border,
                    opacity:         isLoading ? 0.5 : 1,
                  }}
                >
                  <Text style={{
                    color:      COLORS.textSecondary,
                    fontSize:   FONTS.sizes.sm,
                    fontWeight: '600',
                  }}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onConfirm}
                  disabled={isLoading || !canAfford}
                  activeOpacity={0.85}
                  style={{
                    flex:         2,
                    borderRadius: RADIUS.lg,
                    overflow:     'hidden',
                    opacity:      !canAfford ? 0.55 : 1,
                  }}
                >
                  <LinearGradient
                    colors={canAfford ? [ACCENT, '#A78BFA'] : ['#555', '#444']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 13,
                      alignItems:      'center',
                      justifyContent:  'center',
                      flexDirection:   'row',
                      gap:             8,
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="mic" size={15} color="#FFF" />
                        <Text style={{
                          color:      '#FFF',
                          fontSize:   FONTS.sizes.sm,
                          fontWeight: '700',
                        }}>
                          {canAfford ? `Confirm · ${COST} cr` : 'Insufficient Credits'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {!canAfford && (
                <TouchableOpacity
                  onPress={() => {
                    onCancel();
                    router.push('/(app)/credits-store' as any);
                  }}
                  style={{
                    flexDirection:   'row',
                    alignItems:      'center',
                    justifyContent:  'center',
                    gap:             6,
                    paddingVertical: 10,
                    borderRadius:    RADIUS.lg,
                    backgroundColor: `${COLORS.error}12`,
                    borderWidth:     1,
                    borderColor:     `${COLORS.error}25`,
                  }}
                >
                  <Ionicons name="flash-outline" size={14} color={COLORS.error} />
                  <Text style={{
                    color:      COLORS.error,
                    fontSize:   FONTS.sizes.xs,
                    fontWeight: '700',
                  }}>
                    Buy {COST - balance} more credits to unlock
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Generate prompt ──────────────────────────────────────────────────────────

interface GeneratePromptProps {
  onGenerate:               () => Promise<void>;
  isLoadingExisting:        boolean;
  sessionCompleted:         boolean;
  isConsumingCredits:       boolean;
  insufficientCreditsInfo:  InsufficientCreditsInfo | null;
  clearInsufficientCredits: () => void;
  balance:                  number;
}

function GeneratePrompt({
  onGenerate,
  isLoadingExisting,
  sessionCompleted,
  isConsumingCredits,
  insufficientCreditsInfo,
  clearInsufficientCredits,
  balance,
}: GeneratePromptProps) {
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const canAfford  = balance >= COST;
  const buttonBusy = isLoadingExisting || isConsumingCredits || isConfirming;

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    setShowConfirm(false);
    try {
      await onGenerate();
    } finally {
      setIsConfirming(false);
    }
  }, [onGenerate]);

  if (!sessionCompleted) return null;

  return (
    <>
      <View style={{
        backgroundColor: `${ACCENT}08`,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     `${ACCENT}20`,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems:    'center',
          gap:           SPACING.md,
          marginBottom:  SPACING.md,
        }}>
          <View style={{
            width:           44,
            height:          44,
            borderRadius:    13,
            backgroundColor: `${ACCENT}18`,
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:      0,
          }}>
            <Ionicons name="mic-circle-outline" size={24} color={ACCENT} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{
              color:        COLORS.textPrimary,
              fontSize:     FONTS.sizes.sm,
              fontWeight:   '700',
              marginBottom: 3,
            }}>
              Generate Voice Debate
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
              Turn this debate into a cinematic audio experience with AI voices for each agent.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <View style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
            backgroundColor:   canAfford ? `${ACCENT}12` : `${COLORS.error}12`,
            borderRadius:      RADIUS.md,
            paddingHorizontal: 10,
            paddingVertical:   6,
            borderWidth:       1,
            borderColor:       canAfford ? `${ACCENT}28` : `${COLORS.error}28`,
            flex:              1,
          }}>
            <Ionicons
              name="flash"
              size={13}
              color={canAfford ? ACCENT : COLORS.error}
            />
            <Text style={{
              color:      canAfford ? ACCENT : COLORS.error,
              fontSize:   FONTS.sizes.xs,
              fontWeight: '700',
            }}>
              {COST} credits
            </Text>
            {!canAfford && (
              <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '500' }}>
                · need {COST - balance} more
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => setShowConfirm(true)}
            disabled={buttonBusy}
            style={{
              backgroundColor:   buttonBusy ? `${ACCENT}60` : ACCENT,
              borderRadius:      RADIUS.lg,
              paddingHorizontal: SPACING.md,
              paddingVertical:   9,
              flexShrink:        0,
              minWidth:          84,
              alignItems:        'center',
              justifyContent:    'center',
              ...SHADOWS.small,
            }}
          >
            {buttonBusy ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                Generate
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {!canAfford && (
          <TouchableOpacity
            onPress={() => router.push('/(app)/credits-store' as any)}
            style={{
              flexDirection:   'row',
              alignItems:      'center',
              gap:             6,
              marginTop:       SPACING.sm,
              backgroundColor: `${COLORS.error}08`,
              borderRadius:    RADIUS.md,
              padding:         8,
              borderWidth:     1,
              borderColor:     `${COLORS.error}20`,
            }}
          >
            <Ionicons name="alert-circle-outline" size={13} color={COLORS.error} />
            <Text style={{ color: COLORS.error, fontSize: 10, flex: 1 }}>
              You need {COST - balance} more credits. Tap to buy credits.
            </Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>

      <ConfirmGenerateModal
        visible={showConfirm}
        balance={balance}
        isLoading={isConfirming || isConsumingCredits}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />

      <InsufficientCreditsModal
        visible={!!insufficientCreditsInfo}
        info={insufficientCreditsInfo}
        onClose={clearInsufficientCredits}
      />
    </>
  );
}

// ─── Error state view ─────────────────────────────────────────────────────────

function ErrorView({
  error, onRetry,
}: { error: string; onRetry: () => Promise<void> }) {
  return (
    <View style={{
      backgroundColor: `${COLORS.error}08`,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      borderWidth:     1,
      borderColor:     `${COLORS.error}20`,
      flexDirection:   'row',
      alignItems:      'center',
      gap:             SPACING.sm,
    }}>
      <Ionicons name="alert-circle-outline" size={20} color={COLORS.error} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
          Generation failed
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }} numberOfLines={2}>
          {error}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 3 }}>
          Note: Credits were deducted. Contact support if this was an error.
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          backgroundColor:   `${COLORS.error}15`,
          borderRadius:      RADIUS.md,
          paddingHorizontal: 10,
          paddingVertical:   6,
          borderWidth:       1,
          borderColor:       `${COLORS.error}30`,
        }}
      >
        <Text style={{ color: COLORS.error, fontSize: 10, fontWeight: '700' }}>
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main VoiceDebateCard ─────────────────────────────────────────────────────

export function VoiceDebateCard({
  session,
  existingDebate,
  genState,
  onGenerate,
  onCancel,
  isGenerating,
  isCancelling,
  isLoadingExisting        = false,
  onShareToWorkspace,
  sharedToCount            = 0,
  audioAllUploaded         = false,
  insufficientCreditsInfo  = null,
  clearInsufficientCredits = () => {},
  isConsumingCredits       = false,
}: VoiceDebateCardProps) {
  const { balance } = useCredits();

  const hasCompleted = existingDebate?.status === 'completed';
  const isError      = genState.phase === 'error';
  const cloudReady   = audioAllUploaded || existingDebate?.audioAllUploaded === true;

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        gap: 8, marginBottom: SPACING.sm, marginTop: SPACING.lg,
      }}>
        <LinearGradient
          colors={[ACCENT, '#A78BFA']}
          style={{
            width: 28, height: 28, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Ionicons name="mic-circle" size={14} color="#FFF" />
        </LinearGradient>
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
          fontWeight: '800', flex: 1,
        }}>
          Voice Debate
        </Text>
        {hasCompleted && (
          <View style={{
            backgroundColor: `${ACCENT}15`, borderRadius: RADIUS.full,
            paddingHorizontal: 8, paddingVertical: 3,
            flexDirection: 'row', alignItems: 'center', gap: 4,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT }} />
            <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '700' }}>Ready</Text>
          </View>
        )}
      </View>

      {isGenerating && (
        <GenerationProgress
          genState={genState}
          onCancel={onCancel}
          isCancelling={isCancelling}
        />
      )}

      {!isGenerating && hasCompleted && existingDebate && (
        <CompletedDebateView
          debate={existingDebate}
          audioAllUploaded={cloudReady}
          onShareToWorkspace={onShareToWorkspace}
          sharedToCount={sharedToCount}
        />
      )}

      {!isGenerating && !hasCompleted && !isError && (
        <GeneratePrompt
          onGenerate={onGenerate}
          isLoadingExisting={isLoadingExisting}
          sessionCompleted={session.status === 'completed'}
          isConsumingCredits={isConsumingCredits}
          insufficientCreditsInfo={insufficientCreditsInfo}
          clearInsufficientCredits={clearInsufficientCredits}
          balance={balance}
        />
      )}

      {!isGenerating && isError && genState.error && (
        <ErrorView error={genState.error} onRetry={onGenerate} />
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  metaChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderWidth:       1,
  },
  metaChipText: {
    fontSize:   10,
    fontWeight: '600',
  },
});