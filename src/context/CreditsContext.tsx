// src/context/CreditsContext.tsx
// Part 32 UPDATE — Added Supabase Realtime subscription for user_credits balance.
// Part 39 FIX — Added consumeTotal() for atomic combined credit deduction.
// Part 42 — Faster payment failure detection:
//   • Reduced first poll delay from 2000ms → 500ms (fires almost immediately after browser closes)
//   • Reduced polling interval from 2000ms → 1500ms for the first 5 attempts
//   • Max attempts kept at 15 (total max wait ~25s, same budget but front-loaded)
//   • payment_failed: true from edge fn still exits poll loop immediately (unchanged)
//   • Timeout message updated to be clearer about the 1-minute credit delivery guarantee
//
// All Part 24–41.8 logic preserved unchanged.

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, ReactNode,
}                         from 'react';
import * as WebBrowser    from 'expo-web-browser';
import { useAuth }        from './AuthContext';
import {
  fetchUserCredits,
  consumeCredits,
  fetchTransactions,
  createRazorpayOrder,
  buildCheckoutUrl,
  checkOrderAndAddCredits,
  InsufficientCreditsError,
}                         from '../services/creditsService';
import {
  getCachedBalance,
  cacheBalance,
  clearBalanceCache,
}                         from '../lib/creditStorage';
import { FEATURE_COSTS }  from '../constants/credits';
import { supabase }       from '../lib/supabase';
import type {
  CreditTransaction,
  CreditFeature,
  CreditPack,
  PurchaseState,
}                         from '../types/credits';

interface CreditsContextValue {
  balance:          number;
  isLoading:        boolean;
  isRefreshing:     boolean;
  transactions:     CreditTransaction[];
  txLoading:        boolean;
  purchaseState:    PurchaseState;
  error:            string | null;
  /** Deduct a single feature's cost. Returns false if insufficient. */
  consume:          (feature: CreditFeature) => Promise<boolean>;
  /**
   * Part 39 FIX — Deduct a combined cost as ONE DB transaction.
   * Used when two features (e.g. duration + quality) should appear as a
   * single line in the transaction history and the insufficient modal should
   * show the combined required amount.
   *
   * Returns { ok, currentBalance } so the caller knows the fresh balance
   * without waiting for a re-render.
   */
  consumeTotal:     (feature: CreditFeature, totalCost: number, description?: string) => Promise<{ ok: boolean; currentBalance: number }>;
  purchasePack:     (pack: CreditPack) => Promise<void>;
  refresh:          () => Promise<void>;
  loadTransactions: () => Promise<void>;
  resetPurchase:    () => void;
}

const CreditsContext = createContext<CreditsContextValue>({
  balance: 0, isLoading: false, isRefreshing: false,
  transactions: [], txLoading: false,
  purchaseState: { phase: 'idle', selectedPack: null },
  error: null,
  consume:          async () => false,
  consumeTotal:     async () => ({ ok: false, currentBalance: 0 }),
  purchasePack:     async () => {},
  refresh:          async () => {},
  loadTransactions: async () => {},
  resetPurchase:    () => {},
});

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();

  const [balance,       setBalance]       = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [transactions,  setTransactions]  = useState<CreditTransaction[]>([]);
  const [txLoading,     setTxLoading]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>({
    phase: 'idle', selectedPack: null,
  });

  const loadedRef  = useRef(false);
  const loadingRef = useRef(false);

  // ── Part 32: Realtime subscription ref for user_credits ───────────────────
  const creditChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Realtime: subscribe to user_credits balance changes ───────────────────
  const setupCreditRealtime = useCallback((userId: string) => {
    if (creditChannelRef.current) {
      supabase.removeChannel(creditChannelRef.current);
      creditChannelRef.current = null;
    }

    const channel = supabase
      .channel(`user_credits_${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'user_credits',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const newBalance = (payload.new as any).balance;
            if (typeof newBalance === 'number') {
              setBalance(newBalance);
              cacheBalance(userId, newBalance);
            }
          }
        },
      )
      .subscribe();

    creditChannelRef.current = channel;
  }, []);

  const teardownCreditRealtime = useCallback(() => {
    if (creditChannelRef.current) {
      supabase.removeChannel(creditChannelRef.current);
      creditChannelRef.current = null;
    }
  }, []);

  // ── Load balance ──────────────────────────────────────────────────────────

  const loadBalance = useCallback(async (showRefreshing = false) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;

    if (showRefreshing)          setIsRefreshing(true);
    else if (!loadedRef.current) setIsLoading(true);

    try {
      const cached = await getCachedBalance(user.id);
      if (cached !== null) setBalance(cached);

      const credits = await fetchUserCredits(user.id);
      setBalance(credits.balance);
      cacheBalance(user.id, credits.balance);
      setError(null);
      loadedRef.current = true;
    } catch (err) {
      console.warn('[Credits] loadBalance error:', err);
      setError(err instanceof Error ? err.message : 'Could not load credits');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      loadingRef.current = false;
    }
  }, [user]);

  // ── On user change: load balance + start realtime ─────────────────────────

  useEffect(() => {
    if (user) {
      loadedRef.current  = false;
      loadingRef.current = false;
      loadBalance();
      setupCreditRealtime(user.id);
    } else {
      setBalance(0);
      setTransactions([]);
      setPurchaseState({ phase: 'idle', selectedPack: null });
      setError(null);
      loadedRef.current  = false;
      loadingRef.current = false;
      clearBalanceCache();
      teardownCreditRealtime();
    }

    return () => {
      teardownCreditRealtime();
    };
  }, [user?.id]);

  const refresh = useCallback(() => loadBalance(true), [loadBalance]);

  // ── Load transactions ─────────────────────────────────────────────────────

  const loadTransactions = useCallback(async () => {
    if (!user) return;

    setTxLoading(true);
    try {
      const txs = await fetchTransactions(user.id, 20, 0);
      setTransactions(txs);
    } catch (err) {
      console.warn('[Credits] loadTransactions error:', err);
    } finally {
      setTxLoading(false);
    }

    // Belt-and-suspenders: also refresh balance from DB.
    if (user) {
      try {
        const credits = await fetchUserCredits(user.id);
        setBalance(credits.balance);
        cacheBalance(user.id, credits.balance);
      } catch (err) {
        console.warn('[Credits] Balance refresh after loadTransactions failed:', err);
      }
    }
  }, [user]);

  // ── Consume a single feature's cost ──────────────────────────────────────
  // Keeps original behaviour — used by all features except podcast (which uses consumeTotal).

  const consume = useCallback(async (feature: CreditFeature): Promise<boolean> => {
    if (!user) return false;
    const cost = FEATURE_COSTS[feature];

    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh.balance;
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      console.warn('[Credits] consume: could not fetch fresh balance, using cached:', fetchErr);
    }

    if (currentBalance < cost) {
      return false;
    }

    setBalance(prev => Math.max(0, prev - cost));

    try {
      const newBalance = await consumeCredits(user.id, feature, cost);
      setBalance(newBalance);
      cacheBalance(user.id, newBalance);
      return true;
    } catch (err) {
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);

      if (err instanceof InsufficientCreditsError) {
        setBalance(err.balance);
        cacheBalance(user.id, err.balance);
      }
      return false;
    }
  }, [user, balance]);

  // ── Part 39 FIX: Consume a combined total as ONE DB transaction ───────────

  const consumeTotal = useCallback(async (
    feature:     CreditFeature,
    totalCost:   number,
    description: string = '',
  ): Promise<{ ok: boolean; currentBalance: number }> => {
    if (!user) return { ok: false, currentBalance: 0 };

    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh.balance;
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      console.warn('[Credits] consumeTotal: could not fetch fresh balance, using cached:', fetchErr);
    }

    if (currentBalance < totalCost) {
      return { ok: false, currentBalance };
    }

    setBalance(prev => Math.max(0, prev - totalCost));

    try {
      const newBalance = await consumeCredits(user.id, feature, totalCost, description);
      setBalance(newBalance);
      cacheBalance(user.id, newBalance);
      return { ok: true, currentBalance: newBalance };
    } catch (err) {
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);

      if (err instanceof InsufficientCreditsError) {
        setBalance(err.balance);
        cacheBalance(user.id, err.balance);
        return { ok: false, currentBalance: err.balance };
      }
      return { ok: false, currentBalance };
    }
  }, [user, balance]);

  // ── Part 42: Poll for payment confirmation — FASTER FAILURE DETECTION ─────
  //
  // Changes from Part 24:
  //
  // 1. INITIAL_DELAY_MS: 2000 → 500
  //    The checkout page now auto-closes 1.5s after payment.failed fires.
  //    The moment the browser window closes, openBrowserAsync() resolves and
  //    we enter this polling loop. With 500ms initial delay, the FIRST poll
  //    fires ~500ms after the window closes, i.e. ~2s after the actual failure.
  //
  //    For success, the browser stays open until the user closes it manually,
  //    so 500ms vs 2000ms makes no real difference to the user experience there.
  //
  // 2. INTERVAL_MS: 2000 → 1500 for the first 5 attempts, then 2000 thereafter
  //    This front-loads the polling to catch failures and successes faster
  //    without hammering the edge function for the entire 30-second window.
  //
  // 3. MAX_ATTEMPTS: 15 (unchanged) — total max wall time ≈ 500 + 5×1500 + 10×2000 = 28s
  //    This is slightly shorter than the old 15×2000+2000=32s but within the same budget.
  //
  // 4. payment_failed: true handling is unchanged — still exits immediately.
  //    The speed improvement comes from the browser auto-closing sooner + 500ms first delay.
  //
  // Expected timing after Part 42:
  //   Failure: 1.5s (auto-close) + 500ms (first poll) + ~50ms (DB fast-path) = ~2.1s total
  //   Success: unchanged — browser closes when user presses back, then 500ms first poll

  const pollCheckOrder = useCallback(async (
    razorpayOrderId: string,
    pack:            CreditPack,
    prevBalance:     number,
  ): Promise<'paid' | 'failed' | 'timeout'> => {
    if (!user) return 'timeout';

    // Part 42: reduced delays for faster failure detection
    const MAX_ATTEMPTS       = 15;
    const INITIAL_DELAY_MS   = 500;   // ← was 2000ms. First check 500ms after browser closes.
    const FAST_INTERVAL_MS   = 1500;  // ← first 5 polls after the initial: every 1.5s
    const NORMAL_INTERVAL_MS = 2000;  // ← remaining polls: every 2s (matches original)
    const FAST_POLL_COUNT    = 5;     // ← how many fast polls before switching to normal rate

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Determine delay before this poll
      let delayMs: number;
      if (i === 0) {
        delayMs = INITIAL_DELAY_MS;
      } else if (i <= FAST_POLL_COUNT) {
        delayMs = FAST_INTERVAL_MS;
      } else {
        delayMs = NORMAL_INTERVAL_MS;
      }

      await new Promise<void>(r => setTimeout(r, delayMs));

      try {
        const result = await checkOrderAndAddCredits(user.id, razorpayOrderId);

        // ── Failure: exit immediately ────────────────────────────────────────
        // Part 42: this now triggers much faster because:
        //   a) The checkout page auto-closes after 1.5s (vs user manually closing after 5–20s)
        //   b) The first poll fires after only 500ms (vs 2000ms before)
        //   c) The edge fn hits the DB fast-path if webhook already set status='failed'
        if (result.payment_failed) {
          console.log('[Credits] Poll: payment_failed detected, stopping immediately');
          return 'failed';
        }

        // ── Success: update balance and exit ────────────────────────────────
        if (result.paid) {
          const creditsAdded =
            result.credits_added ??
            Math.max(0, result.balance - prevBalance);

          setBalance(result.balance);
          cacheBalance(user.id, result.balance);

          setPurchaseState(prev => ({
            ...prev,
            phase:        'success',
            creditsAdded: creditsAdded > 0
              ? creditsAdded
              : (pack.credits + (pack.bonusCredits ?? 0)),
          }));

          return 'paid';
        }

        console.log(`[Credits] Poll ${i + 1}/${MAX_ATTEMPTS}: not confirmed yet`);
      } catch (err) {
        console.warn(`[Credits] Poll ${i + 1}/${MAX_ATTEMPTS} error:`, err);
      }
    }

    return 'timeout';
  }, [user]);

  // ── Purchase flow ─────────────────────────────────────────────────────────

  const purchasePack = useCallback(async (pack: CreditPack): Promise<void> => {
    if (!user) return;

    const prevBalance = balance;

    setPurchaseState({ phase: 'creating_order', selectedPack: pack });
    let orderData;
    try {
      orderData = await createRazorpayOrder(pack.id, user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create order';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      return;
    }

    let checkoutUrl: string;
    try {
      checkoutUrl = buildCheckoutUrl(orderData, user.email ?? '', profile?.full_name ?? 'Researcher');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout URL error';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      return;
    }

    setPurchaseState(prev => ({ ...prev, phase: 'opening_browser', orderId: orderData.order_id }));
    try {
      await WebBrowser.openBrowserAsync(checkoutUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        toolbarColor:      '#0A0A1A',
        controlsColor:     '#6C63FF',
      });
    } catch (err) {
      console.warn('[Credits] Browser error:', err);
    }

    // Browser has closed (user closed it, or auto-close fired from checkout.html)
    // Start polling immediately with the Part 42 faster schedule
    setPurchaseState(prev => ({ ...prev, phase: 'polling' }));

    const pollResult = await pollCheckOrder(orderData.order_id, pack, prevBalance);

    if (pollResult === 'failed') {
      // Part 42: failure message distinguishes "declined" from the old generic message
      setPurchaseState(prev => ({
        ...prev,
        phase: 'failed',
        error: 'Your payment was declined.\n\nNo charges were made. Please try again with a different payment method (UPI / Card / Netbanking).',
      }));
    } else if (pollResult === 'timeout') {
      setPurchaseState(prev => ({
        ...prev,
        phase: 'failed',
        error:
          'Payment verification timed out.\n\n' +
          'If your payment went through, credits will be added to your account automatically within 1–2 minutes. ' +
          'Pull down to refresh your balance here, or check back shortly.',
      }));
      // Belt-and-suspenders balance refresh for late authorisations
      setTimeout(() => { if (user) loadBalance(false); }, 20_000);
      setTimeout(() => { if (user) loadBalance(false); }, 60_000);
    }

    await loadBalance(false);
  }, [user, profile, balance, pollCheckOrder, loadBalance]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetPurchase = useCallback(() => {
    setPurchaseState({ phase: 'idle', selectedPack: null });
    if (user) loadBalance(false);
  }, [user, loadBalance]);

  const value: CreditsContextValue = {
    balance, isLoading, isRefreshing,
    transactions, txLoading, purchaseState, error,
    consume, consumeTotal, purchasePack, refresh, loadTransactions, resetPurchase,
  };

  return (
    <CreditsContext.Provider value={value}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  return useContext(CreditsContext);
}