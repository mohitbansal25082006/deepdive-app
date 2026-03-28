// src/types/search.ts
// Part 35 — Global Search Hub + Semantic Search: Type Definitions

// ─── Content Types ────────────────────────────────────────────────────────────

export type SearchContentType =
  | 'all'
  | 'report'
  | 'podcast'
  | 'debate'
  | 'presentation'
  | 'academic_paper';

export type SearchSortBy =
  | 'relevance'
  | 'date_desc'
  | 'date_asc'
  | 'title_asc';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface SearchFilters {
  contentType:  SearchContentType;
  dateFrom?:    string;   // ISO date string
  dateTo?:      string;
  depth?:       'quick' | 'deep' | 'expert';
  sortBy:       SearchSortBy;
  searchMode:   SearchMode;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  contentType: 'all',
  sortBy:      'relevance',
  searchMode:  'hybrid',
};

// ─── Result ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  id:              string;
  contentType:     Exclude<SearchContentType, 'all'>;
  title:           string;
  subtitle?:       string;
  preview?:        string;
  depth?:          string;
  status?:         string;
  date:            string;
  // Scoring
  keywordScore:    number;   // 0–1 keyword relevance
  semanticScore?:  number;   // 0–1 cosine similarity (reports only)
  combinedScore:   number;   // final merged rank score 0–1
  // Extras
  matchedChunkType?: string;
  matchHighlights?:  string[];
  metadata?:         Record<string, unknown>;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface SearchState {
  query:           string;
  results:         SearchResult[];
  isSearching:     boolean;
  isSemanticReady: boolean;    // true once embeddings confirmed to exist
  filters:         SearchFilters;
  totalCount:      number;
  error:           string | null;
  hasSearched:     boolean;
}

// ─── History / Suggestions ────────────────────────────────────────────────────

export interface SearchHistoryItem {
  query:      string;
  lastUsedAt: string;
  useCount:   number;
}

// ─── Semantic Search Row (from RPC) ──────────────────────────────────────────

export interface SemanticSearchRow {
  report_id:         string;
  title:             string;
  query:             string;
  depth:             string;
  executive_summary: string;
  created_at:        string;
  best_similarity:   number;
  best_chunk_type:   string;
}