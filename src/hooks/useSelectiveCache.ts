// src/hooks/useSelectiveCache.ts
// Part 45  — selective picker.
// Part 59.2 — portable paths, real on-disk sizes.
// Part 59.3 — manual caching no longer blocked by the auto-cache toggle, and
//             audio is always included.
//
// ─── THE BUG ────────────────────────────────────────────────────────────────
//
// cacheOneItem() called autoCacheReport / autoCachePodcast / etc., each of
// which opened with `if (!(await isAutoCacheEnabled())) return;`. So with
// "Auto-Cache Content" off, this picker — a screen whose entire job is manual
// caching — ran its full progress animation, reported "3 changes", and wrote
// nothing to disk. Every call site here now passes `{ force: true }`.
//
// The voice-debate branch also hand-rolled its own three-step cache sequence
// (JSON, index entry, audio) that had to be kept in sync with
// autoCacheVoiceDebate by hand. It drifted: the middleware learned to record
// real audio bytes and this copy did not. It now calls the same function
// everything else does.
//
// Size display: cached items show their true on-disk size including audio, so
// a 40 MB podcast reads as 40 MB rather than the SQL estimate or the JSON-only
// figure.

import { useState, useCallback, useEffect, useRef } from 'react';

import { supabase } from '../lib/supabase';
import { useAuth }   from '../context/AuthContext';
import {
  isCached,
  evictItemById,
  loadSettings,
  getCacheIndex,
}                    from '../lib/cacheStorage';
import {
  getPodcastAudioDiskBytes,
}                    from '../lib/podcastAudioCache';
import {
  evictVoiceDebateAudio,
  getVoiceDebateAudioDiskBytes,
}                    from '../lib/voiceDebateAudioCache';
import {
  isVoiceDebateJsonCached,
  evictVoiceDebateJson,
}                    from '../lib/voiceDebateCache';
import {
  autoCacheReport,
  autoCachePodcast,
  autoCacheDebate,
  autoCacheAcademicPaper,
  autoCachePresentation,
  autoCacheVoiceDebate,
}                    from '../lib/autoCacheMiddleware';
import { mapRowToPodcast }     from '../services/podcastOrchestrator';
import { mapRowToVoiceDebate } from '../services/voiceDebateOrchestrator';
import type {
  CachedContentType,
  CacheFilterType,
  SelectiveCacheItem,
  SelectiveCacheState,
}                    from '../types/cache';

// ─── Fetch the user's cacheable content ──────────────────────────────────────

async function fetchSelectableItems(userId: string): Promise<SelectiveCacheItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_content_for_selective_cache', {
      p_user_id: userId,
      p_limit:   50,
    });

    if (error || !data) {
      console.warn('[useSelectiveCache] RPC error:', error?.message);
      return [];
    }

    const rows = data as Array<{
      content_type: string;
      id:           string;
      title:        string;
      subtitle:     string;
      created_at:   string | null;
      size_hint_kb: number;
    }>;

    const items: SelectiveCacheItem[] = rows.map(row => ({
      contentType: row.content_type as CachedContentType,
      id:          row.id,
      title:       row.title ?? '—',
      subtitle:    row.subtitle ?? '',
      createdAt:   row.created_at,
      sizeHintKb:  row.size_hint_kb ?? 0,
      isCached:    false,
      hasAudio:    false,
    }));

    // One index read, then per-item resolution in batches.
    const cacheIndex = await getCacheIndex();
    const indexById  = new Map(cacheIndex.map(e => [`${e.type}:${e.id}`, e]));

    const BATCH = 10;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);

      const checks = await Promise.allSettled(
        batch.map(async item => {
          if (item.contentType === 'voice_debate') {
            return isVoiceDebateJsonCached(item.id);
          }
          return isCached(item.contentType, item.id);
        }),
      );

      await Promise.allSettled(
        batch.map(async (item, bi) => {
          const check = checks[bi];
          if (check.status === 'fulfilled') item.isCached = check.value;

          if (!item.isCached) return;   // keep the SQL estimate

          const entry     = indexById.get(`${item.contentType}:${item.id}`);
          const jsonBytes = entry?.sizeBytes ?? 0;

          if (item.contentType === 'podcast') {
            const audioBytes = await getPodcastAudioDiskBytes(item.id);
            item.hasAudio = audioBytes > 0;
            // entry.sizeBytes already includes audio once markAudioCached has
            // run; take the larger of the two so a stale index never
            // under-reports what is actually on disk.
            const total = Math.max(jsonBytes, audioBytes);
            if (total > 0) item.sizeHintKb = Math.round(total / 1024);

          } else if (item.contentType === 'voice_debate') {
            const audioBytes = await getVoiceDebateAudioDiskBytes(item.id);
            item.hasAudio = audioBytes > 0;
            const total = Math.max(jsonBytes, audioBytes);
            if (total > 0) item.sizeHintKb = Math.round(total / 1024);

          } else if (jsonBytes > 0) {
            item.sizeHintKb = Math.round(jsonBytes / 1024);
          }
        }),
      );
    }

    return items;
  } catch (err) {
    console.warn('[useSelectiveCache] fetchSelectableItems error:', err);
    return [];
  }
}

// ─── Cache one item ───────────────────────────────────────────────────────────
//
// Every branch passes force:true. This is a user-initiated action; the
// auto-cache setting has no business gating it.

async function cacheOneItem(item: SelectiveCacheItem): Promise<boolean> {
  const force = { force: true } as const;

  try {
    switch (item.contentType) {
      case 'voice_debate': {
        const { data, error } = await supabase
          .from('voice_debates').select('*').eq('id', item.id).single();
        if (error || !data) {
          console.warn(`[useSelectiveCache] voice_debate ${item.id}:`, error?.message);
          return false;
        }
        // Part 59.3: one code path for voice debates — index entry, JSON and
        // audio, exactly as generation does it.
        await autoCacheVoiceDebate(mapRowToVoiceDebate(data as Record<string, unknown>), force);
        return true;
      }

      case 'report': {
        const { data, error } = await supabase
          .from('research_reports').select('*').eq('id', item.id).single();
        if (error || !data) return false;
        await autoCacheReport({
          id:                data.id,
          userId:            data.user_id,
          query:             data.query,
          depth:             data.depth,
          focusAreas:        data.focus_areas ?? [],
          title:             data.title ?? data.query,
          executiveSummary:  data.executive_summary ?? '',
          sections:          data.sections ?? [],
          keyFindings:       data.key_findings ?? [],
          futurePredictions: data.future_predictions ?? [],
          citations:         data.citations ?? [],
          statistics:        data.statistics ?? [],
          searchQueries:     data.search_queries ?? [],
          sourcesCount:      data.sources_count ?? 0,
          reliabilityScore:  data.reliability_score ?? 0,
          status:            data.status,
          agentLogs:         data.agent_logs ?? [],
          knowledgeGraph:    data.knowledge_graph ?? undefined,
          infographicData:   data.infographic_data ?? undefined,
          sourceImages:      data.source_images ?? [],
          researchMode:      data.research_mode ?? 'standard',
          createdAt:         data.created_at,
          completedAt:       data.completed_at,
        } as never, force);
        return true;
      }

      case 'podcast': {
        const { data, error } = await supabase
          .from('podcasts').select('*').eq('id', item.id).single();
        if (error || !data) return false;
        await autoCachePodcast(mapRowToPodcast(data), force);
        return true;
      }

      case 'debate': {
        const { data, error } = await supabase
          .from('debate_sessions').select('*').eq('id', item.id).single();
        if (error || !data) return false;
        await autoCacheDebate(data as never, force);
        return true;
      }

      case 'academic_paper': {
        const { data, error } = await supabase
          .from('academic_papers').select('*').eq('id', item.id).single();
        if (error || !data) return false;
        await autoCacheAcademicPaper(data as never, force);
        return true;
      }

      case 'presentation': {
        const { data, error } = await supabase
          .from('presentations').select('*').eq('id', item.id).single();
        if (error || !data) return false;
        await autoCachePresentation(data as never, force);
        return true;
      }

      default:
        return false;
    }
  } catch (err) {
    console.warn(`[useSelectiveCache] cacheOneItem(${item.id}) error:`, err);
    return false;
  }
}

// ─── Remove one item ──────────────────────────────────────────────────────────

async function uncacheOneItem(item: SelectiveCacheItem): Promise<void> {
  try {
    if (item.contentType === 'voice_debate') {
      await evictVoiceDebateJson(item.id);
      await evictVoiceDebateAudio(item.id);
    }
    // evictItemById also clears audio/asset side-cars for its type.
    await evictItemById(item.contentType, item.id);
  } catch { /* non-fatal */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSelectiveCache(visible: boolean) {
  const { user } = useAuth();

  const [state, setState] = useState<SelectiveCacheState>({
    items:          [],
    isLoading:      false,
    isCachingBatch: false,
    selectedIds:    new Set(),
    filter:         'all',
    searchQuery:    '',
    error:          null,
    progress:       null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const items = await fetchSelectableItems(user.id);
      if (!mountedRef.current) return;
      // Pre-tick everything already cached, so the sheet shows current state
      // and un-ticking becomes the way to remove.
      const preSelected = new Set(items.filter(i => i.isCached).map(i => i.id));
      setState(prev => ({ ...prev, items, isLoading: false, selectedIds: preSelected }));
    } catch (err) {
      if (!mountedRef.current) return;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load content',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!visible || !user) return;
    void loadItems();
  }, [visible, user?.id]);

  const toggleSelected = useCallback((id: string) => {
    setState(prev => {
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  }, []);

  const selectAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedIds: new Set(
        prev.items
          .filter(item =>
            (prev.filter === 'all' || item.contentType === prev.filter) &&
            (!prev.searchQuery ||
              item.title.toLowerCase().includes(prev.searchQuery.toLowerCase()))
          )
          .map(i => i.id),
      ),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({ ...prev, selectedIds: new Set() }));
  }, []);

  const setFilter = useCallback((filter: CacheFilterType) => {
    setState(prev => ({ ...prev, filter }));
  }, []);

  const setSearch = useCallback((q: string) => {
    setState(prev => ({ ...prev, searchQuery: q }));
  }, []);

  const filteredItems = state.items.filter(item => {
    const matchType = state.filter === 'all' || item.contentType === state.filter;
    const q         = state.searchQuery.toLowerCase().trim();
    const matchSearch = !q
      || item.title.toLowerCase().includes(q)
      || item.subtitle.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  // ── Apply the delta ────────────────────────────────────────────────────────

  const cacheSelected = useCallback(async () => {
    if (!user) return;

    const toCache   = state.items.filter(i => state.selectedIds.has(i.id) && !i.isCached);
    const toUncache = state.items.filter(i => !state.selectedIds.has(i.id) && i.isCached);

    if (toCache.length === 0 && toUncache.length === 0) return;

    const totalWork = toCache.length + toUncache.length;

    setState(prev => ({
      ...prev,
      isCachingBatch: true,
      progress: { done: 0, total: totalWork },
    }));

    let done = 0;
    // Read once so the loop does not hit AsyncStorage per item.
    await loadSettings();

    for (const item of toCache) {
      await cacheOneItem(item);
      done++;
      if (mountedRef.current) {
        setState(prev => ({ ...prev, progress: { done, total: totalWork } }));
      }
    }

    for (const item of toUncache) {
      await uncacheOneItem(item);
      done++;
      if (mountedRef.current) {
        setState(prev => ({ ...prev, progress: { done, total: totalWork } }));
      }
    }

    const refreshed   = await fetchSelectableItems(user.id);
    const newSelected = new Set(refreshed.filter(i => i.isCached).map(i => i.id));

    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        items:          refreshed,
        isCachingBatch: false,
        progress:       null,
        selectedIds:    newSelected,
      }));
    }
  }, [user, state.items, state.selectedIds]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedItems      = state.items.filter(i => state.selectedIds.has(i.id));
  const selectedTotalKb    = selectedItems.reduce((s, i) => s + i.sizeHintKb, 0);
  const selectedNewItems   = selectedItems.filter(i => !i.isCached);
  const itemsToRemove      = state.items.filter(i => i.isCached && !state.selectedIds.has(i.id));
  const currentlyCachedIds = new Set(state.items.filter(i => i.isCached).map(i => i.id));

  return {
    ...state,
    filteredItems,
    selectedItems,
    selectedTotalKb,
    selectedNewItems,
    itemsToRemove,
    currentlyCachedIds,
    loadItems,
    toggleSelected,
    selectAll,
    clearSelection,
    setFilter,
    setSearch,
    cacheSelected,
  };
}