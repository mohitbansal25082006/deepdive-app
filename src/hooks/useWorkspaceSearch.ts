// src/hooks/useWorkspaceSearch.ts
// Part 11 — Debounced full-text search across reports, comments, and members
// in a workspace using the search_workspace RPC from schema_part11.sql.

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { WorkspaceSearchResult, WorkspaceSearchState } from '../types';

export function useWorkspaceSearch(workspaceId: string | null) {
  const [state, setState] = useState<WorkspaceSearchState>({
    query:      '',
    results:    [],
    isSearching: false,
    error:      null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Execute search ─────────────────────────────────────────────────────────
  const executeSearch = useCallback(async (query: string) => {
    if (!workspaceId || !query.trim()) return;

    try {
      const { data, error } = await supabase.rpc('search_workspace', {
        p_workspace_id: workspaceId,
        p_query:        query.trim(),
        p_limit:        25,
      });

      if (error) throw error;

      const rows = (data as Record<string, unknown>[]) ?? [];
      const results: WorkspaceSearchResult[] = rows.map((r) => ({
        type:     r.result_type as 'report' | 'comment' | 'member',
        id:       r.result_id as string,
        title:    (r.title as string)    ?? '',
        subtitle: (r.subtitle as string) ?? '',
        reportId:   (r.report_id   as string) ?? undefined,
        avatarUrl:  (r.avatar_url  as string) ?? undefined,
        createdAt:  (r.created_at  as string) ?? undefined,
      }));

      setState((s) => ({
        ...s,
        results,
        isSearching: false,
        error:       null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isSearching: false,
        error: err instanceof Error ? err.message : 'Search failed',
      }));
    }
  }, [workspaceId]);

  // ── Debounced public search trigger ───────────────────────────────────────
  const search = useCallback((query: string) => {
    // Always update query immediately for responsive input
    setState((s) => ({
      ...s,
      query,
      results:     query.trim() ? s.results : [],
      isSearching: !!query.trim(),
      error:       null,
    }));

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) return;

    debounceRef.current = setTimeout(() => {
      executeSearch(query);
    }, 350);
  }, [executeSearch]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState({ query: '', results: [], isSearching: false, error: null });
  }, []);

  return { ...state, search, clear };
}