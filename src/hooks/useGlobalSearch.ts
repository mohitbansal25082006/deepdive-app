// src/hooks/useGlobalSearch.ts
// Part 35 — Global Search Hub: personal search (unchanged logic)
// Part 37 — Added: community search tab, useCommunitySearch sub-hook,
//           searchScope switching, in-memory community recent queries.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                from '../context/AuthContext';
import {
  hybridSearch,
  communityHybridSearch,
  logSearch,
  getSearchSuggestions,
  clearSearchHistory,
}                                 from '../services/globalSearchService';
import {
  SearchResult,
  SearchFilters,
  SearchHistoryItem,
  CommunitySearchResult,
  CommunitySearchState,
  DEFAULT_SEARCH_FILTERS,
  SearchScope,
}                                 from '../types/search';
import {
  SEARCH_DEBOUNCE_MS,
  MIN_SEARCH_CHARS,
}                                 from '../constants/search';

// ─── Return Type ──────────────────────────────────────────────────────────────

export interface UseGlobalSearchReturn {
  // ── Shared
  query:            string;
  searchScope:      SearchScope;
  filters:          SearchFilters;
  setQuery:         (q: string) => void;
  setSearchScope:   (s: SearchScope) => void;
  setFilters:       (f: Partial<SearchFilters>) => void;
  resetFilters:     () => void;
  search:           (q?: string) => Promise<void>;
  clearResults:     () => void;

  // ── Personal search state (scope === 'personal')
  results:          SearchResult[];
  isSearching:      boolean;
  isSemanticReady:  boolean;
  totalCount:       number;
  error:            string | null;
  hasSearched:      boolean;

  // ── Personal history / suggestions
  suggestions:      SearchHistoryItem[];
  showSuggestions:  boolean;
  clearHistory:     () => Promise<void>;
  onFocusInput:     () => void;
  onBlurInput:      () => void;
  loadSuggestions:  (prefix: string) => Promise<void>;

  // ── Community search state (scope === 'community') — Part 37
  communityResults:         CommunitySearchResult[];
  communityIsSearching:     boolean;
  communityIsSemanticReady: boolean;
  communityTotalCount:      number;
  communityError:           string | null;
  communityHasSearched:     boolean;
  communityRecentQueries:   string[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalSearch(): UseGlobalSearchReturn {
  const { user } = useAuth();

  // ── Shared state ──────────────────────────────────────────────────────────

  const [query,       setQueryState]   = useState('');
  const [searchScope, setScopeState]   = useState<SearchScope>('personal');
  const [filters,     setFiltersState] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);

  // ── Personal search state ─────────────────────────────────────────────────

  const [results,         setResults]       = useState<SearchResult[]>([]);
  const [isSearching,     setIsSearching]   = useState(false);
  const [isSemanticReady, setSemanticReady] = useState(false);
  const [totalCount,      setTotalCount]    = useState(0);
  const [error,           setError]         = useState<string | null>(null);
  const [hasSearched,     setHasSearched]   = useState(false);
  const [suggestions,     setSuggestions]   = useState<SearchHistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Community search state (Part 37) ─────────────────────────────────────

  const [communityResults,
    setCommunityResults]         = useState<CommunitySearchResult[]>([]);
  const [communityIsSearching,
    setCommunityIsSearching]     = useState(false);
  const [communityIsSemanticReady,
    setCommunitySemanticReady]   = useState(false);
  const [communityTotalCount,
    setCommunityTotalCount]      = useState(0);
  const [communityError,
    setCommunityError]           = useState<string | null>(null);
  const [communityHasSearched,
    setCommunityHasSearched]     = useState(false);
  // In-memory community recent queries — not persisted to DB (by spec)
  const [communityRecentQueries,
    setCommunityRecentQueries]   = useState<string[]>([]);

  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');

  // ── Auto-search on query/filters/scope change (debounced) ─────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_CHARS) {
      if (!trimmed) {
        setResults([]);
        setCommunityResults([]);
        setHasSearched(false);
        setCommunityHasSearched(false);
        setTotalCount(0);
        setCommunityTotalCount(0);
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filters, searchScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core search runner ────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    latestQueryRef.current = q;

    if (searchScope === 'personal') {
      if (!user) return;
      await runPersonalSearch(q);
    } else {
      await runCommunitySearch(q);
    }
  }, [user, searchScope, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Personal search ───────────────────────────────────────────────────────

  const runPersonalSearch = useCallback(async (q: string) => {
    if (!user) return;

    setIsSearching(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const data = await hybridSearch(q, user.id, filters);
      if (latestQueryRef.current !== q) return;

      setResults(data);
      setTotalCount(data.length);
      setHasSearched(true);
      setSemanticReady(data.some(r => (r.semanticScore ?? 0) > 0));

      logSearch(
        user.id,
        q,
        filters.contentType === 'all' ? null : filters.contentType,
        data.length,
      );
    } catch (err) {
      if (latestQueryRef.current !== q) return;
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setResults([]);
      setTotalCount(0);
    } finally {
      if (latestQueryRef.current === q) setIsSearching(false);
    }
  }, [user, filters]);

  // ── Community search (Part 37) ────────────────────────────────────────────

  const runCommunitySearch = useCallback(async (q: string) => {
    setCommunityIsSearching(true);
    setCommunityError(null);
    setShowSuggestions(false);

    try {
      const { results: data, semanticAvailable } = await communityHybridSearch(
        q,
        'relevance',
      );
      if (latestQueryRef.current !== q) return;

      setCommunityResults(data);
      setCommunityTotalCount(data.length);
      setCommunityHasSearched(true);
      setCommunitySemanticReady(semanticAvailable);

      // Add to in-memory recent queries (deduplicated, max 10)
      setCommunityRecentQueries(prev => {
        const withoutDupe = prev.filter(r => r.toLowerCase() !== q.toLowerCase());
        return [q, ...withoutDupe].slice(0, 10);
      });
    } catch (err) {
      if (latestQueryRef.current !== q) return;
      setCommunityError(
        err instanceof Error ? err.message : 'Community search failed.',
      );
      setCommunityResults([]);
      setCommunityTotalCount(0);
    } finally {
      if (latestQueryRef.current === q) setCommunityIsSearching(false);
    }
  }, []);

  // ── Public: search (immediate) ────────────────────────────────────────────

  const search = useCallback(async (q?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await runSearch(q ?? query);
  }, [runSearch, query]);

  // ── Public: setQuery ──────────────────────────────────────────────────────

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    if (q.trim().length >= MIN_SEARCH_CHARS && searchScope === 'personal') {
      loadSuggestions(q.trim());
    } else if (!q.trim()) {
      setSuggestions([]);
    }
  }, [searchScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public: setSearchScope ────────────────────────────────────────────────

  const setSearchScope = useCallback((s: SearchScope) => {
    setScopeState(s);
    // Clear the opposite scope's stale results so there's no confusion
    if (s === 'personal') {
      setCommunityResults([]);
      setCommunityHasSearched(false);
    } else {
      setResults([]);
      setHasSearched(false);
    }
    // Immediately re-search in the new scope if there's an active query
    const trimmed = query.trim();
    if (trimmed.length >= MIN_SEARCH_CHARS) {
      latestQueryRef.current = trimmed;
      if (s === 'community') {
        runCommunitySearch(trimmed);
      } else if (user) {
        runPersonalSearch(trimmed);
      }
    }
  }, [query, user, runCommunitySearch, runPersonalSearch]);

  // ── Public: setFilters ────────────────────────────────────────────────────

  const setFilters = useCallback((partial: Partial<SearchFilters>) => {
    setFiltersState(prev => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_SEARCH_FILTERS);
  }, []);

  // ── Public: clearResults ──────────────────────────────────────────────────

  const clearResults = useCallback(() => {
    setQueryState('');
    setResults([]);
    setCommunityResults([]);
    setHasSearched(false);
    setCommunityHasSearched(false);
    setTotalCount(0);
    setCommunityTotalCount(0);
    setError(null);
    setCommunityError(null);
    setSemanticReady(false);
    setCommunitySemanticReady(false);
    setSuggestions([]);
    setShowSuggestions(false);
    latestQueryRef.current = '';
  }, []);

  // ── Public: clearHistory (personal only) ─────────────────────────────────

  const clearHistory = useCallback(async () => {
    if (!user) return;
    setSuggestions([]);
    await clearSearchHistory(user.id);
  }, [user]);

  // ── Suggestions (personal only) ───────────────────────────────────────────

  const loadSuggestions = useCallback(async (prefix: string) => {
    if (!user) return;
    try {
      const data = await getSearchSuggestions(user.id, prefix);
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    }
  }, [user]);

  const onFocusInput = useCallback(() => {
    if (user && !query.trim() && searchScope === 'personal') {
      loadSuggestions('');
    }
    setShowSuggestions(true);
  }, [user, query, searchScope, loadSuggestions]);

  const onBlurInput = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Shared
    query,
    searchScope,
    filters,
    setQuery,
    setSearchScope,
    setFilters,
    resetFilters,
    search,
    clearResults,

    // Personal
    results,
    isSearching,
    isSemanticReady,
    totalCount,
    error,
    hasSearched,

    // Personal suggestions
    suggestions,
    showSuggestions,
    clearHistory,
    onFocusInput,
    onBlurInput,
    loadSuggestions,

    // Community (Part 37)
    communityResults,
    communityIsSearching,
    communityIsSemanticReady,
    communityTotalCount,
    communityError,
    communityHasSearched,
    communityRecentQueries,
  };
}