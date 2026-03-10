// app/(app)/compare-reports.tsx
// Advanced AI-powered report comparison screen.
// Tabs: Metrics · Summaries · Findings · AI Analysis
// AI Analysis calls GPT to produce verdict, strengths, differences, recommendation.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { ResearchReport } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricPoint {
  label: string;
  leftValue: string;
  rightValue: string;
  winner: 'left' | 'right' | 'tie';
}

interface AIComparison {
  verdict: string;
  leftStrengths: string[];
  rightStrengths: string[];
  recommendation: string;
  keyDifferences: string[];
  combinedInsight: string;
}

type ActiveTab = 'metrics' | 'summaries' | 'findings' | 'ai';

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function fetchReport(id: string): Promise<ResearchReport | null> {
  const { data, error } = await supabase
    .from('research_reports')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    query: data.query,
    depth: data.depth,
    focusAreas: data.focus_areas ?? [],
    title: data.title ?? data.query,
    executiveSummary: data.executive_summary ?? '',
    sections: data.sections ?? [],
    keyFindings: data.key_findings ?? [],
    futurePredictions: data.future_predictions ?? [],
    citations: data.citations ?? [],
    statistics: data.statistics ?? [],
    searchQueries: data.search_queries ?? [],
    sourcesCount: data.sources_count ?? 0,
    reliabilityScore: data.reliability_score ?? 0,
    status: data.status,
    agentLogs: data.agent_logs ?? [],
    isPinned: data.is_pinned ?? false,
    createdAt: data.created_at,
    completedAt: data.completed_at,
  };
}

const DEPTH_RANK: Record<string, number> = { quick: 1, deep: 2, expert: 3 };
const DEPTH_LABEL: Record<string, string> = { quick: 'Quick', deep: 'Deep', expert: 'Expert' };

function buildMetrics(L: ResearchReport, R: ResearchReport): MetricPoint[] {
  const cmp = (lv: number, rv: number): MetricPoint['winner'] =>
    lv > rv ? 'left' : lv < rv ? 'right' : 'tie';

  return [
    {
      label: 'Research Depth',
      leftValue: DEPTH_LABEL[L.depth] ?? L.depth,
      rightValue: DEPTH_LABEL[R.depth] ?? R.depth,
      winner: cmp(DEPTH_RANK[L.depth] ?? 0, DEPTH_RANK[R.depth] ?? 0),
    },
    {
      label: 'Sources Analysed',
      leftValue: String(L.sourcesCount),
      rightValue: String(R.sourcesCount),
      winner: cmp(L.sourcesCount, R.sourcesCount),
    },
    {
      label: 'Citations',
      leftValue: String(L.citations.length),
      rightValue: String(R.citations.length),
      winner: cmp(L.citations.length, R.citations.length),
    },
    {
      label: 'Reliability Score',
      leftValue: `${L.reliabilityScore}/10`,
      rightValue: `${R.reliabilityScore}/10`,
      winner: cmp(L.reliabilityScore, R.reliabilityScore),
    },
    {
      label: 'Key Findings',
      leftValue: String(L.keyFindings.length),
      rightValue: String(R.keyFindings.length),
      winner: cmp(L.keyFindings.length, R.keyFindings.length),
    },
    {
      label: 'Future Predictions',
      leftValue: String(L.futurePredictions.length),
      rightValue: String(R.futurePredictions.length),
      winner: cmp(L.futurePredictions.length, R.futurePredictions.length),
    },
    {
      label: 'Report Sections',
      leftValue: String(L.sections.length),
      rightValue: String(R.sections.length),
      winner: cmp(L.sections.length, R.sections.length),
    },
  ];
}

// ─── AI Analysis (direct OpenAI fetch) ───────────────────────────────────────

async function runAIComparison(
  L: ResearchReport,
  R: ResearchReport,
): Promise<AIComparison> {
  const summarise = (r: ResearchReport) =>
    `TITLE: ${r.title}
QUERY: ${r.query}
DEPTH: ${r.depth}
SOURCES: ${r.sourcesCount}  CITATIONS: ${r.citations.length}  RELIABILITY: ${r.reliabilityScore}/10
SUMMARY: ${(r.executiveSummary ?? '').slice(0, 500)}
KEY FINDINGS (top 5): ${r.keyFindings.slice(0, 5).join(' | ')}
PREDICTIONS (top 3): ${r.futurePredictions.slice(0, 3).join(' | ')}`;

  const prompt = `You are an expert research analyst. Compare these two AI-generated research reports and return a structured JSON analysis.

REPORT A:
${summarise(L)}

REPORT B:
${summarise(R)}

Return ONLY valid JSON — no markdown, no code fences — in this exact shape:
{
  "verdict": "1-2 sentences: which is more comprehensive and why",
  "leftStrengths": ["strength 1", "strength 2", "strength 3"],
  "rightStrengths": ["strength 1", "strength 2", "strength 3"],
  "recommendation": "One clear sentence on which to rely on and when",
  "keyDifferences": ["difference 1", "difference 2", "difference 3"],
  "combinedInsight": "What unique value a reader gains by studying both reports together"
}`;

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `OpenAI error ${res.status}`);
  }

  const json = await res.json();
  const raw  = json.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(raw) as AIComparison;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Header card for one of the two reports */
function ReportHeaderCard({
  report,
  side,
}: {
  report: ResearchReport;
  side: 'A' | 'B';
}) {
  const color = side === 'A' ? COLORS.primary : '#A855F7'; // purple for B

  return (
    <View style={{
      flex: 1,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: RADIUS.xl,
      padding: SPACING.md,
      borderWidth: 1.5,
      borderColor: `${color}40`,
    }}>
      <View style={{
        backgroundColor: `${color}20`,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 8, paddingVertical: 3,
        alignSelf: 'flex-start',
        marginBottom: SPACING.sm,
      }}>
        <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>
          Report {side}
        </Text>
      </View>

      <Text
        style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
          fontWeight: '700',
          lineHeight: 20,
        }}
        numberOfLines={3}
      >
        {report.title}
      </Text>

      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 6 }}>
        {new Date(report.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
      </Text>

      <View style={{
        marginTop: SPACING.sm,
        backgroundColor: `${color}12`,
        borderRadius: RADIUS.md,
        paddingHorizontal: 8, paddingVertical: 4,
        alignSelf: 'flex-start',
      }}>
        <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
          {DEPTH_LABEL[report.depth]} · {report.reliabilityScore}/10
        </Text>
      </View>
    </View>
  );
}

/** Single metric comparison row */
function MetricRow({ point, index }: { point: MetricPoint; index: number }) {
  const leftWins  = point.winner === 'left';
  const rightWins = point.winner === 'right';
  const leftColor  = COLORS.primary;
  const rightColor = '#A855F7';

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 45)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: SPACING.sm,
        }}>
          {point.label}
        </Text>

        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {/* Left value */}
          <View style={{
            flex: 1,
            backgroundColor: leftWins ? `${leftColor}15` : COLORS.backgroundElevated,
            borderRadius: RADIUS.md,
            padding: SPACING.sm,
            borderWidth: leftWins ? 1 : 0,
            borderColor: `${leftColor}35`,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
            {leftWins  && <Ionicons name="trophy" size={13} color={leftColor} />}
            {!leftWins && <Ionicons name={point.winner === 'tie' ? 'remove' : 'ellipse-outline'} size={12} color={COLORS.textMuted} />}
            <Text style={{
              color: leftWins ? leftColor : COLORS.textSecondary,
              fontSize: FONTS.sizes.base,
              fontWeight: leftWins ? '800' : '500',
            }}>
              {point.leftValue}
            </Text>
          </View>

          {/* vs */}
          <View style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700' }}>VS</Text>
          </View>

          {/* Right value */}
          <View style={{
            flex: 1,
            backgroundColor: rightWins ? `${rightColor}15` : COLORS.backgroundElevated,
            borderRadius: RADIUS.md,
            padding: SPACING.sm,
            borderWidth: rightWins ? 1 : 0,
            borderColor: `${rightColor}35`,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 6,
          }}>
            <Text style={{
              color: rightWins ? rightColor : COLORS.textSecondary,
              fontSize: FONTS.sizes.base,
              fontWeight: rightWins ? '800' : '500',
            }}>
              {point.rightValue}
            </Text>
            {rightWins  && <Ionicons name="trophy" size={13} color={rightColor} />}
            {!rightWins && <Ionicons name={point.winner === 'tie' ? 'remove' : 'ellipse-outline'} size={12} color={COLORS.textMuted} />}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/** Overall score bar */
function ScoreBar({
  leftWins, rightWins, ties,
}: {
  leftWins: number; rightWins: number; ties: number;
}) {
  const total = leftWins + rightWins + ties;
  const lPct  = total > 0 ? Math.round((leftWins / total) * 100) : 50;
  const rPct  = total > 0 ? Math.round((rightWins / total) * 100) : 50;
  const leftColor  = COLORS.primary;
  const rightColor = '#A855F7';

  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderRadius: RADIUS.xl,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
    }}>
      <Text style={{
        color: COLORS.textMuted,
        fontSize: FONTS.sizes.xs,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        textAlign: 'center',
        marginBottom: SPACING.sm,
      }}>
        Overall Score
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
        <Text style={{
          color: leftColor,
          fontSize: FONTS.sizes.xl,
          fontWeight: '800',
          width: 36, textAlign: 'center',
        }}>
          {leftWins}
        </Text>

        {/* Bar */}
        <View style={{
          flex: 1, height: 12,
          backgroundColor: COLORS.backgroundElevated,
          borderRadius: 6,
          overflow: 'hidden',
          flexDirection: 'row',
        }}>
          {lPct > 0 && (
            <View style={{
              width: `${lPct}%` as any,
              backgroundColor: leftColor,
              borderRadius: 6,
            }} />
          )}
          {rPct > 0 && (
            <View style={{
              width: `${rPct}%` as any,
              backgroundColor: rightColor,
              borderRadius: 6,
            }} />
          )}
        </View>

        <Text style={{
          color: rightColor,
          fontSize: FONTS.sizes.xl,
          fontWeight: '800',
          width: 36, textAlign: 'center',
        }}>
          {rightWins}
        </Text>
      </View>

      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingHorizontal: 36,
      }}>
        <Text style={{ color: leftColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
          Report A
        </Text>
        {ties > 0 && (
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {ties} tie{ties !== 1 ? 's' : ''}
          </Text>
        )}
        <Text style={{ color: rightColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
          Report B
        </Text>
      </View>
    </View>
  );
}

/** AI analysis result card */
function AICard({ ai }: { ai: AIComparison }) {
  const leftColor  = COLORS.primary;
  const rightColor = '#A855F7';

  return (
    <Animated.View entering={FadeInDown.duration(500)}>

      {/* Verdict */}
      <LinearGradient
        colors={['#1A1A40', '#0D0D28']}
        style={{
          borderRadius: RADIUS.xl,
          padding: SPACING.lg,
          marginBottom: SPACING.md,
          borderWidth: 1,
          borderColor: `${COLORS.primary}35`,
        }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: SPACING.md,
        }}>
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={{
              width: 36, height: 36, borderRadius: 10,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="sparkles" size={17} color="#FFF" />
          </LinearGradient>
          <Text style={{
            color: COLORS.textPrimary,
            fontSize: FONTS.sizes.base,
            fontWeight: '800',
          }}>
            AI Verdict
          </Text>
        </View>
        <Text style={{
          color: COLORS.textSecondary,
          fontSize: FONTS.sizes.sm,
          lineHeight: 22,
        }}>
          {ai.verdict}
        </Text>
      </LinearGradient>

      {/* Recommendation */}
      <View style={{
        backgroundColor: `${COLORS.success}10`,
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderColor: `${COLORS.success}25`,
      }}>
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: `${COLORS.success}20`,
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Ionicons name="checkmark-done" size={17} color={COLORS.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            color: COLORS.success,
            fontSize: FONTS.sizes.xs,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}>
            Recommendation
          </Text>
          <Text style={{
            color: COLORS.textPrimary,
            fontSize: FONTS.sizes.sm,
            lineHeight: 20,
          }}>
            {ai.recommendation}
          </Text>
        </View>
      </View>

      {/* Strengths side by side */}
      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
        {[
          { label: 'Report A Strengths', items: ai.leftStrengths,  color: leftColor  },
          { label: 'Report B Strengths', items: ai.rightStrengths, color: rightColor },
        ].map(({ label, items, color }) => (
          <View
            key={label}
            style={{
              flex: 1,
              backgroundColor: COLORS.backgroundCard,
              borderRadius: RADIUS.xl,
              padding: SPACING.md,
              borderWidth: 1,
              borderColor: `${color}25`,
            }}
          >
            <Text style={{
              color,
              fontSize: FONTS.sizes.xs,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: SPACING.sm,
            }}>
              {label}
            </Text>
            {items.map((s, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: color,
                  marginTop: 6, flexShrink: 0,
                }} />
                <Text style={{
                  color: COLORS.textSecondary,
                  fontSize: FONTS.sizes.xs,
                  lineHeight: 18,
                  flex: 1,
                }}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Key differences */}
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: SPACING.sm,
        }}>
          Key Differences
        </Text>
        {ai.keyDifferences.map((d, i) => (
          <View key={i} style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 8,
          }}>
            <View style={{
              width: 22, height: 22, borderRadius: 6,
              backgroundColor: `${COLORS.warning}20`,
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '800' }}>
                {i + 1}
              </Text>
            </View>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              lineHeight: 20,
              flex: 1,
            }}>
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Combined insight */}
      <View style={{
        backgroundColor: `${COLORS.info}10`,
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: `${COLORS.info}25`,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: `${COLORS.info}20`,
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Ionicons name="layers-outline" size={17} color={COLORS.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            color: COLORS.info,
            fontSize: FONTS.sizes.xs,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}>
            Read Both For...
          </Text>
          <Text style={{
            color: COLORS.textSecondary,
            fontSize: FONTS.sizes.sm,
            lineHeight: 20,
          }}>
            {ai.combinedInsight}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CompareReportsScreen() {
  const { leftId, rightId } =
    useLocalSearchParams<{ leftId: string; rightId: string }>();

  const [leftReport,  setLeftReport]  = useState<ResearchReport | null>(null);
  const [rightReport, setRightReport] = useState<ResearchReport | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<ActiveTab>('metrics');

  const [aiResult,  setAiResult]  = useState<AIComparison | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);

  // ── Load reports ────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [l, r] = await Promise.all([
        fetchReport(leftId  ?? ''),
        fetchReport(rightId ?? ''),
      ]);
      if (!l || !r) {
        Alert.alert('Error', 'Could not load one or both reports.');
        router.back();
        return;
      }
      setLeftReport(l);
      setRightReport(r);
      setLoading(false);
    })();
  }, [leftId, rightId]);

  // ── AI analysis ─────────────────────────────────────────────────────────────

  const handleRunAI = useCallback(async () => {
    if (!leftReport || !rightReport) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await runAIComparison(leftReport, rightReport);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }, [leftReport, rightReport]);

  // Auto-trigger AI when switching to the AI tab for the first time
  const handleTabPress = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'ai' && !aiResult && !aiLoading && !aiError) {
      handleRunAI();
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{
            color: COLORS.textMuted,
            fontSize: FONTS.sizes.sm,
            marginTop: SPACING.md,
          }}>
            Loading reports...
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!leftReport || !rightReport) return null;

  const metrics   = buildMetrics(leftReport, rightReport);
  const leftWins  = metrics.filter((m) => m.winner === 'left').length;
  const rightWins = metrics.filter((m) => m.winner === 'right').length;
  const ties      = metrics.filter((m) => m.winner === 'tie').length;

  const TABS: { key: ActiveTab; label: string; icon: string }[] = [
    { key: 'metrics',   label: 'Metrics',      icon: 'bar-chart-outline'      },
    { key: 'summaries', label: 'Summaries',     icon: 'document-text-outline'  },
    { key: 'findings',  label: 'Findings',      icon: 'list-outline'           },
    { key: 'ai',        label: 'AI Analysis',   icon: 'sparkles'               },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.lg,
            paddingBottom: SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.sm,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.md,
              fontWeight: '800',
            }}>
              Compare Reports
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              A wins: {leftWins}  ·  B wins: {rightWins}  ·  {ties} tie{ties !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* AI quick-launch button */}
          <TouchableOpacity
            onPress={() => handleTabPress('ai')}
            disabled={aiLoading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: `${COLORS.primary}20`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 12, paddingVertical: 7,
              borderWidth: 1,
              borderColor: `${COLORS.primary}35`,
            }}
          >
            {aiLoading
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="sparkles" size={14} color={COLORS.primary} />
            }
            <Text style={{
              color: COLORS.primary,
              fontSize: FONTS.sizes.xs,
              fontWeight: '700',
            }}>
              {aiLoading ? 'Analysing...' : aiResult ? 'View AI' : 'AI Analyse'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Report header cards ───────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row',
          padding: SPACING.lg,
          paddingBottom: SPACING.sm,
          gap: SPACING.sm,
        }}>
          <ReportHeaderCard report={leftReport}  side="A" />
          <ReportHeaderCard report={rightReport} side="B" />
        </View>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            gap: 8,
            paddingBottom: SPACING.sm,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isActive ? COLORS.primary : COLORS.backgroundCard,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: isActive ? COLORS.primary : COLORS.border,
                }}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={13}
                  color={isActive ? '#FFF' : COLORS.textMuted}
                />
                <Text style={{
                  color: isActive ? '#FFF' : COLORS.textMuted,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '600',
                }}>
                  {tab.label}
                </Text>
                {/* Green dot when AI result is ready */}
                {tab.key === 'ai' && aiResult && (
                  <View style={{
                    width: 7, height: 7, borderRadius: 3.5,
                    backgroundColor: COLORS.success,
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Tab content ───────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >

          {/* METRICS */}
          {activeTab === 'metrics' && (
            <>
              <ScoreBar leftWins={leftWins} rightWins={rightWins} ties={ties} />
              {metrics.map((m, i) => (
                <MetricRow key={m.label} point={m} index={i} />
              ))}
            </>
          )}

          {/* SUMMARIES */}
          {activeTab === 'summaries' && (
            <>
              {[
                { report: leftReport,  side: 'A', color: COLORS.primary },
                { report: rightReport, side: 'B', color: '#A855F7'      },
              ].map(({ report, side, color }) => (
                <Animated.View
                  key={side}
                  entering={FadeInDown.duration(400)}
                  style={{
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.xl,
                    padding: SPACING.lg,
                    marginBottom: SPACING.md,
                    borderWidth: 1.5,
                    borderColor: `${color}30`,
                  }}
                >
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: SPACING.md,
                  }}>
                    <View style={{
                      backgroundColor: `${color}20`,
                      borderRadius: RADIUS.sm,
                      paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>
                        Report {side}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: COLORS.textPrimary,
                        fontSize: FONTS.sizes.base,
                        fontWeight: '700',
                        flex: 1,
                      }}
                      numberOfLines={2}
                    >
                      {report.title}
                    </Text>
                  </View>
                  <Text style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    lineHeight: 22,
                  }}>
                    {report.executiveSummary || 'No executive summary available.'}
                  </Text>
                </Animated.View>
              ))}
            </>
          )}

          {/* FINDINGS */}
          {activeTab === 'findings' && (
            <>
              {[
                { report: leftReport,  side: 'A', color: COLORS.primary },
                { report: rightReport, side: 'B', color: '#A855F7'      },
              ].map(({ report, side, color }) => (
                <Animated.View
                  key={side}
                  entering={FadeInDown.duration(400)}
                  style={{ marginBottom: SPACING.xl }}
                >
                  {/* Section label */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: SPACING.sm,
                  }}>
                    <View style={{
                      backgroundColor: `${color}20`,
                      borderRadius: RADIUS.sm,
                      paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>
                        Report {side}
                      </Text>
                    </View>
                    <Text style={{
                      color: COLORS.textMuted,
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '600',
                    }}>
                      Key Findings ({report.keyFindings.length})
                    </Text>
                  </View>

                  {report.keyFindings.length === 0 ? (
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                      No findings recorded.
                    </Text>
                  ) : (
                    report.keyFindings.map((f, i) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: COLORS.backgroundCard,
                          borderRadius: RADIUS.lg,
                          padding: SPACING.md,
                          marginBottom: SPACING.sm,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderLeftWidth: 3,
                          borderLeftColor: color,
                        }}
                      >
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: `${color}20`,
                          alignItems: 'center', justifyContent: 'center',
                          marginRight: SPACING.sm,
                          flexShrink: 0,
                        }}>
                          <Text style={{ color, fontSize: 10, fontWeight: '700' }}>
                            {i + 1}
                          </Text>
                        </View>
                        <Text style={{
                          color: COLORS.textPrimary,
                          fontSize: FONTS.sizes.sm,
                          lineHeight: 20,
                          flex: 1,
                        }}>
                          {f}
                        </Text>
                      </View>
                    ))
                  )}

                  {/* Predictions */}
                  {report.futurePredictions.length > 0 && (
                    <>
                      <Text style={{
                        color: COLORS.textMuted,
                        fontSize: FONTS.sizes.xs,
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        marginBottom: SPACING.sm,
                        marginTop: SPACING.sm,
                      }}>
                        Predictions
                      </Text>
                      {report.futurePredictions.slice(0, 3).map((p, i) => (
                        <View
                          key={i}
                          style={{
                            backgroundColor: `${COLORS.warning}10`,
                            borderRadius: RADIUS.lg,
                            padding: SPACING.sm,
                            marginBottom: SPACING.sm,
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                            borderWidth: 1,
                            borderColor: `${COLORS.warning}25`,
                          }}
                        >
                          <Ionicons
                            name="telescope-outline"
                            size={14}
                            color={COLORS.warning}
                            style={{ marginTop: 2 }}
                          />
                          <Text style={{
                            color: COLORS.textSecondary,
                            fontSize: FONTS.sizes.xs,
                            lineHeight: 18,
                            flex: 1,
                          }}>
                            {p}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </Animated.View>
              ))}
            </>
          )}

          {/* AI ANALYSIS */}
          {activeTab === 'ai' && (
            <>
              {/* Loading */}
              {aiLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      width: 68, height: 68, borderRadius: 20,
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: SPACING.lg,
                    }}
                  >
                    <Ionicons name="sparkles" size={30} color="#FFF" />
                  </LinearGradient>
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.lg,
                    fontWeight: '700',
                    marginBottom: SPACING.sm,
                  }}>
                    Analysing Reports...
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.sm,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}>
                    AI is comparing both reports,{'\n'}identifying strengths and differences.
                  </Text>
                  <ActivityIndicator
                    color={COLORS.primary}
                    style={{ marginTop: SPACING.xl }}
                  />
                </View>
              )}

              {/* Error */}
              {aiError && !aiLoading && (
                <View style={{
                  backgroundColor: `${COLORS.error}10`,
                  borderRadius: RADIUS.xl,
                  padding: SPACING.lg,
                  borderWidth: 1,
                  borderColor: `${COLORS.error}25`,
                  alignItems: 'center',
                }}>
                  <Ionicons
                    name="warning-outline"
                    size={34}
                    color={COLORS.error}
                    style={{ marginBottom: SPACING.md }}
                  />
                  <Text style={{
                    color: COLORS.error,
                    fontSize: FONTS.sizes.base,
                    fontWeight: '700',
                    marginBottom: SPACING.sm,
                  }}>
                    Analysis Failed
                  </Text>
                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.sm,
                    textAlign: 'center',
                    marginBottom: SPACING.lg,
                  }}>
                    {aiError}
                  </Text>
                  <TouchableOpacity
                    onPress={handleRunAI}
                    style={{
                      backgroundColor: COLORS.primary,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: SPACING.xl,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Prompt to run */}
              {!aiResult && !aiLoading && !aiError && (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <LinearGradient
                    colors={['#1A1A40', '#0D0D28']}
                    style={{
                      width: 88, height: 88, borderRadius: 26,
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: SPACING.lg,
                      borderWidth: 1,
                      borderColor: `${COLORS.primary}30`,
                    }}
                  >
                    <Ionicons name="sparkles" size={40} color={COLORS.primary} />
                  </LinearGradient>

                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.lg,
                    fontWeight: '800',
                    textAlign: 'center',
                    marginBottom: SPACING.sm,
                  }}>
                    AI Report Analysis
                  </Text>

                  <Text style={{
                    color: COLORS.textMuted,
                    fontSize: FONTS.sizes.sm,
                    textAlign: 'center',
                    lineHeight: 20,
                    marginBottom: SPACING.xl,
                    paddingHorizontal: SPACING.xl,
                  }}>
                    Get an AI verdict, strengths, key differences, and a clear recommendation on which report to rely on.
                  </Text>

                  <TouchableOpacity onPress={handleRunAI} activeOpacity={0.85}>
                    <LinearGradient
                      colors={COLORS.gradientPrimary}
                      style={{
                        borderRadius: RADIUS.full,
                        paddingHorizontal: SPACING.xl,
                        paddingVertical: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Ionicons name="sparkles" size={18} color="#FFF" />
                      <Text style={{
                        color: '#FFF',
                        fontWeight: '800',
                        fontSize: FONTS.sizes.base,
                      }}>
                        Run AI Analysis
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}

              {/* Result */}
              {aiResult && !aiLoading && (
                <AICard ai={aiResult} />
              )}
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}