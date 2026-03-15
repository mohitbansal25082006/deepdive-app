// src/hooks/usePersonalization.ts
// Part 21 — Home screen personalization hook.
//
// Fetches AI-curated suggestions on mount and whenever the home tab
// is focused (so suggestions refresh after completing a research session).

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import {
  fetchPersonalizedSuggestions,
  PersonalizedSuggestion,
} from '../services/homePersonalizationService';

// Static fallback — shown instantly before any fetch completes
export const STATIC_FALLBACK_SUGGESTIONS: PersonalizedSuggestion[] = [
  {
    id:       'static_1',
    keyword:  'Future of AI in Healthcare',
    rawQuery: 'Future of AI in Healthcare',
    source:   'trending',
    score:    0.9,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#6C63FF', '#8B5CF6'],
  },
  {
    id:       'static_2',
    keyword:  'Quantum Computing Startups 2025',
    rawQuery: 'Quantum Computing Startups 2025',
    source:   'trending',
    score:    0.85,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#FF6584', '#FF8E53'],
  },
  {
    id:       'static_3',
    keyword:  'Electric Vehicle Market Trends',
    rawQuery: 'Electric Vehicle Market Trends 2025',
    source:   'trending',
    score:    0.8,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#43E97B', '#38F9D7'],
  },
  {
    id:       'static_4',
    keyword:  'Generative AI Impact on Jobs',
    rawQuery: 'Impact of generative AI on software engineering jobs',
    source:   'trending',
    score:    0.78,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#F093FB', '#F5576C'],
  },
  {
    id:       'static_5',
    keyword:  'Climate Tech Investment',
    rawQuery: 'Climate Tech Investment and renewable energy 2025',
    source:   'trending',
    score:    0.75,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#4FACFE', '#00F2FE'],
  },
  {
    id:       'static_6',
    keyword:  'Space Economy & Commercial Launch',
    rawQuery: 'Space Economy and Commercial Launch opportunities 2025',
    source:   'trending',
    score:    0.72,
    tag:      'Trending',
    icon:     'trending-up',
    gradient: ['#FA709A', '#FEE140'],
  },
];

const CACHE_DURATION_MS = 3 * 60 * 1000; // 3 minutes

export interface PersonalizationState {
  suggestions:    PersonalizedSuggestion[];
  isLoading:      boolean;
  isPersonalized: boolean;
  error:          string | null;
  lastFetchedAt:  number | null;
}

export function usePersonalization() {
  const { user } = useAuth();

  const [state, setState] = useState<PersonalizationState>({
    suggestions:    STATIC_FALLBACK_SUGGESTIONS,
    isLoading:      false,
    isPersonalized: false,
    error:          null,
    lastFetchedAt:  null,
  });

  const lastFetchedRef = useRef<number | null>(null);
  const fetchingRef    = useRef(false);

  const fetchSuggestions = useCallback(
    async (force = false) => {
      if (!user) return;
      if (fetchingRef.current) return;

      // Skip if within cache window and not forced
      if (
        !force &&
        lastFetchedRef.current &&
        Date.now() - lastFetchedRef.current < CACHE_DURATION_MS
      ) return;

      fetchingRef.current = true;
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const results = await fetchPersonalizedSuggestions(user.id);
        lastFetchedRef.current = Date.now();

        setState({
          suggestions:    results.length > 0 ? results : STATIC_FALLBACK_SUGGESTIONS,
          isLoading:      false,
          isPersonalized: results.some(r => r.source !== 'trending'),
          error:          null,
          lastFetchedAt:  Date.now(),
        });
      } catch (err) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load suggestions',
        }));
      } finally {
        fetchingRef.current = false;
      }
    },
    [user],
  );

  // Initial fetch on mount
  useEffect(() => {
    if (user) fetchSuggestions();
  }, [user]);

  // Re-fetch when the home tab is focused (picks up newly completed research)
  useFocusEffect(
    useCallback(() => {
      if (user) fetchSuggestions(false);
    }, [user, fetchSuggestions]),
  );

  const refresh = useCallback(() => fetchSuggestions(true), [fetchSuggestions]);

  return { ...state, refresh };
}