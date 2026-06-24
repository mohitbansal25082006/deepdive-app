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
// ── Part 55.1A FIX (Feature 1) ────────────────────────────────────────────────
//   Previously the "re-apply on change" effect compared nothing and relied purely
//   on React firing the effect. If a near-simultaneous re-render elsewhere (e.g.
//   refreshProfile() in the profile Edit flow) coalesced with a theme change, the
//   palette could end up applied to COLORS but the version-bump render could be
//   superseded, so the UI kept the old colors until the next paint — the
//   "change name, then theme won't apply" bug.
//
//   The fix makes applying IDEMPOTENT and SELF-RECONCILING:
//     • We track the last-applied signature (`<themeId>:<resolvedMode>`) in a ref.
//     • An effect runs on every relevant change; if the current signature differs
//       from the last applied one, it applies + bumps. Because it compares against
//       a ref (not React state), it always converges to the correct palette even
//       if an unrelated re-render interleaves — there is no "missed" apply.
//     • The dedicated setters still apply immediately for snappy UX, but the
//       reconciling effect is the safety net that guarantees correctness.
//
//   We deliberately NO LONGER key the navigation Stack by version in _layout
//   (see app/_layout.tsx) — that remount was what raced with refreshProfile().
//   The version bump + getter-based module styles are sufficient to recolor.
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

  // Part 55.1A: the signature of the palette currently written into COLORS.
  // Used to make applying idempotent + self-reconciling.
  const appliedSigRef = useRef<string>('');

  const bump = useCallback(() => setVersion(v => v + 1), []);

  // ── Apply the current (themeId, mode, systemScheme) to the live engine ──────
  const resolvedMode = resolveMode(mode, systemScheme);

  // Part 55.1A: idempotent apply — only mutates COLORS + bumps when the resolved
  // (id, mode) actually differs from what is already written. Safe to call as
  // often as we like; it converges to the correct palette.
  const applyIfNeeded = useCallback((id: string, m: ThemeMode) => {
    const sig = `${id}:${m}`;
    if (appliedSigRef.current === sig) return false;
    applyTheme(id, m);
    appliedSigRef.current = sig;
    bump();
    return true;
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
      applyIfNeeded(pref.themeId, resolveMode(pref.mode, sys));
      setIsReady(true);
    })();
  }, [applyIfNeeded]);

  // ── Follow the OS color scheme while 'system' is selected ───────────────────
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // ── Reconciling effect (Part 55.1A) ─────────────────────────────────────────
  // Runs on every relevant change. Because applyIfNeeded compares against a ref,
  // this ALWAYS converges to the correct palette even if an unrelated re-render
  // (e.g. refreshProfile()) interleaves with a theme change. There is no longer a
  // first-run skip guard: the signature check makes a redundant apply a no-op, so
  // the initial-load apply above will simply be recognised as already-applied.
  useEffect(() => {
    if (!isReady) return;
    applyIfNeeded(themeId, resolvedMode);
  }, [themeId, resolvedMode, isReady, applyIfNeeded]);

  // ── Public setters (apply immediately for snappy UX + persist) ──────────────
  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    // Apply right away so the change is instant; the reconciling effect will
    // recognise it as already-applied and not double-bump.
    applyIfNeeded(id, resolvedMode);
    saveThemePreference({ themeId: id, mode });
  }, [mode, resolvedMode, applyIfNeeded]);

  const setMode = useCallback((m: ThemeModePreference) => {
    setModeState(m);
    applyIfNeeded(themeId, resolveMode(m, systemScheme));
    saveThemePreference({ themeId, mode: m });
  }, [themeId, systemScheme, applyIfNeeded]);

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