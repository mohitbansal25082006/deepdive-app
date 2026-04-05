// src/components/podcast/SeriesCard.tsx
// Part 39 — Series Card for the podcast tab library section.
// Shows series artwork, name, episode count, total duration, and a "+ New Episode" CTA.

import React                                     from 'react';
import { View, Text, TouchableOpacity }          from 'react-native';
import { Ionicons }                              from '@expo/vector-icons';
import Animated, { FadeInDown }                  from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS }        from '../../constants/theme';
import type { PodcastSeries }                    from '../../types/podcast_v2';

interface SeriesCardProps {
  series:         PodcastSeries;
  index?:         number;
  onPress:        () => void;
  onNewEpisode:   () => void;
}

function formatDuration(secs: number): string {
  if (secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function SeriesCard({ series, index = 0, onPress, onNewEpisode }: SeriesCardProps) {
  const color = series.accentColor ?? '#6C63FF';

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     COLORS.border,
          flexDirection:   'row',
          alignItems:      'center',
          gap:             SPACING.md,
        }}
      >
        {/* Icon */}
        <View style={{
          width:           52,
          height:          52,
          borderRadius:    16,
          backgroundColor: `${color}20`,
          alignItems:      'center',
          justifyContent:  'center',
          borderWidth:     1,
          borderColor:     `${color}30`,
          flexShrink:      0,
        }}>
          <Ionicons name={series.iconName as any ?? 'radio-outline'} size={24} color={color} />
        </View>

        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: 3 }} numberOfLines={1}>
            {series.name}
          </Text>
          {series.description ? (
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginBottom: 5, lineHeight: 16 }} numberOfLines={1}>
              {series.description}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: `${color}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {series.episodeCount} ep{series.episodeCount !== 1 ? 's' : ''}
              </Text>
            </View>
            {series.totalDurationSeconds > 0 && (
              <View style={{ backgroundColor: `${COLORS.textMuted}12`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {formatDuration(series.totalDurationSeconds)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <TouchableOpacity
            onPress={e => { e.stopPropagation(); onNewEpisode(); }}
            style={{
              width:           36,
              height:          36,
              borderRadius:    11,
              backgroundColor: `${color}15`,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${color}30`,
            }}
          >
            <Ionicons name="add" size={18} color={color} />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}