-- ============================================================
-- DeepDive AI — Part 24: Complete Credits Schema
-- Single migration file combining all patches.
-- Run this ONCE in Supabase SQL Editor on a fresh project.
-- If you already ran partial patches, run the SAFE RE-RUN
-- section at the bottom instead.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. USER CREDITS TABLE ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_credits (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance             INTEGER     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased     INTEGER     NOT NULL DEFAULT 0,
  total_consumed      INTEGER     NOT NULL DEFAULT 0,
  free_credits_given  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add any missing columns (safe on existing table)
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS total_purchased    INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS total_consumed     INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS free_credits_given BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- ── 2. CREDIT TRANSACTIONS TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,
  amount        INTEGER     NOT NULL,
  balance_after INTEGER     NOT NULL,
  feature       TEXT,
  pack_id       TEXT,
  order_id      TEXT,
  payment_id    TEXT,
  description   TEXT        NOT NULL DEFAULT '',
  metadata      JSONB       DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop broken constraint if it exists, do not recreate it
-- (The constraint was causing errors with 'signup_bonus' type)
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add missing columns
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS feature     TEXT;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS pack_id     TEXT;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS order_id    TEXT;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS payment_id  TEXT;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS metadata    JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_tx_user
  ON public.credit_transactions(user_id, created_at DESC);

-- ── 3. RAZORPAY ORDERS TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.razorpay_orders (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id             TEXT        NOT NULL,
  razorpay_order_id   TEXT        NOT NULL UNIQUE,
  amount              INTEGER     NOT NULL,
  currency            TEXT        NOT NULL DEFAULT 'INR',
  status              TEXT        NOT NULL DEFAULT 'created',
  credits_to_add      INTEGER     NOT NULL,
  payment_id          TEXT,
  webhook_event_id    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ
);

-- Add missing columns
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS payment_id       TEXT;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS currency         TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE public.razorpay_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rp_orders_user   ON public.razorpay_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_orders_rzp_id ON public.razorpay_orders(razorpay_order_id);

-- ── 4. RLS POLICIES ───────────────────────────────────────────────────────────

-- user_credits
DROP POLICY IF EXISTS "credits_select_own" ON public.user_credits;
CREATE POLICY "credits_select_own" ON public.user_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- credit_transactions
DROP POLICY IF EXISTS "tx_select_own" ON public.credit_transactions;
CREATE POLICY "tx_select_own" ON public.credit_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- razorpay_orders
DROP POLICY IF EXISTS "rp_orders_select_own" ON public.razorpay_orders;
CREATE POLICY "rp_orders_select_own" ON public.razorpay_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 5. TRIGGER: auto-update updated_at ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER trg_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 6. FUNCTIONS ─────────────────────────────────────────────────────────────

-- 6a. ensure_user_credits — creates row + 50 signup bonus if missing
CREATE OR REPLACE FUNCTION public.ensure_user_credits(p_user_id UUID)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_credits;
BEGIN
  SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.user_credits
    (user_id, balance, total_purchased, total_consumed, free_credits_given)
  VALUES (p_user_id, 50, 0, 0, TRUE)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, description)
  SELECT p_user_id, 'signup_bonus', 50, 50, 'Welcome bonus — 50 free credits!'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND type = 'signup_bonus'
  );

  RETURN v_row;
END;
$$;

-- 6b. get_user_credits — alias for ensure_user_credits
CREATE OR REPLACE FUNCTION public.get_user_credits(p_user_id UUID)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.ensure_user_credits(p_user_id);
END;
$$;

-- 6c. consume_credits — atomic deduction with balance check
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id     UUID,
  p_feature     TEXT,
  p_cost        INTEGER,
  p_description TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  PERFORM public.ensure_user_credits(p_user_id);

  SELECT balance INTO v_balance
  FROM   public.user_credits
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF v_balance < p_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: balance=%, required=%', v_balance, p_cost;
  END IF;

  UPDATE public.user_credits
  SET    balance        = balance - p_cost,
         total_consumed = total_consumed + p_cost,
         updated_at     = NOW()
  WHERE  user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, feature, description)
  VALUES
    (p_user_id, 'consume', -p_cost, v_balance, p_feature,
     COALESCE(NULLIF(p_description,''), 'Used '||p_cost||' credits for '||p_feature));

  RETURN v_balance;
END;
$$;

-- 6d. add_credits — idempotent credit addition after payment
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id           UUID,
  p_razorpay_order_id TEXT,
  p_payment_id        TEXT,
  p_credits_to_add    INTEGER,
  p_pack_id           TEXT,
  p_webhook_event_id  TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_status TEXT;
  v_balance      INTEGER;
BEGIN
  SELECT status INTO v_order_status
  FROM   public.razorpay_orders
  WHERE  razorpay_order_id = p_razorpay_order_id;

  IF v_order_status = 'paid' THEN
    SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.razorpay_orders
  SET    status           = 'paid',
         payment_id       = p_payment_id,
         webhook_event_id = p_webhook_event_id,
         paid_at          = NOW()
  WHERE  razorpay_order_id = p_razorpay_order_id;

  INSERT INTO public.user_credits
    (user_id, balance, total_purchased, total_consumed, free_credits_given)
  VALUES (p_user_id, 0, 0, 0, FALSE)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_credits
  SET    balance         = balance + p_credits_to_add,
         total_purchased = total_purchased + p_credits_to_add,
         updated_at      = NOW()
  WHERE  user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, pack_id, order_id, payment_id, description)
  VALUES
    (p_user_id, 'purchase', p_credits_to_add, v_balance,
     p_pack_id, p_razorpay_order_id, p_payment_id,
     'Purchased '||p_credits_to_add||' credits ('||p_pack_id||')');

  RETURN v_balance;
END;
$$;

-- 6e. create_razorpay_order_row — called by Edge Function
CREATE OR REPLACE FUNCTION public.create_razorpay_order_row(
  p_user_id           UUID,
  p_pack_id           TEXT,
  p_razorpay_order_id TEXT,
  p_amount            INTEGER,
  p_credits_to_add    INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.razorpay_orders
    (user_id, pack_id, razorpay_order_id, amount, credits_to_add)
  VALUES
    (p_user_id, p_pack_id, p_razorpay_order_id, p_amount, p_credits_to_add)
  ON CONFLICT (razorpay_order_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 7. GRANTS ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.ensure_user_credits(UUID)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_credits(UUID)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, INTEGER, TEXT)           TO authenticated;

-- ── 8. SEED: create credits rows for ALL existing users who don't have one ────

INSERT INTO public.user_credits
  (user_id, balance, total_purchased, total_consumed, free_credits_given)
SELECT p.id, 50, 0, 0, TRUE
FROM auth.users p
LEFT JOIN public.user_credits uc ON uc.user_id = p.id
WHERE uc.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 9. VERIFY ─────────────────────────────────────────────────────────────────

SELECT
  uc.user_id,
  uc.balance,
  uc.total_purchased,
  uc.free_credits_given,
  au.email
FROM public.user_credits uc
JOIN auth.users au ON au.id = uc.user_id
ORDER BY au.created_at DESC;