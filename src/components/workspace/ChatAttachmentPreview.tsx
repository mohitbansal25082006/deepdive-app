// src/components/workspace/ChatAttachmentPreview.tsx
// Part 17 — Attachment display components (FIXED)
//
// Fixes applied:
//   1. BLUE SCREEN on images — <Image source={{ uri: publicUrl }}> returned
//      400 because the bucket is PRIVATE. React Native's Image renders a
//      blank/blue view on HTTP errors. Fix: useSignedUrl() hook resolves
//      a fresh 1-hour signed URL before rendering the <Image>.
//
//   2. HTTP 400 on download — FileSystem.downloadAsync(publicUrl) fails for
//      the same reason. Fix: openOrDownloadAttachment() now calls
//      createSignedUrl() internally before downloading (in service layer).
//
//   3. Image-only messages now load correctly because signed URLs are fetched
//      asynchronously per-image and cached in component state.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  StagedAttachment,
  formatFileSize,
  getFileIcon,
  isImageMime,
  openOrDownloadAttachment,
  getSignedUrl,
} from '../../services/chatAttachmentService';
import { ChatAttachment } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Hook: resolve a signed URL for any stored attachment URL/path ────────────

function useSignedUrl(urlOrPath: string | undefined): {
  signedUrl: string | null;
  isLoading: boolean;
} {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!urlOrPath) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getSignedUrl(urlOrPath).then(url => {
      if (!cancelled) {
        setSignedUrl(url);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [urlOrPath]);

  return { signedUrl, isLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. StagedAttachmentsStrip
// ─────────────────────────────────────────────────────────────────────────────

interface StagedStripProps {
  attachments: StagedAttachment[];
  onRemove:    (localId: string) => void;
}

export function StagedAttachmentsStrip({ attachments, onRemove }: StagedStripProps) {
  if (attachments.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.strip}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripScroll}
        keyboardShouldPersistTaps="handled"
      >
        {attachments.map(att => (
          <StagedItem key={att.localId} att={att} onRemove={onRemove} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function StagedItem({
  att,
  onRemove,
}: {
  att:      StagedAttachment;
  onRemove: (id: string) => void;
}) {
  const isImg = isImageMime(att.mimeType);
  return (
    <Animated.View entering={ZoomIn.duration(200)} style={styles.stagedItem}>
      {isImg ? (
        <Image source={{ uri: att.localUri }} style={styles.stagedThumb} resizeMode="cover" />
      ) : (
        <View style={styles.stagedFileIcon}>
          <Ionicons name={getFileIcon(att.mimeType) as any} size={24} color={COLORS.primary} />
        </View>
      )}
      <View style={styles.stagedMeta}>
        <Text style={styles.stagedName} numberOfLines={1}>{att.name}</Text>
        {att.size !== undefined && (
          <Text style={styles.stagedSize}>{formatFileSize(att.size)}</Text>
        )}
      </View>
      {att.status === 'uploading' && (
        <View style={styles.stagedProgressOverlay}>
          <View style={[styles.stagedProgressBar, { width: `${att.progress}%` }]} />
          <ActivityIndicator size="small" color={COLORS.primary} style={styles.stagedSpinner} />
        </View>
      )}
      {att.status === 'error' && (
        <View style={styles.stagedErrorOverlay}>
          <Ionicons name="alert-circle" size={18} color={COLORS.error} />
        </View>
      )}
      {att.status === 'done' && (
        <View style={styles.stagedDoneOverlay}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
        </View>
      )}
      {att.status !== 'uploading' && (
        <TouchableOpacity
          onPress={() => onRemove(att.localId)}
          style={styles.stagedRemoveBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="close" size={12} color="#FFF" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BubbleAttachments
// ─────────────────────────────────────────────────────────────────────────────

interface BubbleAttachmentsProps {
  attachments:  ChatAttachment[];
  isOwnMessage: boolean;
}

export function BubbleAttachments({ attachments, isOwnMessage }: BubbleAttachmentsProps) {
  const [lightboxAtt,  setLightboxAtt]  = useState<ChatAttachment | null>(null);
  const [downloading,  setDownloading]  = useState<string | null>(null);
  const [downloadPct,  setDownloadPct]  = useState(0);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter(a => isImageMime(a.type));
  const files  = attachments.filter(a => !isImageMime(a.type));

  const handleOpenFile = useCallback(async (att: ChatAttachment) => {
    if (downloading) return;
    setDownloading(att.url);
    setDownloadPct(0);
    const { error } = await openOrDownloadAttachment(att, (pct) => setDownloadPct(pct));
    setDownloading(null);
    setDownloadPct(0);
    if (error) Alert.alert('Could not open file', error);
  }, [downloading]);

  const handleShareFromLightbox = useCallback(async (att: ChatAttachment) => {
    setLightboxAtt(null);
    setTimeout(async () => {
      if (downloading) return;
      setDownloading(att.url);
      const { error } = await openOrDownloadAttachment(att, (pct) => setDownloadPct(pct));
      setDownloading(null);
      setDownloadPct(0);
      if (error) Alert.alert('Could not share image', error);
    }, 300);
  }, [downloading]);

  return (
    <>
      {/* Image grid */}
      {images.length > 0 && (
        <View style={[
          styles.imageGrid,
          images.length === 1 ? styles.imageGridSingle : styles.imageGridMulti,
        ]}>
          {images.map((img, i) => (
            <SignedImageThumb
              key={i}
              attachment={img}
              single={images.length === 1}
              onPress={() => setLightboxAtt(img)}
            />
          ))}
        </View>
      )}

      {/* File chips */}
      {files.length > 0 && (
        <View style={styles.fileChips}>
          {files.map((file, i) => (
            <FileChip
              key={i}
              file={file}
              isOwnMessage={isOwnMessage}
              isDownloading={downloading === file.url}
              downloadPct={downloadPct}
              onPress={() => handleOpenFile(file)}
            />
          ))}
        </View>
      )}

      {/* Global download progress */}
      {downloading && !lightboxAtt && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.globalDownloadBar}>
          <ActivityIndicator
            size="small"
            color={isOwnMessage ? 'rgba(255,255,255,0.8)' : COLORS.primary}
          />
          <Text style={[
            styles.globalDownloadText,
            isOwnMessage && { color: 'rgba(255,255,255,0.7)' },
          ]}>
            {downloadPct < 100 ? `Downloading… ${downloadPct}%` : 'Opening…'}
          </Text>
        </Animated.View>
      )}

      {/* Lightbox for images */}
      <LightboxModal
        attachment={lightboxAtt}
        isDownloading={downloading === lightboxAtt?.url}
        onClose={() => setLightboxAtt(null)}
        onShare={() => lightboxAtt && handleShareFromLightbox(lightboxAtt)}
      />
    </>
  );
}

// ─── Signed image thumbnail ───────────────────────────────────────────────────
// Resolves signed URL before rendering — fixes the blue screen bug.

function SignedImageThumb({
  attachment,
  single,
  onPress,
}: {
  attachment: ChatAttachment;
  single:     boolean;
  onPress:    () => void;
}) {
  const { signedUrl, isLoading } = useSignedUrl(attachment.url);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.imageThumbWrap,
        single ? styles.imageThumbSingle : styles.imageThumbMulti,
      ]}
    >
      {isLoading || !signedUrl ? (
        // Loading placeholder
        <View style={[
          styles.imageThumb,
          styles.imageThumbPlaceholder,
          single ? styles.imageThumbSingle : styles.imageThumbMulti,
        ]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <Image
          source={{ uri: signedUrl }}
          style={[
            styles.imageThumb,
            single ? styles.imageThumbSingle : styles.imageThumbMulti,
          ]}
          resizeMode="cover"
          onError={(e) => console.warn('[SignedImageThumb] image error:', e.nativeEvent.error)}
        />
      )}
      <View style={styles.imageTapHint}>
        <Ionicons name="expand-outline" size={14} color="rgba(255,255,255,0.85)" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Lightbox modal ───────────────────────────────────────────────────────────
// Also uses signed URL so the full-res image loads correctly.

function LightboxModal({
  attachment,
  isDownloading,
  onClose,
  onShare,
}: {
  attachment:   ChatAttachment | null;
  isDownloading: boolean;
  onClose:      () => void;
  onShare:      () => void;
}) {
  const { signedUrl, isLoading } = useSignedUrl(attachment?.url);

  return (
    <Modal
      visible={!!attachment}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.lightboxOverlay}>
        {/* Close */}
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Image */}
        {isLoading || !signedUrl ? (
          <View style={styles.lightboxLoadingWrap}>
            <ActivityIndicator size="large" color="#FFF" />
            <Text style={styles.lightboxLoadingText}>Loading image…</Text>
          </View>
        ) : (
          <Image
            source={{ uri: signedUrl }}
            style={styles.lightboxImage}
            resizeMode="contain"
            onError={(e) => console.warn('[Lightbox] image error:', e.nativeEvent.error)}
          />
        )}

        {/* Actions */}
        <View style={styles.lightboxActions}>
          <TouchableOpacity
            style={styles.lightboxActionBtn}
            onPress={onShare}
            activeOpacity={0.8}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="share-outline" size={20} color="#FFF" />
            )}
            <Text style={styles.lightboxActionText}>
              {isDownloading ? 'Downloading…' : 'Share / Save'}
            </Text>
          </TouchableOpacity>

          {attachment?.name && (
            <Text style={styles.lightboxFilename} numberOfLines={1}>
              {attachment.name}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── File chip ────────────────────────────────────────────────────────────────

function FileChip({
  file, isOwnMessage, isDownloading, downloadPct, onPress,
}: {
  file:          ChatAttachment;
  isOwnMessage:  boolean;
  isDownloading: boolean;
  downloadPct:   number;
  onPress:       () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      disabled={isDownloading}
      style={[styles.fileChip, isOwnMessage && styles.fileChipOwn]}
    >
      <View style={[styles.fileChipIcon, isOwnMessage && styles.fileChipIconOwn]}>
        {isDownloading ? (
          <ActivityIndicator
            size="small"
            color={isOwnMessage ? 'rgba(255,255,255,0.85)' : COLORS.primary}
          />
        ) : (
          <Ionicons
            name={getFileIcon(file.type) as any}
            size={18}
            color={isOwnMessage ? 'rgba(255,255,255,0.85)' : COLORS.primary}
          />
        )}
      </View>

      <View style={styles.fileChipMeta}>
        <Text
          style={[styles.fileChipName, isOwnMessage && styles.fileChipNameOwn]}
          numberOfLines={1}
        >
          {file.name}
        </Text>
        {isDownloading ? (
          <Text style={[styles.fileChipSize, isOwnMessage && styles.fileChipSizeOwn]}>
            {downloadPct < 100 ? `${downloadPct}%` : 'Opening…'}
          </Text>
        ) : file.size !== undefined ? (
          <Text style={[styles.fileChipSize, isOwnMessage && styles.fileChipSizeOwn]}>
            {formatFileSize(file.size)}
          </Text>
        ) : null}
        {isDownloading && (
          <View style={styles.fileChipProgressTrack}>
            <View style={[
              styles.fileChipProgressFill,
              {
                width: `${downloadPct}%`,
                backgroundColor: isOwnMessage
                  ? 'rgba(255,255,255,0.7)'
                  : COLORS.primary,
              },
            ]} />
          </View>
        )}
      </View>

      {!isDownloading && (
        <Ionicons
          name="download-outline"
          size={16}
          color={isOwnMessage ? 'rgba(255,255,255,0.6)' : COLORS.textMuted}
        />
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STAGED_ITEM_W = 100;

const styles = StyleSheet.create({
  strip: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard, paddingVertical: SPACING.sm,
  },
  stripScroll: {
    paddingHorizontal: SPACING.md, gap: 10,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  stagedItem: {
    width: STAGED_ITEM_W, backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  stagedThumb:    { width: STAGED_ITEM_W, height: 70, backgroundColor: COLORS.backgroundElevated },
  stagedFileIcon: { width: STAGED_ITEM_W, height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}10` },
  stagedMeta:     { padding: 6 },
  stagedName:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  stagedSize:     { color: COLORS.textMuted, fontSize: 9, marginTop: 1 },
  stagedProgressOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', top: 0, height: 70 },
  stagedProgressBar:     { position: 'absolute', bottom: 0, left: 0, height: 3, backgroundColor: COLORS.primary },
  stagedSpinner:         { position: 'absolute', top: '40%', alignSelf: 'center' },
  stagedErrorOverlay:    { position: 'absolute', top: 6, left: 6, backgroundColor: `${COLORS.error}20`, borderRadius: 10, padding: 2 },
  stagedDoneOverlay:     { position: 'absolute', top: 6, left: 6, backgroundColor: `${COLORS.success}20`, borderRadius: 10, padding: 2 },
  stagedRemoveBtn:       { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },

  imageGrid:       { marginTop: 6, marginBottom: 4 },
  imageGridSingle: {},
  imageGridMulti:  { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },

  imageThumbWrap:         { overflow: 'hidden', borderRadius: RADIUS.md, position: 'relative' },
  imageThumbSingle:       { width: 220, height: 180, borderRadius: RADIUS.lg },
  imageThumbMulti:        { width: 106, height: 106 },
  imageThumb:             { width: '100%', height: '100%' },
  imageThumbPlaceholder:  { backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  imageTapHint:           { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: 3 },

  fileChips: { gap: 5, marginTop: 6 },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  fileChipOwn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' },
  fileChipIcon:    { width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fileChipIconOwn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  fileChipMeta:    { flex: 1 },
  fileChipName:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  fileChipNameOwn: { color: '#FFFFFF' },
  fileChipSize:    { color: COLORS.textMuted, fontSize: 10, marginTop: 1 },
  fileChipSizeOwn: { color: 'rgba(255,255,255,0.6)' },
  fileChipProgressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1, marginTop: 4, overflow: 'hidden' },
  fileChipProgressFill:  { height: '100%', borderRadius: 1 },

  globalDownloadBar:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 4 },
  globalDownloadText: { color: COLORS.textMuted, fontSize: 10 },

  lightboxOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute', top: 50, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  lightboxImage: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  lightboxLoadingWrap: { alignItems: 'center', gap: 12 },
  lightboxLoadingText: { color: 'rgba(255,255,255,0.6)', fontSize: FONTS.sizes.sm },
  lightboxActions: {
    position: 'absolute', bottom: 50,
    width: '100%', paddingHorizontal: SPACING.xl,
    alignItems: 'center', gap: 10,
  },
  lightboxActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  lightboxActionText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '600' },
  lightboxFilename:   { color: 'rgba(255,255,255,0.5)', fontSize: FONTS.sizes.xs, textAlign: 'center', maxWidth: SCREEN_W - 40 },
});