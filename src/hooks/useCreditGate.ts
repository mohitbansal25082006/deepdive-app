// src/hooks/useCreditGate.ts
// Part 24 (Fix v6) — Simplified.
//
// CreditsContext.consume() now fetches a fresh DB balance before every deduction,
// so this hook no longer needs to call fetchUserCredits() itself.
// Just call consume() and show the modal if it returns false.

import { useState, useCallback }  from 'react';
import { useCredits }             from '../context/CreditsContext';
import { FEATURE_COSTS, FEATURE_LABELS } from '../constants/credits';
import type { CreditFeature, InsufficientCreditsInfo } from '../types/credits';

export interface UseCreditGateReturn {
  balance:           number;
  guardedConsume:    (feature: CreditFeature) => Promise<boolean>;
  insufficientInfo:  InsufficientCreditsInfo | null;
  clearInsufficient: () => void;
  isConsuming:       boolean;
}

export function useCreditGate(): UseCreditGateReturn {
  const { balance, consume, refresh } = useCredits();

  const [insufficientInfo, setInsufficientInfo] =
    useState<InsufficientCreditsInfo | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);

  const guardedConsume = useCallback(async (feature: CreditFeature): Promise<boolean> => {
    const required = FEATURE_COSTS[feature];
    setIsConsuming(true);

    try {
      // consume() in CreditsContext now fetches fresh DB balance before deducting.
      // If balance is insufficient it returns false without throwing.
      const ok = await consume(feature);

      if (!ok) {
        // Show the insufficient credits modal.
        // Use the context balance (which consume() just refreshed from DB).
        setInsufficientInfo({
          feature,
          featureLabel: FEATURE_LABELS[feature],
          required,
          current:   balance,
          shortfall: Math.max(0, required - balance),
        });
        // Trigger a UI refresh so the balance pill shows the latest value
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

  const clearInsufficient = useCallback(() => {
    setInsufficientInfo(null);
  }, []);

  return {
    balance,
    guardedConsume,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  };
}