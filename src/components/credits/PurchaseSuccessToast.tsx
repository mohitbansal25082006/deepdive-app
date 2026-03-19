// src/components/credits/PurchaseSuccessToast.tsx
// Part 24 — Animated success toast shown after credits are added.

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

interface PurchaseSuccessToastProps {
  creditsAdded: number;
  newBalance:   number;
  visible:      boolean;
  onHide:       () => void;
}

export function PurchaseSuccessToast({
  creditsAdded,
  newBalance,
  visible,
  onHide,
}: PurchaseSuccessToastProps) {
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      const t = setTimeout(onHide, 3500);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      exiting={FadeOutUp.duration(300)}
      style={[animStyle, {
        position:          'absolute',
        bottom:             100,
        left:               SPACING.xl,
        right:              SPACING.xl,
        zIndex:             9999,
      }]}
    >
      <View style={{
        backgroundColor: COLORS.success,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.lg,
        flexDirection:   'row',
        alignItems:      'center',
        gap:             SPACING.md,
        shadowColor:     COLORS.success,
        shadowOffset:    { width: 0, height: 8 },
        shadowOpacity:   0.35,
        shadowRadius:    16,
        elevation:       12,
      }}>
        <View style={{
          width:          46,
          height:         46,
          borderRadius:   14,
          backgroundColor: 'rgba(255,255,255,0.25)',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <Ionicons name="flash" size={24} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            color:      '#FFF',
            fontSize:   FONTS.sizes.base,
            fontWeight: '800',
          }}>
            +{creditsAdded} Credits Added! 🎉
          </Text>
          <Text style={{
            color:    'rgba(255,255,255,0.85)',
            fontSize: FONTS.sizes.sm,
            marginTop: 2,
          }}>
            New balance: {newBalance.toLocaleString()} credits
          </Text>
        </View>
        <Ionicons name="checkmark-circle" size={26} color="rgba(255,255,255,0.9)" />
      </View>
    </Animated.View>
  );
}