// app/(auth)/onboarding.tsx
// Part 43 — COMPLETE REDESIGN: "Deep Space Command Center" aesthetic.
//
// Features:
//   • 5 slides covering all major app features (Research, Podcast/Debate,
//     Workspaces, Knowledge Base, AI Formats)
//   • Animated floating gradient orbs background (3 orbs, per-slide color theme)
//   • 3D-layered icon orbs with glow rings + inner shimmer
//   • Spring-physics dot indicators that morph width on slide change
//   • Staggered spring entrance for title, subtitle, description, chips per slide
//   • Particle burst on every slide transition (8 particles, Reanimated)
//   • Feature chip strip on each slide showing sub-features
//   • Frosted-glass bottom action area
//   • No new packages — pure Reanimated + LinearGradient + Ionicons

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Dimensions,
  ScrollView, Platform,
} from 'react-native';
import { router }            from 'expo-router';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withSpring, withTiming, withDelay, withSequence,
  withRepeat, interpolate, Easing,
  cancelAnimation, FadeIn, FadeInDown, FadeInUp,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const { width: W, height: H } = Dimensions.get('window');

// ─── Slide data ────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id:          '1',
    title:       'AI Research Engine',
    subtitle:    'Your Personal Research Agent',
    description: 'Ask anything. A team of specialized AI agents searches, analyses, fact-checks, and streams your full report live as it writes.',
    icon:        'telescope-outline',
    gradient:    ['#6C63FF', '#8B5CF6'] as [string, string],
    orbColors:   ['rgba(108,99,255,0.22)', 'rgba(139,92,246,0.14)', 'rgba(67,233,123,0.08)'] as string[],
    chips:       ['Multi-agent AI', 'Live streaming', 'Fact-checked', '3 depths'],
    badge:       'RESEARCH',
  },
  {
    id:          '2',
    title:       'Podcast & Debate',
    subtitle:    'Bring Your Research to Life',
    description: 'Convert any report into a real AI podcast with voices, or launch a 6-agent live debate with a neutral moderator verdict.',
    icon:        'radio-outline',
    gradient:    ['#FF6584', '#F093FB'] as [string, string],
    orbColors:   ['rgba(255,101,132,0.20)', 'rgba(240,147,251,0.14)', 'rgba(255,142,83,0.10)'] as string[],
    chips:       ['Real TTS voices', '6 AI agents', 'Moderator AI', 'PDF export'],
    badge:       'AUDIO',
  },
  {
    id:          '3',
    title:       'Knowledge Base',
    subtitle:    'Your AI Second Brain',
    description: 'Ask questions across ALL your research reports simultaneously using semantic AI — get answers with source attribution and confidence scores.',
    icon:        'library-outline',
    gradient:    ['#4FACFE', '#00F2FE'] as [string, string],
    orbColors:   ['rgba(79,172,254,0.20)', 'rgba(0,242,254,0.12)', 'rgba(108,99,255,0.10)'] as string[],
    chips:       ['Cross-report AI', 'Semantic search', 'Source chips', 'Chat history'],
    badge:       'KNOWLEDGE',
  },
  {
    id:          '4',
    title:       'Team Workspaces',
    subtitle:    'Collaborate in Real-Time',
    description: 'Share reports, slides, podcasts, and papers into shared workspaces. Live presence, threaded comments, reactions, and team chat.',
    icon:        'people-outline',
    gradient:    ['#43E97B', '#38F9D7'] as [string, string],
    orbColors:   ['rgba(67,233,123,0.18)', 'rgba(56,249,215,0.12)', 'rgba(79,172,254,0.08)'] as string[],
    chips:       ['Live presence', 'Threaded chat', 'Roles & perms', 'Shared library'],
    badge:       'TEAMS',
  },
  {
    id:          '5',
    title:       'AI Content Studio',
    subtitle:    'Every Format, One Tap',
    description: 'Generate academic papers, slide decks, voice debates, and video podcasts from any research — all with export, share, and offline access.',
    icon:        'sparkles-outline',
    gradient:    ['#FFA726', '#FBBF24'] as [string, string],
    orbColors:   ['rgba(255,167,38,0.20)', 'rgba(251,191,36,0.12)', 'rgba(255,101,132,0.08)'] as string[],
    chips:       ['Academic PDF', 'AI Slides', 'PPTX export', 'Offline cache'],
    badge:       'CREATE',
  },
] as const;

type Slide = typeof SLIDES[number];

// ─── Floating Orb ─────────────────────────────────────────────────────────────

function FloatingOrb({
  size, color, x, y, driftX, driftY, duration, delay,
}: {
  size: number; color: string; x: number; y: number;
  driftX: number; driftY: number; duration: number; delay: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 1000 }));
    tx.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(driftX,  { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftX, { duration, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
    ty.value = withDelay(delay + duration * 0.4, withRepeat(
      withSequence(
        withTiming(driftY,  { duration: duration * 1.3, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftY, { duration: duration * 1.3, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
    return () => { cancelAnimation(tx); cancelAnimation(ty); };
  }, [color]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View style={[{
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      pointerEvents: 'none' as any,
    }, style]} />
  );
}

// ─── Particle burst ────────────────────────────────────────────────────────────

function Particle({ angle, color, trigger }: { angle: number; color: string; trigger: number }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    const rad  = (angle * Math.PI) / 180;
    const dist = 60 + Math.random() * 40;
    tx.value = 0; ty.value = 0; op.value = 0; sc.value = 0;
    op.value = withSequence(withTiming(1, { duration: 120 }), withDelay(200, withTiming(0, { duration: 300 })));
    sc.value = withSequence(withSpring(1.2, { damping: 8 }), withTiming(0.4, { duration: 400 }));
    tx.value = withTiming(Math.cos(rad) * dist, { duration: 520, easing: Easing.out(Easing.quad) });
    ty.value = withTiming(Math.sin(rad) * dist, { duration: 520, easing: Easing.out(Easing.quad) });
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
    opacity:   op.value,
  }));

  return (
    <Animated.View style={[{
      position:        'absolute',
      width:           6,
      height:          6,
      borderRadius:    3,
      backgroundColor: color,
    }, style]} />
  );
}

function ParticleBurst({ trigger, color }: { trigger: number; color: string }) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' as any }}>
      {angles.map((a, i) => (
        <Particle key={i} angle={a} color={color} trigger={trigger} />
      ))}
    </View>
  );
}

// ─── 3D Icon Orb ──────────────────────────────────────────────────────────────

function IconOrb({ slide, enterAnim }: { slide: Slide; enterAnim: SharedValue<number> }) {
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(enterAnim.value, [0, 1], [0.5, 1]) }],
    opacity:   interpolate(enterAnim.value, [0, 0.5, 1], [0, 0.8, 1]),
  }));

  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, scaleStyle]}>
      {/* Outer glow ring */}
      <View style={{
        position:        'absolute',
        width:           190,
        height:          190,
        borderRadius:    95,
        backgroundColor: `${slide.gradient[0]}12`,
        borderWidth:     1,
        borderColor:     `${slide.gradient[0]}25`,
      }} />
      {/* Mid ring */}
      <View style={{
        position:        'absolute',
        width:           160,
        height:          160,
        borderRadius:    80,
        backgroundColor: `${slide.gradient[0]}15`,
        borderWidth:     1,
        borderColor:     `${slide.gradient[0]}35`,
      }} />

      {/* Main orb */}
      <LinearGradient
        colors={slide.gradient}
        style={{
          width:          130,
          height:         130,
          borderRadius:   40,
          alignItems:     'center',
          justifyContent: 'center',
          shadowColor:    slide.gradient[0],
          shadowOpacity:  0.55,
          shadowRadius:   30,
          shadowOffset:   { width: 0, height: 12 },
          elevation:      20,
        }}
      >
        {/* Inner shimmer top-left */}
        <LinearGradient
          colors={['rgba(255,255,255,0.30)', 'transparent']}
          style={{
            position:            'absolute',
            top:                 0, left: 0, right: 0, bottom: 0,
            borderRadius:        40,
          }}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <Ionicons name={slide.icon as any} size={58} color="#FFF" />
      </LinearGradient>

      {/* Badge pill */}
      <View style={{
        position:          'absolute',
        bottom:            -2,
        right:             -8,
        backgroundColor:   slide.gradient[0],
        borderRadius:      RADIUS.full,
        paddingHorizontal: 10,
        paddingVertical:   4,
        borderWidth:       2,
        borderColor:       COLORS.background,
      }}>
        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }}>
          {slide.badge}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Slide Content ─────────────────────────────────────────────────────────────

function SlideContent({
  slide, enterAnim,
}: {
  slide: Slide;
  enterAnim: SharedValue<number>;
}) {
  const titleStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0, 0.5, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [24, 0]) }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.1, 0.7, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [20, 0]) }],
  }));
  const descStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.2, 0.8, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [16, 0]) }],
  }));
  const chipsStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.35, 1], [0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [12, 0]) }],
  }));

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl }}>
      {/* Subtitle badge */}
      <Animated.View style={subStyle}>
        <View style={{
          backgroundColor:   `${slide.gradient[0]}18`,
          borderRadius:      RADIUS.full,
          paddingHorizontal: 14,
          paddingVertical:   5,
          borderWidth:       1,
          borderColor:       `${slide.gradient[0]}40`,
          marginBottom:      SPACING.sm,
        }}>
          <Text style={{ color: slide.gradient[0], fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.5 }}>
            {slide.subtitle}
          </Text>
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.Text style={[{
        color:         COLORS.textPrimary,
        fontSize:      FONTS.sizes['3xl'],
        fontWeight:    '900',
        textAlign:     'center',
        marginBottom:  SPACING.md,
        letterSpacing: -0.8,
        lineHeight:    38,
      }, titleStyle]}>
        {slide.title}
      </Animated.Text>

      {/* Description */}
      <Animated.Text style={[{
        color:      COLORS.textSecondary,
        fontSize:   FONTS.sizes.base,
        textAlign:  'center',
        lineHeight: 25,
        marginBottom: SPACING.lg,
      }, descStyle]}>
        {slide.description}
      </Animated.Text>

      {/* Feature chips */}
      <Animated.View style={[{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }, chipsStyle]}>
        {slide.chips.map((chip, i) => (
          <View
            key={chip}
            style={{
              backgroundColor:   `${slide.gradient[0]}15`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 12,
              paddingVertical:   6,
              borderWidth:       1,
              borderColor:       `${slide.gradient[0]}35`,
              flexDirection:     'row',
              alignItems:        'center',
              gap:               5,
            }}
          >
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: slide.gradient[0] }} />
            <Text style={{ color: slide.gradient[0], fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {chip}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Dot Indicator ─────────────────────────────────────────────────────────────

function Dots({
  total, current, gradientColor,
}: { total: number; current: number; gradientColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        return (
          <Animated.View
            key={i}
            style={{
              width:           isActive ? 28 : 7,
              height:          7,
              borderRadius:    4,
              backgroundColor: isActive ? gradientColor : `${COLORS.textMuted}40`,
              overflow:        'hidden',
            }}
          >
            {isActive && (
              <LinearGradient
                colors={[gradientColor, `${gradientColor}80`]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [particleTrigger, setParticleTrigger] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const enterAnim = useSharedValue(0);

  const currentSlide = SLIDES[currentIndex];

  // Animate entrance when slide changes
  const animateIn = useCallback(() => {
    enterAnim.value = 0;
    enterAnim.value = withSpring(1, { damping: 16, stiffness: 80, mass: 0.9 });
  }, []);

  useEffect(() => {
    animateIn();
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      // Trigger particle burst
      setParticleTrigger(prev => prev + 1);
      const next = currentIndex + 1;
      setCurrentIndex(next);
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
    } else {
      router.push('/(auth)/signin');
    }
  }, [currentIndex]);

  const handleSkip = useCallback(() => {
    router.push('/(auth)/signin');
  }, []);

  const handleScroll = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    if (idx !== currentIndex && idx >= 0 && idx < SLIDES.length) {
      setCurrentIndex(idx);
    }
  }, [currentIndex]);

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Animated orb background (updates color per slide) ────────────── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' as any }}>
        <FloatingOrb size={280} color={currentSlide.orbColors[0]} x={-20}   y={80}   driftX={25} driftY={18} duration={7000} delay={0}   />
        <FloatingOrb size={220} color={currentSlide.orbColors[1]} x={W+20}  y={240}  driftX={-20} driftY={30} duration={9500} delay={600} />
        <FloatingOrb size={160} color={currentSlide.orbColors[2]} x={W*0.5} y={H*0.6} driftX={18} driftY={-22} duration={11000} delay={300} />
      </View>

      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(600)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            justifyContent:    'space-between',
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.sm,
            paddingBottom:     SPACING.md,
          }}
        >
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{
                width: 36, height: 36, borderRadius: 11,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#6C63FF', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
              }}
            >
              <Ionicons name="analytics" size={19} color="#FFF" />
            </LinearGradient>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', letterSpacing: -0.3 }}>
              DeepDive AI
            </Text>
          </View>

          {/* Skip */}
          {!isLast && (
            <TouchableOpacity
              onPress={handleSkip}
              style={{
                paddingHorizontal: 14,
                paddingVertical:   7,
                borderRadius:      RADIUS.full,
                backgroundColor:   `${COLORS.textMuted}15`,
                borderWidth:       1,
                borderColor:       `${COLORS.textMuted}25`,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Skip</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── Slide progress bar ──────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={{
                flex:            1,
                height:          2.5,
                borderRadius:    2,
                backgroundColor: i <= currentIndex ? s.gradient[0] : `${COLORS.textMuted}25`,
                overflow:        'hidden',
              }}
            >
              {i === currentIndex && (
                <LinearGradient
                  colors={s.gradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          ))}
        </View>

        {/* ── Icon area ───────────────────────────────────────────────────── */}
        <View style={{ alignItems: 'center', justifyContent: 'center', height: H * 0.30, position: 'relative' }}>
          <IconOrb slide={currentSlide} enterAnim={enterAnim} />
          <ParticleBurst trigger={particleTrigger} color={currentSlide.gradient[0]} />
        </View>

        {/* ── Scrollable slides content ──────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {SLIDES.map((slide, i) => (
            <View key={slide.id} style={{ width: W, alignItems: 'center', justifyContent: 'center' }}>
              {i === currentIndex
                ? <SlideContent slide={slide} enterAnim={enterAnim} />
                : (
                  <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl, opacity: 0.5 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'], fontWeight: '900', textAlign: 'center', letterSpacing: -0.8 }}>
                      {slide.title}
                    </Text>
                  </View>
                )
              }
            </View>
          ))}
        </ScrollView>

        {/* ── Bottom action area ──────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInUp.duration(700).delay(200)}
          style={{
            paddingHorizontal: SPACING.xl,
            paddingBottom:     Platform.OS === 'ios' ? 28 : SPACING.xl,
            paddingTop:        SPACING.md,
          }}
        >
          {/* Dot indicators */}
          <View style={{ marginBottom: SPACING.lg }}>
            <Dots total={SLIDES.length} current={currentIndex} gradientColor={currentSlide.gradient[0]} />
          </View>

          {/* Primary CTA */}
          <TouchableOpacity onPress={handleNext} activeOpacity={0.86}>
            <LinearGradient
              colors={currentSlide.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                borderRadius:   RADIUS.xl,
                paddingVertical: 17,
                flexDirection:  'row',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            10,
                shadowColor:    currentSlide.gradient[0],
                shadowOpacity:  0.5,
                shadowRadius:   18,
                shadowOffset:   { width: 0, height: 6 },
                elevation:      14,
                overflow:       'hidden',
              }}
            >
              {/* Inner shimmer */}
              <LinearGradient
                colors={['rgba(255,255,255,0.20)', 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderRadius: RADIUS.xl }}
                start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
              />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '800', letterSpacing: 0.2 }}>
                {isLast ? 'Get Started' : 'Continue'}
              </Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={isLast ? 'rocket-outline' : 'arrow-forward'} size={15} color="#FFF" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Sign-in link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.md, gap: 5 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              Already have an account?
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signin')} activeOpacity={0.75}>
              <Text style={{ color: currentSlide.gradient[0], fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}