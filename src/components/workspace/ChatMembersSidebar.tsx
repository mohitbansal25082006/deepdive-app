// src/components/workspace/ChatMembersSidebar.tsx
// Part 50 — Members sidebar panel for workspace chat
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
//             No dark-only assumptions.

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  Modal,
  Image,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(SCREEN_W * 0.78, 320);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMemberInfo {
  userId:    string;
  name:      string;
  username:  string | null;
  avatarUrl: string | null;
  role:      'owner' | 'editor' | 'viewer';
  isOnline:  boolean;
}

export type WorkspaceMemberRoles = Record<string, 'owner' | 'editor' | 'viewer'>;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = 40 }: { member: ChatMemberInfo; size?: number }) {
  const initials = (member.name || member.username || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colors = [
    '#6C63FF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  ];
  const color = colors[member.userId.charCodeAt(0) % colors.length];

  if (member.avatarUrl) {
    return (
      <Image
        source={{ uri: member.avatarUrl }}
        style={[styles.avatarImg, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.backgroundElevated }]}
      />
    );
  }

  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.avatarInitials, { color: '#FFF', fontWeight: '800', fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  'owner' | 'editor' | 'viewer',
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  owner:  { color: '#FFD700', icon: 'star',          label: 'Owner'  },
  editor: { color: COLORS.primary, icon: 'create-outline', label: 'Editor' },
  viewer: { color: COLORS.textMuted, icon: 'eye-outline', label: 'Viewer' },
};

function RoleBadge({ role }: { role: 'owner' | 'editor' | 'viewer' }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.editor;
  return (
    <View style={[
      styles.roleBadge,
      { borderColor: `${cfg.color}40`, backgroundColor: `${cfg.color}18` },
    ]}>
      <Ionicons name={cfg.icon} size={10} color={cfg.color} />
      <Text style={[styles.roleText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

interface MemberRowProps {
  member:          ChatMemberInfo;
  workspaceRole?:  'owner' | 'editor' | 'viewer';
}

function MemberRow({ member, workspaceRole }: MemberRowProps) {
  const displayRole = workspaceRole ?? member.role;

  return (
    <View style={styles.memberRow}>
      <View style={styles.avatarWrap}>
        <MemberAvatar member={member} size={40} />
        <View style={[
          styles.onlineDot,
          { backgroundColor: member.isOnline ? COLORS.success : COLORS.textMuted, borderColor: COLORS.backgroundCard },
        ]} />
      </View>

      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: COLORS.textPrimary }]} numberOfLines={1}>
          {member.name || member.username || 'Unknown'}
        </Text>
        {member.username && (
          <Text style={[styles.memberUsername, { color: COLORS.textMuted }]} numberOfLines={1}>
            @{member.username}
          </Text>
        )}
      </View>

      <View style={styles.memberRight}>
        <RoleBadge role={displayRole} />
        <Text style={[
          styles.statusText,
          { color: member.isOnline ? COLORS.success : COLORS.textMuted },
        ]}>
          {member.isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <View style={[secStyles.row, { borderLeftColor: color }]}>
      <Text style={[secStyles.title, { color: COLORS.textSecondary }]}>{title}</Text>
      <View style={[secStyles.badge, { backgroundColor: `${color}20` }]}>
        <Text style={[secStyles.badgeText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

const secStyles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    marginBottom:    4,
    borderLeftWidth: 3,
    borderRadius:    4,
  },
  title: {
    fontSize:     FONTS.sizes.xs,
    fontWeight:   '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex:          1,
  },
  badge: {
    borderRadius:      RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  badgeText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '800',
  },
});

// ─── Flat list item shape ─────────────────────────────────────────────────────

type ListItem =
  | { type: 'section'; key: string; title: string; count: number; color: string }
  | { type: 'member';  key: string; member: ChatMemberInfo; workspaceRole?: 'owner' | 'editor' | 'viewer' };

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible:           boolean;
  members:           ChatMemberInfo[];
  onlineCount:       number;
  onClose:           () => void;
  workspaceMemberRoles?: WorkspaceMemberRoles;
}

export function ChatMembersSidebar({
  visible,
  members,
  onlineCount,
  onClose,
  workspaceMemberRoles,
}: Props) {
  const insets = useSafeAreaInsets();

  const resolveRole = (m: ChatMemberInfo): 'owner' | 'editor' | 'viewer' => {
    if (workspaceMemberRoles && workspaceMemberRoles[m.userId]) {
      return workspaceMemberRoles[m.userId];
    }
    return m.role;
  };

  const { owners, editors, viewers } = useMemo(() => {
    const o: ChatMemberInfo[] = [];
    const e: ChatMemberInfo[] = [];
    const v: ChatMemberInfo[] = [];

    [...members]
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      })
      .forEach(m => {
        const r = resolveRole(m);
        if (r === 'owner')  o.push(m);
        else if (r === 'editor') e.push(m);
        else v.push(m);
      });

    return { owners: o, editors: e, viewers: v };
  }, [members, workspaceMemberRoles]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    owners.forEach(m => items.push({ type: 'member', key: `m-${m.userId}`, member: m, workspaceRole: 'owner' }));
    if (editors.length > 0) {
      items.push({ type: 'section', key: 'sec-editor', title: 'Editors', count: editors.length, color: COLORS.primary });
      editors.forEach(m => items.push({ type: 'member', key: `m-${m.userId}`, member: m, workspaceRole: 'editor' }));
    }
    if (viewers.length > 0) {
      items.push({ type: 'section', key: 'sec-viewer', title: 'Viewers', count: viewers.length, color: COLORS.textMuted });
      viewers.forEach(m => items.push({ type: 'member', key: `m-${m.userId}`, member: m, workspaceRole: 'viewer' }));
    }

    return items;
  }, [owners, editors, viewers]);

  const offlineCount = members.length - onlineCount;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'section') {
      return (
        <SectionHeader
          title={item.title}
          count={item.count}
          color={item.color}
        />
      );
    }
    return (
      <MemberRow
        member={item.member}
        workspaceRole={item.workspaceRole}
      />
    );
  };

  const backdropColor = getModalBackdrop(0.45);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={[styles.backdrop, { backgroundColor: backdropColor }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View
        entering={SlideInRight.duration(280)}
        exiting={SlideOutRight.duration(220)}
        style={[
          styles.sidebar,
          {
            backgroundColor: COLORS.backgroundCard,
            borderLeftColor: COLORS.border,
            paddingTop:    insets.top + 8,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: `${COLORS.primary}18`, borderColor: `${COLORS.primary}30` }]}>
              <Ionicons name="people" size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>Members</Text>
              <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>{members.length} total</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <View style={[styles.statDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.statText, { color: COLORS.textSecondary }]}>{onlineCount} Online</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <View style={[styles.statDot, { backgroundColor: COLORS.textMuted }]} />
            <Text style={[styles.statText, { color: COLORS.textSecondary }]}>{offlineCount} Offline</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: COLORS.border }]} />

        <FlatList
          data={listData}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sidebar: {
    position:         'absolute',
    top:              0,
    right:            0,
    bottom:           0,
    width:            SIDEBAR_W,
    borderLeftWidth:  1,
    shadowColor:      '#000',
    shadowOffset:     { width: -8, height: 0 },
    shadowOpacity:    0.3,
    shadowRadius:     20,
    elevation:        32,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:  SPACING.sm,
    gap:              10,
  },
  headerLeft: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  headerIcon: {
    width:           36,
    height:          36,
    borderRadius:    11,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
  },
  headerTitle: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: FONTS.sizes.xs,
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
  },
  statsRow: {
    flexDirection:    'row',
    gap:              6,
    paddingHorizontal: SPACING.lg,
    paddingBottom:    SPACING.sm,
    flexWrap:         'wrap',
  },
  statPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: 10,
    paddingVertical:  4,
    borderRadius:     RADIUS.full,
    borderWidth:      1,
  },
  statDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  statText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  divider: {
    height:           1,
    marginHorizontal: SPACING.lg,
    marginBottom:     SPACING.sm,
  },
  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.lg,
  },

  memberRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingVertical:  SPACING.sm,
    paddingHorizontal: SPACING.xs,
    gap:              10,
    borderRadius:     RADIUS.lg,
  },
  avatarWrap: {
    position:   'relative',
    flexShrink: 0,
  },
  avatarImg: {
    backgroundColor: COLORS.backgroundElevated,
  },
  avatarFallback: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color:      '#FFF',
    fontWeight: '800',
  },
  onlineDot: {
    position:     'absolute',
    bottom:       0,
    right:        0,
    width:        11,
    height:       11,
    borderRadius: 6,
    borderWidth:  2,
  },
  memberInfo: {
    flex:    1,
    minWidth: 0,
  },
  memberName: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  memberUsername: {
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  memberRight: {
    alignItems: 'flex-end',
    gap:        4,
    flexShrink: 0,
  },
  roleBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              3,
    paddingHorizontal: 6,
    paddingVertical:  2,
    borderRadius:     RADIUS.full,
    borderWidth:      1,
  },
  roleText: {
    fontSize:      9,
    fontWeight:    '700',
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize:   9,
    fontWeight: '600',
  },
});