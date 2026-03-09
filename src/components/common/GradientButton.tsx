// src/components/common/GradientButton.tsx
// A beautiful gradient button with press animation and loading state.
// Used throughout the app for primary actions.

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, FONTS, RADIUS, SHADOWS } from '../../constants/theme';

// Make TouchableOpacity work with Reanimated
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface GradientButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success';
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
}

export function GradientButton({
  onPress,
  title,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  size = 'lg',
}: GradientButtonProps) {
  // Shared value for the press animation (scale)
  const scale = useSharedValue(1);

  // Animated style that changes scale based on the shared value
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    // withSpring creates a spring-physics animation
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  // Choose gradient colors based on variant
  const gradientColors = {
    primary: COLORS.gradientPrimary,
    secondary: COLORS.gradientSecondary,
    success: COLORS.gradientSuccess,
  }[variant];

  // Choose height based on size
  const heights = { sm: 44, md: 52, lg: 58 };
  const fontSizes = { sm: FONTS.sizes.sm, md: FONTS.sizes.base, lg: FONTS.sizes.md };

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={1}
      style={[animatedStyle, style]}
    >
      <LinearGradient
        colors={disabled ? ['#2A2A4A', '#1A1A35'] : gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: heights[size],
          borderRadius: RADIUS.full,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          opacity: disabled ? 0.6 : 1,
          ...SHADOWS.medium,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text
            style={[
              {
                color: '#FFFFFF',
                fontSize: fontSizes[size],
                fontWeight: '700',
                letterSpacing: 0.5,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
        )}
      </LinearGradient>
    </AnimatedTouchable>
  );
}