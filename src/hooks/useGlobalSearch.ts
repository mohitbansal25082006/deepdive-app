// src/hooks/useGlobalSearch.ts
// Part 35 — Global Search Hub: React hook
//
// Manages all search state: query, filters, results, suggestions,
// debouncing, and search history. Exposes a clean API to the screen.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                from '../context/AuthContext';
import {
  hybridSearch,
  logSearch,
  getSearchSuggestions,
  clearSearchHistory,
}                                 from '../services/globalSearchService';
import {
  SearchResult,
  SearchFilters,
  SearchHistoryItem,
  SearchState,
  DEFAULT_SEARCH_FILTERS,
}                                 from '../types/search';
import {
  SEARCH_DEBOUNCE_MS,
  MIN_SEARCH_CHARS,
}                                 from '../constants/search';

// ─── Return Type ──────────────────────────────────────────────────────────────

export interface UseGlobalSearchReturn {
  // State
  query:            string;
  results:          SearchResult[];
  isSearching:      boolean;
  isSemanticReady:  boolean;
  filters:          SearchFilters;
  totalCount:       number;
  error:            string | null;
  hasSearched:      boolean;
  suggestions:      SearchHistoryItem[];
  showSuggestions:  boolean;

  // Actions
  setQuery:         (q: string) => void;
  setFilters:       (f: Partial<SearchFilters>) => void;
  resetFilters:     () => void;
  search:           (q?: string) => Promise<void>;
  clearResults:     () => void;
  clearHistory:     () => Promise<void>;
  onFocusInput:     () => void;
  onBlurInput:      () => void;
  loadSuggestions:  (prefix: string) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalSearch(): UseGlobalSearchReturn {
  const { user } = useAuth();

  const [query,           setQueryState]    = useState('');
  const [results,         setResults]       = useState<SearchResult[]>([]);
  const [isSearching,     setIsSearching]   = useState(false);
  const [filters,         setFiltersState]  = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const [totalCount,      setTotalCount]    = useState(0);
  const [error,           setError]         = useState<string | null>(null);
  const [hasSearched,     setHasSearched]   = useState(false);
  const [isSemanticReady, setSemanticReady] = useState(false);
  const [suggestions,     setSuggestions]   = useState<SearchHistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');

  // ── Auto-search when query / filters change (debounced) ───────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || query.trim().length < MIN_SEARCH_CHARS) {
      if (!query.trim()) {
        setResults([]);
        setHasSearched(false);
        setTotalCount(0);
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filters]);

  // ── Core search runner ────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    if (!user || !q.trim()) return;

    const trimmedQuery = q.trim();
    latestQueryRef.current = trimmedQuery;

    setIsSearching(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const data = await hybridSearch(trimmedQuery, user.id, filters);

      // Guard: discard if a newer search has started
      if (latestQueryRef.current !== trimmedQuery) return;

      setResults(data);
      setTotalCount(data.length);
      setHasSearched(true);

      // Detect whether semantic search returned any results
      const hasSemanticHits = data.some(r => (r.semanticScore ?? 0) > 0);
      setSemanticReady(hasSemanticHits);

      // Log to history (fire-and-forget)
      logSearch(user.id, trimmedQuery, filters.contentType === 'all' ? null : filters.contentType, data.length);

    } catch (err) {
      if (latestQueryRef.current !== trimmedQuery) return;
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setResults([]);
      setTotalCount(0);
    } finally {
      if (latestQueryRef.current === trimmedQuery) {
        setIsSearching(false);
      }
    }
  }, [user, filters]);

  // ── Public: search (immediate, no debounce) ───────────────────────────────

  const search = useCallback(async (q?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await runSearch(q ?? query);
  }, [runSearch, query]);

  // ── Public: setQuery ──────────────────────────────────────────────────────

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    if (q.trim().length >= MIN_SEARCH_CHARS) {
      loadSuggestions(q.trim());
    } else if (!q.trim()) {
      setSuggestions([]);
    }
  }, []);

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
    setHasSearched(false);
    setTotalCount(0);
    setError(null);
    setSemanticReady(false);
    setSuggestions([]);
    setShowSuggestions(false);
    latestQueryRef.current = '';
  }, []);

  // ── Public: clearHistory ──────────────────────────────────────────────────

  const clearHistory = useCallback(async () => {
    if (!user) return;
    setSuggestions([]);
    await clearSearchHistory(user.id);
  }, [user]);

  // ── Suggestions ───────────────────────────────────────────────────────────

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
    if (user && !query.trim()) {
      loadSuggestions('');
    }
    setShowSuggestions(true);
  }, [user, query, loadSuggestions]);

  const onBlurInput = useCallback(() => {
    // Delay so taps on suggestion items register before hiding
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  return {
    query,
    results,
    isSearching,
    isSemanticReady,
    filters,
    totalCount,
    error,
    hasSearched,
    suggestions,
    showSuggestions,
    setQuery,
    setFilters,
    resetFilters,
    search,
    clearResults,
    clearHistory,
    onFocusInput,
    onBlurInput,
    loadSuggestions,
  };
}