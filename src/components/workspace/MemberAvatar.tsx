// src/components/workspace/MemberAvatar.tsx
// Tiny avatar with role badge used throughout workspace UI.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../common/Avatar';
import { MiniProfile, WorkspaceRole } from '../../types';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; color: string }> = {
  owner:  { label: 'Owner',  color: COLORS.pro },
  editor: { label: 'Editor', color: COLORS.primary },
  viewer: { label: 'Viewer', color: COLORS.textMuted },
};

interface Props {
  profile:    MiniProfile | undefined;
  role?:      WorkspaceRole;
  size?:      number;
  showLabel?: boolean;
  showRole?:  boolean;
}

export function MemberAvatar({
  profile,
  role,
  size      = 36,
  showLabel = false,
  showRole  = false,
}: Props) {
  const roleConf = role ? ROLE_CONFIG[role] : null;

  return (
    <View style={styles.wrap}>
      <View>
        <Avatar
          url={profile?.avatarUrl}
          name={profile?.fullName ?? profile?.username}
          size={size}
        />
        {role === 'owner' && (
          <View style={[styles.crown, { right: -2, bottom: -2 }]}>
            <Text style={{ fontSize: 9 }}>👑</Text>
          </View>
        )}
      </View>

      {showLabel && (
        <View style={styles.labelCol}>
          <Text style={styles.name} numberOfLines={1}>
            {profile?.fullName ?? profile?.username ?? 'Unknown'}
          </Text>
          {showRole && roleConf && (
            <View style={[styles.roleBadge, { backgroundColor: `${roleConf.color}20` }]}>
              <Text style={[styles.roleText, { color: roleConf.color }]}>
                {roleConf.label}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crown:    { position: 'absolute' },
  labelCol: { flex: 1 },
  name:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  roleBadge:{
    alignSelf: 'flex-start', borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 3,
  },
  roleText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
});