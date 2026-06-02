// src/lib/voiceDebateCache.ts
// Part 45 — Voice Debate JSON Cache
//
// Caches the full VoiceDebate JSON object (including script, turns, metadata)
// to the device filesystem for offline reading and playback.
//
// RESPONSIBILITY SPLIT:
//   • This file  → caches the VoiceDebate JSON object (script, metadata, etc.)
//   • voiceDebateAudioCache.ts (Part 41.2) → caches the audio .mp3 segments
//
// CACHE DIRECTORY:
//   documentDirectory/deepdive_cache/voice_debates/<voiceDebateId>.json
//
// INDEX:
//   AsyncStorage key: deepdive:vd:json:index:v45
//   Per-entry key:    deepdive:vd:json:<voiceDebateId>
//
// USAGE:
//   import { cacheVoiceDebateJson, getCachedVoiceDebateJson } from './voiceDebateCache';
//
//   // Cache voice debate data
//   await cacheVoiceDebateJson(voiceDebate, { expiryDays: 30 });
//
//   // Read back from cache
//   const vd = await getCachedVoiceDebateJson<VoiceDebate>(voiceDebateId);

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { VoiceDebate } from '../types/voiceDebate';

// ─── Constants ────────────────────────────────────────────────────────────────

const JSON_INDEX_KEY  = 'deepdive:vd:json:index:v45';
const CACHE_DIR       = `${FileSystem.documentDirectory}deepdive_cache/voice_debates/`;
const MIN_SUCCESS_RATE = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceDebateJsonCacheEntry {
  voiceDebateId: string;
  topic:         string;
  question:      string;
  totalTurns:    number;
  durationSeconds: number;
  wordCount:     number;
  cachedAt:      number;
  expiresAt:     number;
  sizeBytes:     number;
  filePath:      string;
}

interface JsonCacheIndex {
  entries: VoiceDebateJsonCacheEntry[];
  version: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonFilePath(voiceDebateId: string): string {
  const safe = voiceDebateId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
  return `${CACHE_DIR}${safe}.json`;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR).catch(() => ({ exists: false }));
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
  }
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<JsonCacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(JSON_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JsonCacheIndex;
      if (parsed.version === 45) return parsed;
    }
  } catch {}
  return { entries: [], version: 45 };
}

async function saveIndex(index: JsonCacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(JSON_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cache the full VoiceDebate JSON object to device filesystem.
 * Safe to call multiple times — updates the existing entry.
 */
export async function cacheVoiceDebateJson(
  voiceDebate: VoiceDebate,
  options?: { expiryDays?: number },
): Promise<boolean> {
  try {
    await ensureDir();

    const expiryDays = options?.expiryDays ?? 30;
    const filePath   = jsonFilePath(voiceDebate.id);
    const serialized = JSON.stringify(voiceDebate);

    await FileSystem.writeAsStringAsync(filePath, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const fileInfo = await FileSystem.getInfoAsync(filePath).catch(() => ({ exists: false }));
    const sizeBytes = (fileInfo as any).size ?? serialized.length;

    const now       = Date.now();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    const entry: VoiceDebateJsonCacheEntry = {
      voiceDebateId:   voiceDebate.id,
      topic:           voiceDebate.topic,
      question:        voiceDebate.question,
      totalTurns:      voiceDebate.totalTurns,
      durationSeconds: voiceDebate.durationSeconds,
      wordCount:       voiceDebate.wordCount,
      cachedAt:        now,
      expiresAt,
      sizeBytes,
      filePath,
    };

    const index = await loadIndex();
    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebate.id);
    index.entries.unshift(entry);
    await saveIndex(index);

    console.log(`[VoiceDebateCache] ✅ Cached JSON for voiceDebateId=${voiceDebate.id} (${(sizeBytes / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.warn('[VoiceDebateCache] cacheVoiceDebateJson error:', err);
    return false;
  }
}

/**
 * Read a cached VoiceDebate JSON from device filesystem.
 * Returns null if not cached or expired.
 */
export async function getCachedVoiceDebateJson<T = VoiceDebate>(
  voiceDebateId: string,
): Promise<T | null> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.voiceDebateId === voiceDebateId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      await evictVoiceDebateJson(voiceDebateId);
      return null;
    }

    const fileInfo = await FileSystem.getInfoAsync(entry.filePath).catch(() => ({ exists: false }));
    if (!fileInfo.exists) {
      // File deleted externally — clean up index
      await evictVoiceDebateJson(voiceDebateId);
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(entry.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Check whether a voice debate JSON is cached and not expired.
 */
export async function isVoiceDebateJsonCached(voiceDebateId: string): Promise<boolean> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.voiceDebateId === voiceDebateId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;

    const fileInfo = await FileSystem.getInfoAsync(entry.filePath).catch(() => ({ exists: false }));
    return fileInfo.exists;
  } catch {
    return false;
  }
}

/**
 * Get the full cache index for display in the Cache Manager.
 */
export async function getVoiceDebateJsonCacheIndex(): Promise<VoiceDebateJsonCacheEntry[]> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt);
}

/**
 * Get total bytes used by all cached voice debate JSON files.
 */
export async function getVoiceDebateJsonTotalBytes(): Promise<number> {
  try {
    const index = await loadIndex();
    const now   = Date.now();
    return index.entries
      .filter(e => now < e.expiresAt)
      .reduce((s, e) => s + e.sizeBytes, 0);
  } catch {
    return 0;
  }
}

/**
 * Delete a single voice debate JSON cache entry.
 */
export async function evictVoiceDebateJson(voiceDebateId: string): Promise<void> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.voiceDebateId === voiceDebateId);
    if (entry) {
      await FileSystem.deleteAsync(entry.filePath, { idempotent: true }).catch(() => {});
    }
    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
    await saveIndex(index);
  } catch {}
}

/**
 * Delete ALL cached voice debate JSON files.
 */
export async function clearAllVoiceDebateJsonCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
    await saveIndex({ entries: [], version: 45 });
  } catch {}
}