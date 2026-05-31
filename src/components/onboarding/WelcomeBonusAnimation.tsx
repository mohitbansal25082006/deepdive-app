// src/components/onboarding/WelcomeBonusAnimation.tsx
// Part 43 CRASH FIX — fixed Reanimated Easing worklet crash.
//
// ROOT CAUSE OF CRASH:
//   The previous version imported Easing from 'react-native' and used it
//   inside Reanimated's withTiming() calls. Reanimated runs withTiming on
//   the UI thread as a worklet. React Native's Easing functions are plain
//   JS — NOT worklet-compatible. When the animation fired (after a delay),
//   the worklet tried to call Easing.out(Easing.quad) on the UI thread,
//   crashed the UI thread, and killed the entire app.
//   The `as any` cast hid the TypeScript error but not the runtime crash.
//
// THE FIX:
//   Two separate Easing imports:
//     - RNEasing from 'react-native'      → used ONLY in RNAnimated.timing()
//     - Easing  from 'react-native-reanimated' → used in withTiming() worklets
//   Both are identical in API but the Reanimated one is worklet-compatible.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Animated as RNAnimated, Easing as RNEasing, Dimensions,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import AnimatedRN, {
  FadeInDown, FadeIn, ZoomIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
  Easing,   // ← Reanimated's worklet-safe Easing
} from 'react-native-reanimated';
import { GradientButton }  from '../common/GradientButton';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SW } = Dimensions.get('window');

// ─── Simple floating confetti dots ───────────────────────────────────────────

const DOT_COLORS = [
  COLORS.primary, '#FF6584', '#43E97B', '#FFA726',
  '#29B6F6', '#AB47BC', '#FF7043', '#FFD54F',
];

function ConfettiDot({ index }: { index: number }) {
  const ty    = useSharedValue(0);
  const op    = useSharedValue(0);
  const tx    = useSharedValue(0);
  const size  = 5 + (index % 5);
  const color = DOT_COLORS[index % DOT_COLORS.length];
  const startX = (index / 16) * SW - SW / 2 + (index % 3) * 20 - 20;

  useEffect(() => {
    const delay = index * 80;

    // Opacity: fade in and out repeatedly
    // Uses Reanimated Easing — worklet-safe
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.7, { duration: 600 }),
        withTiming(0,   { duration: 600 }),
      ),
      -1,
      false,
    ));

    // Float upward — no easing needed, linear is fine
    ty.value = withDelay(delay, withRepeat(
      withTiming(-80, { duration: 1200 + index * 60 }),
      -1,
      false,
    ));

    // Gentle side sway — Easing.inOut(Easing.sin) is worklet-safe from Reanimated
    tx.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(startX + 15, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(startX - 15, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity:   op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <AnimatedRN.View style={[{
      position:        'absolute',
      bottom:          0,
      left:            SW / 2 + startX,
      width:           size,
      height:          size,
      borderRadius:    size / 2,
      backgroundColor: color,
    }, style]} />
  );
}

// ─── Pulsing glow ─────────────────────────────────────────────────────────────

function PulseGlow() {
  const scale = useSharedValue(1);
  const op    = useSharedValue(0.08);

  useEffect(() => {
    // Easing.inOut(Easing.sin) from Reanimated — worklet-safe
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,  { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    op.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 1200 }),
        withTiming(0.05, { duration: 1200 }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   op.value,
  }));

  return (
    <AnimatedRN.View style={[{
      position:        'absolute',
      width:           200,
      height:          200,
      borderRadius:    100,
      backgroundColor: COLORS.primary,
    }, style]} />
  );
}

// ─── Credit counter ───────────────────────────────────────────────────────────
// Uses RNAnimated.timing with RNEasing — correct, runs on JS thread

function CreditCounter({ target = 20 }: { target?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const [done,      setDone]      = useState(false);

  // RNAnimated — uses RNEasing from 'react-native' (JS thread, correct)
  const anim  = useRef(new RNAnimated.Value(0)).current;
  const scale = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      const id = anim.addListener(({ value }) => setDisplayed(Math.round(value)));

      RNAnimated.timing(anim, {
        toValue:         target,
        duration:        1000,
        easing:          RNEasing.out(RNEasing.cubic), // RNEasing — JS thread, correct
        useNativeDriver: false,
      }).start(() => {
        anim.removeListener(id);
        setDone(true);

        // Bounce — RNAnimated, correct
        RNAnimated.sequence([
          RNAnimated.timing(scale, { toValue: 1.12, duration: 100, useNativeDriver: true }),
          RNAnimated.timing(scale, { toValue: 0.96, duration: 80,  useNativeDriver: true }),
          RNAnimated.timing(scale, { toValue: 1.04, duration: 60,  useNativeDriver: true }),
          RNAnimated.timing(scale, { toValue: 1.00, duration: 60,  useNativeDriver: true }),
        ]).start();
      });
    }, 400);

    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ alignItems: 'center', marginVertical: SPACING.xl }}>
      {/* Icon with glow */}
      <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }}>
        <PulseGlow />
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{
            width:          96,
            height:         96,
            borderRadius:   32,
            alignItems:     'center',
            justifyContent: 'center',
            shadowColor:    COLORS.primary,
            shadowOffset:   { width: 0, height: 8 },
            shadowOpacity:  0.35,
            shadowRadius:   20,
            elevation:      12,
          }}
        >
          <Ionicons
            name={done ? 'checkmark-done-outline' : 'flash-outline'}
            size={42}
            color="#FFF"
          />
        </LinearGradient>
      </View>

      {/* Animated number — RNAnimated */}
      <RNAnimated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
        <Text style={{
          color:         COLORS.primary,
          fontSize:      88,
          fontWeight:    '900',
          lineHeight:    88,
          letterSpacing: -4,
        }}>
          {displayed}
        </Text>
        <View style={{
          flexDirection:     'row',
          alignItems:        'center',
          gap:               6,
          marginTop:         8,
          backgroundColor:   `${COLORS.primary}15`,
          borderRadius:      RADIUS.full,
          paddingHorizontal: 14,
          paddingVertical:   5,
          borderWidth:       1,
          borderColor:       `${COLORS.primary}30`,
        }}>
          <Ionicons name="flash" size={12} color={COLORS.primary} />
          <Text style={{
            color:         COLORS.primary,
            fontSize:      FONTS.sizes.xs,
            fontWeight:    '700',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
            Free Credits
          </Text>
        </View>
      </RNAnimated.View>
    </View>
  );
}

// ─── Feature chips ────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'flash-outline',     label: 'Quick Research', cost: '5 cr',  color: COLORS.primary },
  { icon: 'analytics-outline', label: 'Deep Research',  cost: '10 cr', color: COLORS.info    },
  { icon: 'people-outline',    label: 'AI Debate',      cost: '15 cr', color: COLORS.accent  },
  { icon: 'easel-outline',     label: 'AI Slides',      cost: '10 cr', color: COLORS.warning },
];

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  onContinue: () => void;
  isLoading?: boolean;
}

export function WelcomeBonusAnimation({ onContinue, isLoading = false }: Props) {
  return (
    <View style={{ flex: 1 }}>
      {/* Floating confetti */}
      <View style={{
        position:      'absolute',
        bottom:        120,
        left:          0,
        right:         0,
        height:        100,
        overflow:      'hidden',
        pointerEvents: 'none' as any,
      }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <ConfettiDot key={i} index={i} />
        ))}
      </View>

      {/* Welcome badge */}
      <AnimatedRN.View entering={FadeIn.duration(500)} style={{ alignItems: 'center' }}>
        <View style={{
          backgroundColor:   `${COLORS.success}15`,
          borderRadius:      RADIUS.full,
          paddingHorizontal: 16,
          paddingVertical:   6,
          borderWidth:       1,
          borderColor:       `${COLORS.success}30`,
          flexDirection:     'row',
          alignItems:        'center',
          gap:               6,
          marginBottom:      SPACING.sm,
        }}>
          <Ionicons name="gift-outline" size={13} color={COLORS.success} />
          <Text style={{
            color:         COLORS.success,
            fontSize:      FONTS.sizes.xs,
            fontWeight:    '800',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}>
            Welcome Bonus
          </Text>
        </View>
      </AnimatedRN.View>

      {/* Headline */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(80)} style={{ alignItems: 'center' }}>
        <Text style={{
          color:         COLORS.textPrimary,
          fontSize:      FONTS.sizes['2xl'],
          fontWeight:    '900',
          textAlign:     'center',
          lineHeight:    36,
          letterSpacing: -0.5,
          marginBottom:  SPACING.xs,
        }}>
          You're all set! 🎉
        </Text>
        <Text style={{
          color:             COLORS.textSecondary,
          fontSize:          FONTS.sizes.base,
          textAlign:         'center',
          lineHeight:        24,
          paddingHorizontal: SPACING.xl,
        }}>
          We've added{' '}
          <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
            20 free credits
          </Text>
          {' '}to get you started.
        </Text>
      </AnimatedRN.View>

      {/* Counter */}
      <AnimatedRN.View entering={ZoomIn.duration(500).delay(180)}>
        <CreditCounter target={20} />
      </AnimatedRN.View>

      {/* Feature chips */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(600)}>
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          borderWidth:     1,
          borderColor:     COLORS.border,
          marginBottom:    SPACING.xl,
        }}>
          <Text style={{
            color:         COLORS.textMuted,
            fontSize:      10,
            fontWeight:    '700',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom:  SPACING.sm,
            textAlign:     'center',
          }}>
            What you can do with 20 credits
          </Text>
          <View style={{
            flexDirection:  'row',
            flexWrap:       'wrap',
            gap:            8,
            justifyContent: 'center',
          }}>
            {FEATURES.map((f, i) => (
              <AnimatedRN.View
                key={f.label}
                entering={FadeInDown.duration(300).delay(650 + i * 60)}
              >
                <View style={{
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:               5,
                  backgroundColor:   `${f.color}10`,
                  borderRadius:      RADIUS.lg,
                  paddingHorizontal: 10,
                  paddingVertical:   7,
                  borderWidth:       1,
                  borderColor:       `${f.color}20`,
                }}>
                  <Ionicons name={f.icon as any} size={12} color={f.color} />
                  <Text style={{
                    color:      f.color,
                    fontSize:   FONTS.sizes.xs,
                    fontWeight: '600',
                  }}>
                    {f.label}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                    · {f.cost}
                  </Text>
                </View>
              </AnimatedRN.View>
            ))}
          </View>
        </View>
      </AnimatedRN.View>

      {/* CTA */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(900)}>
        <GradientButton
          title={isLoading ? 'Setting up your account…' : 'Start Researching →'}
          onPress={onContinue}
          loading={isLoading}
        />
        <Text style={{
          color:     COLORS.textMuted,
          fontSize:  FONTS.sizes.xs,
          textAlign: 'center',
          marginTop: SPACING.md,
        }}>
          Credits never expire · Buy more anytime in your profile
        </Text>
      </AnimatedRN.View>
    </View>
  );
}