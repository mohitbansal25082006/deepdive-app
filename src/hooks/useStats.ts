// src/hooks/useStats.ts
// Parts 1-9
// Loads user research statistics from Supabase via get_user_research_stats RPC.
//
// Changes in Part 9:
//   • Maps new total_debates column → totalDebates
//   • Adds academicPapersGenerated, totalPodcasts mappings (were missing)
//   • totalDebates added to UserStats shape

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { UserStats } from '../types';
import { useAuth } from '../context/AuthContext';

const MINUTES_PER_DEPTH: Record<string, number> = {
  quick:  2.5,
  deep:   6,
  expert: 11,
};

export function useStats() {
  const { user } = useAuth();
  const [stats,   setStats]   = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .rpc('get_user_research_stats', { p_user_id: user.id });

      // Warn instead of throw — prevents the profile screen crashing when the
      // RPC returns an unexpected shape or a transient network error occurs.
      if (error) {
        console.warn('[useStats] RPC error:', error.code, error.message);
        return;
      }

      const row = data?.[0];
      if (!row) return;

      // Estimate hours saved based on report depth — kept in a separate
      // try/catch so a failure here doesn't wipe out the main stats.
      let hoursResearched = 0;
      try {
        const { data: depthData } = await supabase
          .from('research_reports')
          .select('depth')
          .eq('user_id', user.id)
          .eq('status', 'completed');

        hoursResearched = (depthData ?? []).reduce((sum, r) => {
          return sum + (MINUTES_PER_DEPTH[r.depth] ?? 5) / 60;
        }, 0);
      } catch {
        // Non-fatal — hours will show as 0
      }

      setStats({
        // ── Core research stats (Parts 1-3) ──────────────────────────────
        totalReports:     Number(row.total_reports     ?? 0),
        completedReports: Number(row.completed_reports ?? 0),
        totalSources:     Number(row.total_sources     ?? 0),
        avgReliability:   parseFloat((row.avg_reliability ?? 0).toFixed(1)),
        favoriteTopic:    row.favorite_topic ?? null,
        reportsThisMonth: Number(row.reports_this_month ?? 0),
        hoursResearched:  parseFloat(hoursResearched.toFixed(1)),

        // ── Part 6 — RAG assistant ────────────────────────────────────────
        // Fallback to 0 if schema_part6.sql not yet applied
        totalAssistantMessages: Number(row.total_assistant_messages ?? 0),
        reportsWithEmbeddings:  Number(row.reports_with_embeddings  ?? 0),

        // ── Part 7 — Academic papers ──────────────────────────────────────
        // Column not in the original TABLE shape — safe zero fallback
        academicPapersGenerated: Number(row.academic_papers_generated ?? 0),

        // ── Part 8 — Podcasts ─────────────────────────────────────────────
        totalPodcasts: Number(row.total_podcasts ?? 0),

        // ── Part 9 — Debates ──────────────────────────────────────────────
        // Populated once schema_part9.sql has been run; zero-safe until then
        totalDebates: Number(row.total_debates ?? 0),
      });
    } catch (err) {
      // Catches network errors or any other unexpected throw
      console.warn('[useStats] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}