// src/components/workspace/VideoPlayerBubble.tsx
// Part 18D — Download button added to full-screen player.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Dimensions, ActivityIndicator, StatusBar, LayoutChangeEvent, Alert,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAttachment } from '../../types/chat';
import { getSignedUrl, openOrDownloadAttachment } from '../../services/chatAttachmentService';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const THUMB_W = 220; const THUMB_H = 140;
const CONTROLS_HIDE_MS = 3500;

function fmt(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface Props { attachment: ChatAttachment; isOwnMessage: boolean; }

export function VideoPlayerBubble({ attachment, isOwnMessage }: Props) {
  const [signedUrl,    setSignedUrl]    = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError,     setUrlError]     = useState<string | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isBuffering,  setIsBuffering]  = useState(false);
  const [isMuted,      setIsMuted]      = useState(false);
  const [positionMs,   setPositionMs]   = useState(0);
  const [durationMs,   setDurationMs]   = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [trackWidth,   setTrackWidth]   = useState(1);
  const [isDownloading,setIsDownloading]= useState(false);

  const videoRef  = useRef<Video>(null);
  const insets    = useSafeAreaInsets();
  const ctrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSeeking = useRef(false);

  const fetchUrl = useCallback(async (): Promise<string | null> => {
    if (signedUrl) return signedUrl;
    setIsLoadingUrl(true); setUrlError(null);
    const url = await getSignedUrl(attachment.url);
    setIsLoadingUrl(false);
    if (!url) { setUrlError('Could not load video'); return null; }
    setSignedUrl(url); return url;
  }, [attachment.url, signedUrl]);

  const showCtrl = useCallback(() => {
    setShowControls(true);
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => () => { if (ctrlTimer.current) clearTimeout(ctrlTimer.current); }, []);

  const handleOpen = useCallback(async () => {
    const url = await fetchUrl(); if (!url) return;
    setModalOpen(true); setIsPlaying(true); showCtrl();
  }, [fetchUrl, showCtrl]);

  const handleStatus = useCallback((s: AVPlaybackStatus) => {
    if (!s.isLoaded) { setIsBuffering(true); return; }
    setIsBuffering(false); setIsPlaying(s.isPlaying);
    if (!isSeeking.current) setPositionMs(s.positionMillis ?? 0);
    if (s.durationMillis) setDurationMs(s.durationMillis);
    if (s.didJustFinish) {
      setIsPlaying(false); setPositionMs(0); videoRef.current?.setPositionAsync(0);
      setShowControls(true); if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    }
  }, []);

  const togglePlay = useCallback(async () => {
    if (isPlaying) await videoRef.current?.pauseAsync(); else await videoRef.current?.playAsync();
    showCtrl();
  }, [isPlaying, showCtrl]);

  const skip = useCallback(async (sec: number) => {
    const p = Math.max(0, Math.min(positionMs + sec * 1000, durationMs || 0));
    await videoRef.current?.setPositionAsync(p); setPositionMs(p); showCtrl();
  }, [positionMs, durationMs, showCtrl]);

  const seekTap = useCallback(async (e: { nativeEvent: { locationX: number } }) => {
    if (!durationMs || !trackWidth) return;
    const p = Math.floor(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth)) * durationMs);
    isSeeking.current = true; setPositionMs(p);
    await videoRef.current?.setPositionAsync(p); isSeeking.current = false; showCtrl();
  }, [durationMs, trackWidth, showCtrl]);

  const handleClose = useCallback(async () => {
    await videoRef.current?.pauseAsync(); setIsPlaying(false); setModalOpen(false);
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
  }, []);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    const { error } = await openOrDownloadAttachment(attachment);
    setIsDownloading(false);
    if (error) Alert.alert('Download failed', error);
  }, [attachment, isDownloading]);

  const pf = durationMs > 0 ? positionMs / durationMs : 0;
  const fn = attachment.name || 'Video';

  return (
    <>
      <TouchableOpacity onPress={handleOpen} activeOpacity={0.88}
        style={[styles.thumb, isOwnMessage && styles.thumbOwn]} disabled={isLoadingUrl}>
        <View style={styles.overlay}>
          {isLoadingUrl ? <ActivityIndicator color="#FFF" size="small" />
            : urlError ? <><Ionicons name="alert-circle-outline" size={22} color="#FFF" /><Text style={styles.thumbErr}>Tap to retry</Text></>
            : <View style={styles.playCircle}><Ionicons name="play" size={22} color="#FFF" style={{ marginLeft: 3 }} /></View>}
        </View>
        <View style={styles.thumbFooter}>
          <Ionicons name="videocam-outline" size={11} color="rgba(255,255,255,0.8)" />
          <Text style={styles.thumbName} numberOfLines={1}>{fn}</Text>
          {durationMs > 0 && <Text style={styles.thumbDur}>{fmt(durationMs)}</Text>}
        </View>
      </TouchableOpacity>

      <Modal visible={modalOpen} animationType="fade" transparent={false}
        onRequestClose={handleClose} statusBarTranslucent supportedOrientations={['portrait','landscape']}>
        <StatusBar hidden />
        <TouchableOpacity activeOpacity={1} style={styles.bg} onPress={() => setShowControls(v => { if (!v) showCtrl(); return !v; })}>
          {signedUrl
            ? <Video ref={videoRef} source={{ uri: signedUrl }} style={styles.video}
                resizeMode={ResizeMode.CONTAIN} isMuted={isMuted} shouldPlay={isPlaying}
                onPlaybackStatusUpdate={handleStatus} useNativeControls={false} />
            : <ActivityIndicator size="large" color={COLORS.primary} />}
          {isBuffering && signedUrl && <View style={styles.bufWrap}><ActivityIndicator size="large" color="rgba(255,255,255,0.85)" /></View>}

          {showControls && (
            <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)}
              style={styles.ctrlWrap} pointerEvents="box-none">
              {/* Top */}
              <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 4, 20) }]}>
                <TouchableOpacity onPress={handleClose} style={styles.ctrlBtn}><Ionicons name="close" size={20} color="#FFF" /></TouchableOpacity>
                <Text style={styles.titleLbl} numberOfLines={1}>{fn}</Text>
                {/* Download */}
                <TouchableOpacity onPress={handleDownload} style={styles.ctrlBtn} disabled={isDownloading}>
                  {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="download-outline" size={20} color="#FFF" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsMuted(v => !v)} style={styles.ctrlBtn}>
                  <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
              {/* Centre */}
              <View style={styles.centre} pointerEvents="box-none">
                <TouchableOpacity onPress={() => skip(-10)} style={styles.skipBtn} activeOpacity={0.7}>
                  <Ionicons name="play-back" size={26} color="#FFF" /><Text style={styles.skipLbl}>10</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlay} style={styles.bigBtn} activeOpacity={0.8}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={38} color="#FFF" style={isPlaying ? {} : { marginLeft: 4 }} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => skip(10)} style={styles.skipBtn} activeOpacity={0.7}>
                  <Ionicons name="play-forward" size={26} color="#FFF" /><Text style={styles.skipLbl}>10</Text>
                </TouchableOpacity>
              </View>
              {/* Bottom */}
              <View style={[styles.botBar, { paddingBottom: Math.max(insets.bottom + 8, 28) }]}>
                <Text style={styles.timeTxt}>{fmt(positionMs)}</Text>
                <TouchableOpacity style={styles.track} onPress={seekTap} activeOpacity={1} onLayout={e => setTrackWidth(e.nativeEvent.layout.width || 1)}>
                  <View style={[styles.fill, { width: `${pf * 100}%` }]} />
                  <View style={[styles.thumb2, { left: `${pf * 100}%` }]} />
                </TouchableOpacity>
                <Text style={styles.timeTxt}>{fmt(durationMs)}</Text>
              </View>
            </Animated.View>
          )}
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb:     { width: THUMB_W, height: THUMB_H, borderRadius: RADIUS.lg, backgroundColor: '#0D0D1A', overflow: 'hidden', marginVertical: 4 },
  thumbOwn:  { alignSelf: 'flex-end' },
  overlay:   { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  playCircle:{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  thumbErr:  { color: 'rgba(255,255,255,0.8)', fontSize: FONTS.sizes.xs, fontWeight: '600' },
  thumbFooter:{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.6)' },
  thumbName: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' },
  thumbDur:  { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700' },
  bg:        { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  video:     { width: SCREEN_W, height: SCREEN_H },
  bufWrap:   { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  ctrlWrap:  { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: 12, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  ctrlBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleLbl:  { flex: 1, color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '600' },
  centre:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44 },
  skipBtn:   { alignItems: 'center', gap: 2, padding: 8 },
  skipLbl:   { color: '#FFF', fontSize: 10, fontWeight: '800' },
  bigBtn:    { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  botBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: 12, gap: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  timeTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: FONTS.sizes.xs, fontWeight: '600', minWidth: 38, textAlign: 'center' },
  track:     { flex: 1, height: 20, justifyContent: 'center', position: 'relative' },
  fill:      { height: 4, backgroundColor: COLORS.primary, borderRadius: 2, position: 'absolute', left: 0 },
  thumb2:    { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF', marginLeft: -7, top: 3, elevation: 3 },
});