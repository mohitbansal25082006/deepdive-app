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

// ─── Cycling placeholder queries ──────────────────────────────────────────────
const PLACEHOLDERS = [
  'Future of quantum computing startups…',
  'Impact of AI on software engineering jobs…',
  'Climate tech investment trends 2025…',
  'Gene editing breakthroughs & ethics…',
  'SpaceX Starship commercial viability…',
  'Decentralized AI models & privacy…',
];

// ─── Depth feature data ───────────────────────────────────────────────────────
const DEPTH_PILLS = [
  { key: 'quick',  label: 'Quick',  desc: '2–3 min',  icon: 'flash',            color: '#6C63FF', bg: '#6C63FF20' },
  { key: 'deep',   label: 'Deep',   desc: '5–7 min',  icon: 'analytics',        color: '#FF6584', bg: '#FF658420' },
  { key: 'expert', label: 'Expert', desc: '10–12 min', icon: 'trophy',          color: '#43E97B', bg: '#43E97B20' },
];

const FEATURE_PILLS: {
  icon:  string;
  label: string;
  color: string;
  route: string;
}[] = [
  { icon: 'radio-outline',   label: 'Podcast',      color: '#A78BFA', route: '/(app)/(tabs)/podcast'  },
  { icon: 'people-outline',  label: 'Debate',       color: '#FB7185', route: '/(app)/(tabs)/debate'   },
  { icon: 'school-outline',  label: 'Paper',        color: '#34D399', route: '/(app)/research-input'  },
  { icon: 'easel-outline',   label: 'Slides',       color: '#FBBF24', route: '/(app)/(tabs)/history'  },
  { icon: 'mic-outline',     label: 'Voice Debate', color: '#60A5FA', route: '/(app)/(tabs)/debate'   },
  { icon: 'library-outline', label: 'KB',           color: '#C084FC', route: '/(app)/knowledge-base'  },
];

const SOURCE_HEADER: Record<string, string> = {
  affinity: '⭐  Your Interests',
  recent:   '🕐  Recently Researched',
  followup: '💡  AI Follow-up Angles',
  trending: '🔥  Trending Topics',
};

// ─── Floating Orb Component ───────────────────────────────────────────────────
// Pure Reanimated, no BlurView, no new libraries. Each orb drifts on a unique
// path using a combination of translateX/Y looping animations.

function FloatingOrb({
  size,
  color,
  x,
  y,
  driftX,
  driftY,
  duration,
  delay,
}: {
  size:     number;
  color:    string;
  x:        number;
  y:        number;
  driftX:   number;
  driftY:   number;
  duration: number;
  delay:    number;
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
function BreathingDot({ color = COLORS.accent }: { color?: string }) {
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
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: color },
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
        backgroundColor:   `${color}12`,
        borderRadius:      RADIUS.lg,
        paddingHorizontal: 12,
        paddingVertical:   8,
        borderWidth:       1,
        borderColor:       `${color}25`,
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

  const [query,            setQuery]            = useState('');
  const [isRecording,      setIsRecording]      = useState(false);
  const [recordingMs,      setRecordingMs]      = useState(0);
  const [transcribing,     setTranscribing]     = useState(false);
  const [cachedCount,      setCachedCount]      = useState(0);
  const [inputFocused,     setInputFocused]     = useState(false);
  const [placeholderIdx,   setPlaceholderIdx]   = useState(0);

  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  const {
    suggestions,
    isLoading:     suggestionsLoading,
    isPersonalized,
    refresh:       refreshSuggestions,
  } = usePersonalization();

  // ── Shared values ──────────────────────────────────────────────────────────
  const inputBorderGlow = useSharedValue(0);
  const micPulse        = useSharedValue(1);
  const placeholderOpacity = useSharedValue(1);

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

  const placeholderStyle = useAnimatedStyle(() => ({
    opacity: placeholderOpacity.value,
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

  // ── Input glow on focus ────────────────────────────────────────────────────
  useEffect(() => {
    inputBorderGlow.value = withSpring(inputFocused ? 1 : 0, {
      damping: 14, stiffness: 120,
    });
  }, [inputFocused]);

  const inputWrapStyle = useAnimatedStyle(() => ({
    borderColor:   `rgba(108, 99, 255, ${interpolate(inputBorderGlow.value, [0, 1], [0.18, 0.85])})`,
    shadowColor:   '#6C63FF',
    shadowOpacity: interpolate(inputBorderGlow.value, [0, 1], [0, 0.5]),
    shadowRadius:  interpolate(inputBorderGlow.value, [0, 1], [0, 20]),
    shadowOffset:  { width: 0, height: 0 },
    elevation:     interpolate(inputBorderGlow.value, [0, 1], [0, 12]),
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

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

      {/* ── Animated orb background ─────────────────────────────────────── */}
      <View style={{ ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' }}>
        {/* Purple orb — top left */}
        <FloatingOrb
          size={260} color="rgba(108,99,255,0.13)"
          x={-40} y={60} driftX={30} driftY={20}
          duration={7000} delay={0}
        />
        {/* Pink orb — top right */}
        <FloatingOrb
          size={200} color="rgba(255,101,132,0.10)"
          x={SCREEN_W + 20} y={180} driftX={-25} driftY={35}
          duration={9000} delay={800}
        />
        {/* Teal orb — lower mid */}
        <FloatingOrb
          size={180} color="rgba(67,233,123,0.08)"
          x={SCREEN_W * 0.55} y={500} driftX={20} driftY={-30}
          duration={11000} delay={400}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: TAB_H + SPACING.xl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
            {/* Top row: greeting + avatar */}
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
                      backgroundColor:   `${COLORS.primary}15`,
                      borderRadius:      RADIUS.full,
                      paddingHorizontal: 10, paddingVertical: 5,
                      borderWidth:       1, borderColor: `${COLORS.primary}30`,
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
                  <StatChip value={stats.totalPodcasts ?? 0} label="podcasts" icon="radio-outline" color="#A78BFA" delay={350} />
                )}
                {(stats.totalDebates ?? 0) > 0 && (
                  <StatChip value={stats.totalDebates ?? 0} label="debates" icon="people-outline" color="#FB7185"  delay={450} />
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
              colors={['#1E1B45', '#12122A']}
              style={{
                borderRadius: RADIUS.xl,
                padding:      SPACING.lg,
                borderWidth:  1,
                borderColor:  `${COLORS.primary}28`,
                overflow:     'hidden',
              }}
            >
              {/* Subtle top glow strip */}
              <LinearGradient
                colors={[`${COLORS.primary}50`, 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
              />

              {/* Card header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <LinearGradient
                    colors={['#6C63FF', '#8B5CF6']}
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
                    backgroundColor: `${COLORS.error}15`,
                    borderRadius:    RADIUS.md, padding: SPACING.sm,
                    marginBottom:    SPACING.sm,
                    flexDirection:   'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth:     1, borderColor: `${COLORS.error}30`,
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
                    backgroundColor: `${COLORS.primary}12`,
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
                <Ionicons name="search-outline" size={19} color={inputFocused ? COLORS.primary : COLORS.textMuted} />

                <View style={{ flex: 1, marginLeft: 10, position: 'relative' }}>
                  <TextInput
                    placeholder=""
                    placeholderTextColor="transparent"
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
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
                  {/* Animated placeholder */}
                  {query.length === 0 && !isRecording && (
                    <Animated.Text
                      style={[
                        {
                          position:  'absolute',
                          color:     COLORS.textMuted,
                          fontSize:  FONTS.sizes.sm,
                          top: Platform.OS === 'ios' ? 0 : 2,
                          pointerEvents: 'none',
                        },
                        placeholderStyle,
                      ]}
                      numberOfLines={1}
                    >
                      {PLACEHOLDERS[placeholderIdx]}
                    </Animated.Text>
                  )}
                </View>

                {/* Mic button */}
                <Animated.View style={micStyle}>
                  <TouchableOpacity
                    onPress={handleVoicePress}
                    style={{
                      width:           36, height: 36, borderRadius: 18,
                      backgroundColor: isRecording ? COLORS.error : `${COLORS.primary}22`,
                      alignItems:      'center', justifyContent: 'center', marginLeft: 6,
                      borderWidth:     1,
                      borderColor:     isRecording ? `${COLORS.error}60` : `${COLORS.primary}40`,
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
                    ? ['#6C63FF', '#8B5CF6']
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
                colors={['#1A1235', '#130D2E']}
                style={{
                  borderRadius: RADIUS.xl, overflow: 'hidden',
                  borderWidth: 1, borderColor: `${COLORS.primary}40`,
                }}
              >
                {/* Diagonal shimmer overlay */}
                <LinearGradient
                  colors={['transparent', `${COLORS.primary}08`, 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                {/* Top edge glow */}
                <LinearGradient
                  colors={[`${COLORS.primary}60`, 'transparent']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
                />

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  padding: SPACING.md, gap: SPACING.md,
                }}>
                  {/* Icon orb */}
                  <LinearGradient
                    colors={['#7C3AED', '#6C63FF']}
                    style={{
                      width: 50, height: 50, borderRadius: 15,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      borderWidth: 1, borderColor: `${COLORS.primary}50`,
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
                        backgroundColor: `${COLORS.primary}25`,
                        borderRadius:    RADIUS.full,
                        paddingHorizontal: 6, paddingVertical: 1,
                        borderWidth: 1, borderColor: `${COLORS.primary}40`,
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
                          backgroundColor: `${COLORS.primary}10`,
                          borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2,
                          borderWidth: 1, borderColor: `${COLORS.primary}20`,
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: 8, fontWeight: '600' }}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: `${COLORS.primary}18`,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: `${COLORS.primary}30`,
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
                      colors={[d.bg, `${d.color}08`]}
                      style={{
                        borderRadius:  RADIUS.lg, padding: SPACING.sm,
                        alignItems:    'center',
                        borderWidth:   1, borderColor: `${d.color}30`,
                        minHeight:     80, justifyContent: 'center',
                      }}
                    >
                      <View style={{
                        width: 34, height: 34, borderRadius: 10,
                        backgroundColor: `${d.color}20`,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: `${d.color}35`,
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
                      backgroundColor:   `${f.color}12`,
                      borderRadius:      RADIUS.lg,
                      paddingHorizontal: 14,
                      paddingVertical:   10,
                      marginRight:       SPACING.sm,
                      flexDirection:     'row',
                      alignItems:        'center',
                      gap:               7,
                      borderWidth:       1,
                      borderColor:       `${f.color}28`,
                    }}>
                      <View style={{
                        width: 26, height: 26, borderRadius: 8,
                        backgroundColor: `${f.color}20`,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={f.icon as any} size={14} color={f.color} />
                      </View>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                        {f.label}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={`${f.color}80`} />
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
                  backgroundColor:   `${COLORS.primary}12`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth:       1, borderColor: `${COLORS.primary}22`,
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
                  backgroundColor: `${COLORS.primary}08`,
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.sm,
                  marginBottom:    SPACING.md,
                  flexDirection:   'row',
                  alignItems:      'center',
                  gap:             8,
                  borderWidth:     1,
                  borderColor:     `${COLORS.primary}15`,
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