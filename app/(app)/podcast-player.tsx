// app/(app)/podcast-player.tsx
// Part 39 FIX v4:
//
// CHANGE 1 — MiniPlayerBus subscription simplified:
//   'toggle' is now handled globally in _layout.tsx via toggleGlobalAudio().
//   This screen only needs to handle 'dismiss' (to call stopPlayback() for
//   its own cleanup while mounted). No double-handling: the mini player is
//   hidden when this screen is active, so 'toggle' can never be emitted
//   while both this subscription AND _layout's subscription are active.
//
// CHANGE 2 — detachScreen() called unconditionally on back:
//   Previously guarded by a stale playerState.isPlaying check. Now always
//   called — detachScreen() reads LIVE audio status from the Sound object.
//
// All Part 39 features preserved: series, chapters, cloud audio, progress save.

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Alert, Dimensions,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import { BlurView }                     from 'expo-blur';
import Animated, {
  FadeIn, FadeInDown, useSharedValue,
  useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }                     from '../../src/lib/supabase';
import { mapRowToPodcast }              from '../../src/services/podcastOrchestrator';
import {
  exportPodcastAsMP3,
  exportPodcastAsPDF,
  copyPodcastScriptToClipboard,
} from '../../src/services/podcastExport';
import { usePodcastPlayer }             from '../../src/hooks/usePodcastPlayer';
import { useMiniPlayerContext }         from '../../src/context/MiniPlayerContext';
import { WaveformVisualizer }           from '../../src/components/podcast/WaveformVisualizer';
import { SharePodcastToWorkspaceModal } from '../../src/components/workspace/SharePodcastToWorkspaceModal';
import { EpisodeArtwork }              from '../../src/components/podcast/EpisodeArtwork';
import { ChapterMarkers }               from '../../src/components/podcast/ChapterMarkers';
import { MiniPlayerBus }                from '../../src/components/podcast/MiniPlayer';
import { usePodcastSeries }             from '../../src/hooks/usePodcastSeries';
import { savePlaybackProgress }         from '../../src/services/podcastSeriesService';
import { useAuth }                      from '../../src/context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import type { Podcast, PodcastTurn }    from '../../src/types';
import type { ChapterMarker }           from '../../src/types/podcast_v2';

const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Speaker role helpers ──────────────────────────────────────────────────────

function speakerIsHost(s?: PodcastTurn['speaker']): boolean   { return s === 'host'; }
function speakerIsGuest2(s?: PodcastTurn['speaker']): boolean { return s === 'guest2'; }
function speakerIsGuest1(s?: PodcastTurn['speaker']): boolean {
  return s === 'guest' || s === 'guest1';
}

// ─── Export Share Sheet ────────────────────────────────────────────────────────

function ExportShareSheet({
  podcast, visible, onClose,
}: { podcast: Podcast | null; visible: boolean; onClose: () => void }) {
  const [busy, setBusy]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (visible) { setBusy(null); setCopied(false); } }, [visible]);

  const handleMP3 = async () => {
    if (!podcast || busy) return; setBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export MP3.'); }
    finally { setBusy(null); }
  };
  const handlePDF = async () => {
    if (!podcast || busy) return; setBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setBusy(null); }
  };
  const handleCopy = async () => {
    if (!podcast || busy) return; setBusy('copy');
    try {
      await copyPodcastScriptToClipboard(podcast);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setBusy(null); }
  };

  if (!podcast) return null;

  const options = [
    {
      id: 'mp3', icon: 'musical-notes-outline', label: 'Share as MP3',
      sublabel: 'Export full episode audio', color: COLORS.primary,
      onPress: handleMP3,
      disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length),
    },
    {
      id: 'pdf', icon: 'document-text-outline', label: 'Export PDF Script',
      sublabel: 'Styled transcript', color: COLORS.secondary,
      onPress: handlePDF, disabled: false,
    },
    {
      id: 'copy',
      icon: copied ? 'checkmark-circle-outline' : 'copy-outline',
      label: copied ? 'Copied!' : 'Copy Script',
      sublabel: 'Plain text to clipboard', color: COLORS.accent,
      onPress: handleCopy, disabled: false,
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.65)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28,
          borderTopRightRadius: 28, padding: SPACING.xl,
          borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.xl + 8,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Share Episode</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }} numberOfLines={1}>{podcast.title}</Text>
          </View>
          {options.map(opt => (
            <TouchableOpacity key={opt.id} onPress={opt.disabled ? undefined : opt.onPress}
              activeOpacity={opt.disabled ? 1 : 0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                padding: SPACING.md, backgroundColor: COLORS.backgroundElevated,
                borderRadius: RADIUS.lg, marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: COLORS.border, opacity: opt.disabled ? 0.35 : 1,
              }}>
              <View style={{
                width: 44, height: 44, borderRadius: 13,
                backgroundColor: `${opt.color}18`, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: `${opt.color}25`,
              }}>
                {busy === opt.id
                  ? <ActivityIndicator size="small" color={opt.color} />
                  : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>{opt.label}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{opt.sublabel}</Text>
              </View>
              {!busy && !opt.disabled && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Speaker Avatar ────────────────────────────────────────────────────────────

function SpeakerAvatar({ name, isActive, color }: { name: string; isActive: boolean; color: string }) {
  const scale  = useSharedValue(isActive ? 1 : 0.85);
  const border = useSharedValue(isActive ? 1.5 : 0);

  useEffect(() => {
    scale.value  = withSpring(isActive ? 1.0 : 0.85, { damping: 12 });
    border.value = withTiming(isActive ? 1.5 : 0, { duration: 300 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform:   [{ scale: scale.value }],
    borderWidth: border.value,
  }));

  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Animated.View style={[{
      width: 54, height: 54, borderRadius: 17,
      backgroundColor: `${color}20`,
      alignItems: 'center', justifyContent: 'center',
      borderColor: color,
    }, animStyle]}>
      <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
        {initials}
      </Text>
    </Animated.View>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  progress, onSeek, totalDurationMs, currentPositionMs, formatTime, chapters,
}: {
  progress: number; onSeek: (p: number) => void;
  totalDurationMs: number; currentPositionMs: number;
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
    <View>
      <ChapterMarkers
        chapters={chapters}
        totalDurationMs={totalDurationMs}
        currentPositionMs={currentPositionMs}
        barWidth={barWidth}
        barHeight={5}
      />
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={0.9}
        style={{
          height: 5, backgroundColor: COLORS.backgroundElevated,
          borderRadius: 3, overflow: 'hidden', marginBottom: 10, marginTop: 4,
        }}
      >
        <Animated.View style={[fillStyle, { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 }]} />
        {barWidth > 0 && chapters.map(ch => {
          if (!ch.timeMs || totalDurationMs <= 0) return null;
          const pct = Math.min(1, ch.timeMs / totalDurationMs);
          const x   = pct * barWidth;
          if (x < 4 || x > barWidth - 4) return null;
          return (
            <View key={ch.id} style={{
              position: 'absolute', left: x - 1, top: -2,
              width: 2, height: 9, borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.6)',
            }} />
          );
        })}
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(currentPositionMs)}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(totalDurationMs)}</Text>
      </View>
    </View>
  );
}

// ─── Transcript Row ────────────────────────────────────────────────────────────

function TranscriptRow({
  turn, isActive, speakers, onPress,
}: {
  turn: PodcastTurn; isActive: boolean;
  speakers: { host: string; guest1: string; guest2?: string };
  onPress: () => void;
}) {
  const isHost_   = speakerIsHost(turn.speaker);
  const isGuest2_ = speakerIsGuest2(turn.speaker);
  const color     = isHost_ ? COLORS.primary : isGuest2_ ? '#43E97B' : COLORS.secondary;
  const name      = isHost_
    ? speakers.host
    : isGuest2_
    ? (speakers.guest2 ?? speakers.guest1)
    : speakers.guest1;

  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: 'row', gap: 12, paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        backgroundColor: isActive ? `${color}12` : 'transparent',
        borderRadius: RADIUS.lg,
        borderLeftWidth: isActive ? 3 : 0, borderLeftColor: color,
        marginBottom: 4,
      }}
    >
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{
          color: isActive ? color : COLORS.textMuted,
          fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center',
        }}>
          {name}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
          fontSize: FONTS.sizes.sm, lineHeight: 20,
          fontWeight: isActive ? '500' : '400',
        }}>
          {turn.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Add to Series Sheet ───────────────────────────────────────────────────────

function AddToSeriesSheet({
  visible, podcast, onClose,
}: { visible: boolean; podcast: Podcast | null; onClose: () => void }) {
  const { series, loading, addEpisode } = usePodcastSeries();
  const [saving, setSaving]             = useState<string | null>(null);

  if (!podcast) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.7)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28,
          borderTopRightRadius: 28, padding: SPACING.xl,
          borderTopWidth: 1, borderTopColor: COLORS.border, maxHeight: '60%',
          paddingBottom: SPACING.xl + 8,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginBottom: SPACING.md }}>
            Add to Series
          </Text>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : series.length === 0 ? (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.xl }}>
              No series yet. Create one from the Podcast tab.
            </Text>
          ) : (
            series.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={async () => {
                  setSaving(s.id);
                  await addEpisode(podcast.id, s.id, s.episodeCount + 1);
                  setSaving(null);
                  onClose();
                  Alert.alert('Added!', `Episode added to "${s.name}" as Episode ${s.episodeCount + 1}.`);
                }}
                disabled={saving === s.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: SPACING.md, backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg, marginBottom: SPACING.sm,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: `${s.accentColor}20`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={(s.iconName ?? 'radio-outline') as any} size={18} color={s.accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{s.name}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{s.episodeCount} episodes</Text>
                </View>
                {saving === s.id
                  ? <ActivityIndicator size="small" color={s.accentColor} />
                  : <Ionicons name="add-circle-outline" size={22} color={s.accentColor} />}
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function PodcastPlayerScreen() {
  const { podcastId }  = useLocalSearchParams<{ podcastId: string }>();
  const { user }       = useAuth();

  const { getMiniPlayerUpdater, hideMiniPlayer } = useMiniPlayerContext();

  const miniPlayerUpdater = useRef(getMiniPlayerUpdater());
  useEffect(() => {
    miniPlayerUpdater.current = getMiniPlayerUpdater();
  }, [getMiniPlayerUpdater]);

  type MiniPlayerPartial = Parameters<ReturnType<typeof getMiniPlayerUpdater>>[0];

  const [podcast,            setPodcast]            = useState<Podcast | null>(null);
  const [loadingPodcast,     setLoadingPodcast]     = useState(true);
  const [loadError,          setLoadError]          = useState<string | null>(null);
  const [hasStarted,         setHasStarted]         = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [wsShareVisible,     setWsShareVisible]     = useState(false);
  const [seriesSheetVisible, setSeriesSheetVisible] = useState(false);
  const [sharedToast,        setSharedToast]        = useState<string | null>(null);

  const transcriptRef   = useRef<FlatList>(null);
  const progressSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load podcast ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!podcastId) { setLoadError('No podcast ID provided.'); setLoadingPodcast(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('podcasts').select('*').eq('id', podcastId).single();
        if (error || !data) { setLoadError('Could not load this episode.'); return; }
        setPodcast(mapRowToPodcast(data));
      } catch { setLoadError('Failed to load episode.'); }
      finally   { setLoadingPodcast(false); }
    })();
  }, [podcastId]);

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, resumeFrom, togglePlayPause,
    skipNext, skipPrevious, skipToTurn,
    setPlaybackRate, stopPlayback, detachScreen, formatTime,
  } = usePodcastPlayer(
    podcast,
    useCallback((partial: MiniPlayerPartial) => {
      miniPlayerUpdater.current(partial);
    }, []),
  );

  // ── Mini player bus subscription ───────────────────────────────────────────────
  // CHANGE 1: Only subscribe to 'dismiss' here.
  // 'toggle' is now handled globally in _layout.tsx via toggleGlobalAudio().
  // This avoids the scenario where podcast-player.tsx is not mounted and
  // the toggle event has no handler.
  useEffect(() => {
    const unsub = MiniPlayerBus.subscribe((event: string) => {
      if (event === 'dismiss') {
        // Full cleanup: unload audio, hide mini player
        stopPlayback();
        hideMiniPlayer();
      }
    });
    return unsub;
  }, [stopPlayback, hideMiniPlayer]);

  // ── Auto-start with continue listening resume ──────────────────────────────────
  useEffect(() => {
    if (!podcast || loadingPodcast || hasStarted) return;
    setHasStarted(true);

    (async () => {
      if (user) {
        try {
          const { data } = await supabase
            .from('podcast_playback_progress')
            .select('last_turn_idx, progress_percent')
            .eq('user_id', user.id)
            .eq('podcast_id', podcast.id)
            .maybeSingle();

          if (data && data.last_turn_idx > 0 && (data.progress_percent ?? 0) < 95) {
            await resumeFrom(data.last_turn_idx);
            return;
          }
        } catch {
          // Non-fatal
        }
      }
      await startPlayback();
    })();
  }, [podcast, loadingPodcast, hasStarted, user]);

  // ── Scroll transcript to active turn ──────────────────────────────────────────
  useEffect(() => {
    const idx = playerState.currentTurnIndex;
    if (idx >= 0 && transcriptRef.current) {
      try {
        transcriptRef.current.scrollToIndex({
          index: idx, animated: true, viewOffset: 60, viewPosition: 0.3,
        });
      } catch {}
    }
  }, [playerState.currentTurnIndex]);

  // ── Auto-save progress every 10s ──────────────────────────────────────────────
  useEffect(() => {
    if (!podcast || !user || !playerState.isPlaying) return;
    if (progressSaveRef.current) clearInterval(progressSaveRef.current);

    progressSaveRef.current = setInterval(() => {
      savePlaybackProgress(
        user.id, podcast.id,
        playerState.currentTurnIndex,
        playerState.totalPositionMs,
        playerState.totalDurationMs,
      );
    }, 10000);

    return () => { if (progressSaveRef.current) clearInterval(progressSaveRef.current); };
  }, [podcast?.id, user?.id, playerState.isPlaying, playerState.currentTurnIndex]);

  // ── Save on unmount ────────────────────────────────────────────────────────────
  const playerStateRef = useRef(playerState);
  const podcastRef2    = useRef(podcast);
  const userRef        = useRef(user);
  useEffect(() => { playerStateRef.current = playerState; }, [playerState]);
  useEffect(() => { podcastRef2.current    = podcast;      }, [podcast]);
  useEffect(() => { userRef.current        = user;         }, [user]);

  useEffect(() => {
    return () => {
      const ps = playerStateRef.current;
      const p  = podcastRef2.current;
      const u  = userRef.current;
      if (p && u && ps.totalPositionMs > 0) {
        savePlaybackProgress(
          u.id, p.id,
          ps.currentTurnIndex,
          ps.totalPositionMs,
          ps.totalDurationMs,
        );
      }
    };
  }, []);

  // ── handleBack — detach unconditionally ───────────────────────────────────────
  // CHANGE 2: Always call detachScreen() — it reads LIVE audio status internally.
  // Do NOT guard with playerState.isPlaying (stale closure).
  const handleBack = useCallback(async () => {
    const ps = playerStateRef.current;
    const p  = podcastRef2.current;
    const u  = userRef.current;
    if (p && u && ps.totalPositionMs > 0) {
      savePlaybackProgress(u.id, p.id, ps.currentTurnIndex, ps.totalPositionMs, ps.totalDurationMs);
    }

    // Always detach — sets globalKeepAlive = true, reads live audio status,
    // pushes mini player state so it appears immediately after navigation.
    await detachScreen();

    router.back();
  }, [detachScreen]);

  const handleSeek = useCallback((percent: number) => {
    if (!podcast) return;
    const turns    = podcast.script?.turns ?? [];
    const targetMs = percent * playerState.totalDurationMs;
    let cumMs = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cumMs + dur >= targetMs || i === turns.length - 1) { skipToTurn(i); break; }
      cumMs += dur;
    }
  }, [podcast, playerState.totalDurationMs, skipToTurn]);

  const handleSharedToWorkspace = useCallback((_id: string, name: string) => {
    setSharedToast(`Shared to "${name}"`);
    setTimeout(() => setSharedToast(null), 3000);
  }, []);

  const isPlayingFromCloud = (() => {
    if (!podcast) return false;
    const localPath = podcast.audioSegmentPaths?.[playerState.currentTurnIndex] ?? '';
    return !localPath || localPath.startsWith('http');
  })();

  const chapters: ChapterMarker[] = (podcast?.script as any)?.chapters ?? [];

  const speakers = useMemo(() => {
    if (!podcast) return { host: 'Host', guest1: 'Guest', guest2: undefined as string | undefined };
    const guest2Turn = podcast.script?.turns.find(t => t.speaker === 'guest2');
    const guest1Turn = podcast.script?.turns.find(t => t.speaker === 'guest1' || t.speaker === 'guest');
    return {
      host:   podcast.config.hostName  ?? 'Host',
      guest1: guest1Turn?.speakerName  ?? podcast.config.guestName ?? 'Guest',
      guest2: guest2Turn?.speakerName  ?? undefined,
    };
  }, [podcast]);

  const isHost_   = speakerIsHost(currentTurn?.speaker);
  const isGuest2_ = speakerIsGuest2(currentTurn?.speaker);
  const activeColor = isHost_ ? COLORS.primary : isGuest2_ ? '#43E97B' : COLORS.secondary;

  const turns = podcast?.script?.turns ?? [];

  // ── Loading / error states ─────────────────────────────────────────────────────
  if (loadingPodcast) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textMuted, marginTop: SPACING.md, fontSize: FONTS.sizes.sm }}>
            Loading episode...
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (loadError || !podcast) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
            {loadError ?? 'Episode not found'}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.xl }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>← Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border,
            }}
          >
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: SPACING.md }}>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1,
            }}>Now Playing</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => setSeriesSheetVisible(true)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: `${COLORS.accent}15`,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: `${COLORS.accent}30`,
              }}
            >
              <Ionicons name="albums-outline" size={18} color={COLORS.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWsShareVisible(true)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: `${COLORS.secondary}15`,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: `${COLORS.secondary}30`,
              }}
            >
              <Ionicons name="people-outline" size={18} color={COLORS.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setExportSheetVisible(true)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Shared toast */}
        {sharedToast && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{
              marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
              backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.lg,
              paddingHorizontal: SPACING.md, paddingVertical: 8,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              borderWidth: 1, borderColor: `${COLORS.success}30`,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>
              {sharedToast}
            </Text>
          </Animated.View>
        )}

        {/* ── Player Card ── */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(50)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}
        >
          <LinearGradient
            colors={['#1A1A35', '#0F0F28']}
            style={{
              borderRadius: RADIUS.xl, padding: SPACING.lg,
              borderWidth: 1, borderColor: `${activeColor}25`, alignItems: 'center',
            }}
          >
            {/* Cloud indicator */}
            {isPlayingFromCloud && (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: `${COLORS.info}12`, borderRadius: RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 4, marginBottom: SPACING.sm,
                  borderWidth: 1, borderColor: `${COLORS.info}25`,
                }}
              >
                <Ionicons name="cloud-outline" size={11} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '700' }}>Streaming from cloud</Text>
              </Animated.View>
            )}

            {/* Artwork + waveform */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
              <EpisodeArtwork title={podcast.title} size={64} borderRadius={18} />
              <WaveformVisualizer
                isPlaying={playerState.isPlaying}
                color={activeColor}
                barWidth={5} barGap={4} maxHeight={44}
              />
            </View>

            {/* Speaker avatars */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end',
              justifyContent: 'center',
              gap: speakers.guest2 ? SPACING.md : SPACING.lg,
              marginBottom: SPACING.sm,
            }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <SpeakerAvatar name={speakers.host} isActive={speakerIsHost(currentTurn?.speaker)} color={COLORS.primary} />
                <Text style={{ color: speakerIsHost(currentTurn?.speaker) ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{speakers.host}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>HOST</Text>
              </View>

              <View style={{ alignItems: 'center', gap: 4 }}>
                <SpeakerAvatar name={speakers.guest1} isActive={speakerIsGuest1(currentTurn?.speaker)} color={COLORS.secondary} />
                <Text style={{ color: speakerIsGuest1(currentTurn?.speaker) ? COLORS.secondary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{speakers.guest1}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>GUEST</Text>
              </View>

              {speakers.guest2 && (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <SpeakerAvatar name={speakers.guest2} isActive={speakerIsGuest2(currentTurn?.speaker)} color="#43E97B" />
                  <Text style={{ color: speakerIsGuest2(currentTurn?.speaker) ? '#43E97B' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{speakers.guest2}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>GUEST 2</Text>
                </View>
              )}
            </View>

            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', textAlign: 'center', marginBottom: 2, width: '100%' }}>
              {podcast.title}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.md }}>
              Turn {playerState.currentTurnIndex + 1} of {turns.length}
              {speakers.guest2 ? ' · 3 speakers' : ''}
            </Text>

            {/* Progress bar */}
            <View style={{ width: '100%', marginBottom: SPACING.md }}>
              <ProgressBar
                progress={progressPercent}
                onSeek={handleSeek}
                totalDurationMs={playerState.totalDurationMs}
                currentPositionMs={playerState.totalPositionMs}
                formatTime={formatTime}
                chapters={chapters}
              />
            </View>

            {/* Controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
              <TouchableOpacity onPress={skipPrevious} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-skip-back" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={togglePlayPause} disabled={playerState.isLoading}
                style={{
                  width: 60, height: 60, borderRadius: 30,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
                }}
              >
                {playerState.isLoading
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={24} color="#FFF" style={{ marginLeft: playerState.isPlaying ? 0 : 2 }} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={skipNext} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-skip-forward" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Rate controls */}
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {RATE_OPTIONS.map(rate => {
                const isActive = playerState.playbackRate === rate;
                return (
                  <TouchableOpacity key={rate} onPress={() => setPlaybackRate(rate)}
                    style={{
                      backgroundColor: isActive ? `${COLORS.primary}25` : COLORS.backgroundElevated,
                      borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4,
                      borderWidth: 1, borderColor: isActive ? COLORS.primary : COLORS.border,
                    }}
                  >
                    <Text style={{ color: isActive ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '700' : '400' }}>
                      {rate}×
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Transcript ── */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(150)}
          style={{ flex: 1, paddingHorizontal: SPACING.xl }}
        >
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
            Transcript
          </Text>
          <View style={{
            flex: 1, backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border,
            overflow: 'hidden', maxHeight: SCREEN_HEIGHT * 0.4,
          }}>
            <FlatList
              ref={transcriptRef}
              data={turns}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}
              showsVerticalScrollIndicator
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => (
                <TranscriptRow
                  turn={item}
                  isActive={index === playerState.currentTurnIndex}
                  speakers={speakers}
                  onPress={() => skipToTurn(index)}
                />
              )}
            />
          </View>
        </Animated.View>

        <View style={{ height: SPACING.md }} />
      </SafeAreaView>

      {/* ── Modals ── */}
      <ExportShareSheet
        podcast={podcast} visible={exportSheetVisible}
        onClose={() => setExportSheetVisible(false)}
      />
      <AddToSeriesSheet
        visible={seriesSheetVisible} podcast={podcast}
        onClose={() => setSeriesSheetVisible(false)}
      />
      {podcast && (
        <SharePodcastToWorkspaceModal
          visible={wsShareVisible}
          podcastId={podcast.id}
          reportId={podcast.reportId}
          title={podcast.title}
          hostName={podcast.config.hostName}
          guestName={podcast.config.guestName}
          durationSeconds={podcast.durationSeconds}
          onClose={() => setWsShareVisible(false)}
          onShared={handleSharedToWorkspace}
        />
      )}
    </LinearGradient>
  );
}