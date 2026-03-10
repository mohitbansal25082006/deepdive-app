// src/components/research/InfographicCard.tsx
// Fixed: chart widths now derived from a passed-in containerWidth prop
// so they never overflow the parent ScrollView's padding.

import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { InfographicChart, InfographicData, InfographicStat } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;

const CHART_CONFIG = {
  backgroundColor:        '#12122A',
  backgroundGradientFrom: '#1A1A35',
  backgroundGradientTo:   '#12122A',
  decimalPlaces:          1,
  color:       (opacity = 1) => `rgba(108,99,255,${opacity})`,
  labelColor:  (opacity = 1) => `rgba(160,160,192,${opacity})`,
  style: { borderRadius: RADIUS.lg },
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#6C63FF' },
  propsForBackgroundLines: { stroke: 'rgba(42,42,74,0.5)' },
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
          alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0,
        }}>
          <Ionicons
            name={(stat.icon ?? 'stats-chart') as any}
            size={16}
            color={stat.color ?? COLORS.primary}
          />
        </View>
        <Text
          style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }}
          numberOfLines={2}
        >
          {stat.label}
        </Text>
      </View>
      <Text style={{
        color: stat.color ?? COLORS.primary,
        fontSize: FONTS.sizes['2xl'],
        fontWeight: '800',
        lineHeight: 32,
      }}>
        {stat.value}
      </Text>
      {stat.change && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4,
        }}>
          <Ionicons
            name={
              stat.changeType === 'positive' ? 'trending-up'
              : stat.changeType === 'negative' ? 'trending-down'
              : 'remove'
            }
            size={12}
            color={changeColor}
          />
          <Text style={{ color: changeColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
            {stat.change}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

interface ChartCardProps {
  chart: InfographicChart;
  index: number;
  chartWidth: number;   // ← explicit width so nothing overflows
}

function ChartCard({ chart, index, chartWidth }: ChartCardProps) {
  const dataset  = chart.datasets?.[0];
  const data     = dataset?.data ?? [];
  const labels   = chart.labels ?? data.map((_, i) => String(i + 1));

  const safeData   = data.map(v => (typeof v === 'number' && !isNaN(v) ? v : 0));
  const safeLabels = labels.map(l => String(l).slice(0, 7));

  if (safeData.length === 0 || chartWidth <= 0) return null;

  const maxVal = Math.max(...safeData, 1);

  let chartElement: React.ReactElement | null = null;

  if (chart.type === 'line' && safeData.length >= 2) {
    chartElement = (
      <LineChart
        data={{ labels: safeLabels, datasets: [{ data: safeData }] }}
        width={chartWidth}
        height={180}
        chartConfig={CHART_CONFIG}
        bezier
        withShadow={false}
        withInnerLines
        yAxisSuffix={chart.unit ? ` ${chart.unit}` : ''}
        style={{ borderRadius: RADIUS.md, marginVertical: 4, alignSelf: 'center' }}
      />
    );
  } else if (chart.type === 'bar') {
    chartElement = (
      <BarChart
        data={{ labels: safeLabels, datasets: [{ data: safeData }] }}
        width={chartWidth}
        height={180}
        chartConfig={{
          ...CHART_CONFIG,
          barPercentage: 0.55,
          color: (opacity = 1) => `rgba(108,99,255,${opacity})`,
        }}
        showValuesOnTopOfBars
        fromZero
        yAxisSuffix={chart.unit ? ` ${chart.unit}` : ''}
        yAxisLabel=""
        style={{ borderRadius: RADIUS.md, marginVertical: 4, alignSelf: 'center' }}
      />
    );
  } else if (chart.type === 'pie' && safeData.length >= 2) {
    const PIE_COLORS = [
      '#6C63FF','#FF6584','#43E97B','#FA709A','#4FACFE','#F093FB',
    ];
    const pieData = safeData
      .map((value, i) => ({
        name:            safeLabels[i] ?? `Item ${i + 1}`,
        population:      value,
        color:           PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: COLORS.textSecondary,
        legendFontSize:  10,
      }))
      .filter(d => d.population > 0);

    if (pieData.length < 2) {
      chartElement = null;
    } else {
      chartElement = (
        <PieChart
          data={pieData}
          width={chartWidth}
          height={160}
          chartConfig={CHART_CONFIG}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="0"
          center={[10, 0]}
          absolute={false}
          style={{ borderRadius: RADIUS.md, marginVertical: 4, alignSelf: 'center' }}
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
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1, borderColor: COLORS.border,
        // overflow hidden stops any chart pixel from leaking outside
        overflow: 'hidden',
      }}
    >
      <View style={{ marginBottom: SPACING.sm }}>
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700',
        }}>
          {chart.title}
        </Text>
        {chart.subtitle && (
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
            {chart.subtitle}
          </Text>
        )}
      </View>

      {chartElement}

      {chart.insight && (
        <View style={{
          backgroundColor: `${COLORS.primary}10`,
          borderRadius: RADIUS.md,
          padding: SPACING.sm,
          marginTop: SPACING.sm,
          flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        }}>
          <Ionicons name="bulb-outline" size={14} color={COLORS.primary} style={{ marginTop: 2 }} />
          <Text style={{
            color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1,
          }}>
            {chart.insight}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface Props {
  data: InfographicData;
  /**
   * Width available to the panel (screen width minus surrounding padding).
   * Defaults to SCREEN_W - 48 (standard SPACING.lg * 2).
   * Pass a smaller value if the panel is nested inside cards with extra padding.
   */
  availableWidth?: number;
}

export function InfographicsPanel({ data, availableWidth }: Props) {
  // Chart must be narrower than the panel; subtract the card's own padding (16*2)
  const panelW = availableWidth ?? SCREEN_W - SPACING.lg * 2;
  const chartW = panelW - SPACING.md * 2;

  return (
    <View style={{ width: '100%' }}>

      {/* ── Stat cards ── */}
      {data.stats.length > 0 && (
        <View style={{ marginBottom: SPACING.md }}>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
          }}>
            Key Metrics
          </Text>
          {/* Two-column grid */}
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

      {/* ── Charts ── */}
      {data.charts.length > 0 && (
        <View>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
          }}>
            Data Visualizations
          </Text>
          {data.charts.map((chart, i) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              index={i}
              chartWidth={chartW}
            />
          ))}
        </View>
      )}
    </View>
  );
}