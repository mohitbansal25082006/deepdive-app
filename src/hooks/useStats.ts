// src/hooks/useStats.ts
// Loads user research statistics from Supabase.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { UserStats } from '../types';
import { useAuth } from '../context/AuthContext';

const MINUTES_PER_DEPTH: Record<string, number> = {
  quick: 2.5,
  deep: 6,
  expert: 11,
};

export function useStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Use the RPC function from the Part 3 migration
      const { data, error } = await supabase
        .rpc('get_user_research_stats', { p_user_id: user.id });

      if (error) throw error;

      const row = data?.[0];
      if (!row) return;

      // Estimate hours saved based on report count * avg depth time
      const { data: depthData } = await supabase
        .from('research_reports')
        .select('depth')
        .eq('user_id', user.id)
        .eq('status', 'completed');

      const hoursResearched = (depthData ?? []).reduce((sum, r) => {
        return sum + (MINUTES_PER_DEPTH[r.depth] ?? 5) / 60;
      }, 0);

      setStats({
        totalReports: Number(row.total_reports ?? 0),
        completedReports: Number(row.completed_reports ?? 0),
        totalSources: Number(row.total_sources ?? 0),
        avgReliability: parseFloat((row.avg_reliability ?? 0).toFixed(1)),
        favoriteTopic: row.favorite_topic ?? null,
        reportsThisMonth: Number(row.reports_this_month ?? 0),
        hoursResearched: parseFloat(hoursResearched.toFixed(1)),
      });
    } catch (err) {
      console.error('[useStats] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}