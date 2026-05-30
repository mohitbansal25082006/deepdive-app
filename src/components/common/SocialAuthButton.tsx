// src/components/common/SocialAuthButton.tsx
// Part 43 — Reusable Google / GitHub OAuth button with press animation.
//
// Props:
//   provider  — 'google' | 'github'
//   onPress   — async callback (handles loading state internally)
//   loading   — external loading lock (disable while another action runs)
//   style     — optional ViewStyle override

import React, { useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Inline SVG-as-component for Google G logo (no external image needed)
function GoogleIcon({ size = 20 }: { size?: number }) {
  // We render using View-based colored blocks that approximate the G logo.
  // This avoids any image asset dependency.
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.85, fontWeight: '700', color: '#4285F4', lineHeight: size }}>
        G
      </Text>
    </View>
  );
}

function GitHubIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* GitHub Octocat approximated as a circle with a dot — real icon from text */}
      <Text style={{ fontSize: size * 0.9, fontWeight: '700', color, lineHeight: size }}>
        ⌥
      </Text>
    </View>
  );
}

interface SocialAuthButtonProps {
  provider:  'google' | 'github';
  onPress:   () => Promise<void>;
  loading?:  boolean;
  style?:    ViewStyle;
}

const PROVIDER_CONFIG = {
  google: {
    label:       'Continue with Google',
    bg:          '#FFFFFF',
    border:      'rgba(0,0,0,0.12)',
    textColor:   '#1F1F1F',
    loaderColor: '#4285F4',
    icon:        (size: number) => <GoogleIcon size={size} />,
  },
  github: {
    label:       'Continue with GitHub',
    bg:          '#24292E',
    border:      'rgba(255,255,255,0.08)',
    textColor:   '#FFFFFF',
    loaderColor: '#FFFFFF',
    icon:        (size: number) => <GitHubIcon size={size} color="#FFFFFF" />,
  },
} as const;

export function SocialAuthButton({ provider, onPress, loading = false, style }: SocialAuthButtonProps) {
  const [busy, setBusy] = useState(false);
  const scale           = useSharedValue(1);
  const config          = PROVIDER_CONFIG[provider];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn  = () => { scale.value = withSpring(0.96, { damping: 15, stiffness: 300 }); };
  const handlePressOut = () => { scale.value = withSpring(1,    { damping: 15, stiffness: 300 }); };

  const handlePress = async () => {
    if (busy || loading) return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = busy || loading;

  return (
    <AnimatedTouchable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      activeOpacity={1}
      style={[animatedStyle, style]}
    >
      <View
        style={{
          height:          54,
          borderRadius:    RADIUS.full,
          backgroundColor: config.bg,
          borderWidth:     1,
          borderColor:     config.border,
          flexDirection:   'row',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             12,
          opacity:         isDisabled ? 0.7 : 1,
          paddingHorizontal: SPACING.xl,
        }}
      >
        {busy
          ? <ActivityIndicator size="small" color={config.loaderColor} />
          : config.icon(20)
        }
        <Text
          style={{
            color:      config.textColor,
            fontSize:   FONTS.sizes.base,
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
        >
          {busy ? 'Connecting...' : config.label}
        </Text>
      </View>
    </AnimatedTouchable>
  );
}