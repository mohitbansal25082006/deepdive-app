// src/components/offline/OfflineVoiceDebateViewer.tsx
// Part 45 FIX — BUG 3: LoadBundleFromServerRequestError fixed.
//
// ROOT CAUSE:
//   The audio check useEffect used dynamic `await import(...)` calls:
//     await import('../../services/voiceDebateTTSService')
//     await import('../../lib/voiceDebateAudioCache')   (already static, kept)
//   In Hermes (the JS engine used in production/offline Expo builds),
//   dynamic imports that reference modules not pre-registered in the bundle
//   throw LoadBundleFromServerRequestError: Could not load bundle.
//   The device is offline so Metro can't serve the missing bundle — crash.
//
// FIX:
//   Replace ALL dynamic `import()` calls with static imports at the top of
//   the file. `audioFileExists` from voiceDebateTTSService is now imported
//   statically. The async IIFE in the useEffect becomes pure logic with no
//   dynamic imports.
//
// All other UI/logic is identical to the Part 45C version.

import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { LinearGradient }         from 'expo-linear-gradient';
import { Ionicons }               from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence, withSpring,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }      from 'react-native-safe-area-context';
import * as Clipboard             from 'expo-clipboard';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
}                                         from '../../constants/voiceDebate';
import { useVoiceDebatePlayer }           from '../../hooks/useVoiceDebatePlayer';
import { VoiceDebateEngine }              from '../../services/VoiceDebateAudioEngine';
import {
  exportVoiceDebateAsPDF,
  exportVoiceDebateAsMP3,
}                                         from '../../services/voiceDebateExport';
// BUG 3 FIX: static import (was dynamic `await import(...)` inside useEffect)
import { audioFileExists }               from '../../services/voiceDebateTTSService';
import { WaveformVisualizer }             from '../podcast/WaveformVisualizer';
import { DebateTranscriptSheet }          from '../debate/DebateTranscriptSheet';
import { DebateConfidenceArc }            from '../debate/DebateConfidenceArc';
import { getLocalVoiceDebateAudioPaths }  from '../../lib/voiceDebateAudioCache';
import { formatBytes }                    from '../../lib/cacheStorage';
import type { VoiceDebate, DebateSegmentType } from '../../types/voiceDebate';
import type { CacheEntry }                from '../../types/cache';
import type { DebateAgentRole }           from '../../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

type SegmentKey = keyof typeof SEGMENT_COLORS;

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

function computeDisplayMinutes(vd: VoiceDebate): number {
  const turns   = vd.script?.turns ?? [];
  const totalMs = turns.reduce((s, t) => s + (t.durationMs ?? 0), 0);
  if (totalMs > 0)            return Math.max(1, Math.round(totalMs / 60000));
  if (vd.durationSeconds > 0) return Math.max(1, Math.round(vd.durationSeconds / 60));
  if (vd.wordCount > 0)       return Math.max(1, Math.round(vd.wordCount / 120));
  return 0;
}

// ─── Animated orb ─────────────────────────────────────────────────────────────

function Orb({ x, y, size, color, duration }: {
  x: number; y: number; size: number; color: string; duration: number;
}) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0.07);
  useEffect(() => {
    ty.value = withRepeat(withSequence(
      withTiming(-10, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(10,  { duration, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    op.value = withRepeat(withSequence(
      withTiming(0.15, { duration: duration * 0.6 }),
      withTiming(0.04, { duration: duration * 0.6 }),
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

// ─── Agent avatar strip ────────────────────────────────────────────────────────

function AgentAvatarStrip({ voiceDebate, activeSpeaker }: {
  voiceDebate: VoiceDebate; activeSpeaker: string;
}) {
  const agentRoles = useMemo(() => {
    const seen = new Set<string>();
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
        const scale    = useSharedValue(isActive ? 1.12 : 1.0);

        useEffect(() => {
          scale.value = withSpring(isActive ? 1.12 : 1.0, { damping: 12, stiffness: 180 });
        }, [isActive]);

        const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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

// ─── Segment progress bar ──────────────────────────────────────────────────────

function SegmentProgressBar({
  voiceDebate, progress, totalDurationMs, currentPositionMs,
  formatTime, onSeek, currentSegmentType,
}: {
  voiceDebate: VoiceDebate; progress: number;
  totalDurationMs: number; currentPositionMs: number;
  formatTime: (ms: number) => string;
  onSeek: (p: number) => void; currentSegmentType: string;
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
        style={{ height: 7, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 4, overflow: 'visible', marginBottom: 20 }}
      >
        <Animated.View style={[fillStyle, { height: '100%', backgroundColor: segColor, borderRadius: 4 }]} />
        <Animated.View style={[thumbStyle, {
          position: 'absolute', top: -4.5, width: 16, height: 16, borderRadius: 8,
          backgroundColor: '#FFF', shadowColor: segColor, shadowOpacity: 0.9,
          shadowRadius: 6, elevation: 5,
        }]} />
        {barWidth > 0 && segments.map(seg => {
          const segStartMs = turns.slice(0, seg.startTurnIdx).reduce((s, t) => s + (t.durationMs ?? 0), 0);
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

// ─── Rate selector ────────────────────────────────────────────────────────────

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
              color:     active ? accentColor : 'rgba(255,255,255,0.4)',
              fontSize:  11, fontWeight: active ? '800' : '400',
            }}>
              {r}×
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Collapsible confidence arc ────────────────────────────────────────────────

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
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 6, paddingVertical: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: 12, borderWidth: 1, borderColor: `${accentColor}20`,
        }}
      >
        <Ionicons name="analytics-outline" size={13} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>Confidence Arc</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={`${accentColor}80`} />
      </TouchableOpacity>
      {expanded && (
        <Animated.View entering={FadeIn.duration(250)}>
          <DebateConfidenceArc turns={turns} />
        </Animated.View>
      )}
    </View>
  );
}

// ─── No-audio notice ──────────────────────────────────────────────────────────

function NoAudioNotice() {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: `${COLORS.warning}10`,
      borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
      borderWidth: 1, borderColor: `${COLORS.warning}25`,
    }}>
      <Ionicons name="headset-outline" size={16} color={COLORS.warning} style={{ marginTop: 1, flexShrink: 0 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 }}>
          Audio not available offline
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
          Audio segments were not cached for this voice debate.
          Go online and open the Voice Debate player, or enable "Cache Voice Debate Audio" in Cache Manager Settings to download audio for offline use.
        </Text>
      </View>
    </View>
  );
}

// ─── Transcript-only view ─────────────────────────────────────────────────────

function TranscriptOnlyView({ voiceDebate }: { voiceDebate: VoiceDebate }) {
  const turns = voiceDebate.script?.turns ?? [];
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <NoAudioNotice />
      <Text style={{
        color: 'rgba(255,255,255,0.32)', fontSize: 11, textAlign: 'center',
        marginBottom: 16, fontWeight: '500',
      }} numberOfLines={2}>
        {voiceDebate.topic}
      </Text>

      {turns.map((turn, i) => {
        const persona  = VOICE_PERSONAS[turn.speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
        const segKey   = asSegmentKey(turn.segmentType);
        const segColor = SEGMENT_COLORS[segKey] ?? COLORS.primary;
        return (
          <View key={turn.id ?? i} style={{
            backgroundColor: 'rgba(0,0,0,0.25)',
            borderRadius: 14, padding: 14, marginBottom: 10,
            borderWidth: 1, borderColor: `${persona.color}18`,
            borderLeftWidth: 3, borderLeftColor: persona.color,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 7,
                backgroundColor: `${persona.color}25`,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: `${persona.color}40`,
              }}>
                <Ionicons name={persona.icon as any} size={11} color={persona.color} />
              </View>
              <Text style={{ color: persona.color, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, flex: 1 }}>
                {getSpeakerDisplayName(turn.speaker).toUpperCase()}
                {turn.confidence ? ` · ${turn.confidence}/10` : ''}
              </Text>
              <View style={{
                backgroundColor: `${segColor}15`, borderRadius: RADIUS.full,
                paddingHorizontal: 6, paddingVertical: 2,
                borderWidth: 1, borderColor: `${segColor}30`,
              }}>
                <Text style={{ color: segColor, fontSize: 8, fontWeight: '700' }}>
                  {SEGMENT_LABELS[segKey]?.split(' ')[0] ?? ''}
                </Text>
              </View>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19 }}>
              {turn.text}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Share sheet ──────────────────────────────────────────────────────────────

function ShareSheet({ voiceDebate, hasAudio, accentColor, bottomInset, onClose }: {
  voiceDebate: VoiceDebate; hasAudio: boolean; accentColor: string;
  bottomInset: number; onClose: () => void;
}) {
  const [busy,   setBusy]   = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePDF = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      await exportVoiceDebateAsPDF(voiceDebate);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.');
    } finally {
      setBusy(null);
    }
  };

  const handleMP3 = async () => {
    if (busy) return;
    setBusy('mp3');
    try {
      await exportVoiceDebateAsMP3(voiceDebate);
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export audio.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (busy) return;
    setBusy('copy');
    try {
      const turns = voiceDebate.script?.turns ?? [];
      const lines = turns.map(t =>
        `${getSpeakerDisplayName(t.speaker).toUpperCase()}:\n${t.text}`
      ).join('\n\n');
      await Clipboard.setStringAsync(`${voiceDebate.topic}\n\n${lines}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
    } finally {
      setBusy(null);
    }
  };

  const opts = [
    {
      id:      'pdf',
      icon:    'document-text-outline',
      color:   '#6C63FF',
      label:   'Export PDF Transcript',
      sub:     'Styled transcript with speaker attribution',
      onPress: handlePDF,
      show:    true,
    },
    {
      id:      'mp3',
      icon:    'musical-notes-outline',
      color:   '#FF6584',
      label:   'Export Audio (MP3)',
      sub:     'Full debate as single audio file',
      onPress: handleMP3,
      // Only show if audio is available locally — no network needed
      show:    hasAudio,
    },
    {
      id:      copied ? 'check' : 'copy',
      icon:    copied ? 'checkmark-circle-outline' : 'copy-outline',
      color:   '#43E97B',
      label:   copied ? 'Copied!' : 'Copy Transcript',
      sub:     'Full plain-text to clipboard',
      onPress: handleCopy,
      show:    true,
    },
  ] as const;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={[StyleSheet.absoluteFillObject, {
        backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end',
      }]}>
        <TouchableWithoutFeedback>
          <Animated.View
            entering={FadeInDown.duration(280).springify()}
            style={{
              backgroundColor: '#111128',
              borderTopLeftRadius: 26, borderTopRightRadius: 26,
              padding: 24,
              paddingBottom: Math.max(bottomInset + 16, 40),
              borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)',
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 }}>
              <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.info}40` }}>
                <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '800' }}>OFFLINE</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }} numberOfLines={1}>
                {voiceDebate.topic}
              </Text>
            </View>

            {opts.filter(o => o.show).map(opt => (
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
                  {busy === opt.id
                    ? <ActivityIndicator size="small" color={opt.color} />
                    : <Ionicons name={opt.icon as any} size={21} color={opt.color} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>{opt.label}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 }}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={onClose}
              style={{ alignItems: 'center', paddingVertical: 13, marginTop: 2 }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflineVoiceDebateViewerProps {
  voiceDebate: VoiceDebate;
  entry:       CacheEntry;
  onClose:     () => void;
  onExport:    () => void;
  exporting:   boolean;
}

export function OfflineVoiceDebateViewer({
  voiceDebate, entry, onClose, onExport, exporting,
}: OfflineVoiceDebateViewerProps) {
  const insets      = useSafeAreaInsets();
  const topInset    = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [hasAudio,       setHasAudio]       = useState(false);
  const [audioChecked,   setAudioChecked]   = useState(false);
  const [patchedDebate,  setPatchedDebate]  = useState<VoiceDebate>(voiceDebate);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showShare,      setShowShare]      = useState(false);
  const hasStartedRef = useRef(false);

  // ── Check for local audio ─────────────────────────────────────────────────
  // BUG 3 FIX: No dynamic imports — audioFileExists and getLocalVoiceDebateAudioPaths
  // are both statically imported at the top of the file.

  useEffect(() => {
    let cancelled = false;

    const checkAudio = async () => {
      const localPaths = voiceDebate.audioSegmentPaths ?? [];
      let audioAvailable = false;

      // Tier 1: Check original generation paths (local file:// paths)
      if (localPaths.length > 0 && localPaths[0] && !localPaths[0].startsWith('http')) {
        try {
          const firstExists = await audioFileExists(localPaths[0]);
          if (firstExists) {
            audioAvailable = true;
            if (!cancelled) setPatchedDebate(voiceDebate);
          }
        } catch {
          // audioFileExists can throw if FileSystem isn't ready — treat as not found
        }
      }

      // Tier 2: Check local audio cache (downloaded copy)
      if (!audioAvailable) {
        try {
          const cachedPaths = await getLocalVoiceDebateAudioPaths(voiceDebate.id);
          if (cachedPaths && cachedPaths.length > 0) {
            const patched: VoiceDebate = {
              ...voiceDebate,
              audioSegmentPaths: cachedPaths,
            };
            audioAvailable = true;
            if (!cancelled) setPatchedDebate(patched);
          }
        } catch {
          // getLocalVoiceDebateAudioPaths can throw — treat as not cached
        }
      }

      if (!cancelled) {
        setHasAudio(audioAvailable);
        setAudioChecked(true);
      }
    };

    checkAudio();
    return () => { cancelled = true; };
  }, [voiceDebate.id]);

  // ── Player hook ───────────────────────────────────────────────────────────

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipToTurn,
    skipNext, skipPrevious, setPlaybackRate,
    seekToPercent, formatTime,
  } = useVoiceDebatePlayer(hasAudio ? patchedDebate : null);

  // Start playback once audio confirmed available
  useEffect(() => {
    if (!hasAudio || !audioChecked || hasStartedRef.current) return;
    if (!VoiceDebateEngine.isActiveFor(patchedDebate.id)) {
      hasStartedRef.current = true;
      startPlayback(0);
    }
  }, [hasAudio, audioChecked, patchedDebate.id]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeSpeaker  = currentTurn?.speaker ?? 'moderator';
  const accentColor    = getSpeakerColor(activeSpeaker);
  const bgColors: [string, string, string] = ['#06060F', `${accentColor}14`, '#06060F'];
  const turns          = patchedDebate.script?.turns ?? [];
  const displayMinutes = computeDisplayMinutes(patchedDebate);

  const handleSeek     = useCallback((p: number) => seekToPercent(p), [seekToPercent]);
  const handleTurnJump = useCallback((i: number) => skipToTurn(i), [skipToTurn]);

  const headerSegKey = asSegmentKey(playerState.currentSegmentType);

  // ── Loading while checking audio ──────────────────────────────────────────

  if (!audioChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>
          Checking cached audio…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#06060F' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <LinearGradient
        colors={bgColors}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.22} size={150} color={accentColor} duration={3200} />
      <Orb x={SCREEN_W * 0.82} y={SCREEN_H * 0.36} size={120} color={accentColor} duration={4000} />

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topInset }]}>
        <TouchableOpacity onPress={onClose} style={s.headerBtn}>
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        <View style={s.centreBadge}>
          <View style={{
            backgroundColor: `${COLORS.info}20`, borderRadius: 14,
            paddingHorizontal: 10, paddingVertical: 4,
            borderWidth: 1, borderColor: `${COLORS.info}40`,
            flexDirection: 'row', alignItems: 'center', gap: 5,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.info }} />
            <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
              OFFLINE
            </Text>
          </View>

          {hasAudio && (
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.32)', borderRadius: 16,
              paddingVertical: 4, paddingHorizontal: 10,
              flexDirection: 'row', alignItems: 'center', gap: 4,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
            }}>
              <Ionicons
                name={(SEGMENT_ICONS[headerSegKey] ?? 'mic-outline') as any}
                size={10}
                color={SEGMENT_COLORS[headerSegKey] ?? COLORS.primary}
              />
              <Text style={[s.segmentText, { color: SEGMENT_COLORS[headerSegKey] ?? COLORS.primary }]}>
                {SEGMENT_LABELS[headerSegKey] ?? 'Debate'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {hasAudio && (
            <TouchableOpacity onPress={() => setShowTranscript(true)} style={s.headerBtn}>
              <Ionicons name="menu-outline" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowShare(true)} style={s.headerBtn}>
            <Ionicons name="share-outline" size={19} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── NO AUDIO: transcript only ──────────────────────────────────────── */}
      {!hasAudio && <TranscriptOnlyView voiceDebate={patchedDebate} />}

      {/* ── HAS AUDIO: cinematic player ────────────────────────────────────── */}
      {hasAudio && (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{
              color: 'rgba(255,255,255,0.32)', fontSize: 11, textAlign: 'center',
              marginBottom: 16, fontWeight: '500', paddingHorizontal: 16,
            }} numberOfLines={2}>
              {patchedDebate.topic}
            </Text>

            <AgentAvatarStrip voiceDebate={patchedDebate} activeSpeaker={activeSpeaker} />

            <View style={{ marginTop: 18, marginBottom: 6, alignItems: 'center' }}>
              <WaveformVisualizer
                isPlaying={playerState.isPlaying}
                color={accentColor}
                barWidth={5} barGap={4} maxHeight={44}
              />
            </View>

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
                  borderRadius: 14, padding: 14, marginBottom: 14,
                  borderWidth: 1, borderColor: `${accentColor}20`,
                  borderLeftWidth: 3, borderLeftColor: accentColor,
                }}
              >
                <Text style={{
                  color: accentColor, fontSize: 11, fontWeight: '800',
                  letterSpacing: 0.7, marginBottom: 5,
                }}>
                  {getSpeakerDisplayName(activeSpeaker).toUpperCase()}
                  {currentTurn.confidence ? ` · ${currentTurn.confidence}/10` : ''}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19 }}>
                  {currentTurn.text}
                </Text>
              </Animated.View>
            )}

            {turns.length > 0 && (
              <CollapsibleArc voiceDebate={patchedDebate} accentColor={accentColor} />
            )}
          </ScrollView>

          {/* Controls pinned at bottom */}
          <View style={[s.controlsPanel, { paddingBottom: bottomInset + 12 }]}>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />

            <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
              <SegmentProgressBar
                voiceDebate={patchedDebate}
                progress={progressPercent}
                totalDurationMs={playerState.totalDurationMs}
                currentPositionMs={playerState.totalPositionMs}
                formatTime={formatTime}
                onSeek={handleSeek}
                currentSegmentType={playerState.currentSegmentType}
              />
            </View>

            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 32, paddingHorizontal: 20, marginBottom: 12,
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
                disabled={playerState.isLoading}
                style={{
                  width: 68, height: 68, borderRadius: 34,
                  backgroundColor: accentColor,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: accentColor, shadowOpacity: 0.7,
                  shadowRadius: 18, elevation: 10,
                  opacity: playerState.isLoading ? 0.65 : 1,
                }}
              >
                {playerState.isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons
                    name={playerState.isPlaying ? 'pause' : 'play'}
                    size={26} color="#FFF"
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

          {showTranscript && (
            <DebateTranscriptSheet
              voiceDebate={patchedDebate}
              currentTurnIndex={playerState.currentTurnIndex}
              bottomInset={bottomInset}
              onClose={() => setShowTranscript(false)}
              onTurnPress={handleTurnJump}
            />
          )}
        </>
      )}

      {showShare && (
        <ShareSheet
          voiceDebate={patchedDebate}
          hasAudio={hasAudio}
          accentColor={accentColor}
          bottomInset={bottomInset}
          onClose={() => setShowShare(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    zIndex: 20, gap: 8,
  },
  headerBtn: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', flexShrink: 0,
  },
  centreBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, flexWrap: 'wrap',
  },
  segmentText: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
  },
  controlsPanel: {
    backgroundColor: 'rgba(6, 6, 15, 0.92)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 6,
    shadowColor: '#000', shadowOpacity: 0.5,
    shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
});