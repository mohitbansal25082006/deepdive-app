// supabase/functions/razorpay-verify-payment/index.ts
// Part 24 (Fix) — Verifies a Razorpay payment signature and adds credits directly.
// Called by the app AFTER the checkout browser closes with payment_id + signature.
// This is the PRIMARY credit-adding mechanism (webhook is backup/idempotency only).
//
// Deploy:
//   supabase functions deploy razorpay-verify-payment --no-verify-jwt
//
// Secrets required (same as create-order):
//   RAZORPAY_KEY_ID
//   RAZORPAY_SECRET
//   SUPABASE_URL              (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── HMAC-SHA256 signature verification ──────────────────────────────────────
//
// Razorpay signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)

async function verifyPaymentSignature(
  orderId:   string,
  paymentId: string,
  signature: string,
  secret:    string,
): Promise<boolean> {
  try {
    const message = `${orderId}|${paymentId}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const hexSig    = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hexSig === signature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Authenticate the caller ────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const jwt = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────

  let body: {
    razorpay_payment_id: string;
    razorpay_order_id:   string;
    razorpay_signature:  string;
    user_id:             string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, user_id } = body;

  // Security: caller can only credit their own account
  if (user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return new Response(JSON.stringify({ error: 'Missing payment fields' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Verify Razorpay signature ──────────────────────────────────────────────

  const razorpaySecret = Deno.env.get('RAZORPAY_SECRET');
  if (!razorpaySecret) {
    console.error('RAZORPAY_SECRET not set');
    return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const isValid = await verifyPaymentSignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    razorpaySecret,
  );

  if (!isValid) {
    console.warn('[VerifyPayment] Invalid signature for payment:', razorpay_payment_id);
    return new Response(JSON.stringify({ error: 'Payment signature verification failed' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Look up the order to get credits_to_add and pack_id ───────────────────

  const { data: order, error: lookupError } = await supabase
    .from('razorpay_orders')
    .select('user_id, credits_to_add, pack_id, status')
    .eq('razorpay_order_id', razorpay_order_id)
    .single();

  if (lookupError || !order) {
    console.error('[VerifyPayment] Order not found:', razorpay_order_id, lookupError?.message);
    return new Response(JSON.stringify({ error: 'Order not found. Contact support.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Extra security: order must belong to the authenticated user
  if (order.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Order does not belong to this user' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Idempotency: already credited ─────────────────────────────────────────

  if (order.status === 'paid') {
    // Already processed — return current balance without adding again
    const { data: creditsRow } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    console.log('[VerifyPayment] Already processed, returning current balance:', creditsRow?.balance);

    return new Response(
      JSON.stringify({ success: true, balance: creditsRow?.balance ?? 0, already_processed: true }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // ── Add credits via SECURITY DEFINER RPC ──────────────────────────────────

  const { data: newBalance, error: creditError } = await supabase.rpc('add_credits', {
    p_user_id:           user.id,
    p_razorpay_order_id: razorpay_order_id,
    p_payment_id:        razorpay_payment_id,
    p_credits_to_add:    order.credits_to_add,
    p_pack_id:           order.pack_id,
    p_webhook_event_id:  null,
  });

  if (creditError) {
    console.error('[VerifyPayment] add_credits error:', creditError.message);
    return new Response(
      JSON.stringify({ error: 'Failed to add credits. Please contact support.', detail: creditError.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  console.log(
    `[VerifyPayment] ✓ Added ${order.credits_to_add} credits to user ${user.id}. ` +
    `New balance: ${newBalance}. Order: ${razorpay_order_id}`
  );

  return new Response(
    JSON.stringify({
      success:       true,
      balance:       newBalance as number,
      credits_added: order.credits_to_add,
    }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});