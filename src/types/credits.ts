// src/types/credits.ts
// Part 24 — Monetization: Token/Credit system types
// Part 31 — Added slide_ai_rewrite, slide_ai_generate, slide_ai_notes
// Part 38b — Added paper_ai_* feature types for Academic Paper Editor
// Part 38e FIX — Added paper_ai_generate_citations (2 cr, single atomic deduction)
// Part 39 FIX — Added podcast_quality_high and podcast_quality_lossless.
// Part 40 — Added voice_debate (25 cr)
// Part 41.8 — Added paper_ai_generate_section (4 cr)

export type CreditFeature =
  // ── Core research ────────────────────────────────────────────────────────
  | 'research_quick'
  | 'research_deep'
  | 'research_expert'
  // ── Podcast — base duration ───────────────────────────────────────────────
  | 'podcast_5min'
  | 'podcast_10min'
  | 'podcast_15min'
  | 'podcast_20min'
  // ── Podcast — audio quality add-ons (Part 39 FIX) ────────────────────────
  | 'podcast_quality_high'
  | 'podcast_quality_lossless'
  // ── Content generation ────────────────────────────────────────────────────
  | 'academic_paper'
  | 'presentation'
  | 'debate'
  // ── Part 40: Voice Debate ─────────────────────────────────────────────────
  | 'voice_debate'
  // ── Slide editor AI (per-operation) ───────────────────────────────────────
  | 'slide_ai_rewrite'
  | 'slide_ai_generate'
  | 'slide_ai_notes'
  // ── Part 38b: Academic Paper Editor AI (per-operation) ────────────────────
  | 'paper_ai_expand'
  | 'paper_ai_shorten'
  | 'paper_ai_formalize'
  | 'paper_ai_fix_citations'
  | 'paper_ai_counterargument'
  | 'paper_ai_regenerate'
  | 'paper_ai_subtitle'
  // ── Part 38e FIX: Citation Manager AI generation ──────────────────────────
  | 'paper_ai_generate_citations'
  // ── Part 41.8: Full section generation ───────────────────────────────────
  | 'paper_ai_generate_section';

// ─── Credit Pack ─────────────────────────────────────────────────────────────

export interface CreditPack {
  id:             string;
  name:           string;
  credits:        number;
  priceINR:       number;
  amountPaise:    number;
  tag?:           string;
  bonusCredits?:  number;
  description:    string;
  iconName:       string;
  gradientColors: readonly [string, string];
}

// ─── User Credits ─────────────────────────────────────────────────────────────

export interface UserCredits {
  id:               string;
  userId:           string;
  balance:          number;
  totalPurchased:   number;
  totalConsumed:    number;
  freeCreditsGiven: boolean;
  createdAt:        string;
  updatedAt:        string;
}

// ─── Credit Transaction ───────────────────────────────────────────────────────

export type CreditTransactionType =
  | 'purchase'
  | 'consume'
  | 'refund'
  | 'signup_bonus'
  | 'admin_grant';

export interface CreditTransaction {
  id:           string;
  userId:       string;
  type:         CreditTransactionType;
  amount:       number;
  balanceAfter: number;
  feature?:     CreditFeature;
  packId?:      string;
  orderId?:     string;
  paymentId?:   string;
  description:  string;
  metadata?:    Record<string, unknown>;
  createdAt:    string;
}

// ─── Razorpay Order ───────────────────────────────────────────────────────────

export type RazorpayOrderStatus =
  | 'created'
  | 'attempted'
  | 'paid'
  | 'failed'
  | 'expired';

export interface RazorpayOrder {
  id:              string;
  userId:          string;
  packId:          string;
  razorpayOrderId: string;
  amount:          number;
  currency:        string;
  status:          RazorpayOrderStatus;
  creditsToAdd:    number;
  paymentId?:      string;
  createdAt:       string;
  paidAt?:         string;
}

// ─── Purchase Flow State ──────────────────────────────────────────────────────

export type PurchasePhase =
  | 'idle'
  | 'creating_order'
  | 'opening_browser'
  | 'polling'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface PurchaseState {
  phase:         PurchasePhase;
  selectedPack:  CreditPack | null;
  orderId?:      string;
  error?:        string;
  creditsAdded?: number;
}

// ─── Credits Hook State ───────────────────────────────────────────────────────

export interface CreditsState {
  balance:      number;
  isLoading:    boolean;
  isRefreshing: boolean;
  purchase:     PurchaseState;
  transactions: CreditTransaction[];
  txLoading:    boolean;
  error:        string | null;
}

// ─── Insufficient Credits Modal Props ─────────────────────────────────────────

export interface InsufficientCreditsInfo {
  feature:      CreditFeature;
  featureLabel: string;
  required:     number;
  current:      number;
  shortfall:    number;
}