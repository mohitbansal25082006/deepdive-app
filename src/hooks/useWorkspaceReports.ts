// src/hooks/useWorkspaceReports.ts
// Paginated workspace report feed with load-more support.

import { useState, useCallback } from 'react';
import { WorkspaceReport } from '../types';
import { getWorkspaceFeed } from '../services/workspaceService';

const PAGE_SIZE = 20;

export function useWorkspaceReports(workspaceId: string | null) {
  const [reports,     setReports]     = useState<WorkspaceReport[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isRefreshing,setIsRefreshing]= useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [page,        setPage]        = useState(0);

  const load = useCallback(async (reset = false) => {
    if (!workspaceId) return;
    const currentPage = reset ? 0 : page;

    if (reset) {
      setIsRefreshing(true);
      setPage(0);
    } else {
      setIsLoading(true);
    }
    setError(null);

    const { data, error } = await getWorkspaceFeed(workspaceId, PAGE_SIZE, currentPage * PAGE_SIZE);

    if (reset) {
      setReports(data);
      setIsRefreshing(false);
    } else {
      setReports(prev => {
        // Deduplicate by id
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...data.filter(r => !ids.has(r.id))];
      });
      setIsLoading(false);
    }

    setHasMore(data.length === PAGE_SIZE);
    setError(error);
    if (!reset) setPage(p => p + 1);
  }, [workspaceId, page]);

  const refresh   = useCallback(() => load(true),  [load]);
  const loadMore  = useCallback(() => {
    if (!isLoading && hasMore) load(false);
  }, [load, isLoading, hasMore]);

  // Optimistic add
  const addReport = useCallback((report: WorkspaceReport) => {
    setReports(prev => {
      if (prev.some(r => r.reportId === report.reportId)) return prev;
      return [report, ...prev];
    });
  }, []);

  // Optimistic remove
  const removeReport = useCallback((reportId: string) => {
    setReports(prev => prev.filter(r => r.reportId !== reportId));
  }, []);

  return {
    reports, isLoading, isRefreshing, hasMore, error,
    refresh, loadMore, addReport, removeReport,
  };
}