// src/hooks/useDebateHistory.ts
// Part 9 — Loads and manages past debate sessions from Supabase.
//
// Features:
//   - Auto-loads on mount when user is present
//   - Pull-to-refresh support
//   - Delete with optimistic UI update
//   - Graceful table-not-found handling (schema not yet run)

import { useState, useEffect, useCallback } from 'react';
import { supabase }       from '../lib/supabase';
import { DebateSession }  from '../types';
import { useAuth }        from '../context/AuthContext';

// ─── DB row → DebateSession mapper ───────────────────────────────────────────

function mapRow(row: Record<string, unknown>): DebateSession {
  return {
    id:                 row.id                  as string,
    userId:             row.user_id             as string,
    topic:              row.topic               as string,
    question:           row.question            as string,
    perspectives:       (row.perspectives       as DebateSession['perspectives']) ?? [],
    moderator:          (row.moderator          as DebateSession['moderator'])    ?? null,
    status:             row.status              as DebateSession['status'],
    agentRoles:         (row.agent_roles        as DebateSession['agentRoles'])   ?? [],
    searchResultsCount: (row.search_results_count as number)                      ?? 0,
    errorMessage:       row.error_message       as string | undefined,
    createdAt:          row.created_at          as string,
    completedAt:        row.completed_at        as string | undefined,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDebateHistory() {
  const { user } = useAuth();

  const [debates,    setDebates]    = useState<DebateSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Loader ────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('debate_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      setDebates((data ?? []).map(row => mapRow(row as Record<string, unknown>)));
      setError(null);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load debates';

      // Silently handle "table does not exist" — schema not yet applied
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('undefined_table')
      ) {
        setDebates([]);
        setError(null);
      } else {
        console.warn('[useDebateHistory] Load error:', msg);
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const refresh = useCallback(() => load(true), [load]);

  // ── Delete (optimistic) ───────────────────────────────────────────────────

  const deleteDebate = useCallback(
    async (id: string) => {
      if (!user) return;

      // Optimistic removal
      setDebates(prev => prev.filter(d => d.id !== id));

      const { error: deleteError } = await supabase
        .from('debate_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (deleteError) {
        console.warn('[useDebateHistory] Delete failed:', deleteError.message);
        // Revert on failure
        await load();
      }
    },
    [user, load],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const completedDebates = debates.filter(d => d.status === 'completed');

  const totalPerspectives = completedDebates.reduce(
    (sum, d) => sum + (d.perspectives?.length ?? 0),
    0,
  );

  return {
    debates,
    completedDebates,
    totalPerspectives,
    loading,
    refreshing,
    error,
    refresh,
    deleteDebate,
  };
}