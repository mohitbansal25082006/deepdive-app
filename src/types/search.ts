// src/types/search.ts
// Part 35 — Global Search Hub + Semantic Search: Type Definitions
// Part 37 — Added: SearchScope, CommunitySearchResult, CommunitySearchState,
//                  PublicResearcherResult, CommunitySemanticRow

export type SearchContentType =
  | 'all' | 'report' | 'podcast' | 'debate' | 'presentation' | 'academic_paper';

export type SearchSortBy = 'relevance' | 'date_desc' | 'date_asc' | 'title_asc';
export type SearchMode   = 'keyword' | 'semantic' | 'hybrid';
export type SearchScope  = 'personal' | 'community';

export interface SearchFilters {
  contentType:  SearchContentType;
  dateFrom?:    string;
  dateTo?:      string;
  depth?:       'quick' | 'deep' | 'expert';
  sortBy:       SearchSortBy;
  searchMode:   SearchMode;
  searchScope:  SearchScope;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  contentType: 'all',
  sortBy:      'relevance',
  searchMode:  'hybrid',
  searchScope: 'personal',
};

export interface SearchResult {
  id:              string;
  contentType:     Exclude<SearchContentType, 'all'>;
  title:           string;
  subtitle?:       string;
  preview?:        string;
  depth?:          string;
  status?:         string;
  date:            string;
  keywordScore:    number;
  semanticScore?:  number;
  combinedScore:   number;
  matchedChunkType?: string;
  matchHighlights?:  string[];
  metadata?:         Record<string, unknown>;
}

export interface CommunitySearchResult {
  shareId:          string;
  reportId:         string;
  title:            string;
  executiveSummary: string;
  depth:            'quick' | 'deep' | 'expert';
  tags:             string[];
  viewCount:        number;
  publishedAt:      string;
  researchMode?:    'standard' | 'academic';
  authorUsername:   string | null;
  authorFullName:   string | null;
  authorAvatarUrl:  string | null;
  keywordScore:     number;
  semanticScore?:   number;
  combinedScore:    number;
}

/** Public researcher profile from searchPublicResearchers() */
export interface PublicResearcherResult {
  id:                  string;
  username:            string | null;
  full_name:           string | null;
  avatar_url:          string | null;
  bio:                 string | null;
  interests:           string[];
  follower_count:      number;
  following_count:     number;
  report_count:        number;
  public_report_count: number;
  recent_reports:      number;
  is_following:        boolean;
}

export interface SearchState {
  query:           string;
  results:         SearchResult[];
  isSearching:     boolean;
  isSemanticReady: boolean;
  filters:         SearchFilters;
  totalCount:      number;
  error:           string | null;
  hasSearched:     boolean;
}

export interface CommunitySearchState {
  query:          string;
  results:        CommunitySearchResult[];
  isSearching:    boolean;
  isSemanticReady:boolean;
  totalCount:     number;
  error:          string | null;
  hasSearched:    boolean;
  recentQueries:  string[];
}

export interface SearchHistoryItem {
  query:      string;
  lastUsedAt: string;
  useCount:   number;
}

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

export interface CommunitySemanticRow {
  report_id:         string;
  share_id:          string;
  title:             string;
  executive_summary: string;
  depth:             string;
  tags:              string[];
  view_count:        number;
  published_at:      string;
  author_username:   string | null;
  author_full_name:  string | null;
  author_avatar_url: string | null;
  best_similarity:   number;
}