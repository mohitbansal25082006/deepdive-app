// app/(auth)/onboarding.tsx
// ─────────────────────────────────────────────────────────────────────────────
// DeepDive AI — Onboarding  (Part 43 complete redesign + Part 55 theme)
// Aesthetic: "Signal Intelligence" — precise, dark, data-forward
//
// Architecture
//   • 5 slides covering every major feature surface from Parts 1–55
//   • Background: SVG-based cross-hatch grid (single View, zero perf cost)
//     + per-slide radial accent bloom — NO floating orbs/circles
//   • Icon zone: layered ring system + pulsing breathing ring + square core
//   • Content zone: staggered spring entrances (subtitle → title → desc → chips)
//   • Particles: 8-directional burst on every slide transition
//   • Bottom bar: dot-pill indicators + gradient CTA + sign-in link
//   • Full COLORS/FONTS/SPACING/RADIUS theme integration (Part 55)
//   • DeepDive AI logo from assets/icon.png
//   • No new npm packages — Reanimated + LinearGradient + Ionicons only
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
  Image,
  StyleSheet,
} from 'react-native';
import { router }         from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  interpolate,
  Easing,
  cancelAnimation,
  FadeIn,
  FadeInUp,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';
import {
  COLORS,
  FONTS,
  SPACING,
  RADIUS,
} from '../../src/constants/theme';

const { width: W, height: H } = Dimensions.get('window');

// ─── Slide definitions ────────────────────────────────────────────────────────
const SLIDES = [
  {
    id:         '1',
    eyebrow:    'Step 1 of 5',
    title:      'Autonomous\nResearch Engine',
    subtitle:   'Ask anything — AI does the rest',
    description:
      'A team of 5 specialized AI agents plans, searches, fact-checks, and writes a full structured report — streaming section-by-section as it writes. Up to 100+ verified sources per query.',
    icon:       'telescope-outline'   as const,
    accent:     '#6C63FF',
    accent2:    '#8B5CF6',
    chips:      ['Live streaming', 'Fact-checked', '3 research depths', '100+ sources'],
    badge:      'RESEARCH',
    stat:       '5 AI agents',
    statIcon:   'people-circle-outline' as const,
  },
  {
    id:         '2',
    eyebrow:    'Step 2 of 5',
    title:      'Podcasts, Debates\n& Voice Studio',
    subtitle:   'Bring your research to life',
    description:
      'Convert any report into a real AI podcast with distinct host voices, or launch a 6-agent live debate with a neutral moderator verdict. Play back your podcast in a rich video player experience.',
    icon:       'radio-outline'       as const,
    accent:     '#FF6584',
    accent2:    '#F093FB',
    chips:      ['6 voice styles', '6-agent debates', 'Video player', 'MP3 export'],
    badge:      'AUDIO',
    stat:       '40+ min episodes',
    statIcon:   'time-outline'        as const,
  },
  {
    id:         '3',
    eyebrow:    'Step 3 of 5',
    title:      'Knowledge Base\n& AI Assistant',
    subtitle:   'Your AI second brain',
    description:
      'Ask questions across ALL your research reports simultaneously using pgvector semantic search. Every answer shows which reports it came from, with confidence scores and source attribution.',
    icon:       'library-outline'     as const,
    accent:     '#4FACFE',
    accent2:    '#00F2FE',
    chips:      ['Cross-report RAG', 'Semantic search', 'Voice input', 'Chat history'],
    badge:      'KNOWLEDGE',
    stat:       'Unlimited reports',
    statIcon:   'infinite-outline'    as const,
  },
  {
    id:         '4',
    eyebrow:    'Step 4 of 5',
    title:      'Team Workspaces\n& Social Feed',
    subtitle:   'Research together, share publicly',
    description:
      'Real-time team workspaces with Stream Chat, live presence, threaded comments, and shared libraries. Publish reports to a public social feed — follow researchers, get followers.',
    icon:       'people-outline'      as const,
    accent:     '#43E97B',
    accent2:    '#38F9D7',
    chips:      ['Stream Chat', 'Live presence', 'Public profiles', 'Social feed'],
    badge:      'TEAMS',
    stat:       'Real-time sync',
    statIcon:   'flash-outline'       as const,
  },
  {
    id:         '5',
    eyebrow:    'Step 5 of 5',
    title:      'AI Content Studio\n& Credits',
    subtitle:   'Every format, fully offline',
    description:
      'Academic papers, AI slide decks, PPTX exports, voice debates, and podcasts — all from one report. Start with 20 free credits on sign-up. Everything caches for offline access.',
    icon:       'sparkles-outline'    as const,
    accent:     '#FFA726',
    accent2:    '#FBBF24',
    chips:      ['20 free credits', 'Academic PDF', 'AI Slides', 'Offline cache'],
    badge:      'CREATE',
    stat:       '20 free credits',
    statIcon:   'gift-outline'        as const,
  },
] as const;

type Slide = typeof SLIDES[number];

// ─── Background ───────────────────────────────────────────────────────────────
const GRID_STEP = 44;

function Background({ accent }: { accent: string }) {
  const hCount = Math.ceil(H / GRID_STEP) + 1;
  const vCount = Math.ceil(W / GRID_STEP) + 1;
  const lineColor = `${accent}16`;

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      {Array.from({ length: hCount }).map((_, i) => (
        <View
          key={`h${i}`}
          style={{
            position:        'absolute',
            top:             i * GRID_STEP,
            left:            0,
            right:           0,
            height:          StyleSheet.hairlineWidth,
            backgroundColor: lineColor,
          }}
        />
      ))}

      {Array.from({ length: vCount }).map((_, i) => (
        <View
          key={`v${i}`}
          style={{
            position:        'absolute',
            left:            i * GRID_STEP,
            top:             0,
            bottom:          0,
            width:           StyleSheet.hairlineWidth,
            backgroundColor: lineColor,
          }}
        />
      ))}

      <LinearGradient
        colors={[COLORS.background, `${COLORS.background}00`] as any}
        style={{
          position: 'absolute',
          top:      0, left: 0, right: 0,
          height:   H * 0.22,
        }}
      />

      <LinearGradient
        colors={[`${COLORS.background}00`, COLORS.background] as any}
        style={{
          position: 'absolute',
          bottom:   0, left: 0, right: 0,
          height:   H * 0.38,
        }}
      />

      <View
        style={{
          position:        'absolute',
          top:             H * 0.08,
          left:            W / 2 - 150,
          width:           300,
          height:          300,
          borderRadius:    150,
          backgroundColor: `${accent}0E`,
        }}
      />
    </View>
  );
}

// ─── Particle burst ───────────────────────────────────────────────────────────

const Particle = memo(function Particle({
  angle,
  color,
  trigger,
}: {
  angle:   number;
  color:   string;
  trigger: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    const rad  = (angle * Math.PI) / 180;
    const dist = 50 + Math.random() * 40;
    tx.value   = 0;
    ty.value   = 0;
    op.value   = 0;
    sc.value   = 0;
    op.value   = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(200, withTiming(0, { duration: 300 })),
    );
    sc.value   = withSequence(
      withSpring(1.3, { damping: 7 }),
      withTiming(0.2, { duration: 360 }),
    );
    tx.value   = withTiming(Math.cos(rad) * dist, {
      duration: 480,
      easing:   Easing.out(Easing.quad),
    });
    ty.value   = withTiming(Math.sin(rad) * dist, {
      duration: 480,
      easing:   Easing.out(Easing.quad),
    });
  }, [trigger]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale:      sc.value },
    ],
    opacity: op.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position:        'absolute',
          width:           5,
          height:          5,
          borderRadius:    2.5,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
});

function ParticleBurst({
  trigger,
  color,
}: {
  trigger: number;
  color:   string;
}) {
  const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <View
      style={{
        position:       'absolute',
        alignItems:     'center',
        justifyContent: 'center',
      }}
      pointerEvents="none"
    >
      {ANGLES.map((a, i) => (
        <Particle key={i} angle={a} color={color} trigger={trigger} />
      ))}
    </View>
  );
}

// ─── Icon orb ─────────────────────────────────────────────────────────────────
// FIX: Badge and stat pill are now laid out BELOW the ring stack in a row,
// using justifyContent: 'space-between', so they never overlap each other.

function IconOrb({
  slide,
  enterAnim,
}: {
  slide:     Slide;
  enterAnim: SharedValue<number>;
}) {
  const haloScale = useSharedValue(1);
  const haloOp    = useSharedValue(0.22);

  useEffect(() => {
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.96, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    haloOp.value = withRepeat(
      withSequence(
        withTiming(0.38, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.16, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(haloScale);
      cancelAnimation(haloOp);
    };
  }, [slide.accent]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity:   haloOp.value,
  }));

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(enterAnim.value, [0, 1], [0.55, 1]) }],
    opacity:   interpolate(enterAnim.value, [0, 0.35, 1], [0, 0.5, 1]),
  }));

  return (
    <Animated.View
      style={[
        {
          alignItems: 'center',
          // Give the wrapper a fixed width so the chip row below can stretch
          // edge-to-edge across the full 196 px ring diameter.
          width: 196,
        },
        wrapStyle,
      ]}
    >
      {/* ── Ring stack (outer halo + mid ring + gradient core) ── */}
      <View style={{ alignItems: 'center', justifyContent: 'center', height: 196 }}>
        {/* Breathing outer halo */}
        <Animated.View
          style={[
            {
              position:        'absolute',
              width:           196,
              height:          196,
              borderRadius:    98,
              borderWidth:     1,
              borderColor:     slide.accent,
              backgroundColor: `${slide.accent}08`,
            },
            haloStyle,
          ]}
        />

        {/* Fixed mid ring */}
        <View
          style={{
            position:        'absolute',
            width:           158,
            height:          158,
            borderRadius:    79,
            borderWidth:     1,
            borderColor:     `${slide.accent}28`,
            backgroundColor: `${slide.accent}0C`,
          }}
        />

        {/* Core: rounded-square gradient */}
        <LinearGradient
          colors={[slide.accent, slide.accent2] as [string, string]}
          start={{ x: 0.1, y: 0.0 }}
          end={{ x: 0.9, y: 1.0 }}
          style={{
            width:          120,
            height:         120,
            borderRadius:   34,
            alignItems:     'center',
            justifyContent: 'center',
            shadowColor:    slide.accent,
            shadowOpacity:  0.55,
            shadowRadius:   24,
            shadowOffset:   { width: 0, height: 8 },
            elevation:      16,
            overflow:       'hidden',
          }}
        >
          {/* Inner top-left highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.00)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Ionicons name={slide.icon} size={52} color="#FFF" />
        </LinearGradient>
      </View>

      {/* ── Chip row — sits BELOW the ring stack, never overlaps ── */}
      {/* FIX: was two absolute-positioned pills sharing the same `bottom: 2`
               inside the parent; now a regular flex row with space-between. */}
      <View
        style={{
          flexDirection:     'row',
          justifyContent:    'space-between',
          alignItems:        'center',
          width:             '100%',
          marginTop:         10,
          paddingHorizontal: 2,
        }}
      >
        {/* Stat pill — left side */}
        <View
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               4,
            backgroundColor:   COLORS.backgroundElevated,
            borderRadius:      RADIUS.full,
            paddingHorizontal: 8,
            paddingVertical:   4,
            borderWidth:       1,
            borderColor:       `${slide.accent}30`,
          }}
        >
          <Ionicons name={slide.statIcon} size={10} color={slide.accent} />
          <Text
            style={{
              color:      slide.accent,
              fontSize:   9,
              fontWeight: '700',
            }}
          >
            {slide.stat}
          </Text>
        </View>

        {/* Badge pill — right side */}
        <View
          style={{
            backgroundColor:   slide.accent,
            borderRadius:      RADIUS.full,
            paddingHorizontal: 8,
            paddingVertical:   4,
            borderWidth:       2,
            borderColor:       COLORS.background,
          }}
        >
          <Text
            style={{
              color:         '#FFF',
              fontSize:      8,
              fontWeight:    '900',
              letterSpacing: 1.4,
            }}
          >
            {slide.badge}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Slide content ────────────────────────────────────────────────────────────

function SlideContent({
  slide,
  enterAnim,
}: {
  slide:     Slide;
  enterAnim: SharedValue<number>;
}) {
  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.00, 0.40, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [20, 0]) }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.08, 0.55, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [18, 0]) }],
  }));
  const descStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.18, 0.68, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [14, 0]) }],
  }));
  const chipsStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(enterAnim.value, [0.30, 1], [0, 1]),
    transform: [{ translateY: interpolate(enterAnim.value, [0, 1], [10, 0]) }],
  }));

  return (
    <View
      style={{
        alignItems:        'center',
        paddingHorizontal: SPACING.xl,
        width:             W,
      }}
    >
      {/* Eyebrow: step indicator dots + subtitle */}
      <Animated.View
        style={[
          {
            flexDirection:  'row',
            alignItems:     'center',
            gap:            8,
            marginBottom:   10,
          },
          eyebrowStyle,
        ]}
      >
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={{
                width:           s.id === slide.id ? 14 : 4,
                height:          4,
                borderRadius:    2,
                backgroundColor:
                  s.id === slide.id
                    ? slide.accent
                    : `${COLORS.textMuted}40`,
              }}
            />
          ))}
        </View>
        <Text
          style={{
            color:         slide.accent,
            fontSize:      FONTS.sizes.xs,
            fontWeight:    '700',
            letterSpacing: 0.3,
          }}
        >
          {slide.subtitle}
        </Text>
      </Animated.View>

      {/* Title */}
      <Animated.Text
        style={[
          {
            color:         COLORS.textPrimary,
            fontSize:      28,
            fontWeight:    '900',
            textAlign:     'center',
            marginBottom:  10,
            letterSpacing: -0.7,
            lineHeight:    34,
          },
          titleStyle,
        ]}
      >
        {slide.title}
      </Animated.Text>

      {/* Description */}
      <Animated.Text
        style={[
          {
            color:        COLORS.textSecondary,
            fontSize:     FONTS.sizes.sm,
            textAlign:    'center',
            lineHeight:   22,
            marginBottom: SPACING.md,
            maxWidth:     320,
          },
          descStyle,
        ]}
      >
        {slide.description}
      </Animated.Text>

      {/* Feature chips */}
      <Animated.View
        style={[
          {
            flexDirection:  'row',
            flexWrap:       'wrap',
            justifyContent: 'center',
            gap:            6,
          },
          chipsStyle,
        ]}
      >
        {slide.chips.map((chip) => (
          <View
            key={chip}
            style={{
              flexDirection:     'row',
              alignItems:        'center',
              gap:               5,
              backgroundColor:   `${slide.accent}14`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical:   5,
              borderWidth:       1,
              borderColor:       `${slide.accent}2E`,
            }}
          >
            <View
              style={{
                width:           4,
                height:          4,
                borderRadius:    2,
                backgroundColor: slide.accent,
              }}
            />
            <Text
              style={{
                color:         slide.accent,
                fontSize:      11,
                fontWeight:    '600',
                letterSpacing: 0.1,
              }}
            >
              {chip}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Progress strip ───────────────────────────────────────────────────────────

function ProgressStrip({ current }: { current: number }) {
  return (
    <View
      style={{
        flexDirection:     'row',
        gap:               4,
        paddingHorizontal: SPACING.xl,
        marginBottom:      SPACING.sm,
      }}
    >
      {SLIDES.map((s, i) => (
        <View
          key={s.id}
          style={{
            flex:            1,
            height:          2,
            borderRadius:    1,
            backgroundColor: `${COLORS.textMuted}20`,
            overflow:        'hidden',
          }}
        >
          <LinearGradient
            colors={
              i <= current
                ? ([s.accent, s.accent2] as [string, string])
                : (['transparent', 'transparent'] as [string, string])
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Dot indicators ───────────────────────────────────────────────────────────

function DotRow({
  current,
  accent,
}: {
  current: number;
  accent:  string;
}) {
  return (
    <View
      style={{
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            6,
      }}
    >
      {SLIDES.map((_, i) => {
        const active = i === current;
        return (
          <View
            key={i}
            style={{
              width:           active ? 24 : 6,
              height:          6,
              borderRadius:    3,
              backgroundColor: active ? accent : `${COLORS.textMuted}35`,
              overflow:        'hidden',
            }}
          >
            {active && (
              <LinearGradient
                colors={[accent, `${accent}88`] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const [currentIndex,     setCurrentIndex]     = useState(0);
  const [particleTrigger,  setParticleTrigger]  = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const enterAnim = useSharedValue(0);
  const slide     = SLIDES[currentIndex];

  const animateIn = useCallback(() => {
    enterAnim.value = 0;
    enterAnim.value = withSpring(1, {
      damping:   14,
      stiffness: 75,
      mass:      0.9,
    });
  }, []);

  useEffect(() => { animateIn(); }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      setParticleTrigger(p => p + 1);
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

  const handleMomentumEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / W);
      if (idx !== currentIndex && idx >= 0 && idx < SLIDES.length) {
        setCurrentIndex(idx);
      }
    },
    [currentIndex],
  );

  const isLast = currentIndex === SLIDES.length - 1;

  // Icon zone height accounts for rings (196) + chip row below (~36) + gap
  const ICON_ZONE_H = H * 0.32;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Animated background ──────────────────────────────────────────── */}
      <Background accent={slide.accent} />

      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            justifyContent:    'space-between',
            paddingHorizontal: SPACING.xl,
            paddingTop:        4,
            paddingBottom:     8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width:         34,
                height:        34,
                borderRadius:  10,
                overflow:      'hidden',
                borderWidth:   1,
                borderColor:   `${COLORS.primary}35`,
                shadowColor:   COLORS.primary,
                shadowOpacity: 0.40,
                shadowRadius:  8,
                elevation:     6,
              }}
            >
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: 34, height: 34 }}
                resizeMode="cover"
              />
            </View>
            <Text
              style={{
                color:         COLORS.textPrimary,
                fontSize:      FONTS.sizes.md,
                fontWeight:    '800',
                letterSpacing: -0.4,
              }}
            >
              DeepDive AI
            </Text>
          </View>

          {!isLast && (
            <TouchableOpacity
              onPress={handleSkip}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                paddingHorizontal: 12,
                paddingVertical:   6,
                borderRadius:      RADIUS.full,
                backgroundColor:   `${COLORS.textMuted}10`,
                borderWidth:       1,
                borderColor:       `${COLORS.textMuted}20`,
              }}
            >
              <Text
                style={{
                  color:      COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: '600',
                }}
              >
                Skip
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── Progress strip ───────────────────────────────────────────── */}
        <ProgressStrip current={currentIndex} />

        {/* ── Icon zone ────────────────────────────────────────────────── */}
        <View
          style={{
            height:         ICON_ZONE_H,
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <IconOrb slide={slide} enterAnim={enterAnim} />
          <ParticleBurst trigger={particleTrigger} color={slide.accent} />
        </View>

        {/* ── Scrollable text area ─────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'flex-start' }}
        >
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={{
                width:          W,
                flex:           1,
                alignItems:     'center',
                justifyContent: 'center',
                paddingTop:     SPACING.md,
              }}
            >
              {i === currentIndex ? (
                <SlideContent slide={s} enterAnim={enterAnim} />
              ) : (
                <View
                  style={{
                    alignItems:        'center',
                    paddingHorizontal: SPACING.xl,
                    opacity:           0.25,
                  }}
                >
                  <Text
                    style={{
                      color:         COLORS.textPrimary,
                      fontSize:      28,
                      fontWeight:    '900',
                      textAlign:     'center',
                      letterSpacing: -0.7,
                      lineHeight:    34,
                    }}
                  >
                    {s.title}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* ── Bottom action bar ────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInUp.duration(600).delay(220)}
          style={{
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.sm,
            paddingBottom:     Platform.OS === 'ios' ? 30 : SPACING.xl,
          }}
        >
          <View
            style={{
              height:          StyleSheet.hairlineWidth,
              backgroundColor: `${COLORS.border}80`,
              marginBottom:    16,
            }}
          />

          <View style={{ marginBottom: 16 }}>
            <DotRow current={currentIndex} accent={slide.accent} />
          </View>

          {/* Primary CTA button */}
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.82}
            style={{ marginBottom: SPACING.md }}
          >
            <LinearGradient
              colors={[slide.accent, slide.accent2] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius:    RADIUS.xl,
                paddingVertical: 16,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             10,
                shadowColor:     slide.accent,
                shadowOpacity:   0.45,
                shadowRadius:    18,
                shadowOffset:    { width: 0, height: 6 },
                elevation:       14,
                overflow:        'hidden',
              }}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.24)',
                  'rgba(255,255,255,0.00)',
                ]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={{
                  position:     'absolute',
                  top:          0,
                  left:         0,
                  right:        0,
                  height:       '55%',
                  borderRadius: RADIUS.xl,
                }}
              />
              <Text
                style={{
                  color:         '#FFFFFF',
                  fontSize:      FONTS.sizes.md,
                  fontWeight:    '800',
                  letterSpacing: 0.1,
                }}
              >
                {isLast ? 'Get Started — 20 Free Credits' : 'Continue'}
              </Text>
              <View
                style={{
                  width:           26,
                  height:          26,
                  borderRadius:    13,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems:      'center',
                  justifyContent:  'center',
                }}
              >
                <Ionicons
                  name={isLast ? 'rocket-outline' : 'arrow-forward'}
                  size={14}
                  color="#FFF"
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Sign-in link */}
          <View
            style={{
              flexDirection:  'row',
              justifyContent: 'center',
              alignItems:     'center',
              gap:            4,
            }}
          >
            <Text
              style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.sm,
              }}
            >
              Already have an account?
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/signin')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={{
                  color:      slide.accent,
                  fontSize:   FONTS.sizes.sm,
                  fontWeight: '700',
                }}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}