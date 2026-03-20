// src/hooks/usePodcastHistory.ts
// Part 25 — Fixed
//
// CHANGE: Added upsertPodcast() function.
//
// ROOT CAUSE OF BUG:
//   When generation completes, podcast.tsx calls refresh() which re-fetches
//   from DB. If the DB update failed silently (schema mismatch on columns like
//   completed_segments / duration_seconds), the DB row still has
//   status = 'generating_audio'. The re-fetch returns that stale row, so
//   history shows "Generating podcast" forever and the play button is hidden.
//
// FIX:
//   upsertPodcast(podcast) directly injects the in-memory completed Podcast
//   object into the local state list. This is called by podcast.tsx immediately
//   after onComplete fires — BEFORE the DB re-fetch — so the history list
//   instantly shows the correct completed state with working play button,
//   regardless of whether the DB update succeeded.
//
//   The subsequent refresh() still runs to keep DB and local state in sync
//   for the long term.

import { useState, useEffect, useCallback } from 'react';
import { supabase }                         from '../lib/supabase';
import { Podcast }                          from '../types';
import { useAuth }                          from '../context/AuthContext';
import { mapRowToPodcast }                  from '../services/podcastOrchestrator';
import { deletePodcastAudio }               from '../services/podcastTTSService';

export function usePodcastHistory() {
  const { user }                    = useAuth();
  const [podcasts,   setPodcasts]   = useState<Podcast[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  // ── Upsert (NEW — Part 25 fix) ────────────────────────────────────────────
  // Immediately updates or inserts a podcast in local state without a DB fetch.
  // Called from podcast.tsx right after onComplete fires so history reflects
  // the correct completed state even when the DB update hasn't propagated yet.

  const upsertPodcast = useCallback((podcast: Podcast) => {
    setPodcasts(prev => {
      const idx = prev.findIndex(p => p.id === podcast.id);
      if (idx >= 0) {
        // Replace existing entry with the up-to-date in-memory podcast
        const updated = [...prev];
        updated[idx] = podcast;
        return updated;
      }
      // Podcast not yet in list (history was fetched before INSERT) — prepend it
      return [podcast, ...prev];
    });
  }, []);

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
    upsertPodcast,   // ← NEW: used by podcast.tsx after generation completes
  };
}