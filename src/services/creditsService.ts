// src/services/creditsService.ts
// Part 24 (Fix v7) — ROOT CAUSE FIX for balance always returning 0.
//   (See previous header — direct table SELECT bypasses PostgREST array wrapping.)
//
// Part 55.12 — theme params (now passed INTO the secure token, not the URL).
//
// Part 57 — SECURE CHECKOUT (zero-leak URL) + FASTER FAIL/CANCEL.
//   • createCheckoutToken(): calls the new `checkout-token` Edge Function, which
//     mints a short-lived signed token embedding the order + email + name +
//     theme. The app then opens the checkout with ONLY `?t=<token>&api=...&k=...`.
//     No email, order id, key id, or theme is ever in the URL.
//   • buildSecureCheckoutUrl(): assembles that minimal URL.
//   • checkOrderAndAddCredits() now accepts a `cancelled` flag, forwarded to the
//     Edge Function so a back-button cancel resolves instantly.
//   • The legacy buildCheckoutUrl() is KEPT (deprecated) only as a fallback;
//     CreditsContext now uses the secure token path.

import { supabase }              from '../lib/supabase';
import type {
  UserCredits,
  CreditTransaction,
  CreditFeature,
}                                from '../types/credits';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  public readonly balance:  number;
  public readonly required: number;
  constructor(message: string, balance: number, required: number) {
    super(message);
    this.name     = 'InsufficientCreditsError';
    this.balance  = balance;
    this.required = required;
  }
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface CreateOrderResponse {
  order_id:    string;
  key_id:      string;
  amount:      number;
  currency:    string;
  credits:     number;
  pack_name:   string;
  description: string;
}

export interface CheckOrderResponse {
  paid:               boolean;
  balance:            number;
  credits_added?:     number;
  already_processed?: boolean;
  order_status?:      string;
  payment_count?:     number;
  payment_failed?:    boolean;
  cancelled?:         boolean;
  fail_reason?:       string;
  source?:            string;
  error?:             string;
}

// ─── Part 55.12 / 57: theme params shape (now carried inside the token) ───────

export interface ThemeCheckoutParams {
  primary:             string;
  primaryLight:        string;
  primaryDark:         string;
  accent:              string;
  background:          string;
  backgroundCard:      string;
  backgroundElevated:  string;
  textPrimary:         string;
  textSecondary:       string;
  textMuted:           string;
  border:              string;
  gradP1:    string;
  gradP2:    string;
  gradCard1: string;
  gradCard2: string;
  isLight:   boolean;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapCreditsRow(rawData: any): UserCredits {
  const row = Array.isArray(rawData) ? rawData[0] : rawData;
  if (!row) {
    return {
      id: '', userId: '', balance: 0,
      totalPurchased: 0, totalConsumed: 0,
      freeCreditsGiven: false, createdAt: '', updatedAt: '',
    };
  }
  return {
    id:               row.id              ?? '',
    userId:           row.user_id         ?? '',
    balance:          row.balance         ?? 0,
    totalPurchased:   row.total_purchased ?? 0,
    totalConsumed:    row.total_consumed  ?? 0,
    freeCreditsGiven: row.free_credits_given ?? false,
    createdAt:        row.created_at      ?? '',
    updatedAt:        row.updated_at      ?? '',
  };
}

function mapTxRow(row: Record<string, any>): CreditTransaction {
  return {
    id:           row.id,
    userId:       row.user_id,
    type:         row.type,
    amount:       row.amount,
    balanceAfter: row.balance_after,
    feature:      row.feature     ?? undefined,
    packId:       row.pack_id     ?? undefined,
    orderId:      row.order_id    ?? undefined,
    paymentId:    row.payment_id  ?? undefined,
    description:  row.description ?? '',
    metadata:     row.metadata    ?? {},
    createdAt:    row.created_at,
  };
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Session expired. Please sign in again.');
  return data.session.access_token;
}

function getSupabaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL not set');
  return url;
}

function getAnonKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

// ─── Fetch credits ────────────────────────────────────────────────────────────

export async function fetchUserCredits(userId: string): Promise<UserCredits> {
  try {
    await supabase.rpc('ensure_user_credits', { p_user_id: userId });
  } catch { /* non-fatal */ }

  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Credits fetch error: ${error.message}`);

  if (!data) {
    return {
      id: '', userId, balance: 0,
      totalPurchased: 0, totalConsumed: 0, freeCreditsGiven: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
  return mapCreditsRow(data);
}

// ─── Consume credits ─────────────────────────────────────────────────────────

export async function consumeCredits(
  userId: string, feature: CreditFeature, cost: number, description = '',
): Promise<number> {
  const { data, error } = await supabase.rpc('consume_credits', {
    p_user_id: userId, p_feature: feature, p_cost: cost, p_description: description,
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      const bm = error.message.match(/balance=(\d+)/);
      const rm = error.message.match(/required=(\d+)/);
      throw new InsufficientCreditsError(
        error.message,
        bm ? parseInt(bm[1], 10) : 0,
        rm ? parseInt(rm[1], 10) : cost,
      );
    }
    throw new Error(`Credit deduction failed: ${error.message}`);
  }
  return typeof data === 'number' ? data : parseInt(String(data), 10);
}

// ─── Fetch transactions ───────────────────────────────────────────────────────

export async function fetchTransactions(
  userId: string, limit = 20, offset = 0,
): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Transaction fetch error: ${error.message}`);
  return ((data ?? []) as Record<string, any>[]).map(mapTxRow);
}

// ─── Create Razorpay order ────────────────────────────────────────────────────

export async function createRazorpayOrder(
  packId: string, userId: string,
): Promise<CreateOrderResponse> {
  const token = await getAccessToken();
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/razorpay-create-order`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey':        getAnonKey(),
    },
    body: JSON.stringify({ pack_id: packId, user_id: userId }),
  });
  if (!response.ok) {
    let msg = 'Failed to create payment order';
    try { const e = await response.json(); msg = e.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return (await response.json()) as CreateOrderResponse;
}

// ─── Part 57: mint a secure checkout token ────────────────────────────────────
// Calls the `checkout-token` Edge Function. Returns a short-lived signed token
// that embeds the order details + email + name + theme server-side, so NONE of
// that needs to go into the checkout URL.

export async function createCheckoutToken(
  order:     CreateOrderResponse,
  userId:    string,
  userEmail: string,
  userName:  string,
  theme?:    ThemeCheckoutParams,
): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/checkout-token`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey':        getAnonKey(),
    },
    body: JSON.stringify({
      razorpay_order_id: order.order_id,
      user_id:           userId,
      email:             userEmail,
      contact_name:      userName || 'Researcher',
      theme:             theme ?? null,
    }),
  });
  if (!response.ok) {
    let msg = 'Could not secure your checkout. Please try again.';
    try { const e = await response.json(); msg = e.error ?? msg; } catch {}
    throw new Error(msg);
  }
  const data = await response.json();
  if (!data?.token) throw new Error('Checkout token missing from response');
  return data.token as string;
}

// ─── Part 57: build the SECURE checkout URL (token only) ──────────────────────
// The URL contains only:
//   ?t=<token>          opaque, signed, short-lived
//   &api=<supabase-url> public project URL (needed for the resolve fetch)
//   &k=<anon-key>       public anon key (needed for the functions gateway)
// No email, no order id, no Razorpay key id, no theme colours. Nothing sensitive.

export function buildSecureCheckoutUrl(token: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_CHECKOUT_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_CHECKOUT_URL not set in .env');

  const params = new URLSearchParams({
    t:   token,
    api: getSupabaseUrl(),
    k:   getAnonKey(),
  });
  return `${baseUrl}?${params.toString()}`;
}

// ─── DEPRECATED: legacy plaintext checkout URL (Part 55.12) ───────────────────
// Kept only as an emergency fallback. NOT used by CreditsContext anymore because
// it leaks email/order id/key id/theme in the URL. Do not call this for new code.

export function buildCheckoutUrl(
  order:       CreateOrderResponse,
  userEmail:   string,
  userName:    string,
  theme?:      ThemeCheckoutParams,
): string {
  const baseUrl = process.env.EXPO_PUBLIC_CHECKOUT_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_CHECKOUT_URL not set in .env');

  const params = new URLSearchParams({
    order_id:     order.order_id,
    key_id:       order.key_id,
    amount:       String(order.amount),
    currency:     order.currency,
    description:  order.description,
    credits:      String(order.credits),
    pack_name:    order.pack_name,
    email:        userEmail,
    contact_name: userName || 'Researcher',
  });
  if (theme) {
    params.set('t_primary',   theme.primary);
    params.set('t_primary_l', theme.primaryLight);
    params.set('t_primary_d', theme.primaryDark);
    params.set('t_accent',    theme.accent);
    params.set('t_bg',        theme.background);
    params.set('t_bg_card',   theme.backgroundCard);
    params.set('t_bg_el',     theme.backgroundElevated);
    params.set('t_text',      theme.textPrimary);
    params.set('t_text_s',    theme.textSecondary);
    params.set('t_text_m',    theme.textMuted);
    params.set('t_border',    theme.border);
    params.set('t_g1',        theme.gradP1);
    params.set('t_g2',        theme.gradP2);
    params.set('t_gc1',       theme.gradCard1);
    params.set('t_gc2',       theme.gradCard2);
    if (theme.isLight) params.set('t_light', '1');
  }
  return `${baseUrl}?${params.toString()}`;
}

// ─── Check order & add credits ────────────────────────────────────────────────
// Part 57: `cancelled` forwards a user-cancelled hint for instant fail resolution.

export async function checkOrderAndAddCredits(
  userId:          string,
  razorpayOrderId: string,
  cancelled = false,
): Promise<CheckOrderResponse> {
  const token = await getAccessToken();
  const response = await fetch(
    `${getSupabaseUrl()}/functions/v1/razorpay-check-order`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey':        getAnonKey(),
      },
      body: JSON.stringify({ razorpay_order_id: razorpayOrderId, user_id: userId, cancelled }),
    },
  );
  if (!response.ok) {
    let msg = 'Order check failed';
    try { const e = await response.json(); msg = e.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return (await response.json()) as CheckOrderResponse;
}