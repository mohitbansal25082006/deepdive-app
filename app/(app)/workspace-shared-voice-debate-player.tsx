// app/(app)/workspace-shared-voice-debate-player.tsx
// Part 44 FINAL REDESIGN — 1:1 match with voice-debate-player.tsx
// Part 51 UPDATE (Feature 3): cross-device playback fix.
//
//   PROBLEM: When A shared a voice debate, B couldn't play it. The stored
//   audio_storage_urls are *public* URLs into the private `podcast-audio`
//   bucket, which stream unreliably for non-owners.
//
//   FIX: On load we call resolveVoiceDebatePlayableUrls() which mints fresh
//   SIGNED URLs (valid 6h) for every segment via createSignedUrls — these
//   stream reliably for any authenticated workspace member. The synthetic
//   VoiceDebate is built from the resolved URLs, and `hasAudio` now uses the
//   resolved set so the play button enables correctly for B.

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
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence, withSpring,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }       from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';


import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
}                                         from '../../src/constants/voiceDebate';
import { useVoiceDebatePlayer }           from '../../src/hooks/useVoiceDebatePlayer';
import { VoiceDebateEngine }              from '../../src/services/VoiceDebateAudioEngine';
import { WaveformVisualizer }             from '../../src/components/podcast/WaveformVisualizer';
import { DebateTranscriptSheet }          from '../../src/components/debate/DebateTranscriptSheet';
import { DebateConfidenceArc }            from '../../src/components/debate/DebateConfidenceArc';
import {
  exportVoiceDebateAsPDF,
  exportVoiceDebateAsMP3FromCloud,
  copyVoiceDebateTranscript,
}                                         from '../../src/services/voiceDebateExport';
import {
  getSharedVoiceDebateById,
  trackVoiceDebateView,
  trackVoiceDebateDownload,
}                                         from '../../src/services/voiceDebateSharingService';
// Part 51 — signed-URL resolver for cross-device playback
import {
  resolveVoiceDebatePlayableUrls,
  hasPlayableAudio,
}                                         from '../../src/lib/voiceDebatePlayback';
import type { SharedVoiceDebate }         from '../../src/types/voiceDebateSharing';
import type { VoiceDebate }               from '../../src/types/voiceDebate';
import type { DebateAgentRole }           from '../../src/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

type SegmentKey = keyof typeof SEGMENT_COLORS;

function asSegmentKey(value: unknown): SegmentKey {
  return (value ?? 'opening') as SegmentKey;
}

// ─── Build synthetic VoiceDebate from SharedVoiceDebate ───────────────────────
// Part 51: accepts the RESOLVED (signed) cloud URLs so playback works on any device.

function buildSyntheticVoiceDebate(
  svd: SharedVoiceDebate,
  resolvedUrls: string[],
): VoiceDebate {
  const cloudUrls = resolvedUrls.length > 0 ? resolvedUrls : (svd.audioStorageUrls ?? []);
  const patchedScript = {
    ...svd.script,
    turns: ((svd.script as any)?.turns ?? []).map((turn: any, i: number) => ({
      ...turn,
      audioPath: cloudUrls[i] ?? turn.audioPath ?? '',
    })),
  };
  return {
    id:                svd.voiceDebateId,
    userId:            svd.sharedBy,
    debateSessionId:   svd.debateSessionId,
    topic:             svd.topic,
    question:          svd.question,
    script:            patchedScript as any,
    status:            'completed',
    audioSegmentPaths: cloudUrls,
    audioStorageUrls:  cloudUrls,
    audioAllUploaded:  svd.audioAllUploaded,
    totalTurns:        svd.totalTurns,
    completedSegments: svd.totalTurns,
    durationSeconds:   svd.durationSeconds,
    wordCount:         svd.wordCount,
    exportCount:       svd.downloadCount,
    playCount:         svd.viewCount,
    createdAt:         svd.debateCreatedAt ?? svd.sharedAt,
    completedAt:       svd.debateCompletedAt,
    errorMessage:      undefined,
  };
}

// ─── Duration helper (identical to voice-debate-player.tsx) ───────────────────

function computeDisplayMinutes(vd: VoiceDebate): number {
  const turns   = (vd.script as any)?.turns ?? [];
  const totalMs = turns.reduce((s: number, t: any) => s + (t.durationMs ?? 0), 0);
  if (totalMs > 0)          return Math.max(1, Math.round(totalMs / 60000));
  if (vd.durationSeconds > 0) return Math.max(1, Math.round(vd.durationSeconds / 60));
  if (vd.wordCount > 0)     return Math.max(1, Math.round(vd.wordCount / 120));
  return 0;
}

// ─── Speaker helpers ──────────────────────────────────────────────────────────

function getSpeakerColor(speaker: string): string {
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'];
  return persona?.color ?? '#6C63FF';
}

function getSpeakerDisplayName(speaker: string): string {
  const persona = VOICE_PERSONAS[speaker as DebateAgentRole | 'moderator'];
  return persona?.displayName ?? 'Speaker';
}

// ─── Animated Orb — identical to voice-debate-player.tsx ─────────────────────

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

// ─── AgentAvatarStrip — identical to voice-debate-player.tsx ─────────────────

function AgentAvatarStrip({
  voiceDebate, activeSpeaker,
}: {
  voiceDebate:   VoiceDebate;
  activeSpeaker: string;
}) {
  const agentRoles = useMemo(() => {
    const seen  = new Set<string>();
    const roles: string[] = [];
    const turns = (voiceDebate.script as any)?.turns ?? [];
    for (const turn of turns) {
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

// ─── SegmentProgressBar — identical to voice-debate-player.tsx ────────────────

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

  const segments = (voiceDebate.script as any)?.segments ?? [];
  const turns    = (voiceDebate.script as any)?.turns ?? [];
  const totalDur = turns.reduce((s: number, t: any) => s + (t.durationMs ?? 0), 0) || totalDurationMs;

  const segKey   = asSegmentKey(currentSegmentType);
  const segColor = SEGMENT_COLORS[segKey] ?? COLORS.primary;

  return (
    <View style={{ width: '100%' }}>
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

        {barWidth > 0 && segments.map((seg: any) => {
          const segStartMs = turns
            .slice(0, seg.startTurnIdx)
            .reduce((s: number, t: any) => s + (t.durationMs ?? 0), 0);
          if (totalDur <= 0 || segStartMs <= 0) return null;
          const pct = Math.min(1, segStartMs / totalDur);
          const x   = pct * barWidth;
          if (x < 10 || x > barWidth - 10) return null;
          const sk     = asSegmentKey(seg.type);
          const sColor = SEGMENT_COLORS[sk] ?? COLORS.primary;
          return (
            <View key={seg.id ?? seg.type} style={{
              position: 'absolute', left: x - 1.5, top: -2,
              width: 3, height: 11, borderRadius: 1.5,
              backgroundColor: `${sColor}80`,
            }} />
          );
        })}
      </TouchableOpacity>

      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: 2, marginTop: -14, marginBottom: 4,
      }}>
        {segments.map((seg: any) => {
          const sk           = asSegmentKey(seg.type);
          const isCurrentSeg = seg.type === currentSegmentType;
          const sColor       = SEGMENT_COLORS[sk] ?? COLORS.primary;
          return (
            <View key={seg.id ?? seg.type} style={{ alignItems: 'center', gap: 1 }}>
              <Ionicons
                name={(SEGMENT_ICONS[sk] ?? 'mic-outline') as any}
                size={9}
                color={isCurrentSeg ? sColor : 'rgba(255,255,255,0.18)'}
              />
              <Text style={{
                color:     isCurrentSeg ? sColor : 'rgba(255,255,255,0.18)',
                fontSize:  6.5, fontWeight: isCurrentSeg ? '700' : '400',
              }}>
                {(SEGMENT_LABELS[sk] ?? '').split(' ')[0]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── RateSelector — identical to voice-debate-player.tsx ─────────────────────

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

// ─── CollapsibleArc — identical to voice-debate-player.tsx ───────────────────

function CollapsibleArc({ voiceDebate, accentColor }: {
  voiceDebate: VoiceDebate; accentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const turns = (voiceDebate.script as any)?.turns ?? [];
  if (turns.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <TouchableOpacity
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.8}
        style={{
          flexDirection:   'row', alignItems: 'center', justifyContent: 'center',
          gap:             6, paddingVertical: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius:    12, borderWidth: 1, borderColor: `${accentColor}20`,
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

export default function WorkspaceSharedVoiceDebatePlayerScreen() {
  const { workspaceId, sharedId, contentTitle } =
    useLocalSearchParams<{ workspaceId: string; sharedId: string; contentTitle?: string }>();

  const insets      = useSafeAreaInsets();
  const navigation  = useNavigation();
  const topInset    = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  // ── State ──────────────────────────────────────────────────────────────────
  const [svd,                setSvd]                = useState<SharedVoiceDebate | null>(null);
  const [voiceDebate,        setVoiceDebate]        = useState<VoiceDebate | null>(null);
  const [resolvedUrls,       setResolvedUrls]       = useState<string[]>([]);
  const [isLoading,          setIsLoading]          = useState(true);
  const [loadError,          setLoadError]          = useState<string | null>(null);
  const [showTranscript,     setShowTranscript]     = useState(false);
  const [showShare,          setShowShare]          = useState(false);
  const [shareBusy,          setShareBusy]          = useState<string | null>(null);
  const [shareCopied,        setShareCopied]        = useState(false);
  const [mp3Progress,        setMp3Progress]        = useState<{ done: number; total: number } | null>(null);

  const hasInitialisedRef = useRef(false);

  // ── Load shared voice debate + resolve signed playable URLs ───────────────
  useEffect(() => {
    if (!workspaceId || !sharedId) {
      setLoadError('Missing workspace or shared debate ID.');
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await getSharedVoiceDebateById(workspaceId, sharedId);
        if (error) throw new Error(error);
        if (!data)  throw new Error('Voice debate not found or not shared to this workspace.');
        setSvd(data);

        // Part 51 — resolve fresh signed URLs so playback works on any device
        const playable = await resolveVoiceDebatePlayableUrls({
          storedUrls:    data.audioStorageUrls,
          voiceDebateId: data.voiceDebateId,
          totalTurns:    data.totalTurns,
        });
        setResolvedUrls(playable);
        setVoiceDebate(buildSyntheticVoiceDebate(data, playable));

        trackVoiceDebateView(sharedId);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load voice debate.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [workspaceId, sharedId]);

  // ── Voice debate player hook ───────────────────────────────────────────────
  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipToTurn,
    skipNext, skipPrevious, setPlaybackRate,
    seekToPercent, skipToSegment, detachScreen,
    stopPlayback, formatTime,
  } = useVoiceDebatePlayer(voiceDebate);

  // Part 51 — hasAudio now considers the RESOLVED urls (any segment signed = playable)
  const hasAudio =
    hasPlayableAudio(svd?.audioAllUploaded, svd?.audioStorageUrls) ||
    resolvedUrls.filter(Boolean).length > 0;

  useEffect(() => {
    if (!voiceDebate || isLoading || hasInitialisedRef.current) return;
    hasInitialisedRef.current = true;
    const isAlreadyPlaying = VoiceDebateEngine.isActiveFor(voiceDebate.id);
    if (!isAlreadyPlaying && hasAudio) {
      startPlayback(0);
    }
  }, [voiceDebate, isLoading, hasAudio]);

  // ── Detach on back navigation (MiniPlayer keeps audio alive) ──────────────
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (_e: any) => {
      detachScreen();
    });
    return unsub;
  }, [navigation, detachScreen]);

  const handleSeek     = useCallback((p: number) => { seekToPercent(p); }, [seekToPercent]);
  const handleTurnJump = useCallback((i: number) => { skipToTurn(i); },   [skipToTurn]);

  // ── Speaker-derived colours ────────────────────────────────────────────────
  const activeSpeaker = (currentTurn as any)?.speaker ?? 'moderator';
  const accentColor   = getSpeakerColor(activeSpeaker);
  const bgColors: [string, string, string] = ['#06060F', `${accentColor}14`, '#06060F'];

  const displayMinutes = voiceDebate ? computeDisplayMinutes(voiceDebate) : 0;
  const turns          = (voiceDebate?.script as any)?.turns ?? [];

  // ── Export: PDF ───────────────────────────────────────────────────────────
  const handleSharePDF = async () => {
    if (!voiceDebate || shareBusy) return;
    setShareBusy('pdf');
    try {
      await exportVoiceDebateAsPDF(voiceDebate);
      trackVoiceDebateDownload(sharedId);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.');
    } finally {
      setShareBusy(null);
    }
  };

  // ── Export: MP3 ───────────────────────────────────────────────────────────
  const handleShareMP3 = async () => {
    if (!voiceDebate || !svd || shareBusy) return;

    // Part 51 — prefer resolved signed URLs (work for non-owners)
    const cloudUrls = (resolvedUrls.length > 0 ? resolvedUrls : (svd.audioStorageUrls ?? []))
      .filter((u): u is string => typeof u === 'string' && u.startsWith('https://'));

    if (cloudUrls.length === 0) {
      Alert.alert('No Audio', 'No cloud audio is available yet. Try again once the upload completes.');
      return;
    }

    setShareBusy('mp3');
    setMp3Progress({ done: 0, total: cloudUrls.length });

    try {
      await exportVoiceDebateAsMP3FromCloud(
        voiceDebate,
        cloudUrls,
        (downloaded, total) => setMp3Progress({ done: downloaded, total }),
      );
      trackVoiceDebateDownload(sharedId);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export audio.');
    } finally {
      setShareBusy(null);
      setMp3Progress(null);
    }
  };

  // ── Export: Copy ──────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!voiceDebate || shareBusy) return;
    setShareBusy('copy');
    try {
      await copyVoiceDebateTranscript(voiceDebate);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
    } finally {
      setShareBusy(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>
          Loading voice debate…
        </Text>
      </View>
    );
  }

  if (loadError || !voiceDebate || !svd) {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  const headerSegKey = asSegmentKey(playerState.currentSegmentType);

  return (
    <View style={{ flex: 1, backgroundColor: '#06060F' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <LinearGradient
        colors={bgColors}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.20} size={160} color={accentColor} duration={3400} />
      <Orb x={SCREEN_W * 0.82} y={SCREEN_H * 0.35} size={130} color={accentColor} duration={4200} />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topInset }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        <View style={s.headerCentre}>
          <View style={s.viewOnlyBadge}>
            <Ionicons name="eye-outline" size={9} color="rgba(255,255,255,0.55)" />
            <Text style={s.viewOnlyTxt}>View only</Text>
          </View>
          {svd.sharerName ? (
            <Text style={s.sharerTxt} numberOfLines={1}>
              Shared by {svd.sharerName}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setShowTranscript(true)}
            style={[s.headerBtn, showTranscript && { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}45` }]}
          >
            <Ionicons name="menu-outline" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowShare(true)} style={s.headerBtn}>
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SCROLLABLE CONTENT ──────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{
          color: 'rgba(255,255,255,0.32)', fontSize: 11, textAlign: 'center',
          marginBottom: 16, fontWeight: '500', paddingHorizontal: 16,
        }} numberOfLines={2}>
          {voiceDebate.topic}
        </Text>

        <AgentAvatarStrip voiceDebate={voiceDebate} activeSpeaker={activeSpeaker} />

        {!hasAudio ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: 'rgba(255,200,60,0.10)', borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 9,
            marginTop: 18, marginBottom: 6,
            borderWidth: 1, borderColor: 'rgba(255,200,60,0.22)',
          }}>
            <Ionicons name="alert-circle-outline" size={14} color="#FFC83C" />
            <Text style={{ color: '#FFC83C', fontSize: 12, fontWeight: '600', flex: 1 }}>
              Audio still uploading to cloud — transcript available below
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 18, marginBottom: 6, alignItems: 'center' }}>
            <WaveformVisualizer
              isPlaying={playerState.isPlaying}
              color={accentColor}
              barWidth={5}
              barGap={4}
              maxHeight={44}
            />
          </View>
        )}

        {hasAudio && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 4 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
              paddingHorizontal: 10, paddingVertical: 3,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
            }}>
              <Ionicons name="cloud-outline" size={10} color="rgba(255,255,255,0.38)" />
              <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, fontWeight: '600' }}>
                Streaming from cloud
              </Text>
            </View>
          </View>
        )}

        <Text style={{
          color: 'rgba(255,255,255,0.36)', fontSize: 11, fontWeight: '600',
          textAlign: 'center', marginBottom: 12,
        }}>
          Turn {playerState.currentTurnIndex + 1} / {turns.length}
          {displayMinutes > 0 ? ` · ~${displayMinutes} min` : ''}
        </Text>

        {currentTurn && (
          <Animated.View
            key={playerState.currentTurnIndex}
            entering={FadeIn.duration(280)}
            style={{
              backgroundColor: 'rgba(0,0,0,0.30)',
              borderRadius:    14, padding: 14, marginBottom: 14,
              borderWidth:     1,  borderColor: `${accentColor}20`,
              borderLeftWidth: 3,  borderLeftColor: accentColor,
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
              {(currentTurn as any).confidence ? ` · ${(currentTurn as any).confidence}/10` : ''}
            </Text>
            <Text style={{
              color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19, fontWeight: '400',
            }}>
              {(currentTurn as any).text}
            </Text>
          </Animated.View>
        )}

        {turns.length > 0 && (
          <CollapsibleArc voiceDebate={voiceDebate} accentColor={accentColor} />
        )}
      </ScrollView>

      {/* ── CONTROLS PANEL — PINNED AT BOTTOM ───────────────────────────── */}
      <View style={[s.controlsPanel, { paddingBottom: bottomInset + 12 }]}>
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />

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

        <View style={{
          flexDirection: 'row', alignItems: 'center',
          justifyContent: 'center', gap: 32,
          paddingHorizontal: 20, marginBottom: 12,
        }}>
          <TouchableOpacity
            onPress={skipPrevious}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="play-skip-back" size={26} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlayPause}
            disabled={playerState.isLoading || !hasAudio}
            style={{
              width:           68, height: 68, borderRadius: 34,
              backgroundColor: hasAudio ? accentColor : 'rgba(255,255,255,0.12)',
              alignItems:      'center', justifyContent: 'center',
              shadowColor:     hasAudio ? accentColor : 'transparent',
              shadowOpacity:   hasAudio ? 0.7 : 0,
              shadowRadius:    18, elevation: hasAudio ? 10 : 0,
              opacity:         (playerState.isLoading || !hasAudio) ? 0.55 : 1,
            }}
          >
            {playerState.isLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons
                name={playerState.isPlaying ? 'pause' : 'play'}
                size={26}
                color={hasAudio ? '#FFF' : 'rgba(255,255,255,0.35)'}
                style={{ marginLeft: playerState.isPlaying ? 0 : 3 }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={skipNext}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="play-skip-forward" size={26} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <RateSelector
            current={playerState.playbackRate}
            onSelect={setPlaybackRate}
            accentColor={accentColor}
          />
        </View>
      </View>

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
          <View style={[StyleSheet.absoluteFillObject, {
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent:  'flex-end',
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
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 4 }} numberOfLines={1}>
                  {voiceDebate.topic}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, marginBottom: 18 }}>
                  Shared by {svd.sharerName ?? 'team member'} · View only
                </Text>

                {([
                  {
                    id:      'pdf',
                    icon:    'document-text-outline',
                    label:   'Export PDF Transcript',
                    sub:     'Styled transcript with argument threading',
                    color:   '#6C63FF',
                    onPress: handleSharePDF,
                  },
                  {
                    id:      'mp3',
                    icon:    'musical-notes-outline',
                    label:   shareBusy === 'mp3' && mp3Progress
                               ? `Downloading… ${mp3Progress.done}/${mp3Progress.total}`
                               : 'Export Audio (MP3)',
                    sub:     hasAudio
                               ? shareBusy === 'mp3' && mp3Progress
                                 ? `Segment ${mp3Progress.done} of ${mp3Progress.total} — please wait`
                                 : 'Download & share full debate as single audio file'
                               : 'Audio still uploading to cloud…',
                    color:   '#FF6584',
                    onPress: handleShareMP3,
                    disabled: !hasAudio,
                  },
                  {
                    id:      'copy',
                    icon:    shareCopied ? 'checkmark-circle-outline' : 'copy-outline',
                    label:   shareCopied ? 'Copied!' : 'Copy Transcript',
                    sub:     'Plain text to clipboard',
                    color:   '#43E97B',
                    onPress: handleCopy,
                  },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={(opt as any).disabled ? undefined : opt.onPress}
                    activeOpacity={(opt as any).disabled ? 1 : 0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 13,
                      padding: 13,
                      backgroundColor: (opt as any).disabled
                        ? 'rgba(255,255,255,0.025)'
                        : 'rgba(255,255,255,0.05)',
                      borderRadius: 13, marginBottom: 9,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
                      opacity: (opt as any).disabled ? 0.45 : 1,
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
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>
                        {opt.label}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 }}>
                        {opt.sub}
                      </Text>
                    </View>
                    {!shareBusy && !(opt as any).disabled && (
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
    width:           42,
    height:          42,
    borderRadius:    13,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.10)',
  },
  headerCentre: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    marginHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius:    18,
    paddingVertical:  6,
    paddingHorizontal: 12,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.09)',
    gap:             3,
  },
  viewOnlyBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            3,
  },
  viewOnlyTxt: {
    color:     'rgba(255,255,255,0.55)',
    fontSize:  9,
    fontWeight:'700',
    letterSpacing: 0.4,
  },
  sharerTxt: {
    color:     'rgba(255,255,255,0.38)',
    fontSize:  10,
    fontWeight:'500',
  },
  controlsPanel: {
    backgroundColor: 'rgba(6, 6, 15, 0.92)',
    borderTopWidth:  1,
    borderTopColor:  'rgba(255,255,255,0.06)',
    paddingTop:      6,
    shadowColor:     '#000',
    shadowOpacity:   0.5,
    shadowRadius:    20,
    shadowOffset:    { width: 0, height: -4 },
    elevation:       20,
  },
});