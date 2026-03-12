// src/components/workspace/CommentThread.tsx
// Redesigned comment thread — cleaner layout, better typography,
// avatar + name inline, resolve/delete as icon-only actions.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ReportComment, CommentReply, WorkspaceRole } from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  comment:        ReportComment;
  currentUserId:  string;
  userRole:       WorkspaceRole | null;
  onReply:        (commentId: string, text: string) => Promise<void>;
  onResolve:      (commentId: string) => void;
  onDeleteComment:(commentId: string) => void;
  onDeleteReply:  (commentId: string, replyId: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CommentThread({
  comment, currentUserId, userRole,
  onReply, onResolve, onDeleteComment, onDeleteReply,
}: Props) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText,    setReplyText]    = useState('');
  const [isSending,    setIsSending]    = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);

  const isEditor        = userRole === 'owner' || userRole === 'editor';
  const canDeleteThread = comment.userId === currentUserId || userRole === 'owner';
  const replyCount      = comment.replies?.length ?? 0;

  const handleSendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    await onReply(comment.id, trimmed);
    setReplyText('');
    setShowReplyBox(false);
    setIsSending(false);
  };

  const handleDeleteThread = () => {
    Alert.alert(
      'Delete comment',
      replyCount > 0
        ? `This will also delete ${replyCount} repl${replyCount > 1 ? 'ies' : 'y'}.`
        : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteComment(comment.id) },
      ],
    );
  };

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={[
        styles.thread,
        comment.isResolved && styles.threadResolved,
      ]}
    >
      {/* ── Root comment ── */}
      <View style={styles.commentRow}>
        {/* Avatar wrapper */}
        <View style={styles.avatarWrapper}>
          <Avatar
            url={comment.author?.avatarUrl}
            name={comment.author?.fullName ?? comment.author?.username}
            size={30}
          />
        </View>

        {/* Bubble */}
        <View style={styles.bubble}>
          {/* Bubble header */}
          <View style={styles.bubbleHeader}>
            <Text style={styles.authorName} numberOfLines={1}>
              {comment.author?.fullName ?? comment.author?.username ?? 'Unknown'}
            </Text>
            <Text style={styles.timestamp}>{timeAgo(comment.createdAt)}</Text>

            {/* Actions */}
            <View style={styles.actions}>
              {comment.isResolved && (
                <View style={styles.resolvedPill}>
                  <Ionicons name="checkmark-circle-outline" size={11} color={COLORS.success} />
                  <Text style={styles.resolvedPillText}>Resolved</Text>
                </View>
              )}
              {isEditor && (
                <TouchableOpacity
                  onPress={() => onResolve(comment.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionIcon}
                >
                  <Ionicons
                    name={comment.isResolved ? 'arrow-undo-outline' : 'checkmark-done-outline'}
                    size={15}
                    color={comment.isResolved ? COLORS.warning : COLORS.success}
                  />
                </TouchableOpacity>
              )}
              {canDeleteThread && (
                <TouchableOpacity
                  onPress={handleDeleteThread}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionIcon}
                >
                  <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Content */}
          <Text style={[styles.content, comment.isResolved && styles.contentResolved]}>
            {comment.content}
          </Text>

          {/* Section tag */}
          {comment.sectionId && (
            <View style={styles.sectionTag}>
              <Ionicons name="bookmark-outline" size={10} color={COLORS.primary} />
              <Text style={styles.sectionTagText}>Section comment</Text>
            </View>
          )}

          {/* Footer: reply link + thread toggle */}
          <View style={styles.bubbleFooter}>
            {isEditor && (
              <TouchableOpacity
                onPress={() => setShowReplyBox(v => !v)}
                style={styles.footerBtn}
              >
                <Ionicons name="return-down-forward-outline" size={13} color={COLORS.primary} />
                <Text style={styles.footerBtnText}>Reply</Text>
              </TouchableOpacity>
            )}
            {replyCount > 0 && (
              <TouchableOpacity
                onPress={() => setCollapsed(v => !v)}
                style={styles.footerBtn}
              >
                <Ionicons
                  name={collapsed ? 'chevron-down-outline' : 'chevron-up-outline'}
                  size={12}
                  color={COLORS.textMuted}
                />
                <Text style={[styles.footerBtnText, { color: COLORS.textMuted }]}>
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── Reply input ── */}
      {showReplyBox && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.replyInputWrap}>
          <View style={styles.replyAvatarWrapper}>
            <Avatar
              url={undefined}
              name="Me"
              size={26}
            />
          </View>
          <View style={styles.replyInputInner}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Write a reply…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.replyInput}
              multiline
              autoFocus
              maxLength={1000}
            />
            <View style={styles.replyInputFooter}>
              <TouchableOpacity onPress={() => { setShowReplyBox(false); setReplyText(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSendReply}
                disabled={!replyText.trim() || isSending}
                style={[
                  styles.sendBtn,
                  { opacity: replyText.trim() && !isSending ? 1 : 0.4 },
                ]}
              >
                <Ionicons name="send" size={13} color="#FFF" />
                <Text style={styles.sendBtnText}>{isSending ? '…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ── Replies ── */}
      {!collapsed && replyCount > 0 && (
        <View style={styles.replies}>
          {comment.replies!.map((reply, i) => (
            <ReplyRow
              key={reply.id}
              reply={reply}
              currentUserId={currentUserId}
              userRole={userRole}
              onDelete={() => onDeleteReply(comment.id, reply.id)}
              index={i}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Reply row ────────────────────────────────────────────────────────────────

function ReplyRow({
  reply, currentUserId, userRole, onDelete, index,
}: {
  reply: CommentReply;
  currentUserId: string;
  userRole: WorkspaceRole | null;
  onDelete: () => void;
  index: number;
}) {
  const canDelete = reply.userId === currentUserId || userRole === 'owner';

  return (
    <Animated.View
      entering={FadeInDown.duration(220).delay(index * 30)}
      style={styles.replyRow}
    >
      {/* Thread line */}
      <View style={styles.threadLine} />

      <View style={styles.replyRowAvatarWrapper}>
        <Avatar
          url={reply.author?.avatarUrl}
          name={reply.author?.fullName ?? reply.author?.username}
          size={24}
        />
      </View>

      <View style={styles.replyBubble}>
        <View style={styles.bubbleHeader}>
          <Text style={styles.replyAuthor} numberOfLines={1}>
            {reply.author?.fullName ?? reply.author?.username ?? 'Unknown'}
          </Text>
          <Text style={styles.timestamp}>{timeAgo(reply.createdAt)}</Text>
          {canDelete && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert('Delete reply', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                ])
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.actionIcon, { marginLeft: 'auto' }]}
            >
              <Ionicons name="trash-outline" size={12} color={COLORS.error} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.replyContent}>{reply.content}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Thread wrapper
  thread: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  threadResolved: {
    opacity: 0.6,
    borderColor: `${COLORS.success}25`,
    backgroundColor: `${COLORS.success}06`,
  },

  // Root comment row
  commentRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 10 
  },
  avatarWrapper: { 
    flexShrink: 0, 
    marginTop: 2 
  },

  // Bubble
  bubble: { 
    flex: 1 
  },
  bubbleHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    marginBottom: 5,
    flexWrap: 'wrap',
  },
  authorName: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  timestamp: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  actions: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    marginLeft: 'auto' 
  },
  actionIcon: { 
    padding: 3 
  },
  resolvedPill: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 3,
    backgroundColor: `${COLORS.success}15`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6, 
    paddingVertical: 2,
  },
  resolvedPillText: { 
    color: COLORS.success, 
    fontSize: 10, 
    fontWeight: '700' 
  },
  content: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
  },
  contentResolved: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
  },
  sectionTag: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
    marginTop: 6, 
    alignSelf: 'flex-start',
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 7, 
    paddingVertical: 2,
  },
  sectionTagText: { 
    color: COLORS.primary, 
    fontSize: 10, 
    fontWeight: '600' 
  },
  bubbleFooter: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    marginTop: 8 
  },
  footerBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  footerBtnText: { 
    color: COLORS.primary, 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '600' 
  },

  // Reply input
  replyInputWrap: {
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 8,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1, 
    borderTopColor: COLORS.border,
  },
  replyAvatarWrapper: { 
    marginTop: 2, 
    flexShrink: 0 
  },
  replyInputInner: { 
    flex: 1 
  },
  replyInput: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    borderWidth: 1, 
    borderColor: `${COLORS.primary}35`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12, 
    paddingVertical: 9,
    minHeight: 52,
    backgroundColor: COLORS.backgroundCard,
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  replyInputFooter: {
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'flex-end', 
    gap: 10,
  },
  cancelText: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.sm 
  },
  sendBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12, 
    paddingVertical: 7,
  },
  sendBtnText: { 
    color: '#FFF', 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '700' 
  },

  // Replies
  replies: { 
    marginTop: SPACING.sm, 
    gap: 0 
  },
  replyRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    paddingTop: 10, 
    gap: 8 
  },
  threadLine: {
    width: 1.5, 
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
    marginLeft: 14, 
    marginRight: -1,
    borderRadius: 1,
  },
  replyRowAvatarWrapper: { 
    flexShrink: 0, 
    marginTop: 1 
  },
  replyBubble: {
    flex: 1,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    borderWidth: 1, 
    borderColor: COLORS.border,
  },
  replyAuthor: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    flexShrink: 1,
  },
  replyContent: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
    marginTop: 3,
  },
});