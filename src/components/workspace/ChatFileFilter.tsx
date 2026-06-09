// src/components/workspace/ChatFileFilter.tsx
// Part 18 — File search and filtering panel for workspace chat.
// Part 47 — DUAL ACTION: tapping a file card selects it and shows an action bar
//            with two buttons: "Open File" (direct preview/download) and
//            "Go to Message" (scroll + highlight the chat message).
// Part 50 — FIXED:
//   • Image preview now works: tapping "Open File" on an image gets a signed URL
//     then opens it via Linking.openURL so the native image viewer launches.
//   • Go to Message now works: the callback is properly wired through workspace-chat.tsx
//     to the MessageList targetedMessage prop which causes Stream to scroll + highlight.
//   • When the panel closes after "Go to Message" the highlight appears immediately.
// Part 50.2 — GIF support:
//   • GIFs (mime_type image/gif) recognised as a distinct sub-type of images.
//   • File cards show a purple "GIF" badge over the thumbnail.
//   • Action bar button label changes to "Open GIF" instead of "View Image".
//   • GIFs appear in both "All" and "Images" filter tabs (correct behaviour).
//   • Display name defaults to "<title>.gif" when name is empty (GIPHY sends no name).

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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.88;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  messageId:  string;
  attachment: ChatAttachment;
  sentAt:     string;
  authorName: string | null;
}

// ─── GIF helpers ──────────────────────────────────────────────────────────────

/** Returns true when the attachment is an animated GIF */
function isGifMime(mime: string): boolean {
  return mime === 'image/gif';
}

/**
 * Best display name for a GIF attachment.
 * GIPHY sends messages with asset_url set and title as the search term but no
 * filename, so we fall back to "<title>.gif".
 */
function gifDisplayName(att: ChatAttachment): string {
  if (att.name && att.name.trim().length > 0) return att.name;
  if ((att as any).title && (att as any).title.trim().length > 0) return `${(att as any).title}.gif`;
  return 'animated.gif';
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
    // GIFs (image/gif) are images — they show under the Images tab too
    case 'images':    return mime.startsWith('image/');
    case 'videos':    return mime.startsWith('video/');
    case 'audio':     return mime.startsWith('audio/');
    case 'documents': return !mime.startsWith('image/') && !mime.startsWith('video/') && !mime.startsWith('audio/');
    default:          return true;
  }
}

function entryKey(e: FileEntry) { return `${e.messageId}:${e.attachment.url}`; }

// ─── Supabase URL check ───────────────────────────────────────────────────────

function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/');
}

// ─── Image / GIF thumbnail ────────────────────────────────────────────────────

function ImageThumb({ url, isGif }: { url: string; isGif: boolean }) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(
    isSupabaseStorageUrl(url) ? null : url,
  );
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    if (!isSupabaseStorageUrl(url)) {
      setDisplayUrl(url);
      return;
    }
    setDisplayUrl(null);
    getSignedUrl(url).then(signed => {
      setDisplayUrl(signed ?? url);
    });
  }, [url]);

  if (!displayUrl) {
    return (
      <View style={styles.thumbPlaceholder}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.thumbPlaceholder}>
        <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.thumbContainer}>
      <Image
        source={{ uri: displayUrl }}
        style={styles.imageThumb}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
      {/* Part 50.2 — GIF badge overlaid on thumbnail */}
      {isGif && (
        <View style={styles.gifBadge}>
          <Text style={styles.gifBadgeText}>GIF</Text>
        </View>
      )}
    </View>
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
  const isGif = isGifMime(attachment.type);
  const isVid = isVideoMime(attachment.type);
  const icon  = getFileIcon(attachment.type) as any;

  // Part 50.2 — use GIF-aware display name
  const displayName = isGif ? gifDisplayName(attachment) : (attachment.name || 'Attachment');

  const timeLabel = new Date(sentAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => onPress(entry)}
      activeOpacity={0.75}
    >
      {/* Thumbnail / icon */}
      <View style={styles.cardThumbWrap}>
        {isImg ? (
          <ImageThumb url={attachment.url} isGif={isGif} />
        ) : (
          <View style={[
            styles.fileIconWrap,
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

      {/* Meta */}
      <View style={styles.cardMeta}>
        <Text style={styles.cardName} numberOfLines={2}>{displayName}</Text>
        <View style={styles.cardSubRow}>
          {/* Part 50.2 — show "Animated GIF" type label instead of size (GIFs from GIPHY have no size) */}
          {isGif ? (
            <Text style={[styles.cardSize, { color: '#9B59B6' }]}>Animated GIF</Text>
          ) : (
            !!attachment.size && <Text style={styles.cardSize}>{formatFileSize(attachment.size)}</Text>
          )}
          {(isGif || !!attachment.size) && <Text style={styles.cardDot}>·</Text>}
          <Text style={styles.cardTime}>{timeLabel}</Text>
        </View>
        {authorName && (
          <Text style={styles.cardAuthor} numberOfLines={1}>by {authorName}</Text>
        )}
      </View>

      {/* Selection indicator */}
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

// ─── Action bar label helper ──────────────────────────────────────────────────

/**
 * Part 50.2 — returns the correct "open" button label + icon for the selected file.
 *   image/gif  → "Open GIF"   + gif icon
 *   image/*    → "View Image" + eye icon
 *   everything → "Open File"  + open icon
 */
function openButtonMeta(att: ChatAttachment): { label: string; icon: string } {
  if (isGifMime(att.type))       return { label: 'Open GIF',   icon: 'play-circle-outline' };
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

export function ChatFileFilter({
  visible,
  messages,
  onClose,
  onScrollToMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const [activeFilter,  setActiveFilter]  = useState<ChatFileFilterType>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [isOpening,     setIsOpening]     = useState(false);

  // ── Extract all file entries ──────────────────────────────────────────────

  const allFiles = useMemo<FileEntry[]>(() => {
    const result: FileEntry[] = [];
    messages
      .filter(m => !m.isDeleted && m.attachments.length > 0)
      .forEach(m => {
        m.attachments.forEach(att => {
          result.push({
            messageId:  m.id,
            attachment: att,
            sentAt:     m.createdAt,
            authorName: m.author?.fullName ?? m.author?.username ?? null,
          });
        });
      });
    return result.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );
  }, [messages]);

  // ── Filter + search ───────────────────────────────────────────────────────

  const filtered = useMemo<FileEntry[]>(() => {
    let result = allFiles.filter(e => matchesFilter(e.attachment.type, activeFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(e => {
        const isGif = isGifMime(e.attachment.type);
        const name  = isGif ? gifDisplayName(e.attachment) : (e.attachment.name ?? '');
        return name.toLowerCase().includes(q);
      });
    }
    return result;
  }, [allFiles, activeFilter, searchQuery]);

  // ── Per-filter counts ─────────────────────────────────────────────────────

  const counts = useMemo<Record<ChatFileFilterType, number>>(() => ({
    all:       allFiles.length,
    // GIFs are image/* so they count toward Images tab naturally
    images:    allFiles.filter(e => e.attachment.type.startsWith('image/')).length,
    videos:    allFiles.filter(e => e.attachment.type.startsWith('video/')).length,
    audio:     allFiles.filter(e => e.attachment.type.startsWith('audio/')).length,
    documents: allFiles.filter(e =>
      !e.attachment.type.startsWith('image/') &&
      !e.attachment.type.startsWith('video/') &&
      !e.attachment.type.startsWith('audio/'),
    ).length,
  }), [allFiles]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCardPress = useCallback((entry: FileEntry) => {
    const key = entryKey(entry);
    setSelectedEntry(prev => prev && entryKey(prev) === key ? null : entry);
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!selectedEntry || isOpening) return;
    setIsOpening(true);

    const att = selectedEntry.attachment;
    const isImg = att.type.startsWith('image/');

    if (isImg) {
      // For both GIFs and regular images — resolve URL then open natively
      let resolvedUrl: string | null = null;
      if (isSupabaseStorageUrl(att.url)) {
        resolvedUrl = await getSignedUrl(att.url);
        if (!resolvedUrl) resolvedUrl = att.url;
      } else {
        resolvedUrl = att.url; // Stream CDN / GIPHY — already public
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

  // ─────────────────────────────────────────────────────────────────────────

  // Part 50.2 — pre-compute open button meta for selected entry
  const openMeta = selectedEntry ? openButtonMeta(selectedEntry.attachment) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { height: SHEET_HEIGHT, paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {/* Handle */}
        <View style={styles.handleWrap}><View style={styles.handle} /></View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Files & Media</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{allFiles.length} files</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={17} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by filename…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
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

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScroll}
        >
          {FILTERS.map(f => {
            const count  = counts[f.type];
            const active = activeFilter === f.type;
            return (
              <TouchableOpacity
                key={f.type}
                onPress={() => { setActiveFilter(f.type); setSelectedEntry(null); }}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
                disabled={count === 0 && f.type !== 'all'}
              >
                <Ionicons name={f.icon as any} size={12} color={active ? '#FFF' : COLORS.textSecondary} />
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{f.label}</Text>
                {count > 0 && (
                  <View style={[styles.chipCount, active && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results */}
        {filtered.length === 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
            <Ionicons name="folder-open-outline" size={38} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No files found</Text>
            <Text style={styles.emptyDesc}>
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
            contentContainerStyle={[
              styles.list,
              selectedEntry && { paddingBottom: 110 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* ── Dual-action bar (appears when a file is selected) ── */}
        {selectedEntry && openMeta && (
          <Animated.View entering={FadeIn.duration(180)} style={styles.actionBar}>
            {/* File name — Part 50.2: uses GIF-aware display name */}
            <Text style={styles.actionBarName} numberOfLines={1}>
              {isGifMime(selectedEntry.attachment.type)
                ? gifDisplayName(selectedEntry.attachment)
                : (selectedEntry.attachment.name || 'Attachment')}
            </Text>

            <View style={styles.actionBarBtns}>
              {/* Part 50.2 — button label is "Open GIF" / "View Image" / "Open File" */}
              <TouchableOpacity
                onPress={handleOpenFile}
                style={[styles.actionBarBtn, styles.actionBarBtnPrimary]}
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

              {/* Go to Message */}
              <TouchableOpacity
                onPress={handleGoToMessage}
                style={[styles.actionBarBtn, styles.actionBarBtnSecondary]}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-redo-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.actionBarBtnTextSecondary}>Go to Message</Text>
              </TouchableOpacity>
            </View>

            {/* Deselect */}
            <TouchableOpacity
              onPress={() => setSelectedEntry(null)}
              style={styles.actionBarClose}
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 24,
  },
  handleWrap:  { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, gap: 8,
  },
  headerTitle:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', flex: 1 },
  totalBadge:      { backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  totalBadgeText:  { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  closeBtn:        { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  searchInput:     { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 0 },
  filterScroll:        { maxHeight: 46, marginBottom: SPACING.sm },
  filterScrollContent: { paddingHorizontal: SPACING.xl, gap: 6 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
  chipActive:      { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipLabel:       { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  chipLabelActive: { color: '#FFF' },
  chipCount:            { backgroundColor: COLORS.border, borderRadius: RADIUS.full, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  chipCountActive:      { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText:        { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  chipCountTextActive:  { color: '#FFF' },
  list:            { paddingHorizontal: SPACING.xl, paddingBottom: 20, gap: 8 },
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  cardSelected:    { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: `${COLORS.primary}08` },
  cardThumbWrap:   { flexShrink: 0 },
  // Part 50.2 — wrapper needed so the GIF badge can be absolutely positioned
  thumbContainer:  { width: 50, height: 50, position: 'relative' },
  imageThumb:      { width: 50, height: 50, borderRadius: RADIUS.lg },
  thumbPlaceholder:{ width: 50, height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  fileIconWrap:    { width: 50, height: 50, borderRadius: RADIUS.lg, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center' },
  // Part 50.2 — purple GIF badge overlaid on the bottom-right of the thumbnail
  gifBadge: {
    position:        'absolute',
    bottom:          3,
    right:           3,
    backgroundColor: '#7B2FBE',
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:   1,
  },
  gifBadgeText: {
    color:      '#FFFFFF',
    fontSize:   8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardMeta:        { flex: 1 },
  cardName:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', lineHeight: 17 },
  cardSubRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardSize:        { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardDot:         { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardTime:        { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardAuthor:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  selectedCheck:   { flexShrink: 0 },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: SPACING.xl },
  emptyTitle:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  emptyDesc:       { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.backgroundCard,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 12, gap: 10,
  },
  actionBarName:             { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600', textAlign: 'center' },
  actionBarBtns:             { flexDirection: 'row', gap: 10 },
  actionBarBtn:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: RADIUS.lg, borderWidth: 1 },
  actionBarBtnPrimary:       { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  actionBarBtnSecondary:     { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
  actionBarBtnTextPrimary:   { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },
  actionBarBtnTextSecondary: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  actionBarClose: {
    position: 'absolute', top: SPACING.md, right: SPACING.xl,
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
});