// supabase/functions/checkout-token/index.ts
// Part 57 — SECURE CHECKOUT TOKEN MINTER (zero-leak URL).
// Part 57 FIX — "Order not found" resilience:
//   If the order row is missing in our DB (e.g. a transient write failure in
//   create-order, or an older deploy), this function NO LONGER dead-ends. It
//   fetches the order from the Razorpay API, verifies it belongs to this user
//   (via order.notes.user_id), and SELF-HEALS by inserting the row before
//   minting the token. The token is only refused if Razorpay also has no record
//   of the order, or the order genuinely isn't payable.
//
// Deploy:
//   supabase functions deploy checkout-token --no-verify-jwt
//   supabase secrets set CHECKOUT_TOKEN_SECRET=<a-long-random-string>
//
// Secrets: CHECKOUT_TOKEN_SECRET, RAZORPAY_KEY_ID, RAZORPAY_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Pack → credits (for deriving credits when self-healing a missing row).
const PACK_CREDITS: Record<string, number> = {
  'starter_99': 50, 'popular_249': 170, 'pro_499': 400, 'unlimited_999': 1200,
};
const AMOUNT_TO_CREDITS: Record<number, number> = {
  9900: 50, 24900: 170, 49900: 400, 99900: 1200,
};
function deriveCredits(packId: string, amountPaise: number): number {
  if (packId && PACK_CREDITS[packId]) return PACK_CREDITS[packId];
  if (AMOUNT_TO_CREDITS[amountPaise]) return AMOUNT_TO_CREDITS[amountPaise];
  return 0;
}

// ─── Compact HS256 JWS helpers ────────────────────────────────────────────────

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}
async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64urlEncode(new Uint8Array(sig));
}
async function mintToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head   = b64urlEncodeJson({ alg: 'HS256', typ: 'JWT' });
  const body   = b64urlEncodeJson(payload);
  const signed = `${head}.${body}`;
  const sig    = await hmacSign(signed, secret);
  return `${signed}.${sig}`;
}

interface ThemeSnapshot {
  primary: string; primaryLight: string; primaryDark: string; accent: string;
  background: string; backgroundCard: string; backgroundElevated: string;
  textPrimary: string; textSecondary: string; textMuted: string; border: string;
  gradP1: string; gradP2: string; gradCard1: string; gradCard2: string;
  isLight: boolean;
}

function err(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Best-effort fetch of a Razorpay order (used for self-healing).
async function fetchRzpOrder(orderId: string, keyId: string, keySecret: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type':  'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return err('Method not allowed', 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return err('Missing authorization', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authErr } =
    await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (authErr || !user) return err('Invalid session', 401);

  // ── Secrets ───────────────────────────────────────────────────────────────
  const tokenSecret = Deno.env.get('CHECKOUT_TOKEN_SECRET');
  const razorpayKey = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpaySec = Deno.env.get('RAZORPAY_SECRET');
  if (!tokenSecret) return err('Checkout token secret not configured', 500);
  if (!razorpayKey) return err('Razorpay key not configured', 500);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    razorpay_order_id: string;
    user_id:           string;
    theme?:            ThemeSnapshot;
    email?:            string;
    contact_name?:     string;
  };
  try { body = await req.json(); }
  catch { return err('Invalid JSON'); }

  const { razorpay_order_id, user_id, theme, email, contact_name } = body;
  if (!razorpay_order_id) return err('Missing razorpay_order_id');
  if (user_id !== user.id) return err('User mismatch', 403);

  // ── Load the order row ─────────────────────────────────────────────────────
  let { data: order } = await supabase
    .from('razorpay_orders')
    .select('user_id, razorpay_order_id, amount, currency, credits_to_add, pack_id, status')
    .eq('razorpay_order_id', razorpay_order_id)
    .maybeSingle();

  // ── Part 57 FIX: SELF-HEAL a missing row from Razorpay ─────────────────────
  if (!order) {
    if (!razorpaySec) return err('Order not found', 404);

    const rzp = await fetchRzpOrder(razorpay_order_id, razorpayKey, razorpaySec);
    if (!rzp) return err('Order not found', 404);

    // Verify ownership via the notes we stamped at create time.
    const noteUser = rzp.notes?.user_id ?? '';
    if (noteUser && noteUser !== user.id) {
      return err('Order does not belong to this user', 403);
    }

    const packId  = rzp.notes?.pack_id ?? '';
    const credits = deriveCredits(packId, rzp.amount ?? 0);

    await supabase.from('razorpay_orders').upsert({
      user_id:           user.id,
      pack_id:           packId,
      razorpay_order_id: razorpay_order_id,
      amount:            rzp.amount ?? 0,
      currency:          rzp.currency ?? 'INR',
      status:            rzp.status === 'paid' ? 'paid' : 'created',
      credits_to_add:    credits,
    }, { onConflict: 'razorpay_order_id' });

    const { data: healed } = await supabase
      .from('razorpay_orders')
      .select('user_id, razorpay_order_id, amount, currency, credits_to_add, pack_id, status')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    order = healed ?? null;
    if (!order) return err('Order not found', 404);
    console.log(`[CheckoutToken] Self-healed missing order row for ${razorpay_order_id}`);
  }

  if (order.user_id !== user.id) return err('Order does not belong to this user', 403);
  if (['paid', 'failed', 'expired'].includes(order.status)) {
    return err(`Order is no longer payable (status: ${order.status})`, 409);
  }

  // ── Mint the signed token ──────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'deepdive-checkout-token',
    aud: 'deepdive-checkout',
    sub: user.id,
    iat: now,
    exp: now + 300,
    oid: order.razorpay_order_id,
    kid: razorpayKey,
    amt: order.amount,
    cur: order.currency ?? 'INR',
    cr:  order.credits_to_add ?? 0,
    pk:  order.pack_id ?? '',
    em:  email        ?? user.email ?? '',
    nm:  contact_name ?? 'Researcher',
    th:  theme ?? null,
  };

  const token = await mintToken(payload, tokenSecret);

  return new Response(
    JSON.stringify({ token, expires_in: 300 }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});