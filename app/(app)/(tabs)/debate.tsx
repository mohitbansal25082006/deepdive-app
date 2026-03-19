// app/(app)/(tabs)/debate.tsx
// Part 24 — UPDATED: Credit gate (15 credits) added before debate generation.
// All Part 20 functionality preserved (voice input, report import, 6 agents).

import React, {
  useState, useEffect, useCallback, useRef,
}                                   from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, KeyboardAvoidingView, Platform, Alert, Keyboard,
}                                   from 'react-native';
import { LinearGradient }           from 'expo-linear-gradient';
import { Ionicons }                 from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }             from 'react-native-safe-area-context';
import { router }                   from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../../src/constants/theme';
import { useDebate }                from '../../../src/hooks/useDebate';
import { useDebateHistory }         from '../../../src/hooks/useDebateHistory';
import { useDebateVoice }           from '../../../src/hooks/useDebateVoice';
import { useDebateReportImport }    from '../../../src/hooks/useDebateReportImport';
import { DebateProgressIndicator }  from '../../../src/components/debate/DebateProgressIndicator';
import { ReportImportSheet }        from '../../../src/components/debate/ReportImportSheet';
import { ImportedReportChip }       from '../../../src/components/debate/ImportedReportChip';
import { VoiceInputButton }         from '../../../src/components/debate/VoiceInputButton';
import { Avatar }                   from '../../../src/components/common/Avatar';
import { useAuth }                  from '../../../src/context/AuthContext';
// ── Part 24: Credit gate ─────────────────────────────────────────────────────
import { CreditBalance }            from '../../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal } from '../../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }            from '../../../src/hooks/useCreditGate';
import { FEATURE_COSTS }            from '../../../src/constants/credits';
// ────────────────────────────────────────────────────────────────────────────
import type { DebateSession }       from '../../../src/types';

// ─── Suggested topics ─────────────────────────────────────────────────────────

const SUGGESTED_TOPICS = [
  'Will AI replace programmers in the next decade?',
  'Should social media platforms be regulated like utilities?',
  'Is remote work better than office work for productivity?',
  'Will electric vehicles completely replace gas cars by 2040?',
  'Is nuclear energy the best solution to climate change?',
  'Should universal basic income be implemented globally?',
];

// ─── History card ─────────────────────────────────────────────────────────────

function DebateHistoryCard({
  session, index, onPress, onDelete,
}: {
  session: DebateSession; index: number; onPress: () => void; onDelete: () => void;
}) {
  const isCompleted = session.status === 'completed';
  const isFailed    = session.status === 'failed';

  const agentColors = (session.perspectives ?? []).slice(0, 6).map(p => p.color).filter(Boolean);

  const stanceForCount     = (session.perspectives ?? []).filter(p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const stanceAgainstCount = (session.perspectives ?? []).filter(p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;

  const dateLabel = new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 60)}>
      <TouchableOpacity
        onPress={isCompleted ? onPress : undefined}
        activeOpacity={isCompleted ? 0.85 : 1}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.md,
          borderWidth:     1,
          borderColor:     isFailed ? `${COLORS.error}30` : COLORS.border,
          overflow:        'hidden',
          ...SHADOWS.small,
        }}
      >
        {isCompleted && agentColors.length > 0 && (
          <View style={{ flexDirection: 'row', height: 3 }}>
            {agentColors.map((color, i) => <View key={i} style={{ flex: 1, backgroundColor: color }} />)}
          </View>
        )}

        <View style={{ padding: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: SPACING.sm }}>
            <View style={{
              width: 38, height: 38, borderRadius: 11,
              backgroundColor: isFailed ? `${COLORS.error}15` : `${COLORS.primary}15`,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Ionicons
                name={isFailed ? 'alert-circle-outline' : isCompleted ? 'people-outline' : 'hourglass-outline'}
                size={18}
                color={isFailed ? COLORS.error : COLORS.primary}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 22 }} numberOfLines={2}>
                {session.topic}
              </Text>
              {session.question && session.question !== session.topic && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, fontStyle: 'italic' }} numberOfLines={1}>
                  {session.question}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {isCompleted && agentColors.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <View style={{ flexDirection: 'row' }}>
                {agentColors.slice(0, 6).map((color, i) => (
                  <View key={i} style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: `${color}25`,
                    borderWidth: 2, borderColor: COLORS.backgroundCard,
                    alignItems: 'center', justifyContent: 'center',
                    marginLeft: i > 0 ? -6 : 0, zIndex: agentColors.length - i,
                  }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                  </View>
                ))}
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {session.perspectives?.length ?? 0} agents debated
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
            {isCompleted && (
              <>
                {stanceForCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Ionicons name="arrow-up" size={10} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{stanceForCount} For</Text>
                  </View>
                )}
                {stanceAgainstCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.secondary}12`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Ionicons name="arrow-down" size={10} color={COLORS.secondary} />
                    <Text style={{ color: COLORS.secondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{stanceAgainstCount} Against</Text>
                  </View>
                )}
              </>
            )}
            <View style={{
              backgroundColor: isCompleted ? `${COLORS.success}12` : isFailed ? `${COLORS.error}12` : `${COLORS.warning}12`,
              borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{
                color: isCompleted ? COLORS.success : isFailed ? COLORS.error : COLORS.warning,
                fontSize: FONTS.sizes.xs, fontWeight: '700',
              }}>
                {isCompleted ? 'Completed' : isFailed ? 'Failed' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
              </Text>
            </View>
            <Text style={{ marginLeft: 'auto', color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{dateLabel}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Suggested topic chip ─────────────────────────────────────────────────────

function SuggestedTopicChip({ topic, onPress }: { topic: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: COLORS.border,
        marginRight: SPACING.sm, marginBottom: SPACING.sm,
        flexDirection: 'row', alignItems: 'center', gap: 6,
      }}
    >
      <Ionicons name="bulb-outline" size={13} color={COLORS.primary} />
      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, maxWidth: 200 }} numberOfLines={1}>
        {topic}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DebateScreen() {
  const { profile } = useAuth();

  const { state: genState, isGenerating, progressPercent, phase, startDebate, reset: resetDebate } = useDebate();
  const { debates, completedDebates, totalPerspectives, loading, refreshing, refresh, deleteDebate } = useDebateHistory();

  // Part 20: Voice input
  const { voiceState, startVoice, stopVoice, cancelVoice, clearError: clearVoiceError } =
    useDebateVoice({
      onTranscribed: (text) => { setTopic(text); Keyboard.dismiss(); },
    });

  // Part 20: Report import
  const { importedReport, reportContext, handleReportSelected, clearReport, hasReport } = useDebateReportImport();

  // ── Part 24: Credit gate ──────────────────────────────────────────────────
  const {
    balance,
    guardedConsume,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  } = useCreditGate();
  // ─────────────────────────────────────────────────────────────────────────

  const [topic,           setTopic]           = useState('');
  const [showReportSheet, setShowReportSheet] = useState(false);

  const topicInputRef = useRef<TextInput>(null);

  useEffect(() => { if (phase === 'done') refresh(); }, [phase]);

  useEffect(() => {
    if (voiceState.error) {
      const t = setTimeout(clearVoiceError, 4000);
      return () => clearTimeout(t);
    }
  }, [voiceState.error]);

  // ── Start debate with credit gate ─────────────────────────────────────────

  const handleStart = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      Alert.alert('Topic Required', 'Enter a debate topic or select one below.');
      return;
    }
    if (trimmed.length < 10) {
      Alert.alert('Too Short', 'Please enter a more specific debate topic (at least 10 characters).');
      return;
    }
    Keyboard.dismiss();

    // ── Part 24: Check & deduct credits BEFORE launching pipeline ──────
    const ok = await guardedConsume('debate');
    if (!ok) return;
    // ─────────────────────────────────────────────────────────────────

    startDebate(trimmed, { reportContext: reportContext ?? null });
  }, [topic, reportContext, guardedConsume, startDebate]);

  const handleCancel = useCallback(() => {
    Alert.alert('Cancel Debate', 'Stop generating this debate? All progress will be lost.',
      [{ text: 'Keep Going', style: 'cancel' }, { text: 'Stop', style: 'destructive', onPress: resetDebate }]);
  }, [resetDebate]);

  const handleDelete = useCallback((sessionId: string, sessionTopic: string) => {
    Alert.alert('Delete Debate', `Delete "${sessionTopic.slice(0, 50)}..."?`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteDebate(sessionId) }]);
  }, [deleteDebate]);

  const handleVoicePress = useCallback(() => {
    if (voiceState.isRecording) stopVoice();
    else if (!voiceState.isTranscribing) startVoice();
  }, [voiceState.isRecording, voiceState.isTranscribing, startVoice, stopVoice]);

  const showProgress = phase === 'debating' || phase === 'moderating';
  const showForm     = !isGenerating;
  const showBanner   = phase === 'done' && genState.session !== null;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 130 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
          >

            {/* ── Header ────────────────────────────────────────────────── */}
            <Animated.View entering={FadeIn.duration(600)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl }}>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>Debate Arena</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
                  {completedDebates.length > 0
                    ? `${completedDebates.length} debate${completedDebates.length !== 1 ? 's' : ''} · ${totalPerspectives} perspectives`
                    : '6 AI agents debate any topic'}
                </Text>
              </View>
              {/* Part 24: Balance pill + Avatar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <CreditBalance balance={balance} size="sm" />
                <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
              </View>
            </Animated.View>

            {/* ── Completion banner ──────────────────────────────────────── */}
            {showBanner && genState.session && (
              <Animated.View entering={FadeIn.duration(500)} style={{ marginBottom: SPACING.lg }}>
                <LinearGradient
                  colors={[`${COLORS.primary}22`, `${COLORS.accent}18`]}
                  style={{ borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}40` }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>🎯 DEBATE COMPLETE</Text>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                        {genState.session.topic}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={resetDebate} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Ionicons name="close-circle-outline" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md }}>
                    {genState.session.perspectives.length} perspectives · {genState.session.searchResultsCount} sources
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(app)/debate-detail' as any, params: { sessionId: genState.session!.id } })}
                    activeOpacity={0.85}
                    style={{ backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Ionicons name="people-outline" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>View Full Debate</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            )}

            {/* ── Generation progress ────────────────────────────────────── */}
            {showProgress && (
              <DebateProgressIndicator
                agentProgress={genState.agentProgress}
                progressPercent={progressPercent}
                progressMessage={genState.progressMessage}
                isModerating={phase === 'moderating'}
                onCancel={handleCancel}
              />
            )}

            {/* ── Error banner ───────────────────────────────────────────── */}
            {phase === 'error' && genState.error && (
              <Animated.View entering={FadeIn.duration(400)} style={{
                backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg,
                padding: SPACING.md, marginBottom: SPACING.md,
                borderWidth: 1, borderColor: `${COLORS.error}30`,
                flexDirection: 'row', gap: 10,
              }}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: 4 }}>Debate Failed</Text>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, lineHeight: 18, opacity: 0.8 }}>{genState.error}</Text>
                </View>
              </Animated.View>
            )}

            {/* ── Voice error banner ─────────────────────────────────────── */}
            {voiceState.error && (
              <Animated.View entering={FadeIn.duration(300)} style={{
                backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, marginBottom: SPACING.md,
                borderWidth: 1, borderColor: `${COLORS.warning}30`,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Ionicons name="mic-off-outline" size={16} color={COLORS.warning} />
                <Text style={{ flex: 1, color: COLORS.warning, fontSize: FONTS.sizes.xs }}>{voiceState.error}</Text>
                <TouchableOpacity onPress={clearVoiceError}>
                  <Ionicons name="close" size={16} color={COLORS.warning} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Create form ────────────────────────────────────────────── */}
            {showForm && (
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                <Text style={{
                  color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  New Debate
                </Text>

                {/* Topic input with voice button */}
                <View style={{
                  backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                  borderWidth: 1,
                  borderColor: voiceState.isRecording ? `${COLORS.error}60` : COLORS.border,
                  marginBottom: SPACING.md,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md, gap: 10 }}>
                    <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                    <TextInput
                      ref={topicInputRef}
                      value={topic}
                      onChangeText={setTopic}
                      placeholder="E.g. Will AI replace programmers? Should social media be regulated?"
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      numberOfLines={3}
                      editable={!voiceState.isRecording && !voiceState.isTranscribing}
                      style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22, minHeight: 70, textAlignVertical: 'top' }}
                    />
                    <VoiceInputButton
                      voiceState={voiceState}
                      onStart={handleVoicePress}
                      onStop={handleVoicePress}
                      style={{ marginTop: 2 }}
                    />
                  </View>

                  {voiceState.isRecording && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error }} />
                      <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Listening… tap stop when done</Text>
                    </View>
                  )}
                  {voiceState.isTranscribing && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm }}>
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs }}>Transcribing your voice…</Text>
                    </View>
                  )}
                </View>

                {/* Imported report chip */}
                {hasReport && importedReport && (
                  <ImportedReportChip
                    reportTitle={importedReport.title}
                    sectionsCount={importedReport.sections.length}
                    sourcesCount={importedReport.sourcesCount}
                    onRemove={clearReport}
                  />
                )}

                {/* Agent preview + report import card */}
                <View style={{
                  backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                  padding: SPACING.md, marginBottom: SPACING.md,
                  borderWidth: 1, borderColor: COLORS.border,
                }}>
                  {/* Import report button */}
                  <TouchableOpacity
                    onPress={() => setShowReportSheet(true)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingBottom: SPACING.sm, marginBottom: SPACING.sm,
                      borderBottomWidth: 1, borderBottomColor: COLORS.border,
                    }}
                  >
                    <View style={{
                      width: 34, height: 34, borderRadius: 10,
                      backgroundColor: hasReport ? `${COLORS.success}15` : `${COLORS.primary}15`,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: hasReport ? `${COLORS.success}25` : `${COLORS.primary}25`,
                    }}>
                      <Ionicons name={hasReport ? 'document-text' : 'add-circle-outline'} size={17} color={hasReport ? COLORS.success : COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: hasReport ? COLORS.success : COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                        {hasReport ? 'Report Attached ✓' : 'Import Research Report'}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                        {hasReport ? 'Agents will use verified facts from your report' : 'Ground debate in your existing research data'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>

                  {/* Agent chips */}
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: SPACING.sm,
                  }}>
                    6 AI Agents Will Debate{hasReport ? ' (+ Report Context)' : ' (+ Web Search)'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                    {[
                      { label: 'Optimist',     icon: 'sunny-outline',            color: '#43E97B' },
                      { label: 'Skeptic',      icon: 'alert-circle-outline',     color: '#FF6584' },
                      { label: 'Economist',    icon: 'trending-up-outline',      color: '#FFD700' },
                      { label: 'Technologist', icon: 'hardware-chip-outline',    color: '#29B6F6' },
                      { label: 'Ethicist',     icon: 'shield-checkmark-outline', color: '#C084FC' },
                      { label: 'Futurist',     icon: 'telescope-outline',        color: '#FF8E53' },
                    ].map(agent => (
                      <View key={agent.label} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: `${agent.color}12`, borderRadius: RADIUS.full,
                        paddingHorizontal: 10, paddingVertical: 5,
                        borderWidth: 1, borderColor: `${agent.color}25`,
                      }}>
                        <Ionicons name={agent.icon as any} size={12} color={agent.color} />
                        <Text style={{ color: agent.color, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{agent.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Suggested topics */}
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                  letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Suggested Topics
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.lg }}>
                  {SUGGESTED_TOPICS.map(t => (
                    <SuggestedTopicChip key={t} topic={t} onPress={() => setTopic(t)} />
                  ))}
                </View>

                {/* ── Launch button ────────────────────────────────────── */}
                {/* Part 24: credit cost reminder above button */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: SPACING.sm,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="flash" size={13} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      This will use{' '}
                      <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
                        {FEATURE_COSTS.debate} credits
                      </Text>
                    </Text>
                  </View>
                  <CreditBalance balance={balance} size="sm" />
                </View>

                <TouchableOpacity onPress={handleStart} disabled={isConsuming} activeOpacity={0.85}>
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.primaryDark]}
                    style={{
                      borderRadius: RADIUS.lg, paddingVertical: 16,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                  >
                    <Ionicons name="people" size={20} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '700' }}>
                      {isConsuming ? 'Checking credits...' : hasReport ? 'Start Debate (with Report)' : 'Start Debate'}
                    </Text>
                    {/* Part 24: credit cost badge */}
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Ionicons name="flash" size={10} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{FEATURE_COSTS.debate} cr</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── History section ─────────────────────────────────────────── */}
            {(debates.length > 0 || loading) && (
              <View style={{ marginTop: SPACING.xl }}>
                <Text style={{
                  color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Past Debates
                </Text>
                {loading && debates.length === 0 && [0, 1, 2].map(i => (
                  <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, height: 110, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: 1 - i * 0.25 }} />
                ))}
                {debates.map((session, i) => (
                  <DebateHistoryCard
                    key={session.id} session={session} index={i}
                    onPress={() => router.push({ pathname: '/(app)/debate-detail' as any, params: { sessionId: session.id } })}
                    onDelete={() => handleDelete(session.id, session.topic)}
                  />
                ))}
              </View>
            )}

            {/* ── Empty state ─────────────────────────────────────────────── */}
            {!loading && debates.length === 0 && phase === 'idle' && (
              <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: SPACING.xl }}>
                <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
                  <Ionicons name="people-outline" size={32} color={COLORS.border} />
                </View>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600', textAlign: 'center' }}>No debates yet</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 }}>
                  Enter a topic above or tap the mic{'\n'}to speak your debate question
                </Text>
              </Animated.View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Report import sheet */}
        <ReportImportSheet
          visible={showReportSheet}
          onClose={() => setShowReportSheet(false)}
          onSelectReport={handleReportSelected}
          selectedReportId={importedReport?.id ?? null}
        />

        {/* Part 24: Insufficient Credits Modal */}
        <InsufficientCreditsModal
          visible={!!insufficientInfo}
          info={insufficientInfo}
          onClose={clearInsufficient}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}