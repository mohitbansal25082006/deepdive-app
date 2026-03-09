// app/(app)/(tabs)/home.tsx
// Home screen — placeholder for Part 2 where the AI research feature lives.
// For now it shows a clean home UI with a search bar and sample topics.

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { Avatar } from '../../../src/components/common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const SUGGESTED_TOPICS = [
  { label: 'Future of AI in Healthcare', icon: 'medical', gradient: ['#6C63FF', '#8B5CF6'] as const },
  { label: 'Quantum Computing Startups', icon: 'flash', gradient: ['#FF6584', '#FF8E53'] as const },
  { label: 'Electric Vehicle Market 2025', icon: 'car', gradient: ['#43E97B', '#38F9D7'] as const },
  { label: 'Web3 and Blockchain Trends', icon: 'cube', gradient: ['#F093FB', '#F5576C'] as const },
];

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Researcher';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
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
                Good morning,
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

          {/* Search bar (functional in Part 2) */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)}>
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius: RADIUS.xl,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.md,
              borderWidth: 1,
              borderColor: COLORS.border,
              marginBottom: SPACING.xl,
            }}>
              <Ionicons name="search" size={20} color={COLORS.textMuted} />
              <TextInput
                placeholder="Ask anything to research..."
                placeholderTextColor={COLORS.textMuted}
                style={{
                  flex: 1,
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  marginLeft: 10,
                }}
              />
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{ borderRadius: RADIUS.md, padding: 10 }}
              >
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Suggested Topics */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: SPACING.md,
            }}>
              Trending Topics
            </Text>

            {SUGGESTED_TOPICS.map((topic, index) => (
              <TouchableOpacity
                key={topic.label}
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
              >
                <LinearGradient
                  colors={topic.gradient}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Ionicons name={topic.icon as any} size={20} color="#FFF" />
                </LinearGradient>
                <Text style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  fontWeight: '500',
                  flex: 1,
                }}>
                  {topic.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* Coming in Part 2 banner */}
          <Animated.View entering={FadeInDown.duration(600).delay(400)}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl,
                padding: SPACING.xl,
                marginTop: SPACING.lg,
                borderWidth: 1,
                borderColor: `${COLORS.primary}30`,
                alignItems: 'center',
              }}
            >
              <Ionicons name="rocket" size={40} color={COLORS.primary} />
              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.lg,
                fontWeight: '700',
                marginTop: SPACING.md,
                textAlign: 'center',
              }}>
                AI Research Engine
              </Text>
              <Text style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                textAlign: 'center',
                marginTop: SPACING.sm,
              }}>
                Full multi-agent research functionality coming in Part 2
              </Text>
            </LinearGradient>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}