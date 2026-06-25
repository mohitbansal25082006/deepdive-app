// src/components/workspace/PresenceBar.tsx
// Shows stacked avatars of users currently viewing the same report.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Avatar } from '../common/Avatar';
import { PresenceUser } from '../../types';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

interface Props {
  users:      PresenceUser[];
  maxVisible?: number;
  label?:     boolean;
}

export function PresenceBar({ users, maxVisible = 4, label = true }: Props) {
  if (users.length === 0) return null;

  const visible  = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;
  const AVATAR_SIZE = 28;
  const OVERLAP     = 10;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[
        styles.container,
        {
          backgroundColor: `${COLORS.success}12`,
          borderColor: `${COLORS.success}25`,
        },
      ]}
    >
      {/* Online dot */}
      <View style={[styles.dot, { backgroundColor: COLORS.success }]} />

      {/* Stacked avatars */}
      <View style={[styles.stack, { width: visible.length * (AVATAR_SIZE - OVERLAP) + OVERLAP + (overflow > 0 ? 28 : 0) }]}>
        {visible.map((u, i) => (
          <View
            key={u.userId}
            style={[
              styles.avatarWrap,
              {
                left: i * (AVATAR_SIZE - OVERLAP),
                zIndex: visible.length - i,
                borderWidth: 2,
                borderColor: COLORS.background,
                borderRadius: AVATAR_SIZE / 2,
                overflow: 'hidden',
              },
            ]}
          >
            <Avatar
              url={u.avatarUrl}
              name={u.fullName ?? u.username}
              size={AVATAR_SIZE}
            />
          </View>
        ))}
        {overflow > 0 && (
          <View
            style={[
              styles.overflow,
              {
                left: visible.length * (AVATAR_SIZE - OVERLAP),
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                backgroundColor: COLORS.backgroundElevated,
                borderColor: COLORS.background,
              },
            ]}
          >
            <Text style={[styles.overflowText, { color: COLORS.textSecondary }]}>
              +{overflow}
            </Text>
          </View>
        )}
      </View>

      {label && (
        <Text style={[styles.label, { color: COLORS.success }]}>
          {users.length === 1
            ? `${users[0].fullName ?? users[0].username ?? 'Someone'} is viewing`
            : `${users.length} people viewing`}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  stack: {
    position: 'relative',
    height: 28,
  },
  avatarWrap: {
    position: 'absolute',
    top: 0,
  },
  overflow: {
    position: 'absolute',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  overflowText: {
    fontSize: 9,
    fontWeight: '700',
  },
  label: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
});