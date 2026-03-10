// app/(app)/knowledge-graph.tsx
// Fixed: useKnowledgeGraph now accepts null — no crash before report loads.

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { KnowledgeGraphView } from '../../src/components/research/KnowledgeGraph';
import { useKnowledgeGraph } from '../../src/hooks/useKnowledgeGraph';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ResearchReport, KnowledgeGraphNode } from '../../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

export default function KnowledgeGraphScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);

  // ── Load report ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!reportId) return;
    (async () => {
      const { data } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (data) {
        setReport({
          id:               data.id,
          userId:           data.user_id,
          query:            data.query,
          depth:            data.depth,
          focusAreas:       data.focus_areas ?? [],
          title:            data.title ?? data.query,
          executiveSummary: data.executive_summary ?? '',
          sections:         data.sections ?? [],
          keyFindings:      data.key_findings ?? [],
          futurePredictions:data.future_predictions ?? [],
          citations:        data.citations ?? [],
          statistics:       data.statistics ?? [],
          searchQueries:    data.search_queries ?? [],
          sourcesCount:     data.sources_count ?? 0,
          reliabilityScore: data.reliability_score ?? 0,
          status:           data.status,
          agentLogs:        data.agent_logs ?? [],
          knowledgeGraph:   data.knowledge_graph  ?? undefined,
          infographicData:  data.infographic_data ?? undefined,
          sourceImages:     data.source_images    ?? [],
          isPublic:         data.is_public        ?? false,
          publicToken:      data.public_token      ?? undefined,
          createdAt:        data.created_at,
          completedAt:      data.completed_at,
        });
      }
      setLoadingReport(false);
    })();
  }, [reportId]);

  // ── Hook — safe: report can be null here ────────────────────────────────
  const { graph, generating, generate } = useKnowledgeGraph(report);

  // ── Derived ──────────────────────────────────────────────────────────────

  const nodeTypeCount: [string, number][] = graph
    ? Object.entries(
        graph.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.type] = (acc[n.type] ?? 0) + 1;
          return acc;
        }, {})
      )
    : [];

  // ── Render ───────────────────────────────────────────────────────────────

  if (loadingReport) return <LoadingOverlay visible message="Loading graph…" />;

  // Report failed to load
  if (!report) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md }}>
            Report Not Found
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.lg }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            padding: SPACING.lg, paddingBottom: SPACING.sm,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text
              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}
              numberOfLines={1}
            >
              Knowledge Graph
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {report.title}
            </Text>
          </View>

          {!graph && !generating && (
            <TouchableOpacity
              onPress={generate}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: `${COLORS.primary}20`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1, borderColor: `${COLORS.primary}30`,
              }}
            >
              <Ionicons name="sparkles" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                Generate
              </Text>
            </TouchableOpacity>
          )}

          {generating && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Building…</Text>
            </View>
          )}
        </Animated.View>

        <ScrollView
          contentContainerStyle={{
            padding: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Empty state ── */}
          {!graph && !generating && (
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <LinearGradient
                colors={['#1A1A35', '#12122A']}
                style={{
                  width: 80, height: 80, borderRadius: 24,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: SPACING.lg,
                  borderWidth: 1, borderColor: `${COLORS.primary}20`,
                }}
              >
                <Ionicons name="git-network-outline" size={36} color={COLORS.primary} />
              </LinearGradient>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
                fontWeight: '700', textAlign: 'center', marginBottom: 8,
              }}>
                No Knowledge Graph Yet
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                textAlign: 'center', lineHeight: 20,
                paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl,
              }}>
                Generate an interactive visual map of the concepts, entities,
                and relationships in this research report.
              </Text>
              <TouchableOpacity onPress={generate} activeOpacity={0.85}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    borderRadius: RADIUS.full,
                    paddingVertical: 14, paddingHorizontal: SPACING.xl,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="sparkles" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Generate Knowledge Graph
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Generating ── */}
          {generating && (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                fontWeight: '600', marginTop: SPACING.lg,
              }}>
                Mapping Knowledge Structure…
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                marginTop: 8, textAlign: 'center', lineHeight: 20,
              }}>
                AI is identifying entities, concepts,{'\n'}
                companies, and their relationships.
              </Text>
            </View>
          )}

          {/* ── Graph ── */}
          {graph && !generating && (
            <>
              {/* Stats bar */}
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg,
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.lg, padding: SPACING.md,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                {[
                  { label: 'Nodes',  value: graph.nodes.length,                                 icon: 'ellipse-outline'    },
                  { label: 'Edges',  value: graph.edges.length,                                 icon: 'git-branch-outline' },
                  { label: 'Types',  value: new Set(graph.nodes.map(n => n.type)).size,         icon: 'layers-outline'     },
                ].map(stat => (
                  <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                    <Ionicons name={stat.icon as any} size={14} color={COLORS.primary} />
                    <Text style={{
                      color: COLORS.primary, fontSize: FONTS.sizes.md,
                      fontWeight: '800', marginTop: 4,
                    }}>
                      {stat.value}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </Animated.View>

              {/* Graph canvas */}
              <KnowledgeGraphView
                graph={graph}
                height={460}
                onNodePress={setSelectedNode}
              />

              {/* Node type breakdown */}
              <View style={{ marginTop: SPACING.lg }}>
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                  letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Node Breakdown
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                  {nodeTypeCount.map(([type, count]) => (
                    <View
                      key={type}
                      style={{
                        backgroundColor: COLORS.backgroundCard,
                        borderRadius: RADIUS.lg,
                        paddingHorizontal: 12, paddingVertical: 8,
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        borderWidth: 1, borderColor: COLORS.border,
                      }}
                    >
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: COLORS.primary,
                      }} />
                      <Text style={{
                        color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                        fontWeight: '600', textTransform: 'capitalize',
                      }}>
                        {type}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                        {count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Regenerate */}
              <TouchableOpacity
                onPress={generate}
                style={{
                  marginTop: SPACING.lg,
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg, paddingVertical: 12,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                }}>
                  Regenerate Graph
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}