// src/types/cache.ts
// Part 23 — Updated: added audio cache types for offline podcast playback.
//
// NEW in Part 23:
//   • AudioCacheEntry — tracks locally cached audio segment files per podcast
//   • AudioCacheIndex — index of all cached podcast audio (stored in AsyncStorage)
//   • CachedPodcastData — full podcast data including local audio paths for offline play
//   • OfflineViewerType — discriminator for which full-screen viewer to show

// ─── Content type discriminator ───────────────────────────────────────────────

export type CachedContentType =
  | 'report'
  | 'podcast'
  | 'debate'
  | 'academic_paper'
  | 'presentation';

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
  /** File path on device where the JSON data is stored */
  filePath: string;
  /** Approximate file size in bytes (set after write) */
  sizeBytes: number;
  /** Optional icon name for display in cache manager */
  icon?: string;
  /** Optional accent color for display */
  color?: string;
  /**
   * Part 23: For podcasts only — whether audio has been downloaded locally.
   * If true, the podcast can be fully played offline (not just transcript view).
   */
  hasAudio?: boolean;
  /**
   * Part 23: Total audio size in bytes (sum of all cached segment files).
   * Included in sizeBytes for storage limit purposes.
   */
  audioSizeBytes?: number;
}

// ─── Cache index (the root index stored in AsyncStorage) ──────────────────────

export interface CacheIndex {
  entries:     CacheEntry[];
  /** Total bytes used across all cached files (JSON data + audio) */
  totalBytes:  number;
  /** User-configured limit in bytes (default 100 MB) */
  limitBytes:  number;
  /** Version stamp for migration */
  version:     number;
}

// ─── Cache settings ───────────────────────────────────────────────────────────

export interface CacheSettings {
  /** User-configured storage limit in bytes */
  limitBytes: number;
  /** Whether auto-cache is enabled after generation */
  autoCache:  boolean;
  /** Days before a cached item expires (default 30) */
  expiryDays: number;
  /**
   * Part 23: Whether to also cache podcast audio segments for offline playback.
   * Audio files can be large (~1-5 MB per minute). Default: false (transcript only).
   */
  cacheAudio: boolean;
}

// ─── Cache stats ──────────────────────────────────────────────────────────────

export interface CacheStats {
  totalItems:    number;
  totalBytes:    number;
  limitBytes:    number;
  percentUsed:   number;
  byType:        Record<CachedContentType, { count: number; bytes: number }>;
  /** Part 23: How many podcasts have audio cached */
  podcastsWithAudio?: number;
  /** Part 23: Total bytes used just by audio files */
  audioBytesTotal?: number;
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

// ─── Part 23: Audio Cache ─────────────────────────────────────────────────────

/**
 * Tracks a single locally cached audio segment file for a podcast turn.
 */
export interface AudioCacheSegment {
  /** Turn index within the podcast script */
  turnIndex:     number;
  /** Local file:/// path on device */
  localPath:     string;
  /** File size in bytes */
  sizeBytes:     number;
  /** Whether this segment was successfully downloaded */
  isAvailable:   boolean;
}

/**
 * Full audio cache record for one podcast episode.
 * Stored in AsyncStorage under key `deepdive:audio:cache:<podcastId>`.
 */
export interface AudioCacheEntry {
  podcastId:   string;
  podcastTitle: string;
  segments:    AudioCacheSegment[];
  /** Total bytes used by audio files */
  totalBytes:  number;
  /** Unix ms when audio was cached */
  cachedAt:    number;
  /** Unix ms when audio expires (matches podcast JSON expiry) */
  expiresAt:   number;
  /** How many segments were successfully downloaded */
  successCount: number;
  /** Total segments attempted */
  totalCount:  number;
}

/**
 * Index of all podcasts that have audio cached.
 * Stored in AsyncStorage under key `deepdive:audio:index:v23`.
 */
export interface AudioCacheIndex {
  entries: Array<{
    podcastId:  string;
    totalBytes: number;
    cachedAt:   number;
    expiresAt:  number;
  }>;
  version: number;
}

/**
 * Progress callback for audio download operations.
 */
export interface AudioDownloadProgress {
  podcastId:        string;
  segmentsComplete: number;
  segmentsTotal:    number;
  bytesDownloaded:  number;
  isComplete:       boolean;
  error?:           string;
}

// ─── Part 23: Offline viewer discriminator ────────────────────────────────────

/**
 * Which full-screen viewer component to render for a cached item.
 * Each type gets its own rich viewer matching the online experience.
 */
export type OfflineViewerType =
  | 'report'         // ResearchReport — 3-tab viewer
  | 'podcast'        // Podcast — transcript + audio player (if audio cached)
  | 'debate'         // DebateSession — 3-tab viewer (overview/perspectives/moderator)
  | 'academic_paper' // AcademicPaper — section navigator
  | 'presentation';  // GeneratedPresentation — slide previewer

/**
 * State for the offline viewer modal/overlay.
 */
export interface OfflineViewerState {
  isOpen:   boolean;
  entry:    CacheEntry | null;
  data:     unknown;
  isLoading: boolean;
  error:    string | null;
}