// src/hooks/useQuery.ts
// Minimal generic async data-fetcher hook used in workspace-report.tsx.
// Avoids adding a full query library dependency.

import { useState, useEffect, useCallback } from 'react';

export function useQuery<T>(
  fetcher: () => Promise<T | null>,
  deps: unknown[] = [],
) {
  const [data,      setData]      = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, isLoading, error, refetch: run };
}