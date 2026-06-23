// src/constants/theme.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — App-wide Theme System (runtime engine)
//
// WHY THIS FILE LOOKS DIFFERENT NOW (but is 100% backward compatible)
//   Before Part 55, COLORS / SHADOWS were plain frozen-ish objects with a single
//   hardcoded dark palette. Every screen does:
//       import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '.../theme';
//   …and reads e.g. COLORS.primary inline. That is ~200 files. We must NOT edit
//   all of them.
//
//   THE TECHNIQUE (mutable singleton + forced re-render):
//     • COLORS and SHADOWS keep the SAME object reference for the whole app
//       lifetime. We never replace them — we only mutate their PROPERTIES.
//     • applyTheme(id, mode) overwrites every property on COLORS (and rebuilds
//       SHADOWS' shadowColor) in place from the chosen palette.
//     • Inline styles (the vast majority of the app) read COLORS.primary fresh
//       on every render, so once the ThemeProvider bumps a context value and
//       forces a re-render, the entire tree recolors instantly — with zero
//       per-screen edits.
//     • Module-level StyleSheet.create / style objects are evaluated once at
//       import and DON'T re-read COLORS. Those few spots are handled in Part 55B
//       (they are a small, enumerable set).
//
//   FONTS / SPACING / RADIUS are layout tokens, not colors. They are unchanged
//   and exported exactly as before.
//
//   NOTE: applyTheme is a pure data operation (no React). The ThemeProvider in
//   src/context/ThemeContext.tsx calls it and then forces the re-render. Calling
//   applyTheme at module load with the default palette guarantees COLORS is
//   fully populated before any screen imports it (so the very first paint — even
//   before the provider mounts — is correct).
// ─────────────────────────────────────────────────────────────────────────────

import {
  THEME_DEFINITIONS,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getPalette,
  type ThemePalette,
  type ThemeMode,
} from './themes';

// Re-export theme metadata so consumers can import everything from one place.
export {
  THEME_DEFINITIONS,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getThemeDefinition,
  getPalette,
} from './themes';
export type { ThemePalette, ThemeMode, ThemeDefinition } from './themes';

// ─── Mutable COLORS singleton ─────────────────────────────────────────────────
// Seeded from the default palette so it is fully populated at import time.
// `as const` is intentionally NOT used so the object stays writable; the type is
// the ThemePalette shape, identical to the original COLORS shape.

const seed = getPalette(DEFAULT_THEME_ID, DEFAULT_THEME_MODE);

export const COLORS: ThemePalette = {
  primary:       seed.primary,
  primaryLight:  seed.primaryLight,
  primaryDark:   seed.primaryDark,
  secondary:     seed.secondary,
  accent:        seed.accent,
  background:          seed.background,
  backgroundCard:      seed.backgroundCard,
  backgroundElevated:  seed.backgroundElevated,
  textPrimary:   seed.textPrimary,
  textSecondary: seed.textSecondary,
  textMuted:     seed.textMuted,
  border:        seed.border,
  borderFocus:   seed.borderFocus,
  success:       seed.success,
  error:         seed.error,
  warning:       seed.warning,
  info:          seed.info,
  pro:           seed.pro,
  proGradient:   seed.proGradient,
  enterprise:    seed.enterprise,
  notification:  seed.notification,
  gradientPrimary:   seed.gradientPrimary,
  gradientSecondary: seed.gradientSecondary,
  gradientDark:      seed.gradientDark,
  gradientCard:      seed.gradientCard,
  gradientSuccess:   seed.gradientSuccess,
  gradientPro:       seed.gradientPro,
};

// ─── FONTS (unchanged) ─────────────────────────────────────────────────────────

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 42,
  },
};

// ─── SPACING (unchanged) ───────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

// ─── RADIUS (unchanged) ────────────────────────────────────────────────────────

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

// ─── SHADOWS (mutable: shadowColor follows the brand primary) ──────────────────
// The numeric/offset values are constant; only shadowColor tracks the theme so
// elevation glows match the active accent. Properties are mutated in place by
// applyTheme so existing `...SHADOWS.medium` spreads keep working.

export const SHADOWS = {
  small: {
    shadowColor: seed.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  medium: {
    shadowColor: seed.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  large: {
    shadowColor: seed.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  pro: {
    shadowColor: seed.pro,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
};

// ─── Active-theme bookkeeping (read-only snapshot for consumers that want it) ──

let activeThemeId:   string    = DEFAULT_THEME_ID;
let activeThemeMode: ThemeMode = DEFAULT_THEME_MODE;

export function getActiveThemeId():   string    { return activeThemeId; }
export function getActiveThemeMode(): ThemeMode { return activeThemeMode; }

/** True when the active palette is a light variant — handy for StatusBar etc. */
export function isLightTheme(): boolean { return activeThemeMode === 'light'; }

// ─── The engine: mutate COLORS + SHADOWS in place from a palette ──────────────

function writePalette(p: ThemePalette): void {
  COLORS.primary       = p.primary;
  COLORS.primaryLight  = p.primaryLight;
  COLORS.primaryDark   = p.primaryDark;
  COLORS.secondary     = p.secondary;
  COLORS.accent        = p.accent;
  COLORS.background          = p.background;
  COLORS.backgroundCard      = p.backgroundCard;
  COLORS.backgroundElevated  = p.backgroundElevated;
  COLORS.textPrimary   = p.textPrimary;
  COLORS.textSecondary = p.textSecondary;
  COLORS.textMuted     = p.textMuted;
  COLORS.border        = p.border;
  COLORS.borderFocus   = p.borderFocus;
  COLORS.success       = p.success;
  COLORS.error         = p.error;
  COLORS.warning       = p.warning;
  COLORS.info          = p.info;
  COLORS.pro           = p.pro;
  COLORS.proGradient   = p.proGradient;
  COLORS.enterprise    = p.enterprise;
  COLORS.notification  = p.notification;
  COLORS.gradientPrimary   = p.gradientPrimary;
  COLORS.gradientSecondary = p.gradientSecondary;
  COLORS.gradientDark      = p.gradientDark;
  COLORS.gradientCard      = p.gradientCard;
  COLORS.gradientSuccess   = p.gradientSuccess;
  COLORS.gradientPro       = p.gradientPro;

  // Keep shadow glow aligned with the active accent.
  SHADOWS.small.shadowColor  = p.primary;
  SHADOWS.medium.shadowColor = p.primary;
  SHADOWS.large.shadowColor  = p.primary;
  SHADOWS.pro.shadowColor    = p.pro;
}

/**
 * Apply a theme by id + mode. Mutates the live COLORS/SHADOWS singletons in
 * place. Returns the palette that was applied. Does NOT trigger React re-renders
 * by itself — the ThemeProvider is responsible for that (it calls this then bumps
 * a context value). Safe to call before React mounts (used for the initial seed).
 */
export function applyTheme(id: string, mode: ThemeMode): ThemePalette {
  const exists = THEME_DEFINITIONS.some(t => t.id === id);
  const safeId = exists ? id : DEFAULT_THEME_ID;
  const palette = getPalette(safeId, mode);
  writePalette(palette);
  activeThemeId   = safeId;
  activeThemeMode = mode;
  return palette;
}