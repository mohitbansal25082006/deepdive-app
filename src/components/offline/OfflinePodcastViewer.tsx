// src/components/offline/OfflinePodcastViewer.tsx
// Part 23 — Updated: added MP3 export button that reads locally cached audio.
//
// Export buttons in header:
//   📥  (download-outline, pink)  → PDF script export  (always available)
//   🎵  (musical-notes-outline)   → MP3 export (only shown when audio cached)
//   📋  (copy-outline)            → Copy transcript to clipboard

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useCachedPodcastPlayer } from '../../hooks/useCachedPodcastPlayer';
import { usePodcastPlayer }        from '../../hooks/usePodcastPlayer';
import { WaveformVisualizer }      from '../podcast/WaveformVisualizer';
import { exportPodcastAsMP3Offline, canExportPodcastAsMP3 } from '../../services/offlineMp3Export';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { Podcast, PodcastTurn } from '../../types';
import type { CacheEntry } from '../../types/cache';
import { formatBytes } from '../../lib/cacheStorage';

const { height: SCREEN_H } = Dimensions.get('window');
const RATE_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

// ─── Speaker Avatar ───────────────────────────────────────────────────────────

function SpeakerAvatar({ name, isActive, color }: {
  name: string; isActive: boolean; color: string;
}) {
  const anim = useRef(new Animated.Value(isActive ? 1 : 0.88)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: isActive ? 1.0 : 0.88, duration: 280, useNativeDriver: true }).start();
  }, [isActive]);
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Animated.View style={{
      width: isActive ? 56 : 44, height: isActive ? 56 : 44,
      borderRadius: isActive ? 16 : 12,
      backgroundColor: `${color}20`,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: isActive ? 2 : 1, borderColor: isActive ? color : `${color}40`,
      transform: [{ scale: anim }],
    }}>
      <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: isActive ? FONTS.sizes.md : FONTS.sizes.sm, fontWeight: '800' }}>
        {initials}
      </Text>
    </Animated.View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, onSeek, totalMs, positionMs, formatTime }: {
  progress: number; onSeek: (p: number) => void; totalMs: number; positionMs: number; formatTime: (ms: number) => string;
}) {
  const [barWidth, setBarWidth] = useState(0);
  return (
    <View>
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={0.9}
        style={{ height: 5, backgroundColor: COLORS.backgroundElevated, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}
      >
        <View style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` as any, height: '100%', backgroundColor: '#FF6584', borderRadius: 3 }} />
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(positionMs)}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatTime(totalMs)}</Text>
      </View>
    </View>
  );
}

// ─── Transcript Turn Row ──────────────────────────────────────────────────────

function TranscriptRow({ turn, isActive, hostName, guestName, onPress }: {
  turn: PodcastTurn; isActive: boolean; hostName: string; guestName: string; onPress: () => void;
}) {
  const isHost = turn.speaker === 'host';
  const color  = isHost ? COLORS.primary : '#FF6584';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: 'row', gap: 10, paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        backgroundColor: isActive ? `${color}12` : 'transparent',
        borderRadius: RADIUS.lg, borderLeftWidth: isActive ? 3 : 0,
        borderLeftColor: color, marginBottom: 4,
      }}>
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{ color: isActive ? color : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textAlign: 'center' }}>
          {isHost ? hostName.split(' ')[0] : guestName.split(' ')[0]}
        </Text>
      </View>
      <Text style={{ flex: 1, color: isActive ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, fontWeight: isActive ? '500' : '400' }}>
        {turn.text}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Audio Player Panel ───────────────────────────────────────────────────────

function AudioPlayerPanel({ podcast }: { podcast: Podcast }) {
  const [hasStarted, setHasStarted] = useState(false);
  const transcriptRef = useRef<FlatList>(null);

  const {
    playerState, currentTurn, progressPercent,
    startPlayback, togglePlayPause, skipNext, skipPrevious,
    skipToTurn, setPlaybackRate, formatTime,
  } = usePodcastPlayer(podcast);

  useEffect(() => {
    if (!hasStarted) { setHasStarted(true); startPlayback(); }
  }, []);

  useEffect(() => {
    const idx = playerState.currentTurnIndex;
    if (idx >= 0 && transcriptRef.current) {
      try { transcriptRef.current.scrollToIndex({ index: idx, animated: true, viewOffset: 60, viewPosition: 0.3 }); } catch {}
    }
  }, [playerState.currentTurnIndex]);

  const handleSeek = useCallback((percent: number) => {
    const turns    = podcast.script?.turns ?? [];
    const targetMs = percent * playerState.totalDurationMs;
    let cumMs = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cumMs + dur >= targetMs || i === turns.length - 1) { skipToTurn(i); break; }
      cumMs += dur;
    }
  }, [podcast, playerState.totalDurationMs, skipToTurn]);

  const turns      = podcast.script?.turns ?? [];
  const isHost     = currentTurn?.speaker !== 'guest';
  const hostColor  = COLORS.primary;
  const guestColor = '#FF6584';

  return (
    <View style={{ flex: 1 }}>
      {/* Player card */}
      <LinearGradient colors={['#1A1A35', '#0F0F28']} style={{
        margin: SPACING.lg, borderRadius: RADIUS.xl,
        padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25`,
        alignItems: 'center',
      }}>
        <View style={{ marginBottom: SPACING.md }}>
          <WaveformVisualizer isPlaying={playerState.isPlaying} color={isHost ? hostColor : guestColor} barWidth={5} barGap={3} maxHeight={40} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SpeakerAvatar name={podcast.config.hostName} isActive={currentTurn?.speaker === 'host'} color={hostColor} />
            <Text style={{ color: currentTurn?.speaker === 'host' ? hostColor : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {podcast.config.hostName.split(' ')[0]}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <SpeakerAvatar name={podcast.config.guestName} isActive={currentTurn?.speaker === 'guest'} color={guestColor} />
            <Text style={{ color: currentTurn?.speaker === 'guest' ? guestColor : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {podcast.config.guestName.split(' ')[0]}
            </Text>
          </View>
        </View>

        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', textAlign: 'center', marginBottom: 2 }} numberOfLines={1}>
          {podcast.title}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.md }}>
          Turn {playerState.currentTurnIndex + 1} of {turns.length}
        </Text>

        <View style={{ width: '100%', marginBottom: SPACING.md }}>
          <ProgressBar
            progress={progressPercent}
            onSeek={handleSeek}
            totalMs={playerState.totalDurationMs}
            positionMs={playerState.totalPositionMs}
            formatTime={formatTime}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.sm }}>
          <TouchableOpacity onPress={skipPrevious} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play-skip-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayPause} disabled={playerState.isLoading}
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF6584', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF6584', shadowOpacity: 0.5, shadowRadius: 12, elevation: 6 }}>
            {playerState.isLoading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={22} color="#FFF" style={{ marginLeft: playerState.isPlaying ? 0 : 2 }} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={skipNext} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play-skip-forward" size={20} color={COLORS.textSecondary} />
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

      {/* Transcript */}
      <View style={{ flex: 1, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
          Transcript
        </Text>
        <View style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', maxHeight: SCREEN_H * 0.32 }}>
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
                hostName={podcast.config.hostName}
                guestName={podcast.config.guestName}
                onPress={() => skipToTurn(index)}
              />
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
    isDownloading: boolean; progress: number;
    segmentsComplete: number; segmentsTotal: number; error: string | null;
  };
}) {
  const turns = podcast.script?.turns ?? [];

  return (
    <View style={{ flex: 1 }}>
      {/* Audio download banner */}
      <View style={{ margin: SPACING.lg, borderRadius: RADIUS.xl, overflow: 'hidden' }}>
        {downloadState.isDownloading ? (
          <View style={{ backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                Downloading audio… {downloadState.segmentsComplete}/{downloadState.segmentsTotal}
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(downloadState.progress * 100)}%` as any, height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 }} />
            </View>
          </View>
        ) : (
          <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${'#FF6584'}30` }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${'#FF6584'}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: `${'#FF6584'}30` }}>
                <Ionicons name="headset-outline" size={18} color="#FF6584" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 }}>
                  Audio not downloaded
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: SPACING.sm }}>
                  Transcript is available offline. Download audio for full offline playback and MP3 export.
                </Text>
                {downloadState.error ? (
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>{downloadState.error}</Text>
                ) : null}
                <TouchableOpacity onPress={onDownloadAudio}
                  style={{ backgroundColor: '#FF6584', borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Download Audio</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Full transcript */}
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: SPACING.lg, marginBottom: SPACING.xs }}>
        Full Transcript
      </Text>
      <ScrollView style={{ flex: 1, marginHorizontal: SPACING.lg }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}>
        {turns.map((turn, i) => {
          const isHost  = turn.speaker === 'host';
          const color   = isHost ? COLORS.primary : '#FF6584';
          const bgColor = isHost ? `${COLORS.primary}0A` : `${'#FF6584'}0A`;
          return (
            <View key={turn.id} style={{ marginBottom: SPACING.sm, padding: SPACING.md, backgroundColor: bgColor, borderRadius: RADIUS.lg, borderLeftWidth: 3, borderLeftColor: color }}>
              <Text style={{ color, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                {isHost ? podcast.config.hostName : podcast.config.guestName}
              </Text>
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
  podcast:   Podcast;
  entry:     CacheEntry;
  onClose:   () => void;
  /** Called for PDF export (controlled by OfflineScreen) */
  onExport:  () => void;
  exporting: boolean;
}

export function OfflinePodcastViewer({
  podcast, entry, onClose, onExport, exporting,
}: OfflinePodcastViewerProps) {
  const insets = useSafeAreaInsets();

  const {
    mode,
    podcastWithLocal,
    hasLocalAudio,
    downloadState,
    downloadAudio,
  } = useCachedPodcastPlayer(podcast);

  const [copying,        setCopying]        = useState(false);
  const [exportingMp3,   setExportingMp3]   = useState(false);
  const [mp3Progress,    setMp3Progress]    = useState(0);

  // ── Copy transcript ────────────────────────────────────────────────────────
  const handleCopyScript = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const turns = podcast.script?.turns ?? [];
      const text  = turns.map(t => `${t.speakerName.toUpperCase()}:\n${t.text}`).join('\n\n');
      await Clipboard.setStringAsync(`${podcast.title}\n\n${text}`);
      Alert.alert('Copied', 'Podcast script copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Could not copy script.');
    } finally {
      setCopying(false);
    }
  }, [podcast, copying]);

  // ── MP3 export ─────────────────────────────────────────────────────────────
  const handleExportMp3 = useCallback(async () => {
    if (exportingMp3) return;

    // Check if audio is available before starting
    const audioAvailable = await canExportPodcastAsMP3(podcast.id);
    if (!audioAvailable) {
      Alert.alert(
        'Audio Not Available',
        'Audio files are not downloaded yet.\n\nTap "Download Audio" first, then you can export as MP3.',
        [{ text: 'OK' }]
      );
      return;
    }

    setExportingMp3(true);
    setMp3Progress(0);
    try {
      await exportPodcastAsMP3Offline(podcast, (progress) => {
        setMp3Progress(progress);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('MP3 Export Failed', msg, [{ text: 'OK' }]);
    } finally {
      setExportingMp3(false);
      setMp3Progress(0);
    }
  }, [podcast, exportingMp3]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        {/* Back */}
        <TouchableOpacity onPress={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${'#FF6584'}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${'#FF6584'}30`, flexShrink: 0 }}>
          <Ionicons name="radio-outline" size={15} color="#FF6584" />
        </View>

        {/* Title + badges */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {podcast.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            {hasLocalAudio && (
              <View style={{ backgroundColor: `${COLORS.success}18`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>AUDIO CACHED</Text>
              </View>
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              ~{Math.round(podcast.durationSeconds / 60)}min · {podcast.script?.turns?.length ?? 0} turns
            </Text>
          </View>
        </View>

        {/* PDF export */}
        <TouchableOpacity onPress={onExport} disabled={exporting}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${'#FF6584'}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${'#FF6584'}25` }}>
          {exporting
            ? <ActivityIndicator size="small" color="#FF6584" />
            : <Ionicons name="download-outline" size={16} color="#FF6584" />
          }
        </TouchableOpacity>

        {/* MP3 export — always visible; shows disabled state if no audio */}
        <TouchableOpacity
          onPress={handleExportMp3}
          disabled={exportingMp3}
          style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: hasLocalAudio ? `${COLORS.success}18` : COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: hasLocalAudio ? `${COLORS.success}35` : COLORS.border,
          }}
        >
          {exportingMp3
            ? <ActivityIndicator size="small" color={COLORS.success} />
            : <Ionicons name="musical-notes-outline" size={16} color={hasLocalAudio ? COLORS.success : COLORS.textMuted} />
          }
        </TouchableOpacity>

        {/* Copy */}
        <TouchableOpacity onPress={handleCopyScript} disabled={copying}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          {copying ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <Ionicons name="copy-outline" size={16} color={COLORS.textMuted} />}
        </TouchableOpacity>
      </View>

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
            <View style={{ width: `${Math.round(mp3Progress * 100)}%` as any, height: '100%', backgroundColor: COLORS.success, borderRadius: 2 }} />
          </View>
        </View>
      )}

      {/* Content */}
      {mode === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FF6584" />
          <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>
            Loading audio cache…
          </Text>
        </View>
      ) : mode === 'audio' && podcastWithLocal ? (
        <AudioPlayerPanel podcast={podcastWithLocal} />
      ) : (
        <TranscriptOnlyPanel
          podcast={podcast}
          onDownloadAudio={downloadAudio}
          downloadState={downloadState}
        />
      )}
    </View>
  );
}