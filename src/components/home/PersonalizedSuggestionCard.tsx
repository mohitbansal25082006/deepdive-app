// src/components/home/PersonalizedSuggestionCard.tsx
// Part 21 — Personalized suggestion card for the home screen.
//
// Renders a single AI-curated topic suggestion with:
//   - Source badge (Your Interest / Recently Researched / Trending / Follow-up)
//   - Follow-up angle explanation (when source = 'followup')
//   - Time-ago label for recently-researched items
//   - Gradient icon matching the topic

import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { PersonalizedSuggestion } from '../../services/homePersonalizationService';

interface Props {
  suggestion: PersonalizedSuggestion;
  onPress:    (query: string) => void;
}

const SOURCE_BADGE_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  affinity:  { bg: `${COLORS.primary}18`,  text: COLORS.primary,  border: `${COLORS.primary}30`  },
  recent:    { bg: `${COLORS.info}18`,      text: COLORS.info,     border: `${COLORS.info}30`     },
  trending:  { bg: `${COLORS.accent}15`,    text: COLORS.accent,   border: `${COLORS.accent}25`   },
  followup:  { bg: `${COLORS.warning}15`,   text: COLORS.warning,  border: `${COLORS.warning}25`  },
};

function timeAgo(isoString?: string): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (days >= 7)  return `${Math.floor(days / 7)}w ago`;
  if (days >= 1)  return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  return 'Recently';
}

export function PersonalizedSuggestionCard({ suggestion, onPress }: Props) {
  const badge = SOURCE_BADGE_STYLES[suggestion.source] ??
    SOURCE_BADGE_STYLES.trending;

  return (
    <TouchableOpacity
      onPress={() => onPress(suggestion.rawQuery)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.sm,
        flexDirection:   'row',
        alignItems:      'flex-start',
        borderWidth:     1,
        borderColor:     COLORS.border,
      }}
      activeOpacity={0.75}
    >
      {/* Icon */}
      <LinearGradient
        colors={suggestion.gradient}
        style={{
          width:          44,
          height:         44,
          borderRadius:   12,
          alignItems:     'center',
          justifyContent: 'center',
          marginRight:    14,
          flexShrink:     0,
        }}
      >
        <Ionicons name={suggestion.icon as any} size={20} color="#FFF" />
      </LinearGradient>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.base,
            fontWeight: '600',
            flex:       1,
            flexShrink: 1,
          }}>
            {suggestion.keyword}
          </Text>
        </View>

        {/* Follow-up angle explanation */}
        {suggestion.followUpAngle && (
          <Text style={{
            color:      COLORS.textMuted,
            fontSize:   FONTS.sizes.xs,
            lineHeight: 16,
            marginBottom: 6,
            fontStyle:  'italic',
          }}>
            💡 {suggestion.followUpAngle}
          </Text>
        )}

        {/* Badge row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            backgroundColor:   badge.bg,
            borderRadius:      RADIUS.full,
            paddingHorizontal: 8,
            paddingVertical:   2,
            borderWidth:       1,
            borderColor:       badge.border,
            flexDirection:     'row',
            alignItems:        'center',
            gap:                4,
          }}>
            <Ionicons name={suggestion.icon as any} size={10} color={badge.text} />
            <Text style={{ color: badge.text, fontSize: 10, fontWeight: '700' }}>
              {suggestion.tag}
            </Text>
          </View>

          {/* Time-ago for recent/affinity items */}
          {(suggestion.source === 'recent' || suggestion.source === 'affinity') &&
            suggestion.lastSeenAt && (
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {timeAgo(suggestion.lastSeenAt)}
              </Text>
            )
          }
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={COLORS.textMuted}
        style={{ alignSelf: 'center', marginLeft: 4 }}
      />
    </TouchableOpacity>
  );
}