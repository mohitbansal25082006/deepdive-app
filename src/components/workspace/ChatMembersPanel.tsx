// src/components/workspace/ChatMembersPanel.tsx
// Part 17 — Slide-in panel listing all chat members (editors + owners).
// Part 47 — Improved online/offline display:
//            • Prominent "Online Now" section at top of list
//            • Online dot is larger and more visible
//            • Online count pill updated in real-time via usePresence
//            • Offline members shown in a separate dimmed section
//            • Total count + online breakdown shown in header

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../common/Avatar';
import { ChatMember } from '../../types/chat';
import { PresenceUser } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  visible:       boolean;
  members:       ChatMember[];
  onlineUsers:   PresenceUser[];
  onClose:       () => void;
  workspaceName: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner:  COLORS.pro ?? '#F59E0B',
  editor: COLORS.primary,
};

export function ChatMembersPanel({
  visible,
  members,
  onlineUsers,
  onClose,
  workspaceName,
}: Props) {
  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map(u => u.userId)),
    [onlineUsers],
  );

  const onlineMembers  = useMemo(
    () => [...members].filter(m => onlineUserIds.has(m.userId))
                      .sort((a, b) => {
                        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
                        return (a.fullName ?? a.username ?? '').localeCompare(b.fullName ?? b.username ?? '');
                      }),
    [members, onlineUserIds],
  );

  const offlineMembers = useMemo(
    () => [...members].filter(m => !onlineUserIds.has(m.userId))
                      .sort((a, b) => {
                        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
                        return (a.fullName ?? a.username ?? '').localeCompare(b.fullName ?? b.username ?? '');
                      }),
    [members, onlineUserIds],
  );

  const onlineCount = onlineMembers.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <Animated.View
          entering={SlideInRight.duration(280).springify()}
          exiting={SlideOutRight.duration(220)}
          style={styles.panel}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Members</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{workspaceName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Stats strip ─────────────────────────────────────────────── */}
          <View style={styles.statsStrip}>
            {/* Total */}
            <View style={styles.statChip}>
              <Ionicons name="people-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.statValue}>{members.length}</Text>
              <Text style={styles.statLabel}>total</Text>
            </View>
            {/* Online */}
            <View style={[styles.statChip, styles.statChipOnline]}>
              <View style={styles.onlineDotLg} />
              <Text style={[styles.statValue, { color: COLORS.success }]}>{onlineCount}</Text>
              <Text style={[styles.statLabel, { color: `${COLORS.success}99` }]}>online</Text>
            </View>
            {/* Offline */}
            <View style={styles.statChip}>
              <View style={styles.offlineDotLg} />
              <Text style={styles.statValue}>{offlineMembers.length}</Text>
              <Text style={styles.statLabel}>offline</Text>
            </View>
          </View>

          {/* ── Member list ─────────────────────────────────────────────── */}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Online section */}
            {onlineMembers.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>Online — {onlineCount}</Text>
                </View>
                {onlineMembers.map((member, i) => (
                  <Animated.View
                    key={member.userId}
                    entering={FadeIn.duration(200).delay(i * 25)}
                  >
                    <MemberRow member={member} isOnline />
                  </Animated.View>
                ))}
              </>
            )}

            {/* Offline section */}
            {offlineMembers.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { marginTop: onlineMembers.length > 0 ? SPACING.md : 0 }]}>
                  <View style={styles.sectionDotOffline} />
                  <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
                    Offline — {offlineMembers.length}
                  </Text>
                </View>
                {offlineMembers.map((member, i) => (
                  <Animated.View
                    key={member.userId}
                    entering={FadeIn.duration(200).delay(i * 20)}
                  >
                    <MemberRow member={member} isOnline={false} />
                  </Animated.View>
                ))}
              </>
            )}

            {members.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No chat members yet</Text>
              </View>
            )}
          </ScrollView>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={11} color={COLORS.textMuted} />
            <Text style={styles.footerText}>
              Only owners and editors can access team chat
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, isOnline }: { member: ChatMember; isOnline: boolean }) {
  const roleColor   = ROLE_COLORS[member.role] ?? COLORS.textMuted;
  const displayName = member.fullName ?? member.username ?? 'Unknown';

  return (
    <View style={[styles.memberRow, !isOnline && styles.memberRowOffline]}>
      {/* Avatar + presence indicator */}
      <View style={styles.avatarWrap}>
        <Avatar url={member.avatarUrl} name={displayName} size={38} />
        {/* Online/offline dot */}
        <View style={[styles.presenceBadge, isOnline ? styles.presenceBadgeOnline : styles.presenceBadgeOffline]}>
          <View style={[styles.presenceDot, isOnline ? styles.presenceDotOnline : styles.presenceDotOffline]} />
        </View>
      </View>

      {/* Info */}
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, !isOnline && styles.memberNameOffline]} numberOfLines={1}>
          {displayName}
        </Text>
        {member.username && member.fullName && (
          <Text style={styles.memberUsername} numberOfLines={1}>@{member.username}</Text>
        )}
        <Text style={styles.statusText}>{isOnline ? '● Active now' : 'Offline'}</Text>
      </View>

      {/* Role badge */}
      <View style={[styles.roleBadge, { backgroundColor: `${roleColor}18`, borderColor: `${roleColor}35` }]}>
        {member.role === 'owner' && <Text style={{ fontSize: 9, marginRight: 2 }}>👑</Text>}
        <Text style={[styles.roleText, { color: roleColor }]}>
          {member.role === 'owner' ? 'Owner' : 'Editor'}
        </Text>
      </View>
    </View>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    flexDirection:   'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: { flex: 1 },
  panel: {
    width:           300,
    backgroundColor: COLORS.backgroundCard,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    shadowColor:     '#000',
    shadowOffset:    { width: -6, height: 0 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       20,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingTop:       SPACING.xl * 1.4,
    paddingHorizontal: SPACING.lg,
    paddingBottom:    SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
  },
  headerSub: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    marginTop: 2,
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

  // ── Stats strip ─────────────────────────────────────────────────────────
  statsStrip: {
    flexDirection:    'row',
    paddingHorizontal: SPACING.md,
    paddingVertical:  SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap:              8,
  },
  statChip: {
    flex:             1,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    backgroundColor:  COLORS.backgroundElevated,
    borderRadius:     RADIUS.md,
    paddingHorizontal: 8,
    paddingVertical:  6,
    borderWidth:      1,
    borderColor:      COLORS.border,
  },
  statChipOnline: {
    backgroundColor: `${COLORS.success}12`,
    borderColor:     `${COLORS.success}30`,
  },
  statValue: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '800',
  },
  statLabel: {
    color:    COLORS.textMuted,
    fontSize: 9,
    flex:     1,
  },
  onlineDotLg: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: COLORS.success,
    flexShrink:      0,
  },
  offlineDotLg: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: COLORS.textMuted,
    flexShrink:      0,
  },

  // ── Section headers ──────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: SPACING.md,
    paddingVertical:  8,
    paddingTop:       SPACING.sm,
  },
  sectionDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: COLORS.success,
  },
  sectionDotOffline: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: COLORS.textMuted,
  },
  sectionLabel: {
    color:      COLORS.success,
    fontSize:   10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Member rows ──────────────────────────────────────────────────────────
  list: { flex: 1 },
  memberRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:  10,
    gap:              10,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.border}50`,
  },
  memberRowOffline: {
    opacity: 0.65,
  },
  avatarWrap: {
    position:  'relative',
    flexShrink: 0,
  },
  presenceBadge: {
    position:        'absolute',
    bottom:          -1,
    right:           -1,
    width:           13,
    height:          13,
    borderRadius:    7,
    borderWidth:     2,
    borderColor:     COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
  },
  presenceBadgeOnline:  { backgroundColor: COLORS.success },
  presenceBadgeOffline: { backgroundColor: COLORS.textMuted },
  presenceDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },
  presenceDotOnline:  { backgroundColor: '#FFF' },
  presenceDotOffline: { backgroundColor: '#FFF' },

  memberInfo: { flex: 1, minWidth: 0 },
  memberName: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  memberNameOffline: { color: COLORS.textSecondary },
  memberUsername: {
    color:     COLORS.textMuted,
    fontSize:  10,
    marginTop: 1,
  },
  statusText: {
    color:     COLORS.success,
    fontSize:  9,
    fontWeight: '600',
    marginTop: 2,
  },
  roleBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical:  3,
    borderWidth:      1,
    flexShrink:       0,
  },
  roleText: { fontSize: 10, fontWeight: '700' },

  // ── Footer + empty ───────────────────────────────────────────────────────
  footer: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    padding:          SPACING.md,
    borderTopWidth:   1,
    borderTopColor:   COLORS.border,
    backgroundColor:  COLORS.backgroundElevated,
  },
  footerText: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    lineHeight: 15,
    flex:       1,
  },
  empty: {
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
    gap:            12,
  },
  emptyText: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.sm,
  },
});