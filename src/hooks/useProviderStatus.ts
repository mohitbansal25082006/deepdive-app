// src/hooks/useProviderStatus.ts
// Part 59.1 — NEW. Ask "is Tavily configured?" from a screen, without keys.
//
// ── WHY ──────────────────────────────────────────────────────────────────────
//
// Two screens used to answer that question by reading the env var directly:
//
//     const hasTavilyKey = !!(
//       process.env.EXPO_PUBLIC_TAVILY_API_KEY?.trim() &&
//       process.env.EXPO_PUBLIC_TAVILY_API_KEY !== 'your_tavily_api_key_here'
//     );
//
// Part 59 deleted that variable, so `hasTavilyKey` became permanently false.
// The visible effects were small but wrong in both directions: the "TAVILY"
// badge in the Podcast Studio header stopped appearing even when search was
// working, and `webSearchActive` was passed as false to
// PodcastGenerationProgress, so the progress UI stopped showing the web-search
// step during generation.
//
// Part 59 already built the correct replacement: `get_ai_provider_status()`, an
// RPC that returns four booleans and nothing else — no key, no hint, no length,
// no ciphertext. `aiProviderStatus.ts` wraps it with an in-memory + AsyncStorage
// cache. This hook is just the React surface for it.
//
// ── OPTIMISTIC BY DESIGN ─────────────────────────────────────────────────────
//
// The initial state is all-true, and a failed lookup stays all-true (that is
// aiProviderStatus's own OPTIMISTIC fallback). A badge that briefly appears and
// then disappears is a much smaller error than one that hides a working feature
// because a status ping was slow. The real call is the source of truth; this is
// only for UI affordances, never for gating a request.

import { useCallback, useEffect, useState } from 'react';
import {
  getProviderStatus,
  clearProviderStatusCache,
  type ProviderStatus,
} from '../services/aiProviderStatus';

export interface UseProviderStatusResult extends ProviderStatus {
  /** True until the first lookup resolves. Values are optimistic meanwhile. */
  loading: boolean;
  /** Force a fresh lookup — call after an admin changes keys. */
  refresh: () => void;
}

const OPTIMISTIC: ProviderStatus = {
  openai: true,
  tavily: true,
  pexels: true,
  giphy:  true,
};

export function useProviderStatus(): UseProviderStatusResult {
  const [status,  setStatus]  = useState<ProviderStatus>(OPTIMISTIC);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    try {
      const next = await getProviderStatus(force);
      setStatus(next);
    } catch {
      // aiProviderStatus already swallows and returns OPTIMISTIC; this is belt
      // and braces so a screen can never crash on a status ping.
      setStatus(OPTIMISTIC);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await getProviderStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(OPTIMISTIC);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(() => {
    clearProviderStatusCache();
    setLoading(true);
    load(true);
  }, [load]);

  return { ...status, loading, refresh };
}