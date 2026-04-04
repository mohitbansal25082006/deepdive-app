// src/types/credits.ts
// Part 24 — Monetization: Token/Credit system types
// Part 31 — Added slide_ai_rewrite, slide_ai_generate, slide_ai_notes
// Part 38b — Added paper_ai_* feature types for Academic Paper Editor
// Part 38e FIX — Added paper_ai_generate_citations (2 cr, single atomic deduction)
//                Replaces the broken double-guardedConsume('paper_ai_fix_citations')
//                pattern that caused duplicate transactions and wrong credit amounts.

export type CreditFeature =
  // ── Core research ────────────────────────────────────────────────────────
  | 'research_quick'
  | 'research_deep'
  | 'research_expert'
  // ── Podcast ──────────────────────────────────────────────────────────────
  | 'podcast_5min'
  | 'podcast_10min'
  | 'podcast_15min'
  | 'podcast_20min'
  // ── Content generation ────────────────────────────────────────────────────
  | 'academic_paper'
  | 'presentation'
  | 'debate'
  // ── Slide editor AI (per-operation) ───────────────────────────────────────
  | 'slide_ai_rewrite'    // 1 cr
  | 'slide_ai_generate'   // 2 cr
  | 'slide_ai_notes'      // 1 cr
  // ── Part 38b: Academic Paper Editor AI (per-operation) ────────────────────
  | 'paper_ai_expand'           // 2 cr — expand section
  | 'paper_ai_shorten'          // 1 cr — shorten section
  | 'paper_ai_formalize'        // 1 cr — formalize tone
  | 'paper_ai_fix_citations'    // 1 cr — fix citation formatting
  | 'paper_ai_counterargument'  // 2 cr — add counterargument
  | 'paper_ai_regenerate'       // 3 cr — full rewrite
  | 'paper_ai_subtitle'         // 1 cr — generate subsection title
  // ── Part 38e FIX: Citation Manager AI generation ──────────────────────────
  | 'paper_ai_generate_citations'; // 2 cr — AI citation generator (single atomic call)

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