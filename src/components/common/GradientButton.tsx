// src/components/common/GradientButton.tsx
// A beautiful gradient button with press animation and loading state.
// Used throughout the app for primary actions.
//
// ── Part 55.1A — THEME SYSTEM + WORKLETS-SAFE ─────────────────────────────────
//   This button reads COLORS.gradient* and spreads ...SHADOWS.medium into the
//   inner LinearGradient style. Both COLORS and SHADOWS are MUTABLE singletons
//   that applyTheme() rewrites in place on a theme switch.
//
//   THE WORKLETS WARNING ("Tried to modify key `primary` of an object which has
//   been already passed to a worklet") happens when one of those mutable objects
//   gets captured by Reanimated's UI runtime (because the button is wrapped in an
//   Animated component) and is then mutated by applyTheme(). Reanimated copies the
//   object to the UI thread once and freezes the JS copy; mutating it afterwards
//   triggers the warning.
//
//   FIX (per Reanimated/Worklets docs): never hand the mutable singleton object to
//   the animated subtree. Instead, read the PRIMITIVE values fresh on each render
//   and build a brand-new plain style literal. Because the button re-renders when
//   the ThemeContext version bumps, these reads pick up the new palette, and the
//   animated wrapper only ever sees freshly-created literals — so there is nothing
//   stale for a worklet to "modify".
//
//   The animatedStyle here only animates `transform.scale` (a shared value) and
//   never references COLORS/SHADOWS, so it is already safe; the shadow/gradient
//   live on the non-animated inner LinearGradient.

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

// Part 55.1A: build a fresh, plain shadow literal from the live SHADOWS.medium
// PRIMITIVES. We copy numbers/strings out by value so the returned object never
// references the mutable SHADOWS singleton — this is what keeps Reanimated from
// capturing (and later warning about) the singleton when this button is animated.
function freshMediumShadow() {
  return {
    shadowColor:   SHADOWS.medium.shadowColor,
    shadowOffset:  { width: SHADOWS.medium.shadowOffset.width, height: SHADOWS.medium.shadowOffset.height },
    shadowOpacity: SHADOWS.medium.shadowOpacity,
    shadowRadius:  SHADOWS.medium.shadowRadius,
    elevation:     SHADOWS.medium.elevation,
  };
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

  // Animated style that changes scale based on the shared value.
  // NOTE: this only touches the shared value `scale` — it never reads COLORS or
  // SHADOWS, so the mutable singletons are never copied into the worklet.
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

  // Choose gradient colors based on variant. Read fresh each render → recolors on
  // theme change. We copy the tuple into a new array so the LinearGradient never
  // holds the mutable COLORS gradient tuple by reference.
  const gradientTuple = {
    primary:   COLORS.gradientPrimary,
    secondary: COLORS.gradientSecondary,
    success:   COLORS.gradientSuccess,
  }[variant];
  const gradientColors = disabled
    ? (['#2A2A4A', '#1A1A35'] as [string, string])
    : ([gradientTuple[0], gradientTuple[1]] as [string, string]);

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
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: heights[size],
          borderRadius: RADIUS.full,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          opacity: disabled ? 0.6 : 1,
          // Fresh literal built from live primitives — theme-aware + worklet-safe.
          ...freshMediumShadow(),
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