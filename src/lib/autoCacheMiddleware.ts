// src/lib/autoCacheMiddleware.ts
// Part 45 FIX 2 — Voice debate audio size fix:
//
// ROOT CAUSE of voice debate not showing audio size:
//   _downloadVoiceDebateAudioAsync imported getVoiceDebateAudioEntry from
//   voiceDebateAudioCache — but that function does NOT exist in the original
//   Part 41.2 file (it was only a patch instruction that may not have been applied).
//   When the import resolves to undefined, the call throws silently and
//   markVoiceDebateAudioCached is never called with real bytes.
//
// FIX:
//   Removed the dependency on getVoiceDebateAudioEntry entirely.
//   Instead, after downloadVoiceDebateAudio succeeds, we sum the actual
//   .mp3 file sizes on disk using getLocalVoiceDebateAudioPaths +
//   FileSystem.getInfoAsync. This uses only functions that ARE exported
//   from voiceDebateAudioCache.ts (Part 41.2) with zero new dependencies.
//
// All other fixes (static imports, real podcast size via getPodcastAudioEntry)
// are preserved unchanged from the previous version.

import { isAutoCacheEnabled } from './cacheSettings';
import {
  cacheReport,
  cachePodcast,
  cacheDebate,
  cacheAcademicPaper,
  cachePresentation,
  cacheVoiceDebate,
  markPodcastAudioCached,
  markVoiceDebateAudioCached,
  loadSettings,
} from './cacheStorage';
import * as FileSystem from 'expo-file-system/legacy';

// Static imports — no dynamic await import() to prevent Hermes crashes
import { downloadPodcastAudio, getPodcastAudioEntry } from './podcastAudioCache';
import {
  downloadVoiceDebateAudio,
  isVoiceDebateAudioCached,
  getLocalVoiceDebateAudioPaths,  // FIX: use this instead of getVoiceDebateAudioEntry
} from './voiceDebateAudioCache';
import { cacheVoiceDebateJson }  from './voiceDebateCache';

import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
} from '../types';
import type { VoiceDebate } from '../types/voiceDebate';

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
    const settings = await loadSettings();
    const success  = await downloadPodcastAudio(podcast, undefined, settings.expiryDays);
    if (success) {
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

export async function autoCachePresentation(
  presentation: GeneratedPresentation,
): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;

    let presentationToCache: GeneratedPresentation = presentation;

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
      }
    }

    await cachePresentation(presentationToCache as any);

    if (presentation.id) {
      _cacheAssetsAsync(presentationToCache);
    }
  } catch (err) {
    console.warn('[AutoCache] presentation cache error:', err);
  }
}

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

// ─── Voice Debate ─────────────────────────────────────────────────────────────

export async function autoCacheVoiceDebate(voiceDebate: VoiceDebate): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    if (voiceDebate.status !== 'completed') return;

    // 1. Store in main cacheStorage index FIRST so the entry exists
    //    before markVoiceDebateAudioCached is called below
    await cacheVoiceDebate(voiceDebate as any);

    // 2. Cache full JSON via voiceDebateCache (for OfflineVoiceDebateViewer)
    const settings = await loadSettings();
    await cacheVoiceDebateJson(voiceDebate, { expiryDays: settings.expiryDays });

    // 3. Download audio if setting is ON — awaited so the index is accurate
    //    when the caller refreshes the cache stats
    if (settings.cacheVoiceDebate) {
      await _downloadVoiceDebateAudioAsync(voiceDebate);
    }
  } catch (err) {
    console.warn('[AutoCache] voice debate cache error:', err);
  }
}

async function _downloadVoiceDebateAudioAsync(voiceDebate: VoiceDebate): Promise<void> {
  try {
    const alreadyCached = await isVoiceDebateAudioCached(voiceDebate.id);
    if (alreadyCached) return;

    // Build source paths: prefer local file paths, fall back to cloud URLs
    const audioPaths = (voiceDebate.audioSegmentPaths ?? []).map((local, i) => {
      if (local && !local.startsWith('http')) return local;
      const cloud = (voiceDebate.audioStorageUrls as any)?.[i] ?? null;
      return cloud ?? local;
    }).filter(Boolean) as string[];

    if (audioPaths.length === 0) return;

    const settings = await loadSettings();

    console.log(`[AutoCache] 💾  Downloading voice debate audio: ${audioPaths.length} turns`);
    const success = await downloadVoiceDebateAudio(
      voiceDebate.id,
      voiceDebate.topic,
      audioPaths,
      undefined,
      settings.expiryDays,
    );

    if (success) {
      // Sum real .mp3 file sizes from disk and update the cache index entry
      const localPaths = await getLocalVoiceDebateAudioPaths(voiceDebate.id);
      let realAudioBytes = 0;
      if (localPaths && localPaths.length > 0) {
        const sizeChecks = await Promise.allSettled(
          localPaths
            .filter(p => Boolean(p))
            .map(p => FileSystem.getInfoAsync(p))
        );
        for (const check of sizeChecks) {
          if (check.status === 'fulfilled' && check.value.exists) {
            realAudioBytes += (check.value as any).size ?? 0;
          }
        }
      }
      // Fallback: estimate from turn count if filesystem read failed
      if (realAudioBytes === 0 && audioPaths.length > 0) {
        realAudioBytes = audioPaths.length * 400_000;
      }
      await markVoiceDebateAudioCached(voiceDebate.id, realAudioBytes);
      console.log(
        `[AutoCache] ✅  Voice debate audio cached for ${voiceDebate.id}` +
        ` (${(realAudioBytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
  } catch (err) {
    console.warn('[AutoCache] voice debate audio download error:', err);
  }
}