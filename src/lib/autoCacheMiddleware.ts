// src/lib/autoCacheMiddleware.ts
// Part 23 — Updated.
//
// CHANGES from Part 22:
//   • autoCachePodcast() — if settings.cacheAudio is true, also downloads
//     audio segments after caching the JSON data.
//   • Uses markPodcastAudioCached() to update the cache entry size.
//   • All other functions unchanged.

import { isAutoCacheEnabled } from './cacheSettings';
import {
  cacheReport,
  cachePodcast,
  cacheDebate,
  cacheAcademicPaper,
  cachePresentation,
  markPodcastAudioCached,
} from './cacheStorage';
import { loadSettings } from './cacheStorage';
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

    // Always cache the JSON data (script + metadata)
    await cachePodcast(podcast as any);

    // Part 23: optionally also download audio segments
    const settings = await loadSettings();
    if (settings.cacheAudio) {
      // Fire async — don't block the completion callback
      _downloadAudioAsync(podcast);
    }
  } catch (err) {
    console.warn('[AutoCache] podcast cache error:', err);
  }
}

/**
 * Internal: download audio for a podcast in the background.
 * Never throws — failures are silently swallowed.
 */
async function _downloadAudioAsync(podcast: Podcast): Promise<void> {
  try {
    const { downloadPodcastAudio } = await import('./podcastAudioCache');
    const settings = await loadSettings();
    const success  = await downloadPodcastAudio(podcast, undefined, settings.expiryDays);
    if (success) {
      // Get total bytes downloaded and update the cache entry
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

export async function autoCachePresentation(presentation: GeneratedPresentation): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cachePresentation(presentation as any);
  } catch (err) {
    console.warn('[AutoCache] presentation cache error:', err);
  }
}