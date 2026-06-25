// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Public Reports Theme System (runtime engine)
// Web adaptation of mobile app's theme engine using CSS custom properties
// ─────────────────────────────────────────────────────────────────────────────

import {
  THEME_DEFINITIONS,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getPalette,
  type ThemePalette,
  type ThemeMode,
} from './themes';

// Re-export theme metadata
export {
  THEME_DEFINITIONS,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getThemeDefinition,
  getPalette,
} from './themes';
export type { ThemePalette, ThemeMode, ThemeDefinition } from './themes';

// ─── CSS Custom Property Names ──────────────────────────────────────────────

export const CSS_VARS = {
  primary: '--theme-primary',
  primaryLight: '--theme-primary-light',
  primaryDark: '--theme-primary-dark',
  secondary: '--theme-secondary',
  accent: '--theme-accent',
  background: '--theme-background',
  backgroundCard: '--theme-background-card',
  backgroundElevated: '--theme-background-elevated',
  textPrimary: '--theme-text-primary',
  textSecondary: '--theme-text-secondary',
  textMuted: '--theme-text-muted',
  border: '--theme-border',
  borderFocus: '--theme-border-focus',
  success: '--theme-success',
  error: '--theme-error',
  warning: '--theme-warning',
  info: '--theme-info',
  pro: '--theme-pro',
  enterprise: '--theme-enterprise',
  notification: '--theme-notification',
  gradientPrimary1: '--theme-gradient-primary-1',
  gradientPrimary2: '--theme-gradient-primary-2',
  gradientSecondary1: '--theme-gradient-secondary-1',
  gradientSecondary2: '--theme-gradient-secondary-2',
  gradientDark1: '--theme-gradient-dark-1',
  gradientDark2: '--theme-gradient-dark-2',
  gradientCard1: '--theme-gradient-card-1',
  gradientCard2: '--theme-gradient-card-2',
  gradientSuccess1: '--theme-gradient-success-1',
  gradientSuccess2: '--theme-gradient-success-2',
  gradientPro1: '--theme-gradient-pro-1',
  gradientPro2: '--theme-gradient-pro-2',
} as const;

// ─── Mutable COLORS singleton (web version) ──────────────────────────────────

const seed = getPalette(DEFAULT_THEME_ID, DEFAULT_THEME_MODE);

export const COLORS: ThemePalette = {
  primary: seed.primary,
  primaryLight: seed.primaryLight,
  primaryDark: seed.primaryDark,
  secondary: seed.secondary,
  accent: seed.accent,
  background: seed.background,
  backgroundCard: seed.backgroundCard,
  backgroundElevated: seed.backgroundElevated,
  textPrimary: seed.textPrimary,
  textSecondary: seed.textSecondary,
  textMuted: seed.textMuted,
  border: seed.border,
  borderFocus: seed.borderFocus,
  success: seed.success,
  error: seed.error,
  warning: seed.warning,
  info: seed.info,
  pro: seed.pro,
  proGradient: seed.proGradient,
  enterprise: seed.enterprise,
  notification: seed.notification,
  gradientPrimary: seed.gradientPrimary,
  gradientSecondary: seed.gradientSecondary,
  gradientDark: seed.gradientDark,
  gradientCard: seed.gradientCard,
  gradientSuccess: seed.gradientSuccess,
  gradientPro: seed.gradientPro,
};

// ─── Active theme bookkeeping ─────────────────────────────────────────────────

let activeThemeId: string = DEFAULT_THEME_ID;
let activeThemeMode: ThemeMode = DEFAULT_THEME_MODE;

export function getActiveThemeId(): string { return activeThemeId; }
export function getActiveThemeMode(): ThemeMode { return activeThemeMode; }
export function isLightTheme(): boolean { return activeThemeMode === 'light'; }

// ─── Apply theme to DOM via CSS custom properties ────────────────────────────

function writePaletteToCSS(p: ThemePalette): void {
  const root = document.documentElement;
  root.style.setProperty(CSS_VARS.primary, p.primary);
  root.style.setProperty(CSS_VARS.primaryLight, p.primaryLight);
  root.style.setProperty(CSS_VARS.primaryDark, p.primaryDark);
  root.style.setProperty(CSS_VARS.secondary, p.secondary);
  root.style.setProperty(CSS_VARS.accent, p.accent);
  root.style.setProperty(CSS_VARS.background, p.background);
  root.style.setProperty(CSS_VARS.backgroundCard, p.backgroundCard);
  root.style.setProperty(CSS_VARS.backgroundElevated, p.backgroundElevated);
  root.style.setProperty(CSS_VARS.textPrimary, p.textPrimary);
  root.style.setProperty(CSS_VARS.textSecondary, p.textSecondary);
  root.style.setProperty(CSS_VARS.textMuted, p.textMuted);
  root.style.setProperty(CSS_VARS.border, p.border);
  root.style.setProperty(CSS_VARS.borderFocus, p.borderFocus);
  root.style.setProperty(CSS_VARS.success, p.success);
  root.style.setProperty(CSS_VARS.error, p.error);
  root.style.setProperty(CSS_VARS.warning, p.warning);
  root.style.setProperty(CSS_VARS.info, p.info);
  root.style.setProperty(CSS_VARS.pro, p.pro);
  root.style.setProperty(CSS_VARS.enterprise, p.enterprise);
  root.style.setProperty(CSS_VARS.notification, p.notification);
  root.style.setProperty(CSS_VARS.gradientPrimary1, p.gradientPrimary[0]);
  root.style.setProperty(CSS_VARS.gradientPrimary2, p.gradientPrimary[1]);
  root.style.setProperty(CSS_VARS.gradientSecondary1, p.gradientSecondary[0]);
  root.style.setProperty(CSS_VARS.gradientSecondary2, p.gradientSecondary[1]);
  root.style.setProperty(CSS_VARS.gradientDark1, p.gradientDark[0]);
  root.style.setProperty(CSS_VARS.gradientDark2, p.gradientDark[1]);
  root.style.setProperty(CSS_VARS.gradientCard1, p.gradientCard[0]);
  root.style.setProperty(CSS_VARS.gradientCard2, p.gradientCard[1]);
  root.style.setProperty(CSS_VARS.gradientSuccess1, p.gradientSuccess[0]);
  root.style.setProperty(CSS_VARS.gradientSuccess2, p.gradientSuccess[1]);
  root.style.setProperty(CSS_VARS.gradientPro1, p.gradientPro[0]);
  root.style.setProperty(CSS_VARS.gradientPro2, p.gradientPro[1]);
}

function writePaletteToObject(p: ThemePalette): void {
  COLORS.primary = p.primary;
  COLORS.primaryLight = p.primaryLight;
  COLORS.primaryDark = p.primaryDark;
  COLORS.secondary = p.secondary;
  COLORS.accent = p.accent;
  COLORS.background = p.background;
  COLORS.backgroundCard = p.backgroundCard;
  COLORS.backgroundElevated = p.backgroundElevated;
  COLORS.textPrimary = p.textPrimary;
  COLORS.textSecondary = p.textSecondary;
  COLORS.textMuted = p.textMuted;
  COLORS.border = p.border;
  COLORS.borderFocus = p.borderFocus;
  COLORS.success = p.success;
  COLORS.error = p.error;
  COLORS.warning = p.warning;
  COLORS.info = p.info;
  COLORS.pro = p.pro;
  COLORS.proGradient = p.proGradient;
  COLORS.enterprise = p.enterprise;
  COLORS.notification = p.notification;
  COLORS.gradientPrimary = p.gradientPrimary;
  COLORS.gradientSecondary = p.gradientSecondary;
  COLORS.gradientDark = p.gradientDark;
  COLORS.gradientCard = p.gradientCard;
  COLORS.gradientSuccess = p.gradientSuccess;
  COLORS.gradientPro = p.gradientPro;
}

/**
 * Apply a theme by id + mode. Updates both CSS custom properties and the
 * mutable COLORS object. Returns the palette that was applied.
 */
export function applyTheme(id: string, mode: ThemeMode): ThemePalette {
  const exists = THEME_DEFINITIONS.some(t => t.id === id);
  const safeId = exists ? id : DEFAULT_THEME_ID;
  const palette = getPalette(safeId, mode);
  
  if (typeof document !== 'undefined') {
    writePaletteToCSS(palette);
  }
  writePaletteToObject(palette);
  
  activeThemeId = safeId;
  activeThemeMode = mode;
  return palette;
}

// ─── Initialize theme on load ─────────────────────────────────────────────────

// This runs immediately when the module is imported.
// The actual theme will be applied from the stored preference in ThemeProvider.
// But we seed it with defaults so the initial render has correct colors.
export function initializeTheme(): void {
  applyTheme(DEFAULT_THEME_ID, DEFAULT_THEME_MODE);
}

// ─── Theme-aware gradient helpers ────────────────────────────────────────────

export function getGradientStyle(gradient: readonly [string, string]): string {
  return `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`;
}

export function getPrimaryGradient(): string {
  return getGradientStyle(COLORS.gradientPrimary);
}