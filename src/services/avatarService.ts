// src/services/avatarService.ts
// Part 11 — Free avatar generation using DiceBear API (no key required).
// Docs: https://www.dicebear.com/how-to-use/http-api/
// Format: PNG so React Native Image renders without SVG library.

import { supabase } from '../lib/supabase';
import { AvatarStyle, AvatarStyleOption, AvatarOption } from '../types';

// ─── Style catalogue ──────────────────────────────────────────────────────────

export const AVATAR_STYLES: AvatarStyleOption[] = [
  { id: 'avataaars',  label: 'Cartoon',  emoji: '😊' },
  { id: 'pixel-art',  label: 'Pixel',    emoji: '🕹️' },
  { id: 'lorelei',    label: 'Lorelei',  emoji: '🎨' },
  { id: 'bottts',     label: 'Robot',    emoji: '🤖' },
  { id: 'micah',      label: 'Minimal',  emoji: '✨' },
  { id: 'adventurer', label: 'Explorer', emoji: '🗺️' },
  { id: 'fun-emoji',  label: 'Emoji',    emoji: '🎉' },
  { id: 'shapes',     label: 'Abstract', emoji: '🔷' },
];

const DICEBEAR_BASE = 'https://api.dicebear.com/7.x';

// ─── URL builder ──────────────────────────────────────────────────────────────

/**
 * Returns a DiceBear PNG URL for a given style and seed.
 * size=128 gives a crisp 128×128 PNG.
 */
export function getAvatarUrl(style: AvatarStyle, seed: string): string {
  const s = encodeURIComponent(seed.trim() || 'default');
  return `${DICEBEAR_BASE}/${style}/png?seed=${s}&size=128&radius=50`;
}

// ─── Generate a set of avatar options ────────────────────────────────────────

/**
 * Generates 12 avatar options for the given style.
 * Uses the base seed (e.g. username) combined with a suffix for variety.
 */
export function generateAvatarOptions(
  style: AvatarStyle,
  baseSeed: string,
  count = 12,
): AvatarOption[] {
  const suffixes = [
    '', '-a', '-b', '-c', '-d', '-e',
    '-1', '-2', '-3', '-4', '-5', '-6',
  ];
  return suffixes.slice(0, count).map((suffix) => {
    const seed = `${baseSeed}${suffix}`;
    return { url: getAvatarUrl(style, seed), style, seed };
  });
}

/**
 * Generates a single random avatar for a style using a UUID-like seed.
 */
export function randomAvatarOption(style: AvatarStyle): AvatarOption {
  const seed = Math.random().toString(36).slice(2, 10);
  return { url: getAvatarUrl(style, seed), style, seed };
}

// ─── Supabase profile save ────────────────────────────────────────────────────

/**
 * Persists the selected avatar URL to the current user's profile.
 * Returns true on success, error string on failure.
 */
export async function saveAvatarToProfile(
  avatarUrl: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save avatar',
    };
  }
}

/**
 * Returns the DiceBear style key embedded in a URL,
 * or null if the URL is not from DiceBear.
 */
export function detectStyleFromUrl(url: string | null | undefined): AvatarStyle | null {
  if (!url || !url.includes('dicebear.com')) return null;
  for (const s of AVATAR_STYLES) {
    if (url.includes(`/${s.id}/`)) return s.id;
  }
  return null;
}