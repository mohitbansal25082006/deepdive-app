// src/components/workspace/MemberRoleModal.tsx
// Bottom sheet for changing a member's role (owner-only action).
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
//             No dark-only assumptions.

import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInUp, SlideOutDown, Easing } from 'react-native-reanimated';
import { WorkspaceMember, WorkspaceRole } from '../../types';
import { MemberAvatar } from './MemberAvatar';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';

const ROLE_OPTIONS: { role: Exclude<WorkspaceRole,'owner'>; label: string; desc: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'editor', label: 'Editor', desc: 'Can add reports and leave comments', color: COLORS.primary, icon: 'create-outline' },
  { role: 'viewer', label: 'Viewer', desc: 'Can read reports and view comments', color: COLORS.textMuted, icon: 'eye-outline' },
];

interface Props {
  member:     WorkspaceMember | null;
  visible:    boolean;
  isUpdating: boolean;
  onClose:    () => void;
  onChangeRole: (userId: string, role: Exclude<WorkspaceRole,'owner'>) => void;
  onRemove:   (userId: string) => void;
}

export function MemberRoleModal({
  member, visible, isUpdating, onClose, onChangeRole, onRemove,
}: Props) {
  if (!member) return null;

  const handleRemove = () => {
    onClose();
    setTimeout(() => onRemove(member.userId), 300);
  };

  const backdropColor = getModalBackdrop(0.7);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.backdrop, { backgroundColor: backdropColor }]}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <Animated.View
          entering={SlideInUp.duration(340).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.quad))}
          style={[
            styles.sheet,
            {
              backgroundColor: COLORS.backgroundCard,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: COLORS.border }]} />

          {/* Member info */}
          <View style={[styles.memberRow, { backgroundColor: COLORS.backgroundElevated }]}>
            <MemberAvatar
              profile={member.profile}
              role={member.role}
              size={44}
              showLabel
              showRole
            />
          </View>

          <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>Change Role</Text>

          {ROLE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.role}
              onPress={() => { onChangeRole(member.userId, opt.role); onClose(); }}
              disabled={isUpdating || member.role === opt.role}
              style={[
                styles.optionRow,
                { borderColor: COLORS.border },
                member.role === opt.role && {
                  borderColor: `${COLORS.primary}50`,
                  backgroundColor: `${COLORS.primary}08`,
                },
              ]}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIcon, { backgroundColor: `${opt.color}20` }]}>
                <Ionicons name={opt.icon} size={18} color={opt.color} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionLabel, { color: COLORS.textPrimary }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.optionDesc, { color: COLORS.textMuted }]}>
                  {opt.desc}
                </Text>
              </View>
              {member.role === opt.role && (
                <Ionicons name="checkmark-circle" size={20} color={opt.color} />
              )}
            </TouchableOpacity>
          ))}

          {/* Danger zone */}
          <View style={[styles.divider, { backgroundColor: COLORS.border }]} />
          <TouchableOpacity
            onPress={handleRemove}
            disabled={isUpdating}
            style={[
              styles.removeBtn,
              {
                backgroundColor: `${COLORS.error}10`,
                borderColor: `${COLORS.error}30`,
              },
            ]}
            activeOpacity={0.8}
          >
            <Ionicons name="person-remove-outline" size={16} color={COLORS.error} />
            <Text style={[styles.removeText, { color: COLORS.error }]}>Remove from workspace</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingTop: SPACING.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  memberRow: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  removeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
});