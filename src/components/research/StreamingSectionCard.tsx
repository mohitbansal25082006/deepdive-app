// src/components/research/StreamingSectionCard.tsx
// Part 21 — Live streaming section card.
//
// Renders a report section that is being written in real-time.
// Shows a typing cursor while content is still arriving,
// switches to the completed ReportSectionCard style when done.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Animated,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import AnimatedRN, { FadeInDown } from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { PartialSection }  from '../../hooks/useResearch';

interface Props {
  section:     PartialSection;
  isActive:    boolean;   // true = currently streaming
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
  // Blinking cursor animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      cursorOpacity.setValue(0);
    }
  }, [isActive]);

  const icon = SECTION_ICON_MAP[section.index] ?? 'document-text-outline';

  const wordCount = section.content.split(/\s+/).filter(Boolean).length;

  return (
    <AnimatedRN.View
      entering={FadeInDown.duration(300)}
      style={{
        backgroundColor:   COLORS.backgroundCard,
        borderRadius:      RADIUS.xl,
        marginBottom:      SPACING.md,
        borderWidth:       1,
        borderColor:       isActive
          ? `${COLORS.primary}60`
          : section.isComplete
          ? `${COLORS.success}30`
          : COLORS.border,
        overflow:          'hidden',
      }}
    >
      {/* Active streaming indicator stripe */}
      {isActive && (
        <View style={{
          height:          3,
          backgroundColor: COLORS.primary,
          borderTopLeftRadius:  RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
        }}>
          <Animated.View style={{
            position:        'absolute',
            left:             0,
            right:            0,
            top:              0,
            height:           3,
            backgroundColor:  COLORS.primaryLight,
            opacity:          cursorOpacity,
          }} />
        </View>
      )}

      {/* Section Header */}
      <View style={{
        flexDirection:   'row',
        alignItems:      'center',
        padding:          SPACING.md,
        paddingBottom:    SPACING.sm,
        gap:              SPACING.sm,
      }}>
        <LinearGradient
          colors={
            section.isComplete
              ? [COLORS.success, COLORS.success + 'AA']
              : isActive
              ? COLORS.gradientPrimary
              : ['#2A2A4A', '#1A1A35']
          }
          style={{
            width:          36,
            height:         36,
            borderRadius:   10,
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}
        >
          {section.isComplete ? (
            <Ionicons name="checkmark" size={18} color="#FFF" />
          ) : isActive ? (
            <Ionicons name={icon as any} size={18} color="#FFF" />
          ) : (
            <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
          )}
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.base,
            fontWeight: '700',
          }}>
            {section.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            {isActive && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{
                  width:           6,
                  height:          6,
                  borderRadius:    3,
                  backgroundColor: COLORS.primary,
                }} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  Writing...
                </Text>
              </View>
            )}
            {wordCount > 0 && (
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {wordCount} words{!section.isComplete ? ' so far' : ''}
              </Text>
            )}
            {section.isComplete && (
              <View style={{
                backgroundColor:   `${COLORS.success}18`,
                borderRadius:      RADIUS.full,
                paddingHorizontal: 8,
                paddingVertical:   2,
                borderWidth:       1,
                borderColor:       `${COLORS.success}30`,
              }}>
                <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                  COMPLETE
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Content */}
      {section.content.length > 0 && (
        <View style={{
          paddingHorizontal: SPACING.md,
          paddingBottom:     SPACING.md,
        }}>
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 22,
          }}>
            {section.content}
            {/* Blinking cursor */}
            {isActive && (
              <Animated.Text style={{ opacity: cursorOpacity, color: COLORS.primary }}>
                {' ▋'}
              </Animated.Text>
            )}
          </Text>

          {/* Completed bullets */}
          {section.isComplete && section.section?.bullets && section.section.bullets.length > 0 && (
            <View style={{ marginTop: SPACING.sm, gap: 6 }}>
              {section.section.bullets.map((bullet, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{
                    width:           6,
                    height:          6,
                    borderRadius:    3,
                    backgroundColor: COLORS.primary,
                    marginTop:       8,
                    flexShrink:      0,
                  }} />
                  <Text style={{
                    color:      COLORS.textSecondary,
                    fontSize:   FONTS.sizes.sm,
                    lineHeight: 20,
                    flex:       1,
                  }}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Placeholder skeleton when section hasn't started yet */}
      {section.content.length === 0 && !isActive && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 8 }}>
          {[0.9, 0.75, 0.85, 0.6].map((opacity, i) => (
            <View
              key={i}
              style={{
                height:          12,
                borderRadius:    6,
                backgroundColor: COLORS.backgroundElevated,
                width:           `${opacity * 100}%`,
              }}
            />
          ))}
        </View>
      )}

      {/* Skeleton shimmer while active but no content yet */}
      {section.content.length === 0 && isActive && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}>
            Starting to write this section...
          </Text>
        </View>
      )}
    </AnimatedRN.View>
  );
}