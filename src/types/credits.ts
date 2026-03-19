// src/types/credits.ts
// Part 24 — Monetization: Token/Credit system types

// ─── Credit Feature Costs ────────────────────────────────────────────────────

export type CreditFeature =
  | 'research_quick'
  | 'research_deep'
  | 'research_expert'
  | 'podcast_5min'
  | 'podcast_10min'
  | 'podcast_15min'
  | 'podcast_20min'
  | 'academic_paper'
  | 'presentation'
  | 'debate';

// ─── Credit Pack ─────────────────────────────────────────────────────────────

export interface CreditPack {
  id:            string;     // e.g. 'starter_99'
  name:          string;     // e.g. 'Starter Pack'
  credits:       number;     // e.g. 50
  priceINR:      number;     // e.g. 99  (₹)
  amountPaise:   number;     // priceINR * 100 (Razorpay uses paise)
  tag?:          string;     // e.g. 'POPULAR', 'BEST VALUE'
  bonusCredits?: number;     // bonus on top (e.g. 10 bonus)
  description:   string;
  iconName:      string;     // Ionicons name
  gradientColors: readonly [string, string];
}

// ─── User Credits ─────────────────────────────────────────────────────────────

export interface UserCredits {
  id:              string;
  userId:          string;
  balance:         number;   // current credit balance
  totalPurchased:  number;   // lifetime credits purchased
  totalConsumed:   number;   // lifetime credits used
  freeCreditsGiven: boolean; // whether signup bonus was given
  createdAt:       string;
  updatedAt:       string;
}

// ─── Credit Transaction ───────────────────────────────────────────────────────

export type CreditTransactionType =
  | 'purchase'          // bought credits
  | 'consume'           // used credits for a feature
  | 'refund'            // refunded credits
  | 'signup_bonus'      // free credits on signup
  | 'admin_grant';      // manually granted by admin

export interface CreditTransaction {
  id:          string;
  userId:      string;
  type:        CreditTransactionType;
  amount:      number;         // positive = credit added, negative = credit consumed
  balanceAfter: number;        // balance after this transaction
  feature?:    CreditFeature;  // which feature was used (for consume)
  packId?:     string;         // which pack was purchased (for purchase)
  orderId?:    string;         // Razorpay order ID (for purchase)
  paymentId?:  string;         // Razorpay payment ID (for purchase)
  description: string;
  metadata?:   Record<string, unknown>;
  createdAt:   string;
}

// ─── Razorpay Order ───────────────────────────────────────────────────────────

export type RazorpayOrderStatus =
  | 'created'
  | 'attempted'
  | 'paid'
  | 'failed'
  | 'expired';

export interface RazorpayOrder {
  id:              string;       // our DB row id
  userId:          string;
  packId:          string;
  razorpayOrderId: string;       // Razorpay's order ID (e.g. order_xxx)
  amount:          number;       // in paise
  currency:        string;       // 'INR'
  status:          RazorpayOrderStatus;
  creditsToAdd:    number;
  paymentId?:      string;       // Razorpay payment ID — set after payment
  createdAt:       string;
  paidAt?:         string;
}

// ─── Purchase Flow State ──────────────────────────────────────────────────────

export type PurchasePhase =
  | 'idle'
  | 'creating_order'    // calling Edge Function to create Razorpay order
  | 'opening_browser'   // opening expo-web-browser
  | 'polling'           // browser closed, polling for credit update
  | 'success'
  | 'failed'
  | 'cancelled';

export interface PurchaseState {
  phase:         PurchasePhase;
  selectedPack:  CreditPack | null;
  orderId?:      string;         // razorpay order id
  error?:        string;
  creditsAdded?: number;         // set on success
}

// ─── Credits Hook State ───────────────────────────────────────────────────────

export interface CreditsState {
  balance:         number;
  isLoading:       boolean;
  isRefreshing:    boolean;
  purchase:        PurchaseState;
  transactions:    CreditTransaction[];
  txLoading:       boolean;
  error:           string | null;
}

// ─── Insufficient Credits Modal Props ─────────────────────────────────────────

export interface InsufficientCreditsInfo {
  feature:      CreditFeature;
  featureLabel: string;
  required:     number;
  current:      number;
  shortfall:    number;
}