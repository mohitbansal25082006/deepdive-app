// src/hooks/useOnboarding.ts
// Part 27 — Smart Onboarding Hook
//
// Responsible for:
//  • Checking if the current user has completed onboarding
//  • Providing actions to complete / skip onboarding
//  • Caching result in AsyncStorage to avoid extra DB round-trips

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  checkOnboardingStatus,
  completeOnboarding as completeOnboardingService,
  clearOnboardingCache,
} from '../services/onboardingService';
import type { OnboardingStatus } from '../types/onboarding';

interface UseOnboardingReturn {
  /** Null while loading */
  status:              OnboardingStatus | null;
  isLoading:           boolean;
  isCompleted:         boolean;
  selectedInterests:   string[];
  /** Force re-check from DB (e.g. after sign-in on a new device) */
  refetch:             () => Promise<void>;
  /** Marks onboarding done, seeds personalization, updates cache */
  completeOnboarding:  (interests: string[], monthlyGoal?: number) => Promise<void>;
  /** Skips onboarding for existing users who want to dismiss it */
  skipOnboarding:      () => Promise<void>;
  error:               string | null;
}

export function useOnboarding(): UseOnboardingReturn {
  const { user } = useAuth();
  const [status,    setStatus]    = useState<OnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetchStatus = useCallback(async (force = false) => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const s = await checkOnboardingStatus(user.id, force);
      setStatus(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load onboarding status';
      setError(msg);
      console.warn('[useOnboarding] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load on mount / user change
  useEffect(() => {
    if (user) {
      fetchStatus();
    } else {
      setStatus(null);
      setIsLoading(false);
      setError(null);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeOnboarding = useCallback(async (
    interests:   string[],
    monthlyGoal: number = 10,
  ) => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const updated = await completeOnboardingService(user.id, interests, monthlyGoal);
      setStatus(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete onboarding';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /**
   * Skip onboarding — marks as completed with empty interests.
   * Used for the "Skip" button so existing users aren't blocked.
   */
  const skipOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      const updated = await completeOnboardingService(user.id, [], 10);
      setStatus(updated);
    } catch (err) {
      console.warn('[useOnboarding] skip error:', err);
      // Non-fatal: just mark locally so the screen doesn't show again
      setStatus(prev => prev
        ? { ...prev, onboardingCompleted: true }
        : {
            userId: user.id,
            onboardingCompleted: true,
            selectedInterests: [],
            monthlyReportGoal: 10,
            completedStep: 4,
            completedAt: new Date().toISOString(),
          }
      );
    }
  }, [user]);

  const refetch = useCallback(() => fetchStatus(true), [fetchStatus]);

  return {
    status,
    isLoading,
    isCompleted:       status?.onboardingCompleted ?? false,
    selectedInterests: status?.selectedInterests   ?? [],
    refetch,
    completeOnboarding,
    skipOnboarding,
    error,
  };
}