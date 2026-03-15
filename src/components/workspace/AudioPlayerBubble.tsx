// src/components/workspace/AudioPlayerBubble.tsx
// Part 18D — Download button added.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, LayoutChangeEvent, Alert,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, cancelAnimation, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ChatAttachment } from '../../types/chat';
import { getSignedUrl, openOrDownloadAttachment } from '../../services/chatAttachmentService';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

const BAR_COUNT    = 28;
const BAR_MIN_H    = 4;
const BAR_MAX_H    = 28;
const RATE_CYCLE   = [1, 1.5, 2, 0.75] as const;

const IDLE_HEIGHTS = Array.from(
  { length: BAR_COUNT },
  (_, i) => BAR_MIN_H + ((Math.sin(i * 1.3) * 0.5 + 0.5) * (BAR_MAX_H - BAR_MIN_H)),
);

function fmt(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── Animated waveform bar ────────────────────────────────────────────────────

function WaveBar({ baseHeight, isPlaying, isOwnMessage, isFilled }: {
  baseHeight: number; isPlaying: boolean; isOwnMessage: boolean; isFilled: boolean;
}) {
  const animH = useSharedValue(baseHeight);

  useEffect(() => {
    if (isPlaying) {
      const target = BAR_MIN_H + Math.random() * (BAR_MAX_H - BAR_MIN_H);
      animH.value = withRepeat(
        withSequence(
          withTiming(target,      { duration: 280 + Math.random() * 240, easing: Easing.inOut(Easing.sin) }),
          withTiming(baseHeight,  { duration: 280 + Math.random() * 240, easing: Easing.inOut(Easing.sin) }),
        ), -1, false,
      );
    } else {
      cancelAnimation(animH);
      animH.value = withTiming(baseHeight, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const style = useAnimatedStyle(() => ({ height: animH.value }));
  const color = isOwnMessage
    ? (isFilled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)')
    : (isFilled ? COLORS.primary           : `${COLORS.primary}45`);

  return <Animated.View style={[styles.bar, style, { backgroundColor: color }]} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { attachment: ChatAttachment; isOwnMessage: boolean; }

export function AudioPlayerBubble({ attachment, isOwnMessage }: Props) {
  const [signedUrl,    setSignedUrl]    = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError,     setUrlError]     = useState<string | null>(null);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isBuffering,  setIsBuffering]  = useState(false);
  const [positionMs,   setPositionMs]   = useState(0);
  const [durationMs,   setDurationMs]   = useState(0);
  const [rateIdx,      setRateIdx]      = useState(0);
  const [trackWidth,   setTrackWidth]   = useState(1);
  const [isDownloading,setIsDownloading]= useState(false);

  const soundRef  = useRef<Audio.Sound | null>(null);
  const isSeeking = useRef(false);

  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

  const ensureUrl = useCallback(async (): Promise<string | null> => {
    if (signedUrl) return signedUrl;
    setIsLoadingUrl(true); setUrlError(null);
    const url = await getSignedUrl(attachment.url);
    setIsLoadingUrl(false);
    if (!url) { setUrlError('Could not load audio'); return null; }
    setSignedUrl(url); return url;
  }, [attachment.url, signedUrl]);

  const handleStatus = useCallback((s: AVPlaybackStatus) => {
    if (!s.isLoaded) { setIsBuffering(true); return; }
    setIsBuffering(false); setIsPlaying(s.isPlaying);
    if (!isSeeking.current) setPositionMs(s.positionMillis ?? 0);
    if (s.durationMillis) setDurationMs(s.durationMillis);
    if (s.didJustFinish) { setIsPlaying(false); setPositionMs(0); soundRef.current?.setPositionAsync(0); }
  }, []);

  const loadSound = useCallback(async (): Promise<Audio.Sound | null> => {
    if (soundRef.current) return soundRef.current;
    const url = await ensureUrl(); if (!url) return null;
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: url }, { shouldPlay: false, progressUpdateIntervalMillis: 200 }, handleStatus,
    );
    soundRef.current = sound; return sound;
  }, [ensureUrl, handleStatus]);

  const togglePlay = useCallback(async () => {
    try {
      const sound = await loadSound(); if (!sound) return;
      const s = await sound.getStatusAsync(); if (!s.isLoaded) return;
      if (s.isPlaying) { await sound.pauseAsync(); }
      else { await sound.setRateAsync(RATE_CYCLE[rateIdx], true); await sound.playAsync(); }
    } catch (e) { console.warn('[AudioPlayer]', e); }
  }, [loadSound, rateIdx]);

  const seekTap = useCallback(async (e: { nativeEvent: { locationX: number } }) => {
    if (!soundRef.current || !durationMs || !trackWidth) return;
    const p = Math.floor(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth)) * durationMs);
    isSeeking.current = true; setPositionMs(p);
    await soundRef.current.setPositionAsync(p); isSeeking.current = false;
  }, [durationMs, trackWidth]);

  const cycleRate = useCallback(async () => {
    const next = (rateIdx + 1) % RATE_CYCLE.length; setRateIdx(next);
    if (soundRef.current) {
      const s = await soundRef.current.getStatusAsync();
      if (s.isLoaded) await soundRef.current.setRateAsync(RATE_CYCLE[next], true);
    }
  }, [rateIdx]);

  // Part 18D: download
  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    const { error } = await openOrDownloadAttachment(attachment);
    setIsDownloading(false);
    if (error) Alert.alert('Download failed', error);
  }, [attachment, isDownloading]);

  const pf       = durationMs > 0 ? positionMs / durationMs : 0;
  const rate     = RATE_CYCLE[rateIdx];
  const tc       = isOwnMessage ? 'rgba(255,255,255,0.9)' : COLORS.textPrimary;
  const mc       = isOwnMessage ? 'rgba(255,255,255,0.55)' : COLORS.textMuted;
  const fileName = attachment.name || 'Audio';

  return (
    <View style={[styles.container, isOwnMessage && styles.containerOwn]}>
      {/* Play button */}
      <TouchableOpacity onPress={togglePlay}
        style={[styles.playBtn, isOwnMessage && styles.playBtnOwn]}
        activeOpacity={0.8} disabled={isLoadingUrl}>
        {isLoadingUrl || isBuffering
          ? <ActivityIndicator size="small" color={isOwnMessage ? '#FFF' : COLORS.primary} />
          : urlError
            ? <Ionicons name="reload-outline" size={18} color={isOwnMessage ? '#FFF' : COLORS.primary} />
            : <Ionicons name={isPlaying ? 'pause' : 'play'} size={18}
                color={isOwnMessage ? '#FFF' : COLORS.primary}
                style={isPlaying ? {} : { marginLeft: 2 }} />}
      </TouchableOpacity>

      {/* Right column */}
      <View style={styles.rightCol}>
        {/* Name row + rate + download */}
        <View style={styles.nameRow}>
          <Ionicons name="musical-notes-outline" size={11} color={mc} />
          <Text style={[styles.fileName, { color: mc }]} numberOfLines={1}>{fileName}</Text>
          <TouchableOpacity onPress={cycleRate}
            style={[styles.rateChip, isOwnMessage && styles.rateChipOwn, rate !== 1 && styles.rateChipActive]}
            activeOpacity={0.7}>
            <Text style={[styles.rateText, isOwnMessage && styles.rateTextOwn, rate !== 1 && { color: COLORS.primary }]}>
              {rate}×
            </Text>
          </TouchableOpacity>
          {/* Part 18D: download button */}
          <TouchableOpacity onPress={handleDownload}
            style={[styles.dlBtn, isOwnMessage && styles.dlBtnOwn]}
            disabled={isDownloading} activeOpacity={0.7}>
            {isDownloading
              ? <ActivityIndicator size="small" color={isOwnMessage ? '#FFF' : COLORS.primary} />
              : <Ionicons name="download-outline" size={13} color={isOwnMessage ? 'rgba(255,255,255,0.7)' : COLORS.textMuted} />}
          </TouchableOpacity>
        </View>

        {/* Waveform */}
        <View style={styles.waveRow}>
          {IDLE_HEIGHTS.map((h, i) => (
            <WaveBar key={i} baseHeight={h} isPlaying={isPlaying}
              isOwnMessage={isOwnMessage} isFilled={i / BAR_COUNT <= pf} />
          ))}
        </View>

        {/* Seek bar */}
        <View style={styles.seekRow}>
          <Text style={[styles.timeTxt, { color: mc }]}>{fmt(positionMs)}</Text>
          <TouchableOpacity style={styles.progressTrack} onPress={seekTap} activeOpacity={1}
            onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width || 1)}>
            <View style={styles.progressBg} />
            <View style={[styles.progressFill, {
              width: `${pf * 100}%`,
              backgroundColor: isOwnMessage ? 'rgba(255,255,255,0.9)' : COLORS.primary,
            }]} />
            <View style={[styles.progressThumb, {
              left: `${pf * 100}%`,
              backgroundColor: isOwnMessage ? '#FFF' : COLORS.primary,
            }]} />
          </TouchableOpacity>
          <Text style={[styles.timeTxt, { color: mc }]}>{fmt(durationMs)}</Text>
        </View>

        {urlError && (
          <Text style={[styles.errTxt, { color: isOwnMessage ? 'rgba(255,200,200,0.9)' : COLORS.error }]}>
            {urlError}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, width: 260 },
  containerOwn: {},
  playBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: `${COLORS.primary}20`, borderWidth: 1.5, borderColor: `${COLORS.primary}50`, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 },
  playBtnOwn:   { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.5)' },
  rightCol:     { flex: 1, gap: 4 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fileName:     { flex: 1, fontSize: 10, fontWeight: '600' },
  rateChip:     { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.border },
  rateChipOwn:  { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' },
  rateChipActive:{ borderColor: `${COLORS.primary}60` },
  rateText:     { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  rateTextOwn:  { color: 'rgba(255,255,255,0.7)' },
  dlBtn:        { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  dlBtnOwn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' },
  waveRow:      { flexDirection: 'row', alignItems: 'center', gap: 2, height: BAR_MAX_H + 2, overflow: 'hidden' },
  bar:          { flex: 1, borderRadius: 2, minWidth: 2 },
  seekRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  timeTxt:      { fontSize: 9, fontWeight: '600', minWidth: 28 },
  progressTrack:{ flex: 1, height: 16, justifyContent: 'center', position: 'relative' },
  progressBg:   { height: 3, backgroundColor: COLORS.border, borderRadius: 2, position: 'absolute', left: 0, right: 0 },
  progressFill: { height: 3, borderRadius: 2, position: 'absolute', left: 0 },
  progressThumb:{ position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, top: 3, elevation: 2 },
  errTxt:       { fontSize: 9, fontWeight: '600', marginTop: 2 },
});