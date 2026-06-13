// src/components/workspace/WorkspaceCard.tsx
// Part 13A — logo image support
// Part 50.9 — Full visual redesign: glowing logo ring, accent bar, role crown,
//             richer gradient, depth shadows, polished meta chips.

import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Workspace, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Role display helpers ─────────────────────────────────────────────────────

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner:  'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_COLOR: Record<WorkspaceRole, string> = {
  owner:  COLORS.pro,
  editor: COLORS.primary,
  viewer: COLORS.textSecondary,
};

const ROLE_ICON: Record<WorkspaceRole, keyof typeof Ionicons.glyphMap> = {
  owner:  'star',
  editor: 'create-outline',
  viewer: 'eye-outline',
};

// Per-card accent gradients keyed off the workspace name for subtle variety
const ACCENT_GRADIENTS: [string, string][] = [
  ['#6C63FF', '#8B5CF6'],
  ['#FF6584', '#FF8E53'],
  ['#43E97B', '#38F9D7'],
  ['#29B6F6', '#6C63FF'],
  ['#FFA726', '#FF6584'],
];

function accentFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENT_GRADIENTS[h % ACCENT_GRADIENTS.length];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workspace: Workspace;
  onPress:   () => void;
  index?:    number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceCard({ workspace, onPress, index = 0 }: Props) {
  const role     = workspace.userRole ?? 'viewer';
  const initials = workspace.name.slice(0, 2).toUpperCase();
  const [imgError, setImgError] = useState(false);

  const showImage = !!workspace.avatarUrl && !imgError;
  const accent    = accentFor(workspace.name);

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)} style={styles.outer}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.touch}>
        <LinearGradient
          colors={['#1C1C3D', '#15152E', '#101026']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Left accent bar */}
          <LinearGradient colors={accent} style={styles.accentBar} />

          {/* Avatar block with glow ring */}
          <View style={styles.avatarBlock}>
            <LinearGradient colors={accent} style={styles.avatarRing}>
              {showImage ? (
                <View style={styles.logoWrap}>
                  <Image
                    source={{ uri: workspace.avatarUrl! }}
                    style={styles.logoImage}
                    resizeMode="cover"
                    onError={() => setImgError(true)}
                  />
                </View>
              ) : (
                <View style={styles.avatarInner}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
            </LinearGradient>

            {/* Personal indicator dot */}
            {workspace.isPersonal && (
              <View style={styles.personalDot}>
                <Ionicons name="person" size={9} color="#FFF" />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{workspace.name}</Text>
              {role === 'owner' && (
                <Ionicons name="star" size={13} color={COLORS.pro} style={{ marginLeft: 5 }} />
              )}
            </View>

            {workspace.description ? (
              <Text style={styles.desc} numberOfLines={1}>{workspace.description}</Text>
            ) : (
              <Text style={styles.descMuted} numberOfLines={1}>
                {workspace.isPersonal ? 'Your personal workspace' : 'Team workspace'}
              </Text>
            )}

            <View style={styles.meta}>
              {/* Role badge */}
              <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLOR[role]}1F`, borderColor: `${ROLE_COLOR[role]}40` }]}>
                <Ionicons name={ROLE_ICON[role]} size={9} color={ROLE_COLOR[role]} />
                <Text style={[styles.roleText, { color: ROLE_COLOR[role] }]}>{ROLE_LABEL[role]}</Text>
              </View>

              {(workspace.memberCount ?? 0) > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="people" size={10} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{workspace.memberCount}</Text>
                </View>
              )}

              {(workspace.reportCount ?? 0) > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="document-text" size={10} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{workspace.reportCount}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Chevron */}
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outer: {
    marginBottom: SPACING.md,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius:  14,
    elevation:     6,
  },
  touch: {
    borderRadius: RADIUS.xl,
    overflow:     'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingVertical:   SPACING.md,
    paddingRight:      SPACING.md,
    paddingLeft:       SPACING.md + 6,
    borderRadius:  RADIUS.xl,
    borderWidth:   1,
    borderColor:   'rgba(108,99,255,0.18)',
    gap:           SPACING.md,
  },
  accentBar: {
    position: 'absolute',
    left: 0, top: 14, bottom: 14,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },

  // Avatar
  avatarBlock: { position: 'relative', flexShrink: 0 },
  avatarRing: {
    width: 56, height: 56, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    padding: 2,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  avatarInner: {
    flex: 1, width: '100%', borderRadius: 15,
    backgroundColor: '#13132C',
    alignItems: 'center', justifyContent: 'center',
  },
  logoWrap: {
    flex: 1, width: '100%', borderRadius: 15, overflow: 'hidden',
    backgroundColor: COLORS.backgroundElevated,
  },
  logoImage: { width: '100%', height: '100%', borderRadius: 15 },
  initials:  { color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '800', letterSpacing: 0.5 },
  personalDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.textMuted,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#15152E',
  },

  // Info
  info:    { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', flexShrink: 1 },
  desc:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
  descMuted: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
  meta: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap',
  },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1,
  },
  roleText: { fontSize: FONTS.sizes.xs, fontWeight: '800', letterSpacing: 0.2 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },

  // Chevron
  chevronWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});