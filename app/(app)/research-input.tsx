// app/(app)/research-input.tsx
// Research configuration screen (modal).
// Users refine their query, choose depth, and add focus areas
// before starting the multi-agent pipeline.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { GradientButton } from '../../src/components/common/GradientButton';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ResearchDepth } from '../../src/types';
import { useResearch } from '../../src/hooks/useResearch';

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

export default function ResearchInputScreen() {
  const params = useLocalSearchParams<{ query: string }>();
  const { startResearch } = useResearch();

  const [query, setQuery] = useState(params.query ?? '');
  const [depth, setDepth] = useState<ResearchDepth>('deep');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const toggleFocus = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleStart = async () => {
    if (!query.trim()) {
      Alert.alert('Query Required', 'Please enter a research topic.');
      return;
    }

    setStarting(true);

    // Navigate to progress screen immediately, pass the input as params
    router.replace({
      pathname: '/(app)/research-progress' as any,
      params: {
        query: query.trim(),
        depth,
        focusAreas: focusAreas.join('||'),
      },
    });
  };

  return (
    <LinearGradient
      colors={[COLORS.backgroundCard, COLORS.background]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
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
              Customize your research parameters
            </Text>
          </View>
        </Animated.View>

        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Query input */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: SPACING.sm,
            }}>
              Research Topic
            </Text>

            <View style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              padding: SPACING.md,
              borderWidth: 1.5,
              borderColor: COLORS.borderFocus,
              marginBottom: SPACING.xl,
            }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Enter your research question..."
                placeholderTextColor={COLORS.textMuted}
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  lineHeight: 24,
                  minHeight: 60,
                }}
                multiline
                autoFocus
              />
            </View>
          </Animated.View>

          {/* Depth selection */}
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
                    <Text style={{
                      color: COLORS.textMuted,
                      fontSize: FONTS.sizes.xs,
                    }}>
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

          {/* Focus areas */}
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

        {/* Launch button */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: SPACING.xl,
          backgroundColor: 'rgba(10,10,26,0.95)',
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        }}>
          <GradientButton
            title="Launch Research Agent 🚀"
            onPress={handleStart}
            loading={starting}
            disabled={!query.trim()}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}