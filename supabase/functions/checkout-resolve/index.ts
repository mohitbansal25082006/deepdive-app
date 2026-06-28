// supabase/functions/checkout-resolve/index.ts
// Part 57 — SECURE CHECKOUT TOKEN RESOLVER.
// Part 57 FIX — "Order not found" resilience:
//   If the order row is missing in our DB at resolve time, this function now
//   SELF-HEALS from the Razorpay API (verifying ownership via the token's `sub`
//   and the order's notes.user_id) instead of returning a 404. The token's
//   signature is still the gate — only a validly-signed token can trigger this.
//
// Deploy:
//   supabase functions deploy checkout-resolve --no-verify-jwt
//
// Secrets: CHECKOUT_TOKEN_SECRET, RAZORPAY_KEY_ID, RAZORPAY_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  // Must include every header the checkout page may send, or the iOS Safari
  // CORS preflight (OPTIONS) fails with "Load failed" before the POST is sent.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

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

// ─── HS256 verify helpers ─────────────────────────────────────────────────────

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}
async function hmacVerify(message: string, sig: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(message));
}

function ok(data: object): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function fail(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

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
  if (req.method !== 'POST' && req.method !== 'GET') return fail('Method not allowed', 405);

  const secret    = Deno.env.get('CHECKOUT_TOKEN_SECRET');
  const razorpayK = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpayS = Deno.env.get('RAZORPAY_SECRET');
  if (!secret) return fail('Checkout token secret not configured', 500);

  // Token can arrive via POST body OR a GET query param (?token=...). The GET
  // path is a CORS "simple request" — no preflight — which the checkout page
  // uses as a fallback when the POST preflight is blocked on iOS Safari.
  let token: string | undefined;
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token') ?? undefined;
  } else {
    try {
      const body = await req.json() as { token?: string };
      token = body.token;
    } catch { return fail('Invalid JSON'); }
  }

  if (!token || typeof token !== 'string') return fail('Missing token');

  // ── Parse + verify signature ───────────────────────────────────────────────
  const parts = token.split('.');
  if (parts.length !== 3) return fail('Malformed token');
  const [head, payloadB64, sig] = parts;

  let valid: boolean;
  try { valid = await hmacVerify(`${head}.${payloadB64}`, sig, secret); }
  catch { return fail('Token verification failed', 401); }
  if (!valid) return fail('Invalid token signature', 401);

  // ── Verify claims ──────────────────────────────────────────────────────────
  let payload: any;
  try { payload = b64urlToJson<any>(payloadB64); }
  catch { return fail('Malformed token payload'); }

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== 'deepdive-checkout') return fail('Wrong audience', 401);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return fail('Token expired — please retry your purchase', 401);
  }
  if (!payload.oid || !payload.sub) return fail('Token missing required claims', 401);

  // ── Load the order row ─────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let { data: order } = await supabase
    .from('razorpay_orders')
    .select('user_id, status, amount, currency, credits_to_add, pack_id')
    .eq('razorpay_order_id', payload.oid)
    .maybeSingle();

  // ── Part 57 FIX: SELF-HEAL a missing row from Razorpay ─────────────────────
  if (!order && razorpayK && razorpayS) {
    const rzp = await fetchRzpOrder(payload.oid, razorpayK, razorpayS);
    if (rzp) {
      const noteUser = rzp.notes?.user_id ?? '';
      if (!noteUser || noteUser === payload.sub) {
        const packId  = rzp.notes?.pack_id ?? payload.pk ?? '';
        const credits = deriveCredits(packId, rzp.amount ?? payload.amt ?? 0);
        await supabase.from('razorpay_orders').upsert({
          user_id:           payload.sub,
          pack_id:           packId,
          razorpay_order_id: payload.oid,
          amount:            rzp.amount ?? payload.amt ?? 0,
          currency:          rzp.currency ?? payload.cur ?? 'INR',
          status:            rzp.status === 'paid' ? 'paid' : 'created',
          credits_to_add:    credits,
        }, { onConflict: 'razorpay_order_id' });

        const { data: healed } = await supabase
          .from('razorpay_orders')
          .select('user_id, status, amount, currency, credits_to_add, pack_id')
          .eq('razorpay_order_id', payload.oid)
          .maybeSingle();
        order = healed ?? null;
        if (order) console.log(`[CheckoutResolve] Self-healed missing order row for ${payload.oid}`);
      }
    }
  }

  if (!order)                          return fail('Order not found', 404);
  if (order.user_id !== payload.sub)   return fail('Token/order mismatch', 403);
  if (['paid', 'failed', 'expired'].includes(order.status)) {
    return fail(`Order is no longer payable (status: ${order.status})`, 409);
  }

  // ── Return only what the checkout page needs ───────────────────────────────
  return ok({
    order_id:     payload.oid,
    key_id:       payload.kid,
    amount:       order.amount,
    currency:     order.currency ?? 'INR',
    credits:      order.credits_to_add ?? payload.cr ?? 0,
    pack_name:    order.pack_id ?? payload.pk ?? '',
    description:  (order.credits_to_add ?? payload.cr) ? `${order.credits_to_add ?? payload.cr} credits` : 'Credit Pack',
    email:        payload.em ?? '',
    contact_name: payload.nm ?? 'Researcher',
    theme:        payload.th ?? null,
  });
});