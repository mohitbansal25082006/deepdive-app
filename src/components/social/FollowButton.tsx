// src/components/social/FollowButton.tsx
// DeepDive AI — Part 36: Follow / Unfollow button with three states.
//
// States:
//  • Not following  → gradient purple "Follow" button
//  • Following      → grey outlined "Following" button (tap to unfollow)
//  • Loading        → spinner replaces icon

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { useFollow }      from '../../hooks/useFollow';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FollowButtonProps {
  targetUserId:         string;
  initialIsFollowing:   boolean;
  initialFollowerCount: number;
  /** Visual size variant. Defaults to 'md'. */
  size?:       'sm' | 'md' | 'lg';
  /** Called after a successful follow/unfollow with the new state. */
  onFollowChange?: (isNowFollowing: boolean) => void;
}

// ─── Size tokens ──────────────────────────────────────────────────────────────

const SIZE = {
  sm: { px: 12, py: 5,  fs: FONTS.sizes.xs,   icon: 12 },
  md: { px: 16, py: 8,  fs: FONTS.sizes.sm,   icon: 13 },
  lg: { px: 22, py: 11, fs: FONTS.sizes.base,  icon: 15 },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function FollowButton({
  targetUserId,
  initialIsFollowing,
  initialFollowerCount,
  size = 'md',
  onFollowChange,
}: FollowButtonProps) {
  const { isFollowing, isLoading, toggle } = useFollow({
    targetUserId,
    initialIsFollowing,
    initialFollowerCount,
  });

  const { px, py, fs, icon } = SIZE[size];

  const handlePress = async () => {
    const wasBefore = isFollowing;
    await toggle();
    onFollowChange?.(!wasBefore);
  };

  // ── Following state ────────────────────────────────────────────────────────
  if (isFollowing) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={isLoading}
        style={[
          styles.outlineBtn,
          { paddingHorizontal: px, paddingVertical: py, opacity: isLoading ? 0.5 : 1 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={COLORS.textMuted} />
        ) : (
          <Ionicons name="checkmark" size={icon} color={COLORS.textMuted} />
        )}
        <Text style={[styles.outlineText, { fontSize: fs }]}>Following</Text>
      </TouchableOpacity>
    );
  }

  // ── Not following state ────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      disabled={isLoading}
      style={{ opacity: isLoading ? 0.6 : 1 }}
    >
      <LinearGradient
        colors={COLORS.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.fillBtn,
          { paddingHorizontal: px, paddingVertical: py },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons name="person-add-outline" size={icon} color="#FFF" />
        )}
        <Text style={[styles.fillText, { fontSize: fs }]}>Follow</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outlineBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    borderRadius:   RADIUS.full,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:    1,
    borderColor:    COLORS.border,
  },
  outlineText: {
    color:      COLORS.textMuted,
    fontWeight: '600',
  },
  fillBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    borderRadius:  RADIUS.full,
  },
  fillText: {
    color:      '#FFF',
    fontWeight: '700',
  },
});