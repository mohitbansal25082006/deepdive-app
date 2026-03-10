// src/lib/offlineCache.ts
// Offline caching for recently viewed research reports.
// Uses AsyncStorage to persist reports locally so they're readable
// without an internet connection.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResearchReport } from '../types';

const CACHE_KEY_PREFIX = 'deepdive:report:';
const CACHE_INDEX_KEY = 'deepdive:cache:index';
const MAX_CACHED_REPORTS = 10;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  reportId: string;
  title: string;
  cachedAt: number;
  expiresAt: number;
}

// ─── Index management ─────────────────────────────────────────────────────────

async function getCacheIndex(): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveCacheIndex(index: CacheEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[OfflineCache] Failed to save index:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function cacheReport(report: ResearchReport): Promise<void> {
  try {
    const key = `${CACHE_KEY_PREFIX}${report.id}`;
    const now = Date.now();
    const entry: CacheEntry = {
      reportId: report.id,
      title: report.title,
      cachedAt: now,
      expiresAt: now + CACHE_EXPIRY_MS,
    };

    // Save the report data
    await AsyncStorage.setItem(key, JSON.stringify(report));

    // Update the index
    let index = await getCacheIndex();
    // Remove existing entry for this report if present
    index = index.filter((e) => e.reportId !== report.id);
    // Add new entry at the front
    index.unshift(entry);
    // Evict oldest entries beyond the max
    const toEvict = index.splice(MAX_CACHED_REPORTS);
    for (const evicted of toEvict) {
      await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${evicted.reportId}`);
    }

    await saveCacheIndex(index);
  } catch (err) {
    console.warn('[OfflineCache] Failed to cache report:', err);
  }
}

export async function getCachedReport(reportId: string): Promise<ResearchReport | null> {
  try {
    const key = `${CACHE_KEY_PREFIX}${reportId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const report = JSON.parse(raw) as ResearchReport;

    // Check expiry via index
    const index = await getCacheIndex();
    const entry = index.find((e) => e.reportId === reportId);
    if (entry && Date.now() > entry.expiresAt) {
      await evictCachedReport(reportId);
      return null;
    }

    return report;
  } catch {
    return null;
  }
}

export async function getCachedReportsList(): Promise<CacheEntry[]> {
  const index = await getCacheIndex();
  const now = Date.now();
  return index.filter((e) => now < e.expiresAt);
}

export async function evictCachedReport(reportId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${reportId}`);
    const index = await getCacheIndex();
    await saveCacheIndex(index.filter((e) => e.reportId !== reportId));
  } catch (err) {
    console.warn('[OfflineCache] Failed to evict report:', err);
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const index = await getCacheIndex();
    for (const entry of index) {
      await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${entry.reportId}`);
    }
    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
  } catch (err) {
    console.warn('[OfflineCache] Failed to clear cache:', err);
  }
}

export async function getCacheSize(): Promise<number> {
  const index = await getCacheIndex();
  return index.length;
}

export function isReportCached(reportId: string, index: CacheEntry[]): boolean {
  const now = Date.now();
  return index.some((e) => e.reportId === reportId && now < e.expiresAt);
}