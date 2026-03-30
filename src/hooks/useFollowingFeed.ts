// src/hooks/useFollowingFeed.ts
// DeepDive AI — Part 36: Cursor-paginated feed of reports from followed users.
//
// FIXED: The get_following_feed RPC returns a JSONB array. Each item's `tags`
// field is already parsed JSON (string[]). The previous hook was fine on the
// TS side — the actual COALESCE error was in the SQL RPC where `sl.tags`
// (jsonb) was being COALESCE-d with `'[]'::text[]`. The SQL patch below fixes
// that. On the TS side we now safely cast tags and handle null gracefully.
//
// hasNew: true when the newest feed item is newer than the last time the
// Feed tab was visited. Drives the unread dot on the tab icon.

import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { FeedItem, FeedState } from '../types/social';

const FEED_LAST_SEEN_KEY = 'deepdive:feed_last_seen';
const PAGE_SIZE = 20;

export interface UseFollowingFeedReturn extends FeedState {
  refresh:      () => Promise<void>;
  loadMore:     () => Promise<void>;
  markFeedSeen: () => Promise<void>;
}

/**
 * Provides the Following Feed for the current user.
 *
 * @param userId  The current user's profile ID. Pass null when not signed in.
 */
export function useFollowingFeed(userId: string | null): UseFollowingFeedReturn {
  const [items,        setItems]        = useState<FeedItem[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore,      setHasMore]      = useState(true);
  const [hasNew,       setHasNew]       = useState(false);

  // Tracks the `published_at` of the oldest item loaded so far (for pagination)
  const cursorRef   = useRef<string | null>(null);
  // Prevent concurrent fetches
  const fetchingRef = useRef(false);

  // ── Normalise a raw RPC row ───────────────────────────────────────────────
  // The RPC returns JSONB so all values come back as JS primitives/arrays.
  // `tags` arrives as string[] (already parsed from jsonb), never as a raw
  // jsonb string — so no special conversion is needed beyond a null guard.

  const normaliseItem = useCallback((raw: Record<string, unknown>): FeedItem => {
    return {
      share_id:          String(raw.share_id          ?? ''),
      report_id:         String(raw.report_id         ?? ''),
      title:             String(raw.title             ?? ''),
      query:             String(raw.query             ?? ''),
      depth:             (raw.depth as FeedItem['depth']) ?? 'quick',
      executive_summary: String(raw.executive_summary ?? ''),
      // tags comes back as string[] from the JSONB RPC
      tags:              Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
      sources_count:     Number(raw.sources_count     ?? 0),
      reliability_score: Number(raw.reliability_score ?? 0),
      view_count:        Number(raw.view_count        ?? 0),
      published_at:      String(raw.published_at      ?? new Date().toISOString()),
      author_id:         String(raw.author_id         ?? ''),
      author_username:   raw.author_username  != null ? String(raw.author_username)  : null,
      author_full_name:  raw.author_full_name != null ? String(raw.author_full_name) : null,
      author_avatar_url: raw.author_avatar_url != null ? String(raw.author_avatar_url) : null,
    } as FeedItem;
  }, []);

  // ── Core fetch ────────────────────────────────────────────────────────────

  const fetchFeed = useCallback(
    async (replace: boolean) => {
      if (!userId || fetchingRef.current) return;
      fetchingRef.current = true;

      if (replace) {
        setIsLoading(true);
        setIsRefreshing(true);
      }

      try {
        const cursor = replace
          ? new Date().toISOString()
          : (cursorRef.current ?? new Date().toISOString());

        const { data, error } = await supabase.rpc('get_following_feed', {
          p_limit:  PAGE_SIZE,
          p_cursor: cursor,
        });

        if (error) {
          console.warn('[useFollowingFeed] RPC error:', error.message);
          if (replace) setItems([]);
          return;
        }

        // The RPC returns a JSONB array. Supabase parses it into a JS array.
        const rawRows: Record<string, unknown>[] = Array.isArray(data)
          ? (data as Record<string, unknown>[])
          : [];

        const newItems: FeedItem[] = rawRows.map(normaliseItem);

        if (replace) {
          setItems(newItems);
          setHasMore(newItems.length >= PAGE_SIZE);

          // Unread dot
          if (newItems.length > 0) {
            try {
              const lastSeen = await AsyncStorage.getItem(FEED_LAST_SEEN_KEY);
              const newest   = newItems[0].published_at;
              if (!lastSeen || new Date(newest) > new Date(lastSeen)) {
                setHasNew(true);
              }
            } catch {
              // AsyncStorage failure is non-critical
            }
          }

          // Cursor = oldest in batch
          if (newItems.length > 0) {
            cursorRef.current = newItems[newItems.length - 1].published_at;
          }
        } else {
          setItems(prev => {
            const existingIds = new Set(prev.map(i => i.share_id));
            const fresh = newItems.filter(i => !existingIds.has(i.share_id));
            return [...prev, ...fresh];
          });
          setHasMore(newItems.length >= PAGE_SIZE);
          if (newItems.length > 0) {
            cursorRef.current = newItems[newItems.length - 1].published_at;
          }
        }
      } catch (err) {
        console.warn('[useFollowingFeed] fetch error:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [userId, normaliseItem],
  );

  // ── Auto-load on userId change ────────────────────────────────────────────

  useEffect(() => {
    if (userId) {
      cursorRef.current = null;
      fetchFeed(true);
    } else {
      setItems([]);
      setHasMore(true);
      setHasNew(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Public API ────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!userId) return;
    cursorRef.current = null;
    await fetchFeed(true);
  }, [userId, fetchFeed]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || isRefreshing || fetchingRef.current) return;
    await fetchFeed(false);
  }, [hasMore, isLoading, isRefreshing, fetchFeed]);

  /**
   * Call this when the user visits / focuses the Feed tab.
   * Clears the unread dot by persisting the current timestamp.
   */
  const markFeedSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(FEED_LAST_SEEN_KEY, new Date().toISOString());
    } catch {
      // Non-critical
    }
    setHasNew(false);
  }, []);

  return {
    items,
    isLoading,
    isRefreshing,
    hasMore,
    hasNew,
    refresh,
    loadMore,
    markFeedSeen,
  };
}