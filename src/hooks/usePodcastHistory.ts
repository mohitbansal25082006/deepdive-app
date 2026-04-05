// src/hooks/usePodcastHistory.ts
// Part 39 FIX v3:
//
// FIX — Continue Listening shows wrong percentage:
//   Root cause: The DB column `progress_percent` is stored as 0–100 (e.g. 45.5
//   meaning 45.5% complete). But getContinueListening() returned it raw and
//   ContinueListeningRow in podcast.tsx treated it as 0–1 (fraction).
//   So 45% in DB became 45×100 = 4500% on screen, which clamped to 100%.
//   OR: if stored as 0–1 fraction, the DB value 0.45 rendered as 0.45% on screen.
//
//   Fix: Normalize to 0–1 fraction consistently here so the UI always gets 0–1.
//   The DB stores 0–100 (per the SQL: progress_percent NUMERIC(5,2)).
//   We divide by 100 when reading from the RPC.
//
// FIX — upsertPodcast preserved from Part 25.
// FIX — deletePodcast optimistic removal preserved from Part 39 FIX v2.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase }                                   from '../lib/supabase';
import type { Podcast }                               from '../types';
import type { PodcastPlaybackProgress }               from '../types/podcast_v2';
import { useAuth }                                    from '../context/AuthContext';
import { mapRowToPodcast }                            from '../services/podcastOrchestrator';
import { deletePodcastAudio }                         from '../services/podcastTTSService';
import {
  getContinueListening,
  getEnhancedStats,
} from '../services/podcastSeriesService';

export interface PodcastHistoryStats {
  totalEpisodes:         number;
  completedEpisodes:     number;
  totalListeningMinutes: number;
  longestEpisodeMins:    number;
  longestEpisodeTitle:   string;
  seriesCount:           number;
  mostUsedStyle:         string;
  currentStreakDays:     number;
}

export function usePodcastHistory() {
  const { user }                                         = useAuth();
  const [podcasts,          setPodcasts]                 = useState<Podcast[]>([]);
  const [loading,           setLoading]                  = useState(false);
  const [refreshing,        setRefreshing]               = useState(false);
  const [continueListening, setContinueListening]        = useState<(PodcastPlaybackProgress & {
    title: string; hostName: string; guestName: string; seriesName?: string; accentColor: string;
  })[]>([]);
  const [statsV2,           setStatsV2]                  = useState<PodcastHistoryStats | null>(null);
  const [loadingExtra,      setLoadingExtra]              = useState(false);

  // ── Fetch podcasts ──────────────────────────────────────────────────────────

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
        .limit(50);

      if (error) throw error;
      setPodcasts((data ?? []).map(mapRowToPodcast));
    } catch (err) {
      console.error('[usePodcastHistory] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // ── Fetch extra data (continue listening + stats) ───────────────────────────

  const fetchExtra = useCallback(async () => {
    if (!user) return;
    setLoadingExtra(true);
    try {
      const [clRaw, stats] = await Promise.allSettled([
        getContinueListening(user.id),
        getEnhancedStats(user.id),
      ]);

      if (clRaw.status === 'fulfilled') {
        // FIX: getContinueListening now returns progressPercent as 0–1 fraction
        // (normalized in podcastSeriesService.ts). Just use it directly.
        setContinueListening(clRaw.value as any);
      }

      if (stats.status === 'fulfilled' && stats.value) {
        const s = stats.value;
        setStatsV2({
          totalEpisodes:         s.totalEpisodes ?? 0,
          completedEpisodes:     s.totalEpisodes ?? 0,
          totalListeningMinutes: s.totalListeningMinutes ?? 0,
          longestEpisodeMins:    s.longestEpisodeMins ?? 0,
          longestEpisodeTitle:   s.longestEpisodeTitle ?? '',
          seriesCount:           s.seriesCount ?? 0,
          mostUsedStyle:         s.mostUsedStyle ?? 'casual',
          currentStreakDays:     0,
        });
      }
    } catch (err) {
      console.warn('[usePodcastHistory] fetchExtra error:', err);
    } finally {
      setLoadingExtra(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPodcasts();
    fetchExtra();
  }, [fetchPodcasts, fetchExtra]);

  // ── Upsert (Part 25 fix — preserved) ───────────────────────────────────────

  const upsertPodcast = useCallback((podcast: Podcast) => {
    setPodcasts(prev => {
      const idx = prev.findIndex(p => p.id === podcast.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = podcast;
        return updated;
      }
      return [podcast, ...prev];
    });
  }, []);

  // ── Delete — immediate optimistic removal, no full refresh ─────────────────

  const deletePodcast = useCallback(async (podcastId: string) => {
    const snapshot = podcasts.find(p => p.id === podcastId);
    setPodcasts(prev => prev.filter(p => p.id !== podcastId));
    setContinueListening(prev => prev.filter((p: any) => p.podcastId !== podcastId));
    deletePodcastAudio(podcastId).catch(() => {});

    const { error } = await supabase
      .from('podcasts')
      .delete()
      .eq('id', podcastId);

    if (error) {
      console.warn('[usePodcastHistory] delete error:', error.message);
      if (snapshot) {
        setPodcasts(prev => {
          const exists = prev.some(p => p.id === podcastId);
          if (exists) return prev;
          return [snapshot, ...prev];
        });
      }
    } else {
      fetchExtra();
    }
  }, [podcasts, fetchExtra]);

  // ── Refresh ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchPodcasts(true);
    fetchExtra();
  }, [fetchPodcasts, fetchExtra]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const completedPodcasts = useMemo(
    () => podcasts.filter(p => p.status === 'completed'),
    [podcasts]
  );

  const totalMinutes = useMemo(
    () => Math.round(completedPodcasts.reduce((sum, p) => sum + p.durationSeconds, 0) / 60),
    [completedPodcasts]
  );

  const podcastsBySeries = useMemo(() => {
    const map = new Map<string, Podcast[]>();
    for (const p of podcasts) {
      const seriesId = (p as any).seriesId ?? (p.script as any)?.seriesId;
      if (seriesId) {
        const arr = map.get(seriesId) ?? [];
        arr.push(p);
        map.set(seriesId, arr);
      }
    }
    return map;
  }, [podcasts]);

  const recentlyPlayed = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return podcasts
      .filter(p => {
        const lpa = (p as any).lastPlayedAt;
        return lpa && new Date(lpa).getTime() > cutoff;
      })
      .sort((a, b) => {
        const ta = new Date((a as any).lastPlayedAt ?? 0).getTime();
        const tb = new Date((b as any).lastPlayedAt ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 5);
  }, [podcasts]);

  const currentStreakDays = useMemo(() => {
    const completed = completedPodcasts
      .map(p => new Date(p.createdAt).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (completed.length === 0) return 0;

    let streak    = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    for (const dateStr of completed) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      const diffDays = Math.round((checkDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === streak || diffDays === 0) {
        streak++;
        checkDate = d;
      } else {
        break;
      }
    }

    return streak;
  }, [completedPodcasts]);

  return {
    podcasts,
    completedPodcasts,
    totalMinutes,
    loading,
    refreshing,
    loadingExtra,
    refresh,
    deletePodcast,
    upsertPodcast,
    podcastsBySeries,
    continueListening,
    recentlyPlayed,
    statsV2: statsV2 ? { ...statsV2, currentStreakDays } : null,
  };
}