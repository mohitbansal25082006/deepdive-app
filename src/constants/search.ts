// src/constants/search.ts
// Part 35 — Search UI constants

import type { SearchContentType, SearchSortBy, SearchMode } from '../types/search';

// ─── Content type display ─────────────────────────────────────────────────────

export const CONTENT_TYPE_META: Record<
  SearchContentType,
  { label: string; icon: string; color: string; pluralLabel: string }
> = {
  all:           { label: 'All',           pluralLabel: 'All Results',       icon: 'grid-outline',             color: '#6C63FF' },
  report:        { label: 'Report',        pluralLabel: 'Reports',           icon: 'document-text-outline',    color: '#6C63FF' },
  podcast:       { label: 'Podcast',       pluralLabel: 'Podcasts',          icon: 'radio-outline',            color: '#FF6584' },
  debate:        { label: 'Debate',        pluralLabel: 'Debates',           icon: 'chatbox-ellipses-outline', color: '#43E97B' },
  presentation:  { label: 'Slides',        pluralLabel: 'Presentations',     icon: 'easel-outline',            color: '#8B5CF6' },
  academic_paper:{ label: 'Paper',         pluralLabel: 'Academic Papers',   icon: 'school-outline',           color: '#F59E0B' },
};

// ─── Sort options ─────────────────────────────────────────────────────────────

export const SORT_OPTIONS: { value: SearchSortBy; label: string; icon: string }[] = [
  { value: 'relevance',  label: 'Best Match', icon: 'sparkles-outline'   },
  { value: 'date_desc',  label: 'Newest',     icon: 'time-outline'       },
  { value: 'date_asc',   label: 'Oldest',     icon: 'timer-outline'      },
  { value: 'title_asc',  label: 'A → Z',      icon: 'text-outline'       },
];

// ─── Search mode options ──────────────────────────────────────────────────────

export const SEARCH_MODE_META: Record<
  SearchMode,
  { label: string; description: string; icon: string; color: string }
> = {
  keyword:  {
    label:       'Keyword',
    description: 'Exact word matching across all content',
    icon:        'search-outline',
    color:       '#29B6F6',
  },
  semantic: {
    label:       'Semantic',
    description: 'Find reports similar in meaning to your query',
    icon:        'git-network-outline',
    color:       '#43E97B',
  },
  hybrid:   {
    label:       'Hybrid',
    description: 'Combines keyword + semantic for best results',
    icon:        'sparkles-outline',
    color:       '#6C63FF',
  },
};

// ─── Suggested searches ───────────────────────────────────────────────────────

export const SEARCH_PLACEHOLDER_EXAMPLES = [
  'quantum computing startups',
  'electric vehicle market 2025',
  'AI replacing programmers',
  'climate change solutions',
  'cryptocurrency regulation',
  'remote work productivity',
  'gene therapy breakthroughs',
  'space exploration companies',
];

// ─── Min chars to trigger search ─────────────────────────────────────────────

export const MIN_SEARCH_CHARS = 2;

// ─── Debounce delay (ms) ──────────────────────────────────────────────────────

export const SEARCH_DEBOUNCE_MS = 350;

// ─── Max results per content type (keyword search) ───────────────────────────

export const MAX_KEYWORD_RESULTS_PER_TYPE = 15;

// ─── Semantic search threshold ────────────────────────────────────────────────

export const SEMANTIC_SIMILARITY_THRESHOLD = 0.28;
export const SEMANTIC_MAX_RESULTS          = 12;

// ─── Hybrid scoring weights ───────────────────────────────────────────────────
// combinedScore = (semantic * SEMANTIC_WEIGHT) + (keyword * KEYWORD_WEIGHT)
// If only keyword matches: combinedScore = keyword * 0.7 (penalty for no embedding)

export const SEMANTIC_WEIGHT = 0.60;
export const KEYWORD_WEIGHT  = 0.40;