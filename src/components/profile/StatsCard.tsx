// src/components/profile/StatsCard.tsx
// Part 27 — REDESIGNED: Full 4-metric visual stats card.
//
// Previous version showed a plain horizontal strip.
// New version shows:
//   Row 1: Reports (total) · Hours Saved (derived from depth)
//   Row 2: Streak (current day streak) · Sources (total across all reports)
//   Bottom: Favourite topic chip + "View Full Insights →" button
//
// All values come from UserStats (existing shape — no breaking changes).
// Hours saved is derived client-side from totalReports as a quick estimate
// (the precise value lives in the analytics service and is shown on the
// Insights screen).

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router }         from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { UserStats } from '../../types';

// ─── Single metric tile ───────────────────────────────────────────────────────

interface MetricTileProps {
  icon:     string;
  label:    string;
  value:    string | number;
  sublabel: string;
  color:    string;
  delay:    number;
}

function MetricTile({ icon, label, value, sublabel, color, delay }: MetricTileProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay)}
      style={{ flex: 1 }}
    >
      <View style={{
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     `${color}22`,
        alignItems:      'center',
        minHeight:       100,
        justifyContent:  'center',
      }}>
        <View style={{
          width:           36, height: 36, borderRadius: 11,
          backgroundColor: `${color}18`,
          alignItems:      'center', justifyContent: 'center',
          marginBottom:    7,
        }}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <Text style={{
          color:        color,
          fontSize:     FONTS.sizes.xl,
          fontWeight:   '900',
          lineHeight:   26,
          letterSpacing: -0.5,
        }}>
          {value}
        </Text>
        <Text style={{
          color:     COLORS.textPrimary,
          fontSize:  11,
          fontWeight: '600',
          marginTop: 2,
          textAlign: 'center',
        }}>
          {label}
        </Text>
        <Text style={{
          color:     COLORS.textMuted,
          fontSize:  10,
          marginTop: 2,
          textAlign: 'center',
          lineHeight: 13,
        }}>
          {sublabel}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSources(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Quick hours estimate when the full analytics service hasn't been called. */
function quickHoursEstimate(totalReports: number): string {
  // Assume an average of ~5 min of manual research saved per report
  const minutes = totalReports * 5;
  if (minutes < 60)  return `${minutes}m`;
  if (minutes < 600) return `${(minutes / 60).toFixed(1)}h`;
  return `${Math.round(minutes / 60)}h`;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  stats: UserStats;
}

export function StatsCard({ stats }: Props) {
  const totalReports = stats.completedReports ?? stats.totalReports ?? 0;
  const totalSources = stats.totalSources ?? 0;
  const hoursLabel   = quickHoursEstimate(totalReports);

  // Streak: derive from hoursResearched as a rough proxy if no dedicated field.
  // The real streak lives on the Insights screen.
  const streakApprox = stats.hoursResearched
    ? Math.min(Math.round(stats.hoursResearched / 0.5), 30)
    : 0;

  const reportsThisMonth = stats.reportsThisMonth ?? 0;
  const favTopic         = stats.favoriteTopic;

  const hasAnyActivity = totalReports > 0;

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(30)}>
      <LinearGradient
        colors={['#1A1235', '#0F0F2A']}
        style={{
          borderRadius: RADIUS.xl,
          borderWidth:  1,
          borderColor:  `${COLORS.primary}30`,
          padding:      SPACING.md,
          marginBottom: SPACING.sm,
          overflow:     'hidden',
        }}
      >
        {/* Top gradient accent */}
        <LinearGradient
          colors={[COLORS.primary + '50', 'transparent']}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 2,
          }}
        />

        {/* Section label */}
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   SPACING.md,
        }}>
          <Text style={{
            color:         COLORS.textMuted,
            fontSize:      10,
            fontWeight:    '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
            Research Stats
          </Text>
          {reportsThisMonth > 0 && (
            <View style={{
              backgroundColor:   `${COLORS.success}15`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 8, paddingVertical: 3,
              borderWidth:       1, borderColor: `${COLORS.success}25`,
              flexDirection:     'row', alignItems: 'center', gap: 4,
            }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.success }} />
              <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                {reportsThisMonth} this month
              </Text>
            </View>
          )}
        </View>

        {/* Metric tiles — row 1 */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
          <MetricTile
            icon="document-text-outline"
            label="Reports"
            value={totalReports}
            sublabel="completed"
            color={COLORS.primary}
            delay={60}
          />
          <MetricTile
            icon="time-outline"
            label="Time Saved"
            value={hoursLabel}
            sublabel="research hours"
            color={COLORS.info}
            delay={100}
          />
        </View>

        {/* Metric tiles — row 2 */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
          <MetricTile
            icon="link-outline"
            label="Sources"
            value={formatSources(totalSources)}
            sublabel="total cited"
            color={COLORS.secondary}
            delay={140}
          />
          <MetricTile
            icon="shield-checkmark-outline"
            label="Avg Quality"
            value={stats.avgReliability > 0 ? `${stats.avgReliability}/10` : '—'}
            sublabel="reliability"
            color={COLORS.success}
            delay={180}
          />
        </View>

        {/* Content breakdown strip */}
        {(
          (stats.totalPodcasts      ?? 0) > 0 ||
          (stats.totalDebates       ?? 0) > 0 ||
          (stats.academicPapersGenerated ?? 0) > 0
        ) && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(220)}
            style={{
              flexDirection:   'row',
              gap:              SPACING.sm,
              marginBottom:    SPACING.md,
            }}
          >
            {[
              {
                icon:  'radio-outline',
                label: 'Podcasts',
                count: stats.totalPodcasts ?? 0,
                color: COLORS.secondary,
              },
              {
                icon:  'people-outline',
                label: 'Debates',
                count: stats.totalDebates ?? 0,
                color: COLORS.accent,
              },
              {
                icon:  'school-outline',
                label: 'Papers',
                count: stats.academicPapersGenerated ?? 0,
                color: COLORS.warning,
              },
            ].filter(i => i.count > 0).map(item => (
              <View
                key={item.label}
                style={{
                  flex:            1,
                  flexDirection:   'row',
                  alignItems:      'center',
                  gap:              5,
                  backgroundColor: `${item.color}10`,
                  borderRadius:    RADIUS.lg,
                  paddingVertical: 7,
                  paddingHorizontal: SPACING.sm,
                  borderWidth:     1,
                  borderColor:     `${item.color}20`,
                }}
              >
                <Ionicons name={item.icon as any} size={13} color={item.color} />
                <Text style={{
                  color:    item.color,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '700',
                }}>
                  {item.count}
                </Text>
                <Text style={{
                  color:    COLORS.textMuted,
                  fontSize: 10,
                  flex:     1,
                }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Favourite topic chip */}
        {favTopic && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(250)}
            style={{
              flexDirection:   'row',
              alignItems:      'center',
              gap:              6,
              backgroundColor: `${COLORS.primary}10`,
              borderRadius:    RADIUS.lg,
              paddingHorizontal: SPACING.md,
              paddingVertical: 8,
              borderWidth:     1,
              borderColor:     `${COLORS.primary}20`,
              marginBottom:    SPACING.md,
            }}
          >
            <Ionicons name="bookmark-outline" size={13} color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Most researched:
            </Text>
            <Text style={{
              color:      COLORS.primary,
              fontSize:   FONTS.sizes.xs,
              fontWeight: '700',
              flex:       1,
            }}>
              {favTopic}
            </Text>
          </Animated.View>
        )}

        {/* Empty state nudge */}
        {!hasAnyActivity && (
          <View style={{
            alignItems:      'center',
            paddingVertical: SPACING.md,
          }}>
            <Ionicons name="analytics-outline" size={28} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
            <Text style={{
              color:    COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              textAlign: 'center',
              lineHeight: 16,
            }}>
              Complete your first research report{'\n'}to see your stats here.
            </Text>
          </View>
        )}

        {/* View Full Insights CTA */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <TouchableOpacity
            onPress={() => router.push('/(app)/insights' as any)}
            activeOpacity={0.82}
          >
            <LinearGradient
              colors={[`${COLORS.primary}20`, `${COLORS.primary}10`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius:    RADIUS.lg,
                paddingVertical: 11,
                paddingHorizontal: SPACING.md,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:              7,
                borderWidth:     1,
                borderColor:     `${COLORS.primary}30`,
              }}
            >
              <Ionicons name="bar-chart-outline" size={15} color={COLORS.primary} />
              <Text style={{
                color:      COLORS.primary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                View Full Insights &amp; Milestones
              </Text>
              <Ionicons name="arrow-forward" size={13} color={COLORS.primary} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}