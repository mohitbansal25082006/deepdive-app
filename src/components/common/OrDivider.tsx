// src/components/common/OrDivider.tsx
// Part 43 — Horizontal divider with "or continue with" text.

import React from 'react';
import { View, Text } from 'react-native';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

interface OrDividerProps {
  text?: string;
}

export function OrDivider({ text = 'or continue with' }: OrDividerProps) {
  return (
    <View style={{
      flexDirection:  'row',
      alignItems:     'center',
      marginVertical: SPACING.lg,
      gap:            SPACING.md,
    }}>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   FONTS.sizes.xs,
        fontWeight: '500',
        letterSpacing: 0.5,
      }}>
        {text}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
    </View>
  );
}