// app/(auth)/onboarding.tsx
// The onboarding screens shown to new users before they sign in.
// Has 3 animated slides with descriptions of the app features.

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { GradientButton } from '../../src/components/common/GradientButton';
import { OnboardingSlide } from '../../src/types';

const { width, height } = Dimensions.get('window');

// The 3 onboarding slides content
const slides: OnboardingSlide[] = [
  {
    id: '1',
    title: 'AI-Powered Research',
    subtitle: 'Your Personal Research Agent',
    description:
      'Simply ask a question. DeepDive AI autonomously searches the web, analyzes data, and generates a complete research report — in minutes.',
    icon: 'search',
    gradientColors: ['#6C63FF', '#8B5CF6'],
  },
  {
    id: '2',
    title: 'Multi-Agent System',
    subtitle: 'Five Specialized AI Agents',
    description:
      'A team of AI agents work together: Research, Analysis, Fact-Checking, Summarization, and Report Generation — each doing what they do best.',
    icon: 'people',
    gradientColors: ['#FF6584', '#FF8E53'],
  },
  {
    id: '3',
    title: 'Structured Reports',
    subtitle: 'Professional Quality Output',
    description:
      'Get beautiful research reports with key insights, statistics, trends, and citations. Export as PDF or share instantly.',
    icon: 'document-text',
    gradientColors: ['#43E97B', '#38F9D7'],
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // Track which slide is visible
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    }
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  // Go to next slide, or navigate to sign in if on last slide
  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      router.push('/(auth)/signin');
    }
  };

  // Slide component for each onboarding page
  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={{ width, paddingHorizontal: SPACING.xl }}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Icon circle with gradient */}
        <LinearGradient
          colors={item.gradientColors}
          style={{
            width: 140,
            height: 140,
            borderRadius: 70,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: SPACING['2xl'],
            shadowColor: item.gradientColors[0],
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
            elevation: 12,
          }}
        >
          <Ionicons name={item.icon as any} size={64} color="#FFFFFF" />
        </LinearGradient>

        {/* Subtitle badge */}
        <View style={{
          backgroundColor: `${item.gradientColors[0]}20`,
          borderRadius: RADIUS.full,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.xs,
          borderWidth: 1,
          borderColor: `${item.gradientColors[0]}40`,
          marginBottom: SPACING.md,
        }}>
          <Text style={{
            color: item.gradientColors[0],
            fontSize: FONTS.sizes.sm,
            fontWeight: '600',
          }}>
            {item.subtitle}
          </Text>
        </View>

        {/* Title */}
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes['3xl'],
          fontWeight: '800',
          textAlign: 'center',
          marginBottom: SPACING.md,
          letterSpacing: -0.5,
        }}>
          {item.title}
        </Text>

        {/* Description */}
        <Text style={{
          color: COLORS.textSecondary,
          fontSize: FONTS.sizes.base,
          textAlign: 'center',
          lineHeight: 24,
        }}>
          {item.description}
        </Text>
      </Animated.View>
    </View>
  );

  // Dot indicator for current slide
  const renderDots = () => (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.xl,
    }}>
      {slides.map((_, index) => (
        <View
          key={index}
          style={{
            width: index === currentIndex ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: index === currentIndex
              ? COLORS.primary
              : COLORS.border,
            marginHorizontal: 4,
          }}
        />
      ))}
    </View>
  );

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Skip button */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.md,
        }}>
          <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        {/* App logo / name */}
        <Animated.View
          entering={FadeIn.duration(800)}
          style={{ alignItems: 'center', paddingTop: SPACING.xl }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Ionicons name="analytics" size={22} color="#FFF" />
            </LinearGradient>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
              letterSpacing: -0.5,
            }}>
              DeepDive AI
            </Text>
          </View>
        </Animated.View>

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          style={{ flex: 1, marginTop: SPACING.xl }}
        />

        {/* Bottom controls */}
        <Animated.View
          entering={SlideInDown.duration(600)}
          style={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl }}
        >
          {renderDots()}

          <GradientButton
            title={currentIndex === slides.length - 1 ? 'Get Started' : 'Continue'}
            onPress={handleNext}
          />

          {/* Already have account */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: SPACING.lg,
          }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
              <Text style={{
                color: COLORS.primary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '600',
              }}>
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}