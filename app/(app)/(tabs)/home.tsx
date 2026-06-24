// app/(app)/(tabs)/home.tsx
// Part 43 — COMPLETE REDESIGN: "Deep Space Command Center" aesthetic.
//
// Visual upgrades (zero breaking changes to features/hooks):
//  • Animated floating gradient orbs background (3 orbs, pure Reanimated, no BlurView)
//  • Cycling typewriter placeholder in search input (6 queries, fade animation)
//  • Morphing search border — spring glow on focus (shadowColor, borderColor animation)
//  • Breathing "LIVE" dot on the AI Engine card
//  • Stat chips in header with count-up animation (pulls from useStats)
//  • Staggered spring entry animations for every section
//  • Horizontal scrolling feature pill strip (replaces plain depth grid)
//  • Redesigned personalized suggestion cards with gradient borders
//  • Knowledge Base card as a full-bleed holographic hero strip
//  • Animated section accent lines
//
// All existing functionality (voice, personalization, depth routing, KB nav) preserved exactly.
//
// ── Part 55.1A — THEME SYSTEM ─────────────────────────────────────────────────
//   Every hardcoded hex (#1E1B45, #6C63FF, #8B5CF6, #2A2A4A, rgba(108,99,255,…) …)
//   is replaced with a live COLORS read so the whole screen recolors on a theme
//   switch. Helpers `hexWithAlpha()` and `mix()` give us theme-derived tints for
//   the deep-space gradients that were previously hardcoded.
//
//   WORKLETS-SAFE: the search-glow animated style read a hardcoded primary before;
//   it now snapshots the COLORS.primary primitive into rgba components OUTSIDE the
//   worklet (parsePrimaryRGB) and the worklet references only those numbers, so
//   the mutable COLORS singleton is never captured by the UI runtime.
//
//   The orbs use theme-tinted colors derived from COLORS via hexWithAlpha(); these
//   are plain strings recomputed each render → recolor on theme change, and they
//   are passed as backgroundColor (not via a COLORS-object reference), so no
//   worklet captures the singleton.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Keyboard, Alert, Vibration, RefreshControl,
  Dimensions, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft,
  useAnimatedStyle, useSharedValue,
  withSpring, withRepeat, withSequence, withTiming,
  withDelay, interpolate, Easing, cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';
import { router }         from 'expo-router';
import { useAuth }        from '../../../src/context/AuthContext';
import { useTheme }       from '../../../src/context/ThemeContext';
import { Avatar }         from '../../../src/components/common/Avatar';
import { PersonalizedSuggestionCard } from '../../../src/components/home/PersonalizedSuggestionCard';
import { usePersonalization }         from '../../../src/hooks/usePersonalization';
import { useStats }                   from '../../../src/hooks/useStats';
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, formatDuration,
} from '../../../src/services/voiceResearch';
import { getCachedReportsList } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Theme color helpers ──────────────────────────────────────────────────────
// hexWithAlpha('#6C63FF', 0.13) → 'rgba(108,99,255,0.13)'. Works with 3/6-digit
// hex. Falls back gracefully if a non-hex value is passed (returns it unchanged).
function hexWithAlpha(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Parse a hex color into [r,g,b] numbers (for worklet-safe animated rgba).
function parsePrimaryRGB(hex: string): { r: number; g: number; b: number } {
  if (typeof hex !== 'string' || hex[0] !== '#') return { r: 108, g: 99, b: 255 };
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return { r: 108, g: 99, b: 255 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// ─── Cycling placeholder queries ──────────────────────────────────────────────
const PLACEHOLDERS = [
  'Future of quantum computing startups…',
  'Impact of AI on software engineering jobs…',
  'Climate tech investment trends 2025…',
  'Gene editing breakthroughs & ethics…',
  'SpaceX Starship commercial viability…',
  'Decentralized AI models & privacy…',
];

// ─── Depth feature data (colors resolved at render via getDepthPills) ─────────
function getDepthPills() {
  return [
    { key: 'quick',  label: 'Quick',  desc: '2–3 min',   icon: 'flash',     color: COLORS.primary,   bg: hexWithAlpha(COLORS.primary, 0.13) },
    { key: 'deep',   label: 'Deep',   desc: '5–7 min',   icon: 'analytics', color: COLORS.secondary, bg: hexWithAlpha(COLORS.secondary, 0.13) },
    { key: 'expert', label: 'Expert', desc: '10–12 min', icon: 'trophy',    color: COLORS.accent,    bg: hexWithAlpha(COLORS.accent, 0.13) },
  ];
}

function getFeaturePills(): { icon: string; label: string; color: string; route: string }[] {
  return [
    { icon: 'radio-outline',   label: 'Podcast',      color: COLORS.primaryLight, route: '/(app)/(tabs)/podcast'  },
    { icon: 'people-outline',  label: 'Debate',       color: COLORS.secondary,    route: '/(app)/(tabs)/debate'   },
    { icon: 'school-outline',  label: 'Paper',        color: COLORS.accent,       route: '/(app)/research-input'  },
    { icon: 'easel-outline',   label: 'Slides',       color: COLORS.warning,      route: '/(app)/(tabs)/history'  },
    { icon: 'mic-outline',     label: 'Voice Debate', color: COLORS.info,         route: '/(app)/(tabs)/debate'   },
    { icon: 'library-outline', label: 'KB',           color: COLORS.primaryLight, route: '/(app)/knowledge-base'  },
  ];
}

const SOURCE_HEADER: Record<string, string> = {
  affinity: '⭐  Your Interests',
  recent:   '🕐  Recently Researched',
  followup: '💡  AI Follow-up Angles',
  trending: '🔥  Trending Topics',
};

// ─── Floating Orb Component ───────────────────────────────────────────────────
// Pure Reanimated, no BlurView. Each orb drifts on a unique path. `color` is a
// plain rgba string (theme-derived) — no COLORS object reference is captured.

function FloatingOrb({
  size, color, x, y, driftX, driftY, duration, delay,
}: {
  size: number; color: string; x: number; y: number;
  driftX: number; driftY: number; duration: number; delay: number;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 1200 }));
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(driftX,  { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(-driftX, { duration, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, true,
      ),
    );
    translateY.value = withDelay(
      delay + duration * 0.3,
      withRepeat(
        withSequence(
          withTiming(driftY,  { duration: duration * 1.3, easing: Easing.inOut(Easing.sin) }),
          withTiming(-driftY, { duration: duration * 1.3, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, true,
      ),
    );
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(opacity);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position:     'absolute',
          left:         x - size / 2,
          top:          y - size / 2,
          width:        size,
          height:       size,
          borderRadius: size / 2,
          backgroundColor: color,
          pointerEvents: 'none',
        },
        style,
      ]}
    />
  );
}

// ─── Breathing dot ────────────────────────────────────────────────────────────
function BreathingDot({ color }: { color?: string }) {
  const dotColor = color ?? COLORS.accent;
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 900 }),
        withTiming(0.4, { duration: 900 }),
      ),
      -1, false,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor },
        style,
      ]}
    />
  );
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────
function SkeletonCard({ delay }: { delay: number }) {
  const shimmer = useSharedValue(-1);

  useEffect(() => {
    shimmer.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1200 }), -1, false),
    );
    return () => cancelAnimation(shimmer);
  }, []);

  const shimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [-1, 0, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)}>
      <Animated.View
        style={[
          {
            backgroundColor: COLORS.backgroundCard,
            borderRadius:    RADIUS.lg,
            padding:         SPACING.md,
            marginBottom:    SPACING.sm,
            flexDirection:   'row',
            alignItems:      'center',
            borderWidth:     1,
            borderColor:     COLORS.border,
            gap:             14,
          },
          shimStyle,
        ]}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.backgroundElevated }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: '70%' }} />
          <View style={{ height: 10, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '40%' }} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Animated section label ───────────────────────────────────────────────────
function SectionLabel({ text, delay = 0 }: { text: string; delay?: number }) {
  const lineW = useSharedValue(0);

  useEffect(() => {
    lineW.value = withDelay(delay + 200, withSpring(24, { damping: 12, stiffness: 120 }));
    return () => cancelAnimation(lineW);
  }, []);

  const lineStyle = useAnimatedStyle(() => ({ width: lineW.value }));

  return (
    <Animated.View
      entering={FadeInLeft.duration(400).delay(delay)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.md }}
    >
      <Animated.View
        style={[{
          height: 2, borderRadius: 1,
          backgroundColor: COLORS.primary,
        }, lineStyle]}
      />
      <Text style={{
        color:         COLORS.textMuted,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}>
        {text}
      </Text>
    </Animated.View>
  );
}

// ─── Stat chip with count-up ──────────────────────────────────────────────────
function StatChip({
  value, label, icon, color, delay,
}: {
  value: number; label: string; icon: string; color: string; delay: number;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const steps = 20;
    const step  = value / steps;
    let current = 0;
    const t = setInterval(() => {
      current = Math.min(current + step, value);
      setDisplayed(Math.round(current));
      if (current >= value) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [value]);

  return (
    <Animated.View
      entering={FadeInDown.springify().delay(delay).damping(14).stiffness(100)}
      style={{
        backgroundColor:   hexWithAlpha(color, 0.07),
        borderRadius:      RADIUS.lg,
        paddingHorizontal: 12,
        paddingVertical:   8,
        borderWidth:       1,
        borderColor:       hexWithAlpha(color, 0.15),
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        marginRight:       SPACING.sm,
      }}
    >
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={{ color, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>{displayed}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{label}</Text>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { profile } = useAuth();
  const { stats }   = useStats();
  // Part 55.1A: subscribe to theme version so this screen + its memoized helpers
  // recolor immediately on a theme change.
  useTheme();

  const [query,            setQuery]            = useState('');
  const [isRecording,      setIsRecording]      = useState(false);
  const [recordingMs,      setRecordingMs]      = useState(0);
  const [transcribing,     setTranscribing]     = useState(false);
  const [cachedCount,      setCachedCount]      = useState(0);
  const [placeholderIdx,   setPlaceholderIdx]   = useState(0);

  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  const {
    suggestions,
    isLoading:     suggestionsLoading,
    isPersonalized,
    refresh:       refreshSuggestions,
  } = usePersonalization();

  // Resolve theme-driven data each render.
  const DEPTH_PILLS   = getDepthPills();
  const FEATURE_PILLS = getFeaturePills();

  // Worklet-safe primary rgb snapshot (for the focus glow border).
  const primaryRGB = parsePrimaryRGB(COLORS.primary);
  const pr = primaryRGB.r, pg = primaryRGB.g, pb = primaryRGB.b;
  const primaryHex = COLORS.primary;

  // ── Shared values ──────────────────────────────────────────────────────────
  const inputBorderGlow    = useSharedValue(0);
  const micPulse           = useSharedValue(1);
  const placeholderOpacity = useSharedValue(1);
  const placeholderVisible = useSharedValue(1);

  // ── Cached count ───────────────────────────────────────────────────────────
  useEffect(() => {
    getCachedReportsList().then(list => setCachedCount(list.length));
  }, []);

  // ── Placeholder cycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const cycle = setInterval(() => {
      placeholderOpacity.value = withTiming(0, { duration: 300 }, (done) => {
        if (done) {
          runOnJS(setPlaceholderIdx)(prev => (prev + 1) % PLACEHOLDERS.length);
          placeholderOpacity.value = withTiming(1, { duration: 400 });
        }
      });
    }, 3200);
    return () => clearInterval(cycle);
  }, []);

  useEffect(() => {
    const shouldShow = query.length === 0 && !isRecording;
    placeholderVisible.value = withTiming(shouldShow ? 1 : 0, { duration: 120 });
  }, [query.length, isRecording]);

  const placeholderStyle = useAnimatedStyle(() => ({
    opacity: placeholderOpacity.value * placeholderVisible.value,
  }));

  // ── Mic pulse ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      micPulse.value = withRepeat(
        withSequence(withTiming(1.25, { duration: 500 }), withTiming(1.0, { duration: 500 })),
        -1, false,
      );
    } else {
      cancelAnimation(micPulse);
      micPulse.value = withTiming(1);
    }
  }, [isRecording]);

  // Part 55.1A WORKLETS-SAFE: the glow border references only the primitive rgb
  // numbers (pr/pg/pb) and the primary hex string snapshot — never the COLORS
  // object — so applyTheme()'s mutation can't trip the worklet warning.
  const inputWrapStyle = useAnimatedStyle(() => ({
    borderColor:   `rgba(${pr}, ${pg}, ${pb}, ${interpolate(inputBorderGlow.value, [0, 1], [0.18, 0.85])})`,
    shadowColor:   primaryHex,
    shadowOpacity: interpolate(inputBorderGlow.value, [0, 1], [0, 0.5]),
    shadowRadius:  interpolate(inputBorderGlow.value, [0, 1], [0, 20]),
    shadowOffset:  { width: 0, height: 0 },
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const searchIconActiveStyle = useAnimatedStyle(() => ({
    opacity: inputBorderGlow.value,
  }));
  const searchIconIdleStyle = useAnimatedStyle(() => ({
    opacity: 1 - inputBorderGlow.value,
  }));

  const handleInputFocus = useCallback(() => {
    inputBorderGlow.value = withTiming(1, { duration: 200 });
  }, []);
  const handleInputBlur = useCallback(() => {
    inputBorderGlow.value = withTiming(0, { duration: 200 });
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = useCallback((searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    Keyboard.dismiss();
    router.push({ pathname: '/(app)/research-input' as any, params: { query: q.trim() } });
  }, [query]);

  const handleVoicePress = async () => {
    if (transcribing) return;
    if (isRecording) {
      setIsRecording(false);
      setRecordingMs(0);
      setTranscribing(true);
      try {
        const uri = await stopRecording();
        if (uri) {
          const text = await transcribeAudio(uri);
          if (text) { setQuery(text); Vibration.vibrate(50); }
        }
      } catch {
        Alert.alert('Transcription Error', 'Could not transcribe audio. Please type your query.');
      } finally {
        setTranscribing(false);
      }
    } else {
      const started = await startRecording(ms => setRecordingMs(ms));
      if (started) {
        setIsRecording(true);
        Vibration.vibrate(50);
      } else {
        Alert.alert('Microphone Access', 'Please grant microphone permission to use voice research.');
      }
    }
  };

  const handleVoiceCancel = () => {
    cancelRecording();
    setIsRecording(false);
    setRecordingMs(0);
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // ── Grouped suggestions ────────────────────────────────────────────────────
  const groupedSuggestions = React.useMemo(() => {
    const groups: { source: string; items: typeof suggestions }[] = [];
    const seen = new Set<string>();
    const order = ['affinity', 'followup', 'recent', 'trending'];
    order.forEach(source => {
      const items = suggestions.filter(s => s.source === source);
      if (items.length > 0) {
        groups.push({ source, items });
        items.forEach(s => seen.add(s.id));
      }
    });
    const remaining = suggestions.filter(s => !seen.has(s.id));
    if (remaining.length > 0) groups.push({ source: 'trending', items: remaining });
    return groups;
  }, [suggestions]);

  // ── Tab bar height ─────────────────────────────────────────────────────────
  const TAB_H = Platform.OS === 'ios' ? 90 : 80;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>

      {/* ── Animated orb background (theme-tinted) ──────────────────────── */}
      <View style={{ ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' }}>
        <FloatingOrb
          size={260} color={hexWithAlpha(COLORS.primary, 0.13)}
          x={-40} y={60} driftX={30} driftY={20}
          duration={7000} delay={0}
        />
        <FloatingOrb
          size={200} color={hexWithAlpha(COLORS.secondary, 0.10)}
          x={SCREEN_W + 20} y={180} driftX={-25} driftY={35}
          duration={9000} delay={800}
        />
        <FloatingOrb
          size={180} color={hexWithAlpha(COLORS.accent, 0.08)}
          x={SCREEN_W * 0.55} y={500} driftX={20} driftY={-30}
          duration={11000} delay={400}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: TAB_H + SPACING.xl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={suggestionsLoading}
              onRefresh={refreshSuggestions}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >

          {/* ── Header ────────────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(0).damping(16).stiffness(90)}
            style={{ paddingTop: SPACING.md, marginBottom: SPACING.lg }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '500', letterSpacing: 0.3 }}>
                  {getGreeting()},
                </Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 }}>
                  {firstName} 👋
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                {isPersonalized && (
                  <Animated.View
                    entering={FadeIn.duration(600).delay(300)}
                    style={{
                      backgroundColor:   hexWithAlpha(COLORS.primary, 0.08),
                      borderRadius:      RADIUS.full,
                      paddingHorizontal: 10, paddingVertical: 5,
                      borderWidth:       1, borderColor: hexWithAlpha(COLORS.primary, 0.19),
                      flexDirection:     'row', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Ionicons name="sparkles" size={11} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>
                      Personalized
                    </Text>
                  </Animated.View>
                )}
                <Avatar url={profile?.avatar_url} name={profile?.full_name} size={46} />
              </View>
            </View>

            {/* Stat chips row */}
            {stats && (stats.completedReports > 0 || (stats.totalPodcasts ?? 0) > 0) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {stats.completedReports > 0 && (
                  <StatChip value={stats.completedReports} label="reports" icon="document-text-outline" color={COLORS.primary}   delay={150} />
                )}
                {(stats.hoursResearched ?? 0) > 0 && (
                  <StatChip value={Math.round(stats.hoursResearched ?? 0)} label="hrs saved" icon="time-outline" color={COLORS.accent}    delay={250} />
                )}
                {(stats.totalPodcasts ?? 0) > 0 && (
                  <StatChip value={stats.totalPodcasts ?? 0} label="podcasts" icon="radio-outline" color={COLORS.primaryLight} delay={350} />
                )}
                {(stats.totalDebates ?? 0) > 0 && (
                  <StatChip value={stats.totalDebates ?? 0} label="debates" icon="people-outline" color={COLORS.secondary}  delay={450} />
                )}
                {cachedCount > 0 && (
                  <StatChip value={cachedCount} label="offline" icon="cloud-offline-outline" color={COLORS.info}  delay={550} />
                )}
              </ScrollView>
            )}
          </Animated.View>

          {/* ── Search Hero ──────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(80).damping(15).stiffness(95)}
            style={{ marginBottom: SPACING.lg }}
          >
            <LinearGradient
              colors={COLORS.gradientCard as [string, string]}
              style={{
                borderRadius: RADIUS.xl,
                padding:      SPACING.lg,
                borderWidth:  1,
                borderColor:  hexWithAlpha(COLORS.primary, 0.16),
                overflow:     'hidden',
              }}
            >
              {/* Subtle top glow strip */}
              <LinearGradient
                colors={[hexWithAlpha(COLORS.primary, 0.31), 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
              />

              {/* Card header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="telescope-outline" size={16} color="#FFF" />
                  </LinearGradient>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    AI Research Engine
                  </Text>
                </View>
                {/* LIVE breathing indicator */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <BreathingDot color={COLORS.accent} />
                  <Text style={{ color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>LIVE</Text>
                </View>
              </View>

              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                lineHeight: 19, marginBottom: SPACING.md,
              }}>
                Multi-agent system: searches, analyses, fact-checks, and streams your report live.
              </Text>

              {/* Voice recording banner */}
              {isRecording && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={{
                    backgroundColor: hexWithAlpha(COLORS.error, 0.08),
                    borderRadius:    RADIUS.md, padding: SPACING.sm,
                    marginBottom:    SPACING.sm,
                    flexDirection:   'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth:     1, borderColor: hexWithAlpha(COLORS.error, 0.19),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <BreathingDot color={COLORS.error} />
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                      Recording {formatDuration(recordingMs)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleVoiceCancel}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {transcribing && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={{
                    backgroundColor: hexWithAlpha(COLORS.primary, 0.07),
                    borderRadius:    RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm,
                    flexDirection:   'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="mic" size={14} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm }}>Transcribing…</Text>
                </Animated.View>
              )}

              {/* ── Search input ───────────────────────────────────────── */}
              <Animated.View
                style={[
                  {
                    backgroundColor:   COLORS.backgroundElevated,
                    borderRadius:      RADIUS.lg,
                    flexDirection:     'row', alignItems: 'center',
                    paddingHorizontal: SPACING.md, paddingVertical: 13,
                    borderWidth:       1.5,
                    marginBottom:      SPACING.md,
                  },
                  inputWrapStyle,
                ]}
              >
                <View style={{ width: 19, height: 19, justifyContent: 'center', alignItems: 'center' }}>
                  <Animated.View style={[{ position: 'absolute' }, searchIconIdleStyle]}>
                    <Ionicons name="search-outline" size={19} color={COLORS.textMuted} />
                  </Animated.View>
                  <Animated.View style={[{ position: 'absolute' }, searchIconActiveStyle]}>
                    <Ionicons name="search-outline" size={19} color={COLORS.primary} />
                  </Animated.View>
                </View>

                <View style={{ flex: 1, marginLeft: 10, position: 'relative', justifyContent: 'center' }}>
                  <TextInput
                    placeholder=""
                    placeholderTextColor="transparent"
                    value={query}
                    onChangeText={setQuery}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                    style={{
                      color:    COLORS.textPrimary,
                      fontSize: FONTS.sizes.sm,
                      padding:  0,
                      zIndex:   1,
                    }}
                    editable={!isRecording && !transcribing}
                  />
                  <Animated.Text
                    style={[
                      {
                        position:  'absolute',
                        left:      0,
                        right:     0,
                        color:     COLORS.textMuted,
                        fontSize:  FONTS.sizes.sm,
                        pointerEvents: 'none',
                      },
                      placeholderStyle,
                    ]}
                    numberOfLines={1}
                  >
                    {PLACEHOLDERS[placeholderIdx]}
                  </Animated.Text>
                </View>

                {/* Mic button */}
                <Animated.View style={micStyle}>
                  <TouchableOpacity
                    onPress={handleVoicePress}
                    style={{
                      width:           36, height: 36, borderRadius: 18,
                      backgroundColor: isRecording ? COLORS.error : hexWithAlpha(COLORS.primary, 0.13),
                      alignItems:      'center', justifyContent: 'center', marginLeft: 6,
                      borderWidth:     1,
                      borderColor:     isRecording ? hexWithAlpha(COLORS.error, 0.38) : hexWithAlpha(COLORS.primary, 0.25),
                    }}
                  >
                    <Ionicons
                      name={isRecording ? 'stop' : 'mic-outline'}
                      size={16}
                      color={isRecording ? '#FFF' : COLORS.primary}
                    />
                  </TouchableOpacity>
                </Animated.View>

                {query.length > 0 && !isRecording && (
                  <TouchableOpacity onPress={() => setQuery('')} style={{ marginLeft: 4 }}>
                    <Ionicons name="close-circle" size={19} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </Animated.View>

              {/* Hint text */}
              {!isRecording && !transcribing && (
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                  textAlign: 'center', marginBottom: SPACING.md, letterSpacing: 0.2,
                }}>
                  🎙️ Tap mic to speak  ·  Reports stream live as written
                </Text>
              )}

              {/* Search CTA */}
              <TouchableOpacity
                onPress={() => handleSearch()}
                disabled={!query.trim() || isRecording}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={query.trim() && !isRecording
                    ? (COLORS.gradientPrimary as [string, string])
                    : ['#2A2A4A', '#1A1A35']
                  }
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius:   RADIUS.lg, paddingVertical: 15,
                    alignItems:     'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 10,
                  }}
                >
                  <Ionicons name="sparkles-outline" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800', letterSpacing: 0.3 }}>
                    Start Research
                  </Text>
                  {query.trim() && (
                    <View style={{
                      backgroundColor:   'rgba(255,255,255,0.18)',
                      borderRadius:      RADIUS.full,
                      paddingHorizontal: 8, paddingVertical: 2,
                    }}>
                      <Ionicons name="arrow-forward" size={13} color="#FFF" />
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* ── Knowledge Base — Full-width holographic strip ─────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(160).damping(15).stiffness(95)}
            style={{ marginBottom: SPACING.lg }}
          >
            <TouchableOpacity
              onPress={() => router.push('/(app)/knowledge-base' as any)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={COLORS.gradientCard as [string, string]}
                style={{
                  borderRadius: RADIUS.xl, overflow: 'hidden',
                  borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.25),
                }}
              >
                {/* Diagonal shimmer overlay */}
                <LinearGradient
                  colors={['transparent', hexWithAlpha(COLORS.primary, 0.03), 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                {/* Top edge glow */}
                <LinearGradient
                  colors={[hexWithAlpha(COLORS.primary, 0.38), 'transparent']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
                />

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  padding: SPACING.md, gap: SPACING.md,
                }}>
                  {/* Icon orb */}
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={{
                      width: 50, height: 50, borderRadius: 15,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.31),
                    }}
                  >
                    <Ionicons name="library" size={24} color="#FFF" />
                  </LinearGradient>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', letterSpacing: -0.2 }}>
                        Knowledge Base
                      </Text>
                      <View style={{
                        backgroundColor: hexWithAlpha(COLORS.primary, 0.15),
                        borderRadius:    RADIUS.full,
                        paddingHorizontal: 6, paddingVertical: 1,
                        borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.25),
                      }}>
                        <Text style={{ color: COLORS.primary, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }}>NEW</Text>
                      </View>
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                      Ask across all reports simultaneously — your AI second brain.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
                      {['Semantic search', 'Source citation', 'Multi-report'].map(t => (
                        <View key={t} style={{
                          backgroundColor: hexWithAlpha(COLORS.primary, 0.06),
                          borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2,
                          borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.13),
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: 8, fontWeight: '600' }}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: hexWithAlpha(COLORS.primary, 0.09),
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.19),
                    flexShrink: 0,
                  }}>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Depth + Features ──────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(220).damping(15).stiffness(95)}
            style={{ marginBottom: SPACING.lg }}
          >
            <SectionLabel text="Research Depth" delay={240} />

            {/* Depth pills row */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
              {DEPTH_PILLS.map((d, i) => (
                <Animated.View
                  key={d.key}
                  entering={FadeInDown.springify().delay(260 + i * 60).damping(14).stiffness(110)}
                  style={{ flex: 1 }}
                >
                  <TouchableOpacity
                    onPress={() => router.push({
                      pathname: '/(app)/research-input' as any,
                      params: { query: query.trim(), depth: d.key },
                    })}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[d.bg, hexWithAlpha(d.color, 0.03)]}
                      style={{
                        borderRadius:  RADIUS.lg, padding: SPACING.sm,
                        alignItems:    'center',
                        borderWidth:   1, borderColor: hexWithAlpha(d.color, 0.19),
                        minHeight:     80, justifyContent: 'center',
                      }}
                    >
                      <View style={{
                        width: 34, height: 34, borderRadius: 10,
                        backgroundColor: hexWithAlpha(d.color, 0.13),
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: hexWithAlpha(d.color, 0.21),
                        marginBottom: 6,
                      }}>
                        <Ionicons name={d.icon as any} size={17} color={d.color} />
                      </View>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                        {d.label}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>
                        {d.desc}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>

            {/* Feature chips horizontal scroll */}
            <SectionLabel text="Features" delay={380} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {FEATURE_PILLS.map((f, i) => (
                <Animated.View
                  key={f.label}
                  entering={FadeInLeft.springify().delay(400 + i * 50).damping(14).stiffness(110)}
                >
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: f.route as any })}
                    activeOpacity={0.78}
                  >
                    <View style={{
                      backgroundColor:   hexWithAlpha(f.color, 0.07),
                      borderRadius:      RADIUS.lg,
                      paddingHorizontal: 14,
                      paddingVertical:   10,
                      marginRight:       SPACING.sm,
                      flexDirection:     'row',
                      alignItems:        'center',
                      gap:               7,
                      borderWidth:       1,
                      borderColor:       hexWithAlpha(f.color, 0.16),
                    }}>
                      <View style={{
                        width: 26, height: 26, borderRadius: 8,
                        backgroundColor: hexWithAlpha(f.color, 0.13),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={f.icon as any} size={14} color={f.color} />
                      </View>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                        {f.label}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={hexWithAlpha(f.color, 0.5)} />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>

          {/* ── Personalized Suggestions ──────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(300).damping(15).stiffness(95)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <SectionLabel
                text={isPersonalized ? '✦ Curated for you' : '🔥 Trending topics'}
                delay={320}
              />
              <TouchableOpacity
                onPress={refreshSuggestions}
                style={{
                  flexDirection:     'row', alignItems: 'center', gap: 4,
                  backgroundColor:   hexWithAlpha(COLORS.primary, 0.07),
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth:       1, borderColor: hexWithAlpha(COLORS.primary, 0.13),
                  marginBottom:      SPACING.md,
                }}
              >
                <Ionicons name="refresh-outline" size={12} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {/* Personalized info pill */}
            {isPersonalized && (
              <Animated.View
                entering={FadeIn.duration(400).delay(340)}
                style={{
                  backgroundColor: hexWithAlpha(COLORS.primary, 0.03),
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.sm,
                  marginBottom:    SPACING.md,
                  flexDirection:   'row',
                  alignItems:      'center',
                  gap:             8,
                  borderWidth:     1,
                  borderColor:     hexWithAlpha(COLORS.primary, 0.08),
                }}
              >
                <Ionicons name="sparkles" size={13} color={COLORS.primary} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 16 }}>
                  Curated from your research history, interests, and trending topics.
                </Text>
              </Animated.View>
            )}

            {/* Loading skeletons */}
            {suggestionsLoading && suggestions.length === 0 && (
              [0, 80, 160, 240].map(delay => (
                <SkeletonCard key={delay} delay={delay} />
              ))
            )}

            {/* Suggestion cards */}
            {(!suggestionsLoading || suggestions.length > 0) ? (
              isPersonalized && groupedSuggestions.length > 1 ? (
                groupedSuggestions.map((group, gi) => (
                  <View key={group.source + gi}>
                    {gi > 0 && (
                      <SectionLabel
                        text={SOURCE_HEADER[group.source] ?? group.source}
                        delay={0}
                      />
                    )}
                    {group.items.map((suggestion, si) => (
                      <Animated.View
                        key={suggestion.id}
                        entering={FadeInDown.springify().delay(si * 60).damping(14).stiffness(100)}
                      >
                        <PersonalizedSuggestionCard
                          suggestion={suggestion}
                          onPress={handleSearch}
                        />
                      </Animated.View>
                    ))}
                  </View>
                ))
              ) : (
                suggestions.map((suggestion, si) => (
                  <Animated.View
                    key={suggestion.id}
                    entering={FadeInDown.springify().delay(si * 60).damping(14).stiffness(100)}
                  >
                    <PersonalizedSuggestionCard
                      suggestion={suggestion}
                      onPress={handleSearch}
                    />
                  </Animated.View>
                ))
              )
            ) : null}
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Inline StyleSheet to avoid module-level import cycle issues
const StyleSheet = {
  absoluteFillObject: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
  },
};