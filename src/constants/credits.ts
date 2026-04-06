// src/constants/credits.ts
// Part 24 — All credit pack definitions, feature costs, and display helpers
// Part 31 — Added slide_ai_rewrite, slide_ai_generate, slide_ai_notes entries
// Part 38b — Added paper_ai_* entries for Academic Paper Editor AI tools
// Part 38e FIX — Added paper_ai_generate_citations (2 cr).
// Part 39 FIX — Added podcast_quality_high (5 cr) and podcast_quality_lossless (10 cr).
//               These are charged as add-ons on top of the base duration cost when
//               the user selects High or Lossless audio quality.
//               Standard quality remains free (0 cr bonus) — no change to base costs.
//
// Credit deduction flow for podcasts:
//   1. Base cost  = podcastDurationToFeature(minutes)     e.g. podcast_10min = 20 cr
//   2. Quality    = podcastQualityToFeature(audioQuality) e.g. high = +5 cr (or null)
//   3. Both deducted atomically via two guardedConsume calls in handleGenerate.
//      Standard quality → only base cost deducted (quality feature is null → skipped).

import type { CreditPack, CreditFeature } from '../types/credits';

// ─── Signup Bonus ─────────────────────────────────────────────────────────────

export const SIGNUP_BONUS_CREDITS = 50;

// ─── Feature Credit Costs ────────────────────────────────────────────────────

export const FEATURE_COSTS: Record<CreditFeature, number> = {
  // Research
  research_quick:  5,
  research_deep:   10,
  research_expert: 15,
  // Podcast — base duration costs (quality add-on is separate below)
  podcast_5min:    10,
  podcast_10min:   20,
  podcast_15min:   30,
  podcast_20min:   40,
  // Podcast quality add-ons (charged on top of duration cost)
  podcast_quality_high:     5,   // +5 cr for High quality (tts-1-hd + mp3)
  podcast_quality_lossless: 10,  // +10 cr for Lossless quality (tts-1-hd + wav)
  // Content
  academic_paper:  25,
  presentation:    10,
  debate:          15,
  // Slide editor AI
  slide_ai_rewrite:  1,
  slide_ai_generate: 2,
  slide_ai_notes:    1,
  // Part 38b: Academic Paper Editor AI (per-operation)
  paper_ai_expand:          2,
  paper_ai_shorten:         1,
  paper_ai_formalize:       1,
  paper_ai_fix_citations:   1,
  paper_ai_counterargument: 2,
  paper_ai_regenerate:      3,
  paper_ai_subtitle:        1,
  // Part 38e FIX: Citation Manager AI generator — single 2-credit deduction
  paper_ai_generate_citations: 2,
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
  podcast_quality_high:     'Podcast — High Quality',
  podcast_quality_lossless: 'Podcast — Lossless Quality',
  academic_paper:  'Academic Paper',
  presentation:    'AI Presentation',
  debate:          'AI Debate',
  slide_ai_rewrite:  'AI Slide Rewrite',
  slide_ai_generate: 'AI Generate Slide',
  slide_ai_notes:    'AI Speaker Notes',
  // Part 38b
  paper_ai_expand:          'Paper AI — Expand',
  paper_ai_shorten:         'Paper AI — Shorten',
  paper_ai_formalize:       'Paper AI — Formalize',
  paper_ai_fix_citations:   'Paper AI — Fix Citations',
  paper_ai_counterargument: 'Paper AI — Add Counterargument',
  paper_ai_regenerate:      'Paper AI — Regenerate Section',
  paper_ai_subtitle:        'Paper AI — Generate Subsection Title',
  // Part 38e FIX
  paper_ai_generate_citations: 'Paper AI — Generate Citations',
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
  podcast_quality_high:     'headset-outline',
  podcast_quality_lossless: 'diamond-outline',
  academic_paper:  'school-outline',
  presentation:    'easel-outline',
  debate:          'people-outline',
  slide_ai_rewrite:  'pencil-outline',
  slide_ai_generate: 'add-circle-outline',
  slide_ai_notes:    'document-text-outline',
  // Part 38b
  paper_ai_expand:          'expand-outline',
  paper_ai_shorten:         'contract-outline',
  paper_ai_formalize:       'business-outline',
  paper_ai_fix_citations:   'link-outline',
  paper_ai_counterargument: 'git-compare-outline',
  paper_ai_regenerate:      'refresh-circle-outline',
  paper_ai_subtitle:        'text-outline',
  // Part 38e FIX
  paper_ai_generate_citations: 'sparkles-outline',
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

export function getTotalPackCredits(pack: CreditPack): number {
  return pack.credits + (pack.bonusCredits ?? 0);
}

export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.amountPaise / getTotalPackCredits(pack));
}

export function researchDepthToFeature(
  depth: 'quick' | 'deep' | 'expert',
): CreditFeature {
  switch (depth) {
    case 'quick':  return 'research_quick';
    case 'expert': return 'research_expert';
    default:       return 'research_deep';
  }
}

export function podcastDurationToFeature(minutes: number): CreditFeature {
  if (minutes <= 5)  return 'podcast_5min';
  if (minutes <= 10) return 'podcast_10min';
  if (minutes <= 15) return 'podcast_15min';
  return 'podcast_20min';
}

/**
 * Returns the quality add-on CreditFeature for podcast generation,
 * or null if no extra charge applies (standard quality is free).
 *
 * Usage in podcast.tsx:
 *   const qualityFeature = podcastQualityToFeature(audioQuality);
 *   if (qualityFeature) {
 *     const ok = await guardedConsume(qualityFeature);
 *     if (!ok) return; // roll back base cost via refund or abort
 *   }
 */
export function podcastQualityToFeature(
  quality: 'standard' | 'high' | 'lossless',
): CreditFeature | null {
  switch (quality) {
    case 'high':     return 'podcast_quality_high';
    case 'lossless': return 'podcast_quality_lossless';
    default:         return null;  // standard = free, no add-on
  }
}

/**
 * Returns the total credit cost for a podcast generation including quality add-on.
 * Useful for showing the combined cost in the UI before the user taps Generate.
 */
export function podcastTotalCost(
  minutes: number,
  quality: 'standard' | 'high' | 'lossless',
): number {
  const baseCost    = FEATURE_COSTS[podcastDurationToFeature(minutes)];
  const qualityFeat = podcastQualityToFeature(quality);
  const qualityCost = qualityFeat ? FEATURE_COSTS[qualityFeat] : 0;
  return baseCost + qualityCost;
}

export function formatCredits(n: number): string {
  return `${n} cr`;
}

export function formatINR(amount: number): string {
  return `₹${amount}`;
}

export const LOW_BALANCE_THRESHOLD = 10;