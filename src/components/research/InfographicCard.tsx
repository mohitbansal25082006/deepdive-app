// src/components/research/InfographicCard.tsx
// Fixes:
//  • Y-axis labels fully visible — paddingLeft passed as NUMBER to chartConfig
//  • No number overlap — decimalPlaces:0, formatYLabel trims long values
//  • Chart not shifted left — full chartWidth used, no negative marginLeft

import React from 'react';
import { View, Text, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { InfographicChart, InfographicData, InfographicStat } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;

// Space reserved INSIDE the SVG for Y-axis labels (left side).
// react-native-chart-kit draws Y labels inside the SVG viewport,
// so paddingLeft must be a NUMBER — not a string — or it is ignored.
const Y_PAD = 56;

// Shorten large numbers so they don't overlap (e.g. 1200000 → "1.2M")
function formatYLabel(value: string): string {
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  // For decimals keep 1 place; for whole numbers none
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ─── Base chart config (paddingLeft as NUMBER) ────────────────────────────────
const BASE_CONFIG = {
  backgroundColor:        '#12122A',
  backgroundGradientFrom: '#1A1A35',
  backgroundGradientTo:   '#12122A',
  decimalPlaces:          0,
  paddingLeft:            Y_PAD,          // ← must be a number
  color:       (o = 1) => `rgba(108,99,255,${o})`,
  labelColor:  (o = 1) => `rgba(160,160,192,${o})`,
  style: { borderRadius: RADIUS.lg },
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#6C63FF' },
  propsForBackgroundLines: { stroke: 'rgba(42,42,74,0.4)', strokeDasharray: '' },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: InfographicStat }) {
  const changeColor =
    stat.changeType === 'positive' ? COLORS.success
    : stat.changeType === 'negative' ? COLORS.error
    : COLORS.textMuted;

  return (
    <LinearGradient
      colors={['#1A1A35', '#12122A']}
      style={{
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        flex: 1,
        borderWidth: 1,
        borderColor: `${stat.color ?? COLORS.primary}25`,
        minHeight: 110,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          width: 32, height: 32, borderRadius: 10,
          backgroundColor: `${stat.color ?? COLORS.primary}20`,
          alignItems: 'center', justifyContent: 'center',
          marginRight: 8, flexShrink: 0,
        }}>
          <Ionicons name={(stat.icon ?? 'stats-chart') as any} size={16} color={stat.color ?? COLORS.primary} />
        </View>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }} numberOfLines={2}>
          {stat.label}
        </Text>
      </View>
      <Text style={{ color: stat.color ?? COLORS.primary, fontSize: FONTS.sizes['2xl'], fontWeight: '800', lineHeight: 32 }}>
        {stat.value}
      </Text>
      {stat.change && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
          <Ionicons
            name={stat.changeType === 'positive' ? 'trending-up' : stat.changeType === 'negative' ? 'trending-down' : 'remove'}
            size={12} color={changeColor}
          />
          <Text style={{ color: changeColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{stat.change}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

interface ChartCardProps {
  chart: InfographicChart;
  index: number;
  chartWidth: number; // full usable width inside the card (card width − card h-padding)
}

function ChartCard({ chart, index, chartWidth }: ChartCardProps) {
  const dataset    = chart.datasets?.[0];
  const rawData    = dataset?.data ?? [];
  const rawLabels  = chart.labels ?? rawData.map((_, i) => String(i + 1));

  const safeData   = rawData.map(v => (typeof v === 'number' && isFinite(v) ? v : 0));
  // Keep x-labels short to prevent overlap
  const safeLabels = rawLabels.map(l => String(l).slice(0, 5));

  if (safeData.length === 0 || chartWidth <= 0) return null;

  const unitSuffix  = chart.unit ? ` ${chart.unit}` : '';

  let chartElement: React.ReactElement | null = null;

  // ── Line ──────────────────────────────────────────────────────────────────
  if (chart.type === 'line' && safeData.length >= 2) {
    chartElement = (
      <LineChart
        data={{ labels: safeLabels, datasets: [{ data: safeData }] }}
        width={chartWidth}
        height={200}
        chartConfig={{
          ...BASE_CONFIG,
          formatYLabel,
        }}
        bezier
        withShadow={false}
        withInnerLines
        withHorizontalLabels
        withVerticalLabels
        yAxisSuffix={unitSuffix}
        style={{ borderRadius: RADIUS.md, marginVertical: 4 }}
      />
    );
  }

  // ── Bar ───────────────────────────────────────────────────────────────────
  else if (chart.type === 'bar') {
    chartElement = (
      <BarChart
        data={{ labels: safeLabels, datasets: [{ data: safeData }] }}
        width={chartWidth}
        height={200}
        chartConfig={{
          ...BASE_CONFIG,
          formatYLabel,
          barPercentage: 0.6,
          color: (o = 1) => `rgba(108,99,255,${o})`,
        }}
        showValuesOnTopOfBars
        fromZero
        withInnerLines
        withHorizontalLabels
        yAxisSuffix={unitSuffix}
        yAxisLabel=""
        style={{ borderRadius: RADIUS.md, marginVertical: 4 }}
      />
    );
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  else if (chart.type === 'pie' && safeData.length >= 2) {
    const PIE_COLORS = ['#6C63FF','#FF6584','#43E97B','#FA709A','#4FACFE','#F093FB'];
    const pieData = safeData
      .map((value, i) => ({
        name:            safeLabels[i] ?? `Item ${i + 1}`,
        population:      value,
        color:           PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: COLORS.textSecondary,
        legendFontSize:  10,
      }))
      .filter(d => d.population > 0);

    if (pieData.length >= 2) {
      chartElement = (
        <PieChart
          data={pieData}
          width={chartWidth}
          height={170}
          chartConfig={BASE_CONFIG}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="8"
          center={[0, 0]}
          absolute={false}
          style={{ borderRadius: RADIUS.md, marginVertical: 4 }}
        />
      );
    }
  }

  if (!chartElement) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 120)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl,
        // Horizontal padding is deliberately small so the chart SVG gets max width.
        // Y-axis labels are drawn INSIDE the SVG via paddingLeft in chartConfig.
        paddingHorizontal: SPACING.xs,
        paddingVertical: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1, borderColor: COLORS.border,
        overflow: 'hidden',
      }}
    >
      {/* Header — keep it outside the overflow:hidden-clipped area */}
      <View style={{ paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
          {chart.title}
        </Text>
        {chart.subtitle && (
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
            {chart.subtitle}
          </Text>
        )}
      </View>

      {/* Chart — full available width, paddingLeft in config protects labels */}
      {chartElement}

      {/* Insight */}
      {chart.insight && (
        <View style={{
          backgroundColor: `${COLORS.primary}10`,
          borderRadius: RADIUS.md,
          padding: SPACING.sm,
          marginTop: SPACING.sm,
          marginHorizontal: SPACING.sm,
          flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        }}>
          <Ionicons name="bulb-outline" size={14} color={COLORS.primary} style={{ marginTop: 2 }} />
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
            {chart.insight}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Public panel ─────────────────────────────────────────────────────────────

interface Props {
  data: InfographicData;
  availableWidth?: number;
}

export function InfographicsPanel({ data, availableWidth }: Props) {
  const panelW = availableWidth ?? SCREEN_W - SPACING.lg * 2;
  // Card uses SPACING.xs (4) horizontal padding on each side → subtract 8
  const chartW = panelW - SPACING.xs * 2;

  return (
    <View style={{ width: '100%' }}>

      {/* Stat cards */}
      {data.stats.length > 0 && (
        <View style={{ marginBottom: SPACING.md }}>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
          }}>
            Key Metrics
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
            {data.stats.map((stat, i) => (
              <Animated.View
                key={stat.id}
                entering={FadeInDown.duration(400).delay(i * 80)}
                style={{ width: (panelW - SPACING.sm) / 2 }}
              >
                <StatCard stat={stat} />
              </Animated.View>
            ))}
          </View>
        </View>
      )}

      {/* Charts */}
      {data.charts.length > 0 && (
        <View>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
          }}>
            Data Visualizations
          </Text>
          {data.charts.map((chart, i) => (
            <ChartCard key={chart.id} chart={chart} index={i} chartWidth={chartW} />
          ))}
        </View>
      )}
    </View>
  );
}