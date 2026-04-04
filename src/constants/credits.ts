// src/constants/credits.ts
// Part 24 — All credit pack definitions, feature costs, and display helpers
// Part 31 — Added slide_ai_rewrite, slide_ai_generate, slide_ai_notes entries
// Part 38b — Added paper_ai_* entries for Academic Paper Editor AI tools
// Part 38e FIX — Added paper_ai_generate_citations (2 cr).
//                This single feature replaces the broken double-call to
//                guardedConsume('paper_ai_fix_citations') in useCitationManager.
//                One atomic 2-credit deduction instead of two separate 1-credit
//                calls that raced against each other and caused duplicate transactions.

import type { CreditPack, CreditFeature } from '../types/credits';

// ─── Signup Bonus ─────────────────────────────────────────────────────────────

export const SIGNUP_BONUS_CREDITS = 50;

// ─── Feature Credit Costs ────────────────────────────────────────────────────

export const FEATURE_COSTS: Record<CreditFeature, number> = {
  // Research
  research_quick:  5,
  research_deep:   10,
  research_expert: 15,
  // Podcast
  podcast_5min:    10,
  podcast_10min:   20,
  podcast_15min:   30,
  podcast_20min:   40,
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
  // (previously was two separate 1-credit calls which caused race conditions
  //  and duplicate transactions in the credit ledger)
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

export function formatCredits(n: number): string {
  return `${n} cr`;
}

export function formatINR(amount: number): string {
  return `₹${amount}`;
}

export const LOW_BALANCE_THRESHOLD = 10;