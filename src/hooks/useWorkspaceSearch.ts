// src/hooks/useWorkspaceSearch.ts
// Part 46 — Full workspace search: reports, comments, members,
//   AND all shared content (presentations, papers, podcasts, debates).
//
// The search_workspace RPC was extended in schema_part46.sql to return
// all content types. This hook handles the result mapping for all types.
//
// Part 11 original only covered: report | comment | member
// Part 46 adds:  presentation | academic_paper | podcast | debate
//
// Navigation:
//   report        → onOpenReport(reportId)
//   comment       → onOpenReport(reportId)  [scrolls to comment]
//   member        → onOpenMemberProfile(miniProfile)
//   presentation  → onOpenSharedContent('presentation', contentId)
//   academic_paper→ onOpenSharedContent('academic_paper', contentId)
//   podcast       → onOpenSharedContent('podcast', contentId)
//   debate        → onOpenSharedContent('debate', contentId)

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
// Note: we intentionally do NOT import WorkspaceSearchResult here because
// ExtendedWorkspaceSearchResult redefines the `type` field to a wider union,
// which TypeScript forbids via `extends`. We define it standalone instead.

export type ExtendedSearchResultType =
  | 'report' | 'comment' | 'member'
  | 'presentation' | 'academic_paper' | 'podcast' | 'debate';

// Standalone — mirrors WorkspaceSearchResult but with a wider `type` union.
// Cannot use `extends WorkspaceSearchResult` because that type's `type` field
// is the narrower union 'report' | 'comment' | 'member' and TypeScript (ts2430)
// forbids widening a property type in an extending interface.
export interface ExtendedWorkspaceSearchResult {
  type:       ExtendedSearchResultType;
  id:         string;
  title:      string;
  subtitle:   string;
  reportId?:  string;
  avatarUrl?: string;
  createdAt?: string;
  contentId?: string; // for shared content items (presentation/paper/podcast/debate)
}

export interface ExtendedWorkspaceSearchState {
  query:       string;
  results:     ExtendedWorkspaceSearchResult[];
  isSearching: boolean;
  error:       string | null;
}

export function useWorkspaceSearch(workspaceId: string | null) {
  const [state, setState] = useState<ExtendedWorkspaceSearchState>({
    query:      '',
    results:    [],
    isSearching: false,
    error:      null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track mounted state to avoid setState on unmounted
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Execute search ─────────────────────────────────────────────────────────
  const executeSearch = useCallback(async (query: string) => {
    if (!workspaceId || !query.trim()) return;

    try {
      const { data, error } = await supabase.rpc('search_workspace', {
        p_workspace_id: workspaceId,
        p_query:        query.trim(),
        p_limit:        30,
      });

      if (error) throw error;
      if (!mountedRef.current) return;

      const rows = (data as Record<string, unknown>[]) ?? [];

      const results: ExtendedWorkspaceSearchResult[] = rows.map((r) => {
        const type = r.result_type as ExtendedSearchResultType;
        return {
          type,
          id:         r.result_id as string,
          title:      (r.title as string) ?? '',
          subtitle:   (r.subtitle as string) ?? '',
          reportId:   (r.report_id as string) ?? undefined,
          avatarUrl:  (r.avatar_url as string) ?? undefined,
          createdAt:  (r.created_at as string) ?? undefined,
          // For shared content items, contentId == result_id
          contentId:  ['presentation', 'academic_paper', 'podcast', 'debate'].includes(type)
            ? (r.result_id as string)
            : undefined,
        };
      });

      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          results,
          isSearching: false,
          error:       null,
        }));
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
    }, 350);
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
    // Grouped convenience accessors
    reportResults:       state.results.filter(r => r.type === 'report'),
    commentResults:      state.results.filter(r => r.type === 'comment'),
    memberResults:       state.results.filter(r => r.type === 'member'),
    presentationResults: state.results.filter(r => r.type === 'presentation'),
    paperResults:        state.results.filter(r => r.type === 'academic_paper'),
    podcastResults:      state.results.filter(r => r.type === 'podcast'),
    debateResults:       state.results.filter(r => r.type === 'debate'),
  };
}