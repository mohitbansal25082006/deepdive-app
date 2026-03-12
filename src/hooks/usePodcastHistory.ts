// src/hooks/usePodcastHistory.ts
// Part 8 — Loads and manages the user's podcast history from Supabase.
// Deleting a podcast removes both the DB row and local audio files.

import { useState, useEffect, useCallback } from 'react';
import { supabase }                         from '../lib/supabase';
import { Podcast }                          from '../types';
import { useAuth }                          from '../context/AuthContext';
import { mapRowToPodcast }                  from '../services/podcastOrchestrator';
import { deletePodcastAudio }               from '../services/podcastTTSService';

export function usePodcastHistory() {
  const { user }                                  = useAuth();
  const [podcasts,   setPodcasts]                 = useState<Podcast[]>([]);
  const [loading,    setLoading]                  = useState(false);
  const [refreshing, setRefreshing]               = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchPodcasts = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    else         setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('podcasts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setPodcasts((data ?? []).map(mapRowToPodcast));
    } catch (err) {
      console.error('[usePodcastHistory] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { fetchPodcasts(); }, [fetchPodcasts]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deletePodcast = useCallback(async (podcastId: string) => {
    // Optimistic local removal
    setPodcasts(prev => prev.filter(p => p.id !== podcastId));

    // Delete local audio files
    await deletePodcastAudio(podcastId);

    // Delete DB row
    const { error } = await supabase
      .from('podcasts')
      .delete()
      .eq('id', podcastId);

    if (error) {
      console.warn('[usePodcastHistory] delete error:', error.message);
      // Re-fetch to restore accurate state if DB delete fails
      fetchPodcasts(true);
    }
  }, [fetchPodcasts]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const refresh = useCallback(() => fetchPodcasts(true), [fetchPodcasts]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const completedPodcasts = podcasts.filter(p => p.status === 'completed');
  const totalMinutes      = Math.round(
    completedPodcasts.reduce((sum, p) => sum + p.durationSeconds, 0) / 60
  );

  return {
    podcasts,
    completedPodcasts,
    totalMinutes,
    loading,
    refreshing,
    refresh,
    deletePodcast,
  };
}