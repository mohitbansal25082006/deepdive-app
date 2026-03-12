// src/hooks/useActivityFeed.ts
// Workspace activity feed with realtime inserts.

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkspaceActivity, ActivityFeedState } from '../types';
import { fetchActivityFeed, subscribeToActivity } from '../services/activityService';

export function useActivityFeed(workspaceId: string | null, autoLoad = true) {
  const [state, setState] = useState<ActivityFeedState>({
    items: [], isLoading: false, hasMore: true, error: null,
  });
  const unsubRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setState(s => ({ ...s, isLoading: true, error: null }));

    const { data, error } = await fetchActivityFeed(workspaceId, 30);

    setState({
      items:     data,
      isLoading: false,
      hasMore:   data.length === 30,
      error,
    });
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !autoLoad) return;

    load();

    unsubRef.current = subscribeToActivity(workspaceId, (incoming) => {
      setState(s => ({
        ...s,
        items: [incoming, ...s.items].slice(0, 50), // Keep max 50 items in memory
      }));
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [workspaceId, autoLoad, load]);

  return { ...state, refresh: load };
}