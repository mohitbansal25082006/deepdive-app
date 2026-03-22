// src/constants/credits.ts
// Part 24 — All credit pack definitions, feature costs, and display helpers
// Part 31 — Added slide_ai_rewrite, slide_ai_generate, slide_ai_notes entries

import type { CreditPack, CreditFeature } from '../types/credits';

// ─── Signup Bonus ─────────────────────────────────────────────────────────────

export const SIGNUP_BONUS_CREDITS = 50;

// ─── Feature Credit Costs ────────────────────────────────────────────────────
// These are checked BEFORE running any AI pipeline.

export const FEATURE_COSTS: Record<CreditFeature, number> = {
  research_quick:  5,
  research_deep:   10,
  research_expert: 15,
  podcast_5min:    10,
  podcast_10min:   20,
  podcast_15min:   30,
  podcast_20min:   40,
  academic_paper:  25,
  presentation:    10,
  debate:          15,
  // Part 31: slide editor AI operations (per-operation, cheap)
  // Matches EDITOR_CREDIT_COSTS in src/constants/editor.ts
  slide_ai_rewrite:  1,   // rewrite field / bullets / single bullet
  slide_ai_generate: 2,   // generate a brand-new slide from description
  slide_ai_notes:    1,   // generate speaker notes for a slide
};

// ─── Feature Labels ───────────────────────────────────────────────────────────

export const FEATURE_LABELS: Record<CreditFeature, string> = {
  research_quick:  'Quick Research',
  research_deep:   'Deep Research',
  research_expert: 'Expert Research',
  podcast_5min:    'Podcast (5 min)',
  podcast_10min:   'Podcast (10 min)',
  podcast_15min:   'Podcast (15 min)',
  podcast_20min:   'Podcast (20 min)',
  academic_paper:  'Academic Paper',
  presentation:    'AI Presentation',
  debate:          'AI Debate',
  // Part 31
  slide_ai_rewrite:  'AI Slide Rewrite',
  slide_ai_generate: 'AI Generate Slide',
  slide_ai_notes:    'AI Speaker Notes',
};

// ─── Feature Icons ─────────────────────────────────────────────────────────────

export const FEATURE_ICONS: Record<CreditFeature, string> = {
  research_quick:  'flash-outline',
  research_deep:   'analytics-outline',
  research_expert: 'trophy-outline',
  podcast_5min:    'radio-outline',
  podcast_10min:   'radio-outline',
  podcast_15min:   'radio-outline',
  podcast_20min:   'radio-outline',
  academic_paper:  'school-outline',
  presentation:    'easel-outline',
  debate:          'people-outline',
  // Part 31
  slide_ai_rewrite:  'pencil-outline',
  slide_ai_generate: 'add-circle-outline',
  slide_ai_notes:    'document-text-outline',
};

// ─── Credit Packs ─────────────────────────────────────────────────────────────

export const CREDIT_PACKS: CreditPack[] = [
  {
    id:            'starter_99',
    name:          'Starter',
    credits:       50,
    priceINR:      99,
    amountPaise:   9900,
    description:   'Perfect for trying out all features',
    iconName:      'rocket-outline',
    gradientColors: ['#6C63FF', '#8B5CF6'],
  },
  {
    id:            'popular_249',
    name:          'Popular',
    credits:       150,
    priceINR:      249,
    amountPaise:   24900,
    tag:           'POPULAR',
    bonusCredits:  20,
    description:   '150 + 20 bonus credits included',
    iconName:      'star-outline',
    gradientColors: ['#FF6584', '#F093FB'],
  },
  {
    id:            'pro_499',
    name:          'Pro Pack',
    credits:       350,
    priceINR:      499,
    amountPaise:   49900,
    tag:           'BEST VALUE',
    bonusCredits:  50,
    description:   '350 + 50 bonus credits — best per-credit price',
    iconName:      'diamond-outline',
    gradientColors: ['#43E97B', '#38F9D7'],
  },
  {
    id:            'unlimited_999',
    name:          'Power User',
    credits:       1000,
    priceINR:      999,
    amountPaise:   99900,
    bonusCredits:  200,
    description:   '1000 + 200 bonus credits — for heavy researchers',
    iconName:      'infinite-outline',
    gradientColors: ['#FFA726', '#FF7043'],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get total credits for a pack (base + bonus).
 */
export function getTotalPackCredits(pack: CreditPack): number {
  return pack.credits + (pack.bonusCredits ?? 0);
}

/**
 * Price per credit in paise (for comparing value).
 */
export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.amountPaise / getTotalPackCredits(pack));
}

/**
 * Returns the CreditFeature key for a research depth string.
 */
export function researchDepthToFeature(
  depth: 'quick' | 'deep' | 'expert',
): CreditFeature {
  switch (depth) {
    case 'quick':  return 'research_quick';
    case 'expert': return 'research_expert';
    default:       return 'research_deep';
  }
}

/**
 * Returns the CreditFeature key for a podcast duration (minutes).
 */
export function podcastDurationToFeature(minutes: number): CreditFeature {
  if (minutes <= 5)  return 'podcast_5min';
  if (minutes <= 10) return 'podcast_10min';
  if (minutes <= 15) return 'podcast_15min';
  return 'podcast_20min';
}

/**
 * Formats a credit amount for display: e.g. 50 → "50 cr"
 */
export function formatCredits(n: number): string {
  return `${n} cr`;
}

/**
 * Formats INR amount: e.g. 249 → "₹249"
 */
export function formatINR(amount: number): string {
  return `₹${amount}`;
}

// ─── Low Balance Threshold ────────────────────────────────────────────────────

/** Show low-balance warning when credits fall below this */
export const LOW_BALANCE_THRESHOLD = 10;