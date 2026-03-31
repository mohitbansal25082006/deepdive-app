// src/hooks/useKnowledgeGraph.ts
// Updated for Part 4 Upgrade — handles ExtendedKnowledgeGraph with clusters.
//
// Changes vs original:
//  • Calls runKnowledgeGraphAgent which now returns ExtendedKnowledgeGraph
//  • Persists full extended graph (including clusters, topicTitle) to DB
//  • Safe to call with null report (no crash on first render)

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { supabase }                 from '../lib/supabase';
import { runKnowledgeGraphAgent }   from '../services/agents/knowledgeGraphAgent';
import type { ExtendedKnowledgeGraph } from '../services/agents/knowledgeGraphAgent';
import { ResearchReport }           from '../types';

export function useKnowledgeGraph(report: ResearchReport | null) {
  const [graph,      setGraph]      = useState<ExtendedKnowledgeGraph | null>(null);
  const [generating, setGenerating] = useState(false);

  // Sync from report whenever it loads / updates
  useEffect(() => {
    if (report?.knowledgeGraph) {
      // Cast: the DB value may already be an ExtendedKnowledgeGraph if generated
      // by the new agent, or a plain KnowledgeGraph from the old agent.
      // Either way, KnowledgeGraphView handles both gracefully.
      setGraph(report.knowledgeGraph as unknown as ExtendedKnowledgeGraph);
    }
  }, [report?.id, report?.knowledgeGraph]);

  const generate = useCallback(async () => {
    if (!report || generating) return;
    setGenerating(true);
    try {
      const newGraph = await runKnowledgeGraphAgent(report);
      setGraph(newGraph);

      // Persist to Supabase — store the full extended graph (clusters + topicTitle included)
      const { error } = await supabase
        .from('research_reports')
        .update({ knowledge_graph: newGraph })
        .eq('id', report.id);

      if (error) {
        console.warn('[useKnowledgeGraph] Failed to persist graph:', error.message);
      }
    } catch (err) {
      Alert.alert(
        'Graph Error',
        err instanceof Error ? err.message : 'Failed to generate knowledge graph.'
      );
    } finally {
      setGenerating(false);
    }
  }, [report, generating]);

  return { graph, generating, generate };
}