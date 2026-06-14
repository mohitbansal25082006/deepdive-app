// src/hooks/useWorkspaceSearch.ts
// Part 46 — Full workspace search across 7 content types.
// Part 52 (update) — Reliability fix:
//   The redesigned modal showed "Search didn't work" because the
//   search_workspace RPC could throw 'not_member' (and similar) which the hook
//   surfaced as an error state. Two changes here make search robust regardless
//   of SQL deployment state:
//     1. A `not_member` / membership-style error is now treated as ZERO
//        results (empty state) rather than an error.
//     2. Empty/whitespace queries never hit the RPC.
//   The accompanying SQL patch (schema_part52_search_patch.sql) also makes the
//   RPC return empty instead of raising — this is the belt to that suspenders.

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type ExtendedSearchResultType =
  | 'report' | 'comment' | 'member'
  | 'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate';

export interface ExtendedWorkspaceSearchResult {
  type:       ExtendedSearchResultType;
  id:         string;
  title:      string;
  subtitle:   string;
  reportId?:  string;
  avatarUrl?: string;
  createdAt?: string;
  contentId?: string;
}

export interface ExtendedWorkspaceSearchState {
  query:       string;
  results:     ExtendedWorkspaceSearchResult[];
  isSearching: boolean;
  error:       string | null;
}

// Errors that should be treated as "no results", not a hard failure.
function isBenignSearchError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('not_member') ||
    m.includes('not a member') ||
    m.includes('access denied') ||
    m.includes('permission')
  );
}

export function useWorkspaceSearch(workspaceId: string | null) {
  const [state, setState] = useState<ExtendedWorkspaceSearchState>({
    query:      '',
    results:    [],
    isSearching: false,
    error:      null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Execute search ─────────────────────────────────────────────────────────
  const executeSearch = useCallback(async (query: string) => {
    if (!workspaceId || !query.trim()) {
      if (mountedRef.current) setState(s => ({ ...s, results: [], isSearching: false, error: null }));
      return;
    }

    try {
      const { data, error } = await supabase.rpc('search_workspace', {
        p_workspace_id: workspaceId,
        p_query:        query.trim(),
        p_limit:        30,
      });

      if (error) {
        // Log the FULL error so the real cause is visible in the console
        // (e.g. PGRST203 overload conflict, PGRST202 missing function, or a
        // genuine SQL error). This is what to read if search still misbehaves.
        console.error('[useWorkspaceSearch] RPC error:', {
          code:    (error as any).code,
          message: error.message,
          details: (error as any).details,
          hint:    (error as any).hint,
        });

        // Membership / permission errors → empty results, not a failure.
        if (isBenignSearchError(error.message)) {
          if (mountedRef.current) {
            setState(s => ({ ...s, results: [], isSearching: false, error: null }));
          }
          return;
        }
        throw error;
      }

      if (!mountedRef.current) return;

      const rows = (data as Record<string, unknown>[]) ?? [];
      const results: ExtendedWorkspaceSearchResult[] = rows.map((r) => {
        const type = r.result_type as ExtendedSearchResultType;
        return {
          type,
          id:        r.result_id as string,
          title:     (r.title as string) ?? '',
          subtitle:  (r.subtitle as string) ?? '',
          reportId:  (r.report_id as string) ?? undefined,
          avatarUrl: (r.avatar_url as string) ?? undefined,
          createdAt: (r.created_at as string) ?? undefined,
          contentId: ['presentation', 'academic_paper', 'podcast', 'debate', 'voice_debate'].includes(type)
            ? (r.result_id as string)
            : undefined,
        };
      });

      if (mountedRef.current) {
        setState((s) => ({ ...s, results, isSearching: false, error: null }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          isSearching: false,
          error: err instanceof Error ? err.message : 'Search failed',
        }));
      }
    }
  }, [workspaceId]);

  // ── Debounced public search trigger ───────────────────────────────────────
  const search = useCallback((query: string) => {
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
    }, 320);
  }, [executeSearch]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState({ query: '', results: [], isSearching: false, error: null });
  }, []);

  // ── Helpers: group results by type ─────────────────────────────────────────
  const byType = useCallback((type: ExtendedSearchResultType) =>
    state.results.filter((r) => r.type === type),
    [state.results],
  );

  return {
    ...state,
    search,
    clear,
    byType,
    reportResults:       state.results.filter(r => r.type === 'report'),
    commentResults:      state.results.filter(r => r.type === 'comment'),
    memberResults:       state.results.filter(r => r.type === 'member'),
    presentationResults: state.results.filter(r => r.type === 'presentation'),
    paperResults:        state.results.filter(r => r.type === 'academic_paper'),
    podcastResults:      state.results.filter(r => r.type === 'podcast'),
    debateResults:       state.results.filter(r => r.type === 'debate'),
    voiceDebateResults:  state.results.filter(r => r.type === 'voice_debate'),
  };
}