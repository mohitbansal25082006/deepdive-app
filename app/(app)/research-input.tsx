// app/(app)/research-input.tsx
// Part 43 — REDESIGNED UI to match "Deep Space Command Center" aesthetic.
//           Reads `depth` param from route and pre-selects the correct depth card.
//
// Fixes:
//   • useLocalSearchParams now reads both `query` AND `depth` params
//   • Initial state for `depth` initialised from the param (defaults to 'deep' if absent)
//   • All previous features (voice, credit gate, focus areas) preserved exactly
//
// ── Part 55.1A — THEME SYSTEM ─────────────────────────────────────────────────
//   • The depth options' colors are now resolved from the live palette via
//     getDepthOptions() (called each render), so Quick/Deep/Expert recolor with
//     the theme while keeping their distinct identities.
//   • All hardcoded chrome hexes (#12122A/#0F0F22 depth-card gradients,
//     rgba(10,10,26,0.97) launch bar, #1A1235/#0F0F22 hint card, #2A2A4A/#1A1A35
//     disabled gradient) now derive from COLORS via gradientCard / gradientDark /
//     hexWithAlpha().
//   • WORKLETS-SAFE: the focus-glow animated style read a hardcoded primary
//     before; it now snapshots COLORS.primary into rgb primitives OUTSIDE the
//     worklet and the worklet references only those numbers.
//
// ── ANDROID UI FIX (production) — unchanged from Part 43 ──────────────────────
//   The sticky bottom launch bar uses insets.bottom under SDK 54 edge-to-edge.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, Vibration, Platform,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withSpring,
  interpolate,
}                            from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme }          from '../../src/context/ThemeContext';
import { GradientButton }    from '../../src/components/common/GradientButton';
import { CreditBalance }     from '../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal } from '../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }     from '../../src/hooks/useCreditGate';
import { useCredits }        from '../../src/context/CreditsContext';
import {
  researchDepthToFeature,
  FEATURE_COSTS,
}                            from '../../src/constants/credits';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ResearchDepth }     from '../../src/types';
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, formatDuration,
}                            from '../../src/services/voiceResearch';

// ─── Theme color helpers ──────────────────────────────────────────────────────
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
function parseRGB(hex: string): { r: number; g: number; b: number } {
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

// ─── Depth options (Part 55.1A: colors resolved from the palette each render) ──

function getDepthOptions(): {
  key:        ResearchDepth;
  label:      string;
  desc:       string;
  icon:       string;
  time:       string;
  searches:   string;
  color:      string;
  gradColors: [string, string];
  creditCost: number;
}[] {
  return [
    {
      key:        'quick',
      label:      'Quick Scan',
      desc:       'Surface-level overview with key facts',
      icon:       'flash-outline',
      time:       '2–3 min',
      searches:   '4 searches',
      color:      COLORS.info,
      gradColors: [hexWithAlpha(COLORS.info, 0.13), hexWithAlpha(COLORS.info, 0.03)],
      creditCost: FEATURE_COSTS.research_quick,
    },
    {
      key:        'deep',
      label:      'Deep Dive',
      desc:       'Comprehensive analysis with statistics',
      icon:       'analytics-outline',
      time:       '5–7 min',
      searches:   '8 searches',
      color:      COLORS.primary,
      gradColors: [hexWithAlpha(COLORS.primary, 0.13), hexWithAlpha(COLORS.primary, 0.03)],
      creditCost: FEATURE_COSTS.research_deep,
    },
    {
      key:        'expert',
      label:      'Expert Mode',
      desc:       'Exhaustive research with full citations',
      icon:       'trophy-outline',
      time:       '10–12 min',
      searches:   '12 searches',
      color:      COLORS.warning,
      gradColors: [hexWithAlpha(COLORS.warning, 0.13), hexWithAlpha(COLORS.warning, 0.03)],
      creditCost: FEATURE_COSTS.research_expert,
    },
  ];
}

const FOCUS_OPTIONS = [
  'Market Size & Revenue', 'Key Companies', 'Technology Details',
  'Investment Trends', 'Future Predictions', 'Risks & Challenges',
  'Geographic Analysis', 'Recent News',
];

// ─── Animated chip ─────────────────────────────────────────────────────────────
function FocusChip({
  area, selected, onPress,
}: { area: string; selected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={chipStyle}>
      <TouchableOpacity
        onPress={() => {
          scale.value = withSequence(
            withTiming(0.93, { duration: 80 }),
            withSpring(1, { damping: 10, stiffness: 200 }),
          );
          onPress();
        }}
        activeOpacity={1}
      >
        <LinearGradient
          colors={selected
            ? [hexWithAlpha(COLORS.primary, 0.19), hexWithAlpha(COLORS.primary, 0.09)]
            : ['transparent', 'transparent']
          }
          style={{
            borderRadius:      RADIUS.full,
            paddingHorizontal: 14,
            paddingVertical:   8,
            borderWidth:       1,
            borderColor:       selected ? COLORS.primary : COLORS.border,
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
          }}
        >
          {selected && (
            <View style={{
              width: 14, height: 14, borderRadius: 7,
              backgroundColor: COLORS.primary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={9} color="#FFF" />
            </View>
          )}
          <Text style={{
            color:      selected ? COLORS.primary : COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            fontWeight: selected ? '700' : '400',
          }}>
            {area}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Breathing mic dot ─────────────────────────────────────────────────────────
function RecordingDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 600 }),
        withTiming(1.0, { duration: 600 }),
      ),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error }, style]}
    />
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ResearchInputScreen() {
  // ── Part 43 FIX: read BOTH query AND depth from route params ──────────────
  const params = useLocalSearchParams<{ query?: string; depth?: string }>();
  const insets = useSafeAreaInsets();
  // Part 55.1A: re-render on theme change.
  useTheme();

  // Validate the depth param — must be one of the three valid values
  const initialDepth: ResearchDepth =
    (params.depth === 'quick' || params.depth === 'expert')
      ? params.depth
      : 'deep';

  const [query,      setQuery]      = useState(params.query ?? '');
  const [depth,      setDepth]      = useState<ResearchDepth>(initialDepth);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [starting,   setStarting]   = useState(false);

  const [isRecording,      setIsRecording]      = useState(false);
  const [recordingMs,      setRecordingMs]      = useState(0);
  const [transcribing,     setTranscribing]     = useState(false);
  const [voiceTranscribed, setVoiceTranscribed] = useState(false);

  const { balance } = useCredits();
  const { guardedConsume, insufficientInfo, clearInsufficient, isConsuming } = useCreditGate();

  // Resolve theme-driven depth data each render.
  const DEPTH_OPTIONS = getDepthOptions();

  // Worklet-safe primary rgb snapshot.
  const prgb = parseRGB(COLORS.primary);
  const pr = prgb.r, pg = prgb.g, pb = prgb.b;
  const primaryHex = COLORS.primary;

  // ── Shared values ──────────────────────────────────────────────────────────
  const micScale      = useSharedValue(1);
  const inputFocused  = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      micScale.value = withRepeat(
        withSequence(withTiming(1.2, { duration: 500 }), withTiming(1.0, { duration: 500 })),
        -1, false,
      );
    } else {
      micScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);

  const micAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }] }));

  // Part 55.1A WORKLETS-SAFE: only primitive numbers / the primary hex snapshot
  // are referenced inside the worklet — never the COLORS object.
  const inputWrapStyle = useAnimatedStyle(() => ({
    borderColor:   `rgba(${pr},${pg},${pb},${interpolate(inputFocused.value, [0, 1], [0.25, 0.85])})`,
    shadowColor:   primaryHex,
    shadowOpacity: interpolate(inputFocused.value, [0, 1], [0, 0.35]),
    shadowRadius:  interpolate(inputFocused.value, [0, 1], [0, 16]),
    elevation:     interpolate(inputFocused.value, [0, 1], [0, 8]),
  }));

  const toggleFocus = (area: string) =>
    setFocusAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area],
    );

  const selectedDepthOpt = DEPTH_OPTIONS.find(o => o.key === depth)!;
  const totalCreditCost  = selectedDepthOpt.creditCost;

  // ── Voice handlers ─────────────────────────────────────────────────────────
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
          if (text) { setQuery(text); setVoiceTranscribed(true); Vibration.vibrate(60); }
          else Alert.alert('No Speech Detected', 'Please try speaking more clearly.');
        }
      } catch {
        Alert.alert('Transcription Error', 'Could not transcribe. Please type your query instead.');
      } finally { setTranscribing(false); }
    } else {
      setVoiceTranscribed(false);
      const started = await startRecording(ms => setRecordingMs(ms));
      if (started) { setIsRecording(true); Vibration.vibrate(40); }
      else Alert.alert('Microphone Permission', 'Please grant microphone access in Settings.');
    }
  };

  const handleVoiceCancel = () => {
    cancelRecording();
    setIsRecording(false);
    setRecordingMs(0);
  };

  // ── Launch ─────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!query.trim()) { Alert.alert('Query Required', 'Please enter a research topic.'); return; }
    if (isRecording) { handleVoiceCancel(); return; }

    const ok = await guardedConsume(researchDepthToFeature(depth));
    if (!ok) return;

    setStarting(true);
    router.replace({
      pathname: '/(app)/research-progress' as any,
      params: {
        query:         query.trim(),
        depth,
        focusAreas:    focusAreas.join('||'),
        researchMode:  'standard',
        citationStyle: 'apa',
      },
    });
  };

  const LAUNCH_BAR_H = 140;

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(350)}
          style={{
            flexDirection:  'row',
            alignItems:     'center',
            paddingHorizontal: SPACING.xl,
            paddingVertical:   SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: hexWithAlpha(COLORS.primary, 0.09),
          }}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.md,
              borderWidth: 1, borderColor: COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            {/* Breadcrumb */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Research</Text>
              <Ionicons name="chevron-forward" size={10} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                Configure
              </Text>
            </View>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', letterSpacing: -0.3,
            }}>
              Configure Research
            </Text>
          </View>

          <CreditBalance balance={balance} size="sm" />
        </Animated.View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.lg,
            paddingBottom:     LAUNCH_BAR_H + insets.bottom + SPACING.md,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >

          {/* ── Research Topic ──────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(40).damping(15).stiffness(100)}
            style={{ marginBottom: SPACING.lg }}
          >
            {/* Section label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: COLORS.primary }} />
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                  letterSpacing: 1.2, textTransform: 'uppercase',
                }}>
                  Research Topic
                </Text>
              </View>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: hexWithAlpha(COLORS.primary, 0.07), borderRadius: RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.15),
              }}>
                <Ionicons name="mic-outline" size={11} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '600' }}>Voice Input</Text>
              </View>
            </View>

            {/* Recording banner */}
            {isRecording && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  backgroundColor: hexWithAlpha(COLORS.error, 0.07), borderRadius: RADIUS.lg,
                  padding: SPACING.md, marginBottom: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderColor: hexWithAlpha(COLORS.error, 0.21),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <RecordingDot />
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                    Recording  {formatDuration(recordingMs)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleVoiceCancel}
                  style={{
                    backgroundColor: hexWithAlpha(COLORS.error, 0.13), borderRadius: RADIUS.sm,
                    paddingHorizontal: 10, paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Transcribing banner */}
            {transcribing && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  backgroundColor: hexWithAlpha(COLORS.primary, 0.07), borderRadius: RADIUS.lg,
                  padding: SPACING.md, marginBottom: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.15),
                }}
              >
                <Ionicons name="mic" size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                  Transcribing your voice…
                </Text>
              </Animated.View>
            )}

            {/* Transcribed success */}
            {voiceTranscribed && !isRecording && !transcribing && query.trim() && (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={{
                  backgroundColor: hexWithAlpha(COLORS.success, 0.03), borderRadius: RADIUS.lg,
                  padding: SPACING.sm, marginBottom: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderColor: hexWithAlpha(COLORS.success, 0.13),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    Transcribed — edit if needed
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setQuery(''); setVoiceTranscribed(false); }}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Text input */}
            <Animated.View style={[{ borderRadius: RADIUS.lg, borderWidth: 1.5, overflow: 'hidden' }, inputWrapStyle]}>
              <View style={{ backgroundColor: COLORS.backgroundElevated }}>
                <TextInput
                  value={query}
                  onChangeText={t => { setQuery(t); if (voiceTranscribed) setVoiceTranscribed(false); }}
                  onFocus={() => { inputFocused.value = withSpring(1, { damping: 14, stiffness: 120 }); }}
                  onBlur={() => { inputFocused.value = withSpring(0, { damping: 14, stiffness: 120 }); }}
                  placeholder={
                    isRecording  ? 'Listening…'     :
                    transcribing ? 'Transcribing…'  :
                    'Enter your research question or tap the mic…'
                  }
                  placeholderTextColor={COLORS.textMuted}
                  style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
                    lineHeight: 24, minHeight: 64,
                    padding: SPACING.md, paddingBottom: 56,
                  }}
                  multiline
                  autoFocus={!isRecording && !params.depth}
                  editable={!isRecording && !transcribing}
                />

                {/* Bottom toolbar */}
                <View style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: SPACING.md, paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: isRecording ? hexWithAlpha(COLORS.error, 0.15) : hexWithAlpha(COLORS.primary, 0.09),
                  backgroundColor: hexWithAlpha(COLORS.backgroundCard, 0.8),
                }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {isRecording  ? 'Tap ⏹ to finish speaking'  :
                     transcribing ? 'Processing audio…'          :
                     '🎙 Tap mic to speak your query'}
                  </Text>
                  <Animated.View style={micAnimStyle}>
                    <TouchableOpacity onPress={handleVoicePress} disabled={transcribing} activeOpacity={0.82}>
                      <LinearGradient
                        colors={
                          isRecording  ? [COLORS.error, hexWithAlpha(COLORS.error, 0.8)]    :
                          transcribing ? ['#555', '#444']                                    :
                          (COLORS.gradientPrimary as [string, string])
                        }
                        style={{
                          width: 38, height: 38, borderRadius: 19,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={isRecording ? 'stop' : transcribing ? 'hourglass-outline' : 'mic'}
                          size={17} color="#FFF"
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            </Animated.View>
          </Animated.View>

          {/* ── Research Depth ──────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(120).damping(15).stiffness(100)}
            style={{ marginBottom: SPACING.lg }}
          >
            {/* Section label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
              <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: selectedDepthOpt.color }} />
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                letterSpacing: 1.2, textTransform: 'uppercase',
              }}>
                Research Depth
              </Text>
            </View>

            {DEPTH_OPTIONS.map((opt, idx) => {
              const isSelected = depth === opt.key;
              return (
                <Animated.View
                  key={opt.key}
                  entering={FadeInLeft.springify().delay(140 + idx * 60).damping(14).stiffness(110)}
                >
                  <TouchableOpacity
                    onPress={() => setDepth(opt.key)}
                    activeOpacity={0.82}
                    style={{ marginBottom: SPACING.sm }}
                  >
                    <LinearGradient
                      colors={isSelected ? opt.gradColors : (COLORS.gradientCard as [string, string])}
                      style={{
                        borderRadius:  RADIUS.lg,
                        padding:       SPACING.md,
                        borderWidth:   isSelected ? 1.5 : 1,
                        borderColor:   isSelected ? opt.color : COLORS.border,
                        flexDirection: 'row',
                        alignItems:    'center',
                        gap:           SPACING.md,
                      }}
                    >
                      {/* Icon orb */}
                      <LinearGradient
                        colors={isSelected
                          ? [hexWithAlpha(opt.color, 0.25), hexWithAlpha(opt.color, 0.13)]
                          : [COLORS.backgroundElevated, COLORS.backgroundElevated]
                        }
                        style={{
                          width: 48, height: 48, borderRadius: 14,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: isSelected ? hexWithAlpha(opt.color, 0.38) : COLORS.border,
                          flexShrink: 0,
                        }}
                      >
                        <Ionicons
                          name={opt.icon as any}
                          size={22}
                          color={isSelected ? opt.color : COLORS.textMuted}
                        />
                      </LinearGradient>

                      {/* Labels */}
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          color:      isSelected ? COLORS.textPrimary : COLORS.textSecondary,
                          fontSize:   FONTS.sizes.base,
                          fontWeight: '700',
                          marginBottom: 3,
                        }}>
                          {opt.label}
                        </Text>
                        <Text style={{
                          color:    COLORS.textMuted,
                          fontSize: FONTS.sizes.xs,
                          lineHeight: 16,
                        }}>
                          {opt.desc}
                        </Text>
                      </View>

                      {/* Meta + credit cost */}
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Text style={{
                          color:      isSelected ? opt.color : COLORS.textMuted,
                          fontSize:   FONTS.sizes.xs,
                          fontWeight: '600',
                        }}>
                          {opt.time}
                        </Text>
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 3,
                          backgroundColor: isSelected ? hexWithAlpha(opt.color, 0.13) : hexWithAlpha(COLORS.primary, 0.06),
                          borderRadius:    RADIUS.full,
                          paddingHorizontal: 8, paddingVertical: 3,
                          borderWidth: 1,
                          borderColor: isSelected ? hexWithAlpha(opt.color, 0.25) : hexWithAlpha(COLORS.primary, 0.13),
                        }}>
                          <Ionicons name="flash" size={9} color={isSelected ? opt.color : COLORS.primary} />
                          <Text style={{
                            color:      isSelected ? opt.color : COLORS.primary,
                            fontSize:   9,
                            fontWeight: '800',
                          }}>
                            {opt.creditCost} cr
                          </Text>
                        </View>
                      </View>

                      {/* Selected checkmark */}
                      {isSelected && (
                        <View style={{
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: opt.color,
                          alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Ionicons name="checkmark" size={14} color="#FFF" />
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </Animated.View>

          {/* ── Focus Areas ──────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(200).damping(15).stiffness(100)}
            style={{ marginBottom: SPACING.lg }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: COLORS.accent }} />
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                letterSpacing: 1.2, textTransform: 'uppercase',
              }}>
                Focus Areas
              </Text>
              {focusAreas.length > 0 && (
                <View style={{
                  backgroundColor: hexWithAlpha(COLORS.primary, 0.13), borderRadius: RADIUS.full,
                  paddingHorizontal: 7, paddingVertical: 1,
                  borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.21),
                }}>
                  <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '800' }}>
                    {focusAreas.length} selected
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
              Optional — select specific areas to emphasize in your report
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FOCUS_OPTIONS.map(area => (
                <FocusChip
                  key={area}
                  area={area}
                  selected={focusAreas.includes(area)}
                  onPress={() => toggleFocus(area)}
                />
              ))}
            </View>
          </Animated.View>

          {/* ── Academic paper hint ──────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.springify().delay(260).damping(15).stiffness(100)}
          >
            <LinearGradient
              colors={COLORS.gradientCard as [string, string]}
              style={{
                borderRadius: RADIUS.lg, padding: SPACING.md,
                borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.13),
                flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
                overflow: 'hidden',
              }}
            >
              {/* Top glow */}
              <LinearGradient
                colors={[hexWithAlpha(COLORS.primary, 0.19), 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1 }}
              />

              {/* Icon orb */}
              <View style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: hexWithAlpha(COLORS.primary, 0.09),
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: hexWithAlpha(COLORS.primary, 0.19),
                flexShrink: 0, marginTop: 1,
              }}>
                <Ionicons name="school-outline" size={18} color={COLORS.primary} />
              </View>

              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Academic Paper — available after report. </Text>
                Once your report is complete, tap the 🎓 button inside to generate
                a full academic paper for {FEATURE_COSTS.academic_paper} credits.
              </Text>
            </LinearGradient>
          </Animated.View>

        </ScrollView>

        {/* ── Launch Button ───────────────────────────────────────────────── */}
        <View style={{
          position:        'absolute',
          bottom:          0, left: 0, right: 0,
          paddingHorizontal: SPACING.xl,
          paddingTop:      SPACING.md,
          paddingBottom:   Math.max(insets.bottom, SPACING.md),
          backgroundColor: hexWithAlpha(COLORS.background, 0.97),
          borderTopWidth:  1,
          borderTopColor:  hexWithAlpha(selectedDepthOpt.color, 0.13),
        }}>
          {/* Credit summary row */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: SPACING.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 6,
                backgroundColor: hexWithAlpha(selectedDepthOpt.color, 0.13),
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: hexWithAlpha(selectedDepthOpt.color, 0.21),
              }}>
                <Ionicons name="flash" size={11} color={selectedDepthOpt.color} />
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {'Will use '}
                <Text style={{ color: selectedDepthOpt.color, fontWeight: '800' }}>
                  {totalCreditCost} credits
                </Text>
                {' for '}
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>
                  {selectedDepthOpt.label}
                </Text>
              </Text>
            </View>
            <CreditBalance balance={balance} size="sm" />
          </View>

          {/* Launch button — gradient matches depth color */}
          <TouchableOpacity
            onPress={handleStart}
            disabled={(!query.trim() && !isRecording) || transcribing || starting || isConsuming}
            activeOpacity={0.84}
          >
            <LinearGradient
              colors={
                (!query.trim() && !isRecording) || transcribing
                  ? ['#2A2A4A', '#1A1A35']
                  : [selectedDepthOpt.color, hexWithAlpha(selectedDepthOpt.color, 0.8)]
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                borderRadius:   RADIUS.lg, paddingVertical: 15,
                alignItems:     'center', flexDirection: 'row',
                justifyContent: 'center', gap: 10,
              }}
            >
              {(starting || transcribing || isConsuming) ? (
                <>
                  <Ionicons name="hourglass-outline" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {isConsuming ? 'Checking credits…' : 'Launching…'}
                  </Text>
                </>
              ) : isRecording ? (
                <>
                  <Ionicons name="stop" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    Stop Recording First
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="rocket-outline" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800', letterSpacing: 0.2 }}>
                    Launch {selectedDepthOpt.label}
                  </Text>
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full,
                    paddingHorizontal: 8, paddingVertical: 3,
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                  }}>
                    <Ionicons name="flash" size={10} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
                      {totalCreditCost} cr
                    </Text>
                  </View>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <InsufficientCreditsModal
          visible={!!insufficientInfo}
          info={insufficientInfo}
          onClose={clearInsufficient}
        />

      </SafeAreaView>
    </View>
  );
}