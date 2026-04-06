// src/context/CreditsContext.tsx
// Part 32 UPDATE — Added Supabase Realtime subscription for user_credits balance.
// Part 39 FIX — Added consumeTotal() for atomic combined credit deduction.
//
// NEW in Part 39 FIX:
//   consumeTotal(feature, totalCost, description) — deducts a combined cost as ONE
//   single DB transaction. Used by podcast generation to charge duration + quality
//   add-on together, so transaction history shows "-25 cr" instead of two separate
//   "-20 cr" and "-5 cr" entries.
//
//   Returns { ok: boolean; currentBalance: number } so the caller (useCreditGate)
//   can show the correct combined required amount in the InsufficientCreditsModal.
//
// NEW in Part 32:
//   When admin adjusts credits via the admin dashboard, user_credits.balance is
//   updated in the DB. Supabase Realtime fires an UPDATE event on the row.
//   This context now listens for that event and instantly updates the balance
//   shown in the app's header pill — no restart or manual refresh required.
//
// All Part 24–31 logic preserved unchanged.

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
  //
  // This solves three bugs in podcast generation:
  //
  // Bug 1 — split transactions: calling guardedConsume twice (once for quality,
  //   once for duration) creates two separate DB rows. This method creates one.
  //
  // Bug 2 — wrong modal amount: when each guardedConsume only knows its own cost,
  //   the InsufficientCreditsModal shows the wrong "required" figure. By passing
  //   totalCost here, the modal always shows the correct combined amount.
  //
  // Bug 3 — quality pre-charge: the old order (quality first, then duration)
  //   deducted quality credits even when the user couldn't afford the full total.
  //   This method checks the full totalCost BEFORE touching any credits.
  //
  // Returns { ok, currentBalance } so the caller (useCreditGate) can build the
  // InsufficientCreditsInfo with the fresh balance without waiting for a re-render.

  const consumeTotal = useCallback(async (
    feature:     CreditFeature,
    totalCost:   number,
    description: string = '',
  ): Promise<{ ok: boolean; currentBalance: number }> => {
    if (!user) return { ok: false, currentBalance: 0 };

    // Step 1 — fetch fresh balance from DB (never trust stale state for money ops)
    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh.balance;
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      console.warn('[Credits] consumeTotal: could not fetch fresh balance, using cached:', fetchErr);
    }

    // Step 2 — pre-flight check: if insufficient, return immediately with ZERO credits charged
    if (currentBalance < totalCost) {
      return { ok: false, currentBalance };
    }

    // Step 3 — optimistic deduction in UI so balance pill updates instantly
    setBalance(prev => Math.max(0, prev - totalCost));

    // Step 4 — single atomic DB deduction with combined description
    try {
      const newBalance = await consumeCredits(user.id, feature, totalCost, description);
      setBalance(newBalance);
      cacheBalance(user.id, newBalance);
      return { ok: true, currentBalance: newBalance };
    } catch (err) {
      // Rollback optimistic deduction on any DB error
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);

      if (err instanceof InsufficientCreditsError) {
        // DB said insufficient (race condition) — update to real balance
        setBalance(err.balance);
        cacheBalance(user.id, err.balance);
        return { ok: false, currentBalance: err.balance };
      }
      return { ok: false, currentBalance };
    }
  }, [user, balance]);

  // ── Poll for payment confirmation ─────────────────────────────────────────

  const pollCheckOrder = useCallback(async (
    razorpayOrderId: string,
    pack:            CreditPack,
    prevBalance:     number,
  ): Promise<'paid' | 'failed' | 'timeout'> => {
    if (!user) return 'timeout';

    const MAX_ATTEMPTS    = 15;
    const INITIAL_DELAY_MS = 2000;
    const INTERVAL_MS     = 2000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise<void>(r => setTimeout(r, i === 0 ? INITIAL_DELAY_MS : INTERVAL_MS));

      try {
        const result = await checkOrderAndAddCredits(user.id, razorpayOrderId);

        if (result.payment_failed) {
          return 'failed';
        }

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

    setPurchaseState(prev => ({ ...prev, phase: 'polling' }));

    const pollResult = await pollCheckOrder(orderData.order_id, pack, prevBalance);

    if (pollResult === 'failed') {
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
          'Payment not confirmed yet.\n\n' +
          'If you completed the payment, your credits will be added automatically within 1 minute. ' +
          'Pull down to refresh on this screen to check your balance.',
      }));
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