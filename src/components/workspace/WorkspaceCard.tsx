// src/components/workspace/WorkspaceCard.tsx
// Card shown in the workspace list (WorkspaceTab).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Workspace, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner:  'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_COLOR: Record<WorkspaceRole, string> = {
  owner:  COLORS.pro,
  editor: COLORS.primary,
  viewer: COLORS.textMuted,
};

interface Props {
  workspace: Workspace;
  onPress:   () => void;
  index?:    number;
}

export function WorkspaceCard({ workspace, onPress, index = 0 }: Props) {
  const role      = workspace.userRole ?? 'viewer';
  const initials  = workspace.name.slice(0, 2).toUpperCase();

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <LinearGradient
          colors={['#1A1A35', '#12122A']}
          style={styles.gradient}
        >
          {/* Avatar / initials */}
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={styles.avatarBox}
          >
            {workspace.avatarUrl ? (
              <Ionicons name="business" size={22} color="#FFF" />
            ) : (
              <Text style={styles.initials}>{initials}</Text>
            )}
          </LinearGradient>

          {/* Info */}
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{workspace.name}</Text>
              {workspace.isPersonal && (
                <Ionicons name="person" size={13} color={COLORS.textMuted} style={{ marginLeft: 5 }} />
              )}
            </View>
            {workspace.description ? (
              <Text style={styles.desc} numberOfLines={1}>{workspace.description}</Text>
            ) : null}
            <View style={styles.meta}>
              <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLOR[role]}20` }]}>
                <Text style={[styles.roleText, { color: ROLE_COLOR[role] }]}>
                  {ROLE_LABEL[role]}
                </Text>
              </View>
              {(workspace.memberCount ?? 0) > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="people-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{workspace.memberCount}</Text>
                </View>
              )}
              {(workspace.reportCount ?? 0) > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="document-text-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{workspace.reportCount}</Text>
                </View>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  gradient: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.md,
  },
  avatarBox: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  initials: { color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '800' },
  info:     { flex: 1, gap: 3 },
  nameRow:  { flexDirection: 'row', alignItems: 'center' },
  name:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', flex: 1 },
  desc:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  roleBadge:{ borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
});