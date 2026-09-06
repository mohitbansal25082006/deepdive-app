// src/lib/autoCacheMiddleware.ts
// Part 59.2 — portable paths, real disk sizes, static imports.
// Part 59.3 — audio always cached; manual caching no longer gated on autoCache.
//
// ─── THE autoCache GATE BUG ─────────────────────────────────────────────────
//
// Every function here opened with:
//
//     if (!(await isAutoCacheEnabled())) return;
//
// These functions are called from two very different places: the generation
// screens (automatic — the gate is correct) and the manual paths, meaning the
// selective-cache picker and "Cache Now" in the Cache Manager. The manual paths
// hit the same gate, so turning "Auto-Cache Content" off disabled the buttons
// whose only purpose is to cache things by hand. The picker would run, report
// "3 changes saved", and cache nothing — the most confusing possible failure,
// because it looked like it worked.
//
// Every entry point now takes `{ force }`. Automatic callers omit it and the
// gate applies. Manual callers pass force:true and the gate is skipped. The
// setting keeps its stated meaning — "cache new content automatically" — rather
// than quietly meaning "allow caching at all".
//
// ─── AUDIO IS NO LONGER OPTIONAL ────────────────────────────────────────────
//
// The cacheAudio / cacheVoiceDebate checks are gone. Caching a podcast caches
// the episode. Audio is awaited rather than fired-and-forgotten so the index
// carries a true size by the time the caller refreshes its stats — the old
// fire-and-forget is why the Cache Manager showed a 40 MB voice debate as
// 380 KB until you closed and reopened it.

import { isAutoCacheEnabled } from './cacheSettings';
import {
  cacheReport,
  cachePodcast,
  cacheDebate,
  cacheAcademicPaper,
  cachePresentation,
  cacheVoiceDebate,
  markAudioCached,
  getCacheIndex,
  getCachedItem,
  loadSettings,
} from './cacheStorage';

import {
  downloadPodcastAudio,
  getPodcastAudioDiskBytes,
  isPodcastAudioCached,
} from './podcastAudioCache';
import {
  downloadVoiceDebateAudio,
  getVoiceDebateAudioDiskBytes,
  isVoiceDebateAudioCached,
} from './voiceDebateAudioCache';
import { cacheVoiceDebateJson } from './voiceDebateCache';
import { cachePresentationAssets } from './presentationAssetCache';

import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
} from '../types';
import type { VoiceDebate } from '../types/voiceDebate';
import type {
  AudioReconcileResult,
  AudioReconcileProgress,
} from '../types/cache';

// ─── Shared options ───────────────────────────────────────────────────────────

export interface CacheOptions {
  /**
   * Skip the "Auto-Cache Content" gate.
   *
   * Pass true from anything the user initiated by tapping something. Omit it
   * from generation-completion hooks, where the gate is the whole point.
   */
  force?: boolean;
  /** Allow pulling audio from Supabase Storage. Pass false when offline. */
  allowRemote?: boolean;
}

async function shouldCache(options?: CacheOptions): Promise<boolean> {
  if (options?.force) return true;
  return isAutoCacheEnabled();
}

// ─── Report ───────────────────────────────────────────────────────────────────

export async function autoCacheReport(
  report:   ResearchReport,
  options?: CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;
    await cacheReport({
      ...report,
      title: report.title ?? report.query,
    } as unknown as { id: string; title: string });
  } catch (err) {
    console.warn('[AutoCache] report cache error:', err);
  }
}

// ─── Podcast ──────────────────────────────────────────────────────────────────

export async function autoCachePodcast(
  podcast:  Podcast,
  options?: CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;
    if (podcast.status !== 'completed') return;

    await cachePodcast(podcast as unknown as { id: string; title: string });

    // Part 59.3: no toggle, and awaited so the size is right immediately.
    await cachePodcastAudio(podcast, { allowRemote: options?.allowRemote });
  } catch (err) {
    console.warn('[AutoCache] podcast cache error:', err);
  }
}

/**
 * Cache a podcast's audio and record its true size.
 *
 * Exported because the offline viewer's Download button, the selective-cache
 * sheet and the reconciler all need exactly this. Duplicating it is how the
 * size accounting drifted apart in the first place.
 */
export async function cachePodcastAudio(
  podcast:  Podcast,
  options?: { allowRemote?: boolean },
): Promise<boolean> {
  try {
    if (await isPodcastAudioCached(podcast.id)) {
      const existing = await getPodcastAudioDiskBytes(podcast.id);
      if (existing > 0) await markAudioCached('podcast', podcast.id, existing);
      return true;
    }

    const settings = await loadSettings();
    const success  = await downloadPodcastAudio(podcast, undefined, {
      expiryDays:  settings.expiryDays,
      allowRemote: options?.allowRemote !== false,
    });

    if (!success) return false;

    const realBytes = await getPodcastAudioDiskBytes(podcast.id);
    if (realBytes > 0) {
      await markAudioCached('podcast', podcast.id, realBytes);
      console.log(
        `[AutoCache] Podcast audio cached for ${podcast.id} ` +
        `(${(realBytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
    return true;
  } catch (err) {
    console.warn('[AutoCache] podcast audio cache error:', err);
    return false;
  }
}

// ─── Debate ───────────────────────────────────────────────────────────────────

export async function autoCacheDebate(
  session:  DebateSession,
  options?: CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;
    if (session.status !== 'completed') return;
    await cacheDebate({
      ...session,
      topic: session.topic,
    } as unknown as { id: string; topic: string });
  } catch (err) {
    console.warn('[AutoCache] debate cache error:', err);
  }
}

// ─── Academic Paper ───────────────────────────────────────────────────────────

export async function autoCacheAcademicPaper(
  paper:    AcademicPaper,
  options?: CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;
    await cacheAcademicPaper(paper as unknown as { id: string; title: string });
  } catch (err) {
    console.warn('[AutoCache] academic paper cache error:', err);
  }
}

// ─── Presentation ─────────────────────────────────────────────────────────────

export async function autoCachePresentation(
  presentation: GeneratedPresentation,
  options?:     CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;

    let toCache: GeneratedPresentation = presentation;

    if (presentation.id) {
      try {
        const { supabase }        = await import('../lib/supabase');
        const { mergeEditorData } = await import('../services/slideEditorService');

        const { data, error } = await supabase
          .from('presentations')
          .select('editor_data, font_family')
          .eq('id', presentation.id)
          .single();

        if (!error && data) {
          // `editor_data` is a jsonb column: `any` at runtime, and neither
          // `unknown[]` nor an invented cast would be more truthful here.
          const editorDataArr: any[] = Array.isArray(data.editor_data) ? data.editor_data : [];
          const fontFamily: string = data.font_family ?? 'system';

          toCache = {
            ...presentation,
            slides: mergeEditorData(presentation.slides as any[], editorDataArr),
            fontFamily,
          } as GeneratedPresentation & { fontFamily?: string };
        }
      } catch (fetchErr) {
        // Degrade to the unmerged slides rather than skipping the cache.
        console.warn('[AutoCache] presentation editor_data fetch error:', fetchErr);
      }
    }

    await cachePresentation(toCache as unknown as { id: string; title: string });

    if (presentation.id) {
      void cachePresentationAssets(toCache).catch(err =>
        console.warn('[AutoCache] presentation asset download error:', err),
      );
    }
  } catch (err) {
    console.warn('[AutoCache] presentation cache error:', err);
  }
}

// ─── Voice Debate ─────────────────────────────────────────────────────────────

export async function autoCacheVoiceDebate(
  voiceDebate: VoiceDebate,
  options?:    CacheOptions,
): Promise<void> {
  try {
    if (!(await shouldCache(options))) return;
    if (voiceDebate.status !== 'completed') return;

    // 1. Index entry first, so markAudioCached has something to annotate.
    await cacheVoiceDebate(voiceDebate as unknown as { id: string; topic: string });

    // 2. Full JSON for the offline viewer.
    const settings = await loadSettings();
    await cacheVoiceDebateJson(voiceDebate, { expiryDays: settings.expiryDays });

    // 3. Audio — always, and awaited.
    await cacheVoiceDebateAudio(voiceDebate, { allowRemote: options?.allowRemote });
  } catch (err) {
    console.warn('[AutoCache] voice debate cache error:', err);
  }
}

/** Same shape as cachePodcastAudio, for voice debates. */
export async function cacheVoiceDebateAudio(
  voiceDebate: VoiceDebate,
  options?:    { allowRemote?: boolean },
): Promise<boolean> {
  try {
    if (await isVoiceDebateAudioCached(voiceDebate.id)) {
      const existing = await getVoiceDebateAudioDiskBytes(voiceDebate.id);
      if (existing > 0) await markAudioCached('voice_debate', voiceDebate.id, existing);
      return true;
    }

    const settings = await loadSettings();

    const success = await downloadVoiceDebateAudio(
      voiceDebate.id,
      voiceDebate.topic,
      voiceDebate.audioSegmentPaths ?? [],
      undefined,
      {
        expiryDays:  settings.expiryDays,
        allowRemote: options?.allowRemote !== false,
        cloudUrls:   voiceDebate.audioStorageUrls ?? [],
        turnCount:   voiceDebate.totalTurns,
      },
    );

    if (!success) return false;

    const realBytes = await getVoiceDebateAudioDiskBytes(voiceDebate.id);
    if (realBytes > 0) {
      await markAudioCached('voice_debate', voiceDebate.id, realBytes);
      console.log(
        `[AutoCache] Voice debate audio cached for ${voiceDebate.id} ` +
        `(${(realBytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
    return true;
  } catch (err) {
    console.warn('[AutoCache] voice debate audio cache error:', err);
    return false;
  }
}

// ─── Part 59.3: audio reconciliation ──────────────────────────────────────────

/**
 * Walk the cache index and make every podcast / voice debate's audio state
 * true on disk.
 *
 * WHY THIS EXISTS
 *
 *   Users upgrading into 59.3 have a cache full of items saved while the audio
 *   toggles were off: transcript-only entries with hasAudio:false and a size of
 *   a few hundred KB. Nothing would ever fix those on its own — the item is
 *   already "cached", so no code path revisits it. The Cache Manager would keep
 *   reporting 380 KB for a 40 MB episode, and the green "Audio cached" badge
 *   would keep not appearing, forever.
 *
 *   This sweep reads each entry's cached JSON — which is the Podcast /
 *   VoiceDebate object itself, so no network round-trip is needed to identify
 *   the audio — copies or downloads whatever is missing, and rewrites the size.
 *
 *   It is idempotent and cheap on a healthy cache: an entry whose audio is
 *   already present costs one directory read.
 *
 * Safe to call while offline. Segments that live only in the cloud stay
 * unresolved and are reported as such rather than throwing.
 */
export async function reconcileCachedAudio(
  onProgress?: (p: AudioReconcileProgress) => void,
  options?:    { allowRemote?: boolean },
): Promise<AudioReconcileResult> {

  const result: AudioReconcileResult = {
    scanned: 0, repaired: 0, resized: 0, unresolved: 0, bytesAdded: 0,
  };

  try {
    const entries = await getCacheIndex();
    const audioEntries = entries.filter(
      e => e.type === 'podcast' || e.type === 'voice_debate',
    );

    if (audioEntries.length === 0) return result;

    for (let i = 0; i < audioEntries.length; i++) {
      const entry = audioEntries[i];
      result.scanned += 1;

      onProgress?.({ done: i, total: audioEntries.length, title: entry.title });

      try {
        if (entry.type === 'podcast') {
          const alreadyOnDisk = await getPodcastAudioDiskBytes(entry.id);

          if (alreadyOnDisk > 0) {
            if (alreadyOnDisk !== (entry.audioSizeBytes ?? 0)) {
              result.bytesAdded += await markAudioCached('podcast', entry.id, alreadyOnDisk);
              result.resized += 1;
            }
            continue;
          }

          const podcast = await getCachedItem<Podcast>('podcast', entry.id);
          if (!podcast) { result.unresolved += 1; continue; }

          const ok = await cachePodcastAudio(podcast, {
            allowRemote: options?.allowRemote,
          });

          if (ok) {
            const bytes = await getPodcastAudioDiskBytes(entry.id);
            if (bytes > 0) {
              result.repaired += 1;
              result.bytesAdded += bytes - (entry.audioSizeBytes ?? 0);
            } else {
              result.unresolved += 1;
            }
          } else {
            result.unresolved += 1;
          }

        } else {
          const alreadyOnDisk = await getVoiceDebateAudioDiskBytes(entry.id);

          if (alreadyOnDisk > 0) {
            if (alreadyOnDisk !== (entry.audioSizeBytes ?? 0)) {
              result.bytesAdded += await markAudioCached('voice_debate', entry.id, alreadyOnDisk);
              result.resized += 1;
            }
            continue;
          }

          const vd = await getCachedItem<VoiceDebate>('voice_debate', entry.id);
          if (!vd) { result.unresolved += 1; continue; }

          const ok = await cacheVoiceDebateAudio(vd, {
            allowRemote: options?.allowRemote,
          });

          if (ok) {
            const bytes = await getVoiceDebateAudioDiskBytes(entry.id);
            if (bytes > 0) {
              result.repaired += 1;
              result.bytesAdded += bytes - (entry.audioSizeBytes ?? 0);
            } else {
              result.unresolved += 1;
            }
          } else {
            result.unresolved += 1;
          }
        }
      } catch (err) {
        console.warn(`[AutoCache] reconcile error for ${entry.type}:${entry.id}`, err);
        result.unresolved += 1;
      }
    }

    onProgress?.({
      done:  audioEntries.length,
      total: audioEntries.length,
      title: '',
    });

    if (result.repaired > 0 || result.resized > 0) {
      console.log(
        `[AutoCache] Audio reconcile: ${result.repaired} repaired, ` +
        `${result.resized} resized, ${result.unresolved} unresolved ` +
        `(${(result.bytesAdded / 1024 / 1024).toFixed(1)} MB accounted)`,
      );
    }
  } catch (err) {
    console.warn('[AutoCache] reconcileCachedAudio error:', err);
  }

  return result;
}