// src/context/ThemeContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — Theme provider (the bridge between the mutable COLORS engine and React)
//
// RESPONSIBILITIES
//   1. On mount, load the saved preference (theme id + light/dark/system).
//   2. Resolve 'system' → the live OS color scheme (Appearance), and keep
//      following it while 'system' is selected.
//   3. Call applyTheme(id, resolvedMode) which mutates the live COLORS/SHADOWS
//      singletons in place.
//   4. Bump a `version` counter so the ENTIRE component tree re-renders and
//      every inline `COLORS.x` read picks up the new palette — no per-screen
//      edits required.
//   5. Persist the user's choice.
//
// WHY A `version` COUNTER FORCES THE RECOLOR
//   Inline styles read COLORS.primary fresh on each render but React doesn't know
//   the mutable object changed. The provider re-renders its subtree only when its
//   own state changes — so we keep a `version` number in state, bump it on every
//   theme change, and expose it through context. Because the provider sits at the
//   root (above the navigation stack), bumping it re-renders the whole app once,
//   and every screen re-reads the freshly-mutated COLORS.
//
//   We also key the provider's children <View> with `version` (in _layout, Part
//   55B) as a belt-and-suspenders remount for any memoized subtree that wouldn't
//   otherwise re-render. The counter alone is sufficient for the inline-style
//   majority; the keyed remount additionally refreshes module-level styles after
//   they're patched in 55B.
//
// PUBLIC API (useTheme):
//   themeId        current theme id ('cosmic' | 'ocean' | …)
//   mode           the literal preference ('light' | 'dark' | 'system')
//   resolvedMode   the effective mode actually applied ('light' | 'dark')
//   isLight        convenience boolean
//   version        re-render token (changes on every theme change)
//   setThemeId     pick a different color theme
//   setMode        pick light / dark / system
//   isReady        true once the saved preference has loaded
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { applyTheme } from '../constants/theme';
import {
  loadThemePreference,
  saveThemePreference,
  type ThemeModePreference,
} from '../lib/themeStorage';
import { DEFAULT_THEME_ID, type ThemeMode } from '../constants/themes';

// ─── Resolve a preference ('light'|'dark'|'system') → effective ThemeMode ─────

function resolveMode(pref: ThemeModePreference, system: ColorSchemeName): ThemeMode {
  if (pref === 'system') return system === 'light' ? 'light' : 'dark';
  return pref;
}

// ─── Context shape ─────────────────────────────────────────────────────────────

interface ThemeContextValue {
  themeId:      string;
  mode:         ThemeModePreference;
  resolvedMode: ThemeMode;
  isLight:      boolean;
  version:      number;
  isReady:      boolean;
  setThemeId:   (id: string) => void;
  setMode:      (mode: ThemeModePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId:      DEFAULT_THEME_ID,
  mode:         'dark',
  resolvedMode: 'dark',
  isLight:      false,
  version:      0,
  isReady:      false,
  setThemeId:   () => {},
  setMode:      () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [mode,    setModeState]    = useState<ThemeModePreference>('dark');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const bump = useCallback(() => setVersion(v => v + 1), []);

  // ── Apply the current (themeId, mode, systemScheme) to the live engine ──────
  // Whenever any of these change, mutate COLORS in place and force a re-render.
  const resolvedMode = resolveMode(mode, systemScheme);

  const applyAndBump = useCallback((id: string, m: ThemeMode) => {
    applyTheme(id, m);
    bump();
  }, [bump]);

  // ── Initial load of the saved preference ────────────────────────────────────
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const pref = await loadThemePreference();
      const sys  = Appearance.getColorScheme();
      setSystemScheme(sys);
      setThemeIdState(pref.themeId);
      setModeState(pref.mode);
      applyAndBump(pref.themeId, resolveMode(pref.mode, sys));
      setIsReady(true);
    })();
  }, [applyAndBump]);

  // ── Follow the OS color scheme while 'system' is selected ───────────────────
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // ── Re-apply whenever the resolved (id, mode) actually changes ──────────────
  // (Skips the very first run because the initial load already applied once.)
  const firstApply = useRef(true);
  useEffect(() => {
    if (!isReady) return;
    if (firstApply.current) { firstApply.current = false; return; }
    applyAndBump(themeId, resolvedMode);
  }, [themeId, resolvedMode, isReady, applyAndBump]);

  // ── Public setters (persist + apply) ────────────────────────────────────────
  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    saveThemePreference({ themeId: id, mode });
  }, [mode]);

  const setMode = useCallback((m: ThemeModePreference) => {
    setModeState(m);
    saveThemePreference({ themeId, mode: m });
  }, [themeId]);

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
  return useContext(ThemeContext);
}