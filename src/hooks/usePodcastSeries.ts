// src/hooks/usePodcastSeries.ts
// Part 39 FIXES:
//
// FIX 1 (voice quality in series generator): No hook change needed — handled in podcast-series.tsx
//
// FIX 2 (duplicate episode prevention): addEpisode() now checks if podcast
//   already belongs to ANY series before adding. Returns { success, alreadyInSeries, seriesName }
//
// FIX 3 (series shows 0 episodes): refresh() now calls getUserSeriesWithCounts()
//   which does a fresh DB query including live episode_count from the trigger.
//   Also, after addEpisode/removeEpisode we call refresh() to sync counts from DB.
//
// FIX 4 (deleted series stays in tab): remove() filters local state immediately
//   AND calls refresh() to ensure full sync. podcast-series.tsx calls refreshSeries
//   before router.back() via the remove callback.
//
// FIX 5 (AI starter ideas persist): useSeriesDetail stores initialSuggestions
//   in a ref-backed cache keyed by seriesId so navigating away and back doesn't
//   re-generate them. loadInitialSuggestions() is idempotent — only fires once
//   unless explicitly called via the regenerate button.
//
// FIX 6 (redirect after creation): No hook change — handled in podcast.tsx

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth }                                   from '../context/AuthContext';
import {
  getUserSeries,
  createSeries,
  updateSeries,
  deleteSeries,
  addEpisodeToSeries,
  removeEpisodeFromSeries,
  getSeriesWithEpisodes,
  generateNextEpisodeRecommendation,
  generateInitialTopicSuggestions,
  type SeriesWithEpisodes,
  type SeriesTopicSuggestion,
}                                                    from '../services/podcastSeriesService';
import type {
  PodcastSeries,
  CreateSeriesInput,
  NextEpisodeRecommendation,
}                                                    from '../types/podcast_v2';
import type { AdvancedNextEpisodeRecommendation }    from '../services/podcastSeriesService';

// ─── Global suggestion cache (survives screen unmounts) ───────────────────────
// Key: seriesId → SeriesTopicSuggestion[]
// This ensures AI starter ideas are generated only once per series and persist
// across navigation (FIX 5).
const _suggestionCache: Map<string, SeriesTopicSuggestion[]> = new Map();

// ─── Main Series Hook ─────────────────────────────────────────────────────────

export function usePodcastSeries() {
  const { user }                 = useAuth();
  const [series,  setSeries]     = useState<PodcastSeries[]>([]);
  const [loading, setLoading]    = useState(false);
  const [saving,  setSaving]     = useState(false);
  const [error,   setError]      = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // FIX 3: getUserSeries returns rows with live episode_count from DB
      const data = await getUserSeries(user.id);
      setSeries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (input: CreateSeriesInput): Promise<PodcastSeries | null> => {
    if (!user) return null;
    setSaving(true);
    setError(null);
    try {
      const { data, error: err } = await createSeries(user.id, input);
      if (err || !data) { setError(err ?? 'Failed to create series'); return null; }
      setSeries(prev => [data, ...prev]);
      return data;
    } finally {
      setSaving(false);
    }
  }, [user]);

  const update = useCallback(async (
    seriesId: string,
    updates:  Partial<CreateSeriesInput>,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await updateSeries(seriesId, updates);
      if (err) { setError(err); return false; }
      setSeries(prev => prev.map(s => s.id === seriesId ? {
        ...s,
        ...(updates.name        !== undefined ? { name:        updates.name        } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.accentColor !== undefined ? { accentColor: updates.accentColor } : {}),
        ...(updates.iconName    !== undefined ? { iconName:    updates.iconName    } : {}),
      } : s));
      return true;
    } finally {
      setSaving(false);
    }
  }, []);

  // FIX 4: remove() filters local state immediately for instant UI update
  const remove = useCallback(async (seriesId: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await deleteSeries(seriesId);
      if (err) { setError(err); return false; }
      // Immediately remove from local state so podcast tab updates right away
      setSeries(prev => prev.filter(s => s.id !== seriesId));
      // Also clear the suggestion cache for this series
      _suggestionCache.delete(seriesId);
      return true;
    } finally {
      setSaving(false);
    }
  }, []);

  // FIX 2: addEpisode checks for existing membership before adding
  const addEpisode = useCallback(async (
    podcastId:     string,
    seriesId:      string,
    episodeNumber: number,
  ): Promise<{ success: boolean; alreadyInSeries?: boolean; seriesName?: string }> => {
    // Check if podcast is already in this series
    const targetSeries = series.find(s => s.id === seriesId);
    
    const { error: err, alreadyInSeries, existingSeriesName } =
      await addEpisodeToSeries(podcastId, seriesId, episodeNumber);

    if (alreadyInSeries) {
      return { success: false, alreadyInSeries: true, seriesName: existingSeriesName };
    }

    if (err) { setError(err); return { success: false }; }

    // FIX 3: refresh from DB to get accurate episode_count after trigger fires
    await refresh();
    return { success: true };
  }, [series, refresh]);

  const removeEpisode = useCallback(async (
    podcastId: string,
    seriesId:  string,
  ): Promise<boolean> => {
    const { error: err } = await removeEpisodeFromSeries(podcastId);
    if (err) { setError(err); return false; }
    // FIX 3: refresh from DB to get accurate episode_count after trigger fires
    await refresh();
    return true;
  }, [refresh]);

  return {
    series,
    loading,
    saving,
    error,
    refresh,
    create,
    update,
    remove,
    addEpisode,
    removeEpisode,
  };
}

// ─── Series Detail Hook ───────────────────────────────────────────────────────

export function useSeriesDetail(seriesId: string | null) {
  const { user }                                                           = useAuth();
  const [detail,             setDetail]                                   = useState<SeriesWithEpisodes | null>(null);
  const [loading,            setLoading]                                  = useState(false);
  const [recommendations,    setRecommendations]                          = useState<AdvancedNextEpisodeRecommendation[]>([]);
  const [loadingRec,         setLoadingRec]                               = useState(false);
  const [initialSuggestions, setInitialSuggestions]                       = useState<SeriesTopicSuggestion[]>([]);
  const [loadingInitial,     setLoadingInitial]                           = useState(false);

  // FIX 5: Track if we've already loaded suggestions for this series
  // Uses the global cache so suggestions survive navigation away and back
  const hasLoadedSuggestions = useRef(false);

  const load = useCallback(async () => {
    if (!seriesId || !user) return;
    setLoading(true);
    try {
      const data = await getSeriesWithEpisodes(seriesId, user.id);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [seriesId, user]);

  useEffect(() => { load(); }, [load]);

  // FIX 5: On detail load, restore cached suggestions immediately (no flicker)
  useEffect(() => {
    if (!seriesId) return;
    const cached = _suggestionCache.get(seriesId);
    if (cached && cached.length > 0) {
      setInitialSuggestions(cached);
      hasLoadedSuggestions.current = true;
    }
  }, [seriesId]);

  // FIX 5: Auto-load initial suggestions ONLY ONCE for new series (0 episodes)
  // Uses cache so navigating away and back doesn't re-call the API
  useEffect(() => {
    if (!detail || !seriesId) return;
    if (detail.episodes.length > 0) return; // Only for empty series
    if (hasLoadedSuggestions.current) return; // Already loaded or cached
    
    const cached = _suggestionCache.get(seriesId);
    if (cached && cached.length > 0) {
      setInitialSuggestions(cached);
      hasLoadedSuggestions.current = true;
      return;
    }

    // Not cached yet — generate
    loadInitialSuggestions(false);
  }, [detail?.series.id, detail?.episodes.length, seriesId]);

  // FIX 5: loadInitialSuggestions accepts a `force` param for the regenerate button
  const loadInitialSuggestions = useCallback(async (force = false) => {
    if (!detail || !seriesId) return;

    // If not forced and we already have suggestions (cached or generated), skip
    if (!force && hasLoadedSuggestions.current) return;

    setLoadingInitial(true);
    try {
      const suggestions = await generateInitialTopicSuggestions(
        detail.series.name,
        detail.series.description,
      );
      setInitialSuggestions(suggestions);
      // Save to global cache so they persist across navigation
      if (suggestions.length > 0) {
        _suggestionCache.set(seriesId, suggestions);
        hasLoadedSuggestions.current = true;
      }
    } finally {
      setLoadingInitial(false);
    }
  }, [detail, seriesId]);

  const loadRecommendations = useCallback(async () => {
    if (!detail || detail.episodes.length === 0) return;
    setLoadingRec(true);
    try {
      const titles       = detail.episodes.map(e => e.title);
      const topics       = detail.episodes.map(e => e.topic ?? e.title);
      const descriptions = detail.episodes.map(e => e.description);

      const recs = await generateNextEpisodeRecommendation(
        detail.series.name,
        titles,
        topics,
        descriptions,
      );
      setRecommendations(recs ?? []);
    } finally {
      setLoadingRec(false);
    }
  }, [detail]);

  return {
    detail,
    loading,
    refresh: load,
    recommendations,
    loadingRec,
    loadRecommendations,
    initialSuggestions,
    loadingInitial,
    // FIX 5: expose loadInitialSuggestions with force support for regenerate button
    loadInitialSuggestions,
  };
}

// ─── Initial Suggestions Hook (standalone, used in SeriesCreatorModal) ────────
// FIX 5: Accepts an optional seriesId to save generated suggestions into the
// global cache so they appear immediately when the series screen opens.

export function useSeriesTopicSuggestions() {
  const [suggestions, setSuggestions] = useState<SeriesTopicSuggestion[]>([]);
  const [loading,     setLoading]     = useState(false);

  const generate = useCallback(async (
    name:        string,
    description: string,
    seriesId?:   string,   // FIX 5: save to cache if seriesId provided
  ) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const results = await generateInitialTopicSuggestions(name, description);
      setSuggestions(results);
      // FIX 5: if a seriesId was given (after creation), cache the results
      // so the series screen picks them up without re-generating
      if (seriesId && results.length > 0) {
        _suggestionCache.set(seriesId, results);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setSuggestions([]); }, []);

  return { suggestions, loading, generate, clear };
}