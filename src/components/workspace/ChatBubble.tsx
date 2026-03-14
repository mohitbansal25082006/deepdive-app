// src/components/workspace/ChatBubble.tsx
// Part 17 — Individual chat message bubble (UPDATED: attachment rendering)
//
// Changes from original:
//   • BubbleAttachments rendered above text content when message has attachments
//   • Image-only messages (no text) don't render an empty text block
//   • File attachments show as tappable file chips
//   • All existing features preserved: reply preview, reactions, long-press menu,
//     deleted/system states, pin indicator, edit badge.

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Pressable,
  StyleSheet,
  Animated as RNAnimated,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../common/Avatar';
import { BubbleAttachments } from './ChatAttachmentPreview';
import { ChatMessage } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '✅', '👀'];

interface Props {
  message:         ChatMessage;
  isOwnMessage:    boolean;
  isOwnerOrEditor: boolean;
  showAvatar:      boolean;
  isConsecutive:   boolean;
  onReply:         (msg: ChatMessage) => void;
  onEdit:          (msg: ChatMessage) => void;
  onDelete:        (id: string) => void;
  onReact:         (id: string, emoji: string) => void;
  onPin:           (msg: ChatMessage) => void;
  onUnpin:         (id: string) => void;
  onScrollToReply?: (id: string) => void;
}

export function ChatBubble({
  message,
  isOwnMessage,
  isOwnerOrEditor,
  showAvatar,
  isConsecutive,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onUnpin,
  onScrollToReply,
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

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
      <View style={[
        styles.row,
        isOwnMessage ? styles.rowOwn : styles.rowOther,
        isConsecutive && styles.rowConsecutive,
      ]}>
        {!isOwnMessage && <View style={styles.avatarSlot}>{showAvatar && <Avatar url={message.author?.avatarUrl} name={message.author?.fullName ?? message.author?.username} size={30} />}</View>}
        <View style={[styles.deletedBubble, isOwnMessage && styles.deletedBubbleOwn]}>
          <Ionicons name="trash-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      </View>
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

  // Determine if the bubble has any text to show
  const hasText        = message.content && message.content.trim().length > 0;
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const timeLabel      = formatTime(message.createdAt);

  return (
    <>
      <Animated.View
        entering={FadeInDown.duration(220).springify()}
        style={[
          styles.row,
          isOwnMessage ? styles.rowOwn : styles.rowOther,
          isConsecutive && styles.rowConsecutive,
        ]}
      >
        {/* Avatar (other messages only) */}
        {!isOwnMessage && (
          <View style={styles.avatarSlot}>
            {showAvatar && (
              <Avatar url={message.author?.avatarUrl} name={message.author?.fullName ?? message.author?.username} size={30} />
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
                <Text style={styles.replyAuthor} numberOfLines={1}>{message.replyTo.authorName ?? 'Unknown'}</Text>
                <Text style={styles.replyText} numberOfLines={2}>{message.replyTo.content}</Text>
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
                // If attachments only (no text), make the bubble borderless / transparent
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

              {/* ── Attachments (images + files) ── */}
              {hasAttachments && (
                <BubbleAttachments
                  attachments={message.attachments}
                  isOwnMessage={isOwnMessage}
                />
              )}

              {/* Text content */}
              {hasText && (
                <Text style={[styles.content, isOwnMessage && styles.contentOwn, hasAttachments && { marginTop: 6 }]}>
                  {message.content}
                </Text>
              )}

              {/* Footer: time + edited */}
              <View style={[styles.bubbleFooter, !hasText && !hasAttachments && { marginTop: 0 }]}>
                {message.isEdited && (
                  <Text style={[styles.editedLabel, isOwnMessage && styles.editedLabelOwn]}>edited</Text>
                )}
                <Text style={[styles.timeLabel, isOwnMessage && styles.timeLabelOwn]}>{timeLabel}</Text>
              </View>
            </RNAnimated.View>
          </TouchableWithoutFeedback>

          {/* Reactions row */}
          {message.reactions.length > 0 && (
            <View style={[styles.reactionsRow, isOwnMessage && styles.reactionsRowOwn]}>
              {message.reactions.map((r) => (
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
      </Animated.View>

      {/* ── Context menu modal ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Animated.View entering={ZoomIn.duration(180).springify()} style={styles.menuCard}>
            {/* Quick reactions */}
            <View style={styles.quickReactions}>
              {QUICK_REACTIONS.map((emoji) => (
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
            <MenuItem icon="return-down-forward-outline" label="Reply" onPress={() => { setMenuVisible(false); onReply(message); }} />
            {canEdit && <MenuItem icon="pencil-outline" label="Edit" onPress={() => { setMenuVisible(false); onEdit(message); }} />}
            {canPin && !message.isPinned && <MenuItem icon="pin-outline" label="Pin message" onPress={() => { setMenuVisible(false); onPin(message); }} />}
            {canPin && message.isPinned && <MenuItem icon="pin" label="Unpin message" color={COLORS.warning} onPress={() => { setMenuVisible(false); onUnpin(message.id); }} />}
            {canDelete && (
              <MenuItem
                icon="trash-outline"
                label="Delete"
                color={COLORS.error}
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
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
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
  systemMsg: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, paddingHorizontal: SPACING.xl, gap: 10 },
  systemLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  systemText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '500', textAlign: 'center' },

  row:            { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, marginBottom: 6, gap: 8 },
  rowOwn:         { flexDirection: 'row-reverse' },
  rowOther:       {},
  rowConsecutive: { marginBottom: 2 },
  avatarSlot:     { width: 30, flexShrink: 0 },

  bubbleCol:    { maxWidth: BUBBLE_MAX_WIDTH, alignItems: 'flex-start' },
  bubbleColOwn: { alignItems: 'flex-end' },

  senderName: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 3, paddingLeft: 4 },

  replyPreview: {
    flexDirection: 'row', backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, borderTopLeftRadius: 4,
    padding: SPACING.xs, marginBottom: 4, maxWidth: '100%',
    borderWidth: 1, borderColor: COLORS.border,
  },
  replyPreviewOwn:    { borderTopRightRadius: 4, borderTopLeftRadius: RADIUS.lg },
  replyBar:           { width: 3, borderRadius: 2, backgroundColor: COLORS.primary, marginRight: 7, flexShrink: 0 },
  replyBarOwn:        { backgroundColor: `${COLORS.primary}99` },
  replyPreviewContent:{ flex: 1 },
  replyAuthor:        { color: COLORS.primary, fontSize: 10, fontWeight: '700', marginBottom: 1 },
  replyText:          { color: COLORS.textMuted, fontSize: 11, lineHeight: 15 },

  bubble: {
    borderRadius: RADIUS.xl, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleOwn: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: 4,
  },
  bubbleOther: {},
  bubblePinned:    { borderColor: `${COLORS.warning}60`, borderWidth: 1.5 },
  bubbleAttachOnly:{ paddingHorizontal: 6, paddingVertical: 6 },

  pinBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  pinBadgeText: { color: COLORS.warning, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  content:          { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 21 },
  contentOwn:       { color: '#FFFFFF' },

  bubbleFooter:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, justifyContent: 'flex-end' },
  editedLabel:      { color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic' },
  editedLabelOwn:   { color: 'rgba(255,255,255,0.55)' },
  timeLabel:        { color: COLORS.textMuted, fontSize: 10 },
  timeLabelOwn:     { color: 'rgba(255,255,255,0.65)' },

  reactionsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5, paddingLeft: 2 },
  reactionsRowOwn:     { justifyContent: 'flex-end' },
  reactionChip:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  reactionChipActive:  { backgroundColor: `${COLORS.primary}18`, borderColor: `${COLORS.primary}40` },
  reactionEmoji:       { fontSize: 13 },
  reactionCount:       { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  reactionCountActive: { color: COLORS.primary },
  addReactionBtn:      { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },

  deletedBubble:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.textMuted}10`, borderRadius: RADIUS.xl, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  deletedBubbleOwn: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: 4 },
  deletedText:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  menuCard:    { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16 },
  quickReactions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  quickReactionBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  quickReactionEmoji: { fontSize: 22 },
  menuDivider:  { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md, marginBottom: SPACING.xs },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  menuItemLabel:{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '500' },
});