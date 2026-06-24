// app/(app)/podcast-video-player.tsx
// Part 41 UPDATE — Support loading podcast for workspace members.
// Part 55.4 UPDATE — Full dynamic theme integration across ALL sections:
//   • TranscriptSheet, ShareEpisodeSheet, all overlays, orbs, progress bar,
//     rate selector, controls — every hardcoded hex replaced with blended
//     COLORS tokens + useTheme() version subscription.
//
// COLOR STRATEGY:
//   The video player lives on a near-black cinematic canvas that must survive
//   every theme. We keep the deep dark *background* (derived from
//   COLORS.background darkened further) so the video-player aesthetic is
//   preserved, but all UI chrome (sheets, badges, chips, buttons, dividers)
//   adopts the live theme palette via the same blend() helper used in
//   DebateTranscriptSheet. Speaker accent colors (host/guest/guest2) stay
//   anchored to the active theme's primary/secondary/accent so the pulse
//   glow and waveform always feel on-brand.
//
//   Light-theme note: We keep the video area dark even on light themes
//   (it's a cinematic player — white makes no sense). Only the bottom sheets
//   (TranscriptSheet, ShareEpisodeSheet) flip to theme-aware surfaces.

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
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
  withTiming, withRepeat, withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }   from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase }            from '../../src/lib/supabase';
import { mapRowToPodcast }     from '../../src/services/podcastOrchestrator';
import {
  exportPodcastAsMP3,
  exportPodcastAsPDF,
  copyPodcastScriptToClipboard,
} from '../../src/services/podcastExport';
import {
  usePodcastPlayer,
  isGlobalAudioActiveForPodcast,
  registerProgressSaveCallback,
} from '../../src/hooks/usePodcastPlayer';
import { AudioEngine }         from '../../src/services/GlobalAudioEngine';
import { CinematicWaveform }   from '../../src/components/podcast/CinematicWaveform';
import { VideoSubtitle }       from '../../src/components/podcast/VideoSubtitle';
import { VideoSpeakerAvatars } from '../../src/components/podcast/VideoSpeakerAvatars';
import { EpisodeThumbnail }    from '../../src/components/podcast/EpisodeThumbnail';
import { savePlaybackProgress } from '../../src/services/podcastSeriesService';
import { useAuth }             from '../../src/context/AuthContext';
import { useTheme }            from '../../src/context/ThemeContext';
import { COLORS }              from '../../src/constants/theme';
import type { Podcast, PodcastTurn } from '../../src/types';
import type { ChapterMarker }  from '../../src/types/podcast_v2';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS     = [0.75, 1.0, 1.25, 1.5, 2.0];
const CONTROLS_HIDE_MS = 4000;

// ─── Color blending utilities ─────────────────────────────────────────────────

/** Parse 3- or 6-char hex → {r,g,b} 0–255 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean.padEnd(6, '0');
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

/**
 * Alpha-composite `color` over `surface` at opacity `alpha` (0–1).
 * Returns a fully opaque hex — no semi-transparent RGBA artifacts on any theme.
 */
function blend(color: string, surface: string, alpha: number): string {
  const c = hexToRgb(color);
  const s = hexToRgb(surface);
  const r = Math.round(s.r + (c.r - s.r) * alpha);
  const g = Math.round(s.g + (c.g - s.g) * alpha);
  const b = Math.round(s.b + (c.b - s.b) * alpha);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Build an rgba string from a hex + alpha — used only for the cinematic
 * backdrop/gradient that intentionally stays dark regardless of theme.
 */
function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Derive a darkened cinematic base from COLORS.background, so even light
 * themes get a deep video canvas while still picking up brand hue.
 */
function cinematicBase(): string {
  const { r, g, b } = hexToRgb(COLORS.background);
  // Clamp to max 18 per channel — always very dark
  return `#${[r, g, b].map(v => Math.min(v, 18).toString(16).padStart(2, '0')).join('')}`;
}

// ─── Speaker accent derivation ────────────────────────────────────────────────
// Instead of hardcoded '#6C63FF' etc., derive the three speaker accents from
// the active theme's primary / secondary / accent so every theme feels native.

function useSpeakerAccents() {
  const { version } = useTheme(); // eslint-disable-line @typescript-eslint/no-unused-vars
  return useMemo(() => ({
    host:   COLORS.primary,
    guest1: COLORS.secondary,
    guest2: COLORS.accent,
  // version in dep array forces recompute on theme change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [version]);
}

function getSpeakerAccentFromMap(
  accents: ReturnType<typeof useSpeakerAccents>,
  s?: PodcastTurn['speaker'],
): string {
  if (s === 'host')   return accents.host;
  if (s === 'guest2') return accents.guest2;
  return accents.guest1;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function speakerIsHost(s?: PodcastTurn['speaker'])   { return s === 'host'; }
function speakerIsGuest2(s?: PodcastTurn['speaker']) { return s === 'guest2'; }

function getCurrentChapter(chapters: ChapterMarker[], turnIdx: number): ChapterMarker | null {
  if (!chapters?.length) return null;
  let found: ChapterMarker | null = null;
  for (const ch of chapters) {
    if ((ch.startTurnIdx ?? 0) <= turnIdx) found = ch;
  }
  return found;
}

// ─── Load podcast helper ──────────────────────────────────────────────────────

async function loadPodcastForScreen(
  podcastId:   string,
  workspaceId: string | null | undefined,
): Promise<{ podcast: Podcast | null; error: string | null }> {
  try {
    if (workspaceId) {
      const { data, error } = await supabase.rpc(
        'get_shared_podcast_full_for_workspace',
        { p_workspace_id: workspaceId, p_podcast_id: podcastId },
      );
      if (error) return { podcast: null, error: 'Could not load this episode.' };
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length === 0) return { podcast: null, error: 'Episode not found in this workspace.' };
      return { podcast: mapRowToPodcast(rows[0]), error: null };
    } else {
      const { data, error } = await supabase
        .from('podcasts').select('*').eq('id', podcastId).single();
      if (error || !data) return { podcast: null, error: 'Could not load this episode.' };
      return { podcast: mapRowToPodcast(data), error: null };
    }
  } catch (err) {
    return { podcast: null, error: err instanceof Error ? err.message : 'Failed to load episode.' };
  }
}

// ─── Animated Orb ─────────────────────────────────────────────────────────────

function Orb({ x, y, size, color, duration }: {
  x: number; y: number; size: number; color: string; duration: number;
}) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0.18);
  useEffect(() => {
    ty.value = withRepeat(withSequence(
      withTiming(-18, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(18,  { duration, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    op.value = withRepeat(withSequence(
      withTiming(0.28, { duration: duration * 0.6 }),
      withTiming(0.10, { duration: duration * 0.6 }),
    ), -1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[style, {
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2, backgroundColor: color,
    }]} />
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function VideoProgressBar({
  progress, totalDurationMs, currentPositionMs, formatTime, onSeek, chapters, accentColor,
}: {
  progress: number; totalDurationMs: number; currentPositionMs: number;
  formatTime: (ms: number) => string; onSeek: (p: number) => void;
  chapters: ChapterMarker[]; accentColor: string;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 120 });
  }, [progress]);
  const fillStyle  = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as any }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${fill.value * 100}%` as any, transform: [{ translateX: -10 }],
  }));

  // Track and time labels stay white because they're on the dark cinematic canvas
  const trackBg   = 'rgba(255,255,255,0.10)';
  const timeColor = 'rgba(255,255,255,0.70)';
  const timeMuted = 'rgba(255,255,255,0.40)';

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: timeColor, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatTime(currentPositionMs)}
        </Text>
        <Text style={{ color: timeMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {formatTime(totalDurationMs)}
        </Text>
      </View>
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={1}
        style={{ height: 8, backgroundColor: trackBg, borderRadius: 4, overflow: 'visible', marginBottom: 20 }}
      >
        <Animated.View style={[fillStyle, { height: '100%', backgroundColor: accentColor, borderRadius: 4 }]} />
        <Animated.View style={[thumbStyle, {
          position: 'absolute', top: -6, width: 20, height: 20, borderRadius: 10,
          backgroundColor: '#FFF',
          shadowColor: accentColor, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6,
        }]} />
        {barWidth > 0 && chapters.map(ch => {
          if (!ch.timeMs || totalDurationMs <= 0) return null;
          const pct = Math.min(1, ch.timeMs / totalDurationMs);
          const x   = pct * barWidth;
          if (x < 12 || x > barWidth - 12) return null;
          return (
            <View key={ch.id} style={{
              position: 'absolute', left: x - 1.5, top: -3,
              width: 3, height: 14, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.6)',
            }} />
          );
        })}
      </TouchableOpacity>
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
        // Active bg: blend accent into dark canvas at 22%, border at 80%
        const activeBg  = hexAlpha(accentColor, 0.22);
        const activeBdr = accentColor;
        return (
          <TouchableOpacity
            key={r}
            onPress={() => onSelect(r)}
            style={{
              backgroundColor: active ? activeBg : 'rgba(255,255,255,0.08)',
              borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
              borderWidth: 1,
              borderColor: active ? activeBdr : 'rgba(255,255,255,0.15)',
            }}
          >
            <Text style={{
              color:      active ? accentColor : 'rgba(255,255,255,0.50)',
              fontSize:   12,
              fontWeight: active ? '800' : '400',
            }}>
              {r}×
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Chapter Name Bar ─────────────────────────────────────────────────────────

function ChapterNameBar({ chapter, accentColor }: { chapter: ChapterMarker | null; accentColor: string }) {
  if (!chapter) return <View style={{ height: 32 }} />;
  return (
    <Animated.View key={chapter.id} entering={FadeIn.duration(300)} style={{ alignItems: 'center', paddingHorizontal: 20, marginBottom: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ionicons name="bookmark" size={10} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>CHAPTER</Text>
      </View>
      <Text style={{
        color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 22,
        textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
      }}>
        {chapter.title}
      </Text>
    </Animated.View>
  );
}

// ─── Pulse Dot ────────────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  const s = useSharedValue(0.5);
  useEffect(() => {
    s.value = withRepeat(withSequence(
      withTiming(1.0, { duration: 380, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.5, { duration: 380, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, { width: 4, height: 4, borderRadius: 2, backgroundColor: color }]} />;
}

// ─── Transcript Sheet ─────────────────────────────────────────────────────────

interface TranscriptSheetProps {
  turns:            PodcastTurn[];
  currentTurnIndex: number;
  speakers:         { host: string; guest1: string; guest2?: string };
  accents:          ReturnType<typeof useSpeakerAccents>;
  bottomInset:      number;
  isLight:          boolean;
  onClose:          () => void;
  onTurnPress:      (index: number) => void;
}

function TranscriptSheet({
  turns, currentTurnIndex, speakers, accents,
  bottomInset, isLight, onClose, onTurnPress,
}: TranscriptSheetProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollRef.current && currentTurnIndex > 1) {
      scrollRef.current.scrollTo({ y: (currentTurnIndex - 1) * 88, animated: true });
    }
  }, [currentTurnIndex]);

  // Sheet surfaces — theme-aware, not hardcoded dark
  const sheetBg    = COLORS.backgroundCard;
  const sheetBdr   = COLORS.border;
  const handleClr  = COLORS.border;
  const dividerClr = COLORS.border;
  const backdropBg = useMemo(() => {
    const { r, g, b } = hexToRgb(COLORS.background);
    return `rgba(${r},${g},${b},${isLight ? 0.60 : 0.78})`;
  }, [isLight]);

  function getSpeakerName(turn: PodcastTurn): string {
    if (turn.speaker === 'host')   return speakers.host;
    if (turn.speaker === 'guest2') return speakers.guest2 ?? 'Guest 2';
    return speakers.guest1;
  }
  function getRoleLabel(turn: PodcastTurn): string {
    if (turn.speaker === 'host')   return 'HOST';
    if (turn.speaker === 'guest2') return 'GUEST 2';
    return 'GUEST';
  }

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFillObject}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropBg }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <Animated.View
              entering={FadeInDown.duration(340).springify()}
              style={{
                backgroundColor:      sheetBg,
                borderTopLeftRadius:  28,
                borderTopRightRadius: 28,
                maxHeight:            SCREEN_H * 0.76,
                borderTopWidth:       1,
                borderTopColor:       sheetBdr,
                overflow:             'hidden',
              }}
            >
              {/* Header */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4, paddingHorizontal: 20 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: handleClr, marginBottom: 14 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' }}>Transcript</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 1 }}>
                      {turns.length} turns · tap any to jump
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: COLORS.backgroundElevated,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: COLORS.border,
                    }}
                  >
                    <Ionicons name="close" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: dividerClr, marginHorizontal: 20, marginBottom: 4 }} />

              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 24 }}
              >
                {turns.map((turn, idx) => {
                  const isActive   = idx === currentTurnIndex;
                  const isPast     = idx < currentTurnIndex;
                  const color      = getSpeakerAccentFromMap(accents, turn.speaker);
                  const name       = getSpeakerName(turn);
                  const label      = getRoleLabel(turn);
                  const initials   = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                  const card       = COLORS.backgroundCard;
                  const elevated   = COLORS.backgroundElevated;

                  // Blended row surfaces — opaque, works on both light + dark
                  const rowBg  = isActive ? blend(color, card, isLight ? 0.10 : 0.09) : elevated;
                  const rowBdr = isActive ? blend(color, card, isLight ? 0.40 : 0.32) : COLORS.border;
                  const avatBg = blend(color, card, isLight ? 0.14 : 0.12);

                  const speakerColor = isActive
                    ? color
                    : blend(color, card, isLight ? 0.55 : 0.45);

                  const nowBg = blend(color, elevated, isLight ? 0.18 : 0.15);

                  const turnTextColor = isActive
                    ? COLORS.textPrimary
                    : isPast
                    ? blend(COLORS.textMuted, card, isLight ? 0.50 : 0.40)
                    : COLORS.textSecondary;

                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => onTurnPress(idx)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
                        borderRadius: 16, backgroundColor: rowBg,
                        borderWidth: 1, borderColor: rowBdr,
                      }}
                    >
                      {/* Avatar */}
                      <View style={{ alignItems: 'center', gap: 4, width: 36 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 10, backgroundColor: avatBg,
                          borderWidth: isActive ? 1.5 : 0, borderColor: color,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive
                            ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                {[0, 1, 2].map(i => <PulseDot key={i} color={color} />)}
                              </View>
                            ) : (
                              <Text style={{
                                color: isPast
                                  ? blend(color, avatBg, 0.40)
                                  : blend(color, avatBg, 0.82),
                                fontSize: 11, fontWeight: '800',
                              }}>
                                {initials}
                              </Text>
                            )}
                        </View>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>{idx + 1}</Text>
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Text style={{ color: speakerColor, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
                            {label}
                          </Text>
                          <Text style={{
                            color:      isActive ? COLORS.textPrimary : COLORS.textSecondary,
                            fontSize:   12,
                            fontWeight: '600',
                          }}>
                            {name}
                          </Text>
                          {isActive && (
                            <View style={{
                              marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 4,
                              backgroundColor: nowBg,
                              borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6,
                            }}>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
                              <Text style={{ color, fontSize: 9, fontWeight: '700' }}>NOW</Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={{
                            color:      turnTextColor,
                            fontSize:   13,
                            lineHeight: 20,
                            fontWeight: isActive ? '500' : '400',
                          }}
                          numberOfLines={isActive ? 0 : 3}
                        >
                          {turn.text}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Share Episode Sheet ──────────────────────────────────────────────────────

interface ShareSheetProps {
  podcast:      Podcast;
  accents:      ReturnType<typeof useSpeakerAccents>;
  bottomInset:  number;
  isLight:      boolean;
  shareBusy:    string | null;
  shareCopied:  boolean;
  onClose:      () => void;
  onShareMP3:   () => void;
  onSharePDF:   () => void;
  onCopy:       () => void;
}

function ShareEpisodeSheet({
  podcast, accents, bottomInset, isLight,
  shareBusy, shareCopied,
  onClose, onShareMP3, onSharePDF, onCopy,
}: ShareSheetProps) {
  // Sheet surfaces — theme-aware
  const sheetBg   = COLORS.backgroundCard;
  const sheetBdr  = COLORS.border;
  const handleClr = COLORS.border;
  const backdropBg = useMemo(() => {
    const { r, g, b } = hexToRgb(COLORS.background);
    return `rgba(${r},${g},${b},${isLight ? 0.55 : 0.72})`;
  }, [isLight]);

  // Three export actions each keyed to a theme accent
  const actions = [
    {
      id:       'mp3',
      icon:     'musical-notes-outline' as const,
      label:    'Share as MP3',
      sub:      'Export full episode audio',
      color:    accents.host,
      onPress:  onShareMP3,
      disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length),
    },
    {
      id:       'pdf',
      icon:     'document-text-outline' as const,
      label:    'Export PDF Script',
      sub:      'Styled transcript',
      color:    accents.guest1,
      onPress:  onSharePDF,
      disabled: false,
    },
    {
      id:       'copy',
      icon:     (shareCopied ? 'checkmark-circle-outline' : 'copy-outline') as any,
      label:    shareCopied ? 'Copied!' : 'Copy Script',
      sub:      'Plain text to clipboard',
      color:    accents.guest2,
      onPress:  onCopy,
      disabled: false,
    },
  ];

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropBg }]} />
        <TouchableWithoutFeedback>
          <Animated.View
            entering={FadeInDown.duration(350).springify()}
            style={{
              backgroundColor:      sheetBg,
              borderTopLeftRadius:  28,
              borderTopRightRadius: 28,
              padding:              24,
              paddingBottom:        Math.max(bottomInset + 16, 40),
              borderTopWidth:       1,
              borderTopColor:       sheetBdr,
            }}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: handleClr, alignSelf: 'center', marginBottom: 20 }} />

            <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>
              Share Episode
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 20 }}>
              {podcast.title}
            </Text>

            {actions.map(opt => {
              const elevated = COLORS.backgroundElevated;
              const iconBg   = blend(opt.color, elevated, isLight ? 0.16 : 0.13);
              const rowBg    = elevated;
              const rowBdr   = COLORS.border;

              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={opt.disabled ? undefined : opt.onPress}
                  activeOpacity={opt.disabled ? 1 : 0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    padding: 14, backgroundColor: rowBg,
                    borderRadius: 14, marginBottom: 10,
                    borderWidth: 1, borderColor: rowBdr,
                    opacity: opt.disabled ? 0.35 : 1,
                  }}
                >
                  <View style={{
                    width: 46, height: 46, borderRadius: 14,
                    backgroundColor: iconBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {shareBusy === opt.id
                      ? <ActivityIndicator size="small" color={opt.color} />
                      : <Ionicons name={opt.icon} size={22} color={opt.color} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>{opt.label}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{opt.sub}</Text>
                  </View>
                  {!shareBusy && !opt.disabled && (
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={onClose}
              style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PodcastVideoPlayerScreen() {
  const { podcastId, workspaceId } =
    useLocalSearchParams<{ podcastId: string; workspaceId?: string }>();

  const { user }        = useAuth();
  const navigation      = useNavigation();
  const insets          = useSafeAreaInsets();
  const { isLight, version } = useTheme();
  const accents         = useSpeakerAccents();

  const topInset    = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [podcast,        setPodcast]        = useState<Podcast | null>(null);
  const [loadingPodcast, setLoadingPodcast] = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [hasStarted,     setHasStarted]     = useState(false);
  const [showControls,   setShowControls]   = useState(true);
  const [showShare,      setShowShare]      = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [shareBusy,      setShareBusy]      = useState<string | null>(null);
  const [shareCopied,    setShareCopied]    = useState(false);

  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const podcastRef      = useRef<Podcast | null>(null);
  const userRef         = useRef(user);

  useEffect(() => { userRef.current    = user;    }, [user]);
  useEffect(() => { podcastRef.current = podcast; }, [podcast]);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    controlsTimeout.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, []);

  const handleTap = useCallback(() => {
    if (showTranscript) return;
    if (showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      setShowControls(false);
    } else {
      resetControlsTimer();
    }
  }, [showControls, showTranscript, resetControlsTimer]);

  // Load podcast
  useEffect(() => {
    if (!podcastId) { setLoadError('No podcast ID provided.'); setLoadingPodcast(false); return; }
    (async () => {
      const { podcast: p, error } = await loadPodcastForScreen(podcastId, workspaceId);
      if (error || !p) setLoadError(error ?? 'Could not load this episode.');
      else setPodcast(p);
      setLoadingPodcast(false);
    })();
  }, [podcastId, workspaceId]);

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, resumeFrom, togglePlayPause,
    skipNext, skipPrevious, skipToTurn,
    setPlaybackRate, detachScreen, formatTime,
  } = usePodcastPlayer(podcast);

  useEffect(() => {
    if (!user || !podcast) return;
    registerProgressSaveCallback((turnIdx, totalPosMs, totalDurMs) => {
      const u = userRef.current; const p = podcastRef.current;
      if (u && p) savePlaybackProgress(u.id, p.id, turnIdx, totalPosMs, totalDurMs);
    });
  }, [user?.id, podcast?.id]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      detachScreen();
      const u = userRef.current; const p = podcastRef.current;
      if (u && p && playerState.totalPositionMs > 0)
        savePlaybackProgress(u.id, p.id, playerState.currentTurnIndex, playerState.totalPositionMs, playerState.totalDurationMs);
    });
    return unsub;
  }, [navigation, detachScreen, playerState]);

  useEffect(() => {
    if (!podcast || loadingPodcast || hasStarted) return;
    setHasStarted(true);
    resetControlsTimer();
    (async () => {
      if (isGlobalAudioActiveForPodcast(podcast.id)) { resetControlsTimer(); return; }
      if (user && !workspaceId) {
        try {
          const { data } = await supabase
            .from('podcast_playback_progress')
            .select('last_turn_idx, progress_percent')
            .eq('user_id', user.id).eq('podcast_id', podcast.id).maybeSingle();
          if (data && data.last_turn_idx > 0 && (data.progress_percent ?? 0) < 95) {
            await resumeFrom(data.last_turn_idx); return;
          }
        } catch {}
      }
      await startPlayback();
    })();
  }, [podcast, loadingPodcast, hasStarted, user]);

  useEffect(() => {
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      const u = userRef.current; const p = podcastRef.current;
      if (u && p && playerState.totalPositionMs > 0)
        savePlaybackProgress(u.id, p.id, playerState.currentTurnIndex, playerState.totalPositionMs, playerState.totalDurationMs);
    };
  }, []);

  const handleSeek = useCallback((p: number) => {
    AudioEngine.seekToPercent(p);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handleTurnPress = useCallback((idx: number) => {
    skipToTurn(idx);
    setShowTranscript(false);
    resetControlsTimer();
  }, [skipToTurn, resetControlsTimer]);

  const speakers = useMemo(() => {
    if (!podcast) return { host: 'Host', guest1: 'Guest', guest2: undefined as string | undefined };
    const g2 = podcast.script?.turns.find(t => t.speaker === 'guest2');
    const g1 = podcast.script?.turns.find(t => t.speaker === 'guest1' || t.speaker === 'guest');
    return {
      host:   podcast.config.hostName  ?? 'Host',
      guest1: g1?.speakerName ?? podcast.config.guestName ?? 'Guest',
      guest2: g2?.speakerName ?? undefined,
    };
  }, [podcast]);

  const activeAccent = getSpeakerAccentFromMap(accents, currentTurn?.speaker);

  const speakerInfos = useMemo(() => {
    const list = [
      { name: speakers.host,   label: 'HOST',    color: accents.host,   isActive: speakerIsHost(currentTurn?.speaker) },
      { name: speakers.guest1, label: 'GUEST',   color: accents.guest1, isActive: !speakerIsHost(currentTurn?.speaker) && !speakerIsGuest2(currentTurn?.speaker) },
    ];
    if (speakers.guest2)
      list.push({ name: speakers.guest2, label: 'GUEST 2', color: accents.guest2, isActive: speakerIsGuest2(currentTurn?.speaker) });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakers, currentTurn, version]);

  const chapters: ChapterMarker[] = (podcast?.script as any)?.chapters ?? [];
  const turns = podcast?.script?.turns ?? [];
  const currentChapter = useMemo(
    () => getCurrentChapter(chapters, playerState.currentTurnIndex),
    [chapters, playerState.currentTurnIndex],
  );
  const durationMin = podcast ? Math.round(podcast.durationSeconds / 60) : 0;

  // Cinematic gradient — always dark, brand-hued glow from the active accent
  const base = cinematicBase();
  const bgColors: [string, string, string, string] = [
    base,
    hexAlpha(activeAccent, 0.10),
    hexAlpha(activeAccent, 0.06),
    base,
  ];

  // Header chrome — works on the dark canvas
  const headerBtnBg  = 'rgba(0,0,0,0.45)';
  const headerBtnBdr = 'rgba(255,255,255,0.12)';
  const liveBadgeBg  = 'rgba(0,0,0,0.40)';
  const liveBadgeBdr = 'rgba(255,255,255,0.10)';

  // Share handlers
  const handleShareMP3 = async () => {
    if (!podcast || shareBusy) return;
    setShareBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export MP3.'); }
    finally { setShareBusy(null); }
  };
  const handleSharePDF = async () => {
    if (!podcast || shareBusy) return;
    setShareBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setShareBusy(null); }
  };
  const handleCopy = async () => {
    if (!podcast || shareBusy) return;
    setShareBusy('copy');
    try {
      await copyPodcastScriptToClipboard(podcast);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setShareBusy(null); }
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loadingPodcast) {
    return (
      <View style={{ flex: 1, backgroundColor: base, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>
          Loading episode...
        </Text>
      </View>
    );
  }

  if (loadError || !podcast) {
    return (
      <View style={{
        flex: 1, backgroundColor: base,
        alignItems: 'center', justifyContent: 'center',
        padding: 32, paddingTop: topInset + 32,
      }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
          {loadError ?? 'Episode not found'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: '600' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isHost_   = speakerIsHost(currentTurn?.speaker);
  const isGuest2_ = speakerIsGuest2(currentTurn?.speaker);

  return (
    <View style={{ flex: 1, backgroundColor: base }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Cinematic gradient — always dark video aesthetic */}
      <LinearGradient
        colors={bgColors}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Theme-accent orbs */}
      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.25} size={200} color={activeAccent} duration={3200} />
      <Orb x={SCREEN_W * 0.82} y={SCREEN_H * 0.40} size={160} color={activeAccent} duration={4000} />
      <Orb x={SCREEN_W * 0.50} y={SCREEN_H * 0.72} size={140} color={activeAccent} duration={3600} />

      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomInset }}>

            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={s.header}>
              <TouchableOpacity
                onPress={() => router.back()}
                onPressIn={resetControlsTimer}
                style={[s.headerBtn, { backgroundColor: headerBtnBg, borderColor: headerBtnBdr }]}
              >
                <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <View style={[s.liveBadge, { backgroundColor: liveBadgeBg, borderColor: liveBadgeBdr }]}>
                <View style={[s.liveDot, {
                  backgroundColor: playerState.isPlaying ? COLORS.error : 'rgba(255,255,255,0.3)',
                }]} />
                <Text style={s.liveText}>{playerState.isPlaying ? 'LIVE' : 'PAUSED'}</Text>
              </View>

              <View style={{ flex: 1 }} />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowTranscript(true); resetControlsTimer(); }}
                  onPressIn={resetControlsTimer}
                  style={[
                    s.headerBtn,
                    { backgroundColor: headerBtnBg, borderColor: headerBtnBdr },
                    showTranscript && {
                      backgroundColor: hexAlpha(activeAccent, 0.22),
                      borderColor:     hexAlpha(activeAccent, 0.60),
                    },
                  ]}
                >
                  <Ionicons name="menu-outline" size={22} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowShare(true); resetControlsTimer(); }}
                  style={[s.headerBtn, { backgroundColor: headerBtnBg, borderColor: headerBtnBdr }]}
                >
                  <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Main content ────────────────────────────────────────── */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
              {!hasStarted && (
                <Animated.View entering={FadeIn.duration(600)} exiting={FadeOut.duration(400)} style={{ width: '100%' }}>
                  <EpisodeThumbnail
                    title={podcast.title}
                    hostName={speakers.host}
                    guestName={speakers.guest1}
                    durationMin={durationMin}
                    accentColor={activeAccent}
                  />
                </Animated.View>
              )}
              {hasStarted && (
                <Animated.View entering={FadeIn.duration(500)} style={{ width: '100%', alignItems: 'center', gap: 20 }}>
                  <ChapterNameBar chapter={currentChapter} accentColor={activeAccent} />
                  <CinematicWaveform isPlaying={playerState.isPlaying} color={activeAccent} barWidth={4} barGap={3} maxHeight={80} />
                  <VideoSpeakerAvatars speakers={speakerInfos} />
                  <View style={[s.turnBadge, { backgroundColor: liveBadgeBg, borderColor: liveBadgeBdr }]}>
                    <Text style={s.turnBadgeText}>
                      Turn {playerState.currentTurnIndex + 1} of {turns.length}
                      {speakers.guest2 ? '  ·  3 speakers' : ''}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>

            {/* ── Bottom panel ────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              <VideoSubtitle
                key={playerState.currentTurnIndex}
                text={currentTurn?.text ?? ''}
                speakerName={
                  isHost_   ? speakers.host
                  : isGuest2_ ? (speakers.guest2 ?? speakers.guest1)
                  : speakers.guest1
                }
                speakerColor={activeAccent}
                turnIndex={playerState.currentTurnIndex}
                positionMs={playerState.positionMs}
                segmentDurationMs={playerState.segmentDurationMs}
                visible={hasStarted}
                style={{ marginBottom: 12 }}
              />

              {showControls && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)}>
                  <VideoProgressBar
                    progress={progressPercent}
                    totalDurationMs={playerState.totalDurationMs}
                    currentPositionMs={playerState.totalPositionMs}
                    formatTime={formatTime}
                    onSeek={handleSeek}
                    chapters={chapters}
                    accentColor={activeAccent}
                  />

                  {/* Playback controls */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 14 }}>
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
                        width: 72, height: 72, borderRadius: 36,
                        backgroundColor: activeAccent,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: activeAccent, shadowOpacity: 0.75, shadowRadius: 22, elevation: 12,
                      }}
                    >
                      {playerState.isLoading
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Ionicons
                            name={playerState.isPlaying ? 'pause' : 'play'}
                            size={30}
                            color="#FFF"
                            style={{ marginLeft: playerState.isPlaying ? 0 : 3 }}
                          />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { skipNext(); resetControlsTimer(); }}
                      style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="play-skip-forward" size={28} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  </View>

                  <RateSelector
                    current={playerState.playbackRate}
                    onSelect={r => { setPlaybackRate(r); resetControlsTimer(); }}
                    accentColor={activeAccent}
                  />
                </Animated.View>
              )}

              <Text style={{
                color: 'rgba(255,255,255,0.40)', fontSize: 12,
                textAlign: 'center', marginTop: 10, fontWeight: '500',
                lineHeight: 18, paddingHorizontal: 8,
              }}>
                {podcast.title}
              </Text>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* ── Transcript Sheet ──────────────────────────────────────────── */}
      {showTranscript && (
        <TranscriptSheet
          turns={turns}
          currentTurnIndex={playerState.currentTurnIndex}
          speakers={speakers}
          accents={accents}
          bottomInset={bottomInset}
          isLight={isLight}
          onClose={() => setShowTranscript(false)}
          onTurnPress={handleTurnPress}
        />
      )}

      {/* ── Share Episode Sheet ───────────────────────────────────────── */}
      {showShare && (
        <ShareEpisodeSheet
          podcast={podcast}
          accents={accents}
          bottomInset={bottomInset}
          isLight={isLight}
          shareBusy={shareBusy}
          shareCopied={shareCopied}
          onClose={() => setShowShare(false)}
          onShareMP3={handleShareMP3}
          onSharePDF={handleSharePDF}
          onCopy={handleCopy}
        />
      )}
    </View>
  );
}

// ─── Static styles (layout only — no color) ───────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   10,
    zIndex:            20,
  },
  headerBtn: {
    width:          44,
    height:         44,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  liveBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderRadius:      20,
    paddingVertical:   5,
    paddingHorizontal: 14,
    borderWidth:       1,
  },
  liveDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  liveText: {
    color:         'rgba(255,255,255,0.85)',
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 0.6,
  },
  turnBadge: {
    borderRadius:      20,
    borderWidth:       1,
    paddingVertical:   5,
    paddingHorizontal: 14,
  },
  turnBadgeText: {
    color:      'rgba(255,255,255,0.50)',
    fontSize:   11,
    fontWeight: '600',
  },
});