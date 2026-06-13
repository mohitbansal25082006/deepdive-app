// src/lib/voiceDebatePlayback.ts
// Part 51 — Cross-device playable-URL resolver for shared voice debates.
//
// ROOT CAUSE (Feature 3): "A shares a voice debate, B can't play it."
//   The voice-debate audio segments live in the `podcast-audio` Storage bucket
//   (created PRIVATE in Part 15) under `voice_debates/{id}/turn_N.mp3`.
//   The shared row stores `audio_storage_urls` as *public* URLs
//   (.../object/public/podcast-audio/...). On a private bucket those public
//   URLs only resolve when a public-read policy is present — and even then
//   expo-av streaming can intermittently fail for non-owners (RLS / caching).
//
// FIX:
//   On the viewer's device we resolve a FRESH SIGNED URL for every segment
//   (valid for hours) via `createSignedUrls`. Signed URLs stream reliably for
//   ANY authenticated workspace member regardless of bucket privacy. We fall
//   back to whatever URL was stored if signing isn't possible for a segment.
//
// The §4 storage policy in schema_part51.sql grants authenticated members
// SELECT on `voice_debates/*`, which is exactly what `createSignedUrls`
// requires to mint signed URLs.

import { supabase } from './supabase';

const BUCKET        = 'podcast-audio';
const SIGN_EXPIRY_S = 60 * 60 * 6;   // 6 hours — plenty for one listening session

// ─── Extract the storage path from a stored URL ──────────────────────────────
// Public URL:  https://<ref>.supabase.co/storage/v1/object/public/podcast-audio/voice_debates/{id}/turn_N.mp3
// Signed URL:  https://<ref>.supabase.co/storage/v1/object/sign/podcast-audio/voice_debates/{id}/turn_N.mp3?token=...
// Bare path:   voice_debates/{id}/turn_N.mp3

function extractStoragePath(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('voice_debates/')) return url;

  const markers = [
    '/object/public/podcast-audio/',
    '/object/sign/podcast-audio/',
    '/podcast-audio/',
  ];
  for (const m of markers) {
    const i = url.indexOf(m);
    if (i !== -1) {
      const tail = url.slice(i + m.length).split('?')[0];
      if (tail.startsWith('voice_debates/')) return tail;
    }
  }
  return null;
}

export interface ResolvePlayableParams {
  /** URLs stored on the shared row (may be empty / partly null) */
  storedUrls?:    (string | null | undefined)[];
  /** Voice debate id — used to deterministically build storage paths */
  voiceDebateId?: string | null;
  /** Total number of turns — caps how many segment paths we build */
  totalTurns?:    number;
}

// ─── Resolve playable (signed where possible) URLs, index-aligned ─────────────

export async function resolveVoiceDebatePlayableUrls(
  params: ResolvePlayableParams,
): Promise<string[]> {
  const stored = (params.storedUrls ?? []).map(u => (u ?? '') as string);
  const total  = Math.max(stored.length, params.totalTurns ?? 0);
  if (total === 0) return [];

  // Per-index result starts as the stored URL (fallback)
  const result: string[] = [];
  for (let i = 0; i < total; i++) result.push(stored[i] ?? '');

  // Build a candidate storage path for each index
  const paths: (string | null)[] = [];
  for (let i = 0; i < total; i++) {
    const fromUrl = stored[i] ? extractStoragePath(stored[i]) : null;
    if (fromUrl) {
      paths.push(fromUrl);
    } else if (params.voiceDebateId) {
      paths.push(`voice_debates/${params.voiceDebateId}/turn_${i}.mp3`);
    } else {
      paths.push(null);
    }
  }

  // Collect signable paths (skip nulls) + remember their original index
  const signIndexes: number[] = [];
  const signPaths:   string[] = [];
  paths.forEach((p, i) => {
    if (p) { signIndexes.push(i); signPaths.push(p); }
  });

  if (signPaths.length === 0) return result;

  try {
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrls(signPaths, SIGN_EXPIRY_S);

    if (error || !data) {
      console.log('[voiceDebatePlayback] sign batch failed — using stored URLs:', error?.message);
      return result;
    }

    data.forEach((row, k) => {
      const idx = signIndexes[k];
      // createSignedUrls returns { error, path, signedUrl } per item
      if (row && !row.error && row.signedUrl) {
        result[idx] = row.signedUrl;
      }
      // else keep the stored fallback for that index
    });

    const signedCount = data.filter(r => r && !r.error && r.signedUrl).length;
    console.log(`[voiceDebatePlayback] ✅ resolved ${signedCount}/${signPaths.length} signed URLs`);
  } catch (err) {
    console.log('[voiceDebatePlayback] sign batch threw — using stored URLs:', err);
  }

  return result;
}

// ─── Convenience: does this shared voice debate actually have playable audio? ──

export function hasPlayableAudio(
  audioAllUploaded: boolean | undefined,
  audioStorageUrls: (string | null | undefined)[] | undefined,
): boolean {
  return (
    audioAllUploaded === true &&
    (audioStorageUrls?.filter(Boolean).length ?? 0) > 0
  );
}