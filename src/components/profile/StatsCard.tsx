// src/components/profile/StatsCard.tsx
// Animated research stats dashboard card for the profile screen.

import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { UserStats } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  stats: UserStats;
}

export function StatsCard({ stats }: Props) {
  const items = [
    {
      icon: 'document-text',
      label: 'Total Reports',
      value: String(stats.completedReports),
      color: COLORS.primary,
      gradient: COLORS.gradientPrimary,
    },
    {
      icon: 'globe',
      label: 'Sources Analysed',
      value: stats.totalSources > 999
        ? `${(stats.totalSources / 1000).toFixed(1)}k`
        : String(stats.totalSources),
      color: COLORS.info,
      gradient: ['#29B6F6', '#0288D1'] as const,
    },
    {
      icon: 'time',
      label: 'Hours Saved',
      value: `${stats.hoursResearched}h`,
      color: COLORS.success,
      gradient: COLORS.gradientSuccess,
    },
    {
      icon: 'shield-checkmark',
      label: 'Avg Reliability',
      value: `${stats.avgReliability}/10`,
      color: COLORS.warning,
      gradient: ['#FFA726', '#FF7043'] as const,
    },
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(200)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl, padding: SPACING.lg,
        borderWidth: 1, borderColor: COLORS.border,
        marginBottom: SPACING.lg,
      }}
    >
      <Text style={{
        color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
        fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
        marginBottom: SPACING.md,
      }}>
        Research Stats
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
        {items.map((item) => (
          <View key={item.label} style={{
            width: '47%',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg, padding: SPACING.md,
            borderWidth: 1, borderColor: COLORS.border,
          }}>
            <LinearGradient
              colors={item.gradient}
              style={{
                width: 36, height: 36, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.sm,
              }}
            >
              <Ionicons name={item.icon as any} size={18} color="#FFF" />
            </LinearGradient>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800',
            }}>
              {item.value}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      {stats.reportsThisMonth > 0 && (
        <View style={{
          marginTop: SPACING.md,
          backgroundColor: `${COLORS.primary}10`,
          borderRadius: RADIUS.md, padding: SPACING.sm,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: `${COLORS.primary}20`,
        }}>
          <Ionicons name="trending-up" size={16} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
            {stats.reportsThisMonth} report{stats.reportsThisMonth !== 1 ? 's' : ''} this month
          </Text>
        </View>
      )}

      {stats.favoriteTopic && (
        <View style={{
          marginTop: SPACING.sm,
          backgroundColor: `${COLORS.info}10`,
          borderRadius: RADIUS.md, padding: SPACING.sm,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: `${COLORS.info}20`,
        }}>
          <Ionicons name="bookmark" size={16} color={COLORS.info} />
          <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            Top topic: {stats.favoriteTopic}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}