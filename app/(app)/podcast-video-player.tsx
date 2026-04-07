// app/(app)/podcast-video-player.tsx
// Part 40 — Video Podcast Mode
//
// Changes in this version:
//   • LIVE/PAUSED badge is always centered in the header row
//   • Chapter name shown persistently above waveform (full text, no truncation)
//     — shows nothing until the first chapter turn is reached
//   • Transcript sheet with turn-by-turn navigation (3-line button)

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, StyleSheet,
  ActivityIndicator, Alert, Dimensions, Platform,
  TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { LinearGradient }       from 'expo-linear-gradient';
import { Ionicons }             from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence,
  cancelAnimation, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets }    from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase }             from '../../src/lib/supabase';
import { mapRowToPodcast }      from '../../src/services/podcastOrchestrator';
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
import { AudioEngine }          from '../../src/services/GlobalAudioEngine';
import { CinematicWaveform }    from '../../src/components/podcast/CinematicWaveform';
import { VideoSubtitle }        from '../../src/components/podcast/VideoSubtitle';
import { VideoSpeakerAvatars }  from '../../src/components/podcast/VideoSpeakerAvatars';
import { EpisodeThumbnail }     from '../../src/components/podcast/EpisodeThumbnail';
import { savePlaybackProgress } from '../../src/services/podcastSeriesService';
import { useAuth }              from '../../src/context/AuthContext';
import type { Podcast, PodcastTurn } from '../../src/types';
import type { ChapterMarker }   from '../../src/types/podcast_v2';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS     = [0.75, 1.0, 1.25, 1.5, 2.0];
const CONTROLS_HIDE_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function speakerIsHost(s?: PodcastTurn['speaker'])   { return s === 'host'; }
function speakerIsGuest2(s?: PodcastTurn['speaker']) { return s === 'guest2'; }

function getSpeakerAccent(s?: PodcastTurn['speaker']): string {
  if (s === 'host')   return '#6C63FF';
  if (s === 'guest2') return '#43E97B';
  return '#FF6584';
}

// Returns the current chapter for a given turn index, or null if none reached yet
function getCurrentChapter(
  chapters: ChapterMarker[],
  turnIdx: number,
): ChapterMarker | null {
  if (!chapters?.length) return null;
  let found: ChapterMarker | null = null;
  for (const ch of chapters) {
    if ((ch.startTurnIdx ?? 0) <= turnIdx) found = ch;
  }
  return found;
}

// ─── Animated orb ─────────────────────────────────────────────────────────────

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
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[style, {
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2, backgroundColor: color,
    }]} />
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function VideoProgressBar({ progress, totalDurationMs, currentPositionMs, formatTime, onSeek, chapters, accentColor }: {
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
  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatTime(currentPositionMs)}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {formatTime(totalDurationMs)}
        </Text>
      </View>
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={1}
        style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 4, overflow: 'visible', marginBottom: 20 }}
      >
        <Animated.View style={[fillStyle, { height: '100%', backgroundColor: accentColor, borderRadius: 4 }]} />
        <Animated.View style={[thumbStyle, {
          position: 'absolute', top: -6, width: 20, height: 20, borderRadius: 10,
          backgroundColor: '#FFF', shadowColor: accentColor, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6,
        }]} />
        {barWidth > 0 && chapters.map(ch => {
          if (!ch.timeMs || totalDurationMs <= 0) return null;
          const pct = Math.min(1, ch.timeMs / totalDurationMs);
          const x   = pct * barWidth;
          if (x < 12 || x > barWidth - 12) return null;
          return (
            <View key={ch.id} style={{
              position: 'absolute', left: x - 1.5, top: -3,
              width: 3, height: 14, borderRadius: 1.5,
              backgroundColor: 'rgba(255,255,255,0.6)',
            }} />
          );
        })}
      </TouchableOpacity>
    </View>
  );
}

// ─── Rate selector ────────────────────────────────────────────────────────────

function RateSelector({ current, onSelect, accentColor }: {
  current: number; onSelect: (r: number) => void; accentColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {RATE_OPTIONS.map(r => {
        const active = current === r;
        return (
          <TouchableOpacity key={r} onPress={() => onSelect(r)} style={{
            backgroundColor: active ? `${accentColor}35` : 'rgba(255,255,255,0.08)',
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
            borderWidth: 1, borderColor: active ? accentColor : 'rgba(255,255,255,0.15)',
          }}>
            <Text style={{ color: active ? accentColor : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: active ? '800' : '400' }}>
              {r}×
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Persistent chapter name (above waveform) ─────────────────────────────────
// Shows full chapter title with no truncation. Renders nothing when no chapter
// has been reached yet (i.e. before startTurnIdx of the first chapter).

function ChapterNameBar({ chapter, accentColor }: {
  chapter: ChapterMarker | null;
  accentColor: string;
}) {
  if (!chapter) {
    // Reserve space so layout doesn't jump when first chapter appears
    return <View style={{ height: 32 }} />;
  }
  return (
    <Animated.View
      key={chapter.id}
      entering={FadeIn.duration(300)}
      style={{
        alignItems:        'center',
        paddingHorizontal: 20,
        marginBottom:      2,
      }}
    >
      {/* Bookmark icon + chapter number row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ionicons name="bookmark" size={10} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
          CHAPTER
        </Text>
      </View>
      {/* Full chapter title — no numberOfLines cap */}
      <Text style={{
        color:       '#FFFFFF',
        fontSize:    16,
        fontWeight:  '700',
        textAlign:   'center',
        lineHeight:  22,
        textShadowColor:  'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
      }}>
        {chapter.title}
      </Text>
    </Animated.View>
  );
}

// ─── Transcript sheet ─────────────────────────────────────────────────────────

function PulseDot({ color, delay }: { color: string; delay: number }) {
  const s = useSharedValue(0.5);
  useEffect(() => {
    s.value = withRepeat(withSequence(
      withTiming(1.0, { duration: 380, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.5, { duration: 380, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, { width: 4, height: 4, borderRadius: 2, backgroundColor: color }]} />;
}

interface TranscriptSheetProps {
  turns:            PodcastTurn[];
  currentTurnIndex: number;
  speakers:         { host: string; guest1: string; guest2?: string };
  bottomInset:      number;
  onClose:          () => void;
  onTurnPress:      (index: number) => void;
}

function TranscriptSheet({ turns, currentTurnIndex, speakers, bottomInset, onClose, onTurnPress }: TranscriptSheetProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollRef.current && currentTurnIndex > 1) {
      scrollRef.current.scrollTo({ y: (currentTurnIndex - 1) * 88, animated: true });
    }
  }, [currentTurnIndex]);

  function getSpeakerName(turn: PodcastTurn): string {
    if (turn.speaker === 'host')   return speakers.host;
    if (turn.speaker === 'guest2') return speakers.guest2 ?? 'Guest 2';
    return speakers.guest1;
  }
  function getLabel(turn: PodcastTurn): string {
    if (turn.speaker === 'host')   return 'HOST';
    if (turn.speaker === 'guest2') return 'GUEST 2';
    return 'GUEST';
  }

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFillObject}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <Animated.View
              entering={FadeInDown.duration(340).springify()}
              style={{
                backgroundColor:      '#0E0E22',
                borderTopLeftRadius:  28,
                borderTopRightRadius: 28,
                maxHeight:            SCREEN_H * 0.76,
                borderTopWidth:       1,
                borderTopColor:       'rgba(255,255,255,0.10)',
              }}
            >
              {/* Handle + header */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4, paddingHorizontal: 20 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 14 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View>
                    <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '800' }}>Transcript</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 1 }}>
                      {turns.length} turns · tap any to jump
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20, marginBottom: 4 }} />

              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 24 }}
              >
                {turns.map((turn, idx) => {
                  const isActive = idx === currentTurnIndex;
                  const isPast   = idx < currentTurnIndex;
                  const color    = getSpeakerAccent(turn.speaker);
                  const name     = getSpeakerName(turn);
                  const label    = getLabel(turn);
                  const initials = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => onTurnPress(idx)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
                        borderRadius: 16,
                        backgroundColor: isActive ? `${color}18` : 'rgba(255,255,255,0.03)',
                        borderWidth: 1,
                        borderColor: isActive ? `${color}50` : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {/* Avatar + turn number */}
                      <View style={{ alignItems: 'center', gap: 4, width: 36 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: `${color}22`,
                          borderWidth: isActive ? 1.5 : 0, borderColor: color,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              {[0, 1, 2].map(i => <PulseDot key={i} color={color} delay={i * 140} />)}
                            </View>
                          ) : (
                            <Text style={{ color: isPast ? `${color}80` : `${color}CC`, fontSize: 11, fontWeight: '800' }}>
                              {initials}
                            </Text>
                          )}
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '600' }}>
                          {idx + 1}
                        </Text>
                      </View>

                      {/* Speaker info + text */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Text style={{ color: isActive ? color : `${color}80`, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
                            {label}
                          </Text>
                          <Text style={{ color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' }}>
                            {name}
                          </Text>
                          {isActive && (
                            <View style={{ marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${color}25`, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 }}>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
                              <Text style={{ color, fontSize: 9, fontWeight: '700' }}>NOW</Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={{
                            color: isActive ? 'rgba(255,255,255,0.90)' : isPast ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.55)',
                            fontSize: 13, lineHeight: 20, fontWeight: isActive ? '500' : '400',
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PodcastVideoPlayerScreen() {
  const { podcastId } = useLocalSearchParams<{ podcastId: string }>();
  const { user }      = useAuth();
  const navigation    = useNavigation();
  const insets        = useSafeAreaInsets();

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
      try {
        const { data, error } = await supabase.from('podcasts').select('*').eq('id', podcastId).single();
        if (error || !data) { setLoadError('Could not load this episode.'); return; }
        setPodcast(mapRowToPodcast(data));
      } catch { setLoadError('Failed to load episode.'); }
      finally  { setLoadingPodcast(false); }
    })();
  }, [podcastId]);

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
      if (user) {
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

  // Speaker info
  const speakers = useMemo(() => {
    if (!podcast) return { host: 'Host', guest1: 'Guest', guest2: undefined as string | undefined };
    const g2 = podcast.script?.turns.find(t => t.speaker === 'guest2');
    const g1 = podcast.script?.turns.find(t => t.speaker === 'guest1' || t.speaker === 'guest');
    return {
      host:   podcast.config.hostName ?? 'Host',
      guest1: g1?.speakerName ?? podcast.config.guestName ?? 'Guest',
      guest2: g2?.speakerName ?? undefined,
    };
  }, [podcast]);

  const isHost_     = speakerIsHost(currentTurn?.speaker);
  const isGuest2_   = speakerIsGuest2(currentTurn?.speaker);
  const activeColor = getSpeakerAccent(currentTurn?.speaker);

  const speakerInfos = useMemo(() => {
    const list = [
      { name: speakers.host,   label: 'HOST',    color: '#6C63FF', isActive: speakerIsHost(currentTurn?.speaker) },
      { name: speakers.guest1, label: 'GUEST',   color: '#FF6584', isActive: !speakerIsHost(currentTurn?.speaker) && !speakerIsGuest2(currentTurn?.speaker) },
    ];
    if (speakers.guest2)
      list.push({ name: speakers.guest2, label: 'GUEST 2', color: '#43E97B', isActive: speakerIsGuest2(currentTurn?.speaker) });
    return list;
  }, [speakers, currentTurn]);

  const chapters: ChapterMarker[] = (podcast?.script as any)?.chapters ?? [];
  const turns = podcast?.script?.turns ?? [];

  // Current chapter — persistent, null until first chapter turn reached
  const currentChapter = useMemo(
    () => getCurrentChapter(chapters, playerState.currentTurnIndex),
    [chapters, playerState.currentTurnIndex],
  );

  const bgColors: [string, string, string, string] = ['#06060F', `${activeColor}1A`, `${activeColor}0A`, '#06060F'];
  const durationMin = podcast ? Math.round(podcast.durationSeconds / 60) : 0;

  // Share handlers
  const handleShareMP3 = async () => {
    if (!podcast || shareBusy) return; setShareBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export MP3.'); }
    finally { setShareBusy(null); }
  };
  const handleSharePDF = async () => {
    if (!podcast || shareBusy) return; setShareBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setShareBusy(null); }
  };
  const handleCopy = async () => {
    if (!podcast || shareBusy) return; setShareBusy('copy');
    try {
      await copyPodcastScriptToClipboard(podcast);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2500);
    } catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setShareBusy(null); }
  };

  // ── Loading states ────────────────────────────────────────────────────────

  if (loadingPodcast) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>Loading episode...</Text>
      </View>
    );
  }

  if (loadError || !podcast) {
    return (
      <View style={{ flex: 1, backgroundColor: '#06060F', alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: topInset + 32 }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <Ionicons name="alert-circle-outline" size={48} color="#FF6584" />
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
          {loadError ?? 'Episode not found'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: '#6C63FF', fontSize: 16, fontWeight: '600' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#06060F' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Gradient */}
      <LinearGradient colors={bgColors} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject} />

      {/* Orbs */}
      <Orb x={SCREEN_W * 0.15} y={SCREEN_H * 0.25} size={200} color={activeColor} duration={3200} />
      <Orb x={SCREEN_W * 0.82} y={SCREEN_H * 0.40} size={160} color={activeColor} duration={4000} />
      <Orb x={SCREEN_W * 0.50} y={SCREEN_H * 0.72} size={140} color={activeColor} duration={3600} />

      {/* Main tap layer */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomInset }}>

            {/* ── HEADER ────────────────────────────────────────────────── */}
            {/*
              Layout: [back btn] [flex spacer] [LIVE badge — center] [flex spacer] [menu btn] [share btn]
              Using two equal flex-1 spacers on either side of the badge keeps it
              perfectly centred regardless of how many right-side buttons there are.
            */}
            <View style={s.header}>
              {/* Back */}
              <TouchableOpacity onPress={() => router.back()} onPressIn={resetControlsTimer} style={s.headerBtn}>
                <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>

              {/* Left spacer — pushes badge to true center */}
              <View style={{ flex: 1 }} />

              {/* LIVE / PAUSED badge — true center */}
              <View style={s.liveBadge}>
                <View style={[s.liveDot, { backgroundColor: playerState.isPlaying ? '#FF3B30' : 'rgba(255,255,255,0.3)' }]} />
                <Text style={s.liveText}>
                  {playerState.isPlaying ? 'LIVE' : 'PAUSED'}
                </Text>
              </View>

              {/* Right spacer — mirrors left spacer so badge stays centered */}
              <View style={{ flex: 1 }} />

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowTranscript(true); resetControlsTimer(); }}
                  onPressIn={resetControlsTimer}
                  style={[s.headerBtn, showTranscript && { backgroundColor: `${activeColor}30`, borderColor: `${activeColor}60` }]}
                >
                  <Ionicons name="menu-outline" size={22} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowShare(true); resetControlsTimer(); }} style={s.headerBtn}>
                  <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── MAIN CONTENT ──────────────────────────────────────────── */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>

              {!hasStarted && (
                <Animated.View entering={FadeIn.duration(600)} exiting={FadeOut.duration(400)} style={{ width: '100%' }}>
                  <EpisodeThumbnail
                    title={podcast.title} hostName={speakers.host}
                    guestName={speakers.guest1} durationMin={durationMin}
                    accentColor={activeColor}
                  />
                </Animated.View>
              )}

              {hasStarted && (
                <Animated.View entering={FadeIn.duration(500)} style={{ width: '100%', alignItems: 'center', gap: 20 }}>

                  {/* ── Persistent chapter name ── */}
                  <ChapterNameBar chapter={currentChapter} accentColor={activeColor} />

                  {/* ── Waveform ── */}
                  <CinematicWaveform
                    isPlaying={playerState.isPlaying}
                    color={activeColor}
                    barWidth={4}
                    barGap={3}
                    maxHeight={80}
                  />

                  {/* ── Speaker avatars ── */}
                  <VideoSpeakerAvatars speakers={speakerInfos} />

                  {/* Turn badge */}
                  <View style={s.turnBadge}>
                    <Text style={s.turnBadgeText}>
                      Turn {playerState.currentTurnIndex + 1} of {turns.length}
                      {speakers.guest2 ? '  ·  3 speakers' : ''}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>

            {/* ── BOTTOM PANEL ──────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>

              {/* Subtitles */}
              <VideoSubtitle
                key={playerState.currentTurnIndex}
                text={currentTurn?.text ?? ''}
                speakerName={
                  isHost_   ? speakers.host :
                  isGuest2_ ? (speakers.guest2 ?? speakers.guest1) :
                  speakers.guest1
                }
                speakerColor={activeColor}
                turnIndex={playerState.currentTurnIndex}
                positionMs={playerState.positionMs}
                segmentDurationMs={playerState.segmentDurationMs}
                visible={hasStarted}
                style={{ marginBottom: 12 }}
              />

              {/* Controls */}
              {showControls && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)}>
                  <VideoProgressBar
                    progress={progressPercent}
                    totalDurationMs={playerState.totalDurationMs}
                    currentPositionMs={playerState.totalPositionMs}
                    formatTime={formatTime}
                    onSeek={handleSeek}
                    chapters={chapters}
                    accentColor={activeColor}
                  />

                  {/* Transport */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 14 }}>
                    <TouchableOpacity onPress={() => { skipPrevious(); resetControlsTimer(); }}
                      style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="play-skip-back" size={28} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { togglePlayPause(); resetControlsTimer(); }}
                      disabled={playerState.isLoading}
                      style={{
                        width: 72, height: 72, borderRadius: 36, backgroundColor: activeColor,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: activeColor, shadowOpacity: 0.75, shadowRadius: 22, elevation: 12,
                      }}
                    >
                      {playerState.isLoading
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Ionicons
                            name={playerState.isPlaying ? 'pause' : 'play'}
                            size={30} color="#FFF"
                            style={{ marginLeft: playerState.isPlaying ? 0 : 3 }}
                          />}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => { skipNext(); resetControlsTimer(); }}
                      style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="play-skip-forward" size={28} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  </View>

                  <RateSelector
                    current={playerState.playbackRate}
                    onSelect={r => { setPlaybackRate(r); resetControlsTimer(); }}
                    accentColor={activeColor}
                  />
                </Animated.View>
              )}

              {/* Episode title — full text, no truncation */}
              <Text style={{
                color: 'rgba(255,255,255,0.40)', fontSize: 12, textAlign: 'center',
                marginTop: 10, fontWeight: '500', lineHeight: 18, paddingHorizontal: 8,
              }}>
                {podcast.title}
              </Text>
            </View>

          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* ── Transcript sheet ──────────────────────────────────────────────── */}
      {showTranscript && (
        <TranscriptSheet
          turns={turns}
          currentTurnIndex={playerState.currentTurnIndex}
          speakers={speakers}
          bottomInset={bottomInset}
          onClose={() => setShowTranscript(false)}
          onTurnPress={handleTurnPress}
        />
      )}

      {/* ── Share sheet ───────────────────────────────────────────────────── */}
      {showShare && (
        <TouchableWithoutFeedback onPress={() => setShowShare(false)}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                entering={FadeInDown.duration(350).springify()}
                style={{
                  backgroundColor: '#111128', borderTopLeftRadius: 28, borderTopRightRadius: 28,
                  padding: 24, paddingBottom: Math.max(bottomInset + 16, 40),
                  borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
                }}
              >
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 }} />
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 4 }}>Share Episode</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 20 }}>{podcast.title}</Text>

                {([
                  { id: 'mp3',  icon: 'musical-notes-outline',  label: 'Share as MP3',      sub: 'Export full episode audio', color: '#6C63FF', onPress: handleShareMP3, disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length) },
                  { id: 'pdf',  icon: 'document-text-outline',  label: 'Export PDF Script', sub: 'Styled transcript',         color: '#FF6584', onPress: handleSharePDF, disabled: false },
                  { id: 'copy', icon: shareCopied ? 'checkmark-circle-outline' : 'copy-outline', label: shareCopied ? 'Copied!' : 'Copy Script', sub: 'Plain text to clipboard', color: '#43E97B', onPress: handleCopy, disabled: false },
                ] as const).map(opt => (
                  <TouchableOpacity key={opt.id} onPress={opt.disabled ? undefined : opt.onPress}
                    activeOpacity={opt.disabled ? 1 : 0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
                      backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 10,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', opacity: opt.disabled ? 0.35 : 1,
                    }}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${opt.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      {shareBusy === opt.id
                        ? <ActivityIndicator size="small" color={opt.color} />
                        : <Ionicons name={opt.icon as any} size={22} color={opt.color} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>{opt.label}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {!shareBusy && !opt.disabled && <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity onPress={() => setShowShare(false)}
                  style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
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
    width:           44,
    height:          44,
    borderRadius:    14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
  },
  liveBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   'rgba(0,0,0,0.40)',
    borderRadius:      20,
    paddingVertical:   5,
    paddingHorizontal: 14,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  liveText: {
    color:         'rgba(255,255,255,0.85)',
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 0.6,
  },
  turnBadge: {
    backgroundColor:   'rgba(0,0,0,0.35)',
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
    paddingVertical:   5,
    paddingHorizontal: 14,
  },
  turnBadgeText: {
    color:      'rgba(255,255,255,0.5)',
    fontSize:   11,
    fontWeight: '600',
  },
});