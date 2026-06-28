// supabase/functions/razorpay-create-order/index.ts
// Part 24 / 32 / 57. FINAL order-persistence fix.
//
// "Could not save your order" had THREE possible root causes, all with the same
// symptom: RLS demotion, 42P10 (no inferable unique constraint for upsert), or a
// NOT NULL / RPC-signature mismatch. This version removes every one of them:
//
//   • TWO clients: authClient (only getUser) + db (PURE service-role, header
//     pinned so it can never be demoted → always bypasses RLS).
//   • Persistence goes through ONE SECURITY DEFINER function, upsert_razorpay_order
//     (see schema_part57_orderfix_v3.sql), which does a manual UPDATE-else-INSERT
//     — no ON CONFLICT inference (so no 42P10) and runs as table owner (no RLS).
//   • If anything still fails, the REAL Postgres error is returned in `debug`
//     and logged — no silent swallow.
//
// REQUIRED: run schema_part57_orderfix_v3.sql first (creates the RPC).
//
// Deploy:
//   supabase functions deploy razorpay-create-order --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PACK_DEFINITIONS: Record<string, {
  credits: number; bonusCredits: number; amountPaise: number; name: string; description: string;
}> = {
  'starter_99':    { credits: 50,   bonusCredits: 0,   amountPaise: 9900,  name: 'Starter',    description: '50 credits — perfect for getting started'            },
  'popular_249':   { credits: 150,  bonusCredits: 20,  amountPaise: 24900, name: 'Popular',    description: '170 credits (150 + 20 bonus)'                        },
  'pro_499':       { credits: 350,  bonusCredits: 50,  amountPaise: 49900, name: 'Pro Pack',   description: '400 credits (350 + 50 bonus) — best value'           },
  'unlimited_999': { credits: 1000, bonusCredits: 200, amountPaise: 99900, name: 'Power User', description: '1200 credits (1000 + 200 bonus) — heavy researchers' },
};

function json(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// PURE service-role client — Authorization header pinned so a user token can
// never demote it. Always bypasses RLS.
function makeServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth:   { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${SERVICE_KEY}` } },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // ── Auth (throwaway client; never used for writes) ─────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization header' }, 401);
  const jwt = authHeader.replace('Bearer ', '');

  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Invalid or expired session' }, 401);

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: { pack_id: string; user_id: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { pack_id, user_id } = body;
  if (user_id !== user.id) return json({ error: 'User ID mismatch' }, 403);

  const pack = PACK_DEFINITIONS[pack_id];
  if (!pack) return json({ error: `Invalid pack_id: ${pack_id}` }, 400);
  const totalCredits = pack.credits + pack.bonusCredits;

  // ── Razorpay creds ─────────────────────────────────────────────────────────
  const razorpayKeyId  = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpaySecret = Deno.env.get('RAZORPAY_SECRET');
  if (!razorpayKeyId || !razorpaySecret) return json({ error: 'Payment service not configured' }, 500);
  const isTestOrder = razorpayKeyId.startsWith('rzp_test_');

  // ── Create Razorpay order ─────────────────────────────────────────────────
  const receipt = `deepdive_${user_id.slice(0, 8)}_${Date.now()}`;
  const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}`,
    },
    body: JSON.stringify({
      amount: pack.amountPaise, currency: 'INR', receipt,
      notes: { user_id, pack_id, app_name: 'DeepDive AI', is_test: String(isTestOrder) },
    }),
  });
  if (!rzpResponse.ok) {
    const rzpError = await rzpResponse.json().catch(() => ({}));
    console.error('Razorpay order creation failed:', rzpError);
    return json({ error: 'Razorpay order creation failed', details: rzpError }, 502);
  }
  const rzpOrder = await rzpResponse.json();

  // ── Persist via the ONE robust SECURITY DEFINER RPC ────────────────────────
  const db = makeServiceClient();
  const errors: string[] = [];
  let persisted = false;

  // Primary path: upsert_razorpay_order (manual update-else-insert, no RLS, no 42P10).
  {
    const { error } = await db.rpc('upsert_razorpay_order', {
      p_user_id:           user_id,
      p_pack_id:           pack_id,
      p_razorpay_order_id: rzpOrder.id,
      p_amount:            pack.amountPaise,
      p_credits_to_add:    totalCredits,
      p_is_test:           isTestOrder,
    });
    if (error) errors.push(`upsert_rpc: ${error.message}`);
    else persisted = true;
  }

  // Fallback A: legacy RPC (older deploys that haven't run v3 SQL yet).
  if (!persisted) {
    const { error } = await db.rpc('create_razorpay_order_row', {
      p_user_id:           user_id,
      p_pack_id:           pack_id,
      p_razorpay_order_id: rzpOrder.id,
      p_amount:            pack.amountPaise,
      p_credits_to_add:    totalCredits,
    });
    if (error) errors.push(`legacy_rpc: ${error.message}`);
    else persisted = true;
  }

  // Fallback B: direct insert (no ON CONFLICT — avoids 42P10).
  if (!persisted) {
    const { error } = await db.from('razorpay_orders').insert({
      user_id, pack_id,
      razorpay_order_id: rzpOrder.id,
      amount: pack.amountPaise, currency: 'INR',
      status: 'created', credits_to_add: totalCredits,
    });
    if (error) errors.push(`insert: ${error.message}`);
    else persisted = true;
  }

  // ── Verify with a service-role read ────────────────────────────────────────
  const { data: check, error: checkErr } = await db
    .from('razorpay_orders')
    .select('razorpay_order_id')
    .eq('razorpay_order_id', rzpOrder.id)
    .maybeSingle();
  if (checkErr) errors.push(`verify: ${checkErr.message}`);

  if (!check) {
    console.error('[CreateOrder] CRITICAL: not persisted', rzpOrder.id, errors);
    return json({
      error:    'Could not save your order. No charges were made. Please try again.',
      debug:    errors,
      order_id: rzpOrder.id,
    }, 500);
  }

  console.log(`[CreateOrder] ✓ ${rzpOrder.id} persisted (is_test=${isTestOrder}).`);
  return json({
    order_id: rzpOrder.id, key_id: razorpayKeyId, amount: pack.amountPaise,
    currency: 'INR', credits: totalCredits, pack_name: pack.name,
    description: pack.description, is_test: isTestOrder,
  }, 200);
});