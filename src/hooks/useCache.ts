// src/hooks/useCache.ts
// Part 22 — Cache management hook.
// Provides the full cache state for the Cache Manager UI in the profile tab.
// Supports: view all items, filter by type, delete individual/by-type/all,
// update storage limit, toggle auto-cache, download cached items.

import { useState, useEffect, useCallback } from 'react';
import {
  getCacheIndex,
  getCacheStats,
  evictItemById,
  evictByType,
  clearAllCache,
  formatBytes,
} from '../lib/cacheStorage';
import {
  getSettings,
  updateSettings,
  setStorageLimit,
  setAutoCache,
  LIMIT_PRESETS,
  LimitPreset,
  getCacheSummary,
} from '../lib/cacheSettings';
import type {
  CacheEntry,
  CacheStats,
  CacheSettings,
  CachedContentType,
  CacheFilterType,
} from '../types/cache';

export interface UseCacheReturn {
  // State
  entries:      CacheEntry[];
  stats:        CacheStats | null;
  settings:     CacheSettings | null;
  summary:      string;
  isLoading:    boolean;
  isDeleting:   boolean;

  // Filter
  activeFilter: CacheFilterType;
  filteredEntries: CacheEntry[];
  setFilter:    (f: CacheFilterType) => void;

  // Presets
  limitPresets:  LimitPreset[];
  formatBytes:   (b: number) => string;

  // Actions
  refresh:        () => Promise<void>;
  deleteItem:     (type: CachedContentType, id: string) => Promise<void>;
  deleteByType:   (type: CachedContentType) => Promise<void>;
  deleteAll:      () => Promise<void>;
  setLimit:       (bytes: number) => Promise<void>;
  toggleAutoCache:(enabled: boolean) => Promise<void>;
}

export function useCache(): UseCacheReturn {
  const [entries,      setEntries]      = useState<CacheEntry[]>([]);
  const [stats,        setStats]        = useState<CacheStats | null>(null);
  const [settings,     setSettings]     = useState<CacheSettings | null>(null);
  const [summary,      setSummary]      = useState('');
  const [isLoading,    setIsLoading]    = useState(true);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [activeFilter, setActiveFilter] = useState<CacheFilterType>('all');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [idx, st, sett, sum] = await Promise.all([
        getCacheIndex(),
        getCacheStats(),
        getSettings(),
        getCacheSummary(),
      ]);
      setEntries(idx);
      setStats(st);
      setSettings(sett);
      setSummary(sum);
    } catch (err) {
      console.warn('[useCache] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered entries
  const filteredEntries = activeFilter === 'all'
    ? entries
    : entries.filter(e => e.type === activeFilter);

  const deleteItem = useCallback(async (type: CachedContentType, id: string) => {
    setIsDeleting(true);
    try {
      await evictItemById(type, id);
      await load();
    } finally {
      setIsDeleting(false);
    }
  }, [load]);

  const deleteByType = useCallback(async (type: CachedContentType) => {
    setIsDeleting(true);
    try {
      await evictByType(type);
      await load();
    } finally {
      setIsDeleting(false);
    }
  }, [load]);

  const deleteAll = useCallback(async () => {
    setIsDeleting(true);
    try {
      await clearAllCache();
      await load();
    } finally {
      setIsDeleting(false);
    }
  }, [load]);

  const setLimit = useCallback(async (bytes: number) => {
    await setStorageLimit(bytes);
    await load();
  }, [load]);

  const toggleAutoCache = useCallback(async (enabled: boolean) => {
    await setAutoCache(enabled);
    const updated = await getSettings();
    setSettings(updated);
  }, []);

  return {
    entries,
    stats,
    settings,
    summary,
    isLoading,
    isDeleting,
    activeFilter,
    filteredEntries,
    setFilter: setActiveFilter,
    limitPresets: LIMIT_PRESETS,
    formatBytes,
    refresh:        load,
    deleteItem,
    deleteByType,
    deleteAll,
    setLimit,
    toggleAutoCache,
  };
}