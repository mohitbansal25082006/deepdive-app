// src/hooks/useReferral.ts
// Part 27 — Referral & Share-to-Earn Hook

import { useState, useEffect, useCallback } from 'react';
import { useAuth }    from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import {
  getReferralStats,
  redeemReferralCode,
  shareReferralCode,
  copyReferralCode,
} from '../services/referralService';
import type { ReferralStats, ReferralRedeemResult } from '../types/onboarding';

interface UseReferralReturn {
  stats:          ReferralStats | null;
  isLoading:      boolean;
  isRedeeming:    boolean;
  redeemResult:   ReferralRedeemResult | null;
  error:          string | null;
  refetch:        () => Promise<void>;
  redeem:         (code: string) => Promise<ReferralRedeemResult>;
  share:          () => Promise<void>;
  copyCode:       () => Promise<void>;
  clearResult:    () => void;
}

export function useReferral(): UseReferralReturn {
  const { user, profile } = useAuth();
  const { refresh: refreshCredits } = useCredits();

  const [stats,        setStats]        = useState<ReferralStats | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isRedeeming,  setIsRedeeming]  = useState(false);
  const [redeemResult, setRedeemResult] = useState<ReferralRedeemResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const s = await getReferralStats(user.id);
      setStats(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load referral stats';
      setError(msg);
      console.warn('[useReferral] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchStats();
    else {
      setStats(null);
      setRedeemResult(null);
      setError(null);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Redeem a referral code entered by the user.
   * After success, refreshes the credit balance and re-fetches stats.
   */
  const redeem = useCallback(async (code: string): Promise<ReferralRedeemResult> => {
    if (!user) return { success: false, message: 'Not signed in.' };

    setIsRedeeming(true);
    setRedeemResult(null);
    setError(null);

    try {
      const result = await redeemReferralCode(user.id, code);
      setRedeemResult(result);

      if (result.success) {
        // Refresh credit balance and referral stats
        await Promise.all([refreshCredits(), fetchStats()]);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Redemption failed';
      const failResult: ReferralRedeemResult = { success: false, message: msg };
      setRedeemResult(failResult);
      return failResult;
    } finally {
      setIsRedeeming(false);
    }
  }, [user, refreshCredits, fetchStats]);

  /** Opens the native Share sheet with the referral code message. */
  const share = useCallback(async () => {
    if (!stats?.code) return;
    const displayName = profile?.full_name ?? 'A friend';
    await shareReferralCode(stats.code, displayName);
  }, [stats?.code, profile?.full_name]);

  /** Copies the referral code to clipboard. */
  const copyCode = useCallback(async () => {
    if (!stats?.code) return;
    await copyReferralCode(stats.code);
  }, [stats?.code]);

  const clearResult = useCallback(() => setRedeemResult(null), []);
  const refetch     = useCallback(() => fetchStats(), [fetchStats]);

  return {
    stats,
    isLoading,
    isRedeeming,
    redeemResult,
    error,
    refetch,
    redeem,
    share,
    copyCode,
    clearResult,
  };
}