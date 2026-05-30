// src/components/common/AuthBackground.tsx
// Part 43 — Shared animated gradient orb background for all auth screens.
// 3 floating orbs with slow drift animation. No new packages required.

import React, { useEffect } from 'react';
import { View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
  cancelAnimation, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

interface OrbProps {
  size:     number;
  color:    string;
  x:        number;
  y:        number;
  driftX:   number;
  driftY:   number;
  duration: number;
  delay:    number;
}

function Orb({ size, color, x, y, driftX, driftY, duration, delay }: OrbProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 1200 }));
    tx.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(driftX,  { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftX, { duration, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
    ty.value = withDelay(delay + duration * 0.3, withRepeat(
      withSequence(
        withTiming(driftY,  { duration: duration * 1.4, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftY, { duration: duration * 1.4, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(op);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity:   op.value,
  }));

  return (
    <Animated.View
      style={[{
        position:     'absolute',
        left:         x - size / 2,
        top:          y - size / 2,
        width:        size,
        height:       size,
        borderRadius: size / 2,
        backgroundColor: color,
      }, style]}
      pointerEvents="none"
    />
  );
}

interface AuthBackgroundProps {
  /** Override orb colors. Defaults to purple theme. */
  orbColors?: [string, string, string];
}

export function AuthBackground({
  orbColors = [
    'rgba(108,99,255,0.20)',
    'rgba(139,92,246,0.13)',
    'rgba(255,101,132,0.08)',
  ],
}: AuthBackgroundProps) {
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {/* Top-left large orb */}
      <Orb
        size={320} color={orbColors[0]}
        x={-40} y={100}
        driftX={30} driftY={20}
        duration={8000} delay={0}
      />
      {/* Right mid orb */}
      <Orb
        size={240} color={orbColors[1]}
        x={W + 30} y={H * 0.45}
        driftX={-25} driftY={35}
        duration={10500} delay={500}
      />
      {/* Bottom-center small orb */}
      <Orb
        size={180} color={orbColors[2]}
        x={W * 0.55} y={H * 0.78}
        driftX={20} driftY={-25}
        duration={12000} delay={300}
      />

      {/* Subtle top gradient fade */}
      <LinearGradient
        colors={['rgba(10,10,26,0.0)', 'rgba(10,10,26,0.0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80 }}
      />
    </View>
  );
}