// src/context/CreditsContext.tsx
// Part 43 CRASH FIX — handles missing user_credits row for new OAuth users.
// Part 54A — Fires payment-result notifications (deep-linked to Transaction
//   History) on both payment SUCCESS and FAILURE via notifyPaymentResult():
//     • success  → fired inside pollCheckOrder when the order is confirmed paid
//     • failure  → fired inside purchasePack when polling returns 'failed'
//
// Part 55.12 — Theme-integrated checkout.
//   Two changes only — everything else is identical to the pre-55.12 file:
//
//   1. getThemeCheckoutParams() — reads the live COLORS singleton (already
//      mutated in-place by ThemeProvider) at the moment purchasePack() runs,
//      producing a ThemeCheckoutParams snapshot. Safe to call at any time;
//      no React subscription needed because COLORS is a plain mutable object.
//
//   2. buildCheckoutUrl() — now receives the theme snapshot as a 4th argument
//      so the Vercel checkout page gets `t_*` color params and renders in the
//      user's chosen theme.
//
//   3. WebBrowser.openBrowserAsync() toolbarColor / controlsColor now follow
//      the active theme instead of being hardcoded dark values.
//
// All Part 42 faster payment detection logic preserved unchanged.
// All Part 39 consumeTotal logic preserved unchanged.
// All Part 32 Realtime subscription preserved unchanged.

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, ReactNode,
} from 'react';
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
  type ThemeCheckoutParams,
} from '../services/creditsService';
import {
  getCachedBalance,
  cacheBalance,
  clearBalanceCache,
} from '../lib/creditStorage';
import { FEATURE_COSTS }  from '../constants/credits';
// ── Part 54A: payment-result notification (→ Transaction History) ──
import { notifyPaymentResult } from '../services/appNotificationService';
// ── Part 55.12: read live theme colors ───────────────────────────────────────
import { COLORS, isLightTheme } from '../constants/theme';
import { supabase }       from '../lib/supabase';
import type {
  CreditTransaction,
  CreditFeature,
  CreditPack,
  PurchaseState,
} from '../types/credits';

interface CreditsContextValue {
  balance:          number;
  isLoading:        boolean;
  isRefreshing:     boolean;
  transactions:     CreditTransaction[];
  txLoading:        boolean;
  purchaseState:    PurchaseState;
  error:            string | null;
  consume:          (feature: CreditFeature) => Promise<boolean>;
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

// ── Helper: initialize credits row for new OAuth users ────────────────────────
// Called when fetchUserCredits returns null/0 for a brand-new user.
// The RPC creates the user_credits row with the signup bonus if it doesn't exist.
async function ensureCreditsRow(userId: string): Promise<number> {
  try {
    // Try to upsert the credits row via RPC (idempotent — safe to call multiple times)
    const { data, error } = await supabase.rpc('initialize_user_credits', {
      p_user_id: userId,
    });
    if (!error && data) {
      const balance = typeof data === 'number' ? data : (data as any)?.balance ?? 20;
      return balance;
    }
  } catch {
    // RPC might not exist yet — fall back to direct upsert
  }

  try {
    // Direct upsert fallback — creates row with 20 credits if missing
    const { data: upsertData } = await supabase
      .from('user_credits')
      .upsert({ user_id: userId, balance: 20 }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('balance')
      .single();

    if (upsertData) return upsertData.balance ?? 20;
  } catch {
    // Even direct upsert failed — just return 0, don't crash
  }

  return 0;
}

// ── Part 55.12: snapshot the live theme colors for the checkout URL ───────────
// Reads the COLORS singleton directly — it is already mutated in-place by
// ThemeProvider so it always reflects the current active palette. No React
// subscription is needed; this is a plain synchronous read.

function getThemeCheckoutParams(): ThemeCheckoutParams {
  const gPrimary = COLORS.gradientPrimary as readonly [string, string];
  const gCard    = COLORS.gradientCard    as readonly [string, string];

  return {
    primary:             COLORS.primary,
    primaryLight:        COLORS.primaryLight,
    primaryDark:         COLORS.primaryDark,
    accent:              COLORS.accent,
    background:          COLORS.background,
    backgroundCard:      COLORS.backgroundCard,
    backgroundElevated:  COLORS.backgroundElevated,
    textPrimary:         COLORS.textPrimary,
    textSecondary:       COLORS.textSecondary,
    textMuted:           COLORS.textMuted,
    border:              COLORS.border,
    gradP1:              gPrimary[0],
    gradP2:              gPrimary[1],
    gradCard1:           gCard[0],
    gradCard2:           gCard[1],
    isLight:             isLightTheme(),
  };
}

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

  const creditChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Realtime subscription ─────────────────────────────────────────────────
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

  // ── Load balance — CRASH FIX: never throws, always defaults to 0 ──────────
  const loadBalance = useCallback(async (showRefreshing = false) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;

    if (showRefreshing)          setIsRefreshing(true);
    else if (!loadedRef.current) setIsLoading(true);

    try {
      // Show cached balance immediately while fetching fresh
      const cached = await getCachedBalance(user.id).catch(() => null);
      if (cached !== null) setBalance(cached);

      let freshBalance = 0;
      try {
        const credits = await fetchUserCredits(user.id);
        freshBalance = credits?.balance ?? 0;
      } catch (fetchErr: any) {
        // ── CRASH FIX: Handle missing credits row for new OAuth users ─────────
        console.warn('[Credits] fetchUserCredits failed, initializing row:', fetchErr?.message);
        try {
          freshBalance = await ensureCreditsRow(user.id);
        } catch (initErr) {
          console.warn('[Credits] ensureCreditsRow also failed:', initErr);
          freshBalance = cached ?? 0;
        }
      }

      setBalance(freshBalance);
      cacheBalance(user.id, freshBalance);
      setError(null);
      loadedRef.current = true;
    } catch (outerErr) {
      // ── CRASH FIX: Absolute last resort — never crash the Provider ─────────
      console.warn('[Credits] loadBalance outer error:', outerErr);
      setError('Could not load credits');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      loadingRef.current = false;
    }
  }, [user]);

  // ── On user change ────────────────────────────────────────────────────────
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

    return () => { teardownCreditRealtime(); };
  }, [user?.id]);

  const refresh = useCallback(() => loadBalance(true), [loadBalance]);

  // ── Load transactions ─────────────────────────────────────────────────────
  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setTxLoading(true);
    try {
      const txs = await fetchTransactions(user.id, 20, 0);
      setTransactions(txs ?? []);
    } catch (err) {
      console.warn('[Credits] loadTransactions error:', err);
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }

    // Belt-and-suspenders balance refresh
    if (user) {
      try {
        const credits = await fetchUserCredits(user.id);
        if (credits?.balance !== undefined) {
          setBalance(credits.balance);
          cacheBalance(user.id, credits.balance);
        }
      } catch (err) {
        console.warn('[Credits] Balance refresh after loadTransactions failed:', err);
      }
    }
  }, [user]);

  // ── Consume ───────────────────────────────────────────────────────────────
  const consume = useCallback(async (feature: CreditFeature): Promise<boolean> => {
    if (!user) return false;
    const cost = FEATURE_COSTS[feature];

    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh?.balance ?? balance;
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      console.warn('[Credits] consume: could not fetch fresh balance, using cached:', fetchErr);
    }

    if (currentBalance < cost) return false;

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

  // ── ConsumeTotal ──────────────────────────────────────────────────────────
  const consumeTotal = useCallback(async (
    feature:     CreditFeature,
    totalCost:   number,
    description: string = '',
  ): Promise<{ ok: boolean; currentBalance: number }> => {
    if (!user) return { ok: false, currentBalance: 0 };

    let currentBalance = balance;
    try {
      const fresh = await fetchUserCredits(user.id);
      currentBalance = fresh?.balance ?? balance;
      setBalance(currentBalance);
      cacheBalance(user.id, currentBalance);
    } catch (fetchErr) {
      console.warn('[Credits] consumeTotal: could not fetch fresh balance, using cached:', fetchErr);
    }

    if (currentBalance < totalCost) return { ok: false, currentBalance };

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

  // ── Poll for payment ──────────────────────────────────────────────────────
  const pollCheckOrder = useCallback(async (
    razorpayOrderId: string,
    pack:            CreditPack,
    prevBalance:     number,
  ): Promise<'paid' | 'failed' | 'timeout'> => {
    if (!user) return 'timeout';

    const MAX_ATTEMPTS       = 15;
    const INITIAL_DELAY_MS   = 500;
    const FAST_INTERVAL_MS   = 1500;
    const NORMAL_INTERVAL_MS = 2000;
    const FAST_POLL_COUNT    = 5;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      let delayMs: number;
      if (i === 0)                   delayMs = INITIAL_DELAY_MS;
      else if (i <= FAST_POLL_COUNT) delayMs = FAST_INTERVAL_MS;
      else                           delayMs = NORMAL_INTERVAL_MS;

      await new Promise<void>(r => setTimeout(r, delayMs));

      try {
        const result = await checkOrderAndAddCredits(user.id, razorpayOrderId);

        if (result.payment_failed) return 'failed';

        if (result.paid) {
          const creditsAdded = result.credits_added ?? Math.max(0, result.balance - prevBalance);
          setBalance(result.balance);
          cacheBalance(user.id, result.balance);
          setPurchaseState(prev => ({
            ...prev,
            phase:        'success',
            creditsAdded: creditsAdded > 0
              ? creditsAdded
              : (pack.credits + (pack.bonusCredits ?? 0)),
          }));

          // ── Part 54A: fire a payment-success notification ──
          notifyPaymentResult({
            success:      true,
            creditsAdded: creditsAdded > 0
              ? creditsAdded
              : (pack.credits + (pack.bonusCredits ?? 0)),
            packName:     pack.name,
          }).catch(() => {});

          return 'paid';
        }

        console.log(`[Credits] Poll ${i + 1}/${MAX_ATTEMPTS}: not confirmed yet`);
      } catch (err) {
        console.warn(`[Credits] Poll ${i + 1}/${MAX_ATTEMPTS} error:`, err);
      }
    }

    return 'timeout';
  }, [user]);

  // ── Purchase ──────────────────────────────────────────────────────────────
  // Part 55.12: snapshot the live COLORS at purchase time and pass them into
  // buildCheckoutUrl so the Vercel checkout page renders in the active theme.
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
      // ── Part 54A: notify failure (order could not be created) ──
      notifyPaymentResult({
        success:       false,
        packName:      pack.name,
        failureReason: 'We could not start your payment. No charges were made.',
      }).catch(() => {});
      return;
    }

    let checkoutUrl: string;
    try {
      // ── Part 55.12: attach live theme snapshot ─────────────────────────────
      const themeParams = getThemeCheckoutParams();
      checkoutUrl = buildCheckoutUrl(
        orderData,
        user.email ?? '',
        profile?.full_name ?? 'Researcher',
        themeParams,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout URL error';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      notifyPaymentResult({
        success:       false,
        packName:      pack.name,
        failureReason: 'We could not open the payment page. No charges were made.',
      }).catch(() => {});
      return;
    }

    setPurchaseState(prev => ({ ...prev, phase: 'opening_browser', orderId: orderData.order_id }));
    try {
      await WebBrowser.openBrowserAsync(checkoutUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        // Part 55.12: match the native browser chrome to the active theme
        toolbarColor: COLORS.background,
        controlsColor: COLORS.primary,
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
      // ── Part 54A: fire a payment-failure notification ──
      notifyPaymentResult({
        success:       false,
        packName:      pack.name,
        failureReason: 'Your payment was declined. No charges were made.',
      }).catch(() => {});
    } else if (pollResult === 'timeout') {
      setPurchaseState(prev => ({
        ...prev,
        phase: 'failed',
        error:
          'Payment verification timed out.\n\n' +
          'If your payment went through, credits will be added to your account automatically within 1–2 minutes. ' +
          'Pull down to refresh your balance here, or check back shortly.',
      }));
      // NOTE: We deliberately do NOT fire a failure notification on timeout —
      // the payment may still succeed via the webhook backup, and a "failed"
      // banner would be misleading. The success notification fires from the
      // webhook/poll path if/when the credits land.
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