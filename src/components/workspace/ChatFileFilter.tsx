// src/components/workspace/ChatFileFilter.tsx
// Part 18 — File search and filtering panel for workspace chat.
//
// Shows all messages with attachments, grouped by type.
// Filter chips: All · Images · Videos · Audio · Documents
// Search bar filters by file name.
// Each result is a tappable card that scrolls to the message in the chat.

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
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
} from '../../services/chatAttachmentService';
import { ChatMessage, ChatAttachment } from '../../types/chat';
import { ChatFileFilterType } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.88;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  messageId:    string;
  attachment:   ChatAttachment;
  sentAt:       string;
  authorName:   string | null;
}

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: { type: ChatFileFilterType; label: string; icon: string }[] = [
  { type: 'all',       label: 'All',       icon: 'attach-outline' },
  { type: 'images',    label: 'Images',    icon: 'image-outline' },
  { type: 'videos',    label: 'Videos',    icon: 'videocam-outline' },
  { type: 'audio',     label: 'Audio',     icon: 'musical-notes-outline' },
  { type: 'documents', label: 'Docs',      icon: 'document-text-outline' },
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

// ─── Image thumbnail (needs signed URL) ──────────────────────────────────────

function ImageThumb({ url }: { url: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  React.useEffect(() => {
    getSignedUrl(url).then(s => setSignedUrl(s));
  }, [url]);

  if (!signedUrl) {
    return (
      <View style={styles.thumbPlaceholder}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={styles.imageThumb}
      resizeMode="cover"
    />
  );
}

// ─── File entry card ──────────────────────────────────────────────────────────

function FileCard({
  entry,
  onPress,
}: {
  entry:   FileEntry;
  onPress: (messageId: string) => void;
}) {
  const { attachment, sentAt, authorName } = entry;
  const isImg = isImageMime(attachment.type);
  const isVid = isVideoMime(attachment.type);
  const icon  = getFileIcon(attachment.type) as any;

  const timeLabel = new Date(sentAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(entry.messageId)}
      activeOpacity={0.75}
    >
      {/* Thumbnail / Icon */}
      <View style={styles.cardThumbWrap}>
        {isImg ? (
          <ImageThumb url={attachment.url} />
        ) : (
          <View style={[
            styles.fileIconWrap,
            isVid && { backgroundColor: `${COLORS.info}15` },
          ]}>
            <Ionicons
              name={icon}
              size={22}
              color={isVid ? COLORS.info : COLORS.primary}
            />
          </View>
        )}
      </View>

      {/* Meta */}
      <View style={styles.cardMeta}>
        <Text style={styles.cardName} numberOfLines={2}>
          {attachment.name || 'Attachment'}
        </Text>
        <View style={styles.cardSubRow}>
          {attachment.size !== undefined && attachment.size > 0 && (
            <Text style={styles.cardSize}>{formatFileSize(attachment.size)}</Text>
          )}
          {attachment.size !== undefined && attachment.size > 0 && (
            <Text style={styles.cardDot}>·</Text>
          )}
          <Text style={styles.cardTime}>{timeLabel}</Text>
        </View>
        {authorName && (
          <Text style={styles.cardAuthor} numberOfLines={1}>
            Sent by {authorName}
          </Text>
        )}
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible:          boolean;
  messages:         ChatMessage[];
  onClose:          () => void;
  onScrollToMessage: (messageId: string) => void;
}

export function ChatFileFilter({
  visible,
  messages,
  onClose,
  onScrollToMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeFilter, setActiveFilter] = useState<ChatFileFilterType>('all');
  const [searchQuery,  setSearchQuery]  = useState('');

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
    // Newest first
    return result.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );
  }, [messages]);

  // ── Apply filter + search ────────────────────────────────────────────────

  const filtered = useMemo<FileEntry[]>(() => {
    let result = allFiles.filter(e =>
      matchesFilter(e.attachment.type, activeFilter),
    );
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(e =>
        (e.attachment.name ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [allFiles, activeFilter, searchQuery]);

  // ── Per-filter counts ────────────────────────────────────────────────────

  const counts = useMemo<Record<ChatFileFilterType, number>>(() => {
    return {
      all:       allFiles.length,
      images:    allFiles.filter(e => e.attachment.type.startsWith('image/')).length,
      videos:    allFiles.filter(e => e.attachment.type.startsWith('video/')).length,
      audio:     allFiles.filter(e => e.attachment.type.startsWith('audio/')).length,
      documents: allFiles.filter(e =>
        !e.attachment.type.startsWith('image/') &&
        !e.attachment.type.startsWith('video/') &&
        !e.attachment.type.startsWith('audio/'),
      ).length,
    };
  }, [allFiles]);

  const handleSelect = useCallback((messageId: string) => {
    onClose();
    setTimeout(() => onScrollToMessage(messageId), 300);
  }, [onClose, onScrollToMessage]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setActiveFilter('all');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(200)}
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Files & Media</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{allFiles.length} total</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
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

        {/* Filter chips - now scrollable horizontally */}
        <ScrollView
          ref={scrollViewRef}
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
                onPress={() => setActiveFilter(f.type)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
                disabled={count === 0 && f.type !== 'all'}
              >
                <Ionicons
                  name={f.icon as any}
                  size={13}
                  color={active ? '#FFF' : COLORS.textSecondary}
                />
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {f.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.chipCount, active && styles.chipCountActive]}>
                    <Text style={[
                      styles.chipCountText,
                      active && styles.chipCountTextActive,
                    ]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results */}
        {filtered.length === 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
            <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
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
              <FileCard entry={item} onPress={handleSelect} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position:             'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderTopWidth:       1,
    borderColor:          COLORS.border,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -6 },
    shadowOpacity:        0.3,
    shadowRadius:         20,
    elevation:            24,
  },
  handleWrap: {
    alignItems:    'center',
    paddingTop:    10,
    paddingBottom: 4,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical:   SPACING.sm,
    gap:               8,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
    flex:       1,
  },
  totalBadge: {
    backgroundColor: `${COLORS.primary}15`,
    borderRadius:    RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth:     1,
    borderColor:     `${COLORS.primary}25`,
  },
  totalBadgeText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  searchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    marginHorizontal:  SPACING.xl,
    marginBottom:      SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.lg,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  searchInput: {
    flex:      1,
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.sm,
    paddingVertical: 0,
  },
  filterScroll: {
    maxHeight: 48,
    marginBottom: SPACING.sm,
  },
  filterScrollContent: {
    paddingHorizontal: SPACING.xl,
    gap: 6,
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.backgroundElevated,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor:     COLORS.primary,
  },
  chipLabel: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  chipLabelActive: { color: '#FFF' },
  chipCount: {
    backgroundColor: COLORS.border,
    borderRadius:    RADIUS.full,
    minWidth:        16,
    height:          16,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
  },
  chipCountActive:     { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText:       { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  chipCountTextActive: { color: '#FFF' },

  list: {
    paddingHorizontal: SPACING.xl,
    paddingBottom:     20,
    gap:               8,
  },
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.xl,
    padding:         SPACING.sm,
    borderWidth:     1,
    borderColor:     COLORS.border,
    gap:             12,
  },
  cardThumbWrap: { flexShrink: 0 },
  imageThumb: {
    width:        52,
    height:       52,
    borderRadius: RADIUS.lg,
  },
  thumbPlaceholder: {
    width:           52,
    height:          52,
    borderRadius:    RADIUS.lg,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
  },
  fileIconWrap: {
    width:           52,
    height:          52,
    borderRadius:    RADIUS.lg,
    backgroundColor: `${COLORS.primary}12`,
    alignItems:      'center',
    justifyContent:  'center',
  },
  cardMeta:  { flex: 1 },
  cardName:  { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', lineHeight: 18 },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardSize:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardDot:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardTime:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardAuthor:{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },

  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  emptyDesc:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
});