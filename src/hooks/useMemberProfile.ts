// src/hooks/useMemberProfile.ts
// Part 12 — Fetches and caches member profile data for MemberProfileCard.
//
// FIX: Use useRef for the cache (not useState) so it's stable across renders
// and doesn't cause infinite re-render loops.

import { useState, useCallback, useRef } from 'react';
import {
  fetchMemberProfile,
  MemberProfileData,
} from '../services/memberProfileService';

interface MemberProfileState {
  data:      MemberProfileData | null;
  isLoading: boolean;
  error:     string | null;
}

export function useMemberProfile() {
  const [state, setState] = useState<MemberProfileState>({
    data:      null,
    isLoading: false,
    error:     null,
  });

  // useRef so the cache Map is stable and doesn't trigger re-renders
  const cache = useRef<Map<string, MemberProfileData>>(new Map());

  const load = useCallback(async (userId: string, workspaceId: string) => {
    if (!userId || !workspaceId) {
      setState({ data: null, isLoading: false, error: 'Invalid user or workspace ID.' });
      return;
    }

    const cacheKey = `${userId}:${workspaceId}`;

    // Return cached result immediately (avoids re-fetching on every open)
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setState({ data: cached, isLoading: false, error: null });
      return;
    }

    setState({ data: null, isLoading: true, error: null });

    const { data, error } = await fetchMemberProfile(userId, workspaceId);

    if (data) {
      cache.current.set(cacheKey, data);
    }

    setState({ data, isLoading: false, error });
  }, []); // stable — no deps needed since cache is a ref

  const clear = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  // Expose a way to bust the cache for a specific member (useful after role changes)
  const invalidate = useCallback((userId: string, workspaceId: string) => {
    cache.current.delete(`${userId}:${workspaceId}`);
  }, []);

  return {
    ...state,
    load,
    clear,
    invalidate,
  };
}