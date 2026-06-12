// src/components/research/ReportSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Research report section card  (REDESIGN)
// Glassy expandable card · gradient index marker · refined stat & bullet styling.
// Drop-in compatible: export `ReportSectionCard`, props { section, citations, index }.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeIn,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { ReportSection as ReportSectionType, Citation } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { RichText } from './RichText';

interface Props {
  section: ReportSectionType;
  citations: Citation[];
  index: number;
}

export function ReportSectionCard({ section, citations, index }: Props) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showCitations, setShowCitations] = useState(false);

  const chevron = useSharedValue(index === 0 ? 1 : 0);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const sectionCitations = citations.filter(c => section.citationIds?.includes(c.id));

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    chevron.value = withTiming(next ? 1 : 0, { duration: 220 });
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(480).delay(index * 90)}
      style={{
        borderRadius: RADIUS.xl,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: expanded ? `${COLORS.primary}30` : COLORS.border,
        overflow: 'hidden',
      }}
    >
      <LinearGradient colors={expanded ? ['#1A1A38', '#121228'] : ['#15152E', '#101024']} style={{ flex: 1 }}>
        {/* Header */}
        <Pressable
          onPress={toggleExpand}
          style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm }}
        >
          <View style={{ position: 'relative' }}>
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={{
                width: 40, height: 40, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name={(section.icon as any) ?? 'document-text-outline'} size={18} color="#FFF" />
            </LinearGradient>
            <View style={{
              position: 'absolute', bottom: -4, right: -4,
              minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
              backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: `${COLORS.primary}55`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: COLORS.primaryLight, fontSize: 9, fontWeight: '800' }}>{index + 1}</Text>
            </View>
          </View>

          <Text style={{
            color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800',
            flex: 1, lineHeight: 21, letterSpacing: -0.2,
          }}>
            {section.title}
          </Text>

          <Animated.View style={[{
            width: 28, height: 28, borderRadius: 9,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
          }, chevronStyle]}>
            <Ionicons name="chevron-down" size={15} color={COLORS.textSecondary} />
          </Animated.View>
        </Pressable>

        {/* Content */}
        {expanded && (
          <Animated.View entering={FadeIn.duration(220)} style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
            <LinearGradient
              colors={[`${COLORS.primary}30`, 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 1, marginBottom: SPACING.md }}
            />

            <RichText
              content={section.content}
              highlightStats
              accent={COLORS.primary}
              size={FONTS.sizes.base}
              lineHeight={25}
              paragraphSpacing={SPACING.md}
              style={{ marginBottom: SPACING.md }}
            />

            {/* Statistics */}
            {section.statistics && section.statistics.length > 0 && (
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={labelStyle}>Key Statistics</Text>
                {section.statistics.map((stat, i) => (
                  <View key={i} style={{
                    borderRadius: RADIUS.md, marginBottom: 8, overflow: 'hidden',
                    borderWidth: 1, borderColor: `${COLORS.primary}22`,
                  }}>
                    <LinearGradient colors={[`${COLORS.primary}14`, `${COLORS.primary}06`]} style={{ padding: SPACING.sm, paddingLeft: SPACING.md }}>
                      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.primary }} />
                      <Text style={{ color: COLORS.primaryLight, fontSize: FONTS.sizes.md, fontWeight: '900' }}>{stat.value}</Text>
                      <RichText inline content={stat.context} highlightStats accent={COLORS.primary} size={FONTS.sizes.sm} color={COLORS.textSecondary} lineHeight={19} style={{ marginTop: 3 }} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>Source: {stat.source}</Text>
                    </LinearGradient>
                  </View>
                ))}
              </View>
            )}

            {/* Bullets */}
            {section.bullets && section.bullets.length > 0 && (
              <View style={{ marginBottom: SPACING.md, gap: 9 }}>
                {section.bullets.map((bullet, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <LinearGradient
                      colors={COLORS.gradientPrimary}
                      style={{ width: 7, height: 7, borderRadius: 4, marginTop: 7, marginRight: 11, flexShrink: 0 }}
                    />
                    <RichText inline content={bullet} highlightStats accent={COLORS.primary} size={FONTS.sizes.sm} color={COLORS.textSecondary} lineHeight={22} style={{ flex: 1 }} />
                  </View>
                ))}
              </View>
            )}

            {/* Citations */}
            {sectionCitations.length > 0 && (
              <View>
                <Pressable
                  onPress={() => setShowCitations(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 6,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name="link" size={13} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                    {sectionCitations.length} Source{sectionCitations.length > 1 ? 's' : ''}
                  </Text>
                  <Ionicons name={showCitations ? 'chevron-up' : 'chevron-down'} size={12} color={COLORS.textMuted} />
                </Pressable>

                {showCitations && (
                  <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 8, gap: 6 }}>
                    {sectionCitations.map(c => (
                      <View key={c.id} style={{
                        backgroundColor: COLORS.backgroundElevated,
                        borderRadius: RADIUS.md, padding: SPACING.sm,
                        borderWidth: 1, borderColor: COLORS.border,
                      }}>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{c.title}</Text>
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                          {c.source}{c.date ? ` · ${c.date}` : ''}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4, lineHeight: 16 }}>{c.snippet}</Text>
                      </View>
                    ))}
                  </Animated.View>
                )}
              </View>
            )}
          </Animated.View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const labelStyle = {
  color: COLORS.textMuted,
  fontSize: FONTS.sizes.xs,
  fontWeight: '700' as const,
  letterSpacing: 0.9,
  textTransform: 'uppercase' as const,
  marginBottom: SPACING.sm,
};