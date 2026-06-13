// src/hooks/useLazyReveal.ts
// Part 51 — Generic incremental-reveal hook for lazy rendering.
//
// PURPOSE (Feature 1):
//   The workspace Feed and Shared tabs previously rendered EVERY card at once
//   (50+ Animated.View + LinearGradient cards), which made the screen slow to
//   open. This hook keeps a rolling "visible" count that starts small and grows
//   as the user scrolls near the bottom — so only a handful of cards mount
//   initially and the rest reveal on demand.
//
// USAGE:
//   const { visible, hasMore, revealMore, reset } = useLazyReveal(items.length, { initial: 6, step: 6 });
//   {items.slice(0, visible).map(...)}
//   // call revealMore() from the parent ScrollView onScroll near-bottom handler
//
// NOTES:
//   - Clamps `visible` whenever the total shrinks (e.g. an item was removed in
//     real-time) so we never try to render past the end of the list.
//   - `reset()` returns to the initial window (e.g. on tab switch or refresh).

import { useState, useCallback, useEffect, useRef } from 'react';

interface LazyRevealOptions {
  initial?: number;   // how many to show first (default 6)
  step?:    number;   // how many to add per revealMore() (default 6)
}

interface LazyRevealResult {
  visible:    number;
  hasMore:    boolean;
  revealMore: () => void;
  reset:      () => void;
}

export function useLazyReveal(
  total: number,
  options?: LazyRevealOptions,
): LazyRevealResult {
  const initial = Math.max(1, options?.initial ?? 6);
  const step    = Math.max(1, options?.step    ?? 6);

  const [visible, setVisible] = useState(initial);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Clamp visible when the total list shrinks (real-time removals etc.)
  useEffect(() => {
    setVisible(v => {
      const ceiling = Math.max(initialRef.current, total);
      return v > ceiling ? ceiling : v;
    });
  }, [total]);

  const revealMore = useCallback(() => {
    setVisible(v => (v >= total ? v : Math.min(total, v + step)));
  }, [total, step]);

  const reset = useCallback(() => {
    setVisible(initialRef.current);
  }, []);

  const hasMore = visible < total;

  return { visible, hasMore, revealMore, reset };
}