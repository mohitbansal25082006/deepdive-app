// src/services/globalSearchService.ts
// Part 35 — FIXED
//
// Changes from original:
//   1. Presentations query now selects `report_id` → metadata.reportId
//   2. Academic papers query now selects `report_id` → metadata.reportId
//   3. All three search modes work independently (keyword / semantic / hybrid)

import { supabase }       from '../lib/supabase';
import { createEmbedding } from './embeddingService';
import {
  SearchResult,
  SearchFilters,
  SearchHistoryItem,
  SemanticSearchRow,
} from '../types/search';
import {
  MAX_KEYWORD_RESULTS_PER_TYPE,
  SEMANTIC_SIMILARITY_THRESHOLD,
  SEMANTIC_MAX_RESULTS,
  SEMANTIC_WEIGHT,
  KEYWORD_WEIGHT,
} from '../constants/search';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function keywordRelevance(text: string, terms: string[]): number {
  if (!text || terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of terms) { if (term.length > 1 && lower.includes(term)) hits++; }
  return Math.min(1, hits / terms.length);
}

function tokenize(query: string): string[] {
  return query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function toPreview(text?: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function inDateRange(dateStr: string, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const d = new Date(dateStr).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to   && d > new Date(to).getTime())   return false;
  return true;
}

// ─── Keyword Search ───────────────────────────────────────────────────────────

export async function keywordSearch(
  query:   string,
  userId:  string,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const terms    = tokenize(query);
  const likeExpr = `%${query.trim()}%`;
  const shouldFetch = (type: string) =>
    filters.contentType === 'all' || filters.contentType === type;

  const tasks: Promise<SearchResult[]>[] = [];

  // Reports
  if (shouldFetch('report')) {
    tasks.push((async (): Promise<SearchResult[]> => {
      let q = supabase
        .from('research_reports')
        .select('id, title, query, depth, executive_summary, status, created_at, sources_count, reliability_score')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .or(`title.ilike.${likeExpr},query.ilike.${likeExpr},executive_summary.ilike.${likeExpr}`)
        .order('created_at', { ascending: false })
        .limit(MAX_KEYWORD_RESULTS_PER_TYPE);
      if (filters.depth) q = q.eq('depth', filters.depth);
      const { data } = await q;
      return (data ?? [])
        .filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo))
        .map(r => {
          const score = keywordRelevance(`${r.title} ${r.query} ${r.executive_summary ?? ''}`, terms);
          return {
            id: r.id, contentType: 'report' as const,
            title:        r.title ?? r.query ?? 'Untitled Report',
            subtitle:     r.depth ? `${r.depth.charAt(0).toUpperCase() + r.depth.slice(1)} research` : '',
            preview:      toPreview(r.executive_summary),
            depth: r.depth, status: r.status, date: r.created_at,
            keywordScore: Math.max(0.3, score), combinedScore: Math.max(0.3, score),
            metadata: { sourcesCount: r.sources_count, reliabilityScore: r.reliability_score },
          } as SearchResult;
        });
    })());
  }

  // Podcasts
  if (shouldFetch('podcast')) {
    tasks.push((async (): Promise<SearchResult[]> => {
      const { data } = await supabase
        .from('podcasts')
        .select('id, title, topic, description, status, created_at, duration_seconds')
        .eq('user_id', userId).eq('status', 'completed')
        .or(`title.ilike.${likeExpr},topic.ilike.${likeExpr},description.ilike.${likeExpr}`)
        .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
      return (data ?? [])
        .filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo))
        .map(r => {
          const score = keywordRelevance(`${r.title} ${r.topic} ${r.description ?? ''}`, terms);
          const mins  = r.duration_seconds ? Math.round(r.duration_seconds / 60) : null;
          return {
            id: r.id, contentType: 'podcast' as const,
            title:    r.title ?? r.topic ?? 'Untitled Podcast',
            subtitle: mins ? `${mins} min episode` : 'Podcast',
            preview:  toPreview(r.description), status: r.status, date: r.created_at,
            keywordScore: Math.max(0.3, score), combinedScore: Math.max(0.3, score),
            metadata: { durationSeconds: r.duration_seconds },
          } as SearchResult;
        });
    })());
  }

  // Debates
  if (shouldFetch('debate')) {
    tasks.push((async (): Promise<SearchResult[]> => {
      const { data } = await supabase
        .from('debate_sessions')
        .select('id, topic, question, status, created_at, search_results_count')
        .eq('user_id', userId).eq('status', 'completed')
        .or(`topic.ilike.${likeExpr},question.ilike.${likeExpr}`)
        .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
      return (data ?? [])
        .filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo))
        .map(r => {
          const score = keywordRelevance(`${r.topic} ${r.question ?? ''}`, terms);
          return {
            id: r.id, contentType: 'debate' as const,
            title:   r.topic ?? 'Untitled Debate',
            subtitle: r.question ?? '6 AI agents debated',
            preview:  r.question ? toPreview(r.question) : undefined,
            status:   r.status, date: r.created_at,
            keywordScore: Math.max(0.3, score), combinedScore: Math.max(0.3, score),
            metadata: { searchResultsCount: r.search_results_count },
          } as SearchResult;
        });
    })());
  }

  // Presentations — FIX: include report_id
  if (shouldFetch('presentation')) {
    tasks.push((async (): Promise<SearchResult[]> => {
      const { data } = await supabase
        .from('presentations')
        .select('id, report_id, title, subtitle, theme, total_slides, created_at')
        .eq('user_id', userId)
        .ilike('title', likeExpr)
        .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
      return (data ?? [])
        .filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo))
        .map(r => {
          const score = keywordRelevance(`${r.title} ${r.subtitle ?? ''}`, terms);
          return {
            id: r.id, contentType: 'presentation' as const,
            title:    r.title ?? 'Untitled Presentation',
            subtitle: r.total_slides ? `${r.total_slides} slides · ${r.theme}` : '',
            preview:  toPreview(r.subtitle), date: r.created_at,
            keywordScore: Math.max(0.3, score), combinedScore: Math.max(0.3, score),
            metadata: {
              theme: r.theme, totalSlides: r.total_slides,
              reportId: r.report_id ?? null,  // ← FIX
            },
          } as SearchResult;
        });
    })());
  }

  // Academic Papers — FIX: include report_id
  if (shouldFetch('academic_paper')) {
    tasks.push((async (): Promise<SearchResult[]> => {
      const { data } = await supabase
        .from('academic_papers')
        .select('id, report_id, title, abstract, citation_style, word_count, created_at')
        .eq('user_id', userId)
        .or(`title.ilike.${likeExpr},abstract.ilike.${likeExpr}`)
        .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
      return (data ?? [])
        .filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo))
        .map(r => {
          const score = keywordRelevance(`${r.title} ${r.abstract ?? ''}`, terms);
          return {
            id: r.id, contentType: 'academic_paper' as const,
            title:    r.title ?? 'Untitled Paper',
            subtitle: r.citation_style
              ? `${(r.citation_style as string).toUpperCase()} · ${r.word_count ?? 0} words`
              : '',
            preview: toPreview(r.abstract), date: r.created_at,
            keywordScore: Math.max(0.3, score), combinedScore: Math.max(0.3, score),
            metadata: {
              citationStyle: r.citation_style, wordCount: r.word_count,
              reportId: r.report_id ?? null,  // ← FIX
            },
          } as SearchResult;
        });
    })());
  }

  const settled = await Promise.allSettled(tasks);
  const results: SearchResult[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return sortResults(results, filters.sortBy);
}

// ─── Semantic Search ──────────────────────────────────────────────────────────

export async function semanticSearch(
  query:  string,
  userId: string,
  limit:  number = SEMANTIC_MAX_RESULTS,
): Promise<SearchResult[]> {
  let embedding: number[];
  try {
    embedding = await createEmbedding(query);
  } catch (err) {
    console.warn('[SemanticSearch] Embedding failed:', err);
    return [];
  }

  const { data, error } = await supabase.rpc('search_reports_semantic', {
    query_embedding: embedding,
    p_user_id:       userId,
    match_count:     limit,
    match_threshold: SEMANTIC_SIMILARITY_THRESHOLD,
  });

  if (error) {
    console.warn('[SemanticSearch] RPC error:', error.message);
    return [];
  }

  return ((data ?? []) as SemanticSearchRow[]).map(row => ({
    id:               row.report_id,
    contentType:      'report' as const,
    title:            row.title ?? row.query ?? 'Untitled Report',
    subtitle:         row.depth
      ? `${row.depth.charAt(0).toUpperCase() + row.depth.slice(1)} research`
      : 'Research report',
    preview:          toPreview(row.executive_summary),
    depth:            row.depth,
    date:             row.created_at,
    keywordScore:     0,
    semanticScore:    row.best_similarity,
    combinedScore:    row.best_similarity * SEMANTIC_WEIGHT,
    matchedChunkType: row.best_chunk_type,
    metadata:         {},
  } as SearchResult));
}

// ─── Hybrid Search ────────────────────────────────────────────────────────────

export async function hybridSearch(
  query:   string,
  userId:  string,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const isSemanticMode = filters.searchMode === 'semantic';
  const isKeywordMode  = filters.searchMode === 'keyword';

  // Semantic only works for reports (embeddings are report-only)
  const canSemantic = (filters.contentType === 'all' || filters.contentType === 'report')
    && !isKeywordMode;

  const [keywordResults, semanticResults] = await Promise.all([
    isSemanticMode ? Promise.resolve([]) : keywordSearch(query, userId, filters),
    canSemantic    ? semanticSearch(query, userId) : Promise.resolve([]),
  ]);

  if (isKeywordMode)  return sortResults(keywordResults,  filters.sortBy);
  if (isSemanticMode) return sortResults(semanticResults, filters.sortBy);

  // Hybrid: merge keyword + semantic, boost shared items
  const byId = new Map<string, SearchResult>();
  for (const r of keywordResults) byId.set(r.id, r);

  for (const s of semanticResults) {
    const existing = byId.get(s.id);
    if (existing) {
      existing.semanticScore    = s.semanticScore;
      existing.matchedChunkType = s.matchedChunkType;
      existing.combinedScore    =
        (s.semanticScore ?? 0) * SEMANTIC_WEIGHT +
        existing.keywordScore   * KEYWORD_WEIGHT;
    } else {
      byId.set(s.id, { ...s, combinedScore: (s.semanticScore ?? 0) * SEMANTIC_WEIGHT });
    }
  }

  return sortResults(Array.from(byId.values()), filters.sortBy);
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
  return [...results].sort((a, b) => {
    switch (sortBy) {
      case 'date_desc': return new Date(b.date).getTime() - new Date(a.date).getTime();
      case 'date_asc':  return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'title_asc': return a.title.localeCompare(b.title);
      default:          return b.combinedScore - a.combinedScore;
    }
  });
}

// ─── Search History ───────────────────────────────────────────────────────────

export async function logSearch(
  userId: string, query: string, contentType: string | null, count: number,
): Promise<void> {
  try {
    await supabase.rpc('log_search_history', {
      p_user_id: userId, p_query: query,
      p_content_type: contentType, p_results_count: count,
    });
  } catch { /* non-critical */ }
}

export async function getSearchSuggestions(
  userId: string, prefix: string = '',
): Promise<SearchHistoryItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_search_suggestions', {
      p_user_id: userId, p_prefix: prefix, p_limit: 8,
    });
    if (error || !data) return [];
    return (data as any[]).map(row => ({
      query:      row.query as string,
      lastUsedAt: row.last_used_at as string,
      useCount:   Number(row.use_count),
    }));
  } catch { return []; }
}

export async function clearSearchHistory(userId: string): Promise<void> {
  await supabase.from('search_history').delete().eq('user_id', userId);
}