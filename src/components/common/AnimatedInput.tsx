// src/components/common/AnimatedInput.tsx
// An input field with animated floating label and focus effects.
// The label slides up when you tap the input.

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

interface AnimatedInputProps extends TextInputProps {
  label: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  isPassword?: boolean;
}

export function AnimatedInput({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  isPassword = false,
  value,
  onFocus,
  onBlur,
  ...props
}: AnimatedInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Animation value: 0 = unfocused/empty, 1 = focused/has value
  const labelAnim = useSharedValue(value ? 1 : 0);
  const borderAnim = useSharedValue(0);

  // Animated label style — moves up and shrinks when focused
  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(labelAnim.value, [0, 1], [0, -26]),
      },
      {
        scale: interpolate(labelAnim.value, [0, 1], [1, 0.82]),
      },
    ],
    color: borderAnim.value === 1 ? COLORS.primary : COLORS.textMuted,
  }));

  // Animated border color
  const containerStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? COLORS.error
      : borderAnim.value === 1
      ? COLORS.borderFocus
      : COLORS.border,
    borderWidth: borderAnim.value === 1 ? 1.5 : 1,
  }));

  const handleFocus = (e: any) => {
    setIsFocused(true);
    labelAnim.value = withTiming(1, { duration: 200 });
    borderAnim.value = withTiming(1, { duration: 200 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (!value) {
      labelAnim.value = withTiming(0, { duration: 200 });
    }
    borderAnim.value = withTiming(0, { duration: 200 });
    onBlur?.(e);
  };

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <Animated.View
        style={[
          {
            backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.md,
            paddingHorizontal: SPACING.md,
            paddingTop: 22,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 64,
          },
          containerStyle,
        ]}
      >
        {/* Left icon */}
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={20}
            color={isFocused ? COLORS.primary : COLORS.textMuted}
            style={{ marginRight: 10 }}
          />
        )}

        {/* Input area with floating label */}
        <View style={{ flex: 1 }}>
          {/* The floating label */}
          <Animated.Text
            style={[
              {
                position: 'absolute',
                fontSize: FONTS.sizes.base,
                top: 0,
                left: 0,
                transformOrigin: 'left center',
              },
              labelStyle,
            ]}
          >
            {label}
          </Animated.Text>

          <TextInput
            {...props}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            secureTextEntry={isPassword && !showPassword}
            style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.base,
              paddingTop: 4,
            }}
            placeholderTextColor="transparent"
            selectionColor={COLORS.primary}
          />
        </View>

        {/* Right icon / password toggle */}
        {(isPassword || rightIcon) && (
          <TouchableOpacity
            onPress={isPassword ? () => setShowPassword(!showPassword) : onRightIconPress}
            style={{ padding: 4 }}
          >
            <Ionicons
              name={isPassword
                ? (showPassword ? 'eye-off-outline' : 'eye-outline')
                : rightIcon!
              }
              size={20}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Error message */}
      {error ? (
        <Text style={{
          color: COLORS.error,
          fontSize: FONTS.sizes.xs,
          marginTop: 4,
          marginLeft: SPACING.sm,
        }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}