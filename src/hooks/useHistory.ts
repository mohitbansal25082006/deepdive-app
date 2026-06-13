// src/hooks/useHistory.ts
// Loads and manages the user's research report history from Supabase.
//
// Part 50.8 — BOOKMARK BUG FIX
//
// Root cause of the "bookmark un-fills after a while / saved count resets but
// the report is still bookmarked" bug:
//
//   1. The old mapper NEVER read `is_pinned` from the DB row, so every report
//      came back with isPinned === undefined. The History tab papered over this
//      with a separate `pinnedOverrides` map that lived only in component memory.
//      The moment that map was cleared (remount) or a refetch landed, the icon
//      and the "saved" count reverted — even though the DB row was correct.
//
//   2. A pull-to-refresh / focus refetch that resolved AFTER an optimistic
//      bookmark toggle overwrote the optimistic state with stale data, causing
//      the icon to flip back and forth.
//
// The fix:
//   • `is_pinned` is now a first-class field in the mapper.
//   • `toggleBookmark(id)` is owned by THIS hook and updates the canonical
//     `reports` state directly (optimistic), writes to Supabase, and rolls back
//     on failure — the single source of truth for bookmark state.
//   • An in-flight guard (`pendingBookmarks`) prevents a concurrent refetch from
//     clobbering reports whose bookmark write hasn't settled yet. When a refetch
//     lands, the just-toggled value is preserved for any report still pending.
//
// Public surface is backward compatible: existing { reports, loading, refreshing,
// refresh, deleteReport } are unchanged; `toggleBookmark` and `isMutatingBookmark`
// are added.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ResearchReport } from '../types';
import { useAuth } from '../context/AuthContext';

function mapRow(row: any): ResearchReport {
  return {
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
    // ── Part 50.8: is_pinned is now mapped (was previously dropped) ──────────
    isPinned: row.is_pinned ?? false,
    tags: row.tags ?? [],
    exportCount: row.export_count ?? 0,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function useHistory() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Reports whose bookmark write is in-flight (or just settled within the
  // current fetch cycle). A refetch must NOT overwrite these with stale data.
  const pendingBookmarks = useRef<Map<string, boolean>>(new Map());
  const [isMutatingBookmark, setIsMutatingBookmark] = useState(false);

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

      const mapped = (data ?? []).map(mapRow);

      // Preserve optimistic bookmark values for any report whose write is still
      // pending — this is what prevents the refetch from clobbering a toggle.
      const pending = pendingBookmarks.current;
      const reconciled = pending.size === 0
        ? mapped
        : mapped.map(r =>
            pending.has(r.id) ? { ...r, isPinned: pending.get(r.id)! } : r,
          );

      setReports(reconciled);
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

  // ── Bookmark toggle — single source of truth ──────────────────────────────
  const toggleBookmark = useCallback(async (reportId: string) => {
    let nextValue = false;

    // Optimistic update on canonical state
    setReports(prev =>
      prev.map(r => {
        if (r.id !== reportId) return r;
        nextValue = !(r.isPinned ?? false);
        return { ...r, isPinned: nextValue };
      }),
    );

    // Mark as in-flight so a concurrent refetch preserves this value
    pendingBookmarks.current.set(reportId, nextValue);
    setIsMutatingBookmark(true);

    try {
      const { error } = await supabase
        .from('research_reports')
        .update({ is_pinned: nextValue })
        .eq('id', reportId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Bookmark toggle error:', err);
      // Roll back to the prior value
      setReports(prev =>
        prev.map(r => (r.id === reportId ? { ...r, isPinned: !nextValue } : r)),
      );
      return false;
    } finally {
      // Clear the in-flight flag once the write has settled. Keep it briefly so
      // an immediately-following refetch still sees the resolved value.
      setTimeout(() => {
        pendingBookmarks.current.delete(reportId);
        if (pendingBookmarks.current.size === 0) setIsMutatingBookmark(false);
      }, 400);
    }
  }, []);

  const refresh = useCallback(() => fetchReports(true), [fetchReports]);

  return {
    reports,
    loading,
    refreshing,
    refresh,
    deleteReport,
    toggleBookmark,
    isMutatingBookmark,
  };
}