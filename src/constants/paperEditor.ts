// src/constants/paperEditor.ts
// Part 38 — Academic Paper Editor constants
// ─────────────────────────────────────────────────────────────────────────────

import type { PaperAITool } from '../types/paperEditor';

// ─── Credit costs (registered in credits.ts / CreditFeature) ─────────────────
// These map to the existing useCreditGate system.
// We re-use slide_ai_rewrite (1cr), slide_ai_notes (1cr), slide_ai_generate (2cr)
// from the existing CreditFeature type since adding new features to that type
// would require updating the DB. Instead we handle mapping here.

export const PAPER_AI_CREDITS = {
  expand:              2,  // maps to slide_ai_generate (2cr)
  shorten:             1,  // maps to slide_ai_rewrite  (1cr)
  formalize:           1,
  fix_citations:       1,
  add_counterargument: 2,
  regenerate:          3,  // deducts slide_ai_generate twice + rewrite once
} as const satisfies Record<PaperAITool, number>;

// ─── AI tool ordering (for toolbar display) ───────────────────────────────────

export const PAPER_AI_TOOLS_PRIMARY: PaperAITool[] = [
  'expand', 'shorten', 'formalize',
];

export const PAPER_AI_TOOLS_SECONDARY: PaperAITool[] = [
  'fix_citations', 'add_counterargument', 'regenerate',
];

// ─── Section type labels ──────────────────────────────────────────────────────

export const SECTION_TYPE_LABELS: Record<string, string> = {
  abstract:          'Abstract',
  introduction:      '1. Introduction',
  literature_review: '2. Literature Review',
  methodology:       '3. Methodology',
  findings:          '4. Findings',
  conclusion:        '5. Conclusion',
  references:        'References',
};

// ─── Max undo history ─────────────────────────────────────────────────────────

export const MAX_UNDO_STEPS = 20;

// ─── Auto-save debounce (ms) ──────────────────────────────────────────────────

export const AUTO_SAVE_DEBOUNCE_MS = 1500;

// ─── Citation style labels ────────────────────────────────────────────────────

export const CITATION_STYLE_LABELS = {
  apa:     'APA 7th',
  mla:     'MLA 9th',
  chicago: 'Chicago 17th',
  ieee:    'IEEE',
} as const;

// ─── Export font sizes ────────────────────────────────────────────────────────

export const EXPORT_FONT_SIZES = [10, 11, 12, 13, 14] as const;

// ─── Default export config ────────────────────────────────────────────────────

export const DEFAULT_EXPORT_CONFIG = {
  fontSizePt:  12,
  lineSpacing: 'double' as const,
  pageNumbers: true,
  coverPage:   true,
};