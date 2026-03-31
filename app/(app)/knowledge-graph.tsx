// app/(app)/knowledge-graph.tsx
// Advanced Knowledge Graph Screen — Part 4 (Upgraded)
//
// Features:
//  • 4-stat header strip (nodes, edges, clusters, types)
//  • Graph canvas via updated KnowledgeGraphView
//  • Edge category breakdown chips
//  • Node type breakdown with colored dots
//  • Top-5 highest-weight nodes list
//  • Regenerate with credit-aware messaging
//  • Empty state and loading state

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }                      from '../../src/lib/supabase';
import { KnowledgeGraphView }            from '../../src/components/research/KnowledgeGraph';
import { useKnowledgeGraph }             from '../../src/hooks/useKnowledgeGraph';
import { LoadingOverlay }                from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ResearchReport, KnowledgeGraphNode } from '../../src/types';
import type { ExtendedKnowledgeGraph, KnowledgeGraphCluster } from '../../src/services/agents/knowledgeGraphAgent';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Node type display config ─────────────────────────────────────────────────

const NODE_TYPE_COLORS: Record<string, string> = {
  root:      '#6C63FF',
  primary:   '#4FACFE',
  secondary: '#43E97B',
  concept:   '#F093FB',
  company:   '#FA709A',
  trend:     '#F9CB42',
};

const NODE_TYPE_ICONS: Record<string, string> = {
  root:      'radio-button-on',
  primary:   'layers',
  secondary: 'ellipse',
  concept:   'bulb',
  company:   'business',
  trend:     'trending-up',
};

const EDGE_CATEGORY_COLORS: Record<string, string> = {
  causal:       '#6C63FF',
  comparative:  '#F9CB42',
  hierarchical: '#43E97B',
  temporal:     '#4FACFE',
  associative:  '#A0A0C0',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function KnowledgeGraphScreen() {
  const { reportId }  = useLocalSearchParams<{ reportId: string }>();
  const insets        = useSafeAreaInsets();
  const [report,      setReport]      = useState<ResearchReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [selectedNode, setSelectedNode]   = useState<KnowledgeGraphNode | null>(null);

  // ── Load report ────────────────────────────────────────────────────────────

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
          id:                data.id,
          userId:            data.user_id,
          query:             data.query,
          depth:             data.depth,
          focusAreas:        data.focus_areas        ?? [],
          title:             data.title              ?? data.query,
          executiveSummary:  data.executive_summary  ?? '',
          sections:          data.sections           ?? [],
          keyFindings:       data.key_findings        ?? [],
          futurePredictions: data.future_predictions  ?? [],
          citations:         data.citations           ?? [],
          statistics:        data.statistics          ?? [],
          searchQueries:     data.search_queries      ?? [],
          sourcesCount:      data.sources_count       ?? 0,
          reliabilityScore:  data.reliability_score   ?? 0,
          status:            data.status,
          agentLogs:         data.agent_logs          ?? [],
          knowledgeGraph:    data.knowledge_graph     ?? undefined,
          infographicData:   data.infographic_data    ?? undefined,
          sourceImages:      data.source_images       ?? [],
          createdAt:         data.created_at,
          completedAt:       data.completed_at,
        });
      }
      setLoadingReport(false);
    })();
  }, [reportId]);

  // ── Hook ───────────────────────────────────────────────────────────────────

  const { graph, generating, generate } = useKnowledgeGraph(report);
  const extended = graph as ExtendedKnowledgeGraph | null;

  // ── Derived stats ──────────────────────────────────────────────────────────

  const nodeTypeBreakdown: [string, number][] = graph
    ? Object.entries(
        graph.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.type] = (acc[n.type] ?? 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : [];

  const edgeCategoryBreakdown: [string, number][] = graph
    ? Object.entries(
        graph.edges.reduce<Record<string, number>>((acc, e) => {
          const cat = (e as any).category ?? 'associative';
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : [];

  const topNodes: KnowledgeGraphNode[] = graph
    ? [...graph.nodes]
        .filter(n => n.type !== 'root')
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 6)
    : [];

  const clusterCount = extended?.clusters?.length ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingReport) return <LoadingOverlay visible message="Loading report…" />;

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
          entering={FadeIn.duration(350)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: SPACING.sm,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.sm, flexShrink: 0,
              borderWidth: 1, borderColor: COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginRight: SPACING.sm }}>
            <Text
              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}
              numberOfLines={1}
            >
              {extended?.topicTitle ?? 'Knowledge Graph'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
              {report.title}
            </Text>
          </View>

          {/* Generate / regenerate button */}
          {!generating && (
            <TouchableOpacity
              onPress={generate}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: graph ? COLORS.backgroundElevated : `${COLORS.primary}20`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1,
                borderColor: graph ? COLORS.border : `${COLORS.primary}40`,
              }}
            >
              <Ionicons
                name={graph ? 'refresh-outline' : 'sparkles'}
                size={13}
                color={graph ? COLORS.textMuted : COLORS.primary}
              />
              <Text style={{
                color: graph ? COLORS.textMuted : COLORS.primary,
                fontSize: FONTS.sizes.xs, fontWeight: '700',
              }}>
                {graph ? 'Regenerate' : 'Generate'}
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

        {/* ── Scrollable content ── */}
        <ScrollView
          contentContainerStyle={{
            padding: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.xl,
          }}
          showsVerticalScrollIndicator={false}
        >

          {/* ─── EMPTY STATE ── */}
          {!graph && !generating && (
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <LinearGradient
                colors={['#1A1A35', '#10102A']}
                style={{
                  width: 88, height: 88, borderRadius: 26,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: SPACING.lg,
                  borderWidth: 1, borderColor: `${COLORS.primary}25`,
                  ...SHADOWS.medium,
                }}
              >
                <Ionicons name="git-network-outline" size={40} color={COLORS.primary} />
              </LinearGradient>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
                fontWeight: '800', textAlign: 'center', marginBottom: 10,
              }}>
                No Knowledge Graph Yet
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                textAlign: 'center', lineHeight: 21,
                paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl,
              }}>
                Generate an interactive visual map of every concept, company, trend,
                and relationship extracted from this research report.
              </Text>

              {/* Feature chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: SPACING.xl }}>
                {[
                  { icon: 'git-branch-outline',  label: 'Cluster detection'  },
                  { icon: 'search-outline',       label: 'Node search'        },
                  { icon: 'layers-outline',       label: 'Type filtering'     },
                  { icon: 'information-circle',   label: 'Rich node details'  },
                ].map(f => (
                  <View key={f.label} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <Ionicons name={f.icon as any} size={12} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
                      {f.label}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={generate} activeOpacity={0.85}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    borderRadius: RADIUS.full,
                    paddingVertical: 15, paddingHorizontal: SPACING.xl,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    ...SHADOWS.medium,
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

          {/* ─── GENERATING STATE ── */}
          {generating && (
            <View style={{ alignItems: 'center', paddingVertical: 70 }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                fontWeight: '700', marginTop: SPACING.lg, textAlign: 'center',
              }}>
                Mapping Knowledge Structure…
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                marginTop: 10, textAlign: 'center', lineHeight: 21,
              }}>
                AI is identifying entities, clusters,{'\n'}
                relationships, and thematic communities.
              </Text>

              {/* Animated step list */}
              <View style={{ marginTop: SPACING.lg, width: '100%', paddingHorizontal: SPACING.xl }}>
                {[
                  'Extracting named entities…',
                  'Clustering by theme…',
                  'Classifying relationship types…',
                  'Scoring node importance…',
                  'Running force layout…',
                ].map((step, i) => (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 6,
                  }}>
                    <ActivityIndicator size="small" color={`${COLORS.primary}60`} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ─── GRAPH READY ── */}
          {graph && !generating && (
            <>
              {/* Stats strip */}
              <Animated.View
                entering={FadeInDown.duration(350)}
                style={{
                  flexDirection: 'row', gap: SPACING.sm,
                  marginBottom: SPACING.lg,
                }}
              >
                {[
                  { label: 'Nodes',    value: graph.nodes.length,                                icon: 'ellipse-outline',    color: COLORS.primary   },
                  { label: 'Edges',    value: graph.edges.length,                                icon: 'git-branch-outline', color: COLORS.info      },
                  { label: 'Clusters', value: clusterCount,                                      icon: 'grid-outline',       color: COLORS.warning   },
                  { label: 'Types',    value: new Set(graph.nodes.map(n => n.type)).size,        icon: 'layers-outline',     color: COLORS.success   },
                ].map(s => (
                  <View key={s.label} style={{
                    flex: 1, backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.lg, padding: SPACING.sm,
                    alignItems: 'center',
                    borderWidth: 1, borderColor: COLORS.border,
                    borderTopWidth: 2, borderTopColor: `${s.color}50`,
                  }}>
                    <Ionicons name={s.icon as any} size={14} color={s.color} />
                    <Text style={{ color: s.color, fontSize: FONTS.sizes.md, fontWeight: '800', marginTop: 4 }}>
                      {s.value}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </Animated.View>

              {/* Graph canvas */}
              <KnowledgeGraphView
                graph={graph}
                height={500}
                onNodePress={node => setSelectedNode(node)}
              />

              {/* ── Edge category breakdown ── */}
              {edgeCategoryBreakdown.length > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(350).delay(100)}
                  style={{
                    marginTop: SPACING.lg,
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.xl,
                    padding: SPACING.md,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
                  }}>
                    Relationship Types
                  </Text>
                  {edgeCategoryBreakdown.map(([cat, count]) => {
                    const color = EDGE_CATEGORY_COLORS[cat] ?? COLORS.textMuted;
                    const total = graph.edges.length;
                    const pct   = Math.round((count / total) * 100);
                    return (
                      <View key={cat} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                            <Text style={{
                              color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                              fontWeight: '600', textTransform: 'capitalize',
                            }}>
                              {cat}
                            </Text>
                          </View>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                            {count} ({pct}%)
                          </Text>
                        </View>
                        <View style={{
                          height: 4, backgroundColor: COLORS.backgroundElevated,
                          borderRadius: 2, overflow: 'hidden',
                        }}>
                          <View style={{
                            width: `${pct}%`, height: '100%',
                            backgroundColor: color, borderRadius: 2,
                            opacity: 0.7,
                          }} />
                        </View>
                      </View>
                    );
                  })}
                </Animated.View>
              )}

              {/* ── Node type breakdown ── */}
              <Animated.View
                entering={FadeInDown.duration(350).delay(200)}
                style={{ marginTop: SPACING.md }}
              >
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                  letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Node Types
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                  {nodeTypeBreakdown.map(([type, count]) => (
                    <View key={type} style={{
                      backgroundColor: COLORS.backgroundCard,
                      borderRadius: RADIUS.lg,
                      paddingHorizontal: 12, paddingVertical: 9,
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      borderWidth: 1, borderColor: COLORS.border,
                      minWidth: 90,
                    }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 8,
                        backgroundColor: `${NODE_TYPE_COLORS[type] ?? COLORS.primary}20`,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons
                          name={(NODE_TYPE_ICONS[type] ?? 'ellipse') as any}
                          size={13}
                          color={NODE_TYPE_COLORS[type] ?? COLORS.primary}
                        />
                      </View>
                      <View>
                        <Text style={{
                          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                          fontWeight: '700', textTransform: 'capitalize',
                        }}>
                          {type}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                          {count} node{count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Animated.View>

              {/* ── Top nodes by weight ── */}
              {topNodes.length > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(350).delay(300)}
                  style={{
                    marginTop: SPACING.lg,
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.xl,
                    padding: SPACING.md,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
                  }}>
                    Most Important Nodes
                  </Text>
                  {topNodes.map((n, i) => (
                    <View key={n.id} style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: i < topNodes.length - 1 ? 1 : 0,
                      borderBottomColor: COLORS.border,
                    }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 7,
                        backgroundColor: `${NODE_TYPE_COLORS[n.type] ?? COLORS.primary}20`,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: SPACING.sm,
                      }}>
                        <Text style={{
                          color: NODE_TYPE_COLORS[n.type] ?? COLORS.primary,
                          fontSize: 9, fontWeight: '800',
                        }}>
                          {i + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          color: COLORS.textPrimary,
                          fontSize: FONTS.sizes.sm, fontWeight: '600',
                        }}>
                          {n.label}
                        </Text>
                        {n.description ? (
                          <Text
                            style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}
                            numberOfLines={1}
                          >
                            {n.description}
                          </Text>
                        ) : null}
                      </View>
                      {/* Weight bar */}
                      <View style={{ alignItems: 'flex-end', minWidth: 48 }}>
                        <View style={{
                          height: 3, width: 40, backgroundColor: COLORS.backgroundElevated,
                          borderRadius: 2, overflow: 'hidden',
                        }}>
                          <View style={{
                            width: `${n.weight * 10}%`, height: '100%',
                            backgroundColor: NODE_TYPE_COLORS[n.type] ?? COLORS.primary,
                            borderRadius: 2,
                          }} />
                        </View>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 3 }}>
                          {n.weight}/10
                        </Text>
                      </View>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* ── Cluster summary ── */}
              {extended?.clusters && extended.clusters.length > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(350).delay(400)}
                  style={{
                    marginTop: SPACING.md,
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius: RADIUS.xl,
                    padding: SPACING.md,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
                  }}>
                    Thematic Clusters
                  </Text>
                  {extended.clusters.map((c: KnowledgeGraphCluster, i: number) => (
                    <View key={c.id} style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: i < extended.clusters.length - 1 ? 1 : 0,
                      borderBottomColor: COLORS.border,
                    }}>
                      <View style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: c.color,
                        marginRight: SPACING.sm,
                      }} />
                      <Text style={{
                        color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                        fontWeight: '600', flex: 1,
                      }}>
                        {c.label}
                      </Text>
                      <View style={{
                        backgroundColor: `${c.color}20`,
                        borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
                      }}>
                        <Text style={{ color: c.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                          {c.nodeIds.length} nodes
                        </Text>
                      </View>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* ── Regenerate footer ── */}
              <TouchableOpacity
                onPress={generate}
                style={{
                  marginTop: SPACING.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg, paddingVertical: 12,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <Ionicons name="refresh-outline" size={15} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
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