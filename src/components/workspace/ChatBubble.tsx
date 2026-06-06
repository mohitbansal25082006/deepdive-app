// src/components/workspace/ChatBubble.tsx
// Part 17 — Individual chat message bubble
// Part 18D — Improved reply preview
// Part 47 — isHighlighted prop; document bubble fixes
// Part 48  — Full long-press on attachments; attachment reply preview
// Part 48b — Pressable wraps entire bubble column
// Part 48-FINAL — FIXES:
//
//   1. Single-tap not working on attachments (images, document chips, etc.)
//
//      ROOT CAUSE:
//      The previous fix used a `Pressable` with `StyleSheet.absoluteFillObject`
//      positioned over the entire bubbleCol. On Android, an absolute Pressable
//      consumes ALL touch events — including short taps — before they reach
//      any child TouchableOpacity beneath it. Setting `accessible={false}` or
//      `importantForAccessibility="no"` does NOT prevent this on Android;
//      those flags are accessibility hints only, not touch-routing directives.
//
//      CORRECT FIX — Manual long-press via onTouchStart/onTouchEnd on a View:
//      • Wrap bubbleCol content in a plain View with `onStartShouldSetResponder`
//        returning false. This means the View does NOT steal touches from children.
//      • Track long-press manually: onTouchStart starts a 350ms timer;
//        onTouchEnd / onTouchCancel clears it.
//      • If the timer fires → long press → open menu.
//      • If the user lifts before 350ms → timer cleared → child's onPress fires
//        normally (image tap, document tap, reply preview tap all work).
//
//      This is the correct pattern for "detect long press without blocking
//      child tap handlers" in React Native.
//
//   2. Delete permissions: Only the workspace owner can delete other people's
//      messages. Editors can ONLY delete their OWN messages.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  Modal, Pressable as PressableOverlay, StyleSheet,
  Animated as RNAnimated, Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../common/Avatar';
import { BubbleAttachments } from './ChatAttachmentPreview';
import { ChatMessage, ChatAttachment } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const QUICK_REACTIONS  = ['👍', '❤️', '😂', '🔥', '✅', '👀'];
const LONG_PRESS_DELAY = 350; // ms

// ─── Reply preview helpers ─────────────────────────────────────────────────────

function getAttachmentPreviewInfo(
  attachment: ChatAttachment,
): { icon: keyof typeof Ionicons.glyphMap; label: string } {
  const mime  = attachment.type?.toLowerCase() ?? '';
  const name  = attachment.name ?? '';
  const lower = name.toLowerCase();

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(lower))
    return { icon: 'image-outline',         label: name || '📷 Photo' };
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(lower))
    return { icon: 'videocam-outline',      label: name || '🎬 Video' };
  if (mime.startsWith('audio/') || /\.(mp3|aac|wav|ogg|m4a)$/i.test(lower))
    return { icon: 'musical-notes-outline', label: name || '🎵 Audio' };
  if (mime === 'application/pdf' || /\.pdf$/i.test(lower))
    return { icon: 'document-text-outline', label: name || '📄 PDF' };
  if (mime.includes('word') || /\.(doc|docx)$/i.test(lower))
    return { icon: 'document-outline',      label: name || '📝 Word document' };
  if (mime.includes('excel') || mime.includes('spreadsheet') || /\.(xls|xlsx|csv)$/i.test(lower))
    return { icon: 'grid-outline',          label: name || '📊 Spreadsheet' };
  if (mime.includes('powerpoint') || mime.includes('presentation') || /\.(ppt|pptx)$/i.test(lower))
    return { icon: 'easel-outline',         label: name || '📊 Presentation' };
  return { icon: 'attach-outline',          label: name || '📎 Attachment' };
}

function resolveReplyContent(replyTo: {
  content:      string;
  attachments?: ChatAttachment[];
}): { icon: keyof typeof Ionicons.glyphMap; label: string; isAttachment: boolean } {
  const hasText = replyTo.content && replyTo.content.trim().length > 0
    && replyTo.content !== '[Message deleted]';
  const atts    = replyTo.attachments ?? [];

  if (hasText)
    return { icon: 'chatbubble-outline', label: replyTo.content, isAttachment: false };
  if (replyTo.content === '[Message deleted]')
    return { icon: 'trash-outline', label: '[Message deleted]', isAttachment: false };
  if (atts.length > 0) {
    const info = getAttachmentPreviewInfo(atts[0]);
    return { icon: info.icon, label: info.label, isAttachment: true };
  }
  return { icon: 'chatbubble-outline', label: '(empty message)', isAttachment: false };
}

function getAttachmentSummaryLabel(attachments: ChatAttachment[]): string {
  if (!attachments || attachments.length === 0) return '';
  if (attachments.length === 1) {
    const a = attachments[0];
    if (a.name?.trim()) return a.name.trim();
    const mime = a.type?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return 'Photo';
    if (mime.startsWith('video/')) return 'Video';
    if (mime.startsWith('audio/')) return 'Audio';
    return 'Attachment';
  }
  return `${attachments.length} files`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  message:           ChatMessage;
  isOwnMessage:      boolean;
  isOwnerOrEditor:   boolean;
  isWorkspaceOwner?: boolean;
  showAvatar:        boolean;
  isConsecutive:     boolean;
  isHighlighted?:    boolean;
  onReply:           (msg: ChatMessage) => void;
  onEdit:            (msg: ChatMessage) => void;
  onDelete:          (id: string) => void;
  onReact:           (id: string, emoji: string) => void;
  onPin:             (msg: ChatMessage) => void;
  onUnpin:           (id: string) => void;
  onScrollToReply?:  (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatBubble({
  message, isOwnMessage, isOwnerOrEditor, isWorkspaceOwner = false,
  showAvatar, isConsecutive, isHighlighted = false,
  onReply, onEdit, onDelete, onReact, onPin, onUnpin, onScrollToReply,
}: Props) {
  const [menuVisible,   setMenuVisible]   = useState(false);
  const highlightAnim   = useRef(new RNAnimated.Value(0)).current;
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cleanup timer on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // ── Highlight animation ───────────────────────────────────────────────────

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

  // ── Manual long-press detection ───────────────────────────────────────────
  //
  // FIX: We do NOT use an absolute overlay Pressable (which blocks child taps).
  // Instead, we attach touch handlers to the outer wrapper View.
  //
  // How it works:
  //   onTouchStart  → start a 350ms timer
  //   onTouchEnd    → clear timer (user lifted before threshold → normal tap)
  //   onTouchCancel → clear timer (gesture cancelled)
  //   timer fires   → open context menu (long press detected)
  //
  // The wrapper View has `onStartShouldSetResponder={() => false}` so it never
  // claims the responder itself — all child TouchableOpacity handlers receive
  // their events normally. The touch{Start,End,Cancel} events are passive
  // listeners that don't interfere with child gesture handling.

  const handleTouchStart = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      setMenuVisible(true);
    }, LONG_PRESS_DELAY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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
            {showAvatar && (
              <Avatar
                url={message.author?.avatarUrl}
                name={message.author?.fullName ?? message.author?.username}
                size={30}
              />
            )}
          </View>
        )}
        <View style={[styles.deletedBubble, isOwnMessage && styles.deletedBubbleOwn]}>
          <Ionicons name="trash-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      </RNAnimated.View>
    );
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  const canEdit   = isOwnMessage && !message.isDeleted;
  const canDelete = !message.isDeleted && (isOwnMessage || isWorkspaceOwner);
  const canPin    = isOwnerOrEditor;

  const hasText        = !!message.content?.trim();
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const timeLabel      = formatTime(message.createdAt);

  const attachmentLabel = (!hasText && hasAttachments)
    ? getAttachmentSummaryLabel(message.attachments)
    : '';

  const replyInfo = message.replyTo
    ? resolveReplyContent({
        content:     message.replyTo.content ?? '',
        attachments: (message.replyTo as any).attachments ?? [],
      })
    : null;

  return (
    <>
      <RNAnimated.View
        style={[
          styles.row,
          isOwnMessage ? styles.rowOwn : styles.rowOther,
          isConsecutive && styles.rowConsecutive,
          { backgroundColor: highlightBg, borderRadius: RADIUS.xl },
        ]}
      >
        {isHighlighted && (
          <View style={[styles.highlightAccent, isOwnMessage && styles.highlightAccentOwn]} />
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

        {/*
          ── Bubble column with manual long-press detection ──────────────────
          
          KEY FIX: We use a plain View with onTouchStart/onTouchEnd/onTouchCancel
          instead of an absolute Pressable overlay.

          `onStartShouldSetResponder={() => false}` ensures this View never
          claims the touch responder — all child TouchableOpacity components
          (image taps, document chip taps, reply preview taps) receive their
          events WITHOUT any interference.

          The touch handlers are passive event listeners that start/cancel a
          timer. If the user lifts before 350ms, the timer is cancelled and the
          child's onPress fires. If they hold for 350ms, the menu opens.
        */}
        <View
          style={[styles.bubbleCol, isOwnMessage && styles.bubbleColOwn]}
          onStartShouldSetResponder={() => false}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {/* Sender name */}
          {!isOwnMessage && showAvatar && (
            <Text style={styles.senderName} numberOfLines={1}>
              {message.author?.fullName ?? message.author?.username ?? 'Unknown'}
            </Text>
          )}

          {/* Reply preview */}
          {message.replyTo && replyInfo && (
            <TouchableOpacity
              onPress={() => message.replyTo && onScrollToReply?.(message.replyTo.id)}
              style={[styles.replyPreview, isOwnMessage && styles.replyPreviewOwn]}
              activeOpacity={0.7}
            >
              <View style={[styles.replyBar, isOwnMessage && styles.replyBarOwn]} />
              <View style={styles.replyPreviewContent}>
                <Text
                  style={[styles.replyAuthor, isOwnMessage && styles.replyAuthorOwn]}
                  numberOfLines={1}
                >
                  {message.replyTo.authorName ?? 'Unknown'}
                </Text>
                {replyInfo.isAttachment ? (
                  <View style={styles.replyAttachRow}>
                    <View style={[styles.replyAttachIcon, isOwnMessage && styles.replyAttachIconOwn]}>
                      <Ionicons
                        name={replyInfo.icon}
                        size={11}
                        color={isOwnMessage ? 'rgba(255,255,255,0.8)' : COLORS.primary}
                      />
                    </View>
                    <Text
                      style={[styles.replyAttachLabel, isOwnMessage && styles.replyAttachLabelOwn]}
                      numberOfLines={1}
                    >
                      {replyInfo.label}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[styles.replyText, isOwnMessage && styles.replyTextOwn]}
                    numberOfLines={2}
                  >
                    {replyInfo.label}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Main bubble */}
          <View
            style={[
              styles.bubble,
              isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
              message.isPinned && styles.bubblePinned,
              hasAttachments && !hasText && styles.bubbleAttachOnly,
            ]}
          >
            {/* Pin badge */}
            {message.isPinned && (
              <View style={styles.pinBadge}>
                <Ionicons name="pin" size={9} color={COLORS.warning} />
                <Text style={styles.pinBadgeText}>Pinned</Text>
              </View>
            )}

            {/* Attachments — child taps work normally (no overlay blocking them) */}
            {hasAttachments && (
              <View style={styles.attachmentsContainer}>
                <BubbleAttachments
                  attachments={message.attachments}
                  isOwnMessage={isOwnMessage}
                />
              </View>
            )}

            {/* Text content */}
            {hasText && (
              <Text style={[
                styles.content,
                isOwnMessage && styles.contentOwn,
                hasAttachments && { marginTop: 6 },
              ]}>
                {message.content}
              </Text>
            )}

            {/* File name for attachment-only messages */}
            {!hasText && attachmentLabel.length > 0 && (
              <Text
                style={[styles.attachmentLabel, isOwnMessage && styles.attachmentLabelOwn]}
                numberOfLines={1}
              >
                {attachmentLabel}
              </Text>
            )}

            {/* Footer */}
            <View style={styles.bubbleFooter}>
              {message.isEdited && (
                <Text style={[styles.editedLabel, isOwnMessage && styles.editedLabelOwn]}>edited</Text>
              )}
              <Text style={[styles.timeLabel, isOwnMessage && styles.timeLabelOwn]}>{timeLabel}</Text>
            </View>
          </View>

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
                  <Text style={[styles.reactionCount, r.hasReacted && styles.reactionCountActive]}>
                    {r.count}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setMenuVisible(true)}
                style={styles.addReactionBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={12} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </RNAnimated.View>

      {/* Context menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <PressableOverlay style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Animated.View entering={ZoomIn.duration(180).springify()} style={styles.menuCard}>
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
            <MenuItem
              icon="return-down-forward-outline"
              label="Reply"
              onPress={() => { setMenuVisible(false); onReply(message); }}
            />
            {canEdit && (
              <MenuItem
                icon="pencil-outline"
                label="Edit"
                onPress={() => { setMenuVisible(false); onEdit(message); }}
              />
            )}
            {canPin && !message.isPinned && (
              <MenuItem
                icon="pin-outline"
                label="Pin message"
                onPress={() => { setMenuVisible(false); onPin(message); }}
              />
            )}
            {canPin && message.isPinned && (
              <MenuItem
                icon="pin"
                label="Unpin message"
                color={COLORS.warning}
                onPress={() => { setMenuVisible(false); onUnpin(message.id); }}
              />
            )}
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
        </PressableOverlay>
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
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  systemMsg:  { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, paddingHorizontal: SPACING.xl, gap: 10 },
  systemLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  systemText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '500', textAlign: 'center' },

  row:            { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, marginBottom: 6, gap: 8 },
  rowOwn:         { flexDirection: 'row-reverse' },
  rowOther:       {},
  rowConsecutive: { marginBottom: 2 },
  avatarSlot:     { width: 30, flexShrink: 0 },

  highlightAccent: {
    position: 'absolute', left: 0, top: 4, bottom: 4, width: 3,
    borderRadius: 2, backgroundColor: COLORS.warning, zIndex: 1,
  },
  highlightAccentOwn: { left: 'auto', right: 0 },

  bubbleCol:    { maxWidth: '78%', alignItems: 'flex-start' },
  bubbleColOwn: { alignItems: 'flex-end' },
  senderName:   { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 3, paddingLeft: 4 },

  replyPreview: {
    flexDirection: 'row', backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, borderTopLeftRadius: 4,
    padding: SPACING.xs, marginBottom: 4, maxWidth: '100%',
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  replyPreviewOwn: {
    borderTopRightRadius: 4, borderTopLeftRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)',
  },
  replyBar:    { width: 3, borderRadius: 2, backgroundColor: COLORS.primary, marginRight: 7, flexShrink: 0 },
  replyBarOwn: { backgroundColor: 'rgba(255,255,255,0.7)' },
  replyPreviewContent: { flex: 1, minWidth: 0 },
  replyAuthor:    { color: COLORS.primary, fontSize: 10, fontWeight: '700', marginBottom: 2 },
  replyAuthorOwn: { color: 'rgba(255,255,255,0.85)' },
  replyAttachRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  replyAttachIcon:     { width: 20, height: 20, borderRadius: 5, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  replyAttachIconOwn:  { backgroundColor: 'rgba(255,255,255,0.18)' },
  replyAttachLabel:    { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', flex: 1 },
  replyAttachLabelOwn: { color: 'rgba(255,255,255,0.75)' },
  replyText:    { color: COLORS.textMuted, fontSize: 11, lineHeight: 15 },
  replyTextOwn: { color: 'rgba(255,255,255,0.6)' },

  bubble: {
    borderRadius: RADIUS.xl, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  bubbleOwn: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: 4,
  },
  bubbleOther:      {},
  bubblePinned:     { borderColor: `${COLORS.warning}60`, borderWidth: 1.5 },
  bubbleAttachOnly: { paddingHorizontal: 6, paddingVertical: 6 },

  attachmentsContainer: { width: '100%', maxWidth: 280 },

  pinBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  pinBadgeText: { color: COLORS.warning, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  content:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 21 },
  contentOwn:     { color: '#FFFFFF' },

  attachmentLabel:    { color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic', marginTop: 4, maxWidth: 260 },
  attachmentLabelOwn: { color: 'rgba(255,255,255,0.55)' },

  bubbleFooter:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, justifyContent: 'flex-end' },
  editedLabel:    { color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic' },
  editedLabelOwn: { color: 'rgba(255,255,255,0.55)' },
  timeLabel:      { color: COLORS.textMuted, fontSize: 10 },
  timeLabelOwn:   { color: 'rgba(255,255,255,0.65)' },

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

  menuOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  menuCard:           { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16 },
  quickReactions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  quickReactionBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  quickReactionEmoji: { fontSize: 22 },
  menuDivider:        { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md, marginBottom: SPACING.xs },
  menuItem:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  menuItemLabel:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '500' },
});