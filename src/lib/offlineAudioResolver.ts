// src/lib/offlineAudioResolver.ts
// Part 59.2 — NEW. One place that answers "where is turn N's audio, really?"
//
// Before this file, four different modules each had their own idea of where a
// segment lived, and every one of them started by trusting the absolute path
// stored in Postgres. When that path went stale (see filePaths.ts) they all
// failed in different ways: the engine skipped to the next turn, the cache said
// "0 segments copied", the MP3 export said "audio not downloaded", and the
// voice-debate viewer fell back to transcript-only. Four symptoms, one cause.
//
// SEARCH ORDER — cheapest and most offline-safe first:
//
//   1. Offline cache      deepdive_cache/audio/<id>/segment_N.mp3
//                         deepdive_voice_debate_cache/<id>/turn_N.mp3
//   2. Generation dir     deepdive_podcasts/<id>/turn_N.{mp3,wav}
//                         deepdive_voice_debates/<id>/turn_N.mp3
//      — rebuilt against the CURRENT documentDirectory, so it survives an app
//        update, a reinstall, and the Expo Go → standalone move.
//   3. Stored path        as written to the DB, plus every rebased / scheme /
//                         Android-alias variant of it.
//   4. Cloud URL          audio_storage_urls[N]. Requires network, so it is
//                         only offered when the caller allows it.
//
// Steps 1–3 need no network at all. That is the whole point: "Download Audio"
// while offline is a local COPY from the generation directory into the cache
// directory, and it now works in a release build because step 2 no longer
// depends on a path that a previous install happened to produce.

import {
  docDir,
  safeId,
  fileExists,
  firstExisting,
  pathCandidates,
  isRemoteUrl,
} from './filePaths';

// ─── Directory layout (must match the TTS services + cache modules) ──────────

export function podcastGenerationDir(podcastId: string): string {
  return `${docDir()}deepdive_podcasts/${podcastId}/`;
}

export function podcastCacheDir(podcastId: string): string {
  return `${docDir()}deepdive_cache/audio/${safeId(podcastId)}/`;
}

export function voiceDebateGenerationDir(voiceDebateId: string): string {
  return `${docDir()}deepdive_voice_debates/${voiceDebateId}/`;
}

export function voiceDebateCacheDir(voiceDebateId: string): string {
  return `${docDir()}deepdive_voice_debate_cache/${safeId(voiceDebateId)}/`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioSourceKind = 'cache' | 'generation' | 'stored' | 'cloud' | 'none';

export interface ResolvedSegment {
  index:  number;
  /** Playable/readable path or URL. Empty string when nothing was found. */
  uri:    string;
  kind:   AudioSourceKind;
  /** True when using this segment requires an internet connection. */
  remote: boolean;
}

export interface ResolveOptions {
  /** Include cloud URLs in the search. Pass false when offline. */
  allowRemote?: boolean;
  /** Skip the offline cache (used by the cache writer itself). */
  skipCache?:   boolean;
}

// ─── Candidate builders ───────────────────────────────────────────────────────

function podcastCandidates(podcastId: string, index: number): string[] {
  const cache = podcastCacheDir(podcastId);
  const gen   = podcastGenerationDir(podcastId);
  return [
    `${cache}segment_${index}.mp3`,
    `${cache}segment_${index}.wav`,
    `${gen}turn_${index}.mp3`,
    `${gen}turn_${index}.wav`,
  ];
}

function voiceDebateCandidates(voiceDebateId: string, index: number): string[] {
  const cache = voiceDebateCacheDir(voiceDebateId);
  const gen   = voiceDebateGenerationDir(voiceDebateId);
  return [
    `${cache}turn_${index}.mp3`,
    `${gen}turn_${index}.mp3`,
  ];
}

// ─── Core resolver ────────────────────────────────────────────────────────────

async function resolveOne(
  index:        number,
  cacheGuesses: string[],
  genGuesses:   string[],
  stored:       string | null | undefined,
  cloud:        string | null | undefined,
  opts:         ResolveOptions,
): Promise<ResolvedSegment> {

  // 1. Offline cache
  if (!opts.skipCache) {
    const hit = await firstExisting(cacheGuesses);
    if (hit) return { index, uri: hit, kind: 'cache', remote: false };
  }

  // 2. Generation directory, rebuilt against today's documentDirectory
  const genHit = await firstExisting(genGuesses);
  if (genHit) return { index, uri: genHit, kind: 'generation', remote: false };

  // 3. Whatever the DB stored, in every variant we know how to try
  if (stored && !isRemoteUrl(stored)) {
    const storedHit = await firstExisting(pathCandidates(stored));
    if (storedHit) return { index, uri: storedHit, kind: 'stored', remote: false };
  }

  // 4. Cloud — network required, so only when the caller allows it
  if (opts.allowRemote !== false) {
    if (stored && isRemoteUrl(stored)) {
      return { index, uri: stored, kind: 'cloud', remote: true };
    }
    if (cloud && isRemoteUrl(cloud)) {
      return { index, uri: cloud, kind: 'cloud', remote: true };
    }
  }

  return { index, uri: '', kind: 'none', remote: false };
}

// ─── Public API: podcasts ─────────────────────────────────────────────────────

export interface PodcastAudioRefs {
  id:          string;
  storedPaths: (string | null | undefined)[];
  cloudUrls?:  (string | null | undefined)[];
  /** Falls back to storedPaths.length when omitted. */
  turnCount?:  number;
}

export async function resolvePodcastSegment(
  refs:  PodcastAudioRefs,
  index: number,
  opts:  ResolveOptions = {},
): Promise<ResolvedSegment> {
  return resolveOne(
    index,
    opts.skipCache ? [] : podcastCandidates(refs.id, index).slice(0, 2),
    podcastCandidates(refs.id, index).slice(2),
    refs.storedPaths?.[index],
    refs.cloudUrls?.[index],
    opts,
  );
}

export async function resolvePodcastAudio(
  refs: PodcastAudioRefs,
  opts: ResolveOptions = {},
): Promise<ResolvedSegment[]> {
  const total = Math.max(refs.turnCount ?? 0, refs.storedPaths?.length ?? 0);
  if (total === 0) return [];

  const out: ResolvedSegment[] = [];
  for (let i = 0; i < total; i++) {
    out.push(await resolvePodcastSegment(refs, i, opts));
  }
  return out;
}

// ─── Public API: voice debates ────────────────────────────────────────────────

export interface VoiceDebateAudioRefs {
  id:          string;
  storedPaths: (string | null | undefined)[];
  cloudUrls?:  (string | null | undefined)[];
  turnCount?:  number;
}

export async function resolveVoiceDebateSegment(
  refs:  VoiceDebateAudioRefs,
  index: number,
  opts:  ResolveOptions = {},
): Promise<ResolvedSegment> {
  const all = voiceDebateCandidates(refs.id, index);
  return resolveOne(
    index,
    opts.skipCache ? [] : all.slice(0, 1),
    all.slice(1),
    refs.storedPaths?.[index],
    refs.cloudUrls?.[index],
    opts,
  );
}

export async function resolveVoiceDebateAudio(
  refs: VoiceDebateAudioRefs,
  opts: ResolveOptions = {},
): Promise<ResolvedSegment[]> {
  const total = Math.max(refs.turnCount ?? 0, refs.storedPaths?.length ?? 0);
  if (total === 0) return [];

  const out: ResolvedSegment[] = [];
  for (let i = 0; i < total; i++) {
    out.push(await resolveVoiceDebateSegment(refs, i, opts));
  }
  return out;
}

// ─── Availability summary ─────────────────────────────────────────────────────

export interface AudioAvailability {
  total:        number;
  /** Segments playable with no internet at all. */
  localCount:   number;
  /** Segments that would stream from the cloud. */
  remoteCount:  number;
  missingCount: number;
  /** True when enough segments exist locally to be worth playing (≥50%). */
  playableOffline: boolean;
  /** True when a local-only copy into the cache can succeed right now. */
  downloadableOffline: boolean;
}

const MIN_RATE = 0.5;

export function summarize(segments: ResolvedSegment[]): AudioAvailability {
  const total  = segments.length;
  const local  = segments.filter(s => s.uri && !s.remote).length;
  const remote = segments.filter(s => s.remote).length;

  return {
    total,
    localCount:   local,
    remoteCount:  remote,
    missingCount: total - local - remote,
    playableOffline:     total > 0 && local / total >= MIN_RATE,
    downloadableOffline: total > 0 && local / total >= MIN_RATE,
  };
}

/** Convenience: are enough segments on this device to play with no network? */
export async function podcastHasLocalAudio(refs: PodcastAudioRefs): Promise<boolean> {
  const segs = await resolvePodcastAudio(refs, { allowRemote: false });
  return summarize(segs).playableOffline;
}

export async function voiceDebateHasLocalAudio(refs: VoiceDebateAudioRefs): Promise<boolean> {
  const segs = await resolveVoiceDebateAudio(refs, { allowRemote: false });
  return summarize(segs).playableOffline;
}

/** Does this exact path exist right now? Thin re-export for call sites. */
export { fileExists };