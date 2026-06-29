// src/components/workspace/CommentThread.tsx
// Part 58.1 — Advanced comment thread.
//
// Changes vs Part 11/55.2:
//   • RESOLVE / UNRESOLVE SYSTEM REMOVED ENTIRELY — no resolved pill, no
//     resolve button, no strike-through, no onResolve prop. Comments are now a
//     pure discussion thread.
//   • Reaction bar is always shown for editors (so a fresh comment can be
//     reacted to immediately) and remains visible to everyone once reactions
//     exist.
//   • Optional `highlighted` flag pulses a comment when it's been deep-linked
//     to from a member profile.
//   • Cleaner header: author + relative time + a single overflow-free actions
//     cluster (reply / delete) with larger tap targets.
//   • Fully theme-integrated (live COLORS).

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle, withSequence, withTiming,
} from 'react-native-reanimated';
import { ReportComment, CommentReply, CommentReactionSummary, WorkspaceRole } from '../../types';
import { Avatar } from '../common/Avatar';
import { CommentReactionBar } from './CommentReactionBar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  comment:            ReportComment;
  currentUserId:      string;
  userRole:           WorkspaceRole | null;
  reactions:          CommentReactionSummary[];
  onToggleReaction:   (commentId: string, emoji: string) => void;
  onReply:            (commentId: string, text: string) => Promise<void>;
  onDeleteComment:    (commentId: string) => void;
  onDeleteReply:      (commentId: string, replyId: string) => void;
  /** Part 58.1 — pulse this comment (deep-link target). */
  highlighted?:       boolean;
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
  reactions, onToggleReaction,
  onReply, onDeleteComment, onDeleteReply,
  highlighted = false,
}: Props) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText,    setReplyText]    = useState('');
  const [isSending,    setIsSending]    = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);

  const isEditor        = userRole === 'owner' || userRole === 'editor';
  const canDeleteThread = comment.userId === currentUserId || userRole === 'owner';
  const replyCount      = comment.replies?.length ?? 0;

  // ── Highlight pulse (deep-link) ──────────────────────────────────────────
  const glow = useSharedValue(0);
  useEffect(() => {
    if (highlighted) {
      glow.value = withSequence(
        withTiming(1, { duration: 280 }),
        withTiming(1, { duration: 1400 }),
        withTiming(0, { duration: 600 }),
      );
    }
  }, [highlighted]);
  const glowStyle = useAnimatedStyle(() => ({
    borderColor: glow.value > 0 ? COLORS.primary : COLORS.border,
    backgroundColor: glow.value > 0
      ? `${COLORS.primary}10`
      : COLORS.backgroundElevated,
  }));

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
      style={[styles.thread, glowStyle]}
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
          {/* Header */}
          <View style={styles.bubbleHeader}>
            <Text style={[styles.authorName, { color: COLORS.textPrimary }]} numberOfLines={1}>
              {comment.author?.fullName ?? comment.author?.username ?? 'Unknown'}
            </Text>
            <Text style={[styles.timestamp, { color: COLORS.textMuted }]}>{timeAgo(comment.createdAt)}</Text>

            <View style={styles.actions}>
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
          <Text style={[styles.content, { color: COLORS.textSecondary }]}>
            {comment.content}
          </Text>

          {/* Section tag */}
          {comment.sectionId && (
            <View style={[styles.sectionTag, { backgroundColor: `${COLORS.primary}12` }]}>
              <Ionicons name="bookmark-outline" size={10} color={COLORS.primary} />
              <Text style={[styles.sectionTagText, { color: COLORS.primary }]}>Section comment</Text>
            </View>
          )}

          {/* Reactions */}
          <CommentReactionBar
            summaries={reactions}
            onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
            disabled={!isEditor}
          />

          {/* Footer */}
          <View style={styles.bubbleFooter}>
            {isEditor && (
              <TouchableOpacity onPress={() => setShowReplyBox((v) => !v)} style={styles.footerBtn}>
                <Ionicons name="return-down-forward-outline" size={13} color={COLORS.primary} />
                <Text style={[styles.footerBtnText, { color: COLORS.primary }]}>Reply</Text>
              </TouchableOpacity>
            )}
            {replyCount > 0 && (
              <TouchableOpacity onPress={() => setCollapsed((v) => !v)} style={styles.footerBtn}>
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
                { color: COLORS.textPrimary, borderColor: `${COLORS.primary}35`, backgroundColor: COLORS.backgroundCard },
              ]}
              multiline
              autoFocus
              maxLength={1000}
            />
            <View style={styles.replyInputFooter}>
              <TouchableOpacity onPress={() => { setShowReplyBox(false); setReplyText(''); }}>
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
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatarWrapper: { flexShrink: 0, marginTop: 2 },
  bubble: { flex: 1 },
  bubbleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 5, flexWrap: 'wrap',
  },
  authorName: { fontSize: FONTS.sizes.sm, fontWeight: '700', flexShrink: 1 },
  timestamp: { fontSize: FONTS.sizes.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  actionIcon: { padding: 3 },
  content: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
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
  replyAuthor: { fontSize: FONTS.sizes.xs, fontWeight: '700', flexShrink: 1 },
  replyContent: { fontSize: FONTS.sizes.xs, lineHeight: 18, marginTop: 3 },
});