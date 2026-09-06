// src/lib/voiceDebateCache.ts
// Part 59.2 — Path handling repaired. Logic otherwise unchanged from Part 45.
//
// The JSON cache had the same latent bug as the audio cache: the index entry
// stored an absolute filePath, and getCachedVoiceDebateJson() read that exact
// string. Once the container prefix changed (app update, reinstall, Expo Go →
// standalone), getInfoAsync said the file was gone and the entry was evicted —
// so opening a cached voice debate offline after an update showed "Cache Miss"
// and then permanently deleted a file that was sitting right there on disk.
//
// Fix: the path is DERIVED from the id on every read, against the current
// documentDirectory. entry.filePath is kept for diagnostics only. Eviction now
// happens only when the derived path is also missing.
//
// RESPONSIBILITY SPLIT (unchanged):
//   • this file                  → the VoiceDebate JSON object
//   • voiceDebateAudioCache.ts   → the .mp3 turns

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import type { VoiceDebate } from '../types/voiceDebate';
import {
  docDir,
  safeId,
  ensureDir,
  deleteQuietly,
  fileExists,
  fileSize,
} from './filePaths';

// ─── Constants ────────────────────────────────────────────────────────────────

const JSON_INDEX_KEY = 'deepdive:vd:json:index:v45';

/** Rebuilt live — never captured at module load, which would freeze a prefix. */
function cacheDirPath(): string {
  return `${docDir()}deepdive_cache/voice_debates/`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceDebateJsonCacheEntry {
  voiceDebateId:   string;
  topic:           string;
  question:        string;
  totalTurns:      number;
  durationSeconds: number;
  wordCount:       number;
  cachedAt:        number;
  expiresAt:       number;
  sizeBytes:       number;
  /** Absolute at write time. Diagnostic only — always derive on read. */
  filePath:        string;
  /** Part 59.2: app-relative path. */
  portablePath?:   string;
}

interface JsonCacheIndex {
  entries: VoiceDebateJsonCacheEntry[];
  version: number;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function fileNameFor(voiceDebateId: string): string {
  return `${safeId(voiceDebateId)}.json`;
}

function portablePathFor(voiceDebateId: string): string {
  return `deepdive_cache/voice_debates/${fileNameFor(voiceDebateId)}`;
}

/** The authoritative read path: derived from the id, against today's docDir. */
function jsonFilePath(voiceDebateId: string): string {
  return `${cacheDirPath()}${fileNameFor(voiceDebateId)}`;
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function loadIndex(): Promise<JsonCacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(JSON_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JsonCacheIndex;
      if (parsed.version === 45) return parsed;
    }
  } catch { /* fall through */ }
  return { entries: [], version: 45 };
}

async function saveIndex(index: JsonCacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(JSON_INDEX_KEY, JSON.stringify(index));
  } catch { /* non-fatal */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Write the full VoiceDebate object to disk. Safe to call repeatedly. */
export async function cacheVoiceDebateJson(
  voiceDebate: VoiceDebate,
  options?: { expiryDays?: number },
): Promise<boolean> {
  try {
    if (!docDir()) return false;
    await ensureDir(cacheDirPath());

    const expiryDays = options?.expiryDays ?? 30;
    const filePath   = jsonFilePath(voiceDebate.id);
    const serialized = JSON.stringify(voiceDebate);

    await FileSystem.writeAsStringAsync(filePath, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const onDisk    = await fileSize(filePath);
    const sizeBytes = onDisk > 0 ? onDisk : serialized.length;

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
      portablePath:    portablePathFor(voiceDebate.id),
    };

    const index = await loadIndex();
    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebate.id);
    index.entries.unshift(entry);
    await saveIndex(index);

    console.log(
      `[VoiceDebateCache] Cached JSON for ${voiceDebate.id} (${(sizeBytes / 1024).toFixed(1)} KB)`,
    );
    return true;
  } catch (err) {
    console.warn('[VoiceDebateCache] cacheVoiceDebateJson error:', err);
    return false;
  }
}

/**
 * Read a cached VoiceDebate. Null if absent or expired.
 *
 * Part 59.2: reads the DERIVED path. A pre-59.2 entry whose stored filePath is
 * stale now resolves instead of being wrongly evicted.
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

    const path = jsonFilePath(voiceDebateId);
    if (!(await fileExists(path))) {
      await evictVoiceDebateJson(voiceDebateId);
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Is this voice debate cached, unexpired, and present on disk? */
export async function isVoiceDebateJsonCached(voiceDebateId: string): Promise<boolean> {
  try {
    const index = await loadIndex();
    const entry = index.entries.find(e => e.voiceDebateId === voiceDebateId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;
    return fileExists(jsonFilePath(voiceDebateId));
  } catch {
    return false;
  }
}

/** All non-expired entries, for the Cache Manager. */
export async function getVoiceDebateJsonCacheIndex(): Promise<VoiceDebateJsonCacheEntry[]> {
  const index = await loadIndex();
  const now   = Date.now();
  return index.entries.filter(e => now < e.expiresAt);
}

/** Total bytes across all cached voice debate JSON files. */
export async function getVoiceDebateJsonTotalBytes(): Promise<number> {
  try {
    const index = await loadIndex();
    const now   = Date.now();
    return index.entries.filter(e => now < e.expiresAt).reduce((s, e) => s + e.sizeBytes, 0);
  } catch {
    return 0;
  }
}

/** Delete one cached JSON file. */
export async function evictVoiceDebateJson(voiceDebateId: string): Promise<void> {
  try {
    await deleteQuietly(jsonFilePath(voiceDebateId));

    // Also try the stored path, in case it was written under a prefix we can
    // no longer derive (belt and braces — deleteQuietly never throws).
    const index = await loadIndex();
    const entry = index.entries.find(e => e.voiceDebateId === voiceDebateId);
    if (entry?.filePath) await deleteQuietly(entry.filePath);

    index.entries = index.entries.filter(e => e.voiceDebateId !== voiceDebateId);
    await saveIndex(index);
  } catch { /* non-fatal */ }
}

/** Delete ALL cached voice debate JSON. */
export async function clearAllVoiceDebateJsonCache(): Promise<void> {
  try {
    await deleteQuietly(cacheDirPath());
    await saveIndex({ entries: [], version: 45 });
  } catch { /* non-fatal */ }
}