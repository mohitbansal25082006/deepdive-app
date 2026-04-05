// src/hooks/usePodcastSeries.ts
// Part 39 FIX — Updated hooks for advanced recommendations + edit/delete.
//
// FIX 3 (Advanced recommendations): useSeriesDetail returns
//   recommendations: AdvancedNextEpisodeRecommendation[] (3 options) instead of 1.
//
// FIX 2 (Initial suggestions): useSeriesDetail loads initial topic suggestions
//   when the series has no episodes yet (brand new series).
//
// FIX 4 (Edit/delete): update() and remove() already existed and are unchanged.
//   New: `loadSuggestionsForNewSeries(name, description)` for the creator modal.

import { useState, useCallback, useEffect } from 'react';
import { useAuth }                          from '../context/AuthContext';
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
}                                           from '../services/podcastSeriesService';
import type {
  PodcastSeries,
  CreateSeriesInput,
  NextEpisodeRecommendation,
}                                           from '../types/podcast_v2';
import type { AdvancedNextEpisodeRecommendation } from '../services/podcastSeriesService';

// ─── Main Series Hook ─────────────────────────────────────────────────────────

export function usePodcastSeries() {
  const { user }                          = useAuth();
  const [series,  setSeries]              = useState<PodcastSeries[]>([]);
  const [loading, setLoading]             = useState(false);
  const [saving,  setSaving]              = useState(false);
  const [error,   setError]               = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
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

  const remove = useCallback(async (seriesId: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await deleteSeries(seriesId);
      if (err) { setError(err); return false; }
      setSeries(prev => prev.filter(s => s.id !== seriesId));
      return true;
    } finally {
      setSaving(false);
    }
  }, []);

  const addEpisode = useCallback(async (
    podcastId:     string,
    seriesId:      string,
    episodeNumber: number,
  ): Promise<boolean> => {
    const { error: err } = await addEpisodeToSeries(podcastId, seriesId, episodeNumber);
    if (err) { setError(err); return false; }
    setSeries(prev => prev.map(s =>
      s.id === seriesId ? { ...s, episodeCount: s.episodeCount + 1 } : s
    ));
    return true;
  }, []);

  const removeEpisode = useCallback(async (
    podcastId: string,
    seriesId:  string,
  ): Promise<boolean> => {
    const { error: err } = await removeEpisodeFromSeries(podcastId);
    if (err) { setError(err); return false; }
    setSeries(prev => prev.map(s =>
      s.id === seriesId ? { ...s, episodeCount: Math.max(0, s.episodeCount - 1) } : s
    ));
    return true;
  }, []);

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
  const { user }                                                              = useAuth();
  const [detail,           setDetail]                                        = useState<SeriesWithEpisodes | null>(null);
  const [loading,          setLoading]                                       = useState(false);
  // FIX 3: Multiple advanced recommendations
  const [recommendations,  setRecommendations]                               = useState<AdvancedNextEpisodeRecommendation[]>([]);
  const [loadingRec,       setLoadingRec]                                    = useState(false);
  // FIX 2: Initial suggestions for brand-new series (0 episodes)
  const [initialSuggestions, setInitialSuggestions]                         = useState<SeriesTopicSuggestion[]>([]);
  const [loadingInitial,   setLoadingInitial]                                = useState(false);

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

  // FIX 2: Auto-load initial suggestions for new series with 0 episodes
  useEffect(() => {
    if (!detail) return;
    if (detail.episodes.length === 0 && detail.series.name) {
      loadInitialSuggestions();
    }
  }, [detail?.series.id, detail?.episodes.length]);

  const loadInitialSuggestions = useCallback(async () => {
    if (!detail) return;
    setLoadingInitial(true);
    try {
      const suggestions = await generateInitialTopicSuggestions(
        detail.series.name,
        detail.series.description,
      );
      setInitialSuggestions(suggestions);
    } finally {
      setLoadingInitial(false);
    }
  }, [detail]);

  // FIX 3: Load advanced (multiple) recommendations
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
    // Advanced recommendations (3 options)
    recommendations,
    loadingRec,
    loadRecommendations,
    // Initial suggestions for 0-episode series
    initialSuggestions,
    loadingInitial,
    loadInitialSuggestions,
  };
}

// ─── Initial Suggestions Hook (standalone, used in SeriesCreatorModal) ────────

export function useSeriesTopicSuggestions() {
  const [suggestions, setSuggestions]   = useState<SeriesTopicSuggestion[]>([]);
  const [loading,     setLoading]       = useState(false);

  const generate = useCallback(async (name: string, description: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const results = await generateInitialTopicSuggestions(name, description);
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setSuggestions([]); }, []);

  return { suggestions, loading, generate, clear };
}