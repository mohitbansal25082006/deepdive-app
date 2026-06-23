// src/constants/themes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — App-wide Theme System (definitions)
//
// WHAT THIS FILE IS
//   The single source of truth for every selectable theme. Each theme provides
//   a COMPLETE palette (light + dark variant) whose keys are byte-for-byte the
//   same as the original COLORS object in theme.ts. Because the keys match, the
//   live mutable COLORS object (see theme.ts) can be repopulated from any of
//   these palettes at runtime and every screen recolors automatically — no
//   per-screen edits.
//
// HOW THE PALETTE SHAPE STAYS COMPATIBLE
//   The original COLORS object exposed:
//     primary, primaryLight, primaryDark, secondary, accent,
//     background, backgroundCard, backgroundElevated,
//     textPrimary, textSecondary, textMuted,
//     border, borderFocus,
//     success, error, warning, info,
//     pro, proGradient, enterprise, notification,
//     gradientPrimary, gradientSecondary, gradientDark, gradientCard,
//     gradientSuccess, gradientPro
//   Every palette below provides ALL of these. The `as const` gradient tuples
//   are preserved so `colors={COLORS.gradientPrimary}` keeps its readonly tuple
//   type that expo-linear-gradient expects.
//
// ADDING A NEW THEME
//   1. Add an entry to THEME_DEFINITIONS with a unique id.
//   2. Provide a `dark` and a `light` ThemePalette.
//   3. It appears in the picker automatically.
//
// IMPORTANT: this file holds DATA only. The runtime engine that swaps these
// palettes into the live COLORS object lives in theme.ts (so existing
// `import { COLORS } from '.../theme'` keeps working everywhere).
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';

// ─── Palette shape (matches the original COLORS exactly) ──────────────────────

export interface ThemePalette {
  // brand
  primary:       string;
  primaryLight:  string;
  primaryDark:   string;
  secondary:     string;
  accent:        string;

  // surfaces
  background:          string;
  backgroundCard:      string;
  backgroundElevated:  string;

  // text
  textPrimary:   string;
  textSecondary: string;
  textMuted:     string;

  // lines
  border:        string;
  borderFocus:   string;

  // status
  success:       string;
  error:         string;
  warning:       string;
  info:          string;

  // extras (Part 3)
  pro:           string;
  proGradient:   readonly [string, string];
  enterprise:    string;
  notification:  string;

  // gradients
  gradientPrimary:   readonly [string, string];
  gradientSecondary: readonly [string, string];
  gradientDark:      readonly [string, string];
  gradientCard:      readonly [string, string];
  gradientSuccess:   readonly [string, string];
  gradientPro:       readonly [string, string];
}

export type ThemeMode = 'light' | 'dark';

export interface ThemeDefinition {
  id:          string;
  name:        string;
  description: string;
  /** Icon shown in the picker (Ionicons glyph). */
  icon:        keyof typeof Ionicons.glyphMap;
  /** A representative accent used for the picker swatch (taken from dark variant). */
  swatch:      string;
  dark:        ThemePalette;
  light:       ThemePalette;
}

// ─── Shared status colors that read well on dark surfaces ─────────────────────
const DARK_STATUS = {
  success: '#43E97B',
  error:   '#FF4757',
  warning: '#FFA726',
  info:    '#29B6F6',
};

// Slightly deepened status colors so they keep enough contrast on white.
const LIGHT_STATUS = {
  success: '#16A34A',
  error:   '#DC2626',
  warning: '#D97706',
  info:    '#0284C7',
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 1 — Cosmic Indigo  (the original DeepDive look = default)
// ═════════════════════════════════════════════════════════════════════════════

const cosmicDark: ThemePalette = {
  primary:       '#6C63FF',
  primaryLight:  '#8B85FF',
  primaryDark:   '#4A42CC',
  secondary:     '#FF6584',
  accent:        '#43E97B',
  background:          '#0A0A1A',
  backgroundCard:      '#12122A',
  backgroundElevated:  '#1A1A35',
  textPrimary:   '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted:     '#5A5A7A',
  border:        '#2A2A4A',
  borderFocus:   '#6C63FF',
  ...DARK_STATUS,
  pro:           '#FFD700',
  proGradient:   ['#FFD700', '#FFA500'] as const,
  enterprise:    '#E8D5FF',
  notification:  '#FF6B6B',
  gradientPrimary:   ['#6C63FF', '#8B5CF6'] as const,
  gradientSecondary: ['#FF6584', '#FF8E53'] as const,
  gradientDark:      ['#0A0A1A', '#12122A'] as const,
  gradientCard:      ['#1A1A35', '#12122A'] as const,
  gradientSuccess:   ['#43E97B', '#38F9D7'] as const,
  gradientPro:       ['#FFD700', '#FF8C00'] as const,
};

const cosmicLight: ThemePalette = {
  primary:       '#5B52E0',
  primaryLight:  '#7B73F0',
  primaryDark:   '#3F37B5',
  secondary:     '#E84B6A',
  accent:        '#1DBF73',
  background:          '#F5F6FB',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#EEF0F8',
  textPrimary:   '#15162B',
  textSecondary: '#4A4D68',
  textMuted:     '#8A8DA6',
  border:        '#E1E3F0',
  borderFocus:   '#5B52E0',
  ...LIGHT_STATUS,
  pro:           '#C99700',
  proGradient:   ['#E0B400', '#D98A00'] as const,
  enterprise:    '#7C5BD0',
  notification:  '#E84B5A',
  gradientPrimary:   ['#5B52E0', '#7C5BD0'] as const,
  gradientSecondary: ['#E84B6A', '#F07A52'] as const,
  gradientDark:      ['#F5F6FB', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#EEF0F8'] as const,
  gradientSuccess:   ['#1DBF73', '#16B89C'] as const,
  gradientPro:       ['#E0B400', '#D97700'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 2 — Ocean Teal
// ═════════════════════════════════════════════════════════════════════════════

const oceanDark: ThemePalette = {
  primary:       '#2DD4BF',
  primaryLight:  '#5EEAD4',
  primaryDark:   '#0F9E8E',
  secondary:     '#38BDF8',
  accent:        '#34D399',
  background:          '#06141A',
  backgroundCard:      '#0C2128',
  backgroundElevated:  '#123038',
  textPrimary:   '#F0FDFA',
  textSecondary: '#93B7BC',
  textMuted:     '#4F6E72',
  border:        '#1C3A42',
  borderFocus:   '#2DD4BF',
  ...DARK_STATUS,
  info:          '#38BDF8',
  pro:           '#FFD700',
  proGradient:   ['#FBBF24', '#F59E0B'] as const,
  enterprise:    '#A7F3D0',
  notification:  '#FB7185',
  gradientPrimary:   ['#2DD4BF', '#0EA5E9'] as const,
  gradientSecondary: ['#38BDF8', '#22D3EE'] as const,
  gradientDark:      ['#06141A', '#0C2128'] as const,
  gradientCard:      ['#123038', '#0C2128'] as const,
  gradientSuccess:   ['#34D399', '#2DD4BF'] as const,
  gradientPro:       ['#FBBF24', '#F59E0B'] as const,
};

const oceanLight: ThemePalette = {
  primary:       '#0D9488',
  primaryLight:  '#14B8A6',
  primaryDark:   '#0A6E66',
  secondary:     '#0284C7',
  accent:        '#059669',
  background:          '#F0FBFA',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#E2F4F1',
  textPrimary:   '#082F2A',
  textSecondary: '#3D5C58',
  textMuted:     '#7FA39E',
  border:        '#CDE8E3',
  borderFocus:   '#0D9488',
  ...LIGHT_STATUS,
  pro:           '#B7791F',
  proGradient:   ['#D69E2E', '#C05621'] as const,
  enterprise:    '#0F766E',
  notification:  '#E11D48',
  gradientPrimary:   ['#0D9488', '#0284C7'] as const,
  gradientSecondary: ['#0284C7', '#0891B2'] as const,
  gradientDark:      ['#F0FBFA', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#E2F4F1'] as const,
  gradientSuccess:   ['#059669', '#0D9488'] as const,
  gradientPro:       ['#D69E2E', '#C05621'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 3 — Sunset Coral
// ═════════════════════════════════════════════════════════════════════════════

const sunsetDark: ThemePalette = {
  primary:       '#FB7185',
  primaryLight:  '#FDA4AF',
  primaryDark:   '#E11D48',
  secondary:     '#FB923C',
  accent:        '#FBBF24',
  background:          '#190B12',
  backgroundCard:      '#26121C',
  backgroundElevated:  '#341926',
  textPrimary:   '#FFF1F2',
  textSecondary: '#D8A8B2',
  textMuted:     '#8C5A68',
  border:        '#43222F',
  borderFocus:   '#FB7185',
  ...DARK_STATUS,
  success: '#34D399',
  pro:           '#FFD700',
  proGradient:   ['#FBBF24', '#F97316'] as const,
  enterprise:    '#FECDD3',
  notification:  '#FB7185',
  gradientPrimary:   ['#FB7185', '#F43F5E'] as const,
  gradientSecondary: ['#FB923C', '#F97316'] as const,
  gradientDark:      ['#190B12', '#26121C'] as const,
  gradientCard:      ['#341926', '#26121C'] as const,
  gradientSuccess:   ['#34D399', '#10B981'] as const,
  gradientPro:       ['#FBBF24', '#F97316'] as const,
};

const sunsetLight: ThemePalette = {
  primary:       '#E11D48',
  primaryLight:  '#F43F5E',
  primaryDark:   '#9F1239',
  secondary:     '#EA580C',
  accent:        '#D97706',
  background:          '#FFF7F8',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#FCE8EC',
  textPrimary:   '#3B0A18',
  textSecondary: '#6B3340',
  textMuted:     '#B07984',
  border:        '#F6D5DC',
  borderFocus:   '#E11D48',
  ...LIGHT_STATUS,
  pro:           '#B45309',
  proGradient:   ['#D97706', '#EA580C'] as const,
  enterprise:    '#BE123C',
  notification:  '#E11D48',
  gradientPrimary:   ['#E11D48', '#F43F5E'] as const,
  gradientSecondary: ['#EA580C', '#F97316'] as const,
  gradientDark:      ['#FFF7F8', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#FCE8EC'] as const,
  gradientSuccess:   ['#16A34A', '#15803D'] as const,
  gradientPro:       ['#D97706', '#EA580C'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 4 — Royal Amethyst
// ═════════════════════════════════════════════════════════════════════════════

const amethystDark: ThemePalette = {
  primary:       '#A855F7',
  primaryLight:  '#C084FC',
  primaryDark:   '#7E22CE',
  secondary:     '#EC4899',
  accent:        '#22D3EE',
  background:          '#120A1F',
  backgroundCard:      '#1C1030',
  backgroundElevated:  '#281842',
  textPrimary:   '#FAF5FF',
  textSecondary: '#BBA6D6',
  textMuted:     '#6E5A8C',
  border:        '#352450',
  borderFocus:   '#A855F7',
  ...DARK_STATUS,
  pro:           '#FFD700',
  proGradient:   ['#FBBF24', '#F59E0B'] as const,
  enterprise:    '#E9D5FF',
  notification:  '#EC4899',
  gradientPrimary:   ['#A855F7', '#7C3AED'] as const,
  gradientSecondary: ['#EC4899', '#D946EF'] as const,
  gradientDark:      ['#120A1F', '#1C1030'] as const,
  gradientCard:      ['#281842', '#1C1030'] as const,
  gradientSuccess:   ['#34D399', '#22D3EE'] as const,
  gradientPro:       ['#FBBF24', '#F59E0B'] as const,
};

const amethystLight: ThemePalette = {
  primary:       '#9333EA',
  primaryLight:  '#A855F7',
  primaryDark:   '#6B21A8',
  secondary:     '#DB2777',
  accent:        '#0891B2',
  background:          '#FBF7FF',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#F2E9FB',
  textPrimary:   '#27123B',
  textSecondary: '#553B6E',
  textMuted:     '#9A7FB5',
  border:        '#EADCF7',
  borderFocus:   '#9333EA',
  ...LIGHT_STATUS,
  pro:           '#B7791F',
  proGradient:   ['#D69E2E', '#C05621'] as const,
  enterprise:    '#7E22CE',
  notification:  '#DB2777',
  gradientPrimary:   ['#9333EA', '#7C3AED'] as const,
  gradientSecondary: ['#DB2777', '#C026D3'] as const,
  gradientDark:      ['#FBF7FF', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#F2E9FB'] as const,
  gradientSuccess:   ['#16A34A', '#0891B2'] as const,
  gradientPro:       ['#D69E2E', '#C05621'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 5 — Emerald Forest
// ═════════════════════════════════════════════════════════════════════════════

const emeraldDark: ThemePalette = {
  primary:       '#10B981',
  primaryLight:  '#34D399',
  primaryDark:   '#047857',
  secondary:     '#84CC16',
  accent:        '#FBBF24',
  background:          '#07150F',
  backgroundCard:      '#0D2118',
  backgroundElevated:  '#123022',
  textPrimary:   '#ECFDF5',
  textSecondary: '#9CC2AE',
  textMuted:     '#557064',
  border:        '#1C3A2C',
  borderFocus:   '#10B981',
  ...DARK_STATUS,
  info:          '#22D3EE',
  pro:           '#FFD700',
  proGradient:   ['#FBBF24', '#F59E0B'] as const,
  enterprise:    '#A7F3D0',
  notification:  '#FB7185',
  gradientPrimary:   ['#10B981', '#059669'] as const,
  gradientSecondary: ['#84CC16', '#65A30D'] as const,
  gradientDark:      ['#07150F', '#0D2118'] as const,
  gradientCard:      ['#123022', '#0D2118'] as const,
  gradientSuccess:   ['#34D399', '#10B981'] as const,
  gradientPro:       ['#FBBF24', '#F59E0B'] as const,
};

const emeraldLight: ThemePalette = {
  primary:       '#059669',
  primaryLight:  '#10B981',
  primaryDark:   '#065F46',
  secondary:     '#65A30D',
  accent:        '#D97706',
  background:          '#F2FBF6',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#E2F3E9',
  textPrimary:   '#06281B',
  textSecondary: '#37564A',
  textMuted:     '#7BA08D',
  border:        '#CFE9DA',
  borderFocus:   '#059669',
  ...LIGHT_STATUS,
  pro:           '#B45309',
  proGradient:   ['#D97706', '#B45309'] as const,
  enterprise:    '#047857',
  notification:  '#E11D48',
  gradientPrimary:   ['#059669', '#047857'] as const,
  gradientSecondary: ['#65A30D', '#4D7C0F'] as const,
  gradientDark:      ['#F2FBF6', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#E2F3E9'] as const,
  gradientSuccess:   ['#16A34A', '#059669'] as const,
  gradientPro:       ['#D97706', '#B45309'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// THEME 6 — Midnight Mono (refined neutral / slate)
// ═════════════════════════════════════════════════════════════════════════════

const monoDark: ThemePalette = {
  primary:       '#818CF8',
  primaryLight:  '#A5B4FC',
  primaryDark:   '#4F46E5',
  secondary:     '#64748B',
  accent:        '#38BDF8',
  background:          '#0B0E14',
  backgroundCard:      '#141923',
  backgroundElevated:  '#1D2430',
  textPrimary:   '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted:     '#4B5563',
  border:        '#262E3C',
  borderFocus:   '#818CF8',
  ...DARK_STATUS,
  pro:           '#FCD34D',
  proGradient:   ['#FCD34D', '#F59E0B'] as const,
  enterprise:    '#C7D2FE',
  notification:  '#F87171',
  gradientPrimary:   ['#818CF8', '#6366F1'] as const,
  gradientSecondary: ['#64748B', '#475569'] as const,
  gradientDark:      ['#0B0E14', '#141923'] as const,
  gradientCard:      ['#1D2430', '#141923'] as const,
  gradientSuccess:   ['#34D399', '#10B981'] as const,
  gradientPro:       ['#FCD34D', '#F59E0B'] as const,
};

const monoLight: ThemePalette = {
  primary:       '#4F46E5',
  primaryLight:  '#6366F1',
  primaryDark:   '#3730A3',
  secondary:     '#475569',
  accent:        '#0284C7',
  background:          '#F4F5F7',
  backgroundCard:      '#FFFFFF',
  backgroundElevated:  '#E9EBEF',
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  border:        '#DDE1E8',
  borderFocus:   '#4F46E5',
  ...LIGHT_STATUS,
  pro:           '#B7791F',
  proGradient:   ['#D69E2E', '#B7791F'] as const,
  enterprise:    '#4338CA',
  notification:  '#DC2626',
  gradientPrimary:   ['#4F46E5', '#6366F1'] as const,
  gradientSecondary: ['#475569', '#334155'] as const,
  gradientDark:      ['#F4F5F7', '#FFFFFF'] as const,
  gradientCard:      ['#FFFFFF', '#E9EBEF'] as const,
  gradientSuccess:   ['#16A34A', '#15803D'] as const,
  gradientPro:       ['#D69E2E', '#B7791F'] as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════════════════════

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id:          'cosmic',
    name:        'Cosmic Indigo',
    description: 'The signature DeepDive look',
    icon:        'planet-outline',
    swatch:      '#6C63FF',
    dark:        cosmicDark,
    light:       cosmicLight,
  },
  {
    id:          'ocean',
    name:        'Ocean Teal',
    description: 'Cool, calm and focused',
    icon:        'water-outline',
    swatch:      '#2DD4BF',
    dark:        oceanDark,
    light:       oceanLight,
  },
  {
    id:          'sunset',
    name:        'Sunset Coral',
    description: 'Warm and energetic',
    icon:        'sunny-outline',
    swatch:      '#FB7185',
    dark:        sunsetDark,
    light:       sunsetLight,
  },
  {
    id:          'amethyst',
    name:        'Royal Amethyst',
    description: 'Bold and creative',
    icon:        'diamond-outline',
    swatch:      '#A855F7',
    dark:        amethystDark,
    light:       amethystLight,
  },
  {
    id:          'emerald',
    name:        'Emerald Forest',
    description: 'Fresh and grounded',
    icon:        'leaf-outline',
    swatch:      '#10B981',
    dark:        emeraldDark,
    light:       emeraldLight,
  },
  {
    id:          'mono',
    name:        'Midnight Mono',
    description: 'Refined slate neutral',
    icon:        'contrast-outline',
    swatch:      '#818CF8',
    dark:        monoDark,
    light:       monoLight,
  },
];

export const DEFAULT_THEME_ID: string = 'cosmic';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export function getThemeDefinition(id: string): ThemeDefinition {
  return THEME_DEFINITIONS.find(t => t.id === id) ?? THEME_DEFINITIONS[0];
}

export function getPalette(id: string, mode: ThemeMode): ThemePalette {
  const def = getThemeDefinition(id);
  return mode === 'light' ? def.light : def.dark;
}