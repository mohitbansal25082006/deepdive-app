// src/context/CreditsContext.tsx
// Part 43 CRASH FIX — handles missing user_credits row for new OAuth users.
// Part 54A — payment-result notifications (success + failure).
// Part 55.12 — theme-integrated checkout.
//
// Part 57 — SECURE CHECKOUT + FASTER FAIL/CANCEL.
//   1. purchasePack() now mints a SIGNED token via createCheckoutToken() and
//      opens buildSecureCheckoutUrl(token) — the URL carries no email/order id/
//      key id/theme. Nothing sensitive leaks into browser history/referrers.
//   2. The in-app browser result is INSPECTED: the checkout page sets the URL
//      hash (#success / #failed / #cancelled / #processing). When the user
//      closes the sheet, WebBrowser.openBrowserAsync resolves with the final
//      URL; we read its hash to know the outcome INSTANTLY:
//        • #cancelled  → resolve as failed immediately (no polling, ~0s)
//        • #failed     → resolve as failed immediately (no polling, ~0s)
//        • #success    → confirm with ONE fast poll, then add credits
//        • anything else (dismissed mid-flow / unknown) → poll, but the FIRST
//          poll passes cancelled=true so the Edge fn fast-cancels (~1s).
//   3. pollCheckOrder() is faster: 500ms first delay, 6 fast polls at 1.2s,
//      and it forwards the `cancelled` hint to the Edge Function so a back-out
//      resolves on the first attempt instead of after ~30s.
//
// All Part 32 Realtime + Part 39 consumeTotal logic preserved unchanged.

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
  createCheckoutToken,
  buildSecureCheckoutUrl,
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
import { notifyPaymentResult } from '../services/appNotificationService';
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
async function ensureCreditsRow(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('initialize_user_credits', { p_user_id: userId });
    if (!error && data) {
      const balance = typeof data === 'number' ? data : (data as any)?.balance ?? 20;
      return balance;
    }
  } catch {}
  try {
    const { data: upsertData } = await supabase
      .from('user_credits')
      .upsert({ user_id: userId, balance: 20 }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('balance')
      .single();
    if (upsertData) return upsertData.balance ?? 20;
  } catch {}
  return 0;
}

// ── Part 55.12: snapshot the live theme colors for the checkout token ─────────
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

// ── Part 57: read the outcome the checkout page signalled via the URL hash ────
// Returns 'success' | 'failed' | 'cancelled' | 'unknown'.
function parseBrowserOutcome(result: WebBrowser.WebBrowserResult): 'success' | 'failed' | 'cancelled' | 'unknown' {
  // openBrowserAsync resolves with { type } and sometimes a url on dismiss.
  const anyResult = result as any;
  const url: string | undefined = anyResult?.url;
  if (url && typeof url === 'string') {
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const hash = url.slice(hashIdx + 1).toLowerCase();
      if (hash.includes('success'))   return 'success';
      if (hash.includes('failed'))    return 'failed';
      if (hash.includes('cancelled')) return 'cancelled';
    }
  }
  // On iOS, a user-initiated close yields type 'cancel'/'dismiss' with no url.
  // We treat that as "unknown" so the first poll runs with cancelled=true.
  return 'unknown';
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
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_credits', filter: `user_id=eq.${userId}` },
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
      const cached = await getCachedBalance(user.id).catch(() => null);
      if (cached !== null) setBalance(cached);

      let freshBalance = 0;
      try {
        const credits = await fetchUserCredits(user.id);
        freshBalance = credits?.balance ?? 0;
      } catch (fetchErr: any) {
        console.warn('[Credits] fetchUserCredits failed, initializing row:', fetchErr?.message);
        try { freshBalance = await ensureCreditsRow(user.id); }
        catch { freshBalance = cached ?? 0; }
      }

      setBalance(freshBalance);
      cacheBalance(user.id, freshBalance);
      setError(null);
      loadedRef.current = true;
    } catch (outerErr) {
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
  // Part 57: faster cadence + forwards a `cancelled` hint on the first attempt
  // so a back-out resolves instantly via the Edge fast-cancel path.
  const pollCheckOrder = useCallback(async (
    razorpayOrderId: string,
    pack:            CreditPack,
    prevBalance:     number,
    cancelledHint:   boolean,
  ): Promise<'paid' | 'failed' | 'timeout'> => {
    if (!user) return 'timeout';

    const MAX_ATTEMPTS       = 12;
    const INITIAL_DELAY_MS   = 400;
    const FAST_INTERVAL_MS   = 1200;
    const NORMAL_INTERVAL_MS = 2000;
    const FAST_POLL_COUNT    = 6;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      let delayMs: number;
      if (i === 0)                   delayMs = INITIAL_DELAY_MS;
      else if (i <= FAST_POLL_COUNT) delayMs = FAST_INTERVAL_MS;
      else                           delayMs = NORMAL_INTERVAL_MS;

      await new Promise<void>(r => setTimeout(r, delayMs));

      try {
        // Only send the cancelled hint on the FIRST poll — after that we rely on
        // Razorpay's own per-payment status (the user may have paid afterwards).
        const sendCancelled = cancelledHint && i === 0;
        const result = await checkOrderAndAddCredits(user.id, razorpayOrderId, sendCancelled);

        if (result.payment_failed) return 'failed';

        if (result.paid) {
          const creditsAdded = result.credits_added ?? Math.max(0, result.balance - prevBalance);
          setBalance(result.balance);
          cacheBalance(user.id, result.balance);
          setPurchaseState(prev => ({
            ...prev,
            phase:        'success',
            creditsAdded: creditsAdded > 0 ? creditsAdded : (pack.credits + (pack.bonusCredits ?? 0)),
          }));
          notifyPaymentResult({
            success:      true,
            creditsAdded: creditsAdded > 0 ? creditsAdded : (pack.credits + (pack.bonusCredits ?? 0)),
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
  const purchasePack = useCallback(async (pack: CreditPack): Promise<void> => {
    if (!user) return;

    const prevBalance = balance;
    setPurchaseState({ phase: 'creating_order', selectedPack: pack });

    // 1. Create the Razorpay order
    let orderData;
    try {
      orderData = await createRazorpayOrder(pack.id, user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create order';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      notifyPaymentResult({
        success: false, packName: pack.name,
        failureReason: 'We could not start your payment. No charges were made.',
      }).catch(() => {});
      return;
    }

    // 2. Part 57: mint a secure token and build a zero-leak URL
    let checkoutUrl: string;
    try {
      const themeParams = getThemeCheckoutParams();
      const token = await createCheckoutToken(
        orderData,
        user.id,
        user.email ?? '',
        profile?.full_name ?? 'Researcher',
        themeParams,
      );
      checkoutUrl = buildSecureCheckoutUrl(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout could not be secured';
      setPurchaseState(prev => ({ ...prev, phase: 'failed', error: msg }));
      notifyPaymentResult({
        success: false, packName: pack.name,
        failureReason: 'We could not open the payment page. No charges were made.',
      }).catch(() => {});
      return;
    }

    // 3. Open the in-app browser and INSPECT the result for the outcome hash
    setPurchaseState(prev => ({ ...prev, phase: 'opening_browser', orderId: orderData.order_id }));
    let browserOutcome: 'success' | 'failed' | 'cancelled' | 'unknown' = 'unknown';
    try {
      const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        toolbarColor:  COLORS.background,
        controlsColor: COLORS.primary,
      });
      browserOutcome = parseBrowserOutcome(result);
    } catch (err) {
      console.warn('[Credits] Browser error:', err);
    }

    // 4. Resolve based on the browser outcome — Part 57 instant paths
    // Fast fail/cancel: the page told us the payment failed or was cancelled.
    if (browserOutcome === 'failed' || browserOutcome === 'cancelled') {
      // Fire one confirming check (cancelled hint) to mark the order failed in
      // the DB, but don't wait on polling — resolve the UI immediately.
      checkOrderAndAddCredits(user.id, orderData.order_id, true).catch(() => {});
      setPurchaseState(prev => ({
        ...prev,
        phase: 'failed',
        error: browserOutcome === 'cancelled'
          ? 'Payment cancelled.\n\nNo charges were made. You can try again whenever you are ready.'
          : 'Your payment was declined.\n\nNo charges were made. Please try again with a different payment method (UPI / Card / Netbanking).',
      }));
      notifyPaymentResult({
        success: false, packName: pack.name,
        failureReason: browserOutcome === 'cancelled'
          ? 'Payment was cancelled. No charges were made.'
          : 'Your payment was declined. No charges were made.',
      }).catch(() => {});
      await loadBalance(false);
      return;
    }

    // Success path: confirm with the poller (it will add credits on the 1st poll).
    setPurchaseState(prev => ({ ...prev, phase: 'polling' }));
    const cancelledHint = browserOutcome === 'unknown';   // dismissed with no hash → likely backed out
    const pollResult = await pollCheckOrder(orderData.order_id, pack, prevBalance, cancelledHint);

    if (pollResult === 'failed') {
      setPurchaseState(prev => ({
        ...prev,
        phase: 'failed',
        error: 'Your payment was not completed.\n\nNo charges were made. Please try again with a different payment method (UPI / Card / Netbanking).',
      }));
      notifyPaymentResult({
        success: false, packName: pack.name,
        failureReason: 'Your payment was not completed. No charges were made.',
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
      // Do NOT fire a failure notification on timeout — webhook may still land.
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