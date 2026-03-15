// src/components/workspace/ActivityItem.tsx
// Part 18 — Updated with all new WorkspaceActivityAction types.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkspaceActivity, WorkspaceActivityAction } from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

type ActionConfig = {
  icon:  keyof typeof Ionicons.glyphMap;
  color: string;
  label: (a: WorkspaceActivity) => string;
};

const ACTION_MAP: Partial<Record<WorkspaceActivityAction, ActionConfig>> = {
  // ── Part 10 originals ──────────────────────────────────────────────────────
  workspace_created:    { icon: 'sparkles',              color: COLORS.primary,  label: () => 'created this workspace' },
  workspace_updated:    { icon: 'pencil-outline',        color: COLORS.info,     label: () => 'updated workspace settings' },
  report_added:         { icon: 'document-text',         color: COLORS.success,  label: () => 'shared a research report' },
  report_removed:       { icon: 'trash-outline',         color: COLORS.error,    label: () => 'removed a report' },
  member_joined:        { icon: 'person-add',            color: COLORS.accent ?? COLORS.primary,   label: () => 'joined the workspace' },
  member_left:          { icon: 'log-out-outline',       color: COLORS.warning,  label: () => 'left the workspace' },
  member_removed:       { icon: 'person-remove',         color: COLORS.error,    label: () => 'removed a member' },
  member_role_changed:  {
    icon: 'shield-outline',
    color: COLORS.info,
    label: (a) => {
      const meta = a.metadata as Record<string, unknown>;
      const newRole = (meta?.new_role as string) ?? '';
      const target  = (meta?.target_name as string) ?? 'a member';
      return `changed ${target}'s role to ${newRole}`;
    },
  },
  comment_added:        { icon: 'chatbubble',            color: COLORS.primary,  label: () => 'added a comment' },
  comment_resolved:     { icon: 'checkmark-circle',      color: COLORS.success,  label: () => 'resolved a comment' },
  ownership_transferred:{
    icon: 'key-outline',
    color: COLORS.pro ?? COLORS.warning,
    label: (a) => {
      const meta = a.metadata as Record<string, unknown>;
      const to   = (meta?.new_owner_name as string) ?? 'a new owner';
      return `transferred ownership to ${to}`;
    },
  },
  member_blocked:       {
    icon: 'ban-outline',
    color: COLORS.error,
    label: (a) => {
      const meta   = a.metadata as Record<string, unknown>;
      const target = (meta?.blocked_name as string) ?? 'a member';
      return `blocked ${target}`;
    },
  },

  // ── Part 16 ────────────────────────────────────────────────────────────────
  debate_shared:        {
    icon: 'git-compare-outline',
    color: '#8B5CF6',
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const topic = (meta?.topic as string) ?? 'a debate';
      return `shared a debate: "${topic}"`;
    },
  },

  // ── Part 18 new actions ────────────────────────────────────────────────────
  presentation_shared:  {
    icon: 'easel-outline',
    color: '#3B82F6',
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const title = (meta?.title as string) ?? 'a presentation';
      return `shared a presentation: "${title}"`;
    },
  },
  academic_paper_shared:{
    icon: 'school-outline',
    color: '#10B981',
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const title = (meta?.title as string) ?? 'an academic paper';
      return `shared a paper: "${title}"`;
    },
  },
  podcast_shared:       {
    icon: 'mic-outline',
    color: '#F59E0B',
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const title = (meta?.title as string) ?? 'a podcast';
      return `shared a podcast: "${title}"`;
    },
  },
  chat_mention:         {
    icon: 'at-circle-outline',
    color: COLORS.primary,
    label: (a) => {
      const meta    = a.metadata as Record<string, unknown>;
      const target  = (meta?.mentioned_name as string) ?? 'someone';
      return `mentioned ${target} in chat`;
    },
  },
  report_pinned:        {
    icon: 'pin',
    color: COLORS.warning,
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const title = (meta?.report_title as string) ?? 'a report';
      return `pinned "${title}"`;
    },
  },
  report_unpinned:      {
    icon: 'pin-outline',
    color: COLORS.textMuted,
    label: (a) => {
      const meta  = a.metadata as Record<string, unknown>;
      const title = (meta?.report_title as string) ?? 'a report';
      return `unpinned "${title}"`;
    },
  },
  comment_reply_added:  {
    icon: 'return-down-forward-outline',
    color: COLORS.info,
    label: () => 'replied to a comment',
  },
  access_request_sent:  {
    icon: 'hand-right-outline',
    color: COLORS.primary,
    label: () => 'requested editor access',
  },
  access_request_approved: {
    icon: 'checkmark-circle',
    color: COLORS.success,
    label: (a) => {
      const meta   = a.metadata as Record<string, unknown>;
      const target = (meta?.requester_name as string) ?? 'a member';
      return `approved editor access for ${target}`;
    },
  },
  access_request_denied: {
    icon: 'close-circle-outline',
    color: COLORS.error,
    label: (a) => {
      const meta   = a.metadata as Record<string, unknown>;
      const target = (meta?.requester_name as string) ?? 'a member';
      return `denied editor access for ${target}`;
    },
  },
};

// ─── Fallback config ──────────────────────────────────────────────────────────

const FALLBACK: ActionConfig = {
  icon:  'ellipse-outline',
  color: COLORS.textMuted,
  label: (a) => a.action.replace(/_/g, ' '),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  activity: WorkspaceActivity;
}

export function ActivityItem({ activity }: Props) {
  const conf = ACTION_MAP[activity.action] ?? FALLBACK;

  const actor = activity.actorProfile;
  const name  = actor?.fullName ?? actor?.username ?? 'Someone';

  return (
    <View style={styles.row}>
      {/* Left: icon + connector line */}
      <View style={styles.leftCol}>
        <View style={[styles.iconWrap, { backgroundColor: `${conf.color}20` }]}>
          <Ionicons name={conf.icon} size={15} color={conf.color} />
        </View>
        <View style={styles.connector} />
      </View>

      {/* Right: content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          {actor && (
            <View style={styles.avatarWrapper}>
              <Avatar
                url={actor.avatarUrl}
                name={actor.fullName ?? actor.username}
                size={22}
              />
            </View>
          )}
          <Text style={styles.text} numberOfLines={3}>
            <Text style={styles.actorName}>{name}</Text>
            {' '}
            {conf.label(activity)}
          </Text>
        </View>
        <Text style={styles.time}>{timeAgo(activity.createdAt)}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    gap:            12,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
  },
  leftCol: {
    alignItems: 'center',
    width:      32,
  },
  iconWrap: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  connector: {
    flex:            1,
    width:           1,
    backgroundColor: COLORS.border,
    marginTop:       4,
  },
  content: {
    flex:       1,
    paddingTop: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  avatarWrapper: {
    marginRight:  6,
    borderRadius: 11,
    overflow:     'hidden',
    width:        22,
    height:       22,
  },
  actorName: {
    color:      COLORS.textPrimary,
    fontWeight: '700',
  },
  text: {
    color:     COLORS.textSecondary,
    fontSize:  FONTS.sizes.sm,
    lineHeight: 19,
    flex:      1,
  },
  time: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    marginTop: 2,
  },
});