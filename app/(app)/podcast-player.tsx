// app/(app)/podcast-player.tsx
// Part 25 — Updated
//
// CHANGE: Cross-device cloud audio indicator.
//   When audio is being streamed from Supabase Storage (not local file),
//   a subtle "☁ Cloud Audio" badge appears in the player card header.
//   This reassures the user that audio is working even on a new device.
//
// ALL PART 15 FUNCTIONALITY PRESERVED:
//   Playback controls, transcript, export sheet, workspace share modal.

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Alert, Dimensions,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import { BlurView }                     from 'expo-blur';
import Animated, {
  FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming,
}                                       from 'react-native-reanimated';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }                     from '../../src/lib/supabase';
import { mapRowToPodcast }              from '../../src/services/podcastOrchestrator';
import {
  exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard,
}                                       from '../../src/services/podcastExport';
import { usePodcastPlayer }             from '../../src/hooks/usePodcastPlayer';
import { WaveformVisualizer }           from '../../src/components/podcast/WaveformVisualizer';
import { SharePodcastToWorkspaceModal } from '../../src/components/workspace/SharePodcastToWorkspaceModal';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { Podcast, PodcastTurn }         from '../../src/types';

const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Export Share Sheet ───────────────────────────────────────────────────────

function ExportShareSheet({ podcast, visible, onClose }: { podcast: Podcast | null; visible: boolean; onClose: () => void }) {
  const [busy, setBusy]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (visible) { setBusy(null); setCopied(false); } }, [visible]);

  const handleMP3 = async () => {
    if (!podcast || busy) return;
    setBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export MP3.'); }
    finally { setBusy(null); }
  };

  const handlePDF = async () => {
    if (!podcast || busy) return;
    setBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setBusy(null); }
  };

  const handleCopy = async () => {
    if (!podcast || busy) return;
    setBusy('copy');
    try {
      await copyPodcastScriptToClipboard(podcast);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setBusy(null); }
  };

  if (!podcast) return null;

  const options = [
    { id: 'mp3',  icon: 'musical-notes-outline', label: 'Share as MP3',      sublabel: 'Export full episode audio file',   color: COLORS.primary,   onPress: handleMP3,  disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length) },
    { id: 'pdf',  icon: 'document-text-outline', label: 'Export PDF Script', sublabel: 'Styled transcript with all turns',  color: COLORS.secondary, onPress: handlePDF,  disabled: false },
    { id: 'copy', icon: copied ? 'checkmark-circle-outline' : 'copy-outline', label: copied ? 'Copied!' : 'Copy Script', sublabel: 'Plain text transcript', color: COLORS.accent, onPress: handleCopy, disabled: false },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.65)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.xl + 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Share Episode</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }} numberOfLines={1}>{podcast.title}</Text>
          </View>
          {options.map(opt => (
            <TouchableOpacity key={opt.id} onPress={opt.disabled ? undefined : opt.onPress} activeOpacity={opt.disabled ? 1 : 0.75}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: opt.disabled ? 0.35 : 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${opt.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${opt.color}25` }}>
                {busy === opt.id ? <ActivityIndicator size="small" color={opt.color} /> : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
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

// ─── Speaker Avatar ───────────────────────────────────────────────────────────

function SpeakerAvatar({ name, isActive, color }: { name: string; isActive: boolean; color: string }) {
  const scale  = useSharedValue(isActive ? 1 : 0.88);
  const border = useSharedValue(isActive ? 1.5 : 0);
  useEffect(() => {
    scale.value  = withTiming(isActive ? 1.0 : 0.88, { duration: 300 });
    border.value = withTiming(isActive ? 1.5 : 0,    { duration: 300 });
  }, [isActive]);
  const animStyle   = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], borderWidth: border.value }));
  const initials    = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Animated.View style={[{ width: isActive ? 64 : 52, height: isActive ? 64 : 52, borderRadius: isActive ? 20 : 16, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center', borderColor: color }, animStyle]}>
      <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: isActive ? FONTS.sizes.lg : FONTS.sizes.md, fontWeight: '800' }}>{initials}</Text>
    </Animated.View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, onSeek, totalDurationMs, currentPositionMs, formatTime }: {
  progress: number; onSeek: (p: number) => void; totalDurationMs: number; currentPositionMs: number; formatTime: (ms: number) => string;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const fillWidth = useSharedValue(0);
  useEffect(() => { fillWidth.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 150 }); }, [progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillWidth.value * 100}%` as any }));
  return (
    <View>
      <TouchableOpacity onLayout={e => setBarWidth(e.nativeEvent.layout.width)} onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }} activeOpacity={0.9}
        style={{ height: 5, backgroundColor: COLORS.backgroundElevated, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <Animated.View style={[fillStyle, { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 }]} />
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(currentPositionMs)}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(totalDurationMs)}</Text>
      </View>
    </View>
  );
}

// ─── Transcript Turn Row ──────────────────────────────────────────────────────

function TranscriptRow({ turn, isActive, hostName, guestName, onPress }: {
  turn: PodcastTurn; isActive: boolean; hostName: string; guestName: string; onPress: () => void;
}) {
  const isHost = turn.speaker === 'host';
  const color  = isHost ? COLORS.primary : COLORS.secondary;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', gap: 12, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, backgroundColor: isActive ? `${color}12` : 'transparent', borderRadius: RADIUS.lg, borderLeftWidth: isActive ? 3 : 0, borderLeftColor: color, marginBottom: 4 }}>
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center' }}>
          {isHost ? hostName : guestName}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isActive ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, fontWeight: isActive ? '500' : '400' }}>
          {turn.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PodcastPlayerScreen() {
  const { podcastId } = useLocalSearchParams<{ podcastId: string }>();

  const [podcast,        setPodcast]        = useState<Podcast | null>(null);
  const [loadingPodcast, setLoadingPodcast] = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [hasStarted,     setHasStarted]     = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [wsShareVisible,     setWsShareVisible]     = useState(false);
  const [sharedToast,        setSharedToast]        = useState<string | null>(null);

  const transcriptRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!podcastId) { setLoadError('No podcast ID provided.'); setLoadingPodcast(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase.from('podcasts').select('*').eq('id', podcastId).single();
        if (error || !data) { setLoadError('Could not load this episode. Please try again.'); return; }
        setPodcast(mapRowToPodcast(data));
      } catch { setLoadError('Failed to load episode.'); }
      finally { setLoadingPodcast(false); }
    })();
  }, [podcastId]);

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipNext, skipPrevious,
    skipToTurn, setPlaybackRate, stopPlayback, formatTime,
  } = usePodcastPlayer(podcast);

  useEffect(() => {
    if (podcast && !loadingPodcast && !hasStarted) { setHasStarted(true); startPlayback(); }
  }, [podcast, loadingPodcast]);

  useEffect(() => {
    const idx = playerState.currentTurnIndex;
    if (idx >= 0 && transcriptRef.current) {
      try { transcriptRef.current.scrollToIndex({ index: idx, animated: true, viewOffset: 60, viewPosition: 0.3 }); } catch {}
    }
  }, [playerState.currentTurnIndex]);

  const handleBack = useCallback(async () => { await stopPlayback(); router.back(); }, [stopPlayback]);

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

  const handleSharedToWorkspace = useCallback((workspaceId: string, workspaceName: string) => {
    setSharedToast(`Shared to "${workspaceName}"`);
    setTimeout(() => setSharedToast(null), 3000);
  }, []);

  // Part 25: detect if we're playing from cloud (no local file)
  const isPlayingFromCloud = (() => {
    if (!podcast) return false;
    const idx       = playerState.currentTurnIndex;
    const localPath = podcast.audioSegmentPaths?.[idx] ?? '';
    const isLocal   = localPath && !localPath.startsWith('http');
    const hasCloud  = !!(podcast as any).audioStorageUrls?.[idx];
    return !isLocal && hasCloud;
  })();

  if (loadingPodcast) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textMuted, marginTop: SPACING.md, fontSize: FONTS.sizes.sm }}>Loading episode...</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (loadError || !podcast) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>{loadError ?? 'Episode not found'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.xl }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>← Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const turns      = podcast.script?.turns ?? [];
  const isHost     = currentTurn?.speaker !== 'guest';
  const hostColor  = COLORS.primary;
  const guestColor = COLORS.secondary;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md }}>
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: SPACING.md }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Now Playing</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {/* Share to workspace */}
            <TouchableOpacity onPress={() => setWsShareVisible(true)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${'#FF6584'}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${'#FF6584'}30` }}>
              <Ionicons name="people-outline" size={18} color="#FF6584" />
            </TouchableOpacity>
            {/* Export share sheet */}
            <TouchableOpacity onPress={() => setExportSheetVisible(true)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Shared toast */}
        {sharedToast && (
          <Animated.View entering={FadeIn.duration(300)} style={{ marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.success}30` }}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>{sharedToast}</Text>
          </Animated.View>
        )}

        {/* ── Player Card ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)} style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
          <LinearGradient colors={['#1A1A35', '#0F0F28']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25`, alignItems: 'center' }}>

            {/* Part 25: Cloud audio indicator */}
            {isPlayingFromCloud && (
              <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${COLORS.info}12`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.info}25` }}>
                <Ionicons name="cloud-outline" size={11} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '700' }}>Streaming from cloud</Text>
              </Animated.View>
            )}

            <View style={{ marginBottom: SPACING.lg }}>
              <WaveformVisualizer isPlaying={playerState.isPlaying} color={isHost ? hostColor : guestColor} barWidth={6} barGap={4} maxHeight={48} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <SpeakerAvatar name={podcast.config.hostName}  isActive={currentTurn?.speaker === 'host'}  color={hostColor} />
                <Text style={{ color: currentTurn?.speaker === 'host'  ? hostColor  : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{podcast.config.hostName}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>HOST</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <SpeakerAvatar name={podcast.config.guestName} isActive={currentTurn?.speaker === 'guest'} color={guestColor} />
                <Text style={{ color: currentTurn?.speaker === 'guest' ? guestColor : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{podcast.config.guestName}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>GUEST</Text>
              </View>
            </View>

            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', textAlign: 'center', marginBottom: 2, width: '100%' }}>{podcast.title}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.md }}>Turn {playerState.currentTurnIndex + 1} of {turns.length}</Text>

            <View style={{ width: '100%', marginBottom: SPACING.md }}>
              <ProgressBar progress={progressPercent} onSeek={handleSeek} totalDurationMs={playerState.totalDurationMs} currentPositionMs={playerState.totalPositionMs} formatTime={formatTime} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
              <TouchableOpacity onPress={skipPrevious} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-skip-back" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayPause} disabled={playerState.isLoading}
                style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 }}>
                {playerState.isLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={24} color="#FFF" style={{ marginLeft: playerState.isPlaying ? 0 : 2 }} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={skipNext} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-skip-forward" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {RATE_OPTIONS.map(rate => {
                const isActive = playerState.playbackRate === rate;
                return (
                  <TouchableOpacity key={rate} onPress={() => setPlaybackRate(rate)}
                    style={{ backgroundColor: isActive ? `${COLORS.primary}25` : COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: isActive ? COLORS.primary : COLORS.border }}>
                    <Text style={{ color: isActive ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '700' : '400' }}>{rate}×</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Transcript ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ flex: 1, paddingHorizontal: SPACING.xl }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.xs }}>Transcript</Text>
          <View style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', maxHeight: SCREEN_HEIGHT * 0.45 }}>
            <FlatList
              ref={transcriptRef}
              data={turns}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}
              showsVerticalScrollIndicator
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => (
                <TranscriptRow
                  turn={item} isActive={index === playerState.currentTurnIndex}
                  hostName={podcast.config.hostName} guestName={podcast.config.guestName}
                  onPress={() => skipToTurn(index)}
                />
              )}
            />
          </View>
        </Animated.View>

        <View style={{ height: SPACING.md }} />
      </SafeAreaView>

      <ExportShareSheet podcast={podcast} visible={exportSheetVisible} onClose={() => setExportSheetVisible(false)} />

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