// src/services/creditsService.ts
// Part 24 (Fix v7) — ROOT CAUSE FIX for balance always returning 0.
//
// PROBLEM: get_user_credits RPC returns RETURNS public.user_credits (composite type).
// PostgREST wraps ALL results in an array by default, so data comes back as:
//   [{ id: ..., user_id: ..., balance: 170, ... }]
//
// But mapCreditsRow(data) was calling row.balance on the ARRAY object,
// getting undefined, and defaulting to 0.
//
// FIX: Replace fetchUserCredits() with a direct .from('user_credits').select()
// query. Direct table queries return a single object when using .maybeSingle(),
// bypassing the PostgREST array-wrapping issue entirely.
// The ensure_user_credits RPC (which gives the signup bonus) is called separately
// on first load only.

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
  fail_reason?:       string;
  error?:             string;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────
// Handles both direct table rows and the rare case where data is an array.

function mapCreditsRow(rawData: any): UserCredits {
  // CRITICAL FIX: PostgREST wraps composite RPC returns in an array.
  // Always unwrap if it's an array.
  const row = Array.isArray(rawData) ? rawData[0] : rawData;

  if (!row) {
    return {
      id: '', userId: '', balance: 0,
      totalPurchased: 0, totalConsumed: 0,
      freeCreditsGiven: false,
      createdAt: '', updatedAt: '',
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
// FIX: Uses direct table SELECT with maybeSingle() instead of the composite-type
// RPC. This bypasses PostgREST's array-wrapping of composite return types.

export async function fetchUserCredits(userId: string): Promise<UserCredits> {
  // Step 1: Call ensure_user_credits to create the row + signup bonus if needed.
  // This RPC returns INTEGER (not composite) so it's safe to call via rpc().
  // We ignore the return value — we just need the side effect.
  try {
    await supabase.rpc('ensure_user_credits', { p_user_id: userId });
  } catch {
    // Non-fatal — the row may already exist
  }

  // Step 2: Read the balance via direct table query.
  // .maybeSingle() returns a plain object or null — no array wrapping.
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Credits fetch error: ${error.message}`);
  }

  if (!data) {
    // Row still doesn't exist — return zero balance
    return {
      id: '', userId, balance: 0,
      totalPurchased: 0, totalConsumed: 0,
      freeCreditsGiven: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return mapCreditsRow(data);
}

// ─── Consume credits ─────────────────────────────────────────────────────────
// consume_credits RPC returns INTEGER — no array wrapping issue.

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

  // consume_credits returns INTEGER — data is the new balance directly
  return typeof data === 'number' ? data : parseInt(String(data), 10);
}

// ─── Fetch transactions ───────────────────────────────────────────────────────

export async function fetchTransactions(
  userId: string, limit = 20, offset = 0,
): Promise<CreditTransaction[]> {
  // Use direct table query to avoid composite-type array issues
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

// ─── Build checkout URL ───────────────────────────────────────────────────────

export function buildCheckoutUrl(
  order: CreateOrderResponse, userEmail: string, userName: string,
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
  return `${baseUrl}?${params.toString()}`;
}

// ─── Check order & add credits ────────────────────────────────────────────────

export async function checkOrderAndAddCredits(
  userId:          string,
  razorpayOrderId: string,
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
      body: JSON.stringify({ razorpay_order_id: razorpayOrderId, user_id: userId }),
    },
  );
  if (!response.ok) {
    let msg = 'Order check failed';
    try { const e = await response.json(); msg = e.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return (await response.json()) as CheckOrderResponse;
}