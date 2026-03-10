// app/(app)/(tabs)/home.tsx
// Part 3 update: adds voice research input + offline cache indicator

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Keyboard, Alert, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useAnimatedStyle, useSharedValue, withSpring, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { Avatar } from '../../../src/components/common/Avatar';
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, formatDuration,
} from '../../../src/services/voiceResearch';
import { getCachedReportsList } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const SUGGESTED_TOPICS = [
  { label: 'Future of AI in Healthcare', icon: 'medical', gradient: ['#6C63FF', '#8B5CF6'] as const, tag: 'Healthcare' },
  { label: 'Quantum Computing Startups 2025', icon: 'flash', gradient: ['#FF6584', '#FF8E53'] as const, tag: 'Technology' },
  { label: 'Electric Vehicle Market Trends', icon: 'car-sport', gradient: ['#43E97B', '#38F9D7'] as const, tag: 'Automotive' },
  { label: 'Generative AI Impact on Jobs', icon: 'people', gradient: ['#F093FB', '#F5576C'] as const, tag: 'AI & Work' },
  { label: 'Climate Tech Investment 2025', icon: 'leaf', gradient: ['#4FACFE', '#00F2FE'] as const, tag: 'Climate' },
  { label: 'Space Economy & Commercial Launch', icon: 'rocket', gradient: ['#FA709A', '#FEE140'] as const, tag: 'Space' },
];

const DEPTH_INFO = [
  { key: 'quick', label: 'Quick', desc: '2–3 min', icon: 'flash-outline' },
  { key: 'deep', label: 'Deep', desc: '5–7 min', icon: 'analytics-outline' },
  { key: 'expert', label: 'Expert', desc: '10–12 min', icon: 'trophy-outline' },
];

export default function HomeScreen() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [cachedCount, setCachedCount] = useState(0);
  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  const inputScale = useSharedValue(1);
  const micScale = useSharedValue(1);
  const micPulse = useSharedValue(1);

  useEffect(() => {
    getCachedReportsList().then((list) => setCachedCount(list.length));
  }, []);

  useEffect(() => {
    if (isRecording) {
      micPulse.value = withRepeat(
        withSequence(withTiming(1.2, { duration: 600 }), withTiming(1.0, { duration: 600 })),
        -1, false
      );
    } else {
      micPulse.value = withTiming(1);
    }
  }, [isRecording]);

  const inputStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inputScale.value }],
  }));
  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    Keyboard.dismiss();
    router.push({ pathname: '/(app)/research-input' as any, params: { query: q.trim() } });
  };

  const handleVoicePress = async () => {
    if (transcribing) return;
    if (isRecording) {
      // Stop and transcribe
      setIsRecording(false);
      setRecordingMs(0);
      setTranscribing(true);
      try {
        const uri = await stopRecording();
        if (uri) {
          const text = await transcribeAudio(uri);
          if (text) {
            setQuery(text);
            Vibration.vibrate(50);
          }
        }
      } catch (err) {
        Alert.alert('Transcription Error', 'Could not transcribe audio. Please type your query.');
      } finally {
        setTranscribing(false);
      }
    } else {
      // Start recording
      const started = await startRecording((ms) => setRecordingMs(ms));
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
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl }}
          >
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>{getGreeting()}</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
                {firstName} 👋
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              {cachedCount > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/(app)/(tabs)/history' as any)}
                  style={{
                    backgroundColor: `${COLORS.info}15`,
                    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: `${COLORS.info}30`,
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}
                >
                  <Ionicons name="cloud-offline-outline" size={14} color={COLORS.info} />
                  <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    {cachedCount}
                  </Text>
                </TouchableOpacity>
              )}
              <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
            </View>
          </Animated.View>

          {/* Hero search card */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl, padding: SPACING.lg,
                marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.primary}30`,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
                >
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '700' }}>
                  AI Research Engine
                </Text>
              </View>

              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md, lineHeight: 20 }}>
                Ask anything. Our multi-agent system searches, analyses, fact-checks, and generates a comprehensive report.
              </Text>

              {/* Voice recording indicator */}
              {isRecording && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{
                    backgroundColor: `${COLORS.error}15`,
                    borderRadius: RADIUS.lg, padding: SPACING.sm,
                    marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth: 1, borderColor: `${COLORS.error}30`,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error }} />
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                      Recording... {formatDuration(recordingMs)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleVoiceCancel}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Cancel</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {transcribing && (
                <View style={{
                  backgroundColor: `${COLORS.primary}15`,
                  borderRadius: RADIUS.lg, padding: SPACING.sm, marginBottom: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                }}>
                  <Ionicons name="mic" size={14} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm }}>Transcribing audio...</Text>
                </View>
              )}

              {/* Search input row */}
              <Animated.View style={[inputStyle, { marginBottom: SPACING.sm }]}>
                <View style={{
                  backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: SPACING.md, paddingVertical: 12,
                  borderWidth: 1, borderColor: COLORS.border,
                }}>
                  <Ionicons name="search" size={20} color={COLORS.textMuted} />
                  <TextInput
                    placeholder="e.g. Future of quantum computing startups..."
                    placeholderTextColor={COLORS.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => { inputScale.value = withSpring(1.01); }}
                    onBlur={() => { inputScale.value = withSpring(1); }}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                    style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginLeft: 10 }}
                    editable={!isRecording && !transcribing}
                  />
                  {/* Voice button */}
                  <Animated.View style={micStyle}>
                    <TouchableOpacity
                      onPress={handleVoicePress}
                      style={{
                        width: 34, height: 34, borderRadius: 17,
                        backgroundColor: isRecording ? COLORS.error : `${COLORS.primary}20`,
                        alignItems: 'center', justifyContent: 'center',
                        marginLeft: 6,
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
                      <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>

              {/* Mic hint text */}
              {!isRecording && !transcribing && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.sm }}>
                  🎙️ Tap the mic to speak your research query
                </Text>
              )}

              <TouchableOpacity onPress={() => handleSearch()} disabled={!query.trim() || isRecording} activeOpacity={0.85}>
                <LinearGradient
                  colors={query.trim() && !isRecording ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <Ionicons name="telescope" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Start Research
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* Depth preview */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>
              Research Depth Options
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              {DEPTH_INFO.map((d) => (
                <View key={d.key} style={{
                  flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                  padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
                }}>
                  <Ionicons name={d.icon as any} size={20} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginTop: 4 }}>{d.label}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{d.desc}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Suggested topics */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>
              Trending Topics
            </Text>
            {SUGGESTED_TOPICS.map((topic) => (
              <TouchableOpacity
                key={topic.label}
                onPress={() => handleSearch(topic.label)}
                style={{
                  backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md,
                  marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'center',
                  borderWidth: 1, borderColor: COLORS.border,
                }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={topic.gradient}
                  style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
                >
                  <Ionicons name={topic.icon as any} size={20} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '500' }}>{topic.label}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{topic.tag}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}