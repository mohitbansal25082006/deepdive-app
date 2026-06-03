// src/components/workspace/ChatBubble.tsx
// Part 17 — Individual chat message bubble
// Part 18D — Improved reply preview: shows attachment type icon + label
// Part 47 — Added `isHighlighted` prop for search-result highlight (amber glow)
//            Fixed document bubble stretching on Android (overflow: 'hidden' + constraints)

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Modal, Pressable, StyleSheet, Animated as RNAnimated, Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../common/Avatar';
import { BubbleAttachments } from './ChatAttachmentPreview';
import { ChatMessage } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '✅', '👀'];

// ─── Reply preview helpers ─────────────────────────────────────────────────────

function getReplyContentInfo(
  content: string,
  contentType?: string,
): { icon: keyof typeof Ionicons.glyphMap; label: string; isAttachment: boolean } {
  if (contentType === 'image')  return { icon: 'image-outline',              label: '📷 Photo',        isAttachment: true  };
  if (contentType === 'file')   return { icon: 'attach-outline',             label: '📎 File',         isAttachment: true  };
  if (contentType === 'system') return { icon: 'information-circle-outline', label: content,           isAttachment: false };

  const lower = content.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(lower)) return { icon: 'image-outline',         label: '📷 Photo',          isAttachment: true };
  if (/\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(lower))   return { icon: 'videocam-outline',      label: '🎬 Video',          isAttachment: true };
  if (/\.(mp3|aac|wav|ogg|flac|m4a)$/i.test(lower))   return { icon: 'musical-notes-outline', label: '🎵 Audio',          isAttachment: true };
  if (/\.pdf$/i.test(lower))                           return { icon: 'document-text-outline', label: '📄 PDF',            isAttachment: true };
  if (/\.(doc|docx)$/i.test(lower))                   return { icon: 'document-outline',      label: '📝 Word document',  isAttachment: true };
  if (/\.(xls|xlsx|csv)$/i.test(lower))               return { icon: 'grid-outline',          label: '📊 Spreadsheet',    isAttachment: true };
  if (/\.(ppt|pptx)$/i.test(lower))                   return { icon: 'easel-outline',         label: '📊 Presentation',   isAttachment: true };
  return { icon: 'chatbubble-outline', label: content, isAttachment: false };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  message:         ChatMessage;
  isOwnMessage:    boolean;
  isOwnerOrEditor: boolean;
  showAvatar:      boolean;
  isConsecutive:   boolean;
  /** Part 47: When true, applies an amber highlight to the row (search result / pin tap) */
  isHighlighted?:  boolean;
  onReply:         (msg: ChatMessage) => void;
  onEdit:          (msg: ChatMessage) => void;
  onDelete:        (id: string) => void;
  onReact:         (id: string, emoji: string) => void;
  onPin:           (msg: ChatMessage) => void;
  onUnpin:         (id: string) => void;
  onScrollToReply?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatBubble({
  message, isOwnMessage, isOwnerOrEditor,
  showAvatar, isConsecutive, isHighlighted = false,
  onReply, onEdit, onDelete, onReact, onPin, onUnpin, onScrollToReply,
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

  // ── Part 47: Highlight animation ─────────────────────────────────────────
  // When isHighlighted becomes true, animate in the amber glow then fade it out.
  // The parent (workspace-chat.tsx) clears isHighlighted after 2500ms.
  const highlightAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (isHighlighted) {
      RNAnimated.sequence([
        RNAnimated.timing(highlightAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
        RNAnimated.delay(700),
        RNAnimated.timing(highlightAnim, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ]).start();
    } else {
      highlightAnim.stopAnimation();
      highlightAnim.setValue(0);
    }
  }, [isHighlighted, highlightAnim]);

  const highlightBg = highlightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255, 167, 38, 0)', 'rgba(255, 167, 38, 0.15)'],
  });

  // ── System message ────────────────────────────────────────────────────────
  if (message.contentType === 'system') {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.systemMsg}>
        <View style={styles.systemLine} />
        <Text style={styles.systemText}>{message.content}</Text>
        <View style={styles.systemLine} />
      </Animated.View>
    );
  }

  // ── Deleted message ───────────────────────────────────────────────────────
  if (message.isDeleted) {
    return (
      <RNAnimated.View
        style={[
          styles.row,
          isOwnMessage ? styles.rowOwn : styles.rowOther,
          isConsecutive && styles.rowConsecutive,
          { backgroundColor: highlightBg },
        ]}
      >
        {!isOwnMessage && (
          <View style={styles.avatarSlot}>
            {showAvatar && <Avatar url={message.author?.avatarUrl} name={message.author?.fullName ?? message.author?.username} size={30} />}
          </View>
        )}
        <View style={[styles.deletedBubble, isOwnMessage && styles.deletedBubbleOwn]}>
          <Ionicons name="trash-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      </RNAnimated.View>
    );
  }

  const handleLongPress = () => {
    RNAnimated.sequence([
      RNAnimated.timing(scaleAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    setMenuVisible(true);
  };

  const canEdit   = isOwnMessage && !message.isDeleted;
  const canDelete = (isOwnMessage || isOwnerOrEditor) && !message.isDeleted;
  const canPin    = isOwnerOrEditor;

  const hasText        = !!message.content?.trim();
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const timeLabel      = formatTime(message.createdAt);

  // ── Reply preview ─────────────────────────────────────────────────────────
  let replyIcon: keyof typeof Ionicons.glyphMap = 'chatbubble-outline';
  let replyLabel        = '';
  let replyIsAttachment = false;

  if (message.replyTo) {
    const info    = getReplyContentInfo(message.replyTo.content, undefined);
    replyIcon         = info.icon;
    replyLabel        = info.label;
    replyIsAttachment = info.isAttachment;
  }

  return (
    <>
      {/* ── Highlight overlay wrapper (Part 47) ── */}
      <RNAnimated.View
        style={[
          styles.row,
          isOwnMessage ? styles.rowOwn : styles.rowOther,
          isConsecutive && styles.rowConsecutive,
          { backgroundColor: highlightBg, borderRadius: RADIUS.xl },
        ]}
      >
        {/* Left accent bar for highlight (only visible when highlighted) */}
        {isHighlighted && (
          <View style={[
            styles.highlightAccent,
            isOwnMessage && styles.highlightAccentOwn,
          ]} />
        )}

        {/* Avatar */}
        {!isOwnMessage && (
          <View style={styles.avatarSlot}>
            {showAvatar && (
              <Avatar
                url={message.author?.avatarUrl}
                name={message.author?.fullName ?? message.author?.username}
                size={30}
              />
            )}
          </View>
        )}

        <View style={[styles.bubbleCol, isOwnMessage && styles.bubbleColOwn]}>
          {/* Sender name */}
          {!isOwnMessage && showAvatar && (
            <Text style={styles.senderName} numberOfLines={1}>
              {message.author?.fullName ?? message.author?.username ?? 'Unknown'}
            </Text>
          )}

          {/* Reply preview */}
          {message.replyTo && (
            <TouchableOpacity
              onPress={() => message.replyTo && onScrollToReply?.(message.replyTo.id)}
              style={[styles.replyPreview, isOwnMessage && styles.replyPreviewOwn]}
              activeOpacity={0.7}
            >
              <View style={[styles.replyBar, isOwnMessage && styles.replyBarOwn]} />
              <View style={styles.replyPreviewContent}>
                <Text style={[styles.replyAuthor, isOwnMessage && styles.replyAuthorOwn]} numberOfLines={1}>
                  {message.replyTo.authorName ?? 'Unknown'}
                </Text>
                {replyIsAttachment ? (
                  <View style={styles.replyAttachRow}>
                    <View style={[styles.replyAttachIcon, isOwnMessage && styles.replyAttachIconOwn]}>
                      <Ionicons
                        name={replyIcon}
                        size={11}
                        color={isOwnMessage ? 'rgba(255,255,255,0.8)' : COLORS.primary}
                      />
                    </View>
                    <Text
                      style={[styles.replyAttachLabel, isOwnMessage && styles.replyAttachLabelOwn]}
                      numberOfLines={1}
                    >
                      {replyLabel}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[styles.replyText, isOwnMessage && styles.replyTextOwn]}
                    numberOfLines={2}
                  >
                    {replyLabel || message.replyTo.content}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Main bubble */}
          <TouchableWithoutFeedback onLongPress={handleLongPress} delayLongPress={350}>
            <RNAnimated.View
              style={[
                styles.bubble,
                isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
                message.isPinned && styles.bubblePinned,
                hasAttachments && !hasText && styles.bubbleAttachOnly,
                { transform: [{ scale: scaleAnim }] },
              ]}
            >
              {/* Pin badge */}
              {message.isPinned && (
                <View style={styles.pinBadge}>
                  <Ionicons name="pin" size={9} color={COLORS.warning} />
                  <Text style={styles.pinBadgeText}>Pinned</Text>
                </View>
              )}

              {/* Attachments — Part 47: wrapped in overflow:hidden container */}
              {hasAttachments && (
                <View style={styles.attachmentsContainer}>
                  <BubbleAttachments attachments={message.attachments} isOwnMessage={isOwnMessage} />
                </View>
              )}

              {/* Text */}
              {hasText && (
                <Text style={[styles.content, isOwnMessage && styles.contentOwn, hasAttachments && { marginTop: 6 }]}>
                  {message.content}
                </Text>
              )}

              {/* Footer */}
              <View style={styles.bubbleFooter}>
                {message.isEdited && (
                  <Text style={[styles.editedLabel, isOwnMessage && styles.editedLabelOwn]}>edited</Text>
                )}
                <Text style={[styles.timeLabel, isOwnMessage && styles.timeLabelOwn]}>{timeLabel}</Text>
              </View>
            </RNAnimated.View>
          </TouchableWithoutFeedback>

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <View style={[styles.reactionsRow, isOwnMessage && styles.reactionsRowOwn]}>
              {message.reactions.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  onPress={() => onReact(message.id, r.emoji)}
                  style={[styles.reactionChip, r.hasReacted && styles.reactionChipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text style={[styles.reactionCount, r.hasReacted && styles.reactionCountActive]}>{r.count}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.addReactionBtn} activeOpacity={0.7}>
                <Ionicons name="add" size={12} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </RNAnimated.View>

      {/* Context menu modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Animated.View entering={ZoomIn.duration(180).springify()} style={styles.menuCard}>
            {/* Quick reactions */}
            <View style={styles.quickReactions}>
              {QUICK_REACTIONS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => { setMenuVisible(false); onReact(message.id, emoji); }}
                  style={styles.quickReactionBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.menuDivider} />
            <MenuItem icon="return-down-forward-outline" label="Reply"          onPress={() => { setMenuVisible(false); onReply(message); }} />
            {canEdit   && <MenuItem icon="pencil-outline"  label="Edit"           onPress={() => { setMenuVisible(false); onEdit(message); }} />}
            {canPin && !message.isPinned && <MenuItem icon="pin-outline" label="Pin message"   onPress={() => { setMenuVisible(false); onPin(message); }} />}
            {canPin &&  message.isPinned && <MenuItem icon="pin"         label="Unpin message" color={COLORS.warning} onPress={() => { setMenuVisible(false); onUnpin(message.id); }} />}
            {canDelete && (
              <MenuItem icon="trash-outline" label="Delete" color={COLORS.error}
                onPress={() => {
                  setMenuVisible(false);
                  Alert.alert('Delete message', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(message.id) },
                  ]);
                }}
              />
            )}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Menu item ────────────────────────────────────────────────────────────────

function MenuItem({ icon, label, onPress, color }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuItem} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={color ?? COLORS.textSecondary} />
      <Text style={[styles.menuItemLabel, color ? { color } : {}]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BUBBLE_MAX_WIDTH = '78%';

const styles = StyleSheet.create({
  // ── System ─────────────────────────────────────────────────────────────────
  systemMsg:  { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, paddingHorizontal: SPACING.xl, gap: 10 },
  systemLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  systemText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '500', textAlign: 'center' },

  // ── Row ────────────────────────────────────────────────────────────────────
  row:            { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, marginBottom: 6, gap: 8 },
  rowOwn:         { flexDirection: 'row-reverse' },
  rowOther:       {},
  rowConsecutive: { marginBottom: 2 },
  avatarSlot:     { width: 30, flexShrink: 0 },

  // Part 47: Highlight accent bar (left side for others, right side for own)
  highlightAccent: {
    position:        'absolute',
    left:            0,
    top:             4,
    bottom:          4,
    width:           3,
    borderRadius:    2,
    backgroundColor: COLORS.warning,
    zIndex:          1,
  },
  highlightAccentOwn: { left: 'auto', right: 0 },

  // ── Bubble column ──────────────────────────────────────────────────────────
  bubbleCol:    { maxWidth: BUBBLE_MAX_WIDTH, alignItems: 'flex-start' },
  bubbleColOwn: { alignItems: 'flex-end' },
  senderName:   { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 3, paddingLeft: 4 },

  // ── Reply preview ─────────────────────────────────────────────────────────
  replyPreview: {
    flexDirection:  'row',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:   RADIUS.lg, borderTopLeftRadius: 4,
    padding:        SPACING.xs, marginBottom: 4, maxWidth: '100%',
    borderWidth:    1, borderColor: COLORS.border,
    overflow:       'hidden',
  },
  replyPreviewOwn: {
    borderTopRightRadius: 4, borderTopLeftRadius: RADIUS.lg,
    backgroundColor:      'rgba(255,255,255,0.12)',
    borderColor:          'rgba(255,255,255,0.22)',
  },
  replyBar:    { width: 3, borderRadius: 2, backgroundColor: COLORS.primary, marginRight: 7, flexShrink: 0 },
  replyBarOwn: { backgroundColor: 'rgba(255,255,255,0.7)' },
  replyPreviewContent: { flex: 1, minWidth: 0 },
  replyAuthor:    { color: COLORS.primary, fontSize: 10, fontWeight: '700', marginBottom: 2 },
  replyAuthorOwn: { color: 'rgba(255,255,255,0.85)' },
  replyAttachRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  replyAttachIcon: {
    width: 20, height: 20, borderRadius: 5,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  replyAttachIconOwn:  { backgroundColor: 'rgba(255,255,255,0.18)' },
  replyAttachLabel:    { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', flex: 1 },
  replyAttachLabelOwn: { color: 'rgba(255,255,255,0.75)' },
  replyText:    { color: COLORS.textMuted, fontSize: 11, lineHeight: 15 },
  replyTextOwn: { color: 'rgba(255,255,255,0.6)' },

  // ── Main bubble ────────────────────────────────────────────────────────────
  bubble: {
    borderRadius:          RADIUS.xl,
    borderBottomLeftRadius: 4,
    paddingHorizontal:     14,
    paddingVertical:       10,
    backgroundColor:       COLORS.backgroundElevated,
    borderWidth:           1,
    borderColor:           COLORS.border,
    // Part 47: prevent document chips from stretching bubble on Android
    overflow:              'hidden',
  },
  bubbleOwn: {
    backgroundColor:        COLORS.primary,
    borderColor:            COLORS.primary,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: 4,
  },
  bubbleOther:      {},
  bubblePinned:     { borderColor: `${COLORS.warning}60`, borderWidth: 1.5 },
  bubbleAttachOnly: { paddingHorizontal: 6, paddingVertical: 6 },

  // Part 47: container for attachments — ensures proper width constraints
  attachmentsContainer: {
    width:    '100%',
    maxWidth: 280,
  },

  // ── Pin badge ──────────────────────────────────────────────────────────────
  pinBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  pinBadgeText: { color: COLORS.warning, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Content + footer ───────────────────────────────────────────────────────
  content:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 21 },
  contentOwn:     { color: '#FFFFFF' },
  bubbleFooter:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, justifyContent: 'flex-end' },
  editedLabel:    { color: COLORS.textMuted,             fontSize: 10, fontStyle: 'italic' },
  editedLabelOwn: { color: 'rgba(255,255,255,0.55)' },
  timeLabel:      { color: COLORS.textMuted,             fontSize: 10 },
  timeLabelOwn:   { color: 'rgba(255,255,255,0.65)' },

  // ── Reactions ──────────────────────────────────────────────────────────────
  reactionsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5, paddingLeft: 2 },
  reactionsRowOwn:    { justifyContent: 'flex-end' },
  reactionChip:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  reactionChipActive: { backgroundColor: `${COLORS.primary}18`, borderColor: `${COLORS.primary}40` },
  reactionEmoji:      { fontSize: 13 },
  reactionCount:      { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  reactionCountActive:{ color: COLORS.primary },
  addReactionBtn:     { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },

  // ── Deleted bubble ─────────────────────────────────────────────────────────
  deletedBubble:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.textMuted}10`, borderRadius: RADIUS.xl, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  deletedBubbleOwn: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: 4 },
  deletedText:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },

  // ── Context menu ───────────────────────────────────────────────────────────
  menuOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  menuCard:          { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16 },
  quickReactions:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  quickReactionBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  quickReactionEmoji:{ fontSize: 22 },
  menuDivider:       { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md, marginBottom: SPACING.xs },
  menuItem:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  menuItemLabel:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '500' },
});