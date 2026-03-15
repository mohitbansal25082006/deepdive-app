// src/components/workspace/DocumentPreviewModal.tsx
// Part 18C — PPT/PPTX Google Slides viewer; "format not supported" state

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator,
  StyleSheet, Share, Platform, Dimensions, Linking,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAttachment } from '../../types/chat';
import {
  getSignedUrl, openOrDownloadAttachment,
  getFileIcon, getMimeLabel, isPreviewableMime,
} from '../../services/chatAttachmentService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

function getViewerUrl(signedUrl: string, mimeType: string): string | null {
  const encoded = encodeURIComponent(signedUrl);
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv')
    return `https://docs.google.com/spreadsheets/d?url=${encoded}&embedded=true`;
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
    return `https://docs.google.com/presentation/d?url=${encoded}&embedded=true`;
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType === 'text/plain')
    return `https://docs.google.com/viewer?url=${encoded}&embedded=true`;
  return null;
}

// ─── Trigger chip ─────────────────────────────────────────────────────────────

interface TriggerProps { attachment: ChatAttachment; isOwnMessage: boolean; }

export function DocumentPreviewTrigger({ attachment, isOwnMessage }: TriggerProps) {
  const [open, setOpen] = useState(false);
  const canPreview = isPreviewableMime(attachment.type);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.trigger, isOwnMessage && styles.triggerOwn]}
        activeOpacity={0.75}
      >
        <View style={[styles.triggerIcon, isOwnMessage && styles.triggerIconOwn]}>
          <Ionicons
            name={getFileIcon(attachment.type) as any}
            size={16}
            color={isOwnMessage ? 'rgba(255,255,255,0.85)' : COLORS.primary}
          />
        </View>
        <View style={styles.triggerMeta}>
          <Text style={[styles.triggerName, isOwnMessage && styles.triggerNameOwn]} numberOfLines={1}>
            {attachment.name || 'Document'}
          </Text>
          <Text style={[styles.triggerSub, isOwnMessage && styles.triggerSubOwn]}>
            {getMimeLabel(attachment.type)} · {canPreview ? 'Tap to preview' : 'Tap to download'}
          </Text>
        </View>
        <Ionicons
          name={canPreview ? 'eye-outline' : 'download-outline'}
          size={14}
          color={isOwnMessage ? 'rgba(255,255,255,0.6)' : COLORS.textMuted}
        />
      </TouchableOpacity>
      {open && <DocumentPreviewModal attachment={attachment} visible={open} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface ModalProps { attachment: ChatAttachment; visible: boolean; onClose: () => void; }

export function DocumentPreviewModal({ attachment, visible, onClose }: ModalProps) {
  const insets = useSafeAreaInsets();

  const [viewerUrl,     setViewerUrl]     = useState<string | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notSupported,  setNotSupported]  = useState(false);

  const signedRef   = useRef<string | null>(null);
  const isFirstLoad = useRef(true);

  const buildViewerUrl = useCallback(async () => {
    if (viewerUrl || isFetchingUrl || notSupported) return;

    if (!isPreviewableMime(attachment.type)) {
      setNotSupported(true); return;
    }

    setIsFetchingUrl(true); setLoadError(null);

    const signed = await getSignedUrl(attachment.url);
    if (!signed) { setLoadError('Could not load document. Try downloading it instead.'); setIsFetchingUrl(false); return; }

    signedRef.current = signed;
    const url = getViewerUrl(signed, attachment.type);
    if (!url) { setNotSupported(true); } else { setViewerUrl(url); }
    setIsFetchingUrl(false);
  }, [attachment.url, attachment.type, viewerUrl, isFetchingUrl, notSupported]);

  React.useEffect(() => {
    if (visible && !viewerUrl && !notSupported) buildViewerUrl();
  }, [visible]);

  const handleClose = useCallback(() => {
    setIsLoading(true); setLoadError(null); isFirstLoad.current = true; onClose();
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    await openOrDownloadAttachment(attachment);
    setIsDownloading(false);
  }, [attachment, isDownloading]);

  const handleShare = useCallback(async () => {
    if (!signedRef.current) return;
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? attachment.name : signedRef.current,
        url:     Platform.OS === 'ios' ? signedRef.current : undefined,
        title:   attachment.name,
      });
    } catch {}
  }, [attachment.name]);

  const handleLoadEnd   = useCallback(() => { setIsLoading(false); isFirstLoad.current = false; }, []);
  const handleLoadError = useCallback(() => {
    setIsLoading(false);
    setLoadError('Preview could not load. Google Docs Viewer requires an internet connection.');
    isFirstLoad.current = false;
  }, []);
  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.url && !nav.url.includes('docs.google.com') && !nav.url.includes('about:blank')) {
      Linking.openURL(nav.url).catch(() => {});
    }
  }, []);

  const mimeLabel = getMimeLabel(attachment.type);
  const fileIcon  = getFileIcon(attachment.type) as any;

  return (
    <Modal visible={visible} animationType="none" transparent={false} onRequestClose={handleClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>

        {/* Top bar */}
        <Animated.View entering={FadeIn.duration(250)} style={styles.topBar}>
          <TouchableOpacity onPress={handleClose} style={styles.topBtn}>
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <View style={styles.mimeChip}>
              <Ionicons name={fileIcon} size={12} color={COLORS.primary} />
              <Text style={styles.mimeLabel}>{mimeLabel}</Text>
            </View>
            <Text style={styles.topName} numberOfLines={1}>{attachment.name || 'Document'}</Text>
          </View>
          <View style={styles.topActions}>
            {signedRef.current && (
              <TouchableOpacity onPress={handleShare} style={styles.topBtn}>
                <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDownload} style={styles.topBtn} disabled={isDownloading}>
              {isDownloading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="download-outline" size={18} color={COLORS.textSecondary} />}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Fetching signed URL */}
        {isFetchingUrl && (
          <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.centerText}>Preparing preview…</Text></View>
        )}

        {/* Format not supported */}
        {!isFetchingUrl && notSupported && (
          <Animated.View entering={SlideInDown.duration(300)} style={styles.errorScreen}>
            <View style={styles.errorIcon}><Ionicons name={fileIcon} size={44} color={COLORS.textMuted} /></View>
            <Text style={styles.errorTitle}>Preview not available</Text>
            <Text style={styles.errorDesc}>{`${mimeLabel} files cannot be previewed inline.\n\nTap below to open in an external app.`}</Text>
            <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} disabled={isDownloading}>
              {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="open-outline" size={17} color="#FFF" />}
              <Text style={styles.downloadBtnText}>{isDownloading ? 'Opening…' : 'Open in App'}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Load error */}
        {!isFetchingUrl && !notSupported && loadError && (
          <Animated.View entering={SlideInDown.duration(300)} style={styles.errorScreen}>
            <View style={styles.errorIcon}><Ionicons name={fileIcon} size={44} color={COLORS.textMuted} /></View>
            <Text style={styles.errorTitle}>Preview unavailable</Text>
            <Text style={styles.errorDesc}>{loadError}</Text>
            <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} disabled={isDownloading}>
              {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="download-outline" size={17} color="#FFF" />}
              <Text style={styles.downloadBtnText}>{isDownloading ? 'Downloading…' : 'Download to Open'}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* WebView */}
        {!isFetchingUrl && !notSupported && !loadError && viewerUrl && (
          <>
            <WebView
              source={{ uri: viewerUrl }}
              style={styles.webview}
              onLoadEnd={handleLoadEnd}
              onError={handleLoadError}
              onNavigationStateChange={handleNavChange}
              javaScriptEnabled domStorageEnabled scalesPageToFit
              startInLoadingState={false}
              originWhitelist={['https://*', 'http://*']}
              userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/118.0.0.0 Mobile Safari/537.36"
            />
            {isLoading && (
              <View style={styles.webviewOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.centerText}>Loading preview…</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: COLORS.background },
  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard, gap: 8 },
  topBtn:      { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:   { flex: 1, alignItems: 'center', gap: 3 },
  mimeChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  mimeLabel:   { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  topName:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', maxWidth: SCREEN_W - 140, textAlign: 'center' },
  topActions:  { flexDirection: 'row', gap: 4 },
  webview:     { flex: 1, backgroundColor: COLORS.background },
  webviewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText:  { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 16 },
  errorIcon:   { width: 88, height: 88, borderRadius: 26, backgroundColor: `${COLORS.textMuted}12`, alignItems: 'center', justifyContent: 'center' },
  errorTitle:  { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  errorDesc:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: 13, marginTop: SPACING.sm },
  downloadBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },
  trigger:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border },
  triggerOwn:      { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' },
  triggerIcon:     { width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  triggerIconOwn:  { backgroundColor: 'rgba(255,255,255,0.15)' },
  triggerMeta:     { flex: 1 },
  triggerName:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  triggerNameOwn:  { color: '#FFF' },
  triggerSub:      { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  triggerSubOwn:   { color: 'rgba(255,255,255,0.55)' },
});