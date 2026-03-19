// supabase/functions/razorpay-check-order/index.ts
// Part 24 (Fix v6) — Checks the INDIVIDUAL PAYMENT status, not just order status.
//
// KEY FIX: order_status=attempted + payments=1 means a payment was tried.
// The payment's OWN status field tells us what happened:
//   "failed"     → stop polling immediately, return payment_failed: true
//   "captured"   → add credits now
//   "authorized" → add credits now (auto-capture will follow)
//   "created"    → payment still processing, keep polling

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PACK_CREDITS: Record<string, number> = {
  'starter_99':    50,
  'popular_249':   170,
  'pro_499':       400,
  'unlimited_999': 1200,
};

const AMOUNT_TO_CREDITS: Record<number, number> = {
  9900:  50,
  24900: 170,
  49900: 400,
  99900: 1200,
};

function creditsFromPackId(packId: string): number {
  return PACK_CREDITS[packId] ?? 0;
}

function creditsFromAmount(amountPaise: number): number {
  if (AMOUNT_TO_CREDITS[amountPaise]) return AMOUNT_TO_CREDITS[amountPaise];
  const nearest = Object.keys(AMOUNT_TO_CREDITS)
    .map(Number)
    .sort((a, b) => Math.abs(a - amountPaise) - Math.abs(b - amountPaise))[0];
  return nearest ? AMOUNT_TO_CREDITS[nearest] : 0;
}

async function rzpFetch(path: string, keyId: string, keySecret: string) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method:  'GET',
    headers: {
      'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'Content-Type':  'application/json',
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Razorpay API ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function ok(data: object): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function err(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return err('Method not allowed', 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return err('Missing authorization', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (authErr || !user) return err('Invalid session', 401);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { razorpay_order_id: string; user_id: string };
  try { body = await req.json(); }
  catch { return err('Invalid JSON'); }

  const { razorpay_order_id, user_id } = body;
  if (!razorpay_order_id || !user_id) return err('Missing required fields');
  if (user_id !== user.id) return err('User mismatch', 403);

  const keyId     = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_SECRET');
  if (!keyId || !keySecret) return err('Razorpay not configured', 500);

  // ── Step 1: DB fast-path ──────────────────────────────────────────────────
  let dbCreditsToAdd = 0;
  let dbPackId       = '';

  const { data: dbOrder } = await supabase
    .from('razorpay_orders')
    .select('user_id, credits_to_add, pack_id, status')
    .eq('razorpay_order_id', razorpay_order_id)
    .maybeSingle();

  if (dbOrder) {
    if (dbOrder.user_id !== user.id) return err('Order does not belong to this user', 403);
    dbCreditsToAdd = dbOrder.credits_to_add ?? 0;
    dbPackId       = dbOrder.pack_id        ?? '';

    if (dbOrder.status === 'paid') {
      const { data: cr } = await supabase
        .from('user_credits').select('balance').eq('user_id', user.id).single();
      return ok({ paid: true, already_processed: true, balance: cr?.balance ?? 0, credits_added: 0 });
    }
  }

  // ── Step 2: Get order from Razorpay API ───────────────────────────────────
  let rzpOrder: any;
  try {
    rzpOrder = await rzpFetch(`/orders/${razorpay_order_id}`, keyId, keySecret);
    console.log(`[CheckOrder] order_id=${razorpay_order_id} order_status=${rzpOrder.status} amount=${rzpOrder.amount}`);
  } catch (e) {
    console.error('[CheckOrder] Razorpay order fetch failed:', e);
    return ok({ paid: false, order_status: 'unknown', payment_count: 0 });
  }

  // Verify ownership
  const orderUserId = rzpOrder.notes?.user_id ?? '';
  if (orderUserId && orderUserId !== user.id) return err('Order user mismatch', 403);

  // Derive credits
  if (!dbCreditsToAdd) {
    const packId   = rzpOrder.notes?.pack_id ?? '';
    dbPackId       = packId;
    dbCreditsToAdd = packId ? creditsFromPackId(packId) : creditsFromAmount(rzpOrder.amount ?? 0);
    console.log(`[CheckOrder] Derived credits=${dbCreditsToAdd} from pack_id="${packId}" amount=${rzpOrder.amount}`);
  }

  if (!dbCreditsToAdd) {
    console.error('[CheckOrder] Could not determine credits_to_add');
    return ok({ paid: false, order_status: rzpOrder.status, payment_count: 0 });
  }

  // Upsert DB row if missing
  if (!dbOrder) {
    await supabase.from('razorpay_orders').upsert({
      user_id: user.id, pack_id: dbPackId,
      razorpay_order_id, amount: rzpOrder.amount ?? 0,
      currency: rzpOrder.currency ?? 'INR',
      status: 'created', credits_to_add: dbCreditsToAdd,
    }, { onConflict: 'razorpay_order_id', ignoreDuplicates: false });
  }

  // ── Step 3: Get payments and check individual payment status ──────────────
  let payments: any[] = [];
  try {
    const data = await rzpFetch(`/orders/${razorpay_order_id}/payments`, keyId, keySecret);
    payments = data.items ?? [];
    console.log(
      `[CheckOrder] ${payments.length} payment(s). Statuses: ${payments.map((p: any) => p.status).join(', ') || 'none'}`,
    );
  } catch (e) {
    console.warn('[CheckOrder] Could not fetch payments:', e);
    return ok({ paid: false, order_status: rzpOrder.status, payment_count: 0 });
  }

  // ── KEY FIX: Inspect each payment's own status field ─────────────────────

  // Check for a successful payment first
  const successPayment = payments.find(
    (p: any) => p.status === 'captured' || p.status === 'authorized',
  );

  if (successPayment) {
    // Payment succeeded — fall through to add credits
    console.log(`[CheckOrder] Successful payment: id=${successPayment.id} status=${successPayment.status}`);
  } else {
    // No successful payment — check if ALL payments failed
    const allFailed = payments.length > 0 && payments.every((p: any) => p.status === 'failed');

    if (allFailed) {
      // Every payment attempt for this order has failed — stop polling immediately
      const failedPayment = payments[0];
      const failReason    = failedPayment?.error_description
        ?? failedPayment?.error_reason
        ?? 'Payment was declined';

      console.log(`[CheckOrder] All ${payments.length} payment(s) failed. Reason: ${failReason}`);

      return ok({
        paid:           false,
        payment_failed: true,          // ← tells the app to stop polling NOW
        order_status:   rzpOrder.status,
        payment_count:  payments.length,
        fail_reason:    failReason,
      });
    }

    // Some payments are in an intermediate state (created/processing) — keep polling
    console.log(`[CheckOrder] No successful payment yet. Order: ${rzpOrder.status}`);
    return ok({
      paid:          false,
      order_status:  rzpOrder.status,
      payment_count: payments.length,
    });
  }

  // ── Step 4: Add credits ───────────────────────────────────────────────────
  console.log(`[CheckOrder] Adding ${dbCreditsToAdd} credits to user ${user.id}`);

  const { data: newBalance, error: creditErr } = await supabase.rpc('add_credits', {
    p_user_id:           user.id,
    p_razorpay_order_id: razorpay_order_id,
    p_payment_id:        successPayment.id,
    p_credits_to_add:    dbCreditsToAdd,
    p_pack_id:           dbPackId,
    p_webhook_event_id:  null,
  });

  if (creditErr) {
    console.error('[CheckOrder] add_credits error:', creditErr.message);
    return new Response(
      JSON.stringify({ paid: false, error: `Failed to add credits: ${creditErr.message}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[CheckOrder] ✓ Added ${dbCreditsToAdd} credits to ${user.id}. New balance: ${newBalance}`);

  return ok({ paid: true, balance: newBalance as number, credits_added: dbCreditsToAdd });
});