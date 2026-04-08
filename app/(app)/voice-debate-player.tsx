// app/(app)/voice-debate-player.tsx
// Part 40 — Voice Debate Engine
//
// Full-screen cinematic voice debate player.
//
// Layout (top → bottom):
//   Header row: [back] [segment label] [transcript btn] [share btn]
//   Centre: Agent avatar strip + active speaker highlight + waveform
//   Confidence arc (shows updated confidence per turn)
//   Transcript subtitles (current turn text, speaker name)
//   Progress bar with segment markers
//   Transport controls (prev / play-pause / next)
//   Playback rate selector
//
// Navigation: pushed from debate-detail.tsx (Overview tab)
// Params: voiceDebateId (string)

import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, StyleSheet,
  ActivityIndicator, Alert, Dimensions, Platform,
  TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }            from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence, withSpring,
  cancelAnimation, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }   from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }            from '../../src/lib/supabase';

import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
}                                         from '../../src/constants/voiceDebate';
import { useVoiceDebatePlayer }           from '../../src/hooks/useVoiceDebatePlayer';
import { mapRowToVoiceDebate }            from '../../src/services/voiceDebateOrchestrator';
import {
  exportVoiceDebateAsPDF,
  exportVoiceDebateAsMP3,
  copyVoiceDebateTranscript,
}                                         from '../../src/services/voiceDebateExport';
import { WaveformVisualizer }             from '../../src/components/podcast/WaveformVisualizer';
import { DebateTranscriptSheet }          from '../../src/components/debate/DebateTranscriptSheet';
import { DebateConfidenceArc }            from '../../src/components/debate/DebateConfidenceArc';
// VoiceDebate lives in voiceDebate types; DebateSegmentType also lives there (not in src/types/index)
import type { VoiceDebate }              from '../../src/types/voiceDebate';
import type { DebateAgentRole }          from '../../src/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];
const CONTROLS_HIDE_MS = 5000;

// ─── Segment key type derived from the constant, not from the type alias ──────
//
// Using `keyof typeof SEGMENT_COLORS` means TypeScript's Record index check
// sees exactly the same union on both sides and stops complaining (TS7053).
// This is safer than importing DebateSegmentType and casting, because the
// constant IS the ground truth — no drift possible.
//
type SegmentKey = keyof typeof SEGMENT_COLORS;

/** Cast any unknown value to a valid SegmentKey, defaulting to 'opening'. */
function asSegmentKey(value: unknown): SegmentKey {
  return (value ?? 'opening') as SegmentKey;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSpeakerColor(speaker: string): string {
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'];
  return persona?.color ?? '#6C63FF';
}

function getSpeakerDisplayName(speaker: string): string {
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'];
  return persona?.displayName ?? 'Speaker';
}

// ─── Animated Orb ─────────────────────────────────────────────────────────────

function Orb({ x, y, size, color, duration }: {
  x: number; y: number; size: number; color: string; duration: number;
}) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0.12);
  useEffect(() => {
    ty.value = withRepeat(withSequence(
      withTiming(-14, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(14,  { duration, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    op.value = withRepeat(withSequence(
      withTiming(0.22, { duration: duration * 0.6 }),
      withTiming(0.08, { duration: duration * 0.6 }),
    ), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ translateY: ty.value }],
  }));
  return (
    <Animated.View style={[style, {
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }]} />
  );
}

// ─── Agent Avatar Strip ────────────────────────────────────────────────────────

function AgentAvatarStrip({
  voiceDebate,
  activeSpeaker,
  accentColor,
}: {
  voiceDebate:   VoiceDebate;
  activeSpeaker: string;
  accentColor:   string;
}) {
  const agentRoles = useMemo(() => {
    const seen  = new Set<string>();
    const roles: string[] = [];
    for (const turn of (voiceDebate.script?.turns ?? [])) {
      if (!seen.has(turn.speaker)) { seen.add(turn.speaker); roles.push(turn.speaker); }
    }
    return roles;
  }, [voiceDebate]);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
      {agentRoles.map(role => {
        const persona  = VOICE_PERSONAS[role as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
        const isActive = role === activeSpeaker;
        const scale    = useSharedValue(isActive ? 1.12 : 1.0);

        useEffect(() => {
          scale.value = withSpring(isActive ? 1.12 : 1.0, { damping: 12, stiffness: 180 });
        }, [isActive]);

        const animStyle = useAnimatedStyle(() => ({
          transform: [{ scale: scale.value }],
        }));

        return (
          <Animated.View key={role} style={animStyle}>
            <View style={{
              width:           isActive ? 52 : 40,
              height:          isActive ? 52 : 40,
              borderRadius:    isActive ? 16 : 12,
              backgroundColor: `${persona.color}${isActive ? '30' : '15'}`,
              borderWidth:     isActive ? 2 : 1,
              borderColor:     isActive ? persona.color : `${persona.color}40`,
              alignItems:      'center', justifyContent: 'center',
              shadowColor:     isActive ? persona.color : 'transparent',
              shadowOpacity:   isActive ? 0.8 : 0,
              shadowRadius:    isActive ? 12 : 0,
              elevation:       isActive ? 8 : 0,
            }}>
              <Ionicons
                name={persona.icon as any}
                size={isActive ? 24 : 18}
                color={persona.color}
              />
            </View>
            {isActive && (
              <View style={{
                position: 'absolute', bottom: -6, left: '50%' as any,
                transform: [{ translateX: -12 }],
                backgroundColor: persona.color,
                borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1,
              }}>
                <Text style={{ color: '#FFF', fontSize: 7, fontWeight: '800' }}>NOW</Text>
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Segment Progress Bar ──────────────────────────────────────────────────────

function SegmentProgressBar({
  voiceDebate,
  progress,
  totalDurationMs,
  currentPositionMs,
  formatTime,
  onSeek,
  currentSegmentType,
}: {
  voiceDebate:        VoiceDebate;
  progress:           number;
  totalDurationMs:    number;
  currentPositionMs:  number;
  formatTime:         (ms: number) => string;
  onSeek:             (p: number) => void;
  currentSegmentType: string;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 150 });
  }, [progress]);

  const fillStyle  = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${fill.value * 100}%` as any, transform: [{ translateX: -9 }],
  }));

  const segments = voiceDebate.script?.segments ?? [];
  const turns    = voiceDebate.script?.turns ?? [];
  const totalDur = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0) || totalDurationMs;

  // ── All SEGMENT_* indexing uses SegmentKey — no more TS7053 ───────────────
  const segKey   = asSegmentKey(currentSegmentType);
  const segColor = SEGMENT_COLORS[segKey] ?? COLORS.primary;

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatTime(currentPositionMs)}
        </Text>
        <Text style={{ color: segColor, fontSize: 11, fontWeight: '700' }}>
          {SEGMENT_LABELS[segKey] ?? ''}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {formatTime(totalDur)}
        </Text>
      </View>

      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={1}
        style={{
          height: 8, backgroundColor: 'rgba(255,255,255,0.10)',
          borderRadius: 4, overflow: 'visible', marginBottom: 22,
        }}
      >
        <Animated.View style={[fillStyle, {
          height: '100%', backgroundColor: segColor, borderRadius: 4,
        }]} />
        <Animated.View style={[thumbStyle, {
          position: 'absolute', top: -5, width: 18, height: 18, borderRadius: 9,
          backgroundColor: '#FFF',
          shadowColor: segColor, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6,
        }]} />

        {/* Segment markers */}
        {barWidth > 0 && segments.map(seg => {
          const segStartMs = turns
            .slice(0, seg.startTurnIdx)
            .reduce((s, t) => s + (t.durationMs ?? 0), 0);
          if (totalDur <= 0 || segStartMs <= 0) return null;
          const pct = Math.min(1, segStartMs / totalDur);
          const x   = pct * barWidth;
          if (x < 10 || x > barWidth - 10) return null;
          const sk     = asSegmentKey(seg.type);
          const sColor = SEGMENT_COLORS[sk] ?? COLORS.primary;
          return (
            <View key={seg.id} style={{
              position: 'absolute', left: x - 1.5, top: -2,
              width: 3, height: 12, borderRadius: 1.5,
              backgroundColor: `${sColor}90`,
            }} />
          );
        })}
      </TouchableOpacity>

      {/* Segment icons row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: -14, marginBottom: 8 }}>
        {segments.map(seg => {
          const sk           = asSegmentKey(seg.type);
          const isCurrentSeg = seg.type === currentSegmentType;
          const sColor       = SEGMENT_COLORS[sk] ?? COLORS.primary;
          return (
            <View key={seg.id} style={{ alignItems: 'center', gap: 2 }}>
              <Ionicons
                name={SEGMENT_ICONS[sk] as any}
                size={10}
                color={isCurrentSeg ? sColor : 'rgba(255,255,255,0.2)'}
              />
              <Text style={{
                color:      isCurrentSeg ? sColor : 'rgba(255,255,255,0.2)',
                fontSize:   7, fontWeight: isCurrentSeg ? '700' : '400',
              }}>
                {SEGMENT_LABELS[sk]?.split(' ')[0] ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Rate Selector ────────────────────────────────────────────────────────────

function RateSelector({ current, onSelect, accentColor }: {
  current: number; onSelect: (r: number) => void; accentColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {RATE_OPTIONS.map(r => {
        const active = current === r;
        return (
          <TouchableOpacity key={r} onPress={() => onSelect(r)} style={{
            backgroundColor: active ? `${accentColor}30` : 'rgba(255,255,255,0.07)',
            borderRadius: 18, paddingHorizontal: 12, paddingVertical: 5,
            borderWidth: 1, borderColor: active ? accentColor : 'rgba(255,255,255,0.12)',
          }}>
            <Text style={{ color: active ? accentColor : 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: active ? '800' : '400' }}>
              {r}×
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VoiceDebatePlayerScreen() {
  const { voiceDebateId } = useLocalSearchParams<{ voiceDebateId: string }>();
  const insets            = useSafeAreaInsets();
  const topInset          = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset       = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [voiceDebate,    setVoiceDebate]    = useState<VoiceDebate | null>(null);
  const [loadingDebate,  setLoadingDebate]  = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [hasStarted,     setHasStarted]     = useState(false);
  const [showControls,   setShowControls]   = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showShare,      setShowShare]      = useState(false);
  const [shareBusy,      setShareBusy]      = useState<string | null>(null);
  const [shareCopied,    setShareCopied]    = useState(false);

  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    controlsTimeout.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, []);

  const handleTap = useCallback(() => {
    if (showTranscript || showShare) return;
    if (showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      setShowControls(false);
    } else {
      resetControlsTimer();
    }
  }, [showControls, showTranscript, showShare, resetControlsTimer]);

  // Load voice debate
  useEffect(() => {
    if (!voiceDebateId) { setLoadError('No voice debate ID provided.'); setLoadingDebate(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('voice_debates')
          .select('*')
          .eq('id', voiceDebateId)
          .single();
        if (error || !data) { setLoadError('Could not load this voice debate.'); return; }
        setVoiceDebate(mapRowToVoiceDebate(data as any));
      } catch { setLoadError('Failed to load voice debate.'); }
      finally  { setLoadingDebate(false); }
    })();
  }, [voiceDebateId]);

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipToTurn,
    skipNext, skipPrevious, setPlaybackRate,
    seekToPercent, skipToSegment, stopPlayback, formatTime,
  } = useVoiceDebatePlayer(voiceDebate);

  // Auto-start on load
  useEffect(() => {
    if (!voiceDebate || loadingDebate || hasStarted) return;
    setHasStarted(true);
    resetControlsTimer();
    // supabase.rpc() returns PostgrestFilterBuilder which has no .catch().
    // Wrap in Promise.resolve() to get a real Promise before chaining .catch().
    Promise.resolve(
      supabase.rpc('increment_voice_debate_play_count', { p_voice_debate_id: voiceDebate.id })
    ).catch(() => {});
    startPlayback(0);
  }, [voiceDebate, loadingDebate, hasStarted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      stopPlayback();
    };
  }, []);

  const handleSeek = useCallback((p: number) => {
    seekToPercent(p);
    resetControlsTimer();
  }, [seekToPercent, resetControlsTimer]);

  const handleTurnJump = useCallback((index: number) => {
    skipToTurn(index);
    resetControlsTimer();
  }, [skipToTurn, resetControlsTimer]);

  // Speaker-derived colors
  const activeSpeaker = currentTurn?.speaker ?? 'moderator';
  const accentColor   = getSpeakerColor(activeSpeaker);
  const bgColors: [string, string, string] = ['#06060F', `${accentColor}18`, '#06060F'];

  // Share handlers
  const handleSharePDF = async () => {
    if (!voiceDebate || shareBusy) return;
    setShareBusy('pdf');
    try { await exportVoiceDebateAsPDF(voiceDebate); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setShareBusy(null); }
  };

  const handleShareMP3 = async () => {
    if (!voiceDebate || shareBusy) return;
    setShareBusy('mp3');
    try { await exportVoiceDebateAsMP3(voiceDebate); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export audio.'); }
    finally { setShareBusy(null); }
  };

  const handleCopy = async () => {
    if (!voiceDebate || shareBusy) return;
    setShareBusy('copy');
    try {
      await copyVoiceDebateTranscript(voiceDebate);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setShareBusy(null); }
  };

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loadingDebate) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>Loading voice debate...</Text>
      </View>
    );
  }

  if (loadError || !voiceDebate) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: topInset + 32 }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <Ionicons name="alert-circle-outline" size={48} color="#FF6584" />
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
          {loadError ?? 'Voice debate not found'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: '#6C63FF', fontSize: 16, fontWeight: '600' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  const turns       = voiceDebate.script?.turns ?? [];
  const durationMin = Math.round(voiceDebate.durationSeconds / 60);

  // Cast header segment key once — reused for all three SEGMENT_* lookups below
  const headerSegKey = asSegmentKey(playerState.currentSegmentType);

  return (
    <View style={{ flex: 1, backgroundColor: '#06060F' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Gradient background */}
      <LinearGradient colors={bgColors} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject} />

      {/* Ambient orbs */}
      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.22} size={180} color={accentColor} duration={3400} />
      <Orb x={SCREEN_W * 0.80} y={SCREEN_H * 0.45} size={140} color={accentColor} duration={4200} />
      <Orb x={SCREEN_W * 0.50} y={SCREEN_H * 0.75} size={120} color={accentColor} duration={3800} />

      {/* Main tap surface */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop:    topInset,
              paddingBottom: bottomInset + 20,
              minHeight:     SCREEN_H,
            }}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          >
            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <View style={s.header}>
              <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} onPressIn={resetControlsTimer}>
                <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>

              {/* Center: active segment label */}
              <View style={s.segmentBadge}>
                <Ionicons
                  name={(SEGMENT_ICONS[headerSegKey] ?? 'mic-outline') as any}
                  size={10}
                  color={SEGMENT_COLORS[headerSegKey] ?? COLORS.primary}
                />
                <Text style={[s.segmentText, { color: SEGMENT_COLORS[headerSegKey] ?? COLORS.primary }]}>
                  {SEGMENT_LABELS[headerSegKey] ?? 'Debate'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowTranscript(true); resetControlsTimer(); }}
                  style={[s.headerBtn, showTranscript && { backgroundColor: `${accentColor}25`, borderColor: `${accentColor}50` }]}
                  onPressIn={resetControlsTimer}
                >
                  <Ionicons name="menu-outline" size={22} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowShare(true); resetControlsTimer(); }}
                  style={s.headerBtn}
                  onPressIn={resetControlsTimer}
                >
                  <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── CENTRE SECTION ──────────────────────────────────────────── */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>

              {/* Topic */}
              <Text style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center',
                marginBottom: 20, fontWeight: '500', paddingHorizontal: 20,
              }} numberOfLines={2}>
                {voiceDebate.topic}
              </Text>

              {/* Agent avatars */}
              <AgentAvatarStrip
                voiceDebate={voiceDebate}
                activeSpeaker={activeSpeaker}
                accentColor={accentColor}
              />

              {/* Waveform */}
              <View style={{ marginTop: 24, marginBottom: 8 }}>
                <WaveformVisualizer
                  isPlaying={playerState.isPlaying}
                  color={accentColor}
                  barWidth={5}
                  barGap={4}
                  maxHeight={52}
                />
              </View>

              {/* Turn indicator */}
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' }}>
                Turn {playerState.currentTurnIndex + 1} of {turns.length}
              </Text>

              {/* Confidence Arc */}
              {turns.length > 0 && (
                <View style={{ width: '100%', marginTop: 16 }}>
                  <DebateConfidenceArc turns={turns} />
                </View>
              )}
            </View>

            {/* ── BOTTOM PANEL ────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>

              {/* Current speaker + subtitle */}
              {currentTurn && (
                <Animated.View
                  key={playerState.currentTurnIndex}
                  entering={FadeIn.duration(300)}
                  style={{
                    backgroundColor:  'rgba(0,0,0,0.35)',
                    borderRadius:     16,
                    padding:          16,
                    marginBottom:     16,
                    borderWidth:      1,
                    borderColor:      `${accentColor}25`,
                    borderLeftWidth:  3,
                    borderLeftColor:  accentColor,
                  }}
                >
                  <Text style={{
                    color:         accentColor,
                    fontSize:      FONTS.sizes.xs,
                    fontWeight:    '800',
                    letterSpacing: 0.8,
                    marginBottom:  6,
                  }}>
                    {getSpeakerDisplayName(activeSpeaker).toUpperCase()}
                    {currentTurn.confidence ? ` · ${currentTurn.confidence}/10` : ''}
                  </Text>
                  <Text style={{
                    color:      'rgba(255,255,255,0.85)',
                    fontSize:   13,
                    lineHeight: 20,
                    fontWeight: '400',
                  }} numberOfLines={4}>
                    {currentTurn.text}
                  </Text>
                </Animated.View>
              )}

              {/* Progress bar */}
              {showControls && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)}>
                  <SegmentProgressBar
                    voiceDebate={voiceDebate}
                    progress={progressPercent}
                    totalDurationMs={playerState.totalDurationMs}
                    currentPositionMs={playerState.totalPositionMs}
                    formatTime={formatTime}
                    onSeek={handleSeek}
                    currentSegmentType={playerState.currentSegmentType}
                  />

                  {/* Transport controls */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 14 }}>
                    <TouchableOpacity
                      onPress={() => { skipPrevious(); resetControlsTimer(); }}
                      style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="play-skip-back" size={28} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { togglePlayPause(); resetControlsTimer(); }}
                      disabled={playerState.isLoading}
                      style={{
                        width: 70, height: 70, borderRadius: 35,
                        backgroundColor: accentColor,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: accentColor, shadowOpacity: 0.75, shadowRadius: 20, elevation: 12,
                      }}
                    >
                      {playerState.isLoading
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Ionicons
                            name={playerState.isPlaying ? 'pause' : 'play'}
                            size={28} color="#FFF"
                            style={{ marginLeft: playerState.isPlaying ? 0 : 3 }}
                          />
                      }
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { skipNext(); resetControlsTimer(); }}
                      style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="play-skip-forward" size={28} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  </View>

                  {/* Rate selector */}
                  <RateSelector
                    current={playerState.playbackRate}
                    onSelect={r => { setPlaybackRate(r); resetControlsTimer(); }}
                    accentColor={accentColor}
                  />
                </Animated.View>
              )}
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>

      {/* ── Transcript Sheet ─────────────────────────────────────────────── */}
      {showTranscript && (
        <DebateTranscriptSheet
          voiceDebate={voiceDebate}
          currentTurnIndex={playerState.currentTurnIndex}
          bottomInset={bottomInset}
          onClose={() => setShowTranscript(false)}
          onTurnPress={handleTurnJump}
        />
      )}

      {/* ── Share Sheet ──────────────────────────────────────────────────── */}
      {showShare && (
        <TouchableWithoutFeedback onPress={() => setShowShare(false)}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                entering={FadeInDown.duration(350).springify()}
                style={{
                  backgroundColor: '#111128',
                  borderTopLeftRadius: 28, borderTopRightRadius: 28,
                  padding: 24, paddingBottom: Math.max(bottomInset + 16, 40),
                  borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
                }}
              >
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 }} />
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 4 }}>Export Voice Debate</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 20 }} numberOfLines={1}>
                  {voiceDebate.topic}
                </Text>

                {([
                  { id: 'pdf',  icon: 'document-text-outline',  label: 'Export PDF Transcript', sub: 'Styled transcript with argument threading', color: '#6C63FF', onPress: handleSharePDF },
                  { id: 'mp3',  icon: 'musical-notes-outline',  label: 'Export Audio (MP3)',      sub: 'Full debate as single audio file',         color: '#FF6584', onPress: handleShareMP3 },
                  { id: 'copy', icon: shareCopied ? 'checkmark-circle-outline' : 'copy-outline', label: shareCopied ? 'Copied!' : 'Copy Transcript', sub: 'Plain text to clipboard', color: '#43E97B', onPress: handleCopy },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={opt.onPress}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      padding: 14, backgroundColor: 'rgba(255,255,255,0.06)',
                      borderRadius: 14, marginBottom: 10,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
                    }}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${opt.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      {shareBusy === opt.id
                        ? <ActivityIndicator size="small" color={opt.color} />
                        : <Ionicons name={opt.icon as any} size={22} color={opt.color} />
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>{opt.label}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {!shareBusy && <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity onPress={() => setShowShare(false)} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   10,
    zIndex:            20,
  },
  headerBtn: {
    width:           44, height:          44, borderRadius:    14,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems:      'center', justifyContent: 'center',
    borderWidth:     1, borderColor: 'rgba(255,255,255,0.12)',
  },
  segmentBadge: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               5,
    marginHorizontal:  8,
    backgroundColor:   'rgba(0,0,0,0.35)',
    borderRadius:      20,
    paddingVertical:   6,
    paddingHorizontal: 14,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
  },
  segmentText: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
});