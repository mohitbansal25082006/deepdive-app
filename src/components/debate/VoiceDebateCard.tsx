// src/components/debate/VoiceDebateCard.tsx
// Part 44 UPDATE — Added Share to Workspace button + cloud upload status.
//
// CHANGES from Part 40 Fix version:
//   1. New "Share to Workspace" button appears when voice debate is completed.
//   2. Cloud upload status badge: ☁ Uploading… → ✓ Cloud ready.
//   3. onShareToWorkspace, sharedToCount, audioAllUploaded props added.
//   4. All previous features (generate, cancel, play, delete, progress) unchanged.
//
// BUG FIX (Part 44 patch):
//   isLoadingExisting is now passed as a prop from useVoiceDebate (the hook's
//   real state), not re-derived inside the card. The previous in-card derivation:
//     const isLoadingExisting = !hasCompleted && !isGenerating && phase==='idle' && !voiceDebate;
//   was always TRUE on a fresh visit to a new debate (because phase IS idle
//   and voiceDebate IS null), making the Generate button show a spinner and
//   appear disabled — looking like the card was auto-generating.
//
//   With the prop approach:
//     • isLoadingExisting=true → Generate button shows a subtle spinner (checking DB)
//     • isLoadingExisting=false + no existing debate → Generate button is fully enabled
//     • isLoadingExisting=false + existing debate → CompletedDebateView shown
//   The loading window is typically <500ms (one DB round-trip), so the user
//   sees the Generate button appear promptly once the check completes.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }             from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
}                               from 'react-native-reanimated';
import { router }               from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { DebateSession }   from '../../types';
import type {
  VoiceDebate,
  VoiceDebateGenerationState,
  VoiceDebateGenerationPhase,
}                               from '../../types/voiceDebate';

const ACCENT = '#8B5CF6';

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceDebateCardProps {
  session:              DebateSession;
  existingDebate:       VoiceDebate | null;
  genState:             VoiceDebateGenerationState;
  onGenerate:           () => Promise<void>;
  onCancel:             () => void;
  isGenerating:         boolean;
  isCancelling:         boolean;
  // Passed directly from useVoiceDebate hook.
  // true  = hook is fetching from DB (show subtle spinner, keep button disabled)
  // false = fetch complete; if no existing debate, show enabled Generate button
  isLoadingExisting?:   boolean;
  // Part 44 additions:
  onShareToWorkspace?:  () => void;
  sharedToCount?:       number;
  audioAllUploaded?:    boolean;
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

// ─── Progress bar (during generation) ────────────────────────────────────────

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
  debate:             VoiceDebate;
  audioAllUploaded:   boolean;
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
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={10} color={ACCENT} />
              <Text style={[styles.metaChipText, { color: ACCENT }]}>
                {formatDuration(debate.durationSeconds)}
              </Text>
            </View>
          )}
          {debate.totalTurns > 0 && (
            <View style={styles.metaChip}>
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
          {/* Play */}
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

          {/* Share to Workspace (Part 44) */}
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
              Audio is uploading to cloud for cross-device playback. Share to workspace will be available once complete.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Generate prompt — shown when no voice debate exists yet ──────────────────
// isLoadingExisting: true  → checking DB, show spinner on button (disabled)
// isLoadingExisting: false → check done, no debate found, button fully enabled

function GeneratePrompt({
  onGenerate, isLoadingExisting, sessionCompleted,
}: {
  onGenerate:        () => Promise<void>;
  isLoadingExisting: boolean;
  sessionCompleted:  boolean;
}) {
  if (!sessionCompleted) return null;

  return (
    <View style={{
      backgroundColor: `${ACCENT}08`,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      borderWidth:     1,
      borderColor:     `${ACCENT}20`,
      flexDirection:   'row',
      alignItems:      'center',
      gap:             SPACING.md,
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
          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
          fontWeight: '700', marginBottom: 3,
        }}>
          Generate Voice Debate
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
          Turn this debate into a cinematic audio experience with AI voices for each agent.
        </Text>
      </View>

      {/* Generate button — disabled only while checking for existing debate */}
      <TouchableOpacity
        onPress={onGenerate}
        disabled={isLoadingExisting}
        style={{
          backgroundColor:   isLoadingExisting ? `${ACCENT}60` : ACCENT,
          borderRadius:      RADIUS.lg,
          paddingHorizontal: SPACING.md,
          paddingVertical:   9,
          flexShrink:        0,
          minWidth:          76,
          alignItems:        'center',
          ...SHADOWS.small,
        }}
      >
        {isLoadingExisting ? (
          // Small spinner while the hook checks DB for an existing debate.
          // This lasts <500ms on a typical connection — just prevents a
          // race condition where user taps Generate before the DB check finishes.
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            Generate
          </Text>
        )}
      </TouchableOpacity>
    </View>
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
  isLoadingExisting = false,
  // Part 44:
  onShareToWorkspace,
  sharedToCount = 0,
  audioAllUploaded = false,
}: VoiceDebateCardProps) {
  const hasCompleted = existingDebate?.status === 'completed';
  const isError      = genState.phase === 'error';

  // Derive audioAllUploaded from existingDebate if not passed explicitly
  const cloudReady = audioAllUploaded || existingDebate?.audioAllUploaded === true;

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      {/* Section header */}
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

      {/* ── Generation in progress ── */}
      {isGenerating && (
        <GenerationProgress
          genState={genState}
          onCancel={onCancel}
          isCancelling={isCancelling}
        />
      )}

      {/* ── Completed — show player + share button ── */}
      {!isGenerating && hasCompleted && existingDebate && (
        <CompletedDebateView
          debate={existingDebate}
          audioAllUploaded={cloudReady}
          onShareToWorkspace={onShareToWorkspace}
          sharedToCount={sharedToCount}
        />
      )}

      {/* ── No voice debate yet — show Generate CTA ──
          KEY FIX: isLoadingExisting comes from the hook as a prop.
          When true (DB check in progress), button is disabled with a spinner.
          When false (check done, nothing found), button is fully enabled.
          This replaces the previous in-card derivation which was always
          true on a fresh visit, making the card look like it was auto-generating. */}
      {!isGenerating && !hasCompleted && !isError && (
        <GeneratePrompt
          onGenerate={onGenerate}
          isLoadingExisting={isLoadingExisting}
          sessionCompleted={session.status === 'completed'}
        />
      )}

      {/* ── Error state ── */}
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
    backgroundColor:   COLORS.backgroundCard,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  metaChipText: {
    fontSize:   10,
    fontWeight: '600',
  },
});