// src/components/workspace/PresenceBar.tsx
// Shows stacked avatars of users currently viewing the same report.

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
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      {/* Online dot */}
      <View style={styles.dot} />

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
              },
            ]}
          >
            <Text style={styles.overflowText}>+{overflow}</Text>
          </View>
        )}
      </View>

      {label && (
        <Text style={styles.label}>
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
    backgroundColor: `${COLORS.success}12`,
    borderRadius: RADIUS.full, 
    paddingHorizontal: 10, 
    paddingVertical: 5,
    borderWidth: 1, 
    borderColor: `${COLORS.success}25`,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7, 
    height: 7, 
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  stack: { 
    position: 'relative', 
    height: 28 
  },
  avatarWrap: { 
    position: 'absolute', 
    top: 0,
    // Border and overflow moved to inline style in the component
  },
  overflow:  {
    position: 'absolute', 
    borderRadius: 14,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2, 
    borderColor: COLORS.background,
  },
  overflowText: { 
    color: COLORS.textSecondary, 
    fontSize: 9, 
    fontWeight: '700' 
  },
  label: { 
    color: COLORS.success, 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '600' 
  },
});