// app/(app)/workspace-shared-podcast-player.tsx
// Part 39 FIX — Full 3-speaker support, matching podcast-player.tsx
//
// ROOT CAUSE of 3-speaker issues in workspace player:
//   1. SpeakerAvatar section hardcoded exactly 2 avatars (host + guest).
//   2. TranscriptRow only handled speaker === 'host' vs 'guest' (no guest2).
//   3. ProgressBar seek only handled 2-speaker name lookup.
//   4. Title subtitle showed "X of Y turns" but no 3-speaker badge.
//
// FIXES:
//   1. getSpeakersFromScript() extracts unique speakers from script.turns
//      → builds [host, guest1, guest2?] array with name+color+role.
//   2. SpeakerAvatars row renders dynamically from that array (2 or 3).
//   3. TranscriptRow resolves name/color from the speakers array.
//   4. Subtitle shows "· 3 speakers" badge when applicable.
//   5. All backward-compatible with V1 episodes (speaker === 'guest').
//
// CHANGES (latest):
//   - Removed PDF Script download button from the download bar.
//   - Moved Download MP3 button to the header (music note icon).
//   - Download bar section removed entirely (was only holding those two buttons).

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
}                                       from 'react-native-reanimated';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useSharedPodcastPlayer }   from '../../src/hooks/useSharedPodcastPlayer';
import { WaveformVisualizer }        from '../../src/components/podcast/WaveformVisualizer';
import { LoadingOverlay }            from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import type { PodcastTurn, SharedPodcast } from '../../src/types';

const RATE_OPTIONS  = [0.75, 1.0, 1.25, 1.5, 2.0];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ACCENT = '#FF6584';

// ─── Speaker config type ──────────────────────────────────────────────────────

interface SpeakerInfo {
  role:   string;
  name:   string;
  color:  string;
  label:  string;
}

// ─── Extract speakers from script turns (V1 + V2 aware) ──────────────────────

function getSpeakersFromScript(sp: SharedPodcast): SpeakerInfo[] {
  const turns = sp.script?.turns ?? [];
  const nameByRole = new Map<string, string>();

  // Walk turns in order to capture first speakerName seen per role
  for (const turn of turns) {
    const role = (turn as any).speaker as string;
    if (role && !nameByRole.has(role) && (turn as any).speakerName) {
      nameByRole.set(role, (turn as any).speakerName);
    }
  }

  const hostName   = nameByRole.get('host')   ?? sp.hostName  ?? 'Host';
  const guest1Name = nameByRole.get('guest1') ?? nameByRole.get('guest') ?? sp.guestName ?? 'Guest';
  const guest2Name = nameByRole.get('guest2') ?? null;

  const speakers: SpeakerInfo[] = [
    { role: 'host',   name: hostName,   color: ACCENT,         label: 'HOST' },
    { role: 'guest1', name: guest1Name, color: COLORS.primary, label: 'GUEST' },
  ];

  if (guest2Name) {
    speakers.push({ role: 'guest2', name: guest2Name, color: '#43E97B', label: 'GUEST 2' });
  }

  return speakers;
}

/**
 * Given a turn's speaker field, return matching SpeakerInfo.
 * Handles both V1 ('guest') and V2 ('guest1', 'guest2') roles.
 */
function resolveSpeaker(
  speakerRole: string | undefined,
  speakers: SpeakerInfo[],
): SpeakerInfo {
  // V1 compat: 'guest' maps to guest1 slot
  const role = speakerRole === 'guest' ? 'guest1' : (speakerRole ?? 'host');
  return speakers.find(s => s.role === role) ?? speakers[0];
}

// ─── Speaker Avatar ───────────────────────────────────────────────────────────

function SpeakerAvatar({
  name,
  isActive,
  color,
}: {
  name:     string;
  isActive: boolean;
  color:    string;
}) {
  const scale  = useSharedValue(isActive ? 1 : 0.88);
  const border = useSharedValue(isActive ? 1.5 : 0);

  useEffect(() => {
    scale.value  = withTiming(isActive ? 1.0 : 0.88, { duration: 300 });
    border.value = withTiming(isActive ? 1.5 : 0,    { duration: 300 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform:   [{ scale: scale.value }],
    borderWidth: border.value,
  }));

  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Animated.View
      style={[{
        width:           isActive ? 64 : 52,
        height:          isActive ? 64 : 52,
        borderRadius:    isActive ? 20 : 16,
        backgroundColor: `${color}20`,
        alignItems:      'center',
        justifyContent:  'center',
        borderColor:     color,
      }, animStyle]}
    >
      <Text style={{
        color:      isActive ? color : COLORS.textMuted,
        fontSize:   isActive ? FONTS.sizes.lg : FONTS.sizes.md,
        fontWeight: '800',
      }}>
        {initials}
      </Text>
    </Animated.View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  progress,
  onSeek,
  totalDurationMs,
  currentPositionMs,
  formatTime,
}: {
  progress:          number;
  onSeek:            (percent: number) => void;
  totalDurationMs:   number;
  currentPositionMs: number;
  formatTime:        (ms: number) => string;
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
      <TouchableOpacity
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => { if (barWidth > 0) onSeek(e.nativeEvent.locationX / barWidth); }}
        activeOpacity={0.9}
        style={{
          height:          5,
          backgroundColor: COLORS.backgroundElevated,
          borderRadius:    3,
          overflow:        'hidden',
          marginBottom:    10,
        }}
      >
        <Animated.View style={[fillStyle, {
          height:          '100%',
          backgroundColor: ACCENT,
          borderRadius:    3,
        }]} />
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
          {formatTime(currentPositionMs)}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
          {formatTime(totalDurationMs)}
        </Text>
      </View>
    </View>
  );
}

// ─── Transcript Turn Row ──────────────────────────────────────────────────────

function TranscriptRow({
  turn,
  isActive,
  speakers,
  onPress,
}: {
  turn:     PodcastTurn;
  isActive: boolean;
  speakers: SpeakerInfo[];
  onPress:  () => void;
}) {
  const sp    = resolveSpeaker(turn.speaker, speakers);
  const color = sp.color;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection:     'row',
        gap:               12,
        paddingVertical:   SPACING.sm,
        paddingHorizontal: SPACING.md,
        backgroundColor:   isActive ? `${color}12` : 'transparent',
        borderRadius:      RADIUS.lg,
        borderLeftWidth:   isActive ? 3 : 0,
        borderLeftColor:   color,
        marginBottom:      4,
      }}
    >
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{
          color:      isActive ? color : COLORS.textMuted,
          fontSize:   FONTS.sizes.xs,
          fontWeight: '700',
          textAlign:  'center',
        }}>
          {sp.name}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          color:      isActive ? COLORS.textPrimary : COLORS.textSecondary,
          fontSize:   FONTS.sizes.sm,
          lineHeight: 20,
          fontWeight: isActive ? '500' : '400',
        }}>
          {turn.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Audio Unavailable Banner ─────────────────────────────────────────────────

function AudioUnavailableBanner() {
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               8,
      backgroundColor:   `${COLORS.warning}12`,
      borderRadius:      RADIUS.lg,
      padding:           SPACING.md,
      marginHorizontal:  SPACING.xl,
      marginBottom:      SPACING.md,
      borderWidth:       1,
      borderColor:       `${COLORS.warning}30`,
    }}>
      <Ionicons name="alert-circle-outline" size={18} color={COLORS.warning} />
      <View style={{ flex: 1 }}>
        <Text style={{
          color:        COLORS.warning,
          fontSize:     FONTS.sizes.sm,
          fontWeight:   '700',
          marginBottom: 2,
        }}>
          Audio Not Available
        </Text>
        <Text style={{
          color:      COLORS.warning,
          fontSize:   FONTS.sizes.xs,
          opacity:    0.85,
          lineHeight: 16,
        }}>
          The audio files were generated on another device and aren't cached here.
          You can still read the transcript below.
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WorkspaceSharedPodcastPlayerScreen() {
  const {
    workspaceId,
    sharedId,
    contentTitle,
  } = useLocalSearchParams<{
    workspaceId:   string;
    sharedId:      string;
    contentTitle?: string;
  }>();

  const {
    state,
    currentTurn,
    progressPercent,
    startPlayback,
    togglePlayPause,
    skipNext,
    skipPrevious,
    skipToTurn,
    setPlaybackRate,
    stopPlayback,
    downloadMP3,
    downloadPDF,
    copyScript,
    formatTime,
    reload,
  } = useSharedPodcastPlayer(workspaceId, sharedId);

  const [hasStarted,   setHasStarted]   = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const transcriptRef = useRef<FlatList>(null);

  // ── Derive speaker array (memoized) ──────────────────────────────────────
  const speakers = useMemo<SpeakerInfo[]>(() => {
    if (!state.sharedPodcast) return [
      { role: 'host',   name: 'Host',  color: ACCENT,         label: 'HOST'  },
      { role: 'guest1', name: 'Guest', color: COLORS.primary, label: 'GUEST' },
    ];
    return getSpeakersFromScript(state.sharedPodcast);
  }, [state.sharedPodcast]);

  const is3Speaker = speakers.length >= 3;

  // ── Active speaker (current turn) ─────────────────────────────────────────
  const activeSpeaker = useMemo(
    () => resolveSpeaker(currentTurn?.speaker, speakers),
    [currentTurn, speakers]
  );

  // Auto-start playback once loaded (only if audio is available)
  useEffect(() => {
    if (
      !state.isLoadingPodcast &&
      !state.loadError &&
      state.hasAudio &&
      state.podcast &&
      !hasStarted
    ) {
      setHasStarted(true);
      startPlayback();
    }
  }, [state.isLoadingPodcast, state.loadError, state.hasAudio, state.podcast]);

  // Auto-scroll transcript
  useEffect(() => {
    const idx = state.player.currentTurnIndex;
    if (idx >= 0 && transcriptRef.current) {
      try {
        transcriptRef.current.scrollToIndex({
          index:        idx,
          animated:     true,
          viewOffset:   60,
          viewPosition: 0.3,
        });
      } catch {}
    }
  }, [state.player.currentTurnIndex]);

  const handleBack = useCallback(async () => {
    await stopPlayback();
    router.back();
  }, [stopPlayback]);

  const handleSeek = useCallback((percent: number) => {
    if (!state.podcast) return;
    const turns    = state.podcast.script?.turns ?? [];
    const targetMs = percent * state.player.totalDurationMs;
    let cumMs = 0;
    for (let i = 0; i < turns.length; i++) {
      const dur = turns[i].durationMs ?? 0;
      if (cumMs + dur >= targetMs || i === turns.length - 1) {
        skipToTurn(i);
        break;
      }
      cumMs += dur;
    }
  }, [state.podcast, state.player.totalDurationMs, skipToTurn]);

  const handleCopyScript = async () => {
    const ok = await copyScript();
    if (ok) {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (state.isLoadingPodcast) {
    return <LoadingOverlay visible message="Loading episode…" />;
  }

  // ── Error / not found ─────────────────────────────────────────────────────

  if (state.loadError || !state.sharedPodcast || !state.podcast) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {contentTitle ?? 'Episode'}
            </Text>
          </View>
          <View style={styles.errorBody}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="mic-off-outline" size={44} color={COLORS.textMuted} />
            </View>
            <Text style={styles.errorTitle}>Episode Unavailable</Text>
            <Text style={styles.errorDesc}>
              {state.loadError ?? 'This episode could not be loaded. It may have been removed.'}
            </Text>
            <TouchableOpacity onPress={reload} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color="#FFF" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 8 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const sp    = state.sharedPodcast;
  const turns = state.podcast.script?.turns ?? [];

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm }}>
            <Text style={{
              color:         COLORS.textMuted,
              fontSize:      FONTS.sizes.xs,
              fontWeight:    '600',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              Workspace Episode
            </Text>
            {sp.sharerName && (
              <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>
                Shared by {sp.sharerName}
              </Text>
            )}
          </View>

          {/* Header action icons: copy script, export PDF, download MP3 */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={handleCopyScript}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={copiedScript ? 'checkmark-circle-outline' : 'copy-outline'}
                size={17}
                color={copiedScript ? COLORS.success : COLORS.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={downloadPDF}
              disabled={state.isExporting}
              style={[styles.iconBtn, { opacity: state.isExporting ? 0.6 : 1 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {state.isExporting
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="document-text-outline" size={17} color={COLORS.textSecondary} />}
            </TouchableOpacity>

            {/* Download MP3 — only shown when audio is available */}
            {state.hasAudio && (
              <TouchableOpacity
                onPress={downloadMP3}
                disabled={state.isExporting}
                style={[styles.iconBtn, { opacity: state.isExporting ? 0.6 : 1 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {state.isExporting
                  ? <ActivityIndicator size="small" color={ACCENT} />
                  : <Ionicons name="musical-notes-outline" size={17} color={ACCENT} />}
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ── Audio unavailable banner ── */}
        {!state.hasAudio && <AudioUnavailableBanner />}

        {/* ── Player card ── */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(50)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}
        >
          <LinearGradient
            colors={['#1A1A35', '#0F0F28']}
            style={{
              borderRadius: RADIUS.xl,
              padding:      SPACING.lg,
              borderWidth:  1,
              borderColor:  `${activeSpeaker.color}25`,
              alignItems:   'center',
            }}
          >
            {/* Waveform */}
            <View style={{ marginBottom: SPACING.lg }}>
              <WaveformVisualizer
                isPlaying={state.player.isPlaying}
                color={activeSpeaker.color}
                barWidth={6}
                barGap={4}
                maxHeight={48}
              />
            </View>

            {/* Speaker avatars — dynamic 2 or 3 */}
            <View style={{
              flexDirection:  'row',
              alignItems:     'flex-end',
              justifyContent: 'center',
              gap:            is3Speaker ? SPACING.md : SPACING.lg,
              marginBottom:   SPACING.sm,
            }}>
              {speakers.map(sp => {
                const isActive = resolveSpeaker(currentTurn?.speaker, speakers).role === sp.role;
                return (
                  <View key={sp.role} style={{ alignItems: 'center', gap: 4 }}>
                    <SpeakerAvatar
                      name={sp.name}
                      isActive={isActive}
                      color={sp.color}
                    />
                    <Text style={{
                      color:      isActive ? sp.color : COLORS.textMuted,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: '600',
                      textAlign:  'center',
                      maxWidth:   70,
                    }}
                      numberOfLines={1}
                    >
                      {sp.name}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{sp.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Title */}
            <Text style={{
              color:        COLORS.textPrimary,
              fontSize:     FONTS.sizes.md,
              fontWeight:   '800',
              textAlign:    'center',
              marginBottom: 2,
              width:        '100%',
            }}>
              {sp.title}
            </Text>

            {/* Subtitle */}
            <Text style={{
              color:        COLORS.textMuted,
              fontSize:     FONTS.sizes.xs,
              textAlign:    'center',
              marginBottom: SPACING.md,
            }}>
              Turn {state.player.currentTurnIndex + 1} of {turns.length}
              {is3Speaker ? ' · 3 speakers' : ''}
            </Text>

            {/* Progress bar */}
            <View style={{ width: '100%', marginBottom: SPACING.md }}>
              <ProgressBar
                progress={progressPercent}
                onSeek={handleSeek}
                totalDurationMs={state.player.totalDurationMs}
                currentPositionMs={state.player.totalPositionMs}
                formatTime={formatTime}
              />
            </View>

            {/* Playback controls */}
            <View style={{
              flexDirection:  'row',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            SPACING.lg,
              marginBottom:   SPACING.sm,
            }}>
              <TouchableOpacity
                onPress={skipPrevious}
                disabled={!state.hasAudio}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: state.hasAudio ? 1 : 0.3 }}
              >
                <Ionicons name="play-skip-back" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlayPause}
                disabled={!state.hasAudio || state.player.isLoading}
                style={{
                  width:           60,
                  height:          60,
                  borderRadius:    30,
                  backgroundColor: state.hasAudio ? ACCENT : COLORS.backgroundElevated,
                  alignItems:      'center',
                  justifyContent:  'center',
                  shadowColor:     ACCENT,
                  shadowOpacity:   state.hasAudio ? 0.5 : 0,
                  shadowRadius:    16,
                  elevation:       state.hasAudio ? 8 : 0,
                }}
              >
                {state.player.isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons
                    name={state.player.isPlaying ? 'pause' : 'play'}
                    size={24}
                    color={state.hasAudio ? '#FFF' : COLORS.textMuted}
                    style={{ marginLeft: state.player.isPlaying ? 0 : 2 }}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={skipNext}
                disabled={!state.hasAudio}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: state.hasAudio ? 1 : 0.3 }}
              >
                <Ionicons name="play-skip-forward" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Playback rate */}
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {RATE_OPTIONS.map(rate => {
                const isActive = state.player.playbackRate === rate;
                return (
                  <TouchableOpacity
                    key={rate}
                    onPress={() => setPlaybackRate(rate)}
                    disabled={!state.hasAudio}
                    style={{
                      backgroundColor:   isActive ? `${ACCENT}25` : COLORS.backgroundElevated,
                      borderRadius:      RADIUS.full,
                      paddingHorizontal: 8,
                      paddingVertical:   4,
                      borderWidth:       1,
                      borderColor:       isActive ? ACCENT : COLORS.border,
                      opacity:           state.hasAudio ? 1 : 0.4,
                    }}
                  >
                    <Text style={{
                      color:      isActive ? ACCENT : COLORS.textMuted,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: isActive ? '700' : '400',
                    }}>
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
          <Text style={{
            color:         COLORS.textSecondary,
            fontSize:      FONTS.sizes.sm,
            fontWeight:    '600',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom:  SPACING.xs,
          }}>
            Transcript
          </Text>

          <View style={{
            flex:            1,
            backgroundColor: COLORS.backgroundCard,
            borderRadius:    RADIUS.xl,
            borderWidth:     1,
            borderColor:     COLORS.border,
            overflow:        'hidden',
            maxHeight:       SCREEN_HEIGHT * 0.35,
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
                  isActive={index === state.player.currentTurnIndex}
                  speakers={speakers}
                  onPress={() => state.hasAudio && skipToTurn(index)}
                />
              )}
            />
          </View>
        </Animated.View>

        <View style={{ height: SPACING.md }} />

      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical:   SPACING.md,
    gap:               SPACING.sm,
  },
  backBtn: {
    width:           40,
    height:          40,
    borderRadius:    12,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    flexShrink:      0,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
    flex:       1,
  },
  iconBtn: {
    width:           38,
    height:          38,
    borderRadius:    12,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  errorBody: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
    gap:            12,
  },
  errorIconWrap: {
    width:           80,
    height:          80,
    borderRadius:    22,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  errorTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
  },
  errorDesc: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.sm,
    textAlign:  'center',
    lineHeight: 22,
    maxWidth:   300,
  },
  retryBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   ACCENT,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   10,
    marginTop:         4,
  },
  retryText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
});