// src/components/research/StreamingSectionCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Live streaming section card  (REDESIGN)
// Glassy card · animated progress stripe · blinking cursor · shimmer skeleton.
// Drop-in compatible: export `StreamingSectionCard`, props { section, isActive }.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AnimatedRN, { FadeInDown } from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { PartialSection } from '../../hooks/useResearch';
import { RichText } from './RichText';

interface Props {
  section:  PartialSection;
  isActive: boolean;
}

const SECTION_ICON_MAP: Record<number, string> = {
  0: 'newspaper-outline',
  1: 'business-outline',
  2: 'flash-outline',
  3: 'stats-chart-outline',
  4: 'warning-outline',
  5: 'telescope-outline',
};

export function StreamingSectionCard({ section, isActive }: Props) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, { toValue: 0, duration: 480, useNativeDriver: true }),
          Animated.timing(cursorOpacity, { toValue: 1, duration: 480, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }
    cursorOpacity.setValue(0);
  }, [isActive]);

  useEffect(() => {
    if (isActive && section.content.length === 0) {
      const anim = Animated.loop(
        Animated.timing(shimmer, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
      );
      anim.start();
      return () => anim.stop();
    }
  }, [isActive, section.content.length]);

  const icon = SECTION_ICON_MAP[section.index] ?? 'document-text-outline';
  const wordCount = section.content.split(/\s+/).filter(Boolean).length;

  const borderColor = isActive
    ? `${COLORS.primary}66`
    : section.isComplete
    ? `${COLORS.success}33`
    : COLORS.border;

  return (
    <AnimatedRN.View
      entering={FadeInDown.duration(300)}
      style={{ borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor, overflow: 'hidden' }}
    >
      <LinearGradient colors={isActive ? ['#1A1A3A', '#121228'] : ['#15152E', '#101024']} style={{ flex: 1 }}>
        {/* Active progress stripe */}
        {isActive && (
          <View style={{ height: 3, backgroundColor: `${COLORS.primary}30`, overflow: 'hidden' }}>
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: COLORS.primaryLight, opacity: cursorOpacity }} />
          </View>
        )}

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm }}>
          <LinearGradient
            colors={section.isComplete ? [COLORS.success, COLORS.success + 'AA'] : isActive ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
            style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            {section.isComplete
              ? <Ionicons name="checkmark" size={18} color="#FFF" />
              : isActive
              ? <Ionicons name={icon as any} size={18} color="#FFF" />
              : <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />}
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{section.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              {isActive && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary }} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Writing…</Text>
                </View>
              )}
              {wordCount > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {wordCount} words{!section.isComplete ? ' so far' : ''}
                </Text>
              )}
              {section.isComplete && (
                <View style={{
                  backgroundColor: `${COLORS.success}1C`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.success}33`,
                }}>
                  <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '800' }}>COMPLETE</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Content */}
        {section.content.length > 0 && (
          <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
            {section.isComplete ? (
              <RichText content={section.content} highlightStats accent={COLORS.primary} size={FONTS.sizes.sm} lineHeight={23} color={COLORS.textSecondary} />
            ) : (
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 23 }}>
                {section.content}
                {isActive && <Animated.Text style={{ opacity: cursorOpacity, color: COLORS.primary }}>{' ▋'}</Animated.Text>}
              </Text>
            )}

            {section.isComplete && section.section?.bullets && section.section.bullets.length > 0 && (
              <View style={{ marginTop: SPACING.sm, gap: 7 }}>
                {section.section.bullets.map((bullet, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 8, flexShrink: 0 }} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{bullet}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Idle skeleton */}
        {section.content.length === 0 && !isActive && (
          <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 9 }}>
            {[0.92, 0.78, 0.86, 0.6].map((w, i) => (
              <View key={i} style={{ height: 11, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: `${w * 100}%` }} />
            ))}
          </View>
        )}

        {/* Active shimmer skeleton */}
        {section.content.length === 0 && isActive && (
          <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 9 }}>
            {[0.95, 0.7, 0.85].map((w, i) => (
              <View key={i} style={{ height: 11, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: `${w * 100}%`, overflow: 'hidden' }}>
                <Animated.View style={{
                  position: 'absolute', top: 0, bottom: 0, width: 80,
                  transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 260] }) }],
                }}>
                  <LinearGradient
                    colors={['transparent', `${COLORS.primary}40`, 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ flex: 1 }}
                  />
                </Animated.View>
              </View>
            ))}
          </View>
        )}
      </LinearGradient>
    </AnimatedRN.View>
  );
}