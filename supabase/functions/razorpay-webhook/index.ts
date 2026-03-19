// supabase/functions/razorpay-webhook/index.ts
// Part 24 — Verifies Razorpay webhook signatures and credits users after
// a successful payment.
//
// Deploy:
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//   (Webhook calls come from Razorpay servers, not from app users)
//
// Secrets required:
//   RAZORPAY_WEBHOOK_SECRET   (set in Razorpay Dashboard → Webhooks)
//   SUPABASE_URL              (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set)
//
// Razorpay Dashboard webhook URL:
//   https://<project>.supabase.co/functions/v1/razorpay-webhook
//
// Events to subscribe to in Razorpay Dashboard:
//   ✓ payment.captured
//   ✓ payment.failed (optional — for logging)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ─── CORS (only Razorpay servers need to call this) ──────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type, x-razorpay-signature, x-razorpay-event-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── HMAC signature verification ─────────────────────────────────────────────

async function verifyRazorpaySignature(
  rawBody:   string,
  signature: string,
  secret:    string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const hexSig    = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hexSig === signature;
  } catch (err) {
    console.error('HMAC verification error:', err);
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // ── Read raw body (needed for HMAC verification) ──────────────────────────

  const rawBody = await req.text();

  // ── Verify signature ──────────────────────────────────────────────────────

  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not set');
    // Return 200 to prevent Razorpay from retrying — this is a config error
    return new Response('Webhook secret not configured', { status: 200, headers: CORS });
  }

  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const isValid   = await verifyRazorpaySignature(rawBody, signature, webhookSecret);

  if (!isValid) {
    console.warn('Invalid Razorpay signature — request rejected');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status:  400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse event ───────────────────────────────────────────────────────────

  let event: { event: string; payload: Record<string, any>; account_id?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status:  400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const eventId = req.headers.get('x-razorpay-event-id') ?? undefined;

  console.log(`[Webhook] Event: ${event.event}, EventID: ${eventId ?? 'none'}`);

  // ── Handle payment.captured ───────────────────────────────────────────────

  if (event.event === 'payment.captured') {
    const payment  = event.payload?.payment?.entity;
    if (!payment) {
      console.warn('[Webhook] Missing payment entity in payload');
      return new Response('ok', { status: 200, headers: CORS });
    }

    const razorpayOrderId = payment.order_id  as string;
    const paymentId       = payment.id        as string;
    const capturedAmount  = payment.amount    as number;  // in paise

    if (!razorpayOrderId) {
      console.warn('[Webhook] Missing order_id in payment entity');
      return new Response('ok', { status: 200, headers: CORS });
    }

    // Create Supabase service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Look up the order in our DB to get user_id and credits_to_add
    const { data: order, error: lookupError } = await supabase
      .from('razorpay_orders')
      .select('user_id, credits_to_add, pack_id, status')
      .eq('razorpay_order_id', razorpayOrderId)
      .single();

    if (lookupError || !order) {
      // Order not found — could be a test payment not created through the app
      console.warn(`[Webhook] Order not found for razorpay_order_id: ${razorpayOrderId}`);
      return new Response('ok', { status: 200, headers: CORS });
    }

    if (order.status === 'paid') {
      // Already processed — idempotency check passed
      console.log(`[Webhook] Order ${razorpayOrderId} already marked paid — skipping`);
      return new Response('ok', { status: 200, headers: CORS });
    }

    // Add credits via the SECURITY DEFINER RPC
    const { data: newBalance, error: creditError } = await supabase.rpc('add_credits', {
      p_user_id:           order.user_id,
      p_razorpay_order_id: razorpayOrderId,
      p_payment_id:        paymentId,
      p_credits_to_add:    order.credits_to_add,
      p_pack_id:           order.pack_id,
      p_webhook_event_id:  eventId ?? null,
    });

    if (creditError) {
      console.error('[Webhook] add_credits RPC error:', creditError.message);
      // Return 200 anyway — Razorpay will NOT retry on 200.
      // A retry on a non-200 could cause duplicate credits.
      return new Response(
        JSON.stringify({ status: 'credit_error', message: creditError.message }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    console.log(
      `[Webhook] ✓ Added ${order.credits_to_add} credits to user ${order.user_id}. ` +
      `New balance: ${newBalance}. Order: ${razorpayOrderId}`
    );
  }

  // ── Handle payment.failed (optional logging) ──────────────────────────────

  else if (event.event === 'payment.failed') {
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;

    if (orderId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      await supabase
        .from('razorpay_orders')
        .update({ status: 'failed' })
        .eq('razorpay_order_id', orderId)
        .neq('status', 'paid');   // Don't downgrade an already-paid order

      console.log(`[Webhook] Payment failed for order: ${orderId}`);
    }
  }

  // Always return 200 so Razorpay doesn't retry unnecessarily
  return new Response(JSON.stringify({ status: 'ok' }), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});