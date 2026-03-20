// src/hooks/useAnalytics.ts
// Part 27 — Analytics Dashboard Hook
//
// Loads the AnalyticsDashboardData object for the "Your Insights" screen.
// Caches in memory between tab switches; pull-to-refresh forces a DB re-fetch.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth }       from '../context/AuthContext';
import {
  getAnalyticsData,
  updateMonthlyGoal as updateGoalService,
} from '../services/onboardingService';
import type { AnalyticsDashboardData } from '../types/onboarding';

interface UseAnalyticsReturn {
  data:            AnalyticsDashboardData | null;
  isLoading:       boolean;
  isRefreshing:    boolean;
  error:           string | null;
  refetch:         () => Promise<void>;
  refresh:         () => Promise<void>;
  setMonthlyGoal:  (goal: number) => Promise<void>;
}

export function useAnalytics(): UseAnalyticsReturn {
  const { user } = useAuth();

  const [data,         setData]         = useState<AnalyticsDashboardData | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Track whether we've done the first load — avoids showing spinner on every tab visit
  const loadedOnceRef = useRef(false);

  const load = useCallback(async (showRefreshing = false) => {
    if (!user) return;

    if (showRefreshing)              setIsRefreshing(true);
    else if (!loadedOnceRef.current) setIsLoading(true);

    setError(null);

    try {
      const result = await getAnalyticsData(user.id);
      setData(result);
      loadedOnceRef.current = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load analytics';
      setError(msg);
      console.warn('[useAnalytics] error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      load();
    } else {
      setData(null);
      loadedOnceRef.current = false;
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true),  [load]);

  /**
   * Updates the monthly goal both in the DB and immediately in local state
   * so the progress bar updates without waiting for a re-fetch.
   */
  const setMonthlyGoal = useCallback(async (goal: number) => {
    if (!user) return;
    try {
      await updateGoalService(user.id, goal);
      setData(prev => prev ? { ...prev, monthlyGoal: goal } : prev);
    } catch (err) {
      console.warn('[useAnalytics] setMonthlyGoal error:', err);
    }
  }, [user]);

  return { data, isLoading, isRefreshing, error, refetch, refresh, setMonthlyGoal };
}