// src/hooks/useKnowledgeGraph.ts
// Fixed: accepts ResearchReport | null — safe on first render before data loads.

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { runKnowledgeGraphAgent } from '../services/agents/knowledgeGraphAgent';
import { KnowledgeGraph, ResearchReport } from '../types';

export function useKnowledgeGraph(report: ResearchReport | null) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [generating, setGenerating] = useState(false);

  // Sync graph whenever report loads / changes
  useEffect(() => {
    if (report?.knowledgeGraph) {
      setGraph(report.knowledgeGraph);
    }
  }, [report?.id, report?.knowledgeGraph]);

  const generate = useCallback(async () => {
    if (!report || generating) return;
    setGenerating(true);
    try {
      const newGraph = await runKnowledgeGraphAgent(report);
      setGraph(newGraph);
      await supabase
        .from('research_reports')
        .update({ knowledge_graph: newGraph })
        .eq('id', report.id);
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