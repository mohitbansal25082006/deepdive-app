// src/components/research/InfographicCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infographics Panel — FULL THEME COMPATIBILITY
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { InfographicChart, InfographicData, InfographicStat } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;

const PALETTE = [
  '#6C63FF', '#4FACFE', '#43E97B', '#FA709A',
  '#F9CB42', '#F093FB', '#38F9D7', '#FF8E53',
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

const Y_AXIS_TEXT = { color: 'rgba(160,160,200,0.85)', fontSize: 9.5 };
const X_AXIS_TEXT = { color: 'rgba(160,160,200,0.85)', fontSize: 9.5 };

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm }}>
      <View style={{
        width: 22, height: 22, borderRadius: 7,
        backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon as any} size={12} color={COLORS.primary} />
      </View>
      <Text style={{
        color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700',
        letterSpacing: 1.1, textTransform: 'uppercase',
      }}>
        {text}
      </Text>
    </View>
  );
}

function StatCard({ stat }: { stat: InfographicStat }) {
  const { isLight } = useTheme();
  const accent = stat.color ?? COLORS.primary;
  const changeColor =
    stat.changeType === 'positive' ? COLORS.success
    : stat.changeType === 'negative' ? COLORS.error
    : COLORS.textMuted;

  const bgGradient: readonly [string, string] = isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1C1C3A', '#13132B'];
  const gradientColors: readonly [string, string] = [accent, `${accent}99`] as const;

  return (
    <View style={{
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: `${accent}33`,
      minHeight: 116,
    }}>
      <LinearGradient
        colors={bgGradient}
        style={{ flex: 1, padding: SPACING.md }}
      >
        <View style={{
          position: 'absolute', top: -28, right: -28,
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: `${accent}22`,
        }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <LinearGradient
            colors={gradientColors}
            style={{
              width: 34, height: 34, borderRadius: 11,
              alignItems: 'center', justifyContent: 'center',
              marginRight: 9, flexShrink: 0,
            }}
          >
            <Ionicons name={(stat.icon ?? 'stats-chart') as any} size={16} color="#FFF" />
          </LinearGradient>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }} numberOfLines={2}>
            {stat.label}
          </Text>
        </View>

        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'],
          fontWeight: '900', lineHeight: 32, letterSpacing: -0.5,
        }}>
          {stat.value}
        </Text>

        {stat.change ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
            marginTop: 7, gap: 4,
            backgroundColor: `${changeColor}18`,
            borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Ionicons
              name={stat.changeType === 'positive' ? 'trending-up' : stat.changeType === 'negative' ? 'trending-down' : 'remove'}
              size={11} color={changeColor}
            />
            <Text style={{ color: changeColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{stat.change}</Text>
          </View>
        ) : (
          <View style={{ height: 2, width: 38, borderRadius: 2, backgroundColor: `${accent}66`, marginTop: 12 }} />
        )}
      </LinearGradient>
    </View>
  );
}

function ChartShell({
  chart, index, children,
}: { chart: InfographicChart; index: number; children: React.ReactNode }) {
  const { isLight } = useTheme();
  const bgGradient: readonly [string, string] = isLight ? ['#FFFFFF', '#EEF0F8'] : ['#181833', '#101026'];

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 110)}
      style={{
        borderRadius: RADIUS.xl,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: `${COLORS.primary}22`,
        overflow: 'hidden',
      }}
    >
      <LinearGradient colors={bgGradient} style={{ padding: SPACING.md, paddingBottom: SPACING.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
          <View style={{
            width: 30, height: 30, borderRadius: 9,
            backgroundColor: `${COLORS.primary}1F`,
            alignItems: 'center', justifyContent: 'center', marginRight: 9, flexShrink: 0,
          }}>
            <Ionicons
              name={(chart.type === 'pie' ? 'pie-chart' : chart.type === 'line' ? 'pulse' : 'bar-chart') as any}
              size={15} color={COLORS.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', letterSpacing: -0.2 }}>
              {chart.title}
            </Text>
            {chart.subtitle ? (
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{chart.subtitle}</Text>
            ) : null}
          </View>
        </View>

        {children}

        {chart.insight ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 7,
            backgroundColor: `${COLORS.primary}12`,
            borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm,
            borderWidth: 1, borderColor: `${COLORS.primary}22`,
          }}>
            <Ionicons name="sparkles" size={13} color={COLORS.primary} style={{ marginTop: 1 }} />
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
              {chart.insight}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

interface ChartCardProps {
  chart: InfographicChart;
  index: number;
  chartWidth: number;
}

function ChartCard({ chart, index, chartWidth }: ChartCardProps) {
  const { isLight } = useTheme();
  const dataset = chart.datasets?.[0];
  const rawData = dataset?.data ?? [];
  const rawLabels = chart.labels ?? rawData.map((_, i) => String(i + 1));

  const values = rawData.map(v => (typeof v === 'number' && isFinite(v) ? v : 0));
  const labels = rawLabels.map(l => String(l));

  if (values.length === 0 || chartWidth <= 0) return null;

  const accent = dataset?.color ?? COLORS.primary;
  const maxVal = Math.max(...values, 0);
  const niceMax = niceCeil(maxVal);
  const sections = 4;
  const yLabels = Array.from({ length: sections + 1 }, (_, i) =>
    fmtNum((niceMax * i) / sections) + (chart.unit ? '' : '')
  );

  const yAxisLabelWidth = 42;
  const plotW = Math.max(40, chartWidth - yAxisLabelWidth - 8);

  if (chart.type === 'bar') {
    const n = values.length;
    const slot = plotW / n;
    const barWidth = clamp(slot * 0.5, 12, 38);
    const spacing = clamp(slot - barWidth, 6, 44);

    const barData = values.map((value, i) => ({
      value,
      label: labels[i]?.slice(0, 6) ?? '',
      frontColor: PALETTE[i % PALETTE.length],
      gradientColor: `${PALETTE[i % PALETTE.length]}55`,
      topLabelComponent: () => (
        <Text style={{ color: 'rgba(220,220,240,0.9)', fontSize: 8.5, fontWeight: '700', marginBottom: 2 }}>
          {fmtNum(value)}
        </Text>
      ),
    }));

    return (
      <ChartShell chart={chart} index={index}>
        <View style={{ marginLeft: -6 }}>
          <BarChart
            data={barData}
            width={plotW}
            height={188}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={spacing * 0.7}
            endSpacing={spacing * 0.5}
            roundedTop
            showGradient
            barBorderRadius={5}
            maxValue={niceMax}
            noOfSections={sections}
            yAxisLabelTexts={yLabels}
            yAxisLabelWidth={yAxisLabelWidth}
            yAxisThickness={0}
            xAxisThickness={0}
            yAxisTextStyle={Y_AXIS_TEXT}
            xAxisLabelTextStyle={X_AXIS_TEXT}
            rulesType="dashed"
            rulesColor="rgba(108,99,255,0.12)"
            dashWidth={3}
            dashGap={5}
            isAnimated
            animationDuration={650}
          />
        </View>
        {chart.unit ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2, marginLeft: yAxisLabelWidth }}>
            Values in {chart.unit}
          </Text>
        ) : null}
      </ChartShell>
    );
  }

  if (chart.type === 'line') {
    const n = values.length;
    const spacing = clamp(plotW / Math.max(1, n - 1), 26, 90);
    const lineData = values.map((value, i) => ({
      value,
      label: labels[i]?.slice(0, 6) ?? '',
    }));

    return (
      <ChartShell chart={chart} index={index}>
        <View style={{ marginLeft: -6 }}>
          <LineChart
            data={lineData}
            width={plotW}
            height={188}
            spacing={spacing}
            initialSpacing={18}
            endSpacing={12}
            curved
            areaChart
            color={accent}
            thickness={3}
            startFillColor={accent}
            endFillColor={accent}
            startOpacity={0.32}
            endOpacity={0.02}
            dataPointsColor={accent}
            dataPointsRadius={4}
            maxValue={niceMax}
            noOfSections={sections}
            yAxisLabelTexts={yLabels}
            yAxisLabelWidth={yAxisLabelWidth}
            yAxisThickness={0}
            xAxisThickness={0}
            yAxisTextStyle={Y_AXIS_TEXT}
            xAxisLabelTextStyle={X_AXIS_TEXT}
            rulesType="dashed"
            rulesColor="rgba(108,99,255,0.12)"
            dashWidth={3}
            dashGap={5}
            hideRules={false}
            isAnimated
            animationDuration={750}
            pointerConfig={{
              pointerStripColor: `${accent}88`,
              pointerStripWidth: 2,
              pointerColor: accent,
              radius: 5,
              activatePointersOnLongPress: false,
              pointerLabelWidth: 90,
              pointerLabelComponent: (items: any[]) => (
                <View style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6,
                  borderWidth: 1, borderColor: `${accent}55`,
                }}>
                  <Text style={{ color: accent, fontSize: 13, fontWeight: '800' }}>
                    {fmtNum(items?.[0]?.value ?? 0)}{chart.unit ? ` ${chart.unit}` : ''}
                  </Text>
                </View>
              ),
            }}
          />
        </View>
      </ChartShell>
    );
  }

  if (chart.type === 'pie') {
    const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
    const pieData = values
      .map((value, i) => ({
        value: Math.max(0, value),
        color: PALETTE[i % PALETTE.length],
        gradientCenterColor: `${PALETTE[i % PALETTE.length]}AA`,
        label: labels[i] ?? `Item ${i + 1}`,
      }))
      .filter(d => d.value > 0);

    if (pieData.length < 1) return null;

    const radius = clamp(plotW * 0.32, 70, 110);
    const innerColor = isLight ? '#FFFFFF' : '#101026';

    return (
      <ChartShell chart={chart} index={index}>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <PieChart
            data={pieData}
            donut
            showGradient
            radius={radius}
            innerRadius={radius * 0.58}
            innerCircleColor={innerColor}
            sectionAutoFocus
            focusOnPress
            strokeColor={innerColor}
            strokeWidth={2}
            centerLabelComponent={() => (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '900' }}>
                  {fmtNum(total)}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 }}>
                  TOTAL
                </Text>
              </View>
            )}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          {pieData.map((d, i) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 5,
                borderWidth: 1, borderColor: `${d.color}33`,
              }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.color }} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  {String(d.label).slice(0, 14)}
                </Text>
                <Text style={{ color: d.color, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </ChartShell>
    );
  }

  return null;
}

interface Props {
  data: InfographicData;
  availableWidth?: number;
}

export function InfographicsPanel({ data, availableWidth }: Props) {
  const panelW = availableWidth ?? SCREEN_W - SPACING.lg * 2;
  const colGap = SPACING.sm;
  const statCardW = (panelW - colGap) / 2;

  const charts = useMemo(() => data.charts ?? [], [data.charts]);
  const stats = useMemo(() => data.stats ?? [], [data.stats]);

  return (
    <View style={{ width: '100%' }}>
      {stats.length > 0 && (
        <View style={{ marginBottom: SPACING.lg }}>
          <SectionLabel icon="speedometer-outline" text="Key Metrics" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: colGap }}>
            {stats.map((stat, i) => (
              <Animated.View
                key={stat.id}
                entering={FadeInDown.duration(420).delay(i * 70)}
                style={{ width: statCardW }}
              >
                <StatCard stat={stat} />
              </Animated.View>
            ))}
          </View>
        </View>
      )}

      {charts.length > 0 && (
        <View>
          <SectionLabel icon="analytics-outline" text="Data Visualizations" />
          {charts.map((chart, i) => (
            <ChartCard key={chart.id} chart={chart} index={i} chartWidth={panelW} />
          ))}
        </View>
      )}
    </View>
  );
}