// src/components/offline/OfflinePodcastViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — FULL THEME SYSTEM integration
//   All colors now derive from the active theme via COLORS object.
//   Uses useTheme() for light/dark mode awareness.
//   All hardcoded hex values replaced with theme-aware colors.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Animated as RNAnimated,
  Dimensions,
  Modal,
  StatusBar,
  TouchableWithoutFeedback,
  Platform,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, FadeOut, FadeInDown,
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useCachedPodcastPlayer } from '../../hooks/useCachedPodcastPlayer';
import { usePodcastPlayer } from '../../hooks/usePodcastPlayer';
import { WaveformVisualizer } from '../podcast/WaveformVisualizer';
import { CinematicWaveform } from '../podcast/CinematicWaveform';
import { VideoSubtitle } from '../podcast/VideoSubtitle';
import { VideoSpeakerAvatars, type SpeakerInfo as VideoSpeakerInfo } from '../podcast/VideoSpeakerAvatars';
import { ChapterMarkers } from '../podcast/ChapterMarkers';
import {
  exportPodcastAsMP3Offline,
  canExportPodcastAsMP3,
} from '../../services/offlineMp3Export';
import { AudioEngine } from '../../services/GlobalAudioEngine';
import type { Podcast, PodcastTurn } from '../../types';
import type { CacheEntry } from '../../types/cache';
import type { ChapterMarker } from '../../types/podcast_v2';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

// ─── Speaker config type ──────────────────────────────────────────────────────

interface SpeakerInfo {
  role: string;
  name: string;
  color: string;
}

function getSpeakersFromPodcast(podcast: Podcast): SpeakerInfo[] {
  const turns = podcast.script?.turns ?? [];
  const nameByRole = new Map<string, string>();
  for (const turn of turns) {
    const role = turn.speaker as string;
    if (role && !nameByRole.has(role) && turn.speakerName) {
      nameByRole.set(role, turn.speakerName);
    }
  }
  const hostName = nameByRole.get('host') ?? podcast.config.hostName ?? 'Host';
  const guest1Name = nameByRole.get('guest1') ?? nameByRole.get('guest') ?? podcast.config.guestName ?? 'Guest';
  const guest2Name = nameByRole.get('guest2') ?? null;
  const speakers: SpeakerInfo[] = [
    { role: 'host', name: hostName, color: COLORS.primary },
    { role: 'guest1', name: guest1Name, color: COLORS.secondary },
  ];
  if (guest2Name) {
    speakers.push({ role: 'guest2', name: guest2Name, color: COLORS.accent });
  }
  return speakers;
}

function resolveSpeaker(speakerRole: string | undefined, speakers: SpeakerInfo[]): SpeakerInfo {
  const role = speakerRole === 'guest' ? 'guest1' : (speakerRole ?? 'host');
  return speakers.find(s => s.role === role) ?? speakers[0];
}

function getSpeakerAccent(s?: PodcastTurn['speaker']): string {
  if (s === 'host') return COLORS.primary;
  if (s === 'guest2') return COLORS.accent;
  return COLORS.secondary;
}

// ─── Speaker Avatar ───────────────────────────────────────────────────────────

function SpeakerAvatar({ name, isActive, color }: {
  name: string; isActive: boolean; color: string;
}) {
  const scale = useSharedValue(isActive ? 1 : 0.85);
  const border = useSharedValue(isActive ? 1.5 : 0);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.0 : 0.85, { damping: 12 });
    border.value = withTiming(isActive ? 1.5 : 0, { duration: 300 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderWidth: border.value,
  }));

  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Animated.View style={[{
      width: isActive ? 56 : 44,
      height: isActive ? 56 : 44,
      borderRadius: isActive ? 16 : 12,
      backgroundColor: `${color}20`,
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: color,
    }, animStyle]}>
      <Text style={{
        color: isActive ? color : COLORS.textMuted,
        fontSize: isActive ? FONTS.sizes.md : FONTS.sizes.sm,
        fontWeight: '800',
      }}>
        {initials}
      </Text>
    </Animated.View>
  );
}

// ─── Progress Bar (with chapter markers) ─────────────────────────────────────

function ProgressBar({ progress, onSeek, totalMs, positionMs, formatTime, chapters }: {
  progress: number;
  onSeek: (p: number) => void;
  totalMs: number;
  positionMs: number;
  formatTime: (ms: number) => string;
  chapters: ChapterMarker[];
}) {
  const [barWidth, setBarWidth] = useState(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 150 });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as any,
  }));

  return (
    <View onLayout={e => setBarWidth(e.nativeEvent.layout.width)}>
      {chapters.length > 0 && barWidth > 0 && (
        <ChapterMarkers
          chapters={chapters}
          totalDurationMs={totalMs}
          currentPositionMs={positionMs}
          barWidth={barWidth}
          barHeight={5}
        />
      )}

      <TouchableOpacity
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={0.9}
        style={{
          height: 9,
          justifyContent: 'center',
          marginTop: 4,
          marginBottom: 8,
        }}
      >
        <View style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 5,
          backgroundColor: COLORS.backgroundElevated,
          borderRadius: 3,
        }} />
        <Animated.View style={[fillStyle, {
          position: 'absolute',
          left: 0,
          height: 5,
          backgroundColor: COLORS.primary,
          borderRadius: 3,
        }]} />
        {barWidth > 0 && chapters.map(ch => {
          if (!ch.timeMs || totalMs <= 0) return null;
          const pct = Math.min(1, ch.timeMs / totalMs);
          const x = pct * barWidth;
          if (x < 4 || x > barWidth - 4) return null;
          return (
            <View
              key={ch.id}
              style={{
                position: 'absolute',
                left: x - 1,
                top: 0,
                width: 2,
                height: 9,
                borderRadius: 1,
                backgroundColor: COLORS.textMuted + '99',
              }}
            />
          );
        })}
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(positionMs)}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(totalMs)}</Text>
      </View>
    </View>
  );
}

// ─── Transcript Turn Row ──────────────────────────────────────────────────────

function TranscriptRow({ turn, isActive, speakers, onPress }: {
  turn: PodcastTurn; isActive: boolean; speakers: SpeakerInfo[]; onPress: () => void;
}) {
  const sp = resolveSpeaker(turn.speaker, speakers);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        backgroundColor: isActive ? `${sp.color}12` : 'transparent',
        borderRadius: RADIUS.lg,
        borderLeftWidth: isActive ? 3 : 0,
        borderLeftColor: sp.color,
        marginBottom: 4,
      }}
    >
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{
          color: isActive ? sp.color : COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          fontWeight: '700',
          textAlign: 'center',
        }}>
          {sp.name.split(' ')[0]}
        </Text>
      </View>
      <Text style={{
        flex: 1,
        color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
        fontSize: FONTS.sizes.sm,
        lineHeight: 20,
        fontWeight: isActive ? '500' : '400',
      }}>
        {turn.text}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Offline Video Mode Modal ─────────────────────────────────────────────────

interface OfflineVideoModeModalProps {
  visible: boolean;
  podcast: Podcast;
  initialTurnIndex: number;
  onClose: () => void;
}

function OfflineVideoModeModal({ visible, podcast, initialTurnIndex, onClose }: OfflineVideoModeModalProps) {
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 28 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [hasStarted, setHasStarted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barWidth, setBarWidth] = useState(0);

  const {
    playerState, currentTurn, progressPercent,
    togglePlayPause,
    skipNext, skipPrevious, skipToTurn,
    setPlaybackRate, formatTime,
  } = usePodcastPlayer(visible ? podcast : null);

  const chapters: ChapterMarker[] = useMemo(
    () => (podcast.script as any)?.chapters ?? [],
    [podcast.script]
  );

  const speakers = useMemo(() => {
    const turns = podcast.script?.turns ?? [];
    const nameByRole = new Map<string, string>();
    for (const t of turns) {
      const role = t.speaker as string;
      if (role && !nameByRole.has(role) && t.speakerName) nameByRole.set(role, t.speakerName);
    }
    return {
      host: nameByRole.get('host') ?? podcast.config.hostName ?? 'Host',
      guest1: nameByRole.get('guest1') ?? nameByRole.get('guest') ?? podcast.config.guestName ?? 'Guest',
      guest2: nameByRole.get('guest2') ?? undefined as string | undefined,
    };
  }, [podcast]);

  const speakerInfos = useMemo((): VideoSpeakerInfo[] => {
    const isHost = currentTurn?.speaker === 'host';
    const isGuest2 = currentTurn?.speaker === 'guest2';
    const list: VideoSpeakerInfo[] = [
      { name: speakers.host, label: 'HOST', color: COLORS.primary, isActive: isHost },
      { name: speakers.guest1, label: 'GUEST', color: COLORS.secondary, isActive: !isHost && !isGuest2 },
    ];
    if (speakers.guest2) {
      list.push({ name: speakers.guest2, label: 'GUEST 2', color: COLORS.accent, isActive: isGuest2 });
    }
    return list;
  }, [speakers, currentTurn]);

  const activeColor = getSpeakerAccent(currentTurn?.speaker);
  const turns = podcast.script?.turns ?? [];

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    if (visible && !hasStarted) {
      setHasStarted(true);
      resetControlsTimer();
      if (AudioEngine.isActiveFor(podcast.id)) {
        AudioEngine.reattach(podcast);
      } else {
        AudioEngine.startPodcast(podcast, initialTurnIndex);
      }
    }
    if (!visible) {
      setHasStarted(false);
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    }
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [visible, podcast, initialTurnIndex]);

  const handleSeek = useCallback((p: number) => {
    const targetMs = p * playerState.totalDurationMs;
    let cum = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cum + dur >= targetMs || i === turns.length - 1) { skipToTurn(i); break; }
      cum += dur;
    }
    resetControlsTimer();
  }, [turns, playerState.totalDurationMs, skipToTurn, resetControlsTimer]);

  const handleTap = useCallback(() => {
    if (showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      setShowControls(false);
    } else {
      resetControlsTimer();
    }
  }, [showControls, resetControlsTimer]);

  const bgColors: readonly [string, string, string, string] = [
    COLORS.background,
    `${activeColor}1A`,
    `${activeColor}0A`,
    COLORS.background,
  ];

  // Theme-aware close button style
  const closeBtnBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
  const closeBtnBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} translucent backgroundColor="transparent" />
        <LinearGradient 
          colors={bgColors} 
          start={{ x: 0.3, y: 0 }} 
          end={{ x: 0.7, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} 
        />
        <TouchableWithoutFeedback onPress={handleTap}>
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomInset }}>

              {/* Header - Theme-aware */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 20 }}>
                <TouchableOpacity onPress={onClose}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: closeBtnBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: closeBtnBorder,
                  }}>
                  <Ionicons name="chevron-down" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: closeBtnBg,
                  borderRadius: 20,
                  paddingVertical: 5,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: closeBtnBorder,
                }}>
                  <View style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: playerState.isPlaying ? COLORS.error : COLORS.textMuted,
                  }} />
                  <Text style={{
                    color: COLORS.textSecondary,
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 0.6,
                  }}>
                    {playerState.isPlaying ? 'LIVE' : 'PAUSED'}
                  </Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{
                    backgroundColor: `${COLORS.info}20`,
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderWidth: 1,
                    borderColor: `${COLORS.info}40`,
                  }}>
                    <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>OFFLINE</Text>
                  </View>
                  <View style={{ width: 44, height: 44 }} />
                </View>
              </View>

              {/* Main content */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                {hasStarted && (
                  <Animated.View entering={FadeIn.duration(500)} style={{ width: '100%', alignItems: 'center', gap: 20 }}>
                    <CinematicWaveform isPlaying={playerState.isPlaying} color={activeColor} barWidth={4} barGap={3} maxHeight={80} />
                    <VideoSpeakerAvatars speakers={speakerInfos} />
                    <View style={{
                      backgroundColor: closeBtnBg,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: closeBtnBorder,
                      paddingVertical: 5,
                      paddingHorizontal: 14,
                    }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600' }}>
                        Turn {playerState.currentTurnIndex + 1} of {turns.length}
                        {speakers.guest2 ? ' · 3 speakers' : ''}
                      </Text>
                    </View>
                  </Animated.View>
                )}
              </View>

              {/* Bottom panel */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                <VideoSubtitle
                  key={playerState.currentTurnIndex}
                  text={currentTurn?.text ?? ''}
                  speakerName={
                    currentTurn?.speaker === 'host' ? speakers.host :
                    currentTurn?.speaker === 'guest2' ? (speakers.guest2 ?? speakers.guest1) :
                    speakers.guest1
                  }
                  speakerColor={activeColor}
                  turnIndex={playerState.currentTurnIndex}
                  positionMs={playerState.positionMs}
                  segmentDurationMs={playerState.segmentDurationMs}
                  visible={hasStarted}
                  style={{ marginBottom: 12 }}
                />

                {/* Measure strip for bar width */}
                <View
                  onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                  style={{ height: 0, overflow: 'hidden' }}
                  pointerEvents="none"
                />

                {showControls && (
                  <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)}>
                    {/* Chapter markers + progress bar */}
                    <View style={{ marginBottom: 8 }}>
                      {chapters.length > 0 && barWidth > 0 && (
                        <ChapterMarkers
                          chapters={chapters}
                          totalDurationMs={playerState.totalDurationMs}
                          currentPositionMs={playerState.totalPositionMs}
                          barWidth={barWidth}
                          barHeight={8}
                        />
                      )}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>
                          {formatTime(playerState.totalPositionMs)}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                          {formatTime(playerState.totalDurationMs)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={e => {
                          const bw = barWidth || (SCREEN_W - 40);
                          handleSeek(e.nativeEvent.locationX / bw);
                        }}
                        activeOpacity={1}
                        style={{ height: 14, justifyContent: 'center', marginBottom: 20 }}
                      >
                        <View style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          height: 8,
                          backgroundColor: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
                          borderRadius: 4,
                        }} />
                        <Animated.View style={[{
                          position: 'absolute',
                          left: 0,
                          height: 8,
                          backgroundColor: activeColor,
                          borderRadius: 4,
                        }, useAnimatedStyle(() => ({
                          width: `${Math.min(1, Math.max(0, progressPercent)) * 100}%` as any,
                        }))]} />
                        {barWidth > 0 && chapters.map(ch => {
                          if (!ch.timeMs || playerState.totalDurationMs <= 0) return null;
                          const pct = Math.min(1, ch.timeMs / playerState.totalDurationMs);
                          const x = pct * barWidth;
                          if (x < 4 || x > barWidth - 4) return null;
                          return (
                            <View
                              key={ch.id}
                              style={{
                                position: 'absolute',
                                left: x - 1,
                                top: 0,
                                width: 2,
                                height: 14,
                                borderRadius: 1,
                                backgroundColor: COLORS.textMuted + '99',
                              }}
                            />
                          );
                        })}
                      </TouchableOpacity>
                    </View>

                    {/* Transport - Theme-aware */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 14 }}>
                      <TouchableOpacity onPress={() => { skipPrevious(); resetControlsTimer(); }}
                        style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play-skip-back" size={28} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { togglePlayPause(); resetControlsTimer(); }} disabled={playerState.isLoading}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 36,
                          backgroundColor: activeColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: activeColor,
                          shadowOpacity: 0.75,
                          shadowRadius: 22,
                          elevation: 12,
                        }}>
                        {playerState.isLoading
                          ? <ActivityIndicator color="#FFF" size="small" />
                          : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={30} color="#FFF" style={{ marginLeft: playerState.isPlaying ? 0 : 3 }} />}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { skipNext(); resetControlsTimer(); }}
                        style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play-skip-forward" size={28} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Rate selector - Theme-aware */}
                    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                      {RATE_OPTIONS.map(r => {
                        const active = playerState.playbackRate === r;
                        return (
                          <TouchableOpacity key={r} onPress={() => { setPlaybackRate(r); resetControlsTimer(); }}
                            style={{
                              backgroundColor: active ? `${activeColor}35` : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'),
                              borderRadius: 20,
                              paddingHorizontal: 12,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: active ? activeColor : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'),
                            }}>
                            <Text style={{
                              color: active ? activeColor : COLORS.textMuted,
                              fontSize: 12,
                              fontWeight: active ? '800' : '400',
                            }}>{r}×</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}

                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: 12,
                  textAlign: 'center',
                  marginTop: 10,
                  fontWeight: '500',
                }}>
                  {podcast.title}
                </Text>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}

// ─── Audio Player Panel ───────────────────────────────────────────────────────

interface AudioPlayerPanelProps {
  podcast: Podcast;
  onTurnIndexChange?: (idx: number) => void;
}

function AudioPlayerPanel({ podcast, onTurnIndexChange }: AudioPlayerPanelProps) {
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const [hasStarted, setHasStarted] = useState(false);
  const transcriptRef = useRef<FlatList>(null);
  const speakers = useMemo(() => getSpeakersFromPodcast(podcast), [podcast]);
  const is3Speaker = speakers.length >= 3;

  const chapters: ChapterMarker[] = useMemo(
    () => (podcast.script as any)?.chapters ?? [],
    [podcast.script]
  );

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipNext, skipPrevious,
    skipToTurn, setPlaybackRate, formatTime,
  } = usePodcastPlayer(podcast);

  useEffect(() => {
    onTurnIndexChange?.(playerState.currentTurnIndex);
  }, [playerState.currentTurnIndex, onTurnIndexChange]);

  useEffect(() => {
    if (!hasStarted) { setHasStarted(true); startPlayback(); }
  }, []);

  useEffect(() => {
    const idx = playerState.currentTurnIndex;
    if (idx >= 0 && transcriptRef.current) {
      try {
        transcriptRef.current.scrollToIndex({ index: idx, animated: true, viewOffset: 60, viewPosition: 0.3 });
      } catch {}
    }
  }, [playerState.currentTurnIndex]);

  const handleSeek = useCallback((percent: number) => {
    const turns = podcast.script?.turns ?? [];
    const targetMs = percent * playerState.totalDurationMs;
    let cumMs = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cumMs + dur >= targetMs || i === turns.length - 1) { skipToTurn(i); break; }
      cumMs += dur;
    }
  }, [podcast, playerState.totalDurationMs, skipToTurn]);

  const activeSpeaker = useMemo(
    () => resolveSpeaker(currentTurn?.speaker, speakers),
    [currentTurn, speakers]
  );

  const turns = podcast.script?.turns ?? [];

  const cardGradient: readonly [string, string] = isLight
    ? ['#F5F6FB', '#EEF0F8']
    : ['#1A1A35', '#0F0F28'];

  // Theme-aware button styles
  const iconBtnBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const iconBtnBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  return (
    <View style={{ flex: 1 }}>
      {/* Player card */}
      <LinearGradient colors={cardGradient}
        style={{
          margin: SPACING.lg,
          borderRadius: RADIUS.xl,
          padding: SPACING.lg,
          borderWidth: 1,
          borderColor: `${activeSpeaker.color}25`,
          alignItems: 'center',
          ...SHADOWS.medium,
        }}
      >
        {/* Waveform */}
        <View style={{ marginBottom: SPACING.md }}>
          <WaveformVisualizer isPlaying={playerState.isPlaying} color={activeSpeaker.color} barWidth={5} barGap={3} maxHeight={40} />
        </View>

        {/* Speaker avatars */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: is3Speaker ? SPACING.sm : SPACING.lg, marginBottom: SPACING.sm }}>
          {speakers.map(sp => {
            const isActive = activeSpeaker.role === sp.role;
            return (
              <View key={sp.role} style={{ alignItems: 'center', gap: 4 }}>
                <SpeakerAvatar name={sp.name} isActive={isActive} color={sp.color} />
                <Text style={{
                  color: isActive ? sp.color : COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: '600',
                  textAlign: 'center',
                  maxWidth: is3Speaker ? 60 : 80,
                }} numberOfLines={1}>
                  {sp.name.split(' ')[0]}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Title */}
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: 2,
          lineHeight: 20,
        }} numberOfLines={2}>
          {podcast.title}
        </Text>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          textAlign: 'center',
          marginBottom: SPACING.md,
        }}>
          Turn {playerState.currentTurnIndex + 1} of {turns.length}
          {is3Speaker ? ' · 3 speakers' : ''}
        </Text>

        {/* Progress bar with chapter markers */}
        <View style={{ width: '100%', marginBottom: SPACING.md }}>
          <ProgressBar
            progress={progressPercent}
            onSeek={handleSeek}
            totalMs={playerState.totalDurationMs}
            positionMs={playerState.totalPositionMs}
            formatTime={formatTime}
            chapters={chapters}
          />
        </View>

        {/* Controls - Theme-aware */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
          <TouchableOpacity onPress={skipPrevious} 
            style={{ 
              width: 40, 
              height: 40, 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: iconBtnBg,
              borderRadius: RADIUS.full,
              borderWidth: 1,
              borderColor: iconBtnBorder,
            }}>
            <Ionicons name="play-skip-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayPause} disabled={playerState.isLoading}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: COLORS.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: COLORS.primary,
              shadowOpacity: 0.5,
              shadowRadius: 16,
              elevation: 8,
            }}>
            {playerState.isLoading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={24} color="#FFF" style={{ marginLeft: playerState.isPlaying ? 0 : 2 }} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={skipNext} 
            style={{ 
              width: 40, 
              height: 40, 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: iconBtnBg,
              borderRadius: RADIUS.full,
              borderWidth: 1,
              borderColor: iconBtnBorder,
            }}>
            <Ionicons name="play-skip-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Playback rate */}
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: SPACING.md }}>
          {RATE_OPTIONS.map(rate => {
            const isActive = playerState.playbackRate === rate;
            return (
              <TouchableOpacity key={rate} onPress={() => setPlaybackRate(rate)}
                style={{
                  backgroundColor: isActive ? `${COLORS.primary}25` : COLORS.backgroundElevated,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: isActive ? COLORS.primary : COLORS.border,
                }}>
                <Text style={{
                  color: isActive ? COLORS.primary : COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: isActive ? '700' : '400',
                }}>{rate}×</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* Transcript */}
      <View style={{
        flex: 1,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg + bottomInset,
      }}>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: SPACING.xs,
        }}>
          Transcript
        </Text>
        <View style={{
          flex: 1,
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          borderWidth: 1,
          borderColor: COLORS.border,
          overflow: 'hidden',
          maxHeight: SCREEN_H * 0.32,
        }}>
          <FlatList
            ref={transcriptRef}
            data={turns}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.md }}
            showsVerticalScrollIndicator
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index }) => (
              <TranscriptRow turn={item} isActive={index === playerState.currentTurnIndex} speakers={speakers} onPress={() => skipToTurn(index)} />
            )}
          />
        </View>
      </View>
    </View>
  );
}

// ─── Transcript-only Panel ────────────────────────────────────────────────────

function TranscriptOnlyPanel({ podcast, onDownloadAudio, downloadState }: {
  podcast: Podcast;
  onDownloadAudio: () => void;
  downloadState: {
    isDownloading: boolean;
    progress: number;
    segmentsComplete: number;
    segmentsTotal: number;
    error: string | null;
  };
}) {
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  const turns = podcast.script?.turns ?? [];
  const speakers = useMemo(() => getSpeakersFromPodcast(podcast), [podcast]);

  const cardGradient: readonly [string, string] = isLight
    ? ['#F5F6FB', '#EEF0F8']
    : ['#1A1A35', '#12122A'];

  return (
    <View style={{ flex: 1 }}>
      {/* Audio download banner */}
      <View style={{ margin: SPACING.lg, borderRadius: RADIUS.xl, overflow: 'hidden' }}>
        {downloadState.isDownloading ? (
          <View style={{
            backgroundColor: `${COLORS.primary}12`,
            borderRadius: RADIUS.xl,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: `${COLORS.primary}30`,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                Downloading audio… {downloadState.segmentsComplete}/{downloadState.segmentsTotal}
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{
                width: `${Math.round(downloadState.progress * 100)}%` as any,
                height: '100%',
                backgroundColor: COLORS.primary,
                borderRadius: 2,
              }} />
            </View>
          </View>
        ) : (
          <LinearGradient colors={cardGradient}
            style={{
              borderRadius: RADIUS.xl,
              padding: SPACING.md,
              borderWidth: 1,
              borderColor: `${COLORS.secondary}30`,
              ...SHADOWS.small,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: `${COLORS.secondary}18`,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                borderWidth: 1,
                borderColor: `${COLORS.secondary}30`,
              }}>
                <Ionicons name="headset-outline" size={18} color={COLORS.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 }}>
                  Audio not downloaded
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: SPACING.sm }}>
                  Transcript is available offline. Download audio for full offline playback, MP3 export, and Video Mode.
                </Text>
                {downloadState.error ? (
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
                    {downloadState.error}
                  </Text>
                ) : null}
                <TouchableOpacity onPress={onDownloadAudio}
                  style={{
                    backgroundColor: COLORS.secondary,
                    borderRadius: RADIUS.full,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    alignSelf: 'flex-start',
                  }}>
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Download Audio</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Full transcript */}
      <Text style={{
        color: COLORS.textMuted,
        fontSize: FONTS.sizes.xs,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.xs,
      }}>
        Full Transcript
      </Text>
      <ScrollView
        style={{ flex: 1, marginHorizontal: SPACING.lg, marginBottom: SPACING.lg + bottomInset }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.md }}
      >
        {turns.map((turn) => {
          const sp = resolveSpeaker(turn.speaker, speakers);
          return (
            <View key={turn.id} style={{
              marginBottom: SPACING.sm,
              padding: SPACING.md,
              backgroundColor: `${sp.color}0A`,
              borderRadius: RADIUS.lg,
              borderLeftWidth: 3,
              borderLeftColor: sp.color,
            }}>
              <Text style={{
                color: sp.color,
                fontSize: 10,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 4,
              }}>{sp.name}</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20 }}>
                {turn.text}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflinePodcastViewerProps {
  podcast: Podcast;
  entry: CacheEntry;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
}

export function OfflinePodcastViewer({
  podcast, entry, onClose, onExport, exporting,
}: OfflinePodcastViewerProps) {
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();
  const {
    mode, podcastWithLocal, hasLocalAudio, downloadState, downloadAudio,
  } = useCachedPodcastPlayer(podcast);

  const [copying, setCopying] = useState(false);
  const [exportingMp3, setExportingMp3] = useState(false);
  const [mp3Progress, setMp3Progress] = useState(0);
  const [videoModeVisible, setVideoModeVisible] = useState(false);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);

  const speakerNames = useMemo(() => {
    const turns = podcast.script?.turns ?? [];
    const nameByRole = new Map<string, string>();
    for (const t of turns) {
      const role = t.speaker as string;
      if (role && !nameByRole.has(role) && t.speakerName) nameByRole.set(role, t.speakerName);
    }
    const host = nameByRole.get('host') ?? podcast.config.hostName ?? 'Host';
    const guest1 = nameByRole.get('guest1') ?? nameByRole.get('guest') ?? podcast.config.guestName ?? 'Guest';
    const guest2 = nameByRole.get('guest2') ?? null;
    return guest2 ? [host, guest1, guest2] : [host, guest1];
  }, [podcast]);

  const is3Speaker = speakerNames.length >= 3;
  const durationMin = Math.round(podcast.durationSeconds / 60);
  const turnCount = podcast.script?.turns?.length ?? 0;

  const handleCopyScript = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const turns = podcast.script?.turns ?? [];
      const spks = getSpeakersFromPodcast(podcast);
      const text = turns.map(t => {
        const sp = resolveSpeaker(t.speaker, spks);
        return `${sp.name.toUpperCase()}:\n${t.text}`;
      }).join('\n\n');
      await Clipboard.setStringAsync(`${podcast.title}\n\n${text}`);
      Alert.alert('Copied', 'Podcast script copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Could not copy script.');
    } finally {
      setCopying(false);
    }
  }, [podcast, copying]);

  const handleExportMp3 = useCallback(async () => {
    if (exportingMp3) return;
    const audioAvailable = await canExportPodcastAsMP3(podcast.id);
    if (!audioAvailable) {
      Alert.alert('Audio Not Available', 'Audio files are not downloaded yet.\n\nTap "Download Audio" first, then you can export as MP3.', [{ text: 'OK' }]);
      return;
    }
    setExportingMp3(true);
    setMp3Progress(0);
    try {
      await exportPodcastAsMP3Offline(podcast, (progress) => { setMp3Progress(progress); });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('MP3 Export Failed', msg, [{ text: 'OK' }]);
    } finally {
      setExportingMp3(false);
      setMp3Progress(0);
    }
  }, [podcast, exportingMp3]);

  const headerBg = isLight ? '#FFFFFF' : COLORS.background;

  // Theme-aware button styles
  const backBtnBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const backBtnBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const iconBtnBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const iconBtnBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Header ── */}
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[styles.headerWrap, { paddingTop: insets.top, backgroundColor: headerBg }]}
      >
        <View style={styles.headerRow}>
          {/* Back button - Theme-aware */}
          <TouchableOpacity 
            onPress={onClose} 
            style={[
              styles.backBtn, 
              { 
                backgroundColor: backBtnBg,
                borderColor: backBtnBorder,
              }
            ]}
          >
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {/* Badge strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', gap: 5, paddingHorizontal: SPACING.xs }}
            style={{ flex: 1 }}
          >
            <View style={styles.badge}>
              <View style={[styles.badgeDot, { backgroundColor: COLORS.info }]} />
              <Text style={[styles.badgeText, { color: COLORS.info }]}>OFFLINE</Text>
            </View>
            {hasLocalAudio && (
              <View style={[styles.badge, { backgroundColor: `${COLORS.success}15`, borderColor: `${COLORS.success}30` }]}>
                <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
                <Text style={[styles.badgeText, { color: COLORS.success }]}>AUDIO</Text>
              </View>
            )}
            {is3Speaker && (
              <View style={[styles.badge, { backgroundColor: `${COLORS.accent}12`, borderColor: `${COLORS.accent}25` }]}>
                <Text style={[styles.badgeText, { color: COLORS.accent }]}>3 🎙</Text>
              </View>
            )}
            <Text style={styles.metaText}>
              ~{durationMin}min · {turnCount} turns
            </Text>
          </ScrollView>

          {/* Action icons - Theme-aware */}
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {hasLocalAudio && (
              <TouchableOpacity
                onPress={() => setVideoModeVisible(true)}
                style={[
                  styles.iconBtn, 
                  { 
                    backgroundColor: `${COLORS.primary}15`,
                    borderColor: `${COLORS.primary}35`,
                  }
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="videocam-outline" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onExport}
              disabled={exporting}
              style={[
                styles.iconBtn, 
                { 
                  opacity: exporting ? 0.6 : 1,
                  backgroundColor: exporting ? iconBtnBg : `${COLORS.primary}15`,
                  borderColor: exporting ? iconBtnBorder : `${COLORS.primary}35`,
                }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {exporting
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="download-outline" size={16} color={COLORS.primary} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExportMp3}
              disabled={exportingMp3}
              style={[
                styles.iconBtn, 
                {
                  opacity: exportingMp3 ? 0.6 : 1,
                  backgroundColor: hasLocalAudio ? `${COLORS.success}18` : iconBtnBg,
                  borderColor: hasLocalAudio ? `${COLORS.success}35` : iconBtnBorder,
                }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {exportingMp3
                ? <ActivityIndicator size="small" color={COLORS.success} />
                : <Ionicons name="musical-notes-outline" size={16} color={hasLocalAudio ? COLORS.success : COLORS.textMuted} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCopyScript}
              disabled={copying}
              style={[
                styles.iconBtn,
                {
                  backgroundColor: iconBtnBg,
                  borderColor: iconBtnBorder,
                }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {copying
                ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                : <Ionicons name="copy-outline" size={16} color={COLORS.textMuted} />}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.lg }} />

      {/* MP3 export progress bar */}
      {exportingMp3 && mp3Progress > 0 && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="musical-notes-outline" size={13} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 }}>
              Preparing MP3… {Math.round(mp3Progress * 100)}%
            </Text>
          </View>
          <View style={{ height: 3, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
            <View style={{
              width: `${Math.round(mp3Progress * 100)}%` as any,
              height: '100%',
              backgroundColor: COLORS.success,
              borderRadius: 2,
            }} />
          </View>
        </View>
      )}

      {/* Content */}
      {mode === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>
            Loading audio cache…
          </Text>
        </View>
      ) : mode === 'audio' && podcastWithLocal ? (
        <AudioPlayerPanel
          podcast={podcastWithLocal}
          onTurnIndexChange={setCurrentTurnIdx}
        />
      ) : (
        <TranscriptOnlyPanel
          podcast={podcast}
          onDownloadAudio={downloadAudio}
          downloadState={downloadState}
        />
      )}

      {/* Offline Video Mode Modal */}
      {podcastWithLocal && (
        <OfflineVideoModeModal
          visible={videoModeVisible}
          podcast={podcastWithLocal}
          initialTurnIndex={currentTurnIdx}
          onClose={() => setVideoModeVisible(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerWrap: {
    paddingBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  metaText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
  },
});