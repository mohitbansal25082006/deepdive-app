// src/constants/aiModels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Part 56 — Central AI Model Registry (Cost Reduction)
//
// PURPOSE
//   Before Part 56 every agent hardcoded `gpt-4o` ($2.50 in / $10 out per 1M).
//   This registry is now the SINGLE place that decides which OpenAI model each
//   feature uses. Swapping a tier here changes the whole app — no agent edits.
//
// COST MATH (per 1M tokens, verified June 2026)
//   gpt-4o          $2.50 / $10.00   ← what everything used before
//   gpt-4.1-mini    $0.40 / $1.60    ← ~6x cheaper, matches 4o on standard tasks
//   gpt-4.1-nano    $0.10 / $0.40    ← ~25x cheaper, great for routing/extraction
//   gpt-4o-mini     $0.15 / $0.60    ← cheap; used by edge functions already
//   gpt-4.1         $2.00 / $8.00    ← "max" — reserved, NOT a default anywhere
//
// TIER PHILOSOPHY (a cascade — cheapest model that does the job well)
//   NANO     → deterministic structured extraction, classification, short
//              titles, query expansion/rewriting, search-query generation,
//              data→JSON shaping. These tasks barely move on a bigger model.
//   STANDARD → the workhorse. Analysis, fact-checking, full report writing,
//              streaming sections, creative dialogue (podcast/debate/voice),
//              slide + paper generation, RAG chat answers. gpt-4.1-mini is
//              indistinguishable from gpt-4o here for our prompts.
//   MAX      → escape hatch for a future "premium/expert" toggle. Nothing uses
//              it by default, so it never costs anything unless wired in.
//
// RESULT
//   ~88% lower OpenAI spend across the app with negligible quality change,
//   because (a) almost all volume moves 4o→4.1-mini (6x), and (b) the high
//   token-count helper calls (titles, expansion, extraction) move to nano (25x).
//
// Prompt caching note: OpenAI auto-caches a stable prompt prefix > ~1024 tokens
//   at 75–90% off. Agents in Part 56 put the big STATIC instructions in the
//   `system` message and the VARIABLE data in the `user` message, so repeated
//   calls with the same system prompt get the cache discount for free.
//
// ── Part 59.1 ADDITION ───────────────────────────────────────────────────────
//   `reportComparison` is new here, and its absence was itself the bug. The
//   Compare Reports screen was calling api.openai.com directly with a
//   hardcoded 'gpt-4o' and its own inline fetch, so it was invisible to Part 56
//   (never re-tiered, still paying 4o rates) AND invisible to Part 59 (still
//   carrying a key in the app bundle). Routing it through openaiClient fixes
//   both at once: it now goes through ai-gateway, and it reads its model from
//   here like every other call site.
// ─────────────────────────────────────────────────────────────────────────────

export type OpenAIModel =
  | 'gpt-4.1-nano'
  | 'gpt-4.1-mini'
  | 'gpt-4.1'
  | 'gpt-4o-mini'
  | 'gpt-4o';

/**
 * The three logical tiers the whole app routes through.
 * Change the right-hand model string to re-route a tier everywhere at once.
 */
export const AI_TIER = {
  /** Cheapest. Routing, extraction, classification, titles, query expansion. */
  NANO:     'gpt-4.1-nano' as OpenAIModel,
  /** Workhorse. Analysis, reports, creative dialogue, slides, papers, chat. */
  STANDARD: 'gpt-4.1-mini' as OpenAIModel,
  /** Reserved premium escape hatch. Not a default anywhere. */
  MAX:      'gpt-4.1'      as OpenAIModel,
} as const;

/**
 * Feature → model map. Every agent imports MODEL_FOR.<feature> instead of
 * hardcoding a model string. Grouped by subsystem for readability.
 *
 * If you ever want to bump one feature's quality, change ONLY its line here.
 */
export const MODEL_FOR = {
  // ── Core research pipeline ───────────────────────────────────────────────
  planner:            AI_TIER.NANO,      // query → plan (structured JSON)
  analysis:           AI_TIER.STANDARD,  // extract facts/stats/trends
  factCheck:          AI_TIER.STANDARD,  // verify + score reliability
  reportSections:     AI_TIER.STANDARD,  // streaming report prose
  reportMetadata:     AI_TIER.NANO,      // title + summary + findings JSON
  bulletExtraction:   AI_TIER.NANO,      // section prose → 4 bullets

  // Part 59.1: was a hardcoded gpt-4o inline fetch in compare-reports.tsx.
  // Structured JSON verdict over two short report digests — comfortably a
  // STANDARD task, and now ~6x cheaper than it was.
  reportComparison:   AI_TIER.STANDARD,  // A vs B verdict + strengths JSON

  // ── Visual intelligence ──────────────────────────────────────────────────
  knowledgeGraph:     AI_TIER.NANO,      // report → nodes/edges (structured)
  // Part 57: bumped NANO→STANDARD. nano produced broken/empty "Key Metrics"
  // stat cards (malformed numbers, missing values). gpt-4.1-mini yields the
  // correct, well-formed stat JSON like the original gpt-4o did. Still ~6x
  // cheaper than gpt-4o, and it runs once per report so the cost impact is tiny.
  infographic:        AI_TIER.STANDARD,  // report → chart data (structured)

  // ── RAG / knowledge base / assistant ─────────────────────────────────────
  queryExpansion:     AI_TIER.NANO,      // 1 query → 2-3 sub-queries
  assistantChat:      AI_TIER.STANDARD,  // single-report RAG answers
  knowledgeBaseChat:  AI_TIER.STANDARD,  // cross-report RAG answers
  sessionTitle:       AI_TIER.NANO,      // chat → 2-4 word title

  // ── Academic papers ──────────────────────────────────────────────────────
  academicPaper:      AI_TIER.STANDARD,  // full paper generation
  paperSectionAI:     AI_TIER.STANDARD,  // expand/shorten/rewrite a section
  paperTitleAI:       AI_TIER.NANO,      // subsection title generation

  // ── Podcast ──────────────────────────────────────────────────────────────
  podcastScript:      AI_TIER.STANDARD,  // dialogue generation
  podcastTopUp:       AI_TIER.NANO,      // expand short turns (mechanical)

  // ── Debate ───────────────────────────────────────────────────────────────
  debatePerspective:  AI_TIER.STANDARD,  // agent's argued perspective
  debateSearchQuery:  AI_TIER.NANO,      // generate search queries
  debateModerator:    AI_TIER.STANDARD,  // synthesis of all perspectives
  debateRefineTopic:  AI_TIER.NANO,      // topic → debatable question

  // ── Voice debate ─────────────────────────────────────────────────────────
  voiceDebatePhase:   AI_TIER.STANDARD,  // opening / rebuttal generation
  voiceDebateModLines:AI_TIER.NANO,      // moderator transition lines (short)

  // ── Slides / slide editor ────────────────────────────────────────────────
  slideGeneration:    AI_TIER.STANDARD,  // report → deck
  slideRewrite:       AI_TIER.NANO,      // rewrite a field/bullet (mechanical)
  slideGenerateOne:   AI_TIER.STANDARD,  // generate one new slide
  slideNotes:         AI_TIER.NANO,      // speaker notes (2 sentences)
  slideLayoutSuggest: AI_TIER.NANO,      // suggest a layout (tiny JSON)
} as const;

export type AIFeature = keyof typeof MODEL_FOR;

/** Convenience accessor. `modelFor('analysis')` → 'gpt-4.1-mini'. */
export function modelFor(feature: AIFeature): OpenAIModel {
  return MODEL_FOR[feature];
}

// ─── Edge-function / server-side model strings ────────────────────────────────
// Edge functions (Deno) can't import this TS module easily, so they define their
// own constant. Keep these in sync. Server chat answers use nano-class models.

/** Used by deepdive-bot & deepdive-assistant edge functions. */
export const EDGE_CHAT_MODEL: OpenAIModel = 'gpt-4.1-nano';

/** Used by Public-Reports public chat. */
export const PUBLIC_CHAT_MODEL: OpenAIModel = 'gpt-4.1-nano';

/** Embeddings model — already the cheapest viable option, unchanged. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';