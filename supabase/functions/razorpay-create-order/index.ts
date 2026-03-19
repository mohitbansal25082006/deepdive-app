// supabase/functions/razorpay-create-order/index.ts
// Part 24 — Creates a Razorpay order and saves it to the DB.
//
// Deploy:
//   supabase functions deploy razorpay-create-order --no-verify-jwt
//   (JWT is verified manually using the Authorization header)
//
// Secrets required (set via supabase secrets set KEY=VALUE):
//   RAZORPAY_KEY_ID
//   RAZORPAY_SECRET
//   SUPABASE_URL          (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY  (auto-set by Supabase)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ─── CORS headers ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Pack definitions (must match src/constants/credits.ts) ──────────────────
// Hardcoded server-side to prevent tampering.

const PACK_DEFINITIONS: Record<string, { credits: number; bonusCredits: number; amountPaise: number; name: string; description: string }> = {
  'starter_99':    { credits: 50,   bonusCredits: 0,   amountPaise: 9900,  name: 'Starter',    description: '50 credits — perfect for getting started'       },
  'popular_249':   { credits: 150,  bonusCredits: 20,  amountPaise: 24900, name: 'Popular',    description: '170 credits (150 + 20 bonus)'                   },
  'pro_499':       { credits: 350,  bonusCredits: 50,  amountPaise: 49900, name: 'Pro Pack',   description: '400 credits (350 + 50 bonus) — best value'      },
  'unlimited_999': { credits: 1000, bonusCredits: 200, amountPaise: 99900, name: 'Power User', description: '1200 credits (1000 + 200 bonus) — heavy researchers' },
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status:  405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Authenticate request via JWT ────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status:  401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const jwt = authHeader.replace('Bearer ', '');

  // Use service role client to verify JWT and do DB writes
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Verify the JWT belongs to a real user
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status:  401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse request body ──────────────────────────────────────────────────────

  let body: { pack_id: string; user_id: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status:  400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { pack_id, user_id } = body;

  // Security: only allow the authenticated user to create orders for themselves
  if (user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
      status:  403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Validate pack ────────────────────────────────────────────────────────────

  const pack = PACK_DEFINITIONS[pack_id];
  if (!pack) {
    return new Response(JSON.stringify({ error: `Invalid pack_id: ${pack_id}` }), {
      status:  400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const totalCredits  = pack.credits + pack.bonusCredits;

  // ── Create Razorpay order ─────────────────────────────────────────────────

  const razorpayKeyId  = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpaySecret = Deno.env.get('RAZORPAY_SECRET');

  if (!razorpayKeyId || !razorpaySecret) {
    console.error('Razorpay credentials not set in Edge Function secrets');
    return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
      status:  500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const receipt = `deepdive_${user_id.slice(0, 8)}_${Date.now()}`;

  const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      // Razorpay uses HTTP Basic Auth: key_id:key_secret
      'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}`,
    },
    body: JSON.stringify({
      amount:   pack.amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        user_id:  user_id,
        pack_id,
        app_name: 'DeepDive AI',
      },
    }),
  });

  if (!rzpResponse.ok) {
    const rzpError = await rzpResponse.json().catch(() => ({}));
    console.error('Razorpay order creation failed:', rzpError);
    return new Response(JSON.stringify({ error: 'Razorpay order creation failed', details: rzpError }), {
      status:  502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const rzpOrder = await rzpResponse.json();

  // ── Save order to DB ─────────────────────────────────────────────────────

  const { error: dbError } = await supabase.rpc('create_razorpay_order_row', {
    p_user_id:           user_id,
    p_pack_id:           pack_id,
    p_razorpay_order_id: rzpOrder.id,
    p_amount:            pack.amountPaise,
    p_credits_to_add:    totalCredits,
  });

  if (dbError) {
    // Non-fatal — log but proceed; the payment can still work
    console.warn('DB order save failed:', dbError.message);
  }

  // ── Return order details to app ──────────────────────────────────────────

  return new Response(
    JSON.stringify({
      order_id:    rzpOrder.id,
      key_id:      razorpayKeyId,
      amount:      pack.amountPaise,
      currency:    'INR',
      credits:     totalCredits,
      pack_name:   pack.name,
      description: pack.description,
    }),
    {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    },
  );
});