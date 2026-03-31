// src/services/globalSearchService.ts
// Part 35 — Personal keyword + semantic + hybrid search
// Part 37 — Added: communityKeywordSearch, communitySemanticSearch,
//                  communityHybridSearch, searchPublicResearchers
// Part 37 FIX — CommunitySemantic error suppression now catches the actual
//               PostgREST message: "Could not find the function...in the schema cache"

import { supabase }        from '../lib/supabase';
import { createEmbedding } from './embeddingService';
import {
  SearchResult, SearchFilters, SearchHistoryItem, SemanticSearchRow,
  CommunitySearchResult, CommunitySemanticRow, PublicResearcherResult,
} from '../types/search';
import {
  MAX_KEYWORD_RESULTS_PER_TYPE,
  SEMANTIC_SIMILARITY_THRESHOLD, SEMANTIC_MAX_RESULTS,
  SEMANTIC_WEIGHT, KEYWORD_WEIGHT,
  COMMUNITY_MAX_RESULTS, COMMUNITY_SEMANTIC_THRESHOLD, COMMUNITY_SEMANTIC_MAX_RESULTS,
} from '../constants/search';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function keywordRelevance(text: string, terms: string[]): number {
  if (!text || !terms.length) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of terms) if (t.length > 1 && lower.includes(t)) hits++;
  return Math.min(1, hits / terms.length);
}

function tokenize(q: string): string[] {
  return q.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function toPreview(text?: string | null): string {
  return text ? text.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

function inDateRange(d: string, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const ts = new Date(d).getTime();
  if (from && ts < new Date(from).getTime()) return false;
  if (to   && ts > new Date(to).getTime())   return false;
  return true;
}

function sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
  return [...results].sort((a, b) => {
    if (sortBy === 'date_desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (sortBy === 'date_asc')  return new Date(a.date).getTime() - new Date(b.date).getTime();
    if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
    return b.combinedScore - a.combinedScore;
  });
}

function sortCommunity(
  r: CommunitySearchResult[],
  s: 'views' | 'recent' | 'relevance' = 'relevance',
) {
  return [...r].sort((a, b) => {
    if (s === 'views')  return b.viewCount - a.viewCount;
    if (s === 'recent') return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    return b.combinedScore - a.combinedScore;
  });
}

// Part 37 FIX: checks all known forms of "RPC not found" error
function isRpcMissingError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('42883') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    (lower.includes('function') && lower.includes('not found'))
  );
}

// ─── Personal keyword search ──────────────────────────────────────────────────

export async function keywordSearch(
  query: string, userId: string, filters: SearchFilters,
): Promise<SearchResult[]> {
  const terms = tokenize(query);
  const like  = `%${query.trim()}%`;
  const needs = (t: string) => filters.contentType === 'all' || filters.contentType === t;
  const tasks: Promise<SearchResult[]>[] = [];

  if (needs('report')) tasks.push((async (): Promise<SearchResult[]> => {
    let q = supabase.from('research_reports')
      .select('id, title, query, depth, executive_summary, status, created_at, sources_count, reliability_score')
      .eq('user_id', userId).eq('status', 'completed')
      .or(`title.ilike.${like},query.ilike.${like},executive_summary.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
    if (filters.depth) q = q.eq('depth', filters.depth);
    const { data } = await q;
    return (data ?? []).filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo)).map(r => {
      const s = keywordRelevance(`${r.title} ${r.query} ${r.executive_summary ?? ''}`, terms);
      return { id: r.id, contentType: 'report' as const,
        title:    r.title ?? r.query ?? 'Untitled Report',
        subtitle: r.depth ? `${r.depth.charAt(0).toUpperCase() + r.depth.slice(1)} research` : '',
        preview: toPreview(r.executive_summary), depth: r.depth, status: r.status, date: r.created_at,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
        metadata: { sourcesCount: r.sources_count, reliabilityScore: r.reliability_score },
      } as SearchResult;
    });
  })());

  if (needs('podcast')) tasks.push((async (): Promise<SearchResult[]> => {
    const { data } = await supabase.from('podcasts')
      .select('id, title, topic, description, status, created_at, duration_seconds')
      .eq('user_id', userId).eq('status', 'completed')
      .or(`title.ilike.${like},topic.ilike.${like},description.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
    return (data ?? []).filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo)).map(r => {
      const s    = keywordRelevance(`${r.title} ${r.topic} ${r.description ?? ''}`, terms);
      const mins = r.duration_seconds ? Math.round(r.duration_seconds / 60) : null;
      return { id: r.id, contentType: 'podcast' as const,
        title: r.title ?? r.topic ?? 'Untitled Podcast',
        subtitle: mins ? `${mins} min episode` : 'Podcast',
        preview: toPreview(r.description), status: r.status, date: r.created_at,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
        metadata: { durationSeconds: r.duration_seconds },
      } as SearchResult;
    });
  })());

  if (needs('debate')) tasks.push((async (): Promise<SearchResult[]> => {
    const { data } = await supabase.from('debate_sessions')
      .select('id, topic, question, status, created_at, search_results_count')
      .eq('user_id', userId).eq('status', 'completed')
      .or(`topic.ilike.${like},question.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
    return (data ?? []).filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo)).map(r => {
      const s = keywordRelevance(`${r.topic} ${r.question ?? ''}`, terms);
      return { id: r.id, contentType: 'debate' as const,
        title: r.topic ?? 'Untitled Debate', subtitle: r.question ?? '6 AI agents debated',
        preview: r.question ? toPreview(r.question) : undefined, status: r.status, date: r.created_at,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
        metadata: { searchResultsCount: r.search_results_count },
      } as SearchResult;
    });
  })());

  if (needs('presentation')) tasks.push((async (): Promise<SearchResult[]> => {
    const { data } = await supabase.from('presentations')
      .select('id, report_id, title, subtitle, theme, total_slides, created_at')
      .eq('user_id', userId).ilike('title', like)
      .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
    return (data ?? []).filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo)).map(r => {
      const s = keywordRelevance(`${r.title} ${r.subtitle ?? ''}`, terms);
      return { id: r.id, contentType: 'presentation' as const,
        title: r.title ?? 'Untitled Presentation',
        subtitle: r.total_slides ? `${r.total_slides} slides · ${r.theme}` : '',
        preview: toPreview(r.subtitle), date: r.created_at,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
        metadata: { theme: r.theme, totalSlides: r.total_slides, reportId: r.report_id ?? null },
      } as SearchResult;
    });
  })());

  if (needs('academic_paper')) tasks.push((async (): Promise<SearchResult[]> => {
    const { data } = await supabase.from('academic_papers')
      .select('id, report_id, title, abstract, citation_style, word_count, created_at')
      .eq('user_id', userId).or(`title.ilike.${like},abstract.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(MAX_KEYWORD_RESULTS_PER_TYPE);
    return (data ?? []).filter(r => inDateRange(r.created_at, filters.dateFrom, filters.dateTo)).map(r => {
      const s = keywordRelevance(`${r.title} ${r.abstract ?? ''}`, terms);
      return { id: r.id, contentType: 'academic_paper' as const,
        title: r.title ?? 'Untitled Paper',
        subtitle: r.citation_style
          ? `${(r.citation_style as string).toUpperCase()} · ${r.word_count ?? 0} words` : '',
        preview: toPreview(r.abstract), date: r.created_at,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
        metadata: { citationStyle: r.citation_style, wordCount: r.word_count, reportId: r.report_id ?? null },
      } as SearchResult;
    });
  })());

  const settled = await Promise.allSettled(tasks);
  const out: SearchResult[] = [];
  for (const r of settled) if (r.status === 'fulfilled') out.push(...r.value);
  return sortResults(out, filters.sortBy);
}

export async function semanticSearch(
  query: string, userId: string, limit = SEMANTIC_MAX_RESULTS,
): Promise<SearchResult[]> {
  let emb: number[];
  try { emb = await createEmbedding(query); } catch { return []; }
  const { data, error } = await supabase.rpc('search_reports_semantic', {
    query_embedding: emb, p_user_id: userId,
    match_count: limit, match_threshold: SEMANTIC_SIMILARITY_THRESHOLD,
  });
  if (error) { console.warn('[SemanticSearch] RPC error:', error.message); return []; }
  return ((data ?? []) as SemanticSearchRow[]).map(row => ({
    id: row.report_id, contentType: 'report' as const,
    title: row.title ?? row.query ?? 'Untitled Report',
    subtitle: row.depth ? `${row.depth.charAt(0).toUpperCase() + row.depth.slice(1)} research` : 'Research',
    preview: toPreview(row.executive_summary), depth: row.depth, date: row.created_at,
    keywordScore: 0, semanticScore: row.best_similarity,
    combinedScore: row.best_similarity * SEMANTIC_WEIGHT,
    matchedChunkType: row.best_chunk_type, metadata: {},
  } as SearchResult));
}

export async function hybridSearch(
  query: string, userId: string, filters: SearchFilters,
): Promise<SearchResult[]> {
  const semMode = filters.searchMode === 'semantic';
  const kwMode  = filters.searchMode === 'keyword';
  const canSem  = (filters.contentType === 'all' || filters.contentType === 'report') && !kwMode;

  const [kwR, semR] = await Promise.all([
    semMode ? Promise.resolve([]) : keywordSearch(query, userId, filters),
    canSem  ? semanticSearch(query, userId) : Promise.resolve([]),
  ]);

  if (kwMode)  return sortResults(kwR,  filters.sortBy);
  if (semMode) return sortResults(semR, filters.sortBy);

  const byId = new Map<string, SearchResult>();
  for (const r of kwR) byId.set(r.id, r);
  for (const s of semR) {
    const ex = byId.get(s.id);
    if (ex) {
      ex.semanticScore = s.semanticScore;
      ex.matchedChunkType = s.matchedChunkType;
      ex.combinedScore =
        (s.semanticScore ?? 0) * SEMANTIC_WEIGHT + ex.keywordScore * KEYWORD_WEIGHT;
    } else {
      byId.set(s.id, { ...s, combinedScore: (s.semanticScore ?? 0) * SEMANTIC_WEIGHT });
    }
  }
  return sortResults(Array.from(byId.values()), filters.sortBy);
}

// ─── Community search ─────────────────────────────────────────────────────────

export async function communityKeywordSearch(
  query: string, limit = COMMUNITY_MAX_RESULTS, offset = 0,
): Promise<CommunitySearchResult[]> {
  if (!query.trim()) return [];
  try {
    const { data, error } = await supabase.rpc('search_public_reports', {
      p_query: query.trim(), p_limit: limit, p_offset: offset,
    });
    if (error) { console.warn('[CommunityKeyword] RPC error:', error.message); return []; }
    const rows  = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const terms = tokenize(query);
    return rows.map(row => {
      const title = String(row.title ?? '');
      const sum   = String(row.executive_summary ?? '');
      const tags  = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      const s     = keywordRelevance(`${title} ${sum} ${tags.join(' ')}`, terms);
      return {
        shareId:  String(row.share_id ?? ''), reportId: String(row.report_id ?? ''),
        title, executiveSummary: sum,
        depth:   (String(row.depth ?? 'quick')) as CommunitySearchResult['depth'],
        tags,    viewCount: Number(row.view_count ?? 0),
        publishedAt:    String(row.published_at ?? new Date().toISOString()),
        researchMode:   (String(row.research_mode ?? 'standard')) as 'standard' | 'academic',
        authorUsername: row.author_username  != null ? String(row.author_username)  : null,
        authorFullName: row.author_full_name != null ? String(row.author_full_name) : null,
        authorAvatarUrl:row.author_avatar_url != null ? String(row.author_avatar_url) : null,
        keywordScore: Math.max(0.3, s), combinedScore: Math.max(0.3, s),
      } as CommunitySearchResult;
    });
  } catch { return []; }
}

export async function communitySemanticSearch(
  query: string, limit = COMMUNITY_SEMANTIC_MAX_RESULTS,
): Promise<CommunitySearchResult[]> {
  if (!query.trim()) return [];
  let emb: number[];
  try { emb = await createEmbedding(query); } catch { return []; }
  try {
    const { data, error } = await supabase.rpc('search_public_reports_semantic', {
      query_embedding: emb, match_count: limit, match_threshold: COMMUNITY_SEMANTIC_THRESHOLD,
    });
    if (error) {
      // FIX: silently ignore any variant of "RPC not found" without logging
      if (isRpcMissingError(error.message)) return [];
      console.warn('[CommunitySemantic] RPC error:', error.message);
      return [];
    }
    const rows = Array.isArray(data) ? (data as CommunitySemanticRow[]) : [];
    return rows.map(row => ({
      shareId: row.share_id ?? '', reportId: row.report_id ?? '',
      title: row.title ?? '', executiveSummary: row.executive_summary ?? '',
      depth: (row.depth ?? 'quick') as CommunitySearchResult['depth'],
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      viewCount: Number(row.view_count ?? 0),
      publishedAt: row.published_at ?? new Date().toISOString(),
      researchMode: 'standard' as const,
      authorUsername:  row.author_username  ?? null,
      authorFullName:  row.author_full_name  ?? null,
      authorAvatarUrl: row.author_avatar_url ?? null,
      keywordScore: 0, semanticScore: row.best_similarity,
      combinedScore: row.best_similarity * SEMANTIC_WEIGHT,
    }));
  } catch { return []; }  // FIX: catch-all so no warning is logged
}

export async function communityHybridSearch(
  query: string,
  sortBy: 'relevance' | 'views' | 'recent' = 'relevance',
  limit = COMMUNITY_MAX_RESULTS,
): Promise<{ results: CommunitySearchResult[]; semanticAvailable: boolean }> {
  if (!query.trim()) return { results: [], semanticAvailable: false };
  const [kwR, semR] = await Promise.allSettled([
    communityKeywordSearch(query, limit),
    communitySemanticSearch(query),
  ]);
  const kw  = kwR.status  === 'fulfilled' ? kwR.value  : [];
  const sem = semR.status === 'fulfilled' ? semR.value : [];
  if (!sem.length) return { results: sortCommunity(kw, sortBy), semanticAvailable: false };

  const byId = new Map<string, CommunitySearchResult>();
  for (const r of kw) byId.set(r.shareId, r);
  for (const s of sem) {
    const ex = byId.get(s.shareId);
    if (ex) {
      ex.semanticScore = s.semanticScore;
      ex.combinedScore = (s.semanticScore ?? 0) * SEMANTIC_WEIGHT + ex.keywordScore * KEYWORD_WEIGHT;
    } else {
      byId.set(s.shareId, { ...s, combinedScore: (s.semanticScore ?? 0) * SEMANTIC_WEIGHT });
    }
  }
  return { results: sortCommunity(Array.from(byId.values()), sortBy), semanticAvailable: true };
}

// ─── Researcher search (Part 37) ──────────────────────────────────────────────

export async function searchPublicResearchers(
  query: string, limit = 5,
): Promise<PublicResearcherResult[]> {
  if (!query.trim() || query.trim().length < 2) return [];
  try {
    const { data, error } = await supabase.rpc('get_explore_researchers', {
      p_sort: 'followers', p_search: query.trim(), p_limit: limit, p_offset: 0,
    });
    if (error) { console.warn('[ResearcherSearch] RPC error:', error.message); return []; }
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return rows.map(row => ({
      id:                  String(row.id          ?? ''),
      username:            row.username   != null ? String(row.username)   : null,
      full_name:           row.full_name  != null ? String(row.full_name)  : null,
      avatar_url:          row.avatar_url != null ? String(row.avatar_url) : null,
      bio:                 row.bio        != null ? String(row.bio)        : null,
      interests:           Array.isArray(row.interests) ? (row.interests as string[]) : [],
      follower_count:      Number(row.follower_count      ?? 0),
      following_count:     Number(row.following_count     ?? 0),
      report_count:        Number(row.report_count        ?? 0),
      public_report_count: Number(row.public_report_count ?? row.report_count ?? 0),
      recent_reports:      Number(row.recent_reports      ?? 0),
      is_following:        Boolean(row.is_following       ?? false),
    } as PublicResearcherResult));
  } catch { return []; }
}

// ─── Search history ───────────────────────────────────────────────────────────

export async function logSearch(
  userId: string, query: string, contentType: string | null, count: number,
): Promise<void> {
  try {
    await supabase.rpc('log_search_history', {
      p_user_id: userId, p_query: query, p_content_type: contentType, p_results_count: count,
    });
  } catch { /* non-critical */ }
}

export async function getSearchSuggestions(
  userId: string, prefix = '',
): Promise<SearchHistoryItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_search_suggestions', {
      p_user_id: userId, p_prefix: prefix, p_limit: 8,
    });
    if (error || !data) return [];
    return (data as any[]).map(r => ({
      query: r.query as string, lastUsedAt: r.last_used_at as string, useCount: Number(r.use_count),
    }));
  } catch { return []; }
}

export async function clearSearchHistory(userId: string): Promise<void> {
  await supabase.from('search_history').delete().eq('user_id', userId);
}