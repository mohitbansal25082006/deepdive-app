// src/components/credits/CreditBalance.tsx
// Part 24 — Compact credit balance pill shown in screen headers.
// Tapping it navigates to the credits store.

import React from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';
import { LOW_BALANCE_THRESHOLD } from '../../constants/credits';

interface CreditBalanceProps {
  balance:   number;
  isLoading?: boolean;
  onPress?:  () => void;
  size?:     'sm' | 'md';
}

export function CreditBalance({
  balance,
  isLoading = false,
  onPress,
  size = 'md',
}: CreditBalanceProps) {
  const isLow     = balance < LOW_BALANCE_THRESHOLD;
  const isEmpty   = balance === 0;
  const accentColor = isEmpty  ? COLORS.error   :
                      isLow    ? COLORS.warning  :
                      COLORS.primary;

  const handlePress = () => {
    if (onPress) { onPress(); return; }
    router.push('/(app)/credits-store' as any);
  };

  const iconSize  = size === 'sm' ? 11 : 13;
  const textSize  = size === 'sm' ? 11 : FONTS.sizes.xs;
  const padH      = size === 'sm' ? 8  : 10;
  const padV      = size === 'sm' ? 3  : 5;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        style={{
          flexDirection:     'row',
          alignItems:        'center',
          gap:               4,
          backgroundColor:   `${accentColor}15`,
          borderRadius:      RADIUS.full,
          paddingHorizontal: padH,
          paddingVertical:   padV,
          borderWidth:       1,
          borderColor:       `${accentColor}30`,
        }}
      >
        <Ionicons name="flash" size={iconSize} color={accentColor} />
        {isLoading ? (
          <ActivityIndicator size="small" color={accentColor} style={{ width: 20 }} />
        ) : (
          <Text style={{
            color:      accentColor,
            fontSize:   textSize,
            fontWeight: '700',
          }}>
            {balance.toLocaleString()}
          </Text>
        )}
        {isEmpty && (
          <Ionicons name="add-circle" size={iconSize} color={accentColor} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}