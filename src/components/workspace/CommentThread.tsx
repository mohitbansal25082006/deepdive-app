// src/components/workspace/CommentThread.tsx
// Part 11 — Updated: CommentReactionBar wired below each root comment.
//            Reactions require an editor or owner role to toggle.
//            Reaction state is passed in from the parent (useCommentReactions).
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ReportComment, CommentReply, CommentReactionSummary, WorkspaceRole } from '../../types';
import { Avatar } from '../common/Avatar';
import { CommentReactionBar } from './CommentReactionBar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  comment:            ReportComment;
  currentUserId:      string;
  userRole:           WorkspaceRole | null;
  reactions:          CommentReactionSummary[];          // Part 11 — pass from hook
  onToggleReaction:   (commentId: string, emoji: string) => void; // Part 11
  onReply:            (commentId: string, text: string) => Promise<void>;
  onResolve:          (commentId: string) => void;
  onDeleteComment:    (commentId: string) => void;
  onDeleteReply:      (commentId: string, replyId: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CommentThread({
  comment, currentUserId, userRole,
  reactions,
  onToggleReaction,
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
        {
          text: 'Delete', style: 'destructive',
          onPress: () => onDeleteComment(comment.id),
        },
      ],
    );
  };

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={[
        styles.thread,
        { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
        comment.isResolved && { borderColor: `${COLORS.success}25`, backgroundColor: `${COLORS.success}06` },
      ]}
    >
      {/* ── Root comment ── */}
      <View style={styles.commentRow}>
        <View style={styles.avatarWrapper}>
          <Avatar
            url={comment.author?.avatarUrl}
            name={comment.author?.fullName ?? comment.author?.username}
            size={30}
          />
        </View>

        <View style={styles.bubble}>
          {/* Bubble header */}
          <View style={styles.bubbleHeader}>
            <Text style={[styles.authorName, { color: COLORS.textPrimary }]} numberOfLines={1}>
              {comment.author?.fullName ?? comment.author?.username ?? 'Unknown'}
            </Text>
            <Text style={[styles.timestamp, { color: COLORS.textMuted }]}>{timeAgo(comment.createdAt)}</Text>

            <View style={styles.actions}>
              {comment.isResolved && (
                <View style={[styles.resolvedPill, { backgroundColor: `${COLORS.success}15` }]}>
                  <Ionicons name="checkmark-circle-outline" size={11} color={COLORS.success} />
                  <Text style={[styles.resolvedPillText, { color: COLORS.success }]}>Resolved</Text>
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
          <Text style={[
            styles.content, 
            { color: COLORS.textSecondary },
            comment.isResolved && { textDecorationLine: 'line-through', color: COLORS.textMuted }
          ]}>
            {comment.content}
          </Text>

          {/* Section tag */}
          {comment.sectionId && (
            <View style={[styles.sectionTag, { backgroundColor: `${COLORS.primary}12` }]}>
              <Ionicons name="bookmark-outline" size={10} color={COLORS.primary} />
              <Text style={[styles.sectionTagText, { color: COLORS.primary }]}>Section comment</Text>
            </View>
          )}

          {/* ── Part 11: Reaction bar ── */}
          <CommentReactionBar
            summaries={reactions}
            onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
            disabled={!isEditor}
          />

          {/* Footer */}
          <View style={styles.bubbleFooter}>
            {isEditor && (
              <TouchableOpacity
                onPress={() => setShowReplyBox((v) => !v)}
                style={styles.footerBtn}
              >
                <Ionicons name="return-down-forward-outline" size={13} color={COLORS.primary} />
                <Text style={[styles.footerBtnText, { color: COLORS.primary }]}>Reply</Text>
              </TouchableOpacity>
            )}
            {replyCount > 0 && (
              <TouchableOpacity
                onPress={() => setCollapsed((v) => !v)}
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
        <Animated.View entering={FadeIn.duration(200)} style={[styles.replyInputWrap, { borderTopColor: COLORS.border }]}>
          <View style={styles.replyAvatarWrapper}>
            <Avatar url={undefined} name="Me" size={26} />
          </View>
          <View style={styles.replyInputInner}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Write a reply…"
              placeholderTextColor={COLORS.textMuted}
              style={[
                styles.replyInput, 
                { 
                  color: COLORS.textPrimary, 
                  borderColor: `${COLORS.primary}35`,
                  backgroundColor: COLORS.backgroundCard 
                }
              ]}
              multiline
              autoFocus
              maxLength={1000}
            />
            <View style={styles.replyInputFooter}>
              <TouchableOpacity
                onPress={() => { setShowReplyBox(false); setReplyText(''); }}
              >
                <Text style={[styles.cancelText, { color: COLORS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSendReply}
                disabled={!replyText.trim() || isSending}
                style={[
                  styles.sendBtn,
                  { backgroundColor: COLORS.primary },
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
      <View style={[styles.threadLine, { backgroundColor: COLORS.border }]} />
      <View style={styles.replyRowAvatarWrapper}>
        <Avatar
          url={reply.author?.avatarUrl}
          name={reply.author?.fullName ?? reply.author?.username}
          size={24}
        />
      </View>
      <View style={[styles.replyBubble, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
        <View style={styles.bubbleHeader}>
          <Text style={[styles.replyAuthor, { color: COLORS.textPrimary }]} numberOfLines={1}>
            {reply.author?.fullName ?? reply.author?.username ?? 'Unknown'}
          </Text>
          <Text style={[styles.timestamp, { color: COLORS.textMuted }]}>{timeAgo(reply.createdAt)}</Text>
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
        <Text style={[styles.replyContent, { color: COLORS.textSecondary }]}>{reply.content}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  thread: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  threadResolved: {
    opacity: 0.6,
    borderColor: `${COLORS.success}25`,
    backgroundColor: `${COLORS.success}06`,
  },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatarWrapper: { flexShrink: 0, marginTop: 2 },
  bubble: { flex: 1 },
  bubbleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 5, flexWrap: 'wrap',
  },
  authorName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700', flexShrink: 1,
  },
  timestamp: { fontSize: FONTS.sizes.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  actionIcon: { padding: 3 },
  resolvedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  resolvedPillText: { fontSize: 10, fontWeight: '700' },
  content: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  contentResolved: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  sectionTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
    borderRadius: RADIUS.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sectionTagText: { fontSize: 10, fontWeight: '600' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  footerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerBtnText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  replyInputWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: SPACING.sm, paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  replyAvatarWrapper: { marginTop: 2, flexShrink: 0 },
  replyInputInner:    { flex: 1 },
  replyInput: {
    fontSize: FONTS.sizes.sm,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    minHeight: 52,
    marginBottom: 8, textAlignVertical: 'top',
  },
  replyInputFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 10,
  },
  cancelText: { fontSize: FONTS.sizes.sm },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  sendBtnText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },
  replies:    { marginTop: SPACING.sm, gap: 0 },
  replyRow:   { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 10, gap: 8 },
  threadLine: {
    width: 1.5, alignSelf: 'stretch',
    marginLeft: 14, marginRight: -1, borderRadius: 1,
  },
  replyRowAvatarWrapper: { flexShrink: 0, marginTop: 1 },
  replyBubble: {
    flex: 1,
    borderRadius: RADIUS.lg, padding: SPACING.sm,
    borderWidth: 1,
  },
  replyAuthor: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700', flexShrink: 1,
  },
  replyContent: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 18, marginTop: 3,
  },
});