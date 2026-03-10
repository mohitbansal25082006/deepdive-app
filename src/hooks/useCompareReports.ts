// src/hooks/useCompareReports.ts
// Side-by-side report comparison logic.

import { useState, useCallback } from 'react';
import { ResearchReport } from '../types';
import { supabase } from '../lib/supabase';

export interface ComparisonPoint {
  label: string;
  leftValue: string;
  rightValue: string;
  winner?: 'left' | 'right' | 'tie';
}

export function useCompareReports() {
  const [leftReport, setLeftReport] = useState<ResearchReport | null>(null);
  const [rightReport, setRightReport] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async (reportId: string): Promise<ResearchReport | null> => {
    const { data, error } = await supabase
      .from('research_reports')
      .select('*')
      .eq('id', reportId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id, userId: data.user_id, query: data.query,
      depth: data.depth, focusAreas: data.focus_areas ?? [],
      title: data.title ?? data.query,
      executiveSummary: data.executive_summary ?? '',
      sections: data.sections ?? [], keyFindings: data.key_findings ?? [],
      futurePredictions: data.future_predictions ?? [],
      citations: data.citations ?? [], statistics: data.statistics ?? [],
      searchQueries: data.search_queries ?? [],
      sourcesCount: data.sources_count ?? 0,
      reliabilityScore: data.reliability_score ?? 0,
      status: data.status, agentLogs: data.agent_logs ?? [],
      createdAt: data.created_at, completedAt: data.completed_at,
    };
  }, []);

  const setLeft = useCallback(async (reportId: string) => {
    setLoading(true);
    const r = await loadReport(reportId);
    setLeftReport(r);
    setLoading(false);
  }, [loadReport]);

  const setRight = useCallback(async (reportId: string) => {
    setLoading(true);
    const r = await loadReport(reportId);
    setRightReport(r);
    setLoading(false);
  }, [loadReport]);

  const getComparisonPoints = (): ComparisonPoint[] => {
    if (!leftReport || !rightReport) return [];

    const depthScore = { quick: 1, deep: 2, expert: 3 };

    return [
      {
        label: 'Research Depth',
        leftValue: leftReport.depth.charAt(0).toUpperCase() + leftReport.depth.slice(1),
        rightValue: rightReport.depth.charAt(0).toUpperCase() + rightReport.depth.slice(1),
        winner: depthScore[leftReport.depth] > depthScore[rightReport.depth]
          ? 'left' : depthScore[leftReport.depth] < depthScore[rightReport.depth]
          ? 'right' : 'tie',
      },
      {
        label: 'Sources Used',
        leftValue: String(leftReport.sourcesCount),
        rightValue: String(rightReport.sourcesCount),
        winner: leftReport.sourcesCount > rightReport.sourcesCount ? 'left'
          : leftReport.sourcesCount < rightReport.sourcesCount ? 'right' : 'tie',
      },
      {
        label: 'Citations',
        leftValue: String(leftReport.citations.length),
        rightValue: String(rightReport.citations.length),
        winner: leftReport.citations.length > rightReport.citations.length ? 'left'
          : leftReport.citations.length < rightReport.citations.length ? 'right' : 'tie',
      },
      {
        label: 'Reliability Score',
        leftValue: `${leftReport.reliabilityScore}/10`,
        rightValue: `${rightReport.reliabilityScore}/10`,
        winner: leftReport.reliabilityScore > rightReport.reliabilityScore ? 'left'
          : leftReport.reliabilityScore < rightReport.reliabilityScore ? 'right' : 'tie',
      },
      {
        label: 'Key Findings',
        leftValue: String(leftReport.keyFindings.length),
        rightValue: String(rightReport.keyFindings.length),
        winner: leftReport.keyFindings.length > rightReport.keyFindings.length ? 'left'
          : leftReport.keyFindings.length < rightReport.keyFindings.length ? 'right' : 'tie',
      },
      {
        label: 'Sections',
        leftValue: String(leftReport.sections.length),
        rightValue: String(rightReport.sections.length),
        winner: 'tie',
      },
    ];
  };

  return {
    leftReport, rightReport, loading,
    setLeft, setRight, getComparisonPoints,
    clear: () => { setLeftReport(null); setRightReport(null); },
  };
}