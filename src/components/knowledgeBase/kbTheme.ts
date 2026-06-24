// src/components/knowledgeBase/kbTheme.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 55.1 — Knowledge Base theme helpers
//
// The KB feature originally hardcoded a lot of hex colours: surface gradients
// like ['#1A1235','#0F0F22'], avatar gradients like ['#7C3AED','#6C63FF'], the
// multi-hue GRADIENTS / SESSION_GRADIENTS palettes, and per-chunk-type accent
// colours. None of those recoloured on a theme switch, and several looked broken
// on the light variants (dark surfaces baked into white themes).
//
// This module centralises every theme-derived colour the KB needs. Everything is
// computed from the LIVE COLORS singleton at call time, so each call site (which
// also subscribes to useTheme()) recolours instantly when the palette changes.
//
// No worklets here — these are plain strings/tuples consumed by LinearGradient
// and inline styles, never captured by a Reanimated UI worklet.
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS } from '../../constants/theme';

// ─── hexWithAlpha ──────────────────────────────────────────────────────────────
// '#6C63FF', 0.13 → 'rgba(108,99,255,0.13)'. Accepts 3/6-digit hex. If a non-hex
// value sneaks in (already-rgba, named colour) it is returned unchanged so we
// never crash a render.
export function hexWithAlpha(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── KB brand gradient ─────────────────────────────────────────────────────────
// Used for the library icon orbs / AI avatars (previously hardcoded
// ['#7C3AED','#6C63FF']). Now follows the active primary gradient.
export function kbBrandGradient(): readonly [string, string] {
  return COLORS.gradientPrimary;
}

// ─── KB surface gradient ───────────────────────────────────────────────────────
// Used for hero / empty-state cards (previously hardcoded ['#1A1235','#0F0F22']).
// Now uses the theme's card gradient so it is correct on both dark and light.
export function kbSurfaceGradient(): readonly [string, string] {
  return COLORS.gradientCard;
}

// ─── Multi-hue palette ─────────────────────────────────────────────────────────
// Source report chips and session cards previously cycled through a fixed array
// of 7–8 hardcoded gradient pairs. We rebuild an equivalently varied palette from
// the live theme so the variety survives but every hue is theme-derived.
//
// We seed from the palette's distinct accent roles, then derive a few blends so
// adjacent cards still look different. Each entry is a [from, to] tuple.
export function kbGradientPalette(): readonly [string, string][] {
  const c = COLORS;
  return [
    [c.primary,      c.primaryLight],
    [c.secondary,    c.accent],
    [c.success,      c.info],
    [c.info,         c.primary],
    [c.accent,       c.success],
    [c.warning,      c.secondary],
    [c.primaryLight, c.secondary],
    [c.primaryDark,  c.primary],
  ] as const;
}

// Pick a stable gradient for an index (wraps around the palette).
export function kbGradientForIndex(i: number): readonly [string, string] {
  const palette = kbGradientPalette();
  return palette[((i % palette.length) + palette.length) % palette.length];
}

// ─── Chunk-type accent colours ─────────────────────────────────────────────────
// Maps a retrieved-chunk type to a { icon, color } using live theme colours
// (previously each colour was a hardcoded hex inside the component).
export function kbChunkTypeStyle(type: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    summary:    { icon: 'document-text-outline', color: COLORS.primary },
    section:    { icon: 'list-outline',          color: COLORS.info },
    finding:    { icon: 'bulb-outline',          color: COLORS.success },
    prediction: { icon: 'telescope-outline',     color: COLORS.warning },
    statistic:  { icon: 'bar-chart-outline',     color: COLORS.secondary },
    citation:   { icon: 'link-outline',          color: COLORS.primaryLight },
  };
  return map[type] ?? { icon: 'document-outline', color: COLORS.textMuted };
}

// ─── Suggested-query gradients ─────────────────────────────────────────────────
// KB_SUGGESTED_QUERIES used to carry a hardcoded gradient per item. We now resolve
// the gradient at render from the live palette by the query's index, so the
// suggestion cards recolour with the theme. The query data itself (label, query,
// icon) stays static — only the colour is derived here.
export function kbSuggestedGradient(index: number): readonly [string, string] {
  return kbGradientForIndex(index);
}