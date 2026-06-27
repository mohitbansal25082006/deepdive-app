// src/services/agents/knowledgeGraphAgent.ts
// Advanced Knowledge Graph Agent — Part 4 (Upgraded)
// Part 56 — Cost: routed to NANO tier (gpt-4.1-nano). Converting a report into a
//   structured node/edge/cluster JSON is a mechanical transformation that nano
//   performs reliably for ~25x less than gpt-4o.

import { chatCompletionJSON }       from '../openaiClient';
import { modelFor }                 from '../../constants/aiModels';
import {
  ResearchReport,
  KnowledgeGraph,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
} from '../../types';

// ─── Extended raw output from the LLM ────────────────────────────────────────

export interface KnowledgeGraphCluster {
  id:    string;
  label: string;
  color: string;
  nodeIds: string[];
}

export interface ExtendedKnowledgeGraph extends KnowledgeGraph {
  clusters:   KnowledgeGraphCluster[];
  topicTitle: string;
}

interface RawNodeOutput {
  id:           string;
  label:        string;
  type:         'root' | 'primary' | 'secondary' | 'concept' | 'company' | 'trend';
  weight:       number;
  description:  string;
  clusterId?:   string;
  sentiment?:   'positive' | 'neutral' | 'negative';
  tier?:        number;
  year?:        string;
  value?:       string;
}

interface RawEdgeOutput {
  id:          string;
  source:      string;
  target:      string;
  label?:      string;
  strength:    number;
  category?:   'causal' | 'comparative' | 'hierarchical' | 'temporal' | 'associative';
  directed?:   boolean;
}

interface RawClusterOutput {
  id:    string;
  label: string;
  color: string;
  nodeIds: string[];
}

interface RawGraphOutput {
  topicTitle: string;
  nodes:      RawNodeOutput[];
  edges:      RawEdgeOutput[];
  clusters:   RawClusterOutput[];
}

// ─── Cluster palette ──────────────────────────────────────────────────────────

export const CLUSTER_PALETTE = [
  '#6C63FF', '#00D4AA', '#FF6584', '#F9CB42',
  '#4FACFE', '#F093FB', '#43E97B', '#FF8E53',
] as const;

// ─── Main agent ───────────────────────────────────────────────────────────────

export async function runKnowledgeGraphAgent(
  report: ResearchReport
): Promise<ExtendedKnowledgeGraph> {
  const systemPrompt = `You are an expert knowledge graph architect and researcher. Your task is to convert a research report into a rich, structured knowledge graph that reveals the deepest conceptual relationships.

GRAPH DESIGN RULES:
- Create exactly 1 ROOT node (the central research topic). Weight = 10.
- Create 4–7 PRIMARY nodes (major themes, domains, or pillars). Weight 7–9.
- Create 10–20 SECONDARY nodes (specific sub-topics, technologies, statistics, events). Weight 3–6.
- Create 3–8 CONCEPT nodes (abstract ideas, frameworks, methodologies). Weight 2–5.
- Create 2–8 COMPANY nodes (key organisations, institutions, projects named in research). Weight 2–7.
- Create 3–6 TREND nodes (directional signals, emerging forces, market shifts). Weight 4–7.
- Total nodes: 25–50. Total edges: 30–65.
- Every node must be reachable from ROOT via edges.

CLUSTER RULES:
- Assign every node to exactly 1 cluster.
- Create 3–6 clusters representing thematic communities (e.g. "Market Dynamics", "Technology Stack", "Regulatory Landscape").
- A cluster must contain at least 3 nodes.
- Pick one of these hex colors for each cluster in order: #6C63FF, #00D4AA, #FF6584, #F9CB42, #4FACFE, #F093FB.

EDGE RULES:
- Edge strength: 0.1 (weak association) to 1.0 (direct causal link).
- Edge category must be one of: causal, comparative, hierarchical, temporal, associative.
  causal = A directly causes or enables B.
  comparative = A contrasts with or benchmarks against B.
  hierarchical = A contains or governs B (parent→child).
  temporal = A precedes or evolves into B.
  associative = A correlates with or relates to B.
- directed = true means the relationship is one-directional.
- No duplicate edges (same source+target pair).
- No self-loops.

DESCRIPTION RULES:
- Node description: 1 precise sentence (max 20 words) grounded in the research findings.
- Edge label: verb phrase max 3 words (e.g. "drives adoption", "preceded by", "contains").

QUALITY BAR:
- Every node must contribute meaningfully to understanding the topic.
- Prefer specific, named entities over vague labels like "challenges" or "issues".
- Descriptions must be factual — pull directly from report findings.`;

  const sections = report.sections.slice(0, 6);
  const sectionContext = sections
    .map(s => `${s.title}: ${s.content?.slice(0, 300) ?? ''}`)
    .join('\n---\n');

  const userPrompt = `Generate a comprehensive knowledge graph for this research report.

REPORT TITLE: ${report.title}

EXECUTIVE SUMMARY:
${report.executiveSummary.slice(0, 600)}

KEY FINDINGS:
${report.keyFindings.slice(0, 8).map((f, i) => `${i + 1}. ${f}`).join('\n')}

REPORT SECTIONS:
${sectionContext}

KEY STATISTICS:
${report.statistics.slice(0, 8).map(s => `• ${s.value} — ${s.context}`).join('\n')}

FUTURE PREDICTIONS:
${report.futurePredictions.slice(0, 5).join('\n')}

Return ONLY valid JSON (no markdown, no explanation):
{
  "topicTitle": "Short 3-5 word title for the graph",
  "nodes": [
    {
      "id": "n1",
      "label": "Max 4 words",
      "type": "root",
      "weight": 10,
      "description": "One precise sentence.",
      "clusterId": "c1",
      "sentiment": "neutral",
      "tier": 1
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "label": "drives",
      "strength": 0.9,
      "category": "causal",
      "directed": true
    }
  ],
  "clusters": [
    {
      "id": "c1",
      "label": "Core Technology",
      "color": "#6C63FF",
      "nodeIds": ["n1", "n2"]
    }
  ]
}`;

  const raw = await chatCompletionJSON<RawGraphOutput>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    { temperature: 0.35, maxTokens: 4000, model: modelFor('knowledgeGraph') } // ← Part 56 NANO
  );

  if (!Array.isArray(raw?.nodes) || raw.nodes.length < 5) {
    throw new Error('Knowledge graph agent returned insufficient nodes.');
  }

  const nodes: KnowledgeGraphNode[] = raw.nodes.map(n => ({
    id:          n.id,
    label:       n.label,
    type:        n.type,
    weight:      Math.max(1, Math.min(10, n.weight ?? 5)),
    description: n.description,
    ...(n.clusterId  ? { clusterId:  n.clusterId  } : {}),
    ...(n.sentiment  ? { sentiment:  n.sentiment  } : {}),
    ...(n.tier       ? { tier:       n.tier       } : {}),
    ...(n.year       ? { year:       n.year       } : {}),
    ...(n.value      ? { value:      n.value      } : {}),
  }));

  const nodeIds = new Set(nodes.map(n => n.id));

  const seenEdgePairs = new Set<string>();
  const edges: KnowledgeGraphEdge[] = (raw.edges ?? [])
    .filter(e => {
      const srcId = typeof e.source === 'string' ? e.source : (e.source as any).id;
      const tgtId = typeof e.target === 'string' ? e.target : (e.target as any).id;
      if (!nodeIds.has(srcId) || !nodeIds.has(tgtId)) return false;
      if (srcId === tgtId) return false;
      const pairKey = [srcId, tgtId].sort().join('→');
      if (seenEdgePairs.has(pairKey)) return false;
      seenEdgePairs.add(pairKey);
      return true;
    })
    .map(e => ({
      id:       e.id,
      source:   typeof e.source === 'string' ? e.source : (e.source as any).id,
      target:   typeof e.target === 'string' ? e.target : (e.target as any).id,
      label:    e.label,
      strength: Math.max(0.1, Math.min(1, e.strength ?? 0.5)),
      ...(e.category ? { category: e.category } : {}),
      ...(e.directed !== undefined ? { directed: e.directed } : {}),
    }));

  const clusters: KnowledgeGraphCluster[] = (raw.clusters ?? [])
    .filter(c => c.nodeIds?.length >= 2)
    .map((c, i) => ({
      id:      c.id,
      label:   c.label,
      color:   c.color ?? CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
      nodeIds: c.nodeIds.filter(id => nodeIds.has(id)),
    }));

  return {
    nodes,
    edges,
    clusters,
    topicTitle: raw.topicTitle ?? report.title,
    generatedAt: new Date().toISOString(),
  };
}