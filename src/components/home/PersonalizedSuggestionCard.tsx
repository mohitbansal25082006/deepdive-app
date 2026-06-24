// src/components/home/PersonalizedSuggestionCard.tsx
// Part 43 — Redesigned with gradient border glow, spring press animation,
//            holographic source badge, and improved typography hierarchy.
//
// All props/exports are unchanged — drop-in replacement.
//
// ── Part 55.1A — THEME SYSTEM ─────────────────────────────────────────────────
//   The module-level SOURCE_CONFIG object captured COLORS at import time, so the
//   badge tints / glows were frozen to the default (dark) palette and never
//   recolored on a theme switch. It is now produced by getSourceConfig(), a
//   function called inside render that reads the LIVE COLORS. The card body
//   gradient (previously hardcoded ['#14142A','#0F0F22']) now uses
//   COLORS.gradientCard so it follows the theme too.
//
//   The press-scale animated style only touches a shared value — it never reads
//   COLORS — so it is already worklet-safe.

import React, { useCallback } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { PersonalizedSuggestion } from '../../services/homePersonalizationService';

interface Props {
  suggestion: PersonalizedSuggestion;
  onPress:    (query: string) => void;
}

// ── Source config (Part 55.1A: render-time function over live COLORS) ─────────

type SourceCfg = {
  badgeBg:     string;
  badgeText:   string;
  badgeBorder: string;
  borderGlow:  string;
  iconBg:      string;
  dotColor:    string;
  label:       string;
};

function getSourceConfig(source: string): SourceCfg {
  const map: Record<string, SourceCfg> = {
    affinity: {
      badgeBg:     `${COLORS.primary}18`,
      badgeText:   COLORS.primary,
      badgeBorder: `${COLORS.primary}35`,
      borderGlow:  `${COLORS.primary}20`,
      iconBg:      `${COLORS.primary}15`,
      dotColor:    COLORS.primary,
      label:       '★ Your Interest',
    },
    recent: {
      badgeBg:     `${COLORS.info}18`,
      badgeText:   COLORS.info,
      badgeBorder: `${COLORS.info}35`,
      borderGlow:  `${COLORS.info}18`,
      iconBg:      `${COLORS.info}15`,
      dotColor:    COLORS.info,
      label:       '🕐 Recent',
    },
    trending: {
      badgeBg:     `${COLORS.accent}15`,
      badgeText:   COLORS.accent,
      badgeBorder: `${COLORS.accent}30`,
      borderGlow:  `${COLORS.accent}12`,
      iconBg:      `${COLORS.accent}15`,
      dotColor:    COLORS.accent,
      label:       '🔥 Trending',
    },
    followup: {
      badgeBg:     `${COLORS.warning}15`,
      badgeText:   COLORS.warning,
      badgeBorder: `${COLORS.warning}30`,
      borderGlow:  `${COLORS.warning}12`,
      iconBg:      `${COLORS.warning}15`,
      dotColor:    COLORS.warning,
      label:       '💡 Follow-up',
    },
  };
  return map[source] ?? map.trending;
}

function timeAgo(isoString?: string): string {
  if (!isoString) return '';
  const diff  = Date.now() - new Date(isoString).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (days >= 7)  return `${Math.floor(days / 7)}w ago`;
  if (days >= 1)  return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  return 'Recently';
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function PersonalizedSuggestionCard({ suggestion, onPress }: Props) {
  const cfg = getSourceConfig(suggestion.source);

  // Press spring
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.975, { damping: 15, stiffness: 300 });
  }, []);
  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchable
      onPress={() => onPress(suggestion.rawQuery)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={[cardStyle, { marginBottom: SPACING.sm }]}
    >
      {/* Outer container with gradient border effect */}
      <View style={{
        borderRadius:    RADIUS.lg + 1,
        padding:         1,
        backgroundColor: cfg.borderGlow,
        borderWidth:     1,
        borderColor:     cfg.badgeBorder,
      }}>
        <LinearGradient
          colors={COLORS.gradientCard as [string, string]}
          style={{
            borderRadius:  RADIUS.lg,
            padding:       SPACING.md,
            flexDirection: 'row',
            alignItems:    'flex-start',
            gap:           12,
          }}
        >
          {/* Icon orb */}
          <LinearGradient
            colors={suggestion.gradient}
            style={{
              width:          44, height: 44, borderRadius: 13,
              alignItems:     'center', justifyContent: 'center',
              flexShrink:     0,
              shadowColor:    suggestion.gradient[0],
              shadowOpacity:  0.4,
              shadowRadius:   8,
              shadowOffset:   { width: 0, height: 4 },
              elevation:      6,
            }}
          >
            <Ionicons name={suggestion.icon as any} size={20} color="#FFF" />
          </LinearGradient>

          {/* Content */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Keyword */}
            <Text
              numberOfLines={2}
              style={{
                color:       COLORS.textPrimary,
                fontSize:    FONTS.sizes.base,
                fontWeight:  '600',
                lineHeight:  21,
                marginBottom: suggestion.followUpAngle ? 5 : 8,
              }}
            >
              {suggestion.keyword}
            </Text>

            {/* Follow-up angle */}
            {suggestion.followUpAngle && (
              <View style={{
                backgroundColor: `${COLORS.warning}08`,
                borderRadius:    RADIUS.sm,
                paddingHorizontal: 8, paddingVertical: 4,
                marginBottom:    8,
                borderWidth:     1, borderColor: `${COLORS.warning}18`,
              }}>
                <Text style={{
                  color:    COLORS.warning,
                  fontSize: FONTS.sizes.xs,
                  lineHeight: 15,
                  fontStyle: 'italic',
                }}>
                  💡 {suggestion.followUpAngle}
                </Text>
              </View>
            )}

            {/* Badge + time row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Source badge */}
              <View style={{
                backgroundColor:   cfg.badgeBg,
                borderRadius:      RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth:       1, borderColor: cfg.badgeBorder,
                flexDirection:     'row', alignItems: 'center', gap: 4,
              }}>
                {/* Dot */}
                <View style={{
                  width: 5, height: 5, borderRadius: 2.5,
                  backgroundColor: cfg.dotColor,
                }} />
                <Text style={{ color: cfg.badgeText, fontSize: 9, fontWeight: '700', letterSpacing: 0.3 }}>
                  {cfg.label}
                </Text>
              </View>

              {/* Time-ago */}
              {(suggestion.source === 'recent' || suggestion.source === 'affinity') &&
                suggestion.lastSeenAt && (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {timeAgo(suggestion.lastSeenAt)}
                  </Text>
                )
              }
            </View>
          </View>

          {/* Arrow */}
          <View style={{
            width:           28, height: 28, borderRadius: 8,
            backgroundColor: `${COLORS.primary}10`,
            alignItems:      'center', justifyContent: 'center',
            alignSelf:       'center',
            borderWidth:     1, borderColor: `${COLORS.primary}20`,
            flexShrink:      0,
          }}>
            <Ionicons name="arrow-forward" size={13} color={COLORS.primary} />
          </View>
        </LinearGradient>
      </View>
    </AnimatedTouchable>
  );
}