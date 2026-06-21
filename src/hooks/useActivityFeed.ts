// src/hooks/useActivityFeed.ts
// Part 52.2 UPDATE — Realtime activity feed.
//
//   • Initial load via fetchActivityFeed (RPC excludes comment_* actions and
//     joins the actor profile).
//   • Live updates via subscribeToActivity, which now prefers the private
//     Broadcast channel "workspace_activity:{id}" (instant, server-resolved
//     actor, comment-filtered) and falls back to postgres_changes. The feed
//     updates with NO refresh.
//   • Incoming entries are de-duplicated by id and prepended; the in-memory
//     window is capped to keep the list light.

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkspaceActivity, ActivityFeedState } from '../types';
import { fetchActivityFeed, subscribeToActivity } from '../services/activityService';

const FEED_LIMIT     = 40;
const MAX_IN_MEMORY  = 60;

export function useActivityFeed(workspaceId: string | null, autoLoad = true) {
  const [state, setState] = useState<ActivityFeedState>({
    items: [], isLoading: false, hasMore: true, error: null,
  });
  const unsubRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setState(s => ({ ...s, isLoading: true, error: null }));

    const { data, error } = await fetchActivityFeed(workspaceId, FEED_LIMIT);

    setState({
      items:     data,
      isLoading: false,
      hasMore:   data.length === FEED_LIMIT,
      error,
    });
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !autoLoad) return;

    load();

    unsubRef.current = subscribeToActivity(workspaceId, (incoming) => {
      setState(s => {
        // Dedupe by id (broadcast + pg fallback can both deliver the same row)
        if (s.items.some(a => a.id === incoming.id)) return s;
        return {
          ...s,
          items: [incoming, ...s.items].slice(0, MAX_IN_MEMORY),
        };
      });
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [workspaceId, autoLoad, load]);

  return { ...state, refresh: load };
}