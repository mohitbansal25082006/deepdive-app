// src/services/exploreService.ts
// DeepDive AI — Part 36: Explore researchers service.

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExploreResearcher {
  id:              string;
  username:        string | null;
  full_name:       string | null;
  avatar_url:      string | null;
  bio:             string | null;
  interests:       string[];
  follower_count:  number;
  following_count: number;
  report_count:    number;
  recent_reports:  number;
  is_following:    boolean;
  /** Only set on suggested researchers — number of shared interests */
  overlap_count?:  number;
}

export type ExploreSortKey = 'followers' | 'active' | 'newest';

// ─── Explore (paginated) ──────────────────────────────────────────────────────

export async function getExploreResearchers(
  sort:   ExploreSortKey = 'followers',
  search: string         = '',
  limit:  number         = 20,
  offset: number         = 0,
): Promise<ExploreResearcher[]> {
  try {
    const { data, error } = await supabase.rpc('get_explore_researchers', {
      p_sort:   sort,
      p_search: search.trim().length > 0 ? search.trim() : null,
      p_limit:  limit,
      p_offset: offset,
    });
    if (error) {
      console.warn('[exploreService] getExploreResearchers error:', error.message);
      return [];
    }
    return Array.isArray(data) ? (data as ExploreResearcher[]) : [];
  } catch (err) {
    console.warn('[exploreService] getExploreResearchers exception:', err);
    return [];
  }
}

// ─── Suggested (interest-overlap) ─────────────────────────────────────────────

export async function getSuggestedResearchers(
  limit = 5,
): Promise<ExploreResearcher[]> {
  try {
    const { data, error } = await supabase.rpc('get_suggested_researchers', {
      p_limit: limit,
    });
    if (error) {
      console.warn('[exploreService] getSuggestedResearchers error:', error.message);
      return [];
    }
    return Array.isArray(data) ? (data as ExploreResearcher[]) : [];
  } catch (err) {
    console.warn('[exploreService] getSuggestedResearchers exception:', err);
    return [];
  }
}