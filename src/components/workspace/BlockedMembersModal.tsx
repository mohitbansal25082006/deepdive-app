// src/components/workspace/BlockedMembersModal.tsx
// Part 13B — Bottom-sheet modal that shows blocked members (owner only).
// Owner can unblock any member from this panel.

import React, { useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, SlideInDown, SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar }            from '../common/Avatar';
import { useBlockedMembers } from '../../hooks/useBlockedMembers';
import { BlockedMember }     from '../../types';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible:     boolean;
  workspaceId: string;
  onClose:     () => void;
}

export function BlockedMembersModal({ visible, workspaceId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { blocked, isLoading, isActioning, error, load, unblock } =
    useBlockedMembers(workspaceId);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleUnblock = (member: BlockedMember) => {
    const name = member.profile?.fullName ?? member.profile?.username ?? 'this user';
    Alert.alert(
      'Unblock Member',
      `Unblock ${name}? They will be able to rejoin this workspace using an invite code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Unblock',
          style: 'default',
          onPress: async () => {
            const { error: err } = await unblock(member.blockedUserId);
            if (err) Alert.alert('Error', err);
          },
        },
      ],
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

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
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFillObject}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.duration(300).springify().damping(15).stiffness(200).mass(1)}
        exiting={SlideOutDown.duration(200)}
        style={[
          styles.sheet,
          { maxHeight: SCREEN_H * 0.7, paddingBottom: Math.max(insets.bottom, 20) },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: `${COLORS.error}15` }]}>
            <Ionicons name="ban-outline" size={20} color={COLORS.error} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Blocked Members</Text>
            <Text style={styles.headerSub}>
              {blocked.length} blocked · Owner only
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={15} color={COLORS.info} />
          <Text style={styles.infoText}>
            Blocked users are removed from the workspace and cannot rejoin via invite code.
          </Text>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : blocked.length === 0 ? (
          <View style={styles.centered}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={36} color={COLORS.success} />
            </View>
            <Text style={styles.emptyTitle}>No blocked members</Text>
            <Text style={styles.emptyDesc}>
              You haven't blocked anyone from this workspace.
            </Text>
          </View>
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <BlockedRow
                member={item}
                isActioning={isActioning}
                onUnblock={() => handleUnblock(item)}
                formatDate={formatDate}
              />
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── BlockedRow ───────────────────────────────────────────────────────────────

function BlockedRow({
  member, isActioning, onUnblock, formatDate,
}: {
  member:      BlockedMember;
  isActioning: boolean;
  onUnblock:   () => void;
  formatDate:  (d: string) => string;
}) {
  const name = member.profile?.fullName ?? member.profile?.username ?? 'Unknown User';

  return (
    <View style={rowStyles.card}>
      <Avatar url={member.profile?.avatarUrl} name={name} size={44} />

      <View style={rowStyles.info}>
        <Text style={rowStyles.name} numberOfLines={1}>{name}</Text>
        {member.profile?.username && (
          <Text style={rowStyles.username}>@{member.profile.username}</Text>
        )}
        <View style={rowStyles.meta}>
          <Ionicons name="ban-outline" size={11} color={COLORS.error} />
          <Text style={rowStyles.metaText}>
            Blocked {formatDate(member.blockedAt)}
          </Text>
        </View>
        {member.reason && (
          <Text style={rowStyles.reason} numberOfLines={2}>
            Reason: {member.reason}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={onUnblock}
        disabled={isActioning}
        style={[rowStyles.unblockBtn, isActioning && { opacity: 0.5 }]}
        activeOpacity={0.8}
      >
        {isActioning ? (
          <ActivityIndicator size="small" color={COLORS.success} />
        ) : (
          <>
            <Ionicons name="checkmark-outline" size={14} color={COLORS.success} />
            <Text style={rowStyles.unblockBtnText}>Unblock</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    position:             'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    borderTopWidth:       1,
    borderColor:          COLORS.border,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -6 },
    shadowOpacity:        0.3,
    shadowRadius:         20,
    elevation:            24,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  headerIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  headerSub:   { color: COLORS.textMuted,   fontSize: FONTS.sizes.xs, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: `${COLORS.info}10`,
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg, padding: SPACING.sm,
    borderWidth: 1, borderColor: `${COLORS.info}25`,
  },
  infoText: { color: COLORS.info, fontSize: FONTS.sizes.xs, lineHeight: 17, flex: 1 },

  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: `${COLORS.success}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle:  { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  emptyDesc:   { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', paddingHorizontal: SPACING.xl },
  errorText:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  retryBtn:    { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 8 },
  retryBtnText:{ color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },

  list: { paddingHorizontal: SPACING.xl, paddingBottom: 16, gap: 8 },
});

const rowStyles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     `${COLORS.error}20`,
  },
  info:     { flex: 1, gap: 2, minWidth: 0 },
  name:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  username: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  reason:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 3, fontStyle: 'italic' },
  unblockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.success}15`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: `${COLORS.success}30`,
    flexShrink: 0,
  },
  unblockBtnText: { color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' },
});