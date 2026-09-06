// src/types/cache.ts
// Part 59.2 — portable path fields.
// Part 59.3 — the two audio toggles are gone. Audio is part of the item.
//
// WHY THE TOGGLES WERE REMOVED
//
//   "Cache Podcast Audio" and "Cache Voice Debate Audio" shipped OFF, which
//   meant the default behaviour of caching a podcast was to save a transcript
//   and silently drop the thing the user actually wanted. Worse, after the
//   Part 59.2 path fix the toggles made no observable difference in most
//   sessions: the offline viewer resolves audio straight out of the generation
//   directory whether or not a cache copy exists, so ON and OFF looked
//   identical right up until the OS reclaimed that directory — at which point
//   OFF lost the audio permanently and ON did not. A setting whose effect is
//   invisible until the day it costs you your data is worse than no setting.
//
//   A cached podcast now means the episode: script AND audio. One toggle,
//   "Auto-Cache Content", still governs whether caching happens automatically.
//
//   Both fields stay on the interface as optional and deprecated so a settings
//   object persisted by an older build still deserialises. Nothing reads them.

// ─── Content type discriminator ───────────────────────────────────────────────

export type CachedContentType =
  | 'report'
  | 'podcast'
  | 'debate'
  | 'academic_paper'
  | 'presentation'
  | 'voice_debate';

/** Types that carry audio alongside their JSON. */
export const AUDIO_CONTENT_TYPES: CachedContentType[] = ['podcast', 'voice_debate'];

export function hasAudioTrack(type: CachedContentType): boolean {
  return type === 'podcast' || type === 'voice_debate';
}

// ─── Cache entry (stored in the index) ───────────────────────────────────────

export interface CacheEntry {
  /** Unique content ID (report.id, podcast.id, etc.) */
  id: string;
  /** Content type discriminator */
  type: CachedContentType;
  /** Human-readable title */
  title: string;
  /** Optional subtitle / descriptor */
  subtitle?: string;
  /** Unix ms timestamp when this entry was cached */
  cachedAt: number;
  /** Unix ms timestamp when this entry expires (auto-evict) */
  expiresAt: number;
  /**
   * Absolute path at the time of writing.
   *
   * Part 59.2: DO NOT read this directly. It contains a container prefix that
   * goes stale on app update, reinstall, and the Expo Go → standalone move.
   * Use buildFilePath(type, id) in cacheStorage.ts, which rebuilds it against
   * the current documentDirectory. Kept for diagnostics and legacy indexes.
   */
  filePath: string;
  /** Part 59.2: app-relative path, e.g. "deepdive_cache/reports/abc.json". */
  portablePath?: string;
  /** Total size in bytes: JSON + audio. */
  sizeBytes: number;
  /** Optional icon name for display in cache manager */
  icon?: string;
  /** Optional accent color for display */
  color?: string;
  /** Audio downloaded locally (podcast / voice_debate). */
  hasAudio?: boolean;
  /** Bytes used by audio files alone. Included in sizeBytes. */
  audioSizeBytes?: number;
  /**
   * Part 59.3: audio is expected for this type but is not on disk yet.
   * Lets the Cache Manager show "audio pending" rather than implying the item
   * is complete when only its transcript was saved.
   */
  audioPending?: boolean;
}

// ─── Cache index ──────────────────────────────────────────────────────────────

export interface CacheIndex {
  entries:     CacheEntry[];
  totalBytes:  number;
  limitBytes:  number;
  version:     number;
}

// ─── Cache settings ───────────────────────────────────────────────────────────

export interface CacheSettings {
  /** User-configured storage limit in bytes */
  limitBytes: number;
  /**
   * Cache new content automatically as it is generated.
   *
   * Part 59.3: this governs the AUTOMATIC path only. Manual caching — the
   * selective picker, "Cache Now", and the Download Audio buttons — always
   * works regardless of this setting. Previously every manual path also
   * short-circuited on it, so turning auto-cache off silently disabled the
   * buttons whose entire purpose is to cache things by hand.
   */
  autoCache:  boolean;
  /** Days before a cached item expires (default 30) */
  expiryDays: number;
  /**
   * @deprecated Part 59.3 — audio is always cached with its item.
   * Retained only so settings written by older builds still parse.
   */
  cacheAudio?: boolean;
  /**
   * @deprecated Part 59.3 — audio is always cached with its item.
   */
  cacheVoiceDebate?: boolean;
}

// ─── Cache stats ──────────────────────────────────────────────────────────────

export interface CacheStats {
  totalItems:    number;
  totalBytes:    number;
  limitBytes:    number;
  percentUsed:   number;
  byType:        Record<CachedContentType, { count: number; bytes: number }>;
  podcastsWithAudio?: number;
  audioBytesTotal?: number;
  voiceDebatesWithAudio?: number;
  voiceDebateAudioBytes?: number;
  /** Part 59.3: audio-bearing items still waiting for their audio. */
  itemsAwaitingAudio?: number;
}

// ─── Filter type for offline screen ──────────────────────────────────────────

export type CacheFilterType = 'all' | CachedContentType;

// ─── Download state for cache manager ────────────────────────────────────────

export interface CacheDownloadState {
  id:       string;
  type:     CachedContentType;
  progress: number;   // 0-1
  status:   'idle' | 'downloading' | 'done' | 'error';
  error?:   string;
}

// ─── Audio cache ──────────────────────────────────────────────────────────────

export type AudioSegmentOrigin = 'cache' | 'generation' | 'stored' | 'cloud' | 'unknown';

export interface AudioCacheSegment {
  turnIndex:     number;
  /** Absolute at write time. Derived on read — see podcastAudioCache.ts. */
  localPath:     string;
  /** Part 59.2: file name only ("segment_3.mp3"). Stable across installs. */
  fileName?:     string;
  sizeBytes:     number;
  isAvailable:   boolean;
  origin?:       AudioSegmentOrigin;
}

export interface AudioCacheEntry {
  podcastId:    string;
  podcastTitle: string;
  segments:     AudioCacheSegment[];
  totalBytes:   number;
  cachedAt:     number;
  expiresAt:    number;
  successCount: number;
  totalCount:   number;
  /** Part 59.2: 2 = portable paths. Absent/1 = legacy absolute paths. */
  version?:     number;
}

export interface AudioCacheIndex {
  entries: Array<{
    podcastId:  string;
    totalBytes: number;
    cachedAt:   number;
    expiresAt:  number;
  }>;
  version: number;
}

export type AudioDownloadPhase =
  | 'idle'
  | 'resolving'
  | 'copying'
  | 'downloading'
  | 'done'
  | 'error';

export interface AudioDownloadProgress {
  podcastId:        string;
  segmentsComplete: number;
  segmentsTotal:    number;
  bytesDownloaded:  number;
  isComplete:       boolean;
  error?:           string;
  phase?:           AudioDownloadPhase;
  /** True when every segment came from local disk (no network). */
  offlineOnly?:     boolean;
}

// ─── Part 59.3: audio reconciliation ──────────────────────────────────────────

/**
 * Result of sweeping the cache index and making every audio-bearing entry's
 * on-disk reality match what the index claims.
 */
export interface AudioReconcileResult {
  /** Entries examined. */
  scanned:    number;
  /** Entries whose audio was newly downloaded or copied. */
  repaired:   number;
  /** Entries whose recorded size was corrected. */
  resized:    number;
  /** Entries that still have no audio (source genuinely unavailable). */
  unresolved: number;
  /** Bytes added to the index total as a result. */
  bytesAdded: number;
}

export interface AudioReconcileProgress {
  done:  number;
  total: number;
  title: string;
}

// ─── Offline viewer discriminator ─────────────────────────────────────────────

export type OfflineViewerType =
  | 'report'
  | 'podcast'
  | 'debate'
  | 'academic_paper'
  | 'presentation'
  | 'voice_debate';

export interface OfflineViewerState {
  isOpen:   boolean;
  entry:    CacheEntry | null;
  data:     unknown;
  isLoading: boolean;
  error:    string | null;
}

// ─── Selective cache ──────────────────────────────────────────────────────────

export interface SelectiveCacheItem {
  contentType: CachedContentType;
  id:          string;
  title:       string;
  subtitle:    string;
  createdAt:   string | null;
  /** Estimated size in KB for uncached items; real on-disk size once cached. */
  sizeHintKb:  number;
  isCached:    boolean;
  /** Part 59.3: true once the item's audio is on disk. */
  hasAudio?:   boolean;
}

export interface SelectiveCacheState {
  items:         SelectiveCacheItem[];
  isLoading:     boolean;
  isCachingBatch: boolean;
  selectedIds:   Set<string>;
  filter:        CacheFilterType;
  searchQuery:   string;
  error:         string | null;
  progress:      { done: number; total: number } | null;
}