// src/components/credits/PurchaseSuccessToast.tsx
// Part 24 — Animated success toast shown after credits are added.
// Part 57 — Rewrite:
//   • FULLY THEME-INTEGRATED: reads COLORS live and subscribes to useTheme() so
//     it recolors with the active theme (Sunset light, etc.). The success accent,
//     gradient, text-on-accent contrast, and shadow all follow the theme.
//   • DISMISS WORKS INSTANTLY: a real ✕ button (and tapping the toast) runs a
//     quick fade/slide-out, THEN calls onHide — no waiting for the 3.5s timer,
//     and the timer is cleared so it can't fire after a manual close.
//   • SMOOTH, NO BOUNCE: uses withTiming (ease) for enter/exit instead of
//     withSpring, so it glides in/out with zero bounce. We drive the animation
//     ourselves (no FadeInDown/FadeOutUp) so the exit always completes before
//     unmount, even on a manual tap.

import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';

interface PurchaseSuccessToastProps {
  creditsAdded: number;
  newBalance:   number;
  visible:      boolean;
  onHide:       () => void;
  /** Auto-dismiss delay in ms (default 3500). Set 0 to disable auto-dismiss. */
  duration?:    number;
}

// Helper: readable text/icon color on top of the success accent.
function onAccentColor(hex: string): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#10241B' : '#FFFFFF';
}

export function PurchaseSuccessToast({
  creditsAdded,
  newBalance,
  visible,
  onHide,
  duration = 3500,
}: PurchaseSuccessToastProps) {
  // Re-render on theme change so COLORS reads are fresh.
  useTheme();

  // Animation drivers (0 = hidden, 1 = shown). withTiming = smooth, no bounce.
  const progress = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Animate OUT, then call onHide once the animation has finished.
  const dismiss = useCallback(() => {
    if (closingRef.current) return;       // guard against double-fire
    closingRef.current = true;
    clearTimer();
    progress.value = withTiming(
      0,
      { duration: 240, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onHide)();
      },
    );
  }, [clearTimer, onHide, progress]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      // Animate IN smoothly (ease-out, no spring → no bounce).
      progress.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      // Schedule auto-dismiss.
      if (duration > 0) {
        clearTimer();
        timerRef.current = setTimeout(dismiss, duration);
      }
    }
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, duration]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      // Slide up from 24px below to its resting spot — linear with opacity, no overshoot.
      { translateY: (1 - progress.value) * 24 },
    ],
  }));

  if (!visible) return null;

  const success     = COLORS.success;
  const successGrad = (COLORS.gradientSuccess as readonly [string, string]) ?? [success, success];
  const onAccent    = onAccentColor(success);
  const onAccentDim = onAccent === '#FFFFFF' ? 'rgba(255,255,255,0.85)' : 'rgba(16,36,27,0.72)';
  const chipBg      = onAccent === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[animStyle, {
        position: 'absolute',
        bottom:   100,
        left:     SPACING.xl,
        right:    SPACING.xl,
        zIndex:   9999,
      }]}
    >
      <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss notification">
        <LinearGradient
          colors={successGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius:  RADIUS.xl,
            padding:       SPACING.lg,
            flexDirection: 'row',
            alignItems:    'center',
            gap:           SPACING.md,
            shadowColor:   success,
            shadowOffset:  { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius:  16,
            elevation:     12,
          }}
        >
          {/* Leading icon */}
          <View style={{
            width:           46,
            height:          46,
            borderRadius:    14,
            backgroundColor: chipBg,
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <Ionicons name="flash" size={24} color={onAccent} />
          </View>

          {/* Text */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: onAccent, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              +{creditsAdded} Credits Added! 🎉
            </Text>
            <Text style={{ color: onAccentDim, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
              New balance: {newBalance.toLocaleString()} credits
            </Text>
          </View>

          {/* Real, tappable close button — hitSlop makes it easy to hit. */}
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width:           30,
              height:          30,
              borderRadius:    15,
              backgroundColor: chipBg,
              alignItems:      'center',
              justifyContent:  'center',
            }}
          >
            <Ionicons name="close" size={18} color={onAccent} />
          </Pressable>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}