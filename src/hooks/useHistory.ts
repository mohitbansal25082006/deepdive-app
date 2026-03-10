// src/hooks/useHistory.ts
// Loads and manages the user's research report history from Supabase.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ResearchReport } from '../types';
import { useAuth } from '../context/AuthContext';

export function useHistory() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped: ResearchReport[] = (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        query: row.query,
        depth: row.depth,
        focusAreas: row.focus_areas ?? [],
        title: row.title ?? row.query,
        executiveSummary: row.executive_summary ?? '',
        sections: row.sections ?? [],
        keyFindings: row.key_findings ?? [],
        futurePredictions: row.future_predictions ?? [],
        citations: row.citations ?? [],
        statistics: row.statistics ?? [],
        searchQueries: row.search_queries ?? [],
        sourcesCount: row.sources_count ?? 0,
        reliabilityScore: row.reliability_score ?? 0,
        status: row.status,
        agentLogs: row.agent_logs ?? [],
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }));

      setReports(mapped);
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const deleteReport = useCallback(async (reportId: string) => {
    await supabase
      .from('research_reports')
      .delete()
      .eq('id', reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }, []);

  const refresh = useCallback(() => fetchReports(true), [fetchReports]);

  return { reports, loading, refreshing, refresh, deleteReport };
}