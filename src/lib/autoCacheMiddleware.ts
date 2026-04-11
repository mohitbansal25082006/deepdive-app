// src/lib/autoCacheMiddleware.ts
// Part 41.7 — Two fixes:
//
// FIX 1 (from earlier Part 41.7 session):
//   autoCachePresentation() fetches editor_data + font_family from Supabase
//   and merges them via mergeEditorData() before storing to cache, so the
//   offline viewer shows the fully-edited version.
//
// FIX 2 (this session — offline export):
//   After the merged JSON is stored, fire-and-forget
//   cachePresentationAssets() which downloads every remote image (onlineUrl)
//   and Iconify SVG referenced by overlay blocks. Saves a manifest file so
//   OfflinePresentationViewer can patch local paths before export, making
//   PPTX / PDF / HTML export work 100% offline without network fallback.
//
// All other functions (report, podcast, debate, paper) are byte-for-byte
// identical to Part 23.

import { isAutoCacheEnabled } from './cacheSettings';
import {
  cacheReport,
  cachePodcast,
  cacheDebate,
  cacheAcademicPaper,
  cachePresentation,
  markPodcastAudioCached,
  loadSettings,
} from './cacheStorage';
import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
} from '../types';

// ─── Report ───────────────────────────────────────────────────────────────────

export async function autoCacheReport(report: ResearchReport): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cacheReport({
      ...report,
      title: report.title ?? report.query,
    } as any);
  } catch (err) {
    console.warn('[AutoCache] report cache error:', err);
  }
}

// ─── Podcast ──────────────────────────────────────────────────────────────────

export async function autoCachePodcast(podcast: Podcast): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    if (podcast.status !== 'completed') return;

    await cachePodcast(podcast as any);

    const settings = await loadSettings();
    if (settings.cacheAudio) {
      _downloadAudioAsync(podcast);
    }
  } catch (err) {
    console.warn('[AutoCache] podcast cache error:', err);
  }
}

async function _downloadAudioAsync(podcast: Podcast): Promise<void> {
  try {
    const { downloadPodcastAudio } = await import('./podcastAudioCache');
    const settings = await loadSettings();
    const success  = await downloadPodcastAudio(podcast, undefined, settings.expiryDays);
    if (success) {
      const { getPodcastAudioEntry } = await import('./podcastAudioCache');
      const audioEntry = await getPodcastAudioEntry(podcast.id);
      if (audioEntry) {
        await markPodcastAudioCached(podcast.id, audioEntry.totalBytes);
      }
    }
  } catch (err) {
    console.warn('[AutoCache] podcast audio download error:', err);
  }
}

// ─── Debate ───────────────────────────────────────────────────────────────────

export async function autoCacheDebate(session: DebateSession): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    if (session.status !== 'completed') return;
    await cacheDebate({
      ...session,
      topic: session.topic,
    } as any);
  } catch (err) {
    console.warn('[AutoCache] debate cache error:', err);
  }
}

// ─── Academic Paper ───────────────────────────────────────────────────────────

export async function autoCacheAcademicPaper(paper: AcademicPaper): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cacheAcademicPaper(paper as any);
  } catch (err) {
    console.warn('[AutoCache] academic paper cache error:', err);
  }
}

// ─── Presentation ─────────────────────────────────────────────────────────────
//
// Part 41.7 FIX 1: Fetch editor_data + font_family from DB and merge slides.
// Part 41.7 FIX 2: Fire-and-forget asset download (images + SVGs) for offline export.

export async function autoCachePresentation(
  presentation: GeneratedPresentation,
): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;

    let presentationToCache: GeneratedPresentation = presentation;

    // FIX 1: Merge editor_data from DB before caching
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
          const editorDataArr: any[] = Array.isArray(data.editor_data)
            ? data.editor_data
            : [];
          const fontFamily: string = data.font_family ?? 'system';

          const mergedSlides = mergeEditorData(
            presentation.slides as any[],
            editorDataArr,
          );

          presentationToCache = {
            ...presentation,
            slides:     mergedSlides,
            fontFamily,
          } as GeneratedPresentation & { fontFamily?: string };
        }
      } catch (fetchErr) {
        console.warn('[AutoCache] presentation editor_data fetch error:', fetchErr);
        // Fall through — cache unmerged as safe fallback
      }
    }

    // Store the (merged) presentation JSON
    await cachePresentation(presentationToCache as any);

    // FIX 2: Download remote images + SVGs in the background
    // Fire-and-forget — never blocks or throws to the caller
    if (presentation.id) {
      _cacheAssetsAsync(presentationToCache);
    }
  } catch (err) {
    console.warn('[AutoCache] presentation cache error:', err);
  }
}

/**
 * Background asset downloader — called fire-and-forget from autoCachePresentation.
 * Downloads every remote image and Iconify SVG referenced by overlay blocks
 * and saves a local manifest so offline export can swap in local paths.
 */
async function _cacheAssetsAsync(
  presentation: GeneratedPresentation,
): Promise<void> {
  try {
    const { cachePresentationAssets } = await import('./presentationAssetCache');
    await cachePresentationAssets(presentation);
  } catch (err) {
    console.warn('[AutoCache] presentation asset download error:', err);
  }
}