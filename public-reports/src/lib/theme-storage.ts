// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Public Reports Theme Persistence
// Stores theme preference in localStorage (client) and cookies (server)
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE } from '../constants/themes';
import type { ThemeModePreference } from '../context/ThemeContext';

const STORAGE_KEY = 'deepdive-public-theme';

export interface StoredThemePreference {
  themeId: string;
  mode: ThemeModePreference;
}

const DEFAULT_PREF: StoredThemePreference = {
  themeId: DEFAULT_THEME_ID,
  mode: DEFAULT_THEME_MODE,
};

/**
 * Load theme preference from localStorage (client-side only)
 */
export function loadThemePreference(): StoredThemePreference {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREF };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREF };
    const parsed = JSON.parse(raw);
    return {
      themeId: parsed.themeId ?? DEFAULT_PREF.themeId,
      mode: parsed.mode ?? DEFAULT_PREF.mode,
    };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

/**
 * Save theme preference to localStorage (client-side only)
 */
export function saveThemePreference(pref: StoredThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Non-fatal — preference just won't persist this session.
  }
}

/**
 * Get the theme preference from cookies (server-side)
 * Used for SSR to avoid hydration mismatch
 */
export function getThemePreferenceFromCookies(cookieString?: string): StoredThemePreference {
  if (!cookieString) return { ...DEFAULT_PREF };

  try {
    const match = cookieString.match(new RegExp(`${STORAGE_KEY}=([^;]+)`));
    if (!match) return { ...DEFAULT_PREF };
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return {
      themeId: parsed.themeId ?? DEFAULT_PREF.themeId,
      mode: parsed.mode ?? DEFAULT_PREF.mode,
    };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

/**
 * Get the theme preference for server-side rendering
 * This is the same as loadThemePreference but works on the server
 */
export function getServerThemePreference(): StoredThemePreference {
  // On the server, we can't access localStorage, so return defaults
  // The client will hydrate with the correct preference
  return { ...DEFAULT_PREF };
}