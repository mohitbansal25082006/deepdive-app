-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — schema_part57_FINAL.sql
-- The single, consolidated Part 57 migration. Run this ONCE in the Supabase SQL
-- Editor. Fully idempotent — safe to re-run. Supersedes every interim Part 57
-- SQL patch (orderfix v1–v6, rls_fix, etc.).
--
-- WHAT THIS DOES
--   SECTION A — Remove Refer & Earn (tables, RPCs, analytics references).
--   SECTION B — Make Razorpay order persistence bulletproof:
--                 • ensure every needed column on razorpay_orders exists
--                 • auto-default ALL not-null/no-default columns (NULL-proof)
--                 • seed credit_packs so the pack_id FK is satisfied
--                 • one robust SECURITY DEFINER upsert_razorpay_order()
--   SECTION C — Secure-checkout hardening (expire_stale_orders + index).
--   SECTION D — Smoke test that proves an order row inserts end-to-end.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION A — REMOVE REFER & EARN                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- A1. Drop referral RPCs.
DROP FUNCTION IF EXISTS public.get_or_create_referral_code(UUID);
DROP FUNCTION IF EXISTS public.get_referral_stats(UUID);
DROP FUNCTION IF EXISTS public.redeem_referral_code(UUID, TEXT);

-- A2. Drop referral tables (redemptions first — it references codes).
DROP TABLE IF EXISTS public.referral_redemptions CASCADE;
DROP TABLE IF EXISTS public.referral_codes        CASCADE;

-- A3. Rewrite get_user_analytics_data WITHOUT any referral references.
--     (Historical 'referral_bonus' rows in credit_transactions are intentionally
--      KEPT for audit/balance accuracy — we never delete user ledger rows.)
CREATE OR REPLACE FUNCTION public.get_user_analytics_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly_goal        INTEGER;
  v_total_reports       BIGINT;
  v_reports_this_month  BIGINT;
  v_expert_reports      BIGINT;
  v_total_sources_all   NUMERIC;
  v_total_words         NUMERIC;
  v_total_podcasts      BIGINT;
  v_total_debates       BIGINT;
  v_total_papers        BIGINT;
  v_total_presentations BIGINT;
  v_kb_queries_count    BIGINT;
  v_activity_dates      JSON;
  v_daily_counts        JSON;
  v_topic_distribution  JSON;
BEGIN
  SELECT monthly_report_goal INTO v_monthly_goal
  FROM   public.user_onboarding WHERE user_id = p_user_id;
  v_monthly_goal := COALESCE(v_monthly_goal, 10);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())),
    COUNT(*) FILTER (WHERE depth = 'expert'),
    COALESCE(SUM(sources_count), 0),
    COALESCE(SUM(CASE depth
      WHEN 'quick' THEN 1800 WHEN 'deep' THEN 4200
      WHEN 'expert' THEN 7500 ELSE 3000 END), 0)
  INTO v_total_reports, v_reports_this_month, v_expert_reports,
       v_total_sources_all, v_total_words
  FROM public.research_reports
  WHERE user_id = p_user_id AND status = 'completed';

  v_total_podcasts      := public.safe_count('podcasts',        p_user_id, 'completed');
  v_total_debates       := public.safe_count('debate_sessions', p_user_id, 'completed');
  v_total_papers        := public.safe_count('academic_papers', p_user_id);
  v_total_presentations := public.safe_count('presentations',   p_user_id);

  v_kb_queries_count := public.safe_count('kb_messages', p_user_id, NULL, 'user');
  IF v_kb_queries_count = 0 THEN
    v_kb_queries_count := public.safe_count('assistant_messages', p_user_id, NULL, 'user');
  END IF;

  SELECT COALESCE(json_agg(DISTINCT act_date::TEXT ORDER BY act_date::TEXT DESC), '[]'::JSON)
  INTO v_activity_dates
  FROM (
    SELECT DATE(created_at) AS act_date
    FROM public.research_reports
    WHERE user_id = p_user_id AND status = 'completed'
      AND created_at > NOW() - INTERVAL '90 days'
  ) base_acts;

  SELECT COALESCE(json_agg(json_build_object('date', d::TEXT, 'count', cnt) ORDER BY d DESC), '[]'::JSON)
  INTO v_daily_counts
  FROM (
    SELECT DATE(created_at) AS d, COUNT(*) AS cnt
    FROM public.research_reports
    WHERE user_id = p_user_id AND status = 'completed'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
  ) day_agg;

  SELECT COALESCE(json_agg(json_build_object('keyword', topic_keyword, 'score', affinity_score)
                  ORDER BY affinity_score DESC), '[]'::JSON)
  INTO v_topic_distribution
  FROM public.user_topic_affinity
  WHERE user_id = p_user_id
  LIMIT 8;

  RETURN jsonb_build_object(
    'total_reports',       v_total_reports,
    'reports_this_month',  v_reports_this_month,
    'monthly_goal',        v_monthly_goal,
    'expert_reports',      v_expert_reports,
    'total_sources_all',   v_total_sources_all,
    'total_words',         v_total_words,
    'total_podcasts',      v_total_podcasts,
    'total_debates',       v_total_debates,
    'total_papers',        v_total_papers,
    'total_presentations', v_total_presentations,
    'kb_queries_count',    v_kb_queries_count,
    'activity_dates',      v_activity_dates,
    'daily_counts',        v_daily_counts,
    'topic_distribution',  v_topic_distribution
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_analytics_data(UUID) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION B — RAZORPAY ORDER PERSISTENCE (bulletproof)                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- B0. Ensure the table exists with a modern shape.
CREATE TABLE IF NOT EXISTS public.razorpay_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  pack_id           TEXT,
  razorpay_order_id TEXT NOT NULL,
  amount            INTEGER NOT NULL DEFAULT 0,
  currency          TEXT    NOT NULL DEFAULT 'INR',
  status            TEXT    NOT NULL DEFAULT 'created',
  credits_to_add    INTEGER NOT NULL DEFAULT 0,
  is_test           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- B1. Ensure modern columns exist (for pre-existing tables).
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS pack_id        TEXT;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS amount         INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS currency       TEXT        NOT NULL DEFAULT 'INR';
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS status         TEXT        NOT NULL DEFAULT 'created';
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS credits_to_add INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS is_test        BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.razorpay_orders ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- B2. Auto-default EVERY not-null column lacking a default on razorpay_orders.
--     (Neutralises legacy NOT-NULL columns like amount_inr, credits, receipt…)
DO $$
DECLARE r RECORD; v_default TEXT;
BEGIN
  FOR r IN
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='razorpay_orders'
      AND is_nullable='NO' AND column_default IS NULL
      AND is_generated='NEVER' AND column_name <> 'id'
  LOOP
    IF r.data_type IN ('integer','bigint','smallint','numeric','double precision','real') THEN v_default:='0';
    ELSIF r.data_type='boolean' THEN v_default:='false';
    ELSIF r.data_type IN ('timestamp with time zone','timestamp without time zone','date') THEN v_default:='now()';
    ELSIF r.data_type='uuid' THEN CONTINUE;
    ELSIF r.data_type='jsonb' THEN v_default:='''{}''::jsonb';
    ELSIF r.data_type='json' THEN v_default:='''{}''::json';
    ELSE v_default:='''''';
    END IF;
    EXECUTE format('ALTER TABLE public.razorpay_orders ALTER COLUMN %I SET DEFAULT %s', r.column_name, v_default);
    EXECUTE format('UPDATE public.razorpay_orders SET %I = %s WHERE %I IS NULL', r.column_name, v_default, r.column_name);
    RAISE NOTICE 'razorpay_orders: auto-defaulted % (% -> %)', r.column_name, r.data_type, v_default;
  END LOOP;
END $$;

-- B3. UNIQUE constraint on razorpay_order_id (idempotency + upserts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid=i.indrelid
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
    WHERE c.relname='razorpay_orders' AND i.indisunique AND a.attname='razorpay_order_id'
  ) THEN
    BEGIN
      ALTER TABLE public.razorpay_orders
        ADD CONSTRAINT razorpay_orders_razorpay_order_id_key UNIQUE (razorpay_order_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- B4. Seed credit_packs so the pack_id FK is satisfied (defensive to its schema).
--     Mirrors PACK_DEFINITIONS in razorpay-create-order.
DO $$
DECLARE
  v_fk_col   TEXT;
  v_cols     TEXT[];
  v_pack     RECORD;
  v_icols    TEXT;
  v_ivals    TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='credit_packs') THEN
    RAISE NOTICE 'credit_packs missing - skipping seed.';
    RETURN;
  END IF;

  -- Identify the column the FK references (fallback to id / pack_id).
  SELECT att.attname INTO v_fk_col
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class frel ON frel.oid = con.confrelid
  JOIN pg_attribute att ON att.attrelid = frel.oid AND att.attnum = ANY(con.confkey)
  WHERE rel.relname='razorpay_orders' AND con.contype='f' AND frel.relname='credit_packs'
  LIMIT 1;

  IF v_fk_col IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='credit_packs' AND column_name='id')
    THEN v_fk_col:='id'; ELSE v_fk_col:='pack_id'; END IF;
  END IF;

  SELECT array_agg(column_name) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='credit_packs';

  FOR v_pack IN
    SELECT * FROM (VALUES
      ('starter_99',    'Starter',    50,   9900,  99),
      ('popular_249',   'Popular',    170,  24900, 249),
      ('pro_499',       'Pro Pack',   400,  49900, 499),
      ('unlimited_999', 'Power User', 1200, 99900, 999)
    ) AS t(id, name, credits, amount_paise, price_inr)
  LOOP
    v_icols := format('%I', v_fk_col);
    v_ivals := quote_literal(v_pack.id);

    IF 'name'         = ANY(v_cols) THEN v_icols:=v_icols||', name';         v_ivals:=v_ivals||', '||quote_literal(v_pack.name); END IF;
    IF 'credits'      = ANY(v_cols) THEN v_icols:=v_icols||', credits';      v_ivals:=v_ivals||', '||v_pack.credits; END IF;
    IF 'amount'       = ANY(v_cols) THEN v_icols:=v_icols||', amount';       v_ivals:=v_ivals||', '||v_pack.amount_paise; END IF;
    IF 'amount_inr'   = ANY(v_cols) THEN v_icols:=v_icols||', amount_inr';   v_ivals:=v_ivals||', '||v_pack.amount_paise; END IF;
    IF 'amount_paise' = ANY(v_cols) THEN v_icols:=v_icols||', amount_paise'; v_ivals:=v_ivals||', '||v_pack.amount_paise; END IF;
    IF 'price_inr'    = ANY(v_cols) THEN v_icols:=v_icols||', price_inr';    v_ivals:=v_ivals||', '||v_pack.price_inr; END IF;
    IF 'price'        = ANY(v_cols) THEN v_icols:=v_icols||', price';        v_ivals:=v_ivals||', '||v_pack.price_inr; END IF;
    IF 'is_active'    = ANY(v_cols) THEN v_icols:=v_icols||', is_active';    v_ivals:=v_ivals||', true'; END IF;
    IF 'active'       = ANY(v_cols) THEN v_icols:=v_icols||', active';       v_ivals:=v_ivals||', true'; END IF;

    EXECUTE format('INSERT INTO public.credit_packs (%s) VALUES (%s) ON CONFLICT (%I) DO NOTHING',
                   v_icols, v_ivals, v_fk_col);
  END LOOP;
  RAISE NOTICE 'credit_packs seeded with app pack IDs (fk col = %).', v_fk_col;
END $$;

-- B5. The ONE robust upsert (SECURITY DEFINER → bypasses RLS; manual
--     update-else-insert → no ON CONFLICT inference; fills legacy amount_inr /
--     credits if present).
CREATE OR REPLACE FUNCTION public.upsert_razorpay_order(
  p_user_id           UUID,
  p_pack_id           TEXT,
  p_razorpay_order_id TEXT,
  p_amount            INTEGER,
  p_credits_to_add    INTEGER,
  p_is_test           BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          UUID;
  v_has_amt_inr BOOLEAN;
  v_has_credits BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='razorpay_orders' AND column_name='amount_inr') INTO v_has_amt_inr;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='razorpay_orders' AND column_name='credits') INTO v_has_credits;

  UPDATE public.razorpay_orders
     SET amount=p_amount, credits_to_add=p_credits_to_add, currency='INR',
         is_test=p_is_test, updated_at=now()
   WHERE razorpay_order_id = p_razorpay_order_id
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    IF v_has_amt_inr THEN EXECUTE 'UPDATE public.razorpay_orders SET amount_inr=$1 WHERE razorpay_order_id=$2' USING p_amount, p_razorpay_order_id; END IF;
    IF v_has_credits THEN EXECUTE 'UPDATE public.razorpay_orders SET credits=$1 WHERE razorpay_order_id=$2' USING p_credits_to_add, p_razorpay_order_id; END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.razorpay_orders
    (user_id, pack_id, razorpay_order_id, amount, currency, status, credits_to_add, is_test)
  VALUES
    (p_user_id, p_pack_id, p_razorpay_order_id, p_amount, 'INR', 'created', p_credits_to_add, p_is_test)
  RETURNING id INTO v_id;

  IF v_has_amt_inr THEN EXECUTE 'UPDATE public.razorpay_orders SET amount_inr=$1 WHERE id=$2' USING p_amount, v_id; END IF;
  IF v_has_credits THEN EXECUTE 'UPDATE public.razorpay_orders SET credits=$1 WHERE id=$2' USING p_credits_to_add, v_id; END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.upsert_razorpay_order(UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN)
  TO authenticated, service_role, anon;

-- B6. Keep a legacy-named RPC working too (older Edge deploys call this).
CREATE OR REPLACE FUNCTION public.create_razorpay_order_row(
  p_user_id UUID, p_pack_id TEXT, p_razorpay_order_id TEXT,
  p_amount INTEGER, p_credits_to_add INTEGER
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.upsert_razorpay_order(p_user_id, p_pack_id, p_razorpay_order_id, p_amount, p_credits_to_add, FALSE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_razorpay_order_row(UUID, TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;

-- B7. RLS: keep SELECT-own; add INSERT/UPDATE-own (service_role bypasses anyway).
ALTER TABLE public.razorpay_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_orders_insert_own" ON public.razorpay_orders;
CREATE POLICY "rp_orders_insert_own" ON public.razorpay_orders
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rp_orders_update_own" ON public.razorpay_orders;
CREATE POLICY "rp_orders_update_own" ON public.razorpay_orders
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION C — SECURE-CHECKOUT HARDENING                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_rp_orders_status_created
  ON public.razorpay_orders (status, created_at);

-- Mark old 'created' orders 'expired' so a leaked/old signed token can't be
-- resolved into a still-payable order. (Token lifetime is 5 min; 15-min window.)
CREATE OR REPLACE FUNCTION public.expire_stale_orders(p_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.razorpay_orders
  SET    status='expired'
  WHERE  status='created'
    AND  created_at < NOW() - (p_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_stale_orders(INTEGER) FROM PUBLIC;

-- Optional pg_cron sweep every 5 minutes (skipped silently if pg_cron absent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('deepdive_expire_stale_orders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='deepdive_expire_stale_orders');
    PERFORM cron.schedule('deepdive_expire_stale_orders', '*/5 * * * *',
      $cron$ SELECT public.expire_stale_orders(15); $cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION D — SMOKE TEST + VERIFY                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE v_user UUID; v_id UUID;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'No users yet - skipping smoke test.'; RETURN; END IF;

  v_id := public.upsert_razorpay_order(v_user, 'starter_99', 'order_SMOKETEST_DELETE_ME', 9900, 50, TRUE);
  RAISE NOTICE 'Smoke test OK. Inserted id=%', v_id;
  DELETE FROM public.razorpay_orders WHERE razorpay_order_id='order_SMOKETEST_DELETE_ME';
  RAISE NOTICE 'Smoke test row cleaned up.';
END $$;

-- Confirm referral objects are gone (both COUNTs should be 0):
SELECT 'referral_codes'       AS object, COUNT(*) AS still_exists
FROM information_schema.tables WHERE table_schema='public' AND table_name='referral_codes'
UNION ALL
SELECT 'referral_redemptions', COUNT(*)
FROM information_schema.tables WHERE table_schema='public' AND table_name='referral_redemptions';

-- Confirm packs seeded:
SELECT * FROM public.credit_packs ORDER BY 1;