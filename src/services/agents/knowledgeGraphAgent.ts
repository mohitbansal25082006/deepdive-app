// src/services/agents/knowledgeGraphAgent.ts
// Converts a completed research report into a structured knowledge graph.
// The AI identifies key entities, concepts, and their relationships.

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchReport,
  KnowledgeGraph,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
} from '../../types';

interface RawGraphOutput {
  nodes: Array<{
    id: string;
    label: string;
    type: 'root' | 'primary' | 'secondary' | 'concept' | 'company' | 'trend';
    weight: number;
    description?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    strength: number;
  }>;
}

export async function runKnowledgeGraphAgent(
  report: ResearchReport
): Promise<KnowledgeGraph> {
  const systemPrompt = `You are a knowledge graph specialist. Your task is to convert research reports into structured knowledge graphs that reveal relationships between concepts, entities, companies, and trends.

Rules for generating graphs:
- Create 1 ROOT node (the main topic)
- Create 4–8 PRIMARY nodes (major subtopics, themes, or categories)
- Create 8–16 SECONDARY or CONCEPT nodes (specific ideas, technologies, statistics)
- Create 3–8 COMPANY nodes for key players mentioned
- Create 3–6 TREND nodes for identified market/technology trends
- Total nodes: 20–40
- Total edges: 25–50 (meaningful relationships only)
- Node weights range 1–10 (10 = most important/central)
- Edge strength range 0.1–1.0 (1.0 = very strong relationship)`;

  const context = [
    `TOPIC: ${report.title}`,
    `SUMMARY: ${report.executiveSummary.slice(0, 500)}`,
    `KEY THEMES: ${report.sections.map(s => s.title).join(', ')}`,
    `COMPANIES MENTIONED: ${report.statistics.slice(0, 5).map(s => s.source).join(', ')}`,
    `KEY FINDINGS: ${report.keyFindings.slice(0, 5).join(' | ')}`,
    `TRENDS: ${report.sections
      .map(s => s.bullets?.slice(0, 2).join(', ') ?? '')
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ')}`,
  ].join('\n');

  const userPrompt = `Generate a comprehensive knowledge graph for this research report.

${context}

Return ONLY valid JSON with NO markdown:
{
  "nodes": [
    {
      "id": "n1",
      "label": "Short label (max 4 words)",
      "type": "root|primary|secondary|concept|company|trend",
      "weight": 10,
      "description": "One sentence description"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "label": "relationship verb (max 3 words)",
      "strength": 0.9
    }
  ]
}

The ROOT node should be the main research topic. Connect PRIMARY nodes to the ROOT. Connect SECONDARY/CONCEPT/COMPANY/TREND nodes to the most relevant PRIMARY nodes. Every node must have at least 1 edge. No orphan nodes.`;

  const raw = await chatCompletionJSON<RawGraphOutput>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, maxTokens: 3000 }
  );

  // Validate
  if (!Array.isArray(raw?.nodes) || raw.nodes.length < 5) {
    throw new Error('Knowledge graph agent returned insufficient nodes.');
  }

  const nodes: KnowledgeGraphNode[] = raw.nodes.map(n => ({
    id: n.id,
    label: n.label,
    type: n.type,
    weight: Math.max(1, Math.min(10, n.weight ?? 5)),
    description: n.description,
  }));

  const nodeIds = new Set(nodes.map(n => n.id));
  const edges: KnowledgeGraphEdge[] = (raw.edges ?? [])
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      strength: Math.max(0.1, Math.min(1, e.strength ?? 0.5)),
    }));

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
  };
}