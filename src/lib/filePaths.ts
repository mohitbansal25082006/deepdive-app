// src/lib/filePaths.ts
// Part 59.2 — Portable file paths + safe filesystem probes. Android AND iOS.
//
// ─── THE BUG THIS FILE EXISTS TO FIX ────────────────────────────────────────
//
// Everything we write lives under FileSystem.documentDirectory. That prefix is
// not a constant, and it breaks differently on each platform:
//
// ANDROID — the prefix depends on WHO is running the JS bundle:
//   Expo Go:     file:///data/user/0/host.exp.exponent/files/ExperienceData/<enc-app>/
//   Standalone:  file:///data/user/0/com.deepdive.ai/files/
//   Alias:       /data/user/0/<pkg> and /data/data/<pkg> are the SAME directory
//                reachable by two different strings, and which one comes back
//                is not guaranteed to be the one you stored.
//   Also: /data/user/<N>/ for secondary users and work profiles.
//
// iOS — the prefix contains a container UUID that Apple explicitly documents as
// unstable:
//   file:///var/mobile/Containers/Data/Application/<UUID>/Documents/
//   The UUID changes on app update, reinstall, TestFlight → App Store, and in
//   some cases on a plain relaunch. Apple's guidance is to store relative paths
//   or repair absolute ones — never to persist an absolute container path.
//
// We were persisting ABSOLUTE paths in two places:
//   • podcasts.audio_segment_paths / voice_debates.audio_segment_paths (Postgres)
//   • the local cache indexes in AsyncStorage (CacheEntry.filePath, segment
//     localPath, the presentation asset manifest)
//
// In Expo Go you generate a podcast and download its audio in the same session
// under the same prefix, so it works. Install the preview APK / production
// build and every one of those stored paths points into a directory belonging
// to a different app id (Android) or a dead container (iOS). Every
// getInfoAsync() returns exists:false, and the offline "Download Audio" button
// reports that no segments could be copied — with no network involved at all.
// Same code, same logic, different prefix.
//
// ─── FIX 1: never trust a stored absolute path ──────────────────────────────
//
// Store the app-relative part and rebuild against the CURRENT documentDirectory
// on every disk access. rebase() also repairs legacy absolute paths already
// sitting in Postgres, so no data migration is needed.
//
// ─── FIX 2: file:// scheme ──────────────────────────────────────────────────
//
// Android is inconsistent about whether a bare /data/... path is accepted, and
// release builds are stricter than debug ones. Every resolver here tries both
// the schemed and unschemed form before declaring a file missing.
//
// ─── FIX 3: getInfoAsync().size ─────────────────────────────────────────────
//
// Call sites did `info.exists && info.size > 0`. `size` is not guaranteed: on
// some platform/SDK combinations it comes back undefined for a file that exists
// perfectly well, and older code passed a `{ size: true }` option that the
// SDK 57 legacy typings no longer accept at all. `undefined > 0` is false, so a
// real 400 KB mp3 was reported as missing. Every probe now goes through
// fileExists() / fileSize() here, which treat an unknown size as "exists"
// rather than "missing" and never gate existence on a byte count.

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Directories ──────────────────────────────────────────────────────────────

/** Current document directory, always with a trailing slash. Read live. */
export function docDir(): string {
  const d = FileSystem.documentDirectory ?? '';
  if (!d) return '';
  return d.endsWith('/') ? d : `${d}/`;
}

/** Current cache directory, always with a trailing slash. */
export function cacheDir(): string {
  const d = FileSystem.cacheDirectory ?? '';
  if (!d) return '';
  return d.endsWith('/') ? d : `${d}/`;
}

// ─── Known app-relative roots ─────────────────────────────────────────────────
//
// Every directory we ever write into, relative to documentDirectory. When a
// stored path contains one of these we can rebuild it exactly, with no guessing
// about how deep the container prefix went. This is what makes an Expo Go path
// (…/host.exp.exponent/files/ExperienceData/%40user%2Fapp/deepdive_podcasts/…)
// resolvable inside a standalone build.

export const APP_ROOTS = [
  'deepdive_podcasts/',
  'deepdive_voice_debates/',
  'deepdive_cache/',
  'slide_images/',
] as const;

/** Container boundaries, most specific first. Both platforms. */
const CONTAINER_MARKERS = [
  // Expo Go
  '/files/ExperienceData/',              // Android, Expo Go
  '/Documents/ExponentExperienceData/',  // iOS, Expo Go
  // Standalone
  '/Documents/',                         // iOS
  '/files/',                             // Android
  '/Library/',                           // iOS caches
  '/cache/',                             // Android caches
];

const EXPO_GO_MARKERS = new Set([
  '/files/ExperienceData/',
  '/Documents/ExponentExperienceData/',
]);

// ─── Predicates ───────────────────────────────────────────────────────────────

export function isRemoteUrl(path: string | null | undefined): boolean {
  return !!path && (path.startsWith('http://') || path.startsWith('https://'));
}

export function isLocalPath(path: string | null | undefined): boolean {
  return !!path && !isRemoteUrl(path);
}

export function hasScheme(path: string): boolean {
  return path.startsWith('file://');
}

/** Remove the file:// scheme. */
export function stripScheme(path: string): string {
  return path.startsWith('file://') ? path.slice('file://'.length) : path;
}

/** Add the file:// scheme to an absolute path. */
export function addScheme(path: string): string {
  if (!path || isRemoteUrl(path) || hasScheme(path)) return path;
  return path.startsWith('/') ? `file://${path}` : path;
}

/** Last path component. */
export function baseName(path: string): string {
  const clean = path.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] ?? '';
}

/** Directory portion, with trailing slash. */
export function dirName(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

/** Filesystem-safe id (same rule the cache dirs have always used). */
export function safeId(id: string, max = 60): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, max);
}

// ─── Android alias normalisation ──────────────────────────────────────────────
//
// /data/user/0/<pkg>/... and /data/data/<pkg>/... are the same directory.
// A path stored in one form may need probing in the other.

function androidAliases(path: string): string[] {
  if (Platform.OS !== 'android') return [];
  const out: string[] = [];
  const bare = stripScheme(path);

  const userMatch = bare.match(/^\/data\/user\/\d+\/(.+)$/);
  if (userMatch) out.push(`/data/data/${userMatch[1]}`);

  const dataMatch = bare.match(/^\/data\/data\/(.+)$/);
  if (dataMatch) out.push(`/data/user/0/${dataMatch[1]}`);

  return out;
}

// ─── Portable <-> absolute ────────────────────────────────────────────────────

/**
 * Convert an absolute path under documentDirectory into an app-relative
 * ("portable") path. Returns null for remote URLs or paths we can't place.
 *
 *   file:///data/user/0/host.exp.exponent/files/ExperienceData/%40a%2Fb/deepdive_podcasts/p1/turn_0.mp3
 *     → deepdive_podcasts/p1/turn_0.mp3
 *   file:///var/mobile/Containers/Data/Application/ABC/Documents/deepdive_cache/audio/p1/segment_0.mp3
 *     → deepdive_cache/audio/p1/segment_0.mp3
 */
export function toPortable(absolute: string | null | undefined): string | null {
  if (!absolute || isRemoteUrl(absolute)) return null;

  const path = stripScheme(absolute);

  // Preferred: anchor on a directory we know we created. Platform-agnostic.
  for (const root of APP_ROOTS) {
    const idx = path.lastIndexOf(root);
    if (idx !== -1) return path.slice(idx);
  }

  // Fallback: anchor on the container boundary.
  for (const marker of CONTAINER_MARKERS) {
    const idx = path.lastIndexOf(marker);
    if (idx === -1) continue;

    let tail = path.slice(idx + marker.length);
    if (!tail) continue;

    // Under Expo Go the tail still begins with the encoded experience segment
    // ("%40user%2Fapp/..."), which does not exist in a standalone build.
    if (EXPO_GO_MARKERS.has(marker)) {
      const slash = tail.indexOf('/');
      if (slash === -1) continue;
      tail = tail.slice(slash + 1);
      if (!tail) continue;
    }

    return tail;
  }

  // Already relative?
  if (!path.startsWith('/')) return path;

  return null;
}

/** Build an absolute path under the CURRENT document directory. */
export function fromPortable(portable: string | null | undefined): string {
  if (!portable) return '';
  if (isRemoteUrl(portable)) return portable;
  const rel = portable.startsWith('/') ? portable.slice(1) : portable;
  return `${docDir()}${rel}`;
}

/**
 * Repair a possibly-stale absolute path by re-pointing it at the current
 * document directory. The single most important function in Part 59.2 — it is
 * what makes audio generated by a previous install (or by Expo Go) readable
 * from a preview/production build.
 */
export function rebase(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (isRemoteUrl(stored)) return stored;
  const portable = toPortable(stored);
  if (!portable) return null;
  return fromPortable(portable);
}

/**
 * Every plausible on-disk location for a stored path, in priority order,
 * de-duplicated: as given, rebased, both scheme variants, Android aliases.
 */
export function pathCandidates(stored: string | null | undefined): string[] {
  if (!stored || isRemoteUrl(stored)) return [];

  const out: string[] = [];
  const push = (p: string | null | undefined) => {
    if (!p || isRemoteUrl(p)) return;
    if (!out.includes(p)) out.push(p);
  };

  const seeds = [stored, rebase(stored)].filter(Boolean) as string[];

  for (const seed of seeds) {
    push(seed);
    push(addScheme(seed));
    push(stripScheme(seed));
    for (const alias of androidAliases(seed)) {
      push(alias);
      push(addScheme(alias));
    }
  }

  return out;
}

// ─── Safe filesystem probes ───────────────────────────────────────────────────

export interface FileProbe {
  exists:      boolean;
  size:        number;   // 0 when the platform didn't report one
  isDirectory: boolean;
}

const EMPTY_PROBE: FileProbe = { exists: false, size: 0, isDirectory: false };

/**
 * getInfoAsync that never throws and never lies about size.
 *
 * When the platform omits `size` it is reported as 0 WITHOUT clearing `exists`.
 * Callers must test `exists` and treat size purely as an accounting number.
 *
 * No options object is passed: SDK 57's legacy typings define InfoOptions
 * without a `size` field (it is returned for files by default), and passing
 * `{ size: true }` is a compile error.
 */
export async function probe(path: string | null | undefined): Promise<FileProbe> {
  if (!path || isRemoteUrl(path)) return EMPTY_PROBE;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info?.exists) return EMPTY_PROBE;
    const anyInfo = info as unknown as { size?: number; isDirectory?: boolean };
    return {
      exists:      true,
      size:        typeof anyInfo.size === 'number' ? anyInfo.size : 0,
      isDirectory: anyInfo.isDirectory === true,
    };
  } catch {
    return EMPTY_PROBE;
  }
}

/**
 * Does this path point at a readable FILE? Tries scheme variants, because a
 * bare /data/... path is rejected by some Android release builds.
 *
 * Note what is deliberately absent: a `size > 0` requirement. That check is
 * what turned an undefined size into a phantom missing file.
 */
export async function fileExists(path: string | null | undefined): Promise<boolean> {
  if (!path || isRemoteUrl(path)) return false;

  const direct = await probe(path);
  if (direct.exists) return !direct.isDirectory;

  const alt = hasScheme(path) ? stripScheme(path) : addScheme(path);
  if (alt !== path) {
    const altInfo = await probe(alt);
    if (altInfo.exists) return !altInfo.isDirectory;
  }

  return false;
}

/** Byte size, or 0 if missing/unknown. Never throws. */
export async function fileSize(path: string | null | undefined): Promise<number> {
  if (!path || isRemoteUrl(path)) return 0;
  const direct = await probe(path);
  if (direct.exists) return direct.size;
  const alt = hasScheme(path) ? stripScheme(path) : addScheme(path);
  if (alt !== path) {
    const altInfo = await probe(alt);
    if (altInfo.exists) return altInfo.size;
  }
  return 0;
}

/** Sum the sizes of many files, skipping anything missing. */
export async function totalSize(paths: (string | null | undefined)[]): Promise<number> {
  const results = await Promise.allSettled(paths.filter(Boolean).map(p => fileSize(p)));
  let total = 0;
  for (const r of results) if (r.status === 'fulfilled') total += r.value;
  return total;
}

/** First candidate that actually exists on disk. */
export async function firstExisting(
  candidates: (string | null | undefined)[],
): Promise<string | null> {
  for (const c of candidates) {
    if (!c) continue;
    if (await fileExists(c)) return c;
  }
  return null;
}

/** Resolve a single stored path (as-is, rebased, scheme + alias variants). */
export async function resolveStoredPath(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (isRemoteUrl(stored)) return stored;
  return firstExisting(pathCandidates(stored));
}

// ─── Directory helpers ────────────────────────────────────────────────────────

/** mkdir -p that never throws. Returns true if the directory exists after. */
export async function ensureDir(dir: string): Promise<boolean> {
  if (!dir) return false;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info?.exists) return true;
  } catch { /* fall through */ }
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return true;
  } catch {
    // Concurrent creation is a normal race here, not a failure.
    try {
      const info = await FileSystem.getInfoAsync(dir);
      return info?.exists === true;
    } catch {
      return false;
    }
  }
}

/** rm -f that never throws. */
export async function deleteQuietly(path: string | null | undefined): Promise<void> {
  if (!path || isRemoteUrl(path)) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch { /* non-fatal */ }
}

/** List a directory, returning [] on any error. */
export async function listDir(dir: string): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info?.exists) return [];
    return await FileSystem.readDirectoryAsync(dir);
  } catch {
    return [];
  }
}

// ─── Copy / download ──────────────────────────────────────────────────────────

export interface TransferResult {
  ok:        boolean;
  sizeBytes: number;
  error?:    string;
}

/**
 * Copy a local file. Resolves the source through the full candidate list first
 * (the step that rescues a stale Expo Go / old-container path), creates the
 * destination directory, and removes a partial destination on failure.
 */
export async function copyFile(from: string, to: string): Promise<TransferResult> {
  try {
    const src = await resolveStoredPath(from);
    if (!src) return { ok: false, sizeBytes: 0, error: 'Source file not found' };

    await ensureDir(dirName(to));

    try {
      await FileSystem.copyAsync({ from: src, to });
    } catch (err) {
      // Android release builds sometimes reject one scheme form. Retry the other.
      const alt = hasScheme(src) ? stripScheme(src) : addScheme(src);
      if (alt === src) throw err;
      await FileSystem.copyAsync({ from: alt, to });
    }

    const info = await probe(to);
    if (!info.exists) return { ok: false, sizeBytes: 0, error: 'Copy produced no file' };
    return { ok: true, sizeBytes: info.size };
  } catch (err) {
    await deleteQuietly(to);
    return {
      ok:        false,
      sizeBytes: 0,
      error:     err instanceof Error ? err.message : 'Copy failed',
    };
  }
}

/** Download a remote file, deleting the partial file on a bad status. */
export async function downloadFile(url: string, to: string): Promise<TransferResult> {
  try {
    await ensureDir(dirName(to));

    const result = await FileSystem.downloadAsync(url, to);
    if (result.status !== 200) {
      await deleteQuietly(to);
      return { ok: false, sizeBytes: 0, error: `HTTP ${result.status}` };
    }

    const info = await probe(to);
    if (!info.exists) return { ok: false, sizeBytes: 0, error: 'Download produced no file' };
    return { ok: true, sizeBytes: info.size };
  } catch (err) {
    await deleteQuietly(to);
    return {
      ok:        false,
      sizeBytes: 0,
      error:     err instanceof Error ? err.message : 'Download failed',
    };
  }
}