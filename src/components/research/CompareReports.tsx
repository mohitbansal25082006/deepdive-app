// src/components/research/CompareReports.tsx
// Side-by-side comparison card used on the compare screen.

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResearchReport } from '../../types';
import { ComparisonPoint } from '../../hooks/useCompareReports';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  leftReport: ResearchReport;
  rightReport: ResearchReport;
  points: ComparisonPoint[];
}

export function CompareReportsView({ leftReport, rightReport, points }: Props) {
  const winnerColor = (w: ComparisonPoint['winner'], side: 'left' | 'right') => {
    if (w === 'tie') return COLORS.textMuted;
    return w === side ? COLORS.success : COLORS.textMuted;
  };

  const winnerIcon = (w: ComparisonPoint['winner'], side: 'left' | 'right'): string => {
    if (w === 'tie') return 'remove';
    return w === side ? 'checkmark-circle' : 'ellipse-outline';
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
        {[leftReport, rightReport].map((report, idx) => (
          <View key={report.id} style={{
            flex: 1,
            backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.xl, padding: SPACING.md,
            borderWidth: 1.5,
            borderColor: idx === 0 ? COLORS.primary : COLORS.secondary,
          }}>
            <View style={{
              backgroundColor: idx === 0 ? `${COLORS.primary}20` : `${COLORS.secondary}20`,
              borderRadius: RADIUS.sm,
              paddingHorizontal: 8, paddingVertical: 4,
              alignSelf: 'flex-start', marginBottom: SPACING.sm,
            }}>
              <Text style={{
                color: idx === 0 ? COLORS.primary : COLORS.secondary,
                fontSize: FONTS.sizes.xs, fontWeight: '700',
              }}>
                {idx === 0 ? 'Report A' : 'Report B'}
              </Text>
            </View>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
              fontWeight: '700', lineHeight: 20,
            }} numberOfLines={3}>
              {report.title}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 6 }}>
              {new Date(report.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
        ))}
      </View>

      {/* Comparison rows */}
      {points.map((point) => (
        <View key={point.label} style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.lg, padding: SPACING.md,
          marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
            fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase',
            marginBottom: SPACING.sm,
          }}>
            {point.label}
          </Text>
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {(['left', 'right'] as const).map((side) => {
              const value = side === 'left' ? point.leftValue : point.rightValue;
              const color = winnerColor(point.winner, side);
              const icon = winnerIcon(point.winner, side);
              return (
                <View key={side} style={{
                  flex: 1, backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.md, padding: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                  <Ionicons name={icon as any} size={16} color={color} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    {value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {/* Executive summary comparison */}
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl, padding: SPACING.md,
        marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
      }}>
        <Text style={{
          color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
          fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase',
          marginBottom: SPACING.md,
        }}>
          Executive Summaries
        </Text>
        <View style={{ gap: SPACING.md }}>
          {[leftReport, rightReport].map((report, idx) => (
            <View key={report.id}>
              <Text style={{
                color: idx === 0 ? COLORS.primary : COLORS.secondary,
                fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 6,
              }}>
                {idx === 0 ? 'A' : 'B'}: {report.title}
              </Text>
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18,
              }} numberOfLines={4}>
                {report.executiveSummary}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}