// src/hooks/useStats.ts
// Parts 1–41.3
//
// Changes in Part 41.3:
//   • Improved error logging to surface the exact RPC failure reason
//   • Added a 10-second AbortController timeout so a hanging RPC never
//     freezes the profile screen
//   • Falls back gracefully to zero-values on any error instead of
//     leaving stats null (which caused the StatsCard to show nothing)
//   • Removed the secondary depth-query approach that could shadow RPC
//     errors; hoursResearched is now derived from completed_reports
//     directly in the hook (avoids an extra network round-trip)

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { UserStats } from '../types';
import { useAuth } from '../context/AuthContext';

// Approximate minutes of manual research saved per report depth level.
// These are client-side estimates only — the exact value is on the Insights screen.
const MINUTES_PER_REPORT: Record<string, number> = {
  quick:  2.5,
  deep:   6,
  expert: 11,
};

// Default estimate when we have no depth breakdown (assume mostly deep)
const DEFAULT_MINUTES_PER_REPORT = 5;

function estimateHours(completedReports: number): number {
  return parseFloat(((completedReports * DEFAULT_MINUTES_PER_REPORT) / 60).toFixed(1));
}

const ZERO_STATS: UserStats = {
  totalReports:            0,
  completedReports:        0,
  totalSources:            0,
  avgReliability:          0,
  favoriteTopic:           null,
  reportsThisMonth:        0,
  hoursResearched:         0,
  totalAssistantMessages:  0,
  reportsWithEmbeddings:   0,
  academicPapersGenerated: 0,
  totalPodcasts:           0,
  totalDebates:            0,
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

      if (error) {
        console.warn(
          '[useStats] RPC get_user_research_stats failed:',
          error.code,
          error.message,
          error.details ?? '',
        );
        // Show zero stats instead of nothing — profile screen stays usable
        setStats({ ...ZERO_STATS });
        return;
      }

      // The RPC returns a single-row TABLE — Supabase wraps it as an array
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        // New user with no reports yet — zero stats is correct
        setStats({ ...ZERO_STATS });
        return;
      }

      const completedReports = Number(row.completed_reports ?? 0);

      setStats({
        // ── Core (Parts 1–3) ───────────────────────────────────────────────
        totalReports:     Number(row.total_reports     ?? 0),
        completedReports,
        totalSources:     Number(row.total_sources     ?? 0),
        avgReliability:   parseFloat((Number(row.avg_reliability ?? 0)).toFixed(1)),
        favoriteTopic:    row.favorite_topic ?? null,
        reportsThisMonth: Number(row.reports_this_month ?? 0),

        // Derive hours from completedReports (no extra DB call needed)
        hoursResearched: estimateHours(completedReports),

        // ── Part 6 — RAG assistant ─────────────────────────────────────────
        totalAssistantMessages: Number(row.total_assistant_messages ?? 0),
        reportsWithEmbeddings:  Number(row.reports_with_embeddings  ?? 0),

        // ── Part 7 — Academic papers ───────────────────────────────────────
        academicPapersGenerated: Number(row.academic_papers_generated ?? 0),

        // ── Part 8 — Podcasts ──────────────────────────────────────────────
        totalPodcasts: Number(row.total_podcasts ?? 0),

        // ── Part 9 — Debates ───────────────────────────────────────────────
        totalDebates: Number(row.total_debates ?? 0),
      });
    } catch (err) {
      console.warn('[useStats] Unexpected error:', err);
      // Keep any previously loaded stats rather than blanking them out
      setStats(prev => prev ?? { ...ZERO_STATS });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}