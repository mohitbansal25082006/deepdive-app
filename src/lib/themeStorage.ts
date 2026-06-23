// src/lib/themeStorage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — Theme persistence
//
// Stores the user's chosen theme id + mode in AsyncStorage so the selection
// survives app restarts. Intentionally tiny and dependency-light: we read it
// once on startup (in ThemeProvider) and write on every change.
//
// `mode` can be 'light' | 'dark' | 'system'. When 'system' is chosen we follow
// the OS color scheme via Appearance and re-resolve on the fly; only the literal
// preference ('system') is persisted, not the resolved value.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE } from '../constants/themes';

export type ThemeModePreference = 'light' | 'dark' | 'system';

const KEY_ID   = 'deepdive.theme.id';
const KEY_MODE = 'deepdive.theme.mode';

export interface StoredThemePreference {
  themeId: string;
  mode:    ThemeModePreference;
}

const DEFAULT_PREF: StoredThemePreference = {
  themeId: DEFAULT_THEME_ID,
  mode:    DEFAULT_THEME_MODE, // 'dark'
};

export async function loadThemePreference(): Promise<StoredThemePreference> {
  try {
    const [id, mode] = await Promise.all([
      AsyncStorage.getItem(KEY_ID),
      AsyncStorage.getItem(KEY_MODE),
    ]);
    return {
      themeId: id ?? DEFAULT_PREF.themeId,
      mode:    (mode as ThemeModePreference) ?? DEFAULT_PREF.mode,
    };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

export async function saveThemePreference(pref: StoredThemePreference): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(KEY_ID, pref.themeId),
      AsyncStorage.setItem(KEY_MODE, pref.mode),
    ]);
  } catch {
    // Non-fatal — preference just won't persist this session.
  }
}