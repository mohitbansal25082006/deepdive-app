// src/hooks/useSelectiveCache.ts
// Part 45 FIX 2 — BUG 2 fix: all dynamic await import() replaced with static imports.
//
// Dynamic imports in Hermes (React Native production JS engine) can throw
// LoadBundleFromServerRequestError or unhandled promise rejections that crash
// the component and navigate to the home screen. Converting to static imports
// fixes the black-screen crash when "Cache Now" or "Save Changes" is tapped.
//
// BUG 1 + BUG 2 fixes from the previous version are preserved unchanged.

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase }             from '../lib/supabase';
import { useAuth }              from '../context/AuthContext';
import {
  isCached, cacheItem, evictItemById, loadSettings, getCacheIndex,
  markVoiceDebateAudioCached,
}                               from '../lib/cacheStorage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  isVoiceDebateAudioCached,
  downloadVoiceDebateAudio,
  evictVoiceDebateAudio,
  getLocalVoiceDebateAudioPaths,
}                               from '../lib/voiceDebateAudioCache';
import {
  cacheVoiceDebateJson,
  isVoiceDebateJsonCached,
  evictVoiceDebateJson,
}                               from '../lib/voiceDebateCache';
// BUG 2 FIX: static imports — no more dynamic await import() inside async functions
import {
  autoCacheReport,
  autoCachePodcast,
  autoCacheDebate,
  autoCacheAcademicPaper,
  autoCachePresentation,
}                               from '../lib/autoCacheMiddleware';
import { mapRowToPodcast }      from '../services/podcastOrchestrator';
import { mapRowToVoiceDebate }  from '../services/voiceDebateOrchestrator';
import type {
  CachedContentType,
  CacheFilterType,
  SelectiveCacheItem,
  SelectiveCacheState,
}                               from '../types/cache';

// ─── Helper: fetch all cacheable items for this user ────────────────────────

/**
 * Sum the actual .mp3 file sizes on disk for a cached voice debate.
 * Returns 0 if no audio is cached. Used to show accurate storage in the picker.
 */
async function getVoiceDebateAudioDiskBytes(voiceDebateId: string): Promise<number> {
  try {
    const localPaths = await getLocalVoiceDebateAudioPaths(voiceDebateId);
    if (!localPaths || localPaths.length === 0) return 0;

    const sizeChecks = await Promise.allSettled(
      localPaths.filter(Boolean).map(p => FileSystem.getInfoAsync(p))
    );

    let total = 0;
    for (const check of sizeChecks) {
      if (check.status === 'fulfilled' && check.value.exists) {
        total += (check.value as any).size ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

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
    }));

    // Load the main cache index once for real sizes of cached items
    const cacheIndex = await getCacheIndex();
    const indexById  = new Map(cacheIndex.map(e => [`${e.type}:${e.id}`, e]));

    // Resolve cached state + real sizes in parallel (batched)
    const BATCH = 10;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const checks = await Promise.allSettled(
        batch.map(async item => {
          if (item.contentType === 'voice_debate') {
            return isVoiceDebateJsonCached(item.id);
          }
          return isCached(item.contentType as CachedContentType, item.id);
        })
      );

      // Process each item: set isCached, then set accurate size
      await Promise.allSettled(
        batch.map(async (item, bi) => {
          const check = checks[bi];
          if (check.status === 'fulfilled') {
            item.isCached = check.value;
          }

          if (!item.isCached) return; // keep SQL estimate for uncached items

          if (item.contentType === 'voice_debate') {
            // For cached voice debates, combine:
            //   JSON bytes from the main cache index
            //   + actual audio .mp3 file sizes from disk
            // This gives the real total storage used on device.
            const indexEntry = indexById.get(`voice_debate:${item.id}`);
            const jsonBytes  = indexEntry?.sizeBytes ?? 0;

            // Read audio from disk (same method as autoCacheMiddleware)
            const audioBytes = await getVoiceDebateAudioDiskBytes(item.id);

            const totalKb = Math.round((jsonBytes + audioBytes) / 1024);
            if (totalKb > 0) {
              item.sizeHintKb = totalKb;
            }
          } else {
            // For all other types, use real sizeBytes from cache index
            const key   = `${item.contentType}:${item.id}`;
            const entry = indexById.get(key);
            if (entry && entry.sizeBytes > 0) {
              item.sizeHintKb = Math.round(entry.sizeBytes / 1024);
            }
          }
        })
      );
    }

    return items;
  } catch (err) {
    console.warn('[useSelectiveCache] fetchSelectableItems error:', err);
    return [];
  }
}

// ─── Helper: fetch raw DB row and cache it ────────────────────────────────────

async function cacheOneItem(
  userId:      string,
  item:        SelectiveCacheItem,
  expiryDays:  number,
): Promise<boolean> {
  try {
    if (item.contentType === 'voice_debate') {
      const { data, error } = await supabase
        .from('voice_debates')
        .select('*')
        .eq('id', item.id)
        .single();

      if (error || !data) {
        console.warn(`[useSelectiveCache] Failed to fetch voice_debate ${item.id}:`, error?.message);
        return false;
      }

      const vd = mapRowToVoiceDebate(data as any);

      // 1. Cache JSON in voiceDebateCache (for OfflineVoiceDebateViewer)
      const jsonOk = await cacheVoiceDebateJson(vd, { expiryDays });

      // 2. Store in main cacheStorage index FIRST so the entry exists
      //    before we call markVoiceDebateAudioCached below
      await cacheItem(
        'voice_debate',
        vd.id,
        vd.topic,
        vd,
        {
          subtitle:   `${vd.totalTurns} turns · ${Math.round(vd.durationSeconds / 60)} min`,
          expiryDays,
        },
      );

      // 3. If audio caching is enabled, download audio AND mark real size
      //    Awaited (not fire-and-forget) so cache index is accurate before
      //    cacheSelected() finishes and the cache manager refreshes.
      const settings = await loadSettings();
      if (settings.cacheVoiceDebate) {
        const audioPaths = (vd.audioSegmentPaths ?? []).map((local, i) => {
          if (local && !local.startsWith('http')) return local;
          const cloud = (vd.audioStorageUrls as any)?.[i] ?? null;
          return cloud ?? local;
        }).filter(Boolean) as string[];

        if (audioPaths.length > 0) {
          const success = await downloadVoiceDebateAudio(
            vd.id, vd.topic, audioPaths, undefined, expiryDays,
          ).catch(() => false);

          if (success) {
            // Sum real .mp3 file sizes from disk and update cache index entry
            const realAudioBytes = await getVoiceDebateAudioDiskBytes(vd.id);
            if (realAudioBytes > 0) {
              await markVoiceDebateAudioCached(vd.id, realAudioBytes);
            }
          }
        }
      }

      return jsonOk;
    }

    // BUG 2 FIX: All cache functions are now static imports
    switch (item.contentType) {
      case 'report': {
        const { data, error } = await supabase
          .from('research_reports')
          .select('*')
          .eq('id', item.id)
          .single();
        if (error || !data) return false;
        await autoCacheReport({
          id:               data.id,
          userId:           data.user_id,
          query:            data.query,
          depth:            data.depth,
          focusAreas:       data.focus_areas ?? [],
          title:            data.title ?? data.query,
          executiveSummary: data.executive_summary ?? '',
          sections:         data.sections ?? [],
          keyFindings:      data.key_findings ?? [],
          futurePredictions:data.future_predictions ?? [],
          citations:        data.citations ?? [],
          statistics:       data.statistics ?? [],
          searchQueries:    data.search_queries ?? [],
          sourcesCount:     data.sources_count ?? 0,
          reliabilityScore: data.reliability_score ?? 0,
          status:           data.status,
          agentLogs:        data.agent_logs ?? [],
          knowledgeGraph:   data.knowledge_graph ?? undefined,
          infographicData:  data.infographic_data ?? undefined,
          sourceImages:     data.source_images ?? [],
          researchMode:     data.research_mode ?? 'standard',
          createdAt:        data.created_at,
          completedAt:      data.completed_at,
        } as any);
        return true;
      }

      case 'podcast': {
        const { data, error } = await supabase
          .from('podcasts')
          .select('*')
          .eq('id', item.id)
          .single();
        if (error || !data) return false;
        // BUG 2 FIX: mapRowToPodcast is now a static import
        await autoCachePodcast(mapRowToPodcast(data));
        return true;
      }

      case 'debate': {
        const { data, error } = await supabase
          .from('debate_sessions')
          .select('*')
          .eq('id', item.id)
          .single();
        if (error || !data) return false;
        await autoCacheDebate(data as any);
        return true;
      }

      case 'academic_paper': {
        const { data, error } = await supabase
          .from('academic_papers')
          .select('*')
          .eq('id', item.id)
          .single();
        if (error || !data) return false;
        await autoCacheAcademicPaper(data as any);
        return true;
      }

      case 'presentation': {
        const { data, error } = await supabase
          .from('presentations')
          .select('*')
          .eq('id', item.id)
          .single();
        if (error || !data) return false;
        await autoCachePresentation(data as any);
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

// ─── Helper: remove one item from cache ────────────────────────────────────────

async function uncacheOneItem(item: SelectiveCacheItem): Promise<void> {
  try {
    if (item.contentType === 'voice_debate') {
      // BUG 2 FIX: static imports — no dynamic await import()
      await evictVoiceDebateJson(item.id);
      await evictVoiceDebateAudio(item.id);
    }
    await evictItemById(item.contentType as CachedContentType, item.id);
  } catch {}
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

  useEffect(() => {
    if (!visible || !user) return;
    loadItems();
  }, [visible, user?.id]);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const items = await fetchSelectableItems(user.id);
      if (mountedRef.current) {
        // Pre-populate selectedIds with already-cached items (BUG 1 FIX)
        const preSelected = new Set(
          items.filter(i => i.isCached).map(i => i.id)
        );
        setState(prev => ({
          ...prev,
          items,
          isLoading:   false,
          selectedIds: preSelected,
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load content',
        }));
      }
    }
  }, [user]);

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
            (!prev.searchQuery || item.title.toLowerCase().includes(prev.searchQuery.toLowerCase()))
          )
          .map(i => i.id)
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
    const matchType   = state.filter === 'all' || item.contentType === state.filter;
    const q           = state.searchQuery.toLowerCase().trim();
    const matchSearch = !q
      || item.title.toLowerCase().includes(q)
      || item.subtitle.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  // BUG 1 FIX: correct delta logic
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
    const settings   = await loadSettings();
    const expiryDays = settings.expiryDays;

    for (const item of toCache) {
      await cacheOneItem(user.id, item, expiryDays);
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

  const selectedItems    = state.items.filter(i => state.selectedIds.has(i.id));
  const selectedTotalKb  = selectedItems.reduce((s, i) => s + i.sizeHintKb, 0);
  const selectedNewItems = selectedItems.filter(i => !i.isCached);
  const itemsToRemove    = state.items.filter(i => i.isCached && !state.selectedIds.has(i.id));
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