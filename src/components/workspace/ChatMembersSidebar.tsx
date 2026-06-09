// src/components/workspace/ChatMembersSidebar.tsx
// Part 50 — Members sidebar panel for workspace chat
// Part 50.1 FIX — Role display: Stream Chat doesn't store workspace roles.
// Part 50.5 — Removed "X Owner" section header and stat chip. A workspace
//             always has exactly one owner; no count badge needed. The owner
//             member row sits at the top of the list identified only by their
//             gold star RoleBadge — cleaner and less redundant.
//   The sidebar now accepts an optional `workspaceMembers` prop containing the
//   real Supabase workspace roles (owner / editor / viewer). When provided, the
//   role shown in the badge is taken from Supabase, NOT from Stream.
//   Without the prop it gracefully falls back to the previous behaviour.

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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(SCREEN_W * 0.78, 320);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMemberInfo {
  userId:    string;
  name:      string;
  username:  string | null;
  avatarUrl: string | null;
  /** Role coming from Stream channel state (fallback if workspaceMembers not provided) */
  role:      'owner' | 'editor' | 'viewer';
  isOnline:  boolean;
}

/** Real workspace role from Supabase, keyed by userId */
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
        style={[styles.avatarImg, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{initials}</Text>
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
  /** Override role from Supabase workspace data */
  workspaceRole?:  'owner' | 'editor' | 'viewer';
}

function MemberRow({ member, workspaceRole }: MemberRowProps) {
  // Part 50.1 FIX: prefer Supabase role over the Stream fallback
  const displayRole = workspaceRole ?? member.role;

  return (
    <View style={styles.memberRow}>
      <View style={styles.avatarWrap}>
        <MemberAvatar member={member} size={40} />
        {/* Online dot */}
        <View style={[
          styles.onlineDot,
          { backgroundColor: member.isOnline ? COLORS.success : COLORS.textMuted },
        ]} />
      </View>

      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name || member.username || 'Unknown'}
        </Text>
        {member.username && (
          <Text style={styles.memberUsername} numberOfLines={1}>
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
      <Text style={secStyles.title}>{title}</Text>
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
    color:        COLORS.textSecondary,
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
  /** Part 50.1: Real workspace roles from Supabase, keyed by userId */
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

  // ── Resolve each member's true role ───────────────────────────────────────
  const resolveRole = (m: ChatMemberInfo): 'owner' | 'editor' | 'viewer' => {
    if (workspaceMemberRoles && workspaceMemberRoles[m.userId]) {
      return workspaceMemberRoles[m.userId];
    }
    return m.role;
  };

  // ── Group and sort members ────────────────────────────────────────────────
  const { owners, editors, viewers } = useMemo(() => {
    const o: ChatMemberInfo[] = [];
    const e: ChatMemberInfo[] = [];
    const v: ChatMemberInfo[] = [];

    [...members]
      .sort((a, b) => {
        // Online first, then alphabetical
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

  // ── Build flat list data ──────────────────────────────────────────────────
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    // Owner is always exactly one person — no section header needed.
    // Their gold star RoleBadge already identifies them visually at the top.
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sidebar panel */}
      <Animated.View
        entering={SlideInRight.duration(280)}
        exiting={SlideOutRight.duration(220)}
        style={[
          styles.sidebar,
          {
            paddingTop:    insets.top + 8,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="people" size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Members</Text>
              <Text style={styles.headerSub}>{members.length} total</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.statText}>{onlineCount} Online</Text>
          </View>
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: COLORS.textMuted }]} />
            <Text style={styles.statText}>{offlineCount} Offline</Text>
          </View>

        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Member list — sectioned */}
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebar: {
    position:         'absolute',
    top:              0,
    right:            0,
    bottom:           0,
    width:            SIDEBAR_W,
    backgroundColor:  COLORS.backgroundCard,
    borderLeftWidth:  1,
    borderLeftColor:  COLORS.border,
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
    backgroundColor: `${COLORS.primary}18`,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     `${COLORS.primary}30`,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  headerSub: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
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
    backgroundColor:  COLORS.backgroundElevated,
    borderRadius:     RADIUS.full,
    borderWidth:      1,
    borderColor:      COLORS.border,
  },
  statDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  statText: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  divider: {
    height:           1,
    backgroundColor:  COLORS.border,
    marginHorizontal: SPACING.lg,
    marginBottom:     SPACING.sm,
  },
  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.lg,
  },

  // Member row
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
    borderColor:  COLORS.backgroundCard,
  },
  memberInfo: {
    flex:    1,
    minWidth: 0,
  },
  memberName: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  memberUsername: {
    color:    COLORS.textMuted,
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