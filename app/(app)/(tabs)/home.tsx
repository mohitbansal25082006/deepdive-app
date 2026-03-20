// app/(app)/(tabs)/home.tsx
// Part 26 — UPDATED: Added Knowledge Base entry point card below the search hero.
// All previous functionality (voice, personalization, depth cards) preserved exactly.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Keyboard, Alert, Vibration, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useAnimatedStyle, useSharedValue,
  withSpring, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';
import { router }         from 'expo-router';
import { useAuth }        from '../../../src/context/AuthContext';
import { Avatar }         from '../../../src/components/common/Avatar';
import { PersonalizedSuggestionCard } from '../../../src/components/home/PersonalizedSuggestionCard';
import { usePersonalization }         from '../../../src/hooks/usePersonalization';
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, formatDuration,
} from '../../../src/services/voiceResearch';
import { getCachedReportsList } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const DEPTH_INFO = [
  { key: 'quick', label: 'Quick', desc: '2–3 min', icon: 'flash-outline' },
  { key: 'deep',  label: 'Deep',  desc: '5–7 min', icon: 'analytics-outline' },
  { key: 'expert',label: 'Expert',desc: '10–12 min',icon: 'trophy-outline' },
];

const SOURCE_HEADER: Record<string, string> = {
  affinity: '⭐  Your Interests',
  recent:   '🕐  Recently Researched',
  followup: '💡  AI Follow-up Angles',
  trending: '🔥  Trending Topics',
};

export default function HomeScreen() {
  const { profile } = useAuth();
  const [query,        setQuery]        = useState('');
  const [isRecording,  setIsRecording]  = useState(false);
  const [recordingMs,  setRecordingMs]  = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [cachedCount,  setCachedCount]  = useState(0);

  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  const {
    suggestions,
    isLoading:     suggestionsLoading,
    isPersonalized,
    refresh:       refreshSuggestions,
  } = usePersonalization();

  const inputScale = useSharedValue(1);
  const micPulse   = useSharedValue(1);

  useEffect(() => {
    getCachedReportsList().then(list => setCachedCount(list.length));
  }, []);

  useEffect(() => {
    if (isRecording) {
      micPulse.value = withRepeat(
        withSequence(withTiming(1.2, { duration: 600 }), withTiming(1.0, { duration: 600 })),
        -1, false,
      );
    } else {
      micPulse.value = withTiming(1);
    }
  }, [isRecording]);

  const inputStyle = useAnimatedStyle(() => ({ transform: [{ scale: inputScale.value }] }));
  const micStyle   = useAnimatedStyle(() => ({ transform: [{ scale: micPulse.value }] }));

  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    Keyboard.dismiss();
    router.push({ pathname: '/(app)/research-input' as any, params: { query: q.trim() } });
  };

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
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  };

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

  const SkeletonRow = ({ delay }: { delay: number }) => (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.sm,
        flexDirection:   'row',
        alignItems:      'center',
        borderWidth:     1,
        borderColor:     COLORS.border,
        gap:              14,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.backgroundElevated }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: '75%' }} />
        <View style={{ height: 10, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '45%' }} />
      </View>
    </Animated.View>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
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
          {/* ── Header ───────────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{
              flexDirection:   'row',
              justifyContent:  'space-between',
              alignItems:      'center',
              marginBottom:    SPACING.xl,
            }}
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
                    backgroundColor:   `${COLORS.info}15`,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth:       1, borderColor: `${COLORS.info}30`,
                    flexDirection:     'row', alignItems: 'center', gap: 4,
                  }}
                >
                  <Ionicons name="cloud-offline-outline" size={14} color={COLORS.info} />
                  <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    {cachedCount}
                  </Text>
                </TouchableOpacity>
              )}
              {isPersonalized && (
                <View style={{
                  backgroundColor:   `${COLORS.primary}15`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 5,
                  borderWidth:       1, borderColor: `${COLORS.primary}30`,
                  flexDirection:     'row', alignItems: 'center', gap: 4,
                }}>
                  <Ionicons name="sparkles" size={12} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    Personalized
                  </Text>
                </View>
              )}
              <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
            </View>
          </Animated.View>

          {/* ── Hero Search Card ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl, padding: SPACING.lg,
                marginBottom: SPACING.md,
                borderWidth:  1, borderColor: `${COLORS.primary}30`,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
                  }}
                >
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '700' }}>
                  AI Research Engine
                </Text>
              </View>

              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md, lineHeight: 20 }}>
                Ask anything. Our multi-agent system searches, analyses, fact-checks, and streams your report live as it's written.
              </Text>

              {isRecording && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{
                    backgroundColor: `${COLORS.error}15`,
                    borderRadius:    RADIUS.lg, padding: SPACING.sm,
                    marginBottom:    SPACING.sm,
                    flexDirection:   'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth:     1, borderColor: `${COLORS.error}30`,
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
                  borderRadius:    RADIUS.lg, padding: SPACING.sm, marginBottom: SPACING.sm,
                  flexDirection:   'row', alignItems: 'center', gap: 8,
                }}>
                  <Ionicons name="mic" size={14} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm }}>Transcribing audio...</Text>
                </View>
              )}

              <Animated.View style={[inputStyle, { marginBottom: SPACING.sm }]}>
                <View style={{
                  backgroundColor:   COLORS.backgroundElevated,
                  borderRadius:      RADIUS.lg,
                  flexDirection:     'row', alignItems: 'center',
                  paddingHorizontal: SPACING.md, paddingVertical: 12,
                  borderWidth:       1, borderColor: COLORS.border,
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
                  <Animated.View style={micStyle}>
                    <TouchableOpacity
                      onPress={handleVoicePress}
                      style={{
                        width:           34, height: 34, borderRadius: 17,
                        backgroundColor: isRecording ? COLORS.error : `${COLORS.primary}20`,
                        alignItems:      'center', justifyContent: 'center', marginLeft: 6,
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

              {!isRecording && !transcribing && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.sm }}>
                  🎙️ Tap the mic to speak  ·  Reports stream live as they're written
                </Text>
              )}

              <TouchableOpacity
                onPress={() => handleSearch()}
                disabled={!query.trim() || isRecording}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={query.trim() && !isRecording ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius:   RADIUS.lg, paddingVertical: 14,
                    alignItems:     'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="telescope" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Start Research
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* ── Knowledge Base Entry Card (Part 26) ───────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).delay(150)}>
            <TouchableOpacity
              onPress={() => router.push('/(app)/knowledge-base' as any)}
              activeOpacity={0.88}
              style={{ marginBottom: SPACING.xl }}
            >
              <LinearGradient
                colors={['#1A1235', '#0F1528']}
                style={{
                  borderRadius: RADIUS.xl,
                  borderWidth:  1,
                  borderColor:  `${COLORS.primary}35`,
                  overflow:     'hidden',
                }}
              >
                {/* Top gradient accent */}
                <LinearGradient
                  colors={[COLORS.primary + '40', 'transparent']}
                  style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  }}
                />

                <View style={{
                  flexDirection: 'row',
                  alignItems:    'center',
                  padding:       SPACING.md,
                  gap:           SPACING.md,
                }}>
                  {/* Icon */}
                  <LinearGradient
                    colors={['#6C63FF', '#8B5CF6']}
                    style={{
                      width: 52, height: 52, borderRadius: 15,
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons name="library" size={26} color="#FFF" />
                  </LinearGradient>

                  {/* Text */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{
                        color:      COLORS.textPrimary,
                        fontSize:   FONTS.sizes.base,
                        fontWeight: '800',
                      }}>
                        Knowledge Base
                      </Text>
                      <View style={{
                        backgroundColor: COLORS.primary + '20',
                        borderRadius:    RADIUS.full,
                        paddingHorizontal: 7, paddingVertical: 2,
                        borderWidth:     1, borderColor: COLORS.primary + '35',
                      }}>
                        <Text style={{
                          color: COLORS.primary, fontSize: 9, fontWeight: '700',
                        }}>
                          NEW
                        </Text>
                      </View>
                    </View>
                    <Text style={{
                      color:     COLORS.textMuted,
                      fontSize:  FONTS.sizes.xs,
                      lineHeight: 17,
                    }}>
                      Ask questions across all your research reports simultaneously.
                      Your personal AI second brain.
                    </Text>

                    {/* Feature chips */}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {['Cross-report search', 'AI synthesis', 'Source attribution'].map(tag => (
                        <View key={tag} style={{
                          backgroundColor:   COLORS.primary + '12',
                          borderRadius:      RADIUS.full,
                          paddingHorizontal: 7, paddingVertical: 2,
                          borderWidth:       1, borderColor: COLORS.primary + '25',
                        }}>
                          <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '600' }}>
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Arrow */}
                  <View style={{
                    width:          32, height: 32, borderRadius: 16,
                    backgroundColor: COLORS.primary + '15',
                    alignItems:      'center', justifyContent: 'center',
                    borderWidth:     1, borderColor: COLORS.primary + '25',
                    flexShrink:      0,
                  }}>
                    <Ionicons name="arrow-forward" size={15} color={COLORS.primary} />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Depth Preview ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)}>
            <Text style={{
              color:         COLORS.textMuted, fontSize: FONTS.sizes.xs,
              fontWeight:    '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
            }}>
              Research Depth Options
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              {DEPTH_INFO.map(d => (
                <View key={d.key} style={{
                  flex:            1,
                  backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                  padding:         SPACING.sm, alignItems: 'center',
                  borderWidth:     1, borderColor: COLORS.border,
                }}>
                  <Ionicons name={d.icon as any} size={20} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginTop: 4 }}>{d.label}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{d.desc}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Personalized Suggestions ──────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <View style={{
              flexDirection:   'row', alignItems: 'center',
              justifyContent:  'space-between', marginBottom: SPACING.md,
            }}>
              <Text style={{
                color:         COLORS.textMuted, fontSize: FONTS.sizes.xs,
                fontWeight:    '600', letterSpacing: 1, textTransform: 'uppercase',
              }}>
                {isPersonalized ? '✦  Curated For You' : '🔥  Trending Topics'}
              </Text>
              <TouchableOpacity
                onPress={refreshSuggestions}
                style={{
                  flexDirection:     'row', alignItems: 'center', gap: 4,
                  backgroundColor:   `${COLORS.primary}12`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth:       1, borderColor: `${COLORS.primary}25`,
                }}
              >
                <Ionicons name="refresh-outline" size={12} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {isPersonalized && (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{
                  backgroundColor:   `${COLORS.primary}08`,
                  borderRadius:      RADIUS.lg,
                  padding:           SPACING.sm,
                  marginBottom:      SPACING.md,
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:                8,
                  borderWidth:       1,
                  borderColor:       `${COLORS.primary}15`,
                }}
              >
                <Ionicons name="sparkles" size={13} color={COLORS.primary} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }}>
                  Based on your research history, interests, and trending topics across all users.
                </Text>
              </Animated.View>
            )}

            {suggestionsLoading && suggestions.length === 0 && (
              <>
                {[0, 60, 120, 180].map(delay => (
                  <SkeletonRow key={delay} delay={delay} />
                ))}
              </>
            )}

            {(!suggestionsLoading || suggestions.length > 0) ? (
              isPersonalized && groupedSuggestions.length > 1 ? (
                groupedSuggestions.map((group, gi) => (
                  <View key={group.source + gi}>
                    {gi > 0 && (
                      <Text style={{
                        color:         COLORS.textMuted,
                        fontSize:      FONTS.sizes.xs,
                        fontWeight:    '600',
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        marginBottom:  SPACING.sm,
                        marginTop:     SPACING.md,
                      }}>
                        {SOURCE_HEADER[group.source] ?? group.source}
                      </Text>
                    )}
                    {group.items.map(suggestion => (
                      <PersonalizedSuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onPress={handleSearch}
                      />
                    ))}
                  </View>
                ))
              ) : (
                suggestions.map(suggestion => (
                  <PersonalizedSuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onPress={handleSearch}
                  />
                ))
              )
            ) : null}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}