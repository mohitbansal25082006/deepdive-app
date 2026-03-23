// src/context/CreditsContext.tsx
// Part 32 UPDATE — Added Supabase Realtime subscription for user_credits balance.
//
// NEW in Part 32:
//   When admin adjusts credits via the admin dashboard, user_credits.balance is
//   updated in the DB. Supabase Realtime fires an UPDATE event on the row.
//   This context now listens for that event and instantly updates the balance
//   shown in the app's header pill — no restart or manual refresh required.
//
//   Result: admin adds 100 credits → user's balance pill updates in ~1 second.
//
// KEPT from Part 31 Fix 3:
//   loadTransactions() still also refreshes balance from DB after fetching
//   transactions (belt-and-suspenders approach in case Realtime is delayed).
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

  // ── Part 32: Realtime subscription ref for user_credits ───────────────────
  const creditChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Realtime: subscribe to user_credits balance changes ───────────────────
  // Fires instantly when admin (or any RPC) updates user_credits.balance.
  // Filter: `user_id=eq.${userId}` — only this user's row.
  // SECURITY: Supabase RLS ensures the user can only receive events for their
  //           own user_credits row (SELECT policy: user_id = auth.uid()).

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
      setupCreditRealtime(user.id);   // Part 32: start listening for balance changes
    } else {
      setBalance(0);
      setTransactions([]);
      setPurchaseState({ phase: 'idle', selectedPack: null });
      setError(null);
      loadedRef.current  = false;
      loadingRef.current = false;
      clearBalanceCache();
      teardownCreditRealtime();        // Part 32: clean up on sign out
    }

    return () => {
      // Part 32: clean up realtime channel when userId changes or component unmounts
      teardownCreditRealtime();
    };
  }, [user?.id]);

  const refresh = useCallback(() => loadBalance(true), [loadBalance]);

  // ── Load transactions (also refreshes balance — Part 31 Fix 3) ────────────

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
    // Realtime usually beats this, but it handles delayed events and offline reconnect.
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

  // ── Consume credits ───────────────────────────────────────────────────────

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