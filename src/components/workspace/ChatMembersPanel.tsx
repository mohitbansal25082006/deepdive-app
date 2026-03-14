// src/components/workspace/ChatMembersPanel.tsx
// Part 17 — Slide-in panel listing all chat members (editors + owners).
// Shows online presence dot, role badge, joined date.

import React from 'react';
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
  const onlineUserIds = new Set(onlineUsers.map(u => u.userId));
  const onlineCount   = members.filter(m => onlineUserIds.has(m.userId)).length;

  const sorted = [...members].sort((a, b) => {
    // Owner first, then editors, online first within each group
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
    const aOnline = onlineUserIds.has(a.userId);
    const bOnline = onlineUserIds.has(b.userId);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return (a.fullName ?? a.username ?? '').localeCompare(b.fullName ?? b.username ?? '');
  });

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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Chat Members</Text>
              <Text style={styles.headerSub}>{workspaceName}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.onlinePill}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlinePillText}>{onlineCount} online</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Member count */}
          <View style={styles.countRow}>
            <Ionicons name="chatbubbles-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.countText}>
              {members.length} {members.length === 1 ? 'member' : 'members'} can chat
            </Text>
          </View>

          {/* List */}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {sorted.map((member, i) => {
              const isOnline = onlineUserIds.has(member.userId);
              const roleColor = ROLE_COLORS[member.role] ?? COLORS.textMuted;
              return (
                <Animated.View
                  key={member.userId}
                  entering={FadeIn.duration(250).delay(i * 30)}
                  style={styles.memberRow}
                >
                  {/* Avatar + online indicator */}
                  <View style={styles.avatarWrap}>
                    <Avatar
                      url={member.avatarUrl}
                      name={member.fullName ?? member.username}
                      size={40}
                    />
                    {isOnline && <View style={styles.presenceDot} />}
                  </View>

                  {/* Info */}
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.fullName ?? member.username ?? 'Unknown'}
                    </Text>
                    {member.username && member.fullName && (
                      <Text style={styles.memberUsername} numberOfLines={1}>
                        @{member.username}
                      </Text>
                    )}
                    <Text style={styles.joinedText} numberOfLines={1}>
                      Joined {formatDate(member.joinedAt)}
                    </Text>
                  </View>

                  {/* Role badge */}
                  <View style={[styles.roleBadge, { backgroundColor: `${roleColor}18`, borderColor: `${roleColor}35` }]}>
                    {member.role === 'owner' && (
                      <Text style={{ fontSize: 10, marginRight: 2 }}>👑</Text>
                    )}
                    <Text style={[styles.roleText, { color: roleColor }]}>
                      {member.role === 'owner' ? 'Owner' : 'Editor'}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>

          {/* Info footer */}
          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.footerText}>
              Only owners and editors can access team chat
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    width: 300,
    backgroundColor: COLORS.backgroundCard,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: SPACING.xl * 1.5,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
  },
  headerSub: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${COLORS.success}15`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  onlinePillText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
  },

  list: { flex: 1 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.border}60`,
  },
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  presenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.backgroundCard,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  memberUsername: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  joinedText: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.backgroundElevated,
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    lineHeight: 16,
    flex: 1,
  },
});