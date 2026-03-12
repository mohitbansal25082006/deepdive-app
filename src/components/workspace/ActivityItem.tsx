// src/components/workspace/ActivityItem.tsx
// Single row in the workspace activity feed.

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

const ACTION_MAP: Record<WorkspaceActivityAction, ActionConfig> = {
  workspace_created:    { icon: 'sparkles',            color: COLORS.primary,  label: () => 'created this workspace' },
  workspace_updated:    { icon: 'pencil-outline',      color: COLORS.info,     label: () => 'updated workspace settings' },
  report_added:         { icon: 'document-text',       color: COLORS.success,  label: () => 'shared a research report' },
  report_removed:       { icon: 'trash-outline',       color: COLORS.error,    label: () => 'removed a report' },
  member_joined:        { icon: 'person-add',          color: COLORS.accent,   label: () => 'joined the workspace' },
  member_left:          { icon: 'log-out-outline',     color: COLORS.warning,  label: () => 'left the workspace' },
  member_removed:       { icon: 'person-remove',       color: COLORS.error,    label: () => 'removed a member' },
  member_role_changed:  { icon: 'shield-outline',      color: COLORS.info,     label: (a) => `changed a member's role to ${(a.metadata as Record<string, unknown>)?.new_role ?? ''}` },
  comment_added:        { icon: 'chatbubble',          color: COLORS.primary,  label: () => 'added a comment' },
  comment_resolved:     { icon: 'checkmark-circle',   color: COLORS.success,  label: () => 'resolved a comment' },
  ownership_transferred:{ icon: 'key-outline',         color: COLORS.pro,      label: () => 'transferred workspace ownership' },
};

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  activity: WorkspaceActivity;
}

export function ActivityItem({ activity }: Props) {
  const conf = ACTION_MAP[activity.action] ?? {
    icon: 'ellipse-outline', color: COLORS.textMuted, label: () => activity.action,
  };

  const actor  = activity.actorProfile;
  const name   = actor?.fullName ?? actor?.username ?? 'Someone';

  return (
    <View style={styles.row}>
      {/* Left: avatar + connector line */}
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
          <Text style={styles.text} numberOfLines={2}>
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

const styles = StyleSheet.create({
  row: { 
    flexDirection: 'row', 
    gap: 12, 
    paddingVertical: 6, 
    paddingHorizontal: SPACING.md 
  },
  leftCol: { 
    alignItems: 'center', 
    width: 32 
  },
  iconWrap: { 
    width: 32, 
    height: 32, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  connector: { 
    flex: 1, 
    width: 1, 
    backgroundColor: COLORS.border, 
    marginTop: 4 
  },
  content: { 
    flex: 1, 
    paddingTop: 5 
  },
  topRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start' 
  },
  avatarWrapper: {
    marginRight: 6,
    borderRadius: 11, // Half of avatar size (22/2)
    overflow: 'hidden',
    width: 22,
    height: 22,
  },
  actorName: { 
    color: COLORS.textPrimary, 
    fontWeight: '700' 
  },
  text: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm, 
    lineHeight: 19, 
    flex: 1 
  },
  time: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    marginTop: 2 
  },
});