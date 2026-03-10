// app/(app)/(tabs)/home.tsx
// Home screen — the entry point for all AI research.
// Users type a query here; the screen navigates to research-input for config.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { Avatar } from '../../../src/components/common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const SUGGESTED_TOPICS = [
  {
    label: 'Future of AI in Healthcare',
    icon: 'medical',
    gradient: ['#6C63FF', '#8B5CF6'] as const,
    tag: 'Healthcare',
  },
  {
    label: 'Quantum Computing Startups 2025',
    icon: 'flash',
    gradient: ['#FF6584', '#FF8E53'] as const,
    tag: 'Technology',
  },
  {
    label: 'Electric Vehicle Market Trends',
    icon: 'car-sport',
    gradient: ['#43E97B', '#38F9D7'] as const,
    tag: 'Automotive',
  },
  {
    label: 'Generative AI Impact on Jobs',
    icon: 'people',
    gradient: ['#F093FB', '#F5576C'] as const,
    tag: 'AI & Work',
  },
  {
    label: 'Climate Tech Investment 2025',
    icon: 'leaf',
    gradient: ['#4FACFE', '#00F2FE'] as const,
    tag: 'Climate',
  },
  {
    label: 'Space Economy & Commercial Launch',
    icon: 'rocket',
    gradient: ['#FA709A', '#FEE140'] as const,
    tag: 'Space',
  },
];

const DEPTH_INFO = [
  { key: 'quick', label: 'Quick', desc: '2–3 min', icon: 'flash-outline' },
  { key: 'deep', label: 'Deep', desc: '5–7 min', icon: 'analytics-outline' },
  { key: 'expert', label: 'Expert', desc: '10–12 min', icon: 'trophy-outline' },
];

export default function HomeScreen() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  const inputScale = useSharedValue(1);

  const inputStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inputScale.value }],
  }));

  const handleFocus = () => {
    inputScale.value = withSpring(1.01, { damping: 15 });
  };

  const handleBlur = () => {
    inputScale.value = withSpring(1, { damping: 15 });
  };

  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    Keyboard.dismiss();
    router.push({
      pathname: '/(app)/research-input' as any,
      params: { query: q.trim() },
    });
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  };

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: SPACING.xl,
            }}
          >
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                {getGreeting()}
              </Text>
              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.xl,
                fontWeight: '800',
              }}>
                {firstName} 👋
              </Text>
            </View>
            <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
          </Animated.View>

          {/* Hero search */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl,
                padding: SPACING.lg,
                marginBottom: SPACING.xl,
                borderWidth: 1,
                borderColor: `${COLORS.primary}30`,
              }}
            >
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: SPACING.sm,
              }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: SPACING.sm,
                  }}
                >
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                </LinearGradient>
                <Text style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.md,
                  fontWeight: '700',
                }}>
                  AI Research Engine
                </Text>
              </View>

              <Text style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                marginBottom: SPACING.md,
                lineHeight: 20,
              }}>
                Ask anything. Our multi-agent system searches the web, analyzes sources,
                fact-checks, and generates a comprehensive report.
              </Text>

              {/* Search input */}
              <Animated.View style={inputStyle}>
                <View style={{
                  backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: SPACING.md,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  marginBottom: SPACING.sm,
                }}>
                  <Ionicons name="search" size={20} color={COLORS.textMuted} />
                  <TextInput
                    placeholder="e.g. Future of quantum computing startups..."
                    placeholderTextColor={COLORS.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                    style={{
                      flex: 1,
                      color: COLORS.textPrimary,
                      fontSize: FONTS.sizes.sm,
                      marginLeft: 10,
                    }}
                    multiline={false}
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                      <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>

              <TouchableOpacity
                onPress={() => handleSearch()}
                disabled={!query.trim()}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={query.trim() ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.lg,
                    paddingVertical: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="telescope" size={18} color="#FFF" />
                  <Text style={{
                    color: '#FFF',
                    fontSize: FONTS.sizes.base,
                    fontWeight: '700',
                  }}>
                    Start Research
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* Depth preview */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)}>
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              fontWeight: '600',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: SPACING.md,
            }}>
              Research Depth Options
            </Text>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              {DEPTH_INFO.map((d) => (
                <View
                  key={d.key}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.lg,
                    padding: SPACING.sm,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name={d.icon as any} size={20} color={COLORS.primary} />
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.sm,
                    fontWeight: '600',
                    marginTop: 4,
                  }}>
                    {d.label}
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.xs,
                    marginTop: 2,
                  }}>
                    {d.desc}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Suggested topics */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              fontWeight: '600',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: SPACING.md,
            }}>
              Trending Topics
            </Text>

            {SUGGESTED_TOPICS.map((topic, i) => (
              <TouchableOpacity
                key={topic.label}
                onPress={() => handleSearch(topic.label)}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  marginBottom: SPACING.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={topic.gradient}
                  style={{
                    width: 44, height: 44, borderRadius: 12,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Ionicons name={topic.icon as any} size={20} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.base,
                    fontWeight: '500',
                  }}>
                    {topic.label}
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.xs,
                    marginTop: 2,
                  }}>
                    {topic.tag}
                  </Text>
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