// app/(app)/voice-debate-player.tsx
// Part 40 Fix — Complete redesign solving 3 issues:
//
// FIX 1 — MiniPlayer continuity:
//   When screen mounts, if VoiceDebateEngine.isActiveFor(id) is true,
//   we call reattach() instead of startPlayback(0). This means tapping
//   the MiniPlayer to return to the full player continues from where it was.
//   The useVoiceDebatePlayer hook already handles this; the bug was that
//   hasStarted guard was also preventing re-attach. Now we distinguish:
//     • First open → start from turn 0
//     • Re-open from MiniPlayer → reattach to running engine
//
// FIX 2 — Cancel button handled in VoiceDebateCard / debate-detail (separate file).
//
// FIX 3 — Layout redesign:
//   Root cause: DebateConfidenceArc was inside the center flex section
//   competing with controls for space. On small phones, controls were
//   pushed below the visible area.
//   Solution: Restructured into a proper fixed layout:
//     • Header (fixed)
//     • ScrollView for everything ABOVE controls (agent strip, waveform, turn info, arc)
//     • Controls panel PINNED at the bottom (NOT in ScrollView)
//   This guarantees play/pause is always visible regardless of screen size.
//
// FIX 4 — Full transcript display:
//   Removed numberOfLines={4} limit from the current speaker card so the
//   full transcript text is always visible (card is inside a ScrollView).

import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, StyleSheet,
  ActivityIndicator, Alert, Dimensions, Platform,
  TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { LinearGradient }         from 'expo-linear-gradient';
import { Ionicons }               from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence, withSpring,
  cancelAnimation, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }       from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase }                from '../../src/lib/supabase';

import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
}                                         from '../../src/constants/voiceDebate';
import { useVoiceDebatePlayer }           from '../../src/hooks/useVoiceDebatePlayer';
import {
  VoiceDebateEngine,
}                                         from '../../src/services/VoiceDebateAudioEngine';
import { mapRowToVoiceDebate }            from '../../src/services/voiceDebateOrchestrator';
import {
  exportVoiceDebateAsPDF,
  exportVoiceDebateAsMP3,
  copyVoiceDebateTranscript,
}                                         from '../../src/services/voiceDebateExport';
import { WaveformVisualizer }             from '../../src/components/podcast/WaveformVisualizer';
import { DebateTranscriptSheet }          from '../../src/components/debate/DebateTranscriptSheet';
import { DebateConfidenceArc }            from '../../src/components/debate/DebateConfidenceArc';
import type { VoiceDebate }               from '../../src/types/voiceDebate';
import type { DebateAgentRole }           from '../../src/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

type SegmentKey = keyof typeof SEGMENT_COLORS;

function asSegmentKey(value: unknown): SegmentKey {
  return (value ?? 'opening') as SegmentKey;
}

// ─── Duration helper ──────────────────────────────────────────────────────────

function computeDisplayMinutes(vd: VoiceDebate): number {
  const turns = vd.script?.turns ?? [];
  const totalMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
  if (totalMs > 0) return Math.max(1, Math.round(totalMs / 60000));
  if (vd.durationSeconds > 0) return Math.max(1, Math.round(vd.durationSeconds / 60));
  if (vd.wordCount > 0) return Math.max(1, Math.round(vd.wordCount / 120));
  return 0;
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
  const op = useSharedValue(0.08);
  useEffect(() => {
    ty.value = withRepeat(withSequence(
      withTiming(-12, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(12,  { duration, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    op.value = withRepeat(withSequence(
      withTiming(0.18, { duration: duration * 0.6 }),
      withTiming(0.05, { duration: duration * 0.6 }),
    ), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: op.value, transform: [{ translateY: ty.value }],
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
// Compact horizontal strip — each avatar is smaller to save vertical space

function AgentAvatarStrip({
  voiceDebate, activeSpeaker,
}: {
  voiceDebate:   VoiceDebate;
  activeSpeaker: string;
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
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
      {agentRoles.map(role => {
        const persona  = VOICE_PERSONAS[role as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
        const isActive = role === activeSpeaker;
        const scale    = useSharedValue(isActive ? 1.15 : 1.0);

        useEffect(() => {
          scale.value = withSpring(isActive ? 1.15 : 1.0, { damping: 12, stiffness: 180 });
        }, [isActive]);

        const animStyle = useAnimatedStyle(() => ({
          transform: [{ scale: scale.value }],
        }));

        return (
          <Animated.View key={role} style={animStyle}>
            <View style={{
              width:           isActive ? 46 : 34,
              height:          isActive ? 46 : 34,
              borderRadius:    isActive ? 14 : 10,
              backgroundColor: `${persona.color}${isActive ? '28' : '12'}`,
              borderWidth:     isActive ? 2 : 1,
              borderColor:     isActive ? persona.color : `${persona.color}35`,
              alignItems:      'center', justifyContent: 'center',
              shadowColor:     isActive ? persona.color : 'transparent',
              shadowOpacity:   isActive ? 0.7 : 0,
              shadowRadius:    isActive ? 10 : 0,
              elevation:       isActive ? 6 : 0,
            }}>
              <Ionicons name={persona.icon as any} size={isActive ? 20 : 15} color={persona.color} />
            </View>
            {isActive && (
              <View style={{
                position: 'absolute', bottom: -5, left: '50%' as any,
                transform: [{ translateX: -11 }],
                backgroundColor: persona.color,
                borderRadius: RADIUS.full, paddingHorizontal: 4, paddingVertical: 1,
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
  voiceDebate, progress, totalDurationMs, currentPositionMs,
  formatTime, onSeek, currentSegmentType,
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
  const fill  = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 150 });
  }, [progress]);

  const fillStyle  = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${fill.value * 100}%` as any, transform: [{ translateX: -8 }],
  }));

  const segments = voiceDebate.script?.segments ?? [];
  const turns    = voiceDebate.script?.turns ?? [];
  const totalDur = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0) || totalDurationMs;

  const segKey   = asSegmentKey(currentSegmentType);
  const segColor = SEGMENT_COLORS[segKey] ?? COLORS.primary;

  return (
    <View style={{ width: '100%' }}>
      {/* Time labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatTime(currentPositionMs)}
        </Text>
        <Text style={{ color: segColor, fontSize: 10, fontWeight: '700' }}>
          {SEGMENT_LABELS[segKey] ?? ''}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {formatTime(totalDur)}
        </Text>
      </View>

      {/* Track */}
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={1}
        style={{
          height: 7, backgroundColor: 'rgba(255,255,255,0.10)',
          borderRadius: 4, overflow: 'visible', marginBottom: 20,
        }}
      >
        <Animated.View style={[fillStyle, {
          height: '100%', backgroundColor: segColor, borderRadius: 4,
        }]} />
        <Animated.View style={[thumbStyle, {
          position: 'absolute', top: -4.5, width: 16, height: 16, borderRadius: 8,
          backgroundColor: '#FFF',
          shadowColor: segColor, shadowOpacity: 0.9, shadowRadius: 6, elevation: 5,
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
              width: 3, height: 11, borderRadius: 1.5,
              backgroundColor: `${sColor}80`,
            }} />
          );
        })}
      </TouchableOpacity>

      {/* Segment icon row */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: 2, marginTop: -14, marginBottom: 4,
      }}>
        {segments.map(seg => {
          const sk           = asSegmentKey(seg.type);
          const isCurrentSeg = seg.type === currentSegmentType;
          const sColor       = SEGMENT_COLORS[sk] ?? COLORS.primary;
          return (
            <View key={seg.id} style={{ alignItems: 'center', gap: 1 }}>
              <Ionicons
                name={SEGMENT_ICONS[sk] as any}
                size={9}
                color={isCurrentSeg ? sColor : 'rgba(255,255,255,0.18)'}
              />
              <Text style={{
                color:     isCurrentSeg ? sColor : 'rgba(255,255,255,0.18)',
                fontSize:  6.5, fontWeight: isCurrentSeg ? '700' : '400',
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
    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}>
      {RATE_OPTIONS.map(r => {
        const active = current === r;
        return (
          <TouchableOpacity key={r} onPress={() => onSelect(r)} style={{
            backgroundColor: active ? `${accentColor}28` : 'rgba(255,255,255,0.07)',
            borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4,
            borderWidth: 1, borderColor: active ? accentColor : 'rgba(255,255,255,0.10)',
          }}>
            <Text style={{
              color:      active ? accentColor : 'rgba(255,255,255,0.4)',
              fontSize:   11, fontWeight: active ? '800' : '400',
            }}>
              {r}×
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Collapsible Confidence Arc ───────────────────────────────────────────────

function CollapsibleArc({ voiceDebate, accentColor }: {
  voiceDebate: VoiceDebate; accentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const turns = voiceDebate.script?.turns ?? [];

  if (turns.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <TouchableOpacity
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.8}
        style={{
          flexDirection:   'row',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             6,
          paddingVertical: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius:    12,
          borderWidth:     1,
          borderColor:     `${accentColor}20`,
        }}
      >
        <Ionicons name="analytics-outline" size={13} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>
          Confidence Arc
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={`${accentColor}80`}
        />
      </TouchableOpacity>

      {expanded && (
        <Animated.View entering={FadeIn.duration(250)}>
          <DebateConfidenceArc turns={turns} />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VoiceDebatePlayerScreen() {
  const { voiceDebateId }  = useLocalSearchParams<{ voiceDebateId: string }>();
  const insets             = useSafeAreaInsets();
  const navigation         = useNavigation();
  const topInset           = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset        = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [voiceDebate,    setVoiceDebate]    = useState<VoiceDebate | null>(null);
  const [loadingDebate,  setLoadingDebate]  = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showShare,      setShowShare]      = useState(false);
  const [shareBusy,      setShareBusy]      = useState<string | null>(null);
  const [shareCopied,    setShareCopied]    = useState(false);

  // FIX 1: Track whether this is a fresh open or a return from MiniPlayer
  const hasInitialisedRef = useRef(false);

  // Load voice debate
  useEffect(() => {
    if (!voiceDebateId) {
      setLoadError('No voice debate ID provided.');
      setLoadingDebate(false);
      return;
    }
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
    seekToPercent, skipToSegment, detachScreen,
    stopPlayback, formatTime,
  } = useVoiceDebatePlayer(voiceDebate);

  // ── FIX 1: Smart initialisation — reattach vs fresh start ─────────────────
  // If the engine is already playing this debate (user came back from MiniPlayer),
  // we reattach (which is already handled in useVoiceDebatePlayer's useEffect).
  // Only start from turn 0 if this is a genuinely fresh open.

  useEffect(() => {
    if (!voiceDebate || loadingDebate || hasInitialisedRef.current) return;
    hasInitialisedRef.current = true;

    const isAlreadyPlaying = VoiceDebateEngine.isActiveFor(voiceDebate.id);

    if (!isAlreadyPlaying) {
      // Fresh open — increment play count and start from beginning
      const incrementPlayCount = async () => {
        try {
          await supabase.rpc('increment_voice_debate_play_count', { p_voice_debate_id: voiceDebate.id });
        } catch (error) {
          // Silently fail - this is non-critical
          console.warn('Failed to increment play count:', error);
        }
      };
      incrementPlayCount();
      startPlayback(0);
    }
    // If already playing, useVoiceDebatePlayer.reattach() has already been called
    // in its own useEffect, so we just let it continue.
  }, [voiceDebate, loadingDebate]);

  // ── Detach on back navigation (keeps audio alive → MiniPlayer) ────────────

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (_e: any) => {
      detachScreen();
    });
    return unsub;
  }, [navigation, detachScreen]);

  const handleSeek = useCallback((p: number) => {
    seekToPercent(p);
  }, [seekToPercent]);

  const handleTurnJump = useCallback((index: number) => {
    skipToTurn(index);
  }, [skipToTurn]);

  // ── Speaker-derived colors ────────────────────────────────────────────────

  const activeSpeaker = currentTurn?.speaker ?? 'moderator';
  const accentColor   = getSpeakerColor(activeSpeaker);
  const bgColors: [string, string, string] = ['#06060F', `${accentColor}14`, '#06060F'];

  const displayMinutes = voiceDebate ? computeDisplayMinutes(voiceDebate) : 0;
  const turns          = voiceDebate?.script?.turns ?? [];

  // ── Share handlers ────────────────────────────────────────────────────────

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

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loadingDebate) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>
          Loading voice debate...
        </Text>
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

  const headerSegKey = asSegmentKey(playerState.currentSegmentType);

  // ── Main Render ───────────────────────────────────────────────────────────
  // Layout: [Header] [ScrollView: topic + avatars + waveform + turn card + arc] [Controls panel pinned]

  return (
    <View style={{ flex: 1, backgroundColor: '#06060F' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Gradient background */}
      <LinearGradient
        colors={bgColors}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient orbs — positioned in top half only so they don't interfere with controls */}
      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.20} size={160} color={accentColor} duration={3400} />
      <Orb x={SCREEN_W * 0.82} y={SCREEN_H * 0.35} size={130} color={accentColor} duration={4200} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topInset }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        {/* Segment badge */}
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
            onPress={() => setShowTranscript(true)}
            style={[s.headerBtn, showTranscript && { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}45` }]}
          >
            <Ionicons name="menu-outline" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowShare(true)}
            style={s.headerBtn}
          >
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SCROLLABLE CONTENT (everything above controls) ─────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Topic */}
        <Text style={{
          color: 'rgba(255,255,255,0.32)', fontSize: 11, textAlign: 'center',
          marginBottom: 16, fontWeight: '500', paddingHorizontal: 16,
        }} numberOfLines={2}>
          {voiceDebate.topic}
        </Text>

        {/* Agent avatars */}
        <AgentAvatarStrip voiceDebate={voiceDebate} activeSpeaker={activeSpeaker} />

        {/* Waveform */}
        <View style={{ marginTop: 18, marginBottom: 6, alignItems: 'center' }}>
          <WaveformVisualizer
            isPlaying={playerState.isPlaying}
            color={accentColor}
            barWidth={5}
            barGap={4}
            maxHeight={44}
          />
        </View>

        {/* Turn indicator */}
        <Text style={{ color: 'rgba(255,255,255,0.36)', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
          Turn {playerState.currentTurnIndex + 1} / {turns.length}
          {displayMinutes > 0 ? ` · ~${displayMinutes} min` : ''}
        </Text>

        {/* Current speaker card — FIX 4: numberOfLines removed so full transcript is shown */}
        {currentTurn && (
          <Animated.View
            key={playerState.currentTurnIndex}
            entering={FadeIn.duration(280)}
            style={{
              backgroundColor: 'rgba(0,0,0,0.30)',
              borderRadius:    14,
              padding:         14,
              marginBottom:    14,
              borderWidth:     1,
              borderColor:     `${accentColor}20`,
              borderLeftWidth: 3,
              borderLeftColor: accentColor,
            }}
          >
            <Text style={{
              color:         accentColor,
              fontSize:      11,
              fontWeight:    '800',
              letterSpacing: 0.7,
              marginBottom:  5,
            }}>
              {getSpeakerDisplayName(activeSpeaker).toUpperCase()}
              {currentTurn.confidence ? ` · ${currentTurn.confidence}/10` : ''}
            </Text>
            <Text style={{
              color:      'rgba(255,255,255,0.82)',
              fontSize:   13,
              lineHeight: 19,
              fontWeight: '400',
            }}>
              {currentTurn.text}
            </Text>
          </Animated.View>
        )}

        {/* Collapsible confidence arc — BELOW the turn card, not competing with controls */}
        {turns.length > 0 && (
          <CollapsibleArc voiceDebate={voiceDebate} accentColor={accentColor} />
        )}
      </ScrollView>

      {/* ── CONTROLS PANEL — PINNED AT BOTTOM, ALWAYS VISIBLE ─────────────── */}
      <View style={[s.controlsPanel, { paddingBottom: bottomInset + 12 }]}>
        {/* Thin separator */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />

        {/* Progress bar */}
        <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
          <SegmentProgressBar
            voiceDebate={voiceDebate}
            progress={progressPercent}
            totalDurationMs={playerState.totalDurationMs}
            currentPositionMs={playerState.totalPositionMs}
            formatTime={formatTime}
            onSeek={handleSeek}
            currentSegmentType={playerState.currentSegmentType}
          />
        </View>

        {/* Transport controls */}
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            32,
          paddingHorizontal: 20,
          marginBottom:   12,
        }}>
          {/* Previous turn */}
          <TouchableOpacity
            onPress={skipPrevious}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="play-skip-back" size={26} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>

          {/* Play / Pause — main CTA */}
          <TouchableOpacity
            onPress={togglePlayPause}
            disabled={playerState.isLoading}
            style={{
              width:           68,
              height:          68,
              borderRadius:    34,
              backgroundColor: accentColor,
              alignItems:      'center',
              justifyContent:  'center',
              shadowColor:     accentColor,
              shadowOpacity:   0.7,
              shadowRadius:    18,
              elevation:       10,
              opacity:         playerState.isLoading ? 0.65 : 1,
            }}
          >
            {playerState.isLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons
                name={playerState.isPlaying ? 'pause' : 'play'}
                size={26}
                color="#FFF"
                style={{ marginLeft: playerState.isPlaying ? 0 : 3 }}
              />
            )}
          </TouchableOpacity>

          {/* Next turn */}
          <TouchableOpacity
            onPress={skipNext}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="play-skip-forward" size={26} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        {/* Rate selector */}
        <View style={{ paddingHorizontal: 20 }}>
          <RateSelector
            current={playerState.playbackRate}
            onSelect={setPlaybackRate}
            accentColor={accentColor}
          />
        </View>
      </View>

      {/* ── Transcript Sheet ───────────────────────────────────────────────── */}
      {showTranscript && (
        <DebateTranscriptSheet
          voiceDebate={voiceDebate}
          currentTurnIndex={playerState.currentTurnIndex}
          bottomInset={bottomInset}
          onClose={() => setShowTranscript(false)}
          onTurnPress={handleTurnJump}
        />
      )}

      {/* ── Share Sheet ────────────────────────────────────────────────────── */}
      {showShare && (
        <TouchableWithoutFeedback onPress={() => setShowShare(false)}>
          <View style={[StyleSheet.absoluteFillObject, {
            backgroundColor:  'rgba(0,0,0,0.6)',
            justifyContent:   'flex-end',
          }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                entering={FadeInDown.duration(320).springify()}
                style={{
                  backgroundColor:     '#111128',
                  borderTopLeftRadius: 26, borderTopRightRadius: 26,
                  padding:             24,
                  paddingBottom:       Math.max(bottomInset + 16, 40),
                  borderTopWidth:      1, borderTopColor: 'rgba(255,255,255,0.09)',
                }}
              >
                <View style={{
                  width: 38, height: 4, borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.13)',
                  alignSelf: 'center', marginBottom: 18,
                }} />
                <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>
                  Export Voice Debate
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 18 }} numberOfLines={1}>
                  {voiceDebate.topic}
                </Text>

                {([
                  {
                    id: 'pdf',
                    icon: 'document-text-outline',
                    label: 'Export PDF Transcript',
                    sub:   'Styled transcript with argument threading',
                    color: '#6C63FF',
                    onPress: handleSharePDF,
                  },
                  {
                    id: 'mp3',
                    icon: 'musical-notes-outline',
                    label: 'Export Audio (MP3)',
                    sub:   'Full debate as single audio file',
                    color: '#FF6584',
                    onPress: handleShareMP3,
                  },
                  {
                    id: 'copy',
                    icon: shareCopied ? 'checkmark-circle-outline' : 'copy-outline',
                    label: shareCopied ? 'Copied!' : 'Copy Transcript',
                    sub:   'Plain text to clipboard',
                    color: '#43E97B',
                    onPress: handleCopy,
                  },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={opt.onPress}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 13,
                      padding: 13, backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 13, marginBottom: 9,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
                    }}
                  >
                    <View style={{
                      width: 44, height: 44, borderRadius: 13,
                      backgroundColor: `${opt.color}18`,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {shareBusy === opt.id
                        ? <ActivityIndicator size="small" color={opt.color} />
                        : <Ionicons name={opt.icon as any} size={21} color={opt.color} />
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>{opt.label}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {!shareBusy && (
                      <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.25)" />
                    )}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  onPress={() => setShowShare(false)}
                  style={{ alignItems: 'center', paddingVertical: 13, marginTop: 2 }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 14, fontWeight: '600' }}>
                    Cancel
                  </Text>
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
    width:           42, height: 42, borderRadius:    13,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems:      'center', justifyContent: 'center',
    borderWidth:     1, borderColor: 'rgba(255,255,255,0.10)',
  },
  segmentBadge: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               5,
    marginHorizontal:  8,
    backgroundColor:   'rgba(0,0,0,0.32)',
    borderRadius:      18,
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.09)',
  },
  segmentText: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  // FIX 3: Controls panel is now a separate View OUTSIDE the ScrollView,
  // pinned to the bottom. It is NOT inside flex content, so it never
  // gets pushed off-screen by the Confidence Arc above it.
  controlsPanel: {
    backgroundColor: 'rgba(6, 6, 15, 0.92)',
    borderTopWidth:  1,
    borderTopColor:  'rgba(255,255,255,0.06)',
    paddingTop:      6,
    // Subtle top blur effect via a thin gradient overlay
    shadowColor:     '#000',
    shadowOpacity:   0.5,
    shadowRadius:    20,
    shadowOffset:    { width: 0, height: -4 },
    elevation:       20,
  },
});