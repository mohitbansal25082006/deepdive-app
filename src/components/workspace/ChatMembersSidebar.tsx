// src/components/workspace/ChatMembersSidebar.tsx
// Part 50 — Members sidebar panel for workspace chat
// Opens as a right-side overlay showing all workspace members,
// their online status, and roles. Slide-in from right.

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
  role:      'owner' | 'editor' | 'viewer';
  isOnline:  boolean;
}

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

const ROLE_COLORS: Record<string, string> = {
  owner:  '#FFD700',
  editor: COLORS.primary,
  viewer: COLORS.textMuted,
};

const ROLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  owner:  'star',
  editor: 'create-outline',
  viewer: 'eye-outline',
};

function RoleBadge({ role }: { role: ChatMemberInfo['role'] }) {
  return (
    <View style={[styles.roleBadge, { borderColor: `${ROLE_COLORS[role]}40`, backgroundColor: `${ROLE_COLORS[role]}18` }]}>
      <Ionicons name={ROLE_ICONS[role]} size={10} color={ROLE_COLORS[role]} />
      <Text style={[styles.roleText, { color: ROLE_COLORS[role] }]}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: ChatMemberInfo }) {
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
        <RoleBadge role={member.role} />
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  members:     ChatMemberInfo[];
  onlineCount: number;
  onClose:     () => void;
}

export function ChatMembersSidebar({ visible, members, onlineCount, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      // Online first, then by role weight, then name
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      const roleWeight = { owner: 0, editor: 1, viewer: 2 };
      const rw = roleWeight[a.role] - roleWeight[b.role];
      if (rw !== 0) return rw;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [members]);

  const offlineCount = members.length - onlineCount;

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

        {/* Member list */}
        <FlatList
          data={sorted}
          keyExtractor={m => m.userId}
          renderItem={({ item }) => <MemberRow member={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    gap:              8,
    paddingHorizontal: SPACING.lg,
    paddingBottom:    SPACING.sm,
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
  separator: {
    height:           1,
    backgroundColor:  `${COLORS.border}60`,
    marginHorizontal: SPACING.sm,
  },

  // Member row
  memberRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    gap:            10,
    borderRadius:   RADIUS.lg,
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
    position:    'absolute',
    bottom:      0,
    right:       0,
    width:       11,
    height:      11,
    borderRadius: 6,
    borderWidth:  2,
    borderColor: COLORS.backgroundCard,
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
    alignItems:  'flex-end',
    gap:         4,
    flexShrink:  0,
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
    fontSize:   9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize:   9,
    fontWeight: '600',
  },
});