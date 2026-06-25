// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Public Reports Theme Provider
// Web adaptation of mobile app's ThemeContext
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { applyTheme } from '../constants/theme';
import {
  loadThemePreference,
  saveThemePreference,
  getServerThemePreference,
  type StoredThemePreference,
} from '../lib/theme-storage';
import { DEFAULT_THEME_ID, type ThemeMode } from '../constants/themes';

export type ThemeModePreference = 'light' | 'dark' | 'system';

// ─── Resolve a preference ('light'|'dark'|'system') → effective ThemeMode ────

function resolveMode(pref: ThemeModePreference, systemIsDark: boolean): ThemeMode {
  if (pref === 'system') return systemIsDark ? 'dark' : 'light';
  return pref as ThemeMode;
}

// ─── Context shape ─────────────────────────────────────────────────────────────

interface ThemeContextValue {
  themeId: string;
  mode: ThemeModePreference;
  resolvedMode: ThemeMode;
  isLight: boolean;
  version: number;
  isReady: boolean;
  setThemeId: (id: string) => void;
  setMode: (mode: ThemeModePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  mode: 'light',
  resolvedMode: 'light',
  isLight: true,
  version: 0,
  isReady: false,
  setThemeId: () => {},
  setMode: () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [mode, setModeState] = useState<ThemeModePreference>('light');
  const [isSystemDark, setIsSystemDark] = useState<boolean>(false);
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const appliedSigRef = useRef<string>('');

  const bump = useCallback(() => setVersion(v => v + 1), []);

  const resolvedMode = resolveMode(mode, isSystemDark);

  // ── Idempotent apply ──────────────────────────────────────────────────────────
  const applyIfNeeded = useCallback((id: string, m: ThemeMode) => {
    const sig = `${id}:${m}`;
    if (appliedSigRef.current === sig) return false;
    applyTheme(id, m);
    appliedSigRef.current = sig;
    bump();
    return true;
  }, [bump]);

  // ── Initial load ──────────────────────────────────────────────────────────────
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Check system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsSystemDark(isDark);

    const pref = loadThemePreference();
    setThemeIdState(pref.themeId);
    setModeState(pref.mode);
    applyIfNeeded(pref.themeId, resolveMode(pref.mode, isDark));
    setIsReady(true);
  }, [applyIfNeeded]);

  // ── Follow system preference changes ─────────────────────────────────────────
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setIsSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // ── Reconciling effect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    applyIfNeeded(themeId, resolvedMode);
  }, [themeId, resolvedMode, isReady, applyIfNeeded]);

  // ── Public setters ────────────────────────────────────────────────────────────
  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    applyIfNeeded(id, resolvedMode);
    saveThemePreference({ themeId: id, mode });
  }, [mode, resolvedMode, applyIfNeeded]);

  const setMode = useCallback((m: ThemeModePreference) => {
    setModeState(m);
    const resolved = resolveMode(m, isSystemDark);
    applyIfNeeded(themeId, resolved);
    saveThemePreference({ themeId, mode: m });
  }, [themeId, isSystemDark, applyIfNeeded]);

  const value: ThemeContextValue = {
    themeId,
    mode,
    resolvedMode,
    isLight: resolvedMode === 'light',
    version,
    isReady,
    setThemeId,
    setMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}