// src/hooks/useCreditGate.ts
// Part 24 (Fix v6) — Simplified.
// Part 39 FIX — Added guardedConsumeTotal() for combined credit deduction.
//
// guardedConsumeTotal(feature, totalCost, featureLabel):
//   Wraps CreditsContext.consumeTotal() with the InsufficientCreditsModal display logic.
//   Used by podcast generation to check and deduct duration + quality costs in ONE call.
//
//   This fixes three bugs vs. the old two-call approach:
//     1. Transaction history shows ONE entry at the correct combined amount.
//     2. InsufficientCreditsModal shows the correct combined "required" amount.
//     3. Quality credits are never charged when the full total is unaffordable.

import { useState, useCallback }  from 'react';
import { useCredits }             from '../context/CreditsContext';
import { FEATURE_COSTS, FEATURE_LABELS } from '../constants/credits';
import type { CreditFeature, InsufficientCreditsInfo } from '../types/credits';

export interface UseCreditGateReturn {
  balance:             number;
  /** Deduct a single pre-defined feature cost. */
  guardedConsume:      (feature: CreditFeature) => Promise<boolean>;
  /**
   * Part 39 FIX — Deduct a combined cost as ONE DB transaction.
   *
   * @param feature      The primary feature key (used for the transaction record).
   * @param totalCost    The TOTAL credits to deduct (e.g. 20 base + 5 quality = 25).
   * @param featureLabel Human-readable label shown in the InsufficientCreditsModal.
   *
   * Returns true if deduction succeeded, false if the modal was shown.
   */
  guardedConsumeTotal: (feature: CreditFeature, totalCost: number, featureLabel: string) => Promise<boolean>;
  insufficientInfo:    InsufficientCreditsInfo | null;
  clearInsufficient:   () => void;
  isConsuming:         boolean;
}

export function useCreditGate(): UseCreditGateReturn {
  const { balance, consume, consumeTotal, refresh } = useCredits();

  const [insufficientInfo, setInsufficientInfo] =
    useState<InsufficientCreditsInfo | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);

  // ── guardedConsume — single feature, unchanged behaviour ─────────────────

  const guardedConsume = useCallback(async (feature: CreditFeature): Promise<boolean> => {
    const required = FEATURE_COSTS[feature];
    setIsConsuming(true);

    try {
      const ok = await consume(feature);

      if (!ok) {
        setInsufficientInfo({
          feature,
          featureLabel: FEATURE_LABELS[feature],
          required,
          current:   balance,
          shortfall: Math.max(0, required - balance),
        });
        refresh();
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[useCreditGate] guardedConsume error:', err);
      setInsufficientInfo({
        feature,
        featureLabel: FEATURE_LABELS[feature],
        required,
        current:   balance,
        shortfall: Math.max(0, required - balance),
      });
      return false;
    } finally {
      setIsConsuming(false);
    }
  }, [balance, consume, refresh]);

  // ── guardedConsumeTotal — combined cost, single transaction ───────────────
  //
  // consumeTotal() in CreditsContext:
  //   1. Fetches fresh DB balance
  //   2. Returns { ok: false, currentBalance } immediately if insufficient (0 cr charged)
  //   3. Otherwise deducts totalCost as ONE transaction and returns { ok: true, ... }
  //
  // We use currentBalance (returned from consumeTotal) for the modal so the displayed
  // figures are always accurate even before React re-renders the balance state.

  const guardedConsumeTotal = useCallback(async (
    feature:      CreditFeature,
    totalCost:    number,
    featureLabel: string,
  ): Promise<boolean> => {
    setIsConsuming(true);

    try {
      // Build a readable description for the credit_transactions DB row.
      // This is what appears in the transaction history, e.g.:
      //   "Podcast (10 min · High Quality) — 25 cr"
      const description = `${featureLabel} — ${totalCost} cr`;

      const { ok, currentBalance } = await consumeTotal(feature, totalCost, description);

      if (!ok) {
        // Show modal with the COMBINED required amount and the fresh balance.
        setInsufficientInfo({
          feature,
          featureLabel,
          required:  totalCost,
          current:   currentBalance,
          shortfall: Math.max(0, totalCost - currentBalance),
        });
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[useCreditGate] guardedConsumeTotal error:', err);
      setInsufficientInfo({
        feature,
        featureLabel,
        required:  totalCost,
        current:   balance,
        shortfall: Math.max(0, totalCost - balance),
      });
      return false;
    } finally {
      setIsConsuming(false);
    }
  }, [balance, consumeTotal]);

  const clearInsufficient = useCallback(() => {
    setInsufficientInfo(null);
  }, []);

  return {
    balance,
    guardedConsume,
    guardedConsumeTotal,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  };
}