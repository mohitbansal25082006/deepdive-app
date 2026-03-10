// app/(app)/research-input.tsx
// Research configuration screen (modal).
// Users refine their query, choose depth, add focus areas,
// and can use voice input (Whisper) before starting the pipeline.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { GradientButton } from '../../src/components/common/GradientButton';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ResearchDepth } from '../../src/types';
import { useResearch } from '../../src/hooks/useResearch';
import {
  startRecording,
  stopRecording,
  cancelRecording,
  transcribeAudio,
  formatDuration,
} from '../../src/services/voiceResearch';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_OPTIONS: {
  key: ResearchDepth;
  label: string;
  desc: string;
  icon: string;
  time: string;
  searches: string;
  color: string;
}[] = [
  {
    key: 'quick',
    label: 'Quick Scan',
    desc: 'Surface-level overview with key facts',
    icon: 'flash-outline',
    time: '2–3 min',
    searches: '4 searches',
    color: COLORS.info,
  },
  {
    key: 'deep',
    label: 'Deep Dive',
    desc: 'Comprehensive analysis with statistics',
    icon: 'analytics-outline',
    time: '5–7 min',
    searches: '8 searches',
    color: COLORS.primary,
  },
  {
    key: 'expert',
    label: 'Expert Mode',
    desc: 'Exhaustive research with full citations',
    icon: 'trophy-outline',
    time: '10–12 min',
    searches: '12 searches',
    color: COLORS.warning,
  },
];

const FOCUS_OPTIONS = [
  'Market Size & Revenue',
  'Key Companies',
  'Technology Details',
  'Investment Trends',
  'Future Predictions',
  'Risks & Challenges',
  'Geographic Analysis',
  'Recent News',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResearchInputScreen() {
  const params = useLocalSearchParams<{ query: string }>();
  const { startResearch } = useResearch();

  const [query, setQuery] = useState(params.query ?? '');
  const [depth, setDepth] = useState<ResearchDepth>('deep');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  // ── Voice state ──────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceTranscribed, setVoiceTranscribed] = useState(false);

  const micScale = useSharedValue(1);
  const micGlow  = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      micScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500 }),
          withTiming(1.0, { duration: 500 }),
        ),
        -1,
        false,
      );
      micGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 650 }),
          withTiming(0.2, { duration: 650 }),
        ),
        -1,
        false,
      );
    } else {
      micScale.value = withTiming(1, { duration: 200 });
      micGlow.value  = withTiming(0, { duration: 200 });
    }
  }, [isRecording]);

  const micAnimStyle  = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }] }));
  const glowAnimStyle = useAnimatedStyle(() => ({ opacity: micGlow.value }));

  // ── Helpers ──────────────────────────────────────────────────────────────

  const toggleFocus = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  // ── Voice handlers ───────────────────────────────────────────────────────

  const handleVoicePress = async () => {
    if (transcribing) return;

    if (isRecording) {
      // ── Stop → transcribe ──────────────────────────────────────────
      setIsRecording(false);
      setRecordingMs(0);
      setTranscribing(true);
      try {
        const uri = await stopRecording();
        if (uri) {
          const text = await transcribeAudio(uri);
          if (text) {
            setQuery(text);
            setVoiceTranscribed(true);
            Vibration.vibrate(60);
          } else {
            Alert.alert('No Speech Detected', 'Please try speaking more clearly.');
          }
        }
      } catch {
        Alert.alert(
          'Transcription Error',
          'Could not transcribe. Please type your query instead.',
        );
      } finally {
        setTranscribing(false);
      }
    } else {
      // ── Start recording ────────────────────────────────────────────
      setVoiceTranscribed(false);
      const started = await startRecording((ms) => setRecordingMs(ms));
      if (started) {
        setIsRecording(true);
        Vibration.vibrate(40);
      } else {
        Alert.alert(
          'Microphone Permission',
          'Please grant microphone access in Settings to use voice input.',
        );
      }
    }
  };

  const handleVoiceCancel = () => {
    cancelRecording();
    setIsRecording(false);
    setRecordingMs(0);
  };

  // ── Launch ────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!query.trim()) {
      Alert.alert('Query Required', 'Please enter a research topic.');
      return;
    }
    if (isRecording) {
      handleVoiceCancel();
      return;
    }

    setStarting(true);
    router.replace({
      pathname: '/(app)/research-progress' as any,
      params: {
        query: query.trim(),
        depth,
        focusAreas: focusAreas.join('||'),
      },
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[COLORS.backgroundCard, COLORS.background]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.xl,
            paddingBottom: SPACING.md,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.md,
            }}
          >
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Configure Research
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              Type or speak your research topic
            </Text>
          </View>
        </Animated.View>

        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Research Topic ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>

            {/* Row: label + voice badge */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: SPACING.sm,
            }}>
              <Text style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '600',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>
                Research Topic
              </Text>

              {/* Voice-ready badge */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${COLORS.primary}15`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 10, paddingVertical: 4,
                borderWidth: 1, borderColor: `${COLORS.primary}25`,
              }}>
                <Ionicons name="mic-outline" size={12} color={COLORS.primary} />
                <Text style={{
                  color: COLORS.primary,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: '600',
                }}>
                  Voice Input
                </Text>
              </View>
            </View>

            {/* Recording banner */}
            {isRecording && (
              <Animated.View
                entering={FadeIn.duration(250)}
                style={{
                  backgroundColor: `${COLORS.error}12`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  marginBottom: SPACING.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: `${COLORS.error}35`,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Animated.View style={[
                    { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error },
                    glowAnimStyle,
                  ]} />
                  <Text style={{
                    color: COLORS.error,
                    fontSize: FONTS.sizes.sm,
                    fontWeight: '700',
                  }}>
                    Recording  {formatDuration(recordingMs)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleVoiceCancel}
                  style={{
                    backgroundColor: `${COLORS.error}20`,
                    borderRadius: RADIUS.sm,
                    paddingHorizontal: 10, paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Transcribing banner */}
            {transcribing && (
              <Animated.View
                entering={FadeIn.duration(250)}
                style={{
                  backgroundColor: `${COLORS.primary}12`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  marginBottom: SPACING.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderWidth: 1,
                  borderColor: `${COLORS.primary}25`,
                }}
              >
                <Ionicons name="mic" size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                  Transcribing your voice...
                </Text>
              </Animated.View>
            )}

            {/* Success banner */}
            {voiceTranscribed && !isRecording && !transcribing && query.trim() && (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={{
                  backgroundColor: `${COLORS.success}10`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.sm,
                  marginBottom: SPACING.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: `${COLORS.success}25`,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    Transcribed — edit if needed
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setQuery(''); setVoiceTranscribed(false); }}
                >
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Text input card with embedded mic button */}
            <View style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              borderWidth: 1.5,
              borderColor: isRecording
                ? COLORS.error
                : voiceTranscribed
                ? COLORS.success
                : COLORS.borderFocus,
              marginBottom: SPACING.sm,
              overflow: 'hidden',
            }}>
              <TextInput
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  if (voiceTranscribed) setVoiceTranscribed(false);
                }}
                placeholder={
                  isRecording
                    ? 'Listening...'
                    : transcribing
                    ? 'Transcribing...'
                    : 'Enter your research question or tap the mic...'
                }
                placeholderTextColor={COLORS.textMuted}
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  lineHeight: 24,
                  minHeight: 60,
                  padding: SPACING.md,
                  paddingBottom: 52,   // make room for mic bar
                }}
                multiline
                autoFocus={!isRecording}
                editable={!isRecording && !transcribing}
              />

              {/* Mic bar — pinned to bottom of input card */}
              <View style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: SPACING.md,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderTopColor: isRecording
                  ? `${COLORS.error}30`
                  : COLORS.border,
                backgroundColor: isRecording
                  ? `${COLORS.error}08`
                  : `${COLORS.backgroundCard}DD`,
              }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {isRecording
                    ? 'Tap ⏹ to finish speaking'
                    : transcribing
                    ? 'Processing audio...'
                    : 'Tap 🎙 to speak your query'}
                </Text>

                {/* Animated glow ring */}
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {isRecording && (
                    <Animated.View style={[{
                      position: 'absolute',
                      width: 52, height: 52,
                      borderRadius: 26,
                      backgroundColor: `${COLORS.error}20`,
                    }, glowAnimStyle]} />
                  )}

                  <Animated.View style={micAnimStyle}>
                    <TouchableOpacity
                      onPress={handleVoicePress}
                      disabled={transcribing}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          isRecording
                            ? [COLORS.error, '#CC0000']
                            : transcribing
                            ? [COLORS.textMuted, COLORS.textMuted]
                            : COLORS.gradientPrimary
                        }
                        style={{
                          width: 38, height: 38,
                          borderRadius: 19,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={
                            isRecording
                              ? 'stop'
                              : transcribing
                              ? 'hourglass-outline'
                              : 'mic'
                          }
                          size={17}
                          color="#FFF"
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            </View>

            {/* Hint text — shown only when input is empty */}
            {!isRecording && !transcribing && !query && (
              <View style={{
                backgroundColor: `${COLORS.primary}08`,
                borderRadius: RADIUS.md,
                padding: SPACING.sm,
                marginBottom: SPACING.md,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                borderWidth: 1,
                borderColor: `${COLORS.primary}15`,
              }}>
                <Ionicons
                  name="bulb-outline"
                  size={14}
                  color={COLORS.primary}
                  style={{ marginTop: 1 }}
                />
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  lineHeight: 18,
                  flex: 1,
                }}>
                  Try: <Text style={{ color: COLORS.primary }}>
                    "Impact of generative AI on software engineering jobs in 2025"
                  </Text>
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── Research Depth ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: SPACING.sm,
            }}>
              Research Depth
            </Text>

            {DEPTH_OPTIONS.map((opt) => {
              const isSelected = depth === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setDepth(opt.key)}
                  style={{
                    backgroundColor: isSelected
                      ? `${opt.color}15`
                      : COLORS.backgroundCard,
                    borderRadius: RADIUS.lg,
                    padding: SPACING.md,
                    marginBottom: SPACING.sm,
                    borderWidth: 1.5,
                    borderColor: isSelected ? opt.color : COLORS.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  activeOpacity={0.75}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: isSelected ? `${opt.color}25` : COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: SPACING.md,
                  }}>
                    <Ionicons
                      name={opt.icon as any}
                      size={22}
                      color={isSelected ? opt.color : COLORS.textMuted}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: isSelected ? COLORS.textPrimary : COLORS.textSecondary,
                      fontSize: FONTS.sizes.base,
                      fontWeight: '700',
                    }}>
                      {opt.label}
                    </Text>
                    <Text style={{
                      color: COLORS.textMuted,
                      fontSize: FONTS.sizes.xs,
                      marginTop: 2,
                    }}>
                      {opt.desc}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      color: isSelected ? opt.color : COLORS.textMuted,
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '600',
                    }}>
                      {opt.time}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {opt.searches}
                    </Text>
                  </View>

                  {isSelected && (
                    <View style={{
                      marginLeft: SPACING.sm,
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: opt.color,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* ── Focus Areas ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: 4,
              marginTop: SPACING.md,
            }}>
              Focus Areas
            </Text>
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginBottom: SPACING.sm,
            }}>
              Optional: select specific areas to emphasize
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FOCUS_OPTIONS.map((area) => {
                const isSelected = focusAreas.includes(area);
                return (
                  <TouchableOpacity
                    key={area}
                    onPress={() => toggleFocus(area)}
                    style={{
                      backgroundColor: isSelected
                        ? `${COLORS.primary}20`
                        : COLORS.backgroundCard,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: isSelected ? COLORS.primary : COLORS.border,
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={{
                      color: isSelected ? COLORS.primary : COLORS.textSecondary,
                      fontSize: FONTS.sizes.sm,
                      fontWeight: isSelected ? '600' : '400',
                    }}>
                      {isSelected ? '✓ ' : ''}{area}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>

        {/* ── Launch button ─────────────────────────────────────────────── */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: SPACING.xl,
          backgroundColor: 'rgba(10,10,26,0.95)',
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        }}>
          <GradientButton
            title={isRecording ? '⏹  Stop Recording First' : 'Launch Research Agent 🚀'}
            onPress={handleStart}
            loading={starting || transcribing}
            disabled={(!query.trim() && !isRecording) || transcribing}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}