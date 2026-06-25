// src/components/workspace/ChatFileFilter.tsx
// Part 18 — File search and filtering panel for workspace chat.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
//             No dark-only assumptions.

import React, {
  useState,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isImageMime,
  isVideoMime,
  formatFileSize,
  getFileIcon,
  getSignedUrl,
  openOrDownloadAttachment,
} from '../../services/chatAttachmentService';
import { ChatMessage, ChatAttachment } from '../../types/chat';
import { ChatFileFilterType } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.88;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  messageId:  string;
  attachment: ChatAttachment;
  sentAt:     string;
  authorName: string | null;
}

function isExcludedFromFilesPanel(att: ChatAttachment): boolean {
  if ((att as any).type === 'sticker') return true;
  if (att.type === 'image/gif') return true;
  if ((att as any).mime_type === 'image/gif') return true;
  return false;
}

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: { type: ChatFileFilterType; label: string; icon: string }[] = [
  { type: 'all',       label: 'All',    icon: 'attach-outline' },
  { type: 'images',    label: 'Images', icon: 'image-outline' },
  { type: 'videos',    label: 'Videos', icon: 'videocam-outline' },
  { type: 'audio',     label: 'Audio',  icon: 'musical-notes-outline' },
  { type: 'documents', label: 'Docs',   icon: 'document-text-outline' },
];

function matchesFilter(mime: string, filter: ChatFileFilterType): boolean {
  switch (filter) {
    case 'all':       return true;
    case 'images':    return mime.startsWith('image/');
    case 'videos':    return mime.startsWith('video/');
    case 'audio':     return mime.startsWith('audio/');
    case 'documents': return !mime.startsWith('image/') && !mime.startsWith('video/') && !mime.startsWith('audio/');
    default:          return true;
  }
}

function entryKey(e: FileEntry) { return `${e.messageId}:${e.attachment.url}`; }

function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/');
}

// ─── Image thumbnail ──────────────────────────────────────────────────────────

function ImageThumb({ url }: { url: string }) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(
    isSupabaseStorageUrl(url) ? null : url,
  );
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    if (!isSupabaseStorageUrl(url)) { setDisplayUrl(url); return; }
    setDisplayUrl(null);
    getSignedUrl(url).then(signed => setDisplayUrl(signed ?? url));
  }, [url]);

  if (!displayUrl) {
    return (
      <View style={[styles.thumbPlaceholder, { backgroundColor: COLORS.backgroundCard }]}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }
  if (hasError) {
    return (
      <View style={[styles.thumbPlaceholder, { backgroundColor: COLORS.backgroundCard }]}>
        <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: displayUrl }}
      style={styles.imageThumb}
      resizeMode="cover"
      onError={() => setHasError(true)}
    />
  );
}

// ─── File entry card ──────────────────────────────────────────────────────────

interface FileCardProps {
  entry:      FileEntry;
  isSelected: boolean;
  onPress:    (entry: FileEntry) => void;
}

function FileCard({ entry, isSelected, onPress }: FileCardProps) {
  const { attachment, sentAt, authorName } = entry;
  const isImg = isImageMime(attachment.type);
  const isVid = isVideoMime(attachment.type);
  const icon  = getFileIcon(attachment.type) as any;
  const displayName = attachment.name || 'Attachment';
  const timeLabel   = new Date(sentAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={[
        styles.card, 
        { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
        isSelected && { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}08` }
      ]}
      onPress={() => onPress(entry)}
      activeOpacity={0.75}
    >
      <View style={styles.cardThumbWrap}>
        {isImg ? (
          <ImageThumb url={attachment.url} />
        ) : (
          <View style={[
            styles.fileIconWrap,
            { backgroundColor: `${COLORS.primary}12` },
            isVid && { backgroundColor: `${COLORS.info}15` },
            attachment.type.startsWith('audio/') && { backgroundColor: `${COLORS.warning}15` },
          ]}>
            <Ionicons
              name={icon}
              size={22}
              color={isVid ? COLORS.info : attachment.type.startsWith('audio/') ? COLORS.warning : COLORS.primary}
            />
          </View>
        )}
      </View>

      <View style={styles.cardMeta}>
        <Text style={[styles.cardName, { color: COLORS.textPrimary }]} numberOfLines={2}>{displayName}</Text>
        <View style={styles.cardSubRow}>
          {!!attachment.size && <Text style={[styles.cardSize, { color: COLORS.textMuted }]}>{formatFileSize(attachment.size)}</Text>}
          {!!attachment.size && <Text style={[styles.cardDot, { color: COLORS.textMuted }]}>·</Text>}
          <Text style={[styles.cardTime, { color: COLORS.textMuted }]}>{timeLabel}</Text>
        </View>
        {authorName && (
          <Text style={[styles.cardAuthor, { color: COLORS.textMuted }]} numberOfLines={1}>by {authorName}</Text>
        )}
      </View>

      {isSelected ? (
        <View style={styles.selectedCheck}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={13} color={COLORS.textMuted} />
      )}
    </TouchableOpacity>
  );
}

// ─── Open button meta ─────────────────────────────────────────────────────────

function openButtonMeta(att: ChatAttachment): { label: string; icon: string } {
  if (att.type.startsWith('image/')) return { label: 'View Image', icon: 'eye-outline' };
  return { label: 'Open File', icon: 'open-outline' };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible:           boolean;
  messages:          ChatMessage[];
  onClose:           () => void;
  onScrollToMessage: (messageId: string) => void;
}

export function ChatFileFilter({ visible, messages, onClose, onScrollToMessage }: Props) {
  const insets = useSafeAreaInsets();
  const [activeFilter,  setActiveFilter]  = useState<ChatFileFilterType>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [isOpening,     setIsOpening]     = useState(false);

  const allFiles = useMemo<FileEntry[]>(() => {
    const result: FileEntry[] = [];
    messages
      .filter(m => !m.isDeleted && m.attachments.length > 0)
      .forEach(m => {
        m.attachments.forEach(att => {
          if (isExcludedFromFilesPanel(att)) return;
          result.push({
            messageId:  m.id,
            attachment: att,
            sentAt:     m.createdAt,
            authorName: m.author?.fullName ?? m.author?.username ?? null,
          });
        });
      });
    return result.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }, [messages]);

  const filtered = useMemo<FileEntry[]>(() => {
    let result = allFiles.filter(e => matchesFilter(e.attachment.type, activeFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(e => (e.attachment.name ?? '').toLowerCase().includes(q));
    }
    return result;
  }, [allFiles, activeFilter, searchQuery]);

  const counts = useMemo<Record<ChatFileFilterType, number>>(() => ({
    all:       allFiles.length,
    images:    allFiles.filter(e => e.attachment.type.startsWith('image/')).length,
    videos:    allFiles.filter(e => e.attachment.type.startsWith('video/')).length,
    audio:     allFiles.filter(e => e.attachment.type.startsWith('audio/')).length,
    documents: allFiles.filter(e =>
      !e.attachment.type.startsWith('image/') &&
      !e.attachment.type.startsWith('video/') &&
      !e.attachment.type.startsWith('audio/'),
    ).length,
  }), [allFiles]);

  const handleCardPress = useCallback((entry: FileEntry) => {
    const key = entryKey(entry);
    setSelectedEntry(prev => prev && entryKey(prev) === key ? null : entry);
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!selectedEntry || isOpening) return;
    setIsOpening(true);
    const att = selectedEntry.attachment;
    if (att.type.startsWith('image/')) {
      let resolvedUrl: string | null = null;
      if (isSupabaseStorageUrl(att.url)) {
        resolvedUrl = await getSignedUrl(att.url);
        if (!resolvedUrl) resolvedUrl = att.url;
      } else {
        resolvedUrl = att.url;
      }
      try {
        await Linking.openURL(resolvedUrl);
      } catch {
        const { error } = await openOrDownloadAttachment(att);
        if (error) Alert.alert('Could not open', error);
      }
    } else {
      const { error } = await openOrDownloadAttachment(att);
      if (error) Alert.alert('Could not open file', error);
    }
    setIsOpening(false);
    setSelectedEntry(null);
  }, [selectedEntry, isOpening]);

  const handleGoToMessage = useCallback(() => {
    if (!selectedEntry) return;
    const msgId = selectedEntry.messageId;
    setSelectedEntry(null);
    onClose();
    setTimeout(() => onScrollToMessage(msgId), 320);
  }, [selectedEntry, onClose, onScrollToMessage]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setActiveFilter('all');
    setSelectedEntry(null);
    onClose();
  }, [onClose]);

  const openMeta = selectedEntry ? openButtonMeta(selectedEntry.attachment) : null;

  const backdropColor = getModalBackdrop(0.5);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={[styles.backdrop, { backgroundColor: backdropColor }]} activeOpacity={1} onPress={handleClose} />
      <Animated.View
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border, height: SHEET_HEIGHT, paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: COLORS.border }]} /></View>

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>Files & Media</Text>
          <View style={[styles.totalBadge, { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}25` }]}>
            <Text style={[styles.totalBadgeText, { color: COLORS.primary }]}>{allFiles.length} files</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <Ionicons name="close" size={17} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchRow, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
          <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by filename…"
            placeholderTextColor={COLORS.textMuted}
            style={[styles.searchInput, { color: COLORS.textPrimary }]}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScroll}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map(f => {
            const count  = counts[f.type];
            const active = activeFilter === f.type;
            return (
              <TouchableOpacity
                key={f.type}
                onPress={() => { setActiveFilter(f.type); setSelectedEntry(null); }}
                style={[
                  styles.chip, 
                  { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
                  active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                ]}
                activeOpacity={0.7}
                disabled={count === 0 && f.type !== 'all'}
              >
                <Ionicons name={f.icon as any} size={12} color={active ? '#FFF' : COLORS.textSecondary} />
                <Text style={[styles.chipLabel, { color: active ? '#FFF' : COLORS.textSecondary }, active && styles.chipLabelActive]}>{f.label}</Text>
                {count > 0 && (
                  <View style={[styles.chipCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }, { backgroundColor: COLORS.border }]}>
                    <Text style={[styles.chipCountText, { color: active ? '#FFF' : COLORS.textMuted }, active && styles.chipCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
            <Ionicons name="folder-open-outline" size={38} color={COLORS.textMuted} />
            <Text style={[styles.emptyTitle, { color: COLORS.textPrimary }]}>No files found</Text>
            <Text style={[styles.emptyDesc, { color: COLORS.textSecondary }]}>
              {searchQuery
                ? `No files matching "${searchQuery}"`
                : `No ${activeFilter === 'all' ? '' : activeFilter + ' '}files shared yet`}
            </Text>
          </Animated.View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(e, i) => `${e.messageId}-${i}`}
            renderItem={({ item }) => (
              <FileCard
                entry={item}
                isSelected={selectedEntry !== null && entryKey(selectedEntry) === entryKey(item)}
                onPress={handleCardPress}
              />
            )}
            contentContainerStyle={[styles.list, selectedEntry && { paddingBottom: 110 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}

        {selectedEntry && openMeta && (
          <Animated.View entering={FadeIn.duration(180)} style={[styles.actionBar, { backgroundColor: COLORS.backgroundCard, borderTopColor: COLORS.border }]}>
            <Text style={[styles.actionBarName, { color: COLORS.textSecondary }]} numberOfLines={1}>
              {selectedEntry.attachment.name || 'Attachment'}
            </Text>
            <View style={styles.actionBarBtns}>
              <TouchableOpacity
                onPress={handleOpenFile}
                style={[styles.actionBarBtn, styles.actionBarBtnPrimary, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                activeOpacity={0.8}
                disabled={isOpening}
              >
                {isOpening ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name={openMeta.icon as any} size={16} color="#FFF" />
                )}
                <Text style={styles.actionBarBtnTextPrimary}>
                  {isOpening ? 'Opening…' : openMeta.label}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGoToMessage}
                style={[styles.actionBarBtn, styles.actionBarBtnSecondary, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-redo-outline" size={16} color={COLORS.textSecondary} />
                <Text style={[styles.actionBarBtnTextSecondary, { color: COLORS.textSecondary }]}>Go to Message</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedEntry(null)}
              style={[styles.actionBarClose, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop:      { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 24,
  },
  handleWrap:          { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:              { width: 40, height: 4, borderRadius: 2 },
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, gap: 8 },
  headerTitle:         { fontSize: FONTS.sizes.lg, fontWeight: '800', flex: 1 },
  totalBadge:          { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  totalBadgeText:      { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  closeBtn:            { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  searchRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 1 },
  searchInput:         { flex: 1, fontSize: FONTS.sizes.sm, paddingVertical: 0 },
  filterScroll:        { maxHeight: 46, marginBottom: SPACING.sm },
  filterScrollContent: { paddingHorizontal: SPACING.xl, gap: 6 },
  chip:                { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1 },
  chipLabel:           { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  chipLabelActive:     { color: '#FFF' },
  chipCount:           { borderRadius: RADIUS.full, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  chipCountText:       { fontSize: 9, fontWeight: '800' },
  chipCountTextActive: { color: '#FFF' },
  list:                { paddingHorizontal: SPACING.xl, paddingBottom: 20, gap: 8 },
  card:                { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.xl, padding: SPACING.sm, borderWidth: 1, gap: 12 },
  cardThumbWrap:       { flexShrink: 0 },
  imageThumb:          { width: 50, height: 50, borderRadius: RADIUS.lg },
  thumbPlaceholder:    { width: 50, height: 50, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  fileIconWrap:        { width: 50, height: 50, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  cardMeta:            { flex: 1 },
  cardName:            { fontSize: FONTS.sizes.sm, fontWeight: '700', lineHeight: 17 },
  cardSubRow:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardSize:            { fontSize: FONTS.sizes.xs },
  cardDot:             { fontSize: FONTS.sizes.xs },
  cardTime:            { fontSize: FONTS.sizes.xs },
  cardAuthor:          { fontSize: FONTS.sizes.xs, marginTop: 2 },
  selectedCheck:       { flexShrink: 0 },
  empty:               { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: SPACING.xl },
  emptyTitle:          { fontSize: FONTS.sizes.lg, fontWeight: '800' },
  emptyDesc:           { fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 12, gap: 10,
  },
  actionBarName:             { fontSize: FONTS.sizes.xs, fontWeight: '600', textAlign: 'center' },
  actionBarBtns:             { flexDirection: 'row', gap: 10 },
  actionBarBtn:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: RADIUS.lg, borderWidth: 1 },
  actionBarBtnPrimary:       { borderColor: COLORS.primary },
  actionBarBtnSecondary:     { borderWidth: 1 },
  actionBarBtnTextPrimary:   { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },
  actionBarBtnTextSecondary: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  actionBarClose: {
    position: 'absolute', top: SPACING.md, right: SPACING.xl,
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
});