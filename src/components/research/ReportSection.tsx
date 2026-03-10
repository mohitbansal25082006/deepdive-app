// src/components/research/ReportSection.tsx
// Renders a single section of the research report with
// animated reveal, statistics, bullet points, and citation badges.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ReportSection as ReportSectionType, Citation } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  section: ReportSectionType;
  citations: Citation[];
  index: number;
}

export function ReportSectionCard({ section, citations, index }: Props) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showCitations, setShowCitations] = useState(false);

  const sectionCitations = citations.filter((c) =>
    section.citationIds?.includes(c.id)
  );

  const toggleExpand = () => setExpanded((v) => !v);

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 100)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <TouchableOpacity
        onPress={toggleExpand}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: SPACING.md,
        }}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: SPACING.md,
          }}
        >
          <Ionicons
            name={(section.icon as any) ?? 'document-text-outline'}
            size={18}
            color="#FFF"
          />
        </LinearGradient>

        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.base,
          fontWeight: '700',
          flex: 1,
          lineHeight: 22,
        }}>
          {section.title}
        </Text>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {/* Section content */}
      {expanded && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          {/* Divider */}
          <View style={{
            height: 1,
            backgroundColor: COLORS.border,
            marginBottom: SPACING.md,
          }} />

          {/* Main content paragraphs */}
          <Text style={{
            color: COLORS.textSecondary,
            fontSize: FONTS.sizes.base,
            lineHeight: 24,
            marginBottom: SPACING.md,
          }}>
            {section.content}
          </Text>

          {/* Statistics chips */}
          {section.statistics && section.statistics.length > 0 && (
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                fontWeight: '600',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                marginBottom: SPACING.sm,
              }}>
                Key Statistics
              </Text>
              {section.statistics.map((stat, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: `${COLORS.primary}10`,
                    borderRadius: RADIUS.md,
                    padding: SPACING.sm,
                    marginBottom: 6,
                    borderLeftWidth: 3,
                    borderLeftColor: COLORS.primary,
                  }}
                >
                  <Text style={{
                    color: COLORS.primary,
                    fontSize: FONTS.sizes.md,
                    fontWeight: '700',
                  }}>
                    {stat.value}
                  </Text>
                  <Text style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    marginTop: 2,
                  }}>
                    {stat.context}
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.xs,
                    marginTop: 2,
                  }}>
                    Source: {stat.source}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bullet points */}
          {section.bullets && section.bullets.length > 0 && (
            <View style={{ marginBottom: SPACING.md }}>
              {section.bullets.map((bullet, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      marginTop: 8,
                      marginRight: 10,
                      flexShrink: 0,
                    }}
                  />
                  <Text style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    lineHeight: 22,
                    flex: 1,
                  }}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Citations */}
          {sectionCitations.length > 0 && (
            <View>
              <TouchableOpacity
                onPress={() => setShowCitations((v) => !v)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: SPACING.xs,
                }}
              >
                <Ionicons name="link-outline" size={14} color={COLORS.textMuted} />
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  marginLeft: 6,
                  fontWeight: '600',
                }}>
                  {sectionCitations.length} Source{sectionCitations.length > 1 ? 's' : ''} {showCitations ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {showCitations && sectionCitations.map((c) => (
                <View
                  key={c.id}
                  style={{
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.sm,
                    padding: SPACING.sm,
                    marginTop: 6,
                  }}
                >
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.xs,
                    fontWeight: '600',
                  }}>
                    {c.title}
                  </Text>
                  <Text style={{
                    color: COLORS.primary,
                    fontSize: FONTS.sizes.xs,
                    marginTop: 2,
                  }}>
                    {c.source}{c.date ? ` · ${c.date}` : ''}
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.xs,
                    marginTop: 4,
                    lineHeight: 16,
                  }}>
                    {c.snippet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}