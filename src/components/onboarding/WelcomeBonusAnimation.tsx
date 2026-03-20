// src/components/onboarding/WelcomeBonusAnimation.tsx
// Part 27 (Final) — Standalone full-screen welcome animation.
// Removed interest-topics mention since that step is gone.
// Improved: 2-wave particle burst, pulsing ripple rings, counter snap,
// staggered feature chips, floating glow orb.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Animated as RNAnimated, Easing, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import AnimatedRN, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import { GradientButton } from '../common/GradientButton';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const CENTER_X = SW / 2;
const ICON_Y   = SH * 0.28;   // vertical anchor for burst origin

// ─────────────────────────────────────────────────────────────────────────────
// Particles — two staggered waves, mixed shapes
// ─────────────────────────────────────────────────────────────────────────────

const COLORS_LIST = [
  '#6C63FF', '#FF6584', '#43E97B', '#FFA726',
  '#29B6F6', '#F06292', '#66BB6A', '#AB47BC',
  '#FF7043', '#4FC3F7', '#FFD54F', '#E040FB',
];

const SHAPES: Array<'circle' | 'square' | 'diamond'> = ['circle', 'square', 'diamond'];

interface ParticleConfig {
  x:       RNAnimated.Value;
  y:       RNAnimated.Value;
  scale:   RNAnimated.Value;
  opacity: RNAnimated.Value;
  rotate:  RNAnimated.Value;
  color:   string;
  shape:   'circle' | 'square' | 'diamond';
  size:    number;
}

function makeParticle(): ParticleConfig {
  return {
    x:       new RNAnimated.Value(CENTER_X),
    y:       new RNAnimated.Value(ICON_Y),
    scale:   new RNAnimated.Value(0),
    opacity: new RNAnimated.Value(0),
    rotate:  new RNAnimated.Value(0),
    color:   COLORS_LIST[Math.floor(Math.random() * COLORS_LIST.length)],
    shape:   SHAPES[Math.floor(Math.random() * SHAPES.length)],
    size:    6 + Math.floor(Math.random() * 7),
  };
}

function ParticleView({ p }: { p: ParticleConfig }) {
  const rotateStr = p.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const br = p.shape === 'circle' ? p.size / 2 : p.shape === 'square' ? 2 : 0;
  return (
    <RNAnimated.View style={{
      position: 'absolute',
      width:    p.size,
      height:   p.size,
      borderRadius: br,
      backgroundColor: p.color,
      opacity:  p.opacity,
      transform: [
        { translateX: RNAnimated.subtract(p.x, p.size / 2) },
        { translateY: RNAnimated.subtract(p.y, p.size / 2) },
        { scale:  p.scale },
        { rotate: rotateStr },
      ],
    }} />
  );
}

function Particles({ wave }: { wave: number }) {
  const pool = useRef(Array.from({ length: 36 }, makeParticle)).current;

  useEffect(() => {
    if (wave === 0) return;

    // Wave 1 fires immediately, wave 2 fires after 300ms
    const fireWave = (particles: ParticleConfig[], baseDelay: number) => {
      const anims = particles.map((p, i) => {
        const angle  = (i / particles.length) * Math.PI * 2 + Math.random() * 0.3;
        const radius = 90 + Math.random() * 140;
        const dur    = 650 + Math.random() * 200;
        p.x.setValue(CENTER_X + (Math.random() - 0.5) * 30);
        p.y.setValue(ICON_Y);
        p.scale.setValue(0);
        p.opacity.setValue(0);
        p.rotate.setValue(0);

        return RNAnimated.sequence([
          RNAnimated.delay(baseDelay + i * 12),
          RNAnimated.parallel([
            RNAnimated.timing(p.opacity, { toValue: 1,  duration: 80,  useNativeDriver: true }),
            RNAnimated.timing(p.x,       { toValue: CENTER_X + Math.cos(angle) * radius, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            RNAnimated.timing(p.y,       { toValue: ICON_Y   + Math.sin(angle) * radius * 0.7, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            RNAnimated.timing(p.rotate,  { toValue: Math.random() > 0.5 ? 1 : -1, duration: dur, useNativeDriver: true }),
            RNAnimated.sequence([
              RNAnimated.timing(p.scale, { toValue: 1, duration: 150, useNativeDriver: true }),
              RNAnimated.timing(p.scale, { toValue: 0, duration: dur - 150, delay: 80, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]),
            RNAnimated.sequence([
              RNAnimated.delay(dur * 0.55),
              RNAnimated.timing(p.opacity, { toValue: 0, duration: dur * 0.45, useNativeDriver: true }),
            ]),
          ]),
        ]);
      });
      RNAnimated.parallel(anims).start();
    };

    fireWave(pool.slice(0, 18), 0);
    fireWave(pool.slice(18, 36), 320);
  }, [wave]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      {pool.map((p, i) => <ParticleView key={i} p={p} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripple rings — three rings that expand outward and fade
// ─────────────────────────────────────────────────────────────────────────────

function RippleRings({ triggered }: { triggered: boolean }) {
  const rings = useRef([
    { scale: new RNAnimated.Value(0.4), opacity: new RNAnimated.Value(0) },
    { scale: new RNAnimated.Value(0.4), opacity: new RNAnimated.Value(0) },
    { scale: new RNAnimated.Value(0.4), opacity: new RNAnimated.Value(0) },
  ]).current;

  useEffect(() => {
    if (!triggered) return;
    rings.forEach((r, i) => {
      const loop = () => {
        r.scale.setValue(0.4);
        r.opacity.setValue(0.6);
        RNAnimated.parallel([
          RNAnimated.timing(r.scale,   { toValue: 2.4, duration: 1400, delay: i * 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          RNAnimated.timing(r.opacity, { toValue: 0,   duration: 1400, delay: i * 350, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        ]).start(() => loop());
      };
      loop();
    });
  }, [triggered]);

  return (
    <View style={{ position: 'absolute', top: ICON_Y - 70, left: CENTER_X - 70, width: 140, height: 140, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {rings.map((r, i) => (
        <RNAnimated.View key={i} style={{
          position: 'absolute',
          width: 140, height: 140, borderRadius: 70,
          borderWidth: 1.5,
          borderColor: COLORS.primary,
          opacity: r.opacity,
          transform: [{ scale: r.scale }],
        }} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated credit counter with snap bounce at the end
// ─────────────────────────────────────────────────────────────────────────────

function CreditCounter({ target = 20 }: { target?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const [snapped,   setSnapped]   = useState(false);
  const anim      = useRef(new RNAnimated.Value(0)).current;
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      RNAnimated.timing(anim, {
        toValue:  target,
        duration: 1100,
        easing:   Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        // Bounce the number when counter finishes
        RNAnimated.sequence([
          RNAnimated.timing(scaleAnim, { toValue: 1.18, duration: 120, useNativeDriver: true }),
          RNAnimated.timing(scaleAnim, { toValue: 0.94, duration: 80,  useNativeDriver: true }),
          RNAnimated.timing(scaleAnim, { toValue: 1.06, duration: 60,  useNativeDriver: true }),
          RNAnimated.timing(scaleAnim, { toValue: 1.00, duration: 60,  useNativeDriver: true }),
        ]).start(() => setSnapped(true));
      });
      const id = anim.addListener(({ value }) => setDisplayed(Math.round(value)));
      return () => anim.removeListener(id);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ alignItems: 'center', marginVertical: SPACING.lg }}>
      {/* Outer glow ring */}
      <View style={{
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: `${COLORS.primary}10`,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: `${COLORS.primary}25`,
      }}>
        {/* Mid ring */}
        <View style={{
          width: 128, height: 128, borderRadius: 64,
          backgroundColor: `${COLORS.primary}18`,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: `${COLORS.primary}35`,
        }}>
          {/* Icon circle */}
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={snapped ? 'checkmark-done' : 'flash'} size={38} color="#FFF" />
          </LinearGradient>
        </View>
      </View>

      {/* Counter */}
      <RNAnimated.View style={{ alignItems: 'center', marginTop: SPACING.lg, transform: [{ scale: scaleAnim }] }}>
        <Text style={{
          color:      COLORS.primary,
          fontSize:   80,
          fontWeight: '900',
          lineHeight: 80,
          letterSpacing: -3,
        }}>
          {displayed}
        </Text>
        <Text style={{
          color:         COLORS.textSecondary,
          fontSize:      FONTS.sizes.sm,
          fontWeight:    '700',
          marginTop:     6,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}>
          Free Credits
        </Text>
      </RNAnimated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature chips — what you can do with 20 credits
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'flash-outline',      label: 'Quick Research', cost: '5 cr',  color: COLORS.primary   },
  { icon: 'analytics-outline',  label: 'Deep Research',  cost: '10 cr', color: COLORS.info       },
  { icon: 'people-outline',     label: 'AI Debate',      cost: '15 cr', color: COLORS.accent     },
  { icon: 'easel-outline',      label: 'AI Slides',      cost: '10 cr', color: COLORS.warning    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onContinue: () => void;
  isLoading?: boolean;
}

export function WelcomeBonusAnimation({ onContinue, isLoading = false }: Props) {
  const [burstWave,   setBurstWave]   = useState(0);
  const [ripplesOn,   setRipplesOn]   = useState(false);

  useEffect(() => {
    // Stagger: ripples first, then burst
    const t1 = setTimeout(() => setRipplesOn(true), 200);
    const t2 = setTimeout(() => setBurstWave(1),     350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Particles wave={burstWave} />
      <RippleRings triggered={ripplesOn} />

      {/* Welcome badge */}
      <AnimatedRN.View entering={FadeIn.duration(500)} style={{ alignItems: 'center' }}>
        <View style={{
          backgroundColor: `${COLORS.success}18`,
          borderRadius:    RADIUS.full,
          paddingHorizontal: 18, paddingVertical: 7,
          borderWidth: 1, borderColor: `${COLORS.success}35`,
          flexDirection: 'row', alignItems: 'center', gap: 7,
          marginBottom: SPACING.sm,
        }}>
          <Ionicons name="gift-outline" size={14} color={COLORS.success} />
          <Text style={{
            color:      COLORS.success,
            fontSize:   FONTS.sizes.xs,
            fontWeight: '800',
            letterSpacing: 1,
          }}>
            WELCOME BONUS
          </Text>
        </View>
      </AnimatedRN.View>

      {/* Headline */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(80)} style={{ alignItems: 'center' }}>
        <Text style={{
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes['2xl'],
          fontWeight: '900',
          textAlign:  'center',
          lineHeight: 34,
          marginBottom: SPACING.sm,
        }}>
          You are all set! 🎉
        </Text>
        <Text style={{
          color:    COLORS.textSecondary,
          fontSize: FONTS.sizes.base,
          textAlign: 'center',
          lineHeight: 23,
          marginBottom: SPACING.md,
          paddingHorizontal: SPACING.xl,
        }}>
          We have added{' '}
          <Text style={{ color: COLORS.primary, fontWeight: '800' }}>20 free credits</Text>
          {' '}to your account — start researching straight away.
        </Text>
      </AnimatedRN.View>

      {/* Animated counter */}
      <AnimatedRN.View entering={ZoomIn.duration(500).delay(180)}>
        <CreditCounter target={20} />
      </AnimatedRN.View>

      {/* Feature chips */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(700)}>
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          borderWidth:     1,
          borderColor:     COLORS.border,
          marginBottom:    SPACING.lg,
        }}>
          <Text style={{
            color:         COLORS.textMuted,
            fontSize:      10,
            fontWeight:    '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom:  SPACING.sm,
            textAlign:     'center',
          }}>
            What you can do with 20 credits
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {FEATURES.map((f, i) => (
              <AnimatedRN.View key={f.label} entering={FadeInDown.duration(350).delay(750 + i * 60)}>
                <View style={{
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:                5,
                  backgroundColor:   `${f.color}10`,
                  borderRadius:      RADIUS.lg,
                  paddingHorizontal: 11,
                  paddingVertical:   7,
                  borderWidth:       1,
                  borderColor:       `${f.color}22`,
                }}>
                  <Ionicons name={f.icon as any} size={13} color={f.color} />
                  <Text style={{ color: f.color, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    {f.label}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, marginLeft: 1 }}>
                    · {f.cost}
                  </Text>
                </View>
              </AnimatedRN.View>
            ))}
          </View>
        </View>
      </AnimatedRN.View>

      {/* CTA */}
      <AnimatedRN.View entering={FadeInDown.duration(500).delay(950)}>
        <GradientButton
          title={isLoading ? 'Setting up your account…' : 'Start Researching  →'}
          onPress={onContinue}
          loading={isLoading}
        />
        <Text style={{
          color:    COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          textAlign: 'center',
          marginTop: SPACING.md,
        }}>
          Credits never expire · Buy more anytime in your profile
        </Text>
      </AnimatedRN.View>
    </View>
  );
}