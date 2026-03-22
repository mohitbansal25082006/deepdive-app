// src/context/CreditsContext.tsx
// Part 24 (Fix v7) — Two critical fixes:
//
// FIX 1 (features showing not enough credits):
//   consume() now fetches a FRESH balance from the DB before attempting deduction.
//   Previously it used the stale React state `balance` which could be 0 even
//   after a successful purchase. Now the RPC always has the real current balance.
//
// FIX 2 (polling forever on failed payment):
//   pollCheckOrder now checks result.payment_failed and immediately stops with
//   a clear "payment was declined" error — no more 30s of useless polling.
//
// FIX 3 (Part 31 — admin credit adjustments not reflected in app balance):
//   loadTransactions() now ALSO refreshes the live balance from DB after fetching
//   transactions. Previously, when an admin added/deducted credits via the admin
//   dashboard, the transaction appeared in history but the balance shown in the
//   app header was still the old cached value.
//   Root cause: loadTransactions() and loadBalance() were completely independent.
//   The user saw the new transaction but the balance never re-fetched.
//   Fix: call fetchUserCredits() inside loadTransactions() so both always sync.

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
  consume:          (feature: CreditFeature) => Promise<boolean>;
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

  useEffect(() => {
    if (user) {
      loadedRef.current  = false;
      loadingRef.current = false;
      loadBalance();
    } else {
      setBalance(0);
      setTransactions([]);
      setPurchaseState({ phase: 'idle', selectedPack: null });
      setError(null);
      loadedRef.current  = false;
      loadingRef.current = false;
      clearBalanceCache();
    }
  }, [user?.id]);

  const refresh = useCallback(() => loadBalance(true), [loadBalance]);

  // ── Load transactions ─────────────────────────────────────────────────────
  // FIX 3: After fetching transactions, ALSO refresh the balance from DB.
  //
  // WHY: The admin dashboard can add or deduct credits at any time.
  // That updates user_credits.balance in Supabase, and inserts a transaction row.
  // When the user opens their transaction history screen, they call loadTransactions().
  // Previously this only fetched transactions — the balance shown in the header
  // was still the old cached value because loadBalance() was never called.
  //
  // Now loadTransactions() always fetches a fresh balance from DB as well,
  // so the balance and transaction list are always in sync after viewing history.
  //
  // Performance: fetchUserCredits() is a single lightweight DB read.
  // The balance update runs in the background (non-blocking) after transactions load.

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

    // FIX 3: Refresh live balance from DB after loading transactions.
    // This catches any admin-side adjustments that happened since last app open.
    // Runs after setTxLoading(false) so it never delays the transaction list render.
    // Uses a separate try/catch so a balance fetch failure never hides transactions.
    if (user) {
      try {
        const credits = await fetchUserCredits(user.id);
        setBalance(credits.balance);
        cacheBalance(user.id, credits.balance);
      } catch (err) {
        // Non-fatal — balance will still show the last known value
        console.warn('[Credits] Balance refresh after loadTransactions failed:', err);
      }
    }
  }, [user]);

  // ── Consume credits ───────────────────────────────────────────────────────
  // FIX 1: Always fetch fresh balance from DB before consuming.
  // This guarantees we never deduct from a stale 0 balance in context state.

  const consume = useCallback(async (feature: CreditFeature): Promise<boolean> => {
    if (!user) return false;
    const cost = FEATURE_COSTS[feature];

    // Always get the real current balance from DB first
    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh.balance;
      // Update state + cache so UI reflects this
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      // Network error — fall through with cached/state balance
      console.warn('[Credits] consume: could not fetch fresh balance, using cached:', fetchErr);
    }

    // Client-side check before hitting the RPC
    if (currentBalance < cost) {
      return false;
    }

    // Optimistic deduction
    setBalance(prev => Math.max(0, prev - cost));

    try {
      const newBalance = await consumeCredits(user.id, feature, cost);
      setBalance(newBalance);
      cacheBalance(user.id, newBalance);
      return true;
    } catch (err) {
      // Rollback optimistic deduction
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);

      if (err instanceof InsufficientCreditsError) {
        setBalance(err.balance);
        cacheBalance(user.id, err.balance);
      }
      return false;
    }
  }, [user, balance]);

  // ── Poll for payment confirmation ─────────────────────────────────────────
  // FIX 2: Returns 'paid' | 'failed' | 'timeout' so the caller
  // knows exactly why polling stopped.

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

        // Payment was definitively declined — stop immediately
        if (result.payment_failed) {
          console.log(`[Credits] Payment declined on poll ${i + 1}. Reason: ${result.fail_reason ?? 'unknown'}`);
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

          console.log(`[Credits] ✓ Credits added on poll ${i + 1}. New balance: ${result.balance}`);
          return 'paid';
        }

        console.log(
          `[Credits] Poll ${i + 1}/${MAX_ATTEMPTS}: order_status=${result.order_status ?? 'unknown'}, payments=${result.payment_count ?? '?'}`,
        );
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

    // 1. Create order
    setPurchaseState({ phase: 'creating_order', selectedPack: pack });
    let orderData;
    try {
      orderData = await createRazorpayOrder(pack.id, user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create order';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      return;
    }

    // 2. Build checkout URL
    let checkoutUrl: string;
    try {
      checkoutUrl = buildCheckoutUrl(orderData, user.email ?? '', profile?.full_name ?? 'Researcher');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout URL error';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      return;
    }

    // 3. Open browser
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

    // 4. Poll for confirmation
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
      // Fallback refreshes for webhook-added credits
      setTimeout(() => { if (user) loadBalance(false); }, 20_000);
      setTimeout(() => { if (user) loadBalance(false); }, 60_000);
    }

    // Always do a final balance refresh after any purchase attempt
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
    consume, purchasePack, refresh, loadTransactions, resetPurchase,
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