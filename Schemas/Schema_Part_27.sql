-- ============================================================
-- DeepDive AI — schema_part27_complete.sql
-- Single migration that replaces all of:
--   schema_part27.sql
--   schema_patch_part27_fix.sql
--   schema_patch_part27b.sql
--   schema_patch_part27c.sql
--   schema_patch_part27d.sql
--   schema_patch_part27e.sql
--
-- Safe to run on a fresh project OR one that already ran the
-- individual patch files — every statement is idempotent.
--
-- Prerequisites (must already exist):
--   • touch_updated_at()      from schema_part24_complete.sql
--   • ensure_user_credits()   redefined here (bonus = 20)
--   • upsert_topic_affinity() from schema_part21.sql (optional)
--
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SECTION 1 — TABLES
-- ══════════════════════════════════════════════════════════════

-- ─── 1a. user_onboarding ─────────────────────────────────────────────────────
-- One row per user. Stores completion state and monthly report goal.

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN     NOT NULL DEFAULT FALSE,
  selected_interests   TEXT[]      NOT NULL DEFAULT '{}',
  monthly_report_goal  INTEGER     NOT NULL DEFAULT 10,
  completed_step       INTEGER     NOT NULL DEFAULT 0,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_onboarding' AND policyname = 'Users manage own onboarding'
  ) THEN
    CREATE POLICY "Users manage own onboarding"
      ON public.user_onboarding FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboarding_user_id ON public.user_onboarding(user_id);

DROP TRIGGER IF EXISTS trg_user_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER trg_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 1b. referral_codes ──────────────────────────────────────────────────────
-- One unique DDA###### code per user.

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code                 TEXT        NOT NULL UNIQUE,
  total_referrals      INTEGER     NOT NULL DEFAULT 0,
  total_credits_earned INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_codes' AND policyname = 'Users read own referral code'
  ) THEN
    CREATE POLICY "Users read own referral code"
      ON public.referral_codes FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users validate any code" ON public.referral_codes;
CREATE POLICY "Authenticated users validate any code"
  ON public.referral_codes FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code    ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);

-- ─── 1c. referral_redemptions ────────────────────────────────────────────────
-- Records every code redemption.
-- UNIQUE(referred_id, referral_code): same code can't be used twice by
-- the same person, but DIFFERENT codes from different friends are allowed.

CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT        NOT NULL,
  credits_given INTEGER     NOT NULL DEFAULT 30,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_redemptions' AND policyname = 'Referrer reads own redemptions'
  ) THEN
    CREATE POLICY "Referrer reads own redemptions"
      ON public.referral_redemptions FOR SELECT USING (auth.uid() = referrer_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_redemptions' AND policyname = 'Referred reads own row'
  ) THEN
    CREATE POLICY "Referred reads own row"
      ON public.referral_redemptions FOR SELECT USING (auth.uid() = referred_id);
  END IF;
END $$;

-- Drop legacy single-column unique constraint if it exists, then add composite one
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.referral_redemptions'::regclass AND contype = 'u'
      AND conname != 'referral_redemptions_referred_code_unique'
  LOOP
    EXECUTE format('ALTER TABLE public.referral_redemptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.referral_redemptions'::regclass
      AND conname  = 'referral_redemptions_referred_code_unique'
  ) THEN
    ALTER TABLE public.referral_redemptions
      ADD CONSTRAINT referral_redemptions_referred_code_unique
      UNIQUE (referred_id, referral_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_redemptions_referrer ON public.referral_redemptions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_referred  ON public.referral_redemptions(referred_id);

-- ══════════════════════════════════════════════════════════════
-- SECTION 2 — HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════

-- ─── safe_count ──────────────────────────────────────────────────────────────
-- Returns COUNT(*) from an optional table. Returns 0 if table does not exist.
-- Used by get_user_analytics_data so missing Part N tables never crash it.

CREATE OR REPLACE FUNCTION public.safe_count(
  p_table     TEXT,
  p_user_id   UUID,
  p_status    TEXT DEFAULT NULL,
  p_role      TEXT DEFAULT NULL,
  p_extra_col TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
  v_sql    TEXT;
  v_count  BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_exists;

  IF NOT v_exists THEN RETURN 0; END IF;

  v_sql := format('SELECT COUNT(*) FROM public.%I WHERE user_id = $1', p_table);
  IF p_status    IS NOT NULL THEN v_sql := v_sql || format(' AND status = %L', p_status); END IF;
  IF p_role      IS NOT NULL THEN v_sql := v_sql || format(' AND role = %L',   p_role);   END IF;
  IF p_extra_col IS NOT NULL THEN v_sql := v_sql || ' ' || p_extra_col;                   END IF;

  EXECUTE v_sql INTO v_count USING p_user_id;
  RETURN COALESCE(v_count, 0);
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_count(TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ─── safe_sum ────────────────────────────────────────────────────────────────
-- Returns SUM of a column from an optional table. Returns 0 if missing.

CREATE OR REPLACE FUNCTION public.safe_sum(
  p_table   TEXT,
  p_col     TEXT,
  p_user_id UUID,
  p_status  TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
  v_sql    TEXT;
  v_sum    NUMERIC;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_exists;

  IF NOT v_exists THEN RETURN 0; END IF;

  v_sql := format('SELECT COALESCE(SUM(%I), 0) FROM public.%I WHERE user_id = $1', p_col, p_table);
  IF p_status IS NOT NULL THEN v_sql := v_sql || format(' AND status = %L', p_status); END IF;

  EXECUTE v_sql INTO v_sum USING p_user_id;
  RETURN COALESCE(v_sum, 0);
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_sum(TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 3 — CREDITS (signup bonus = 20)
-- ═══════════════════════════════════════════════════════════════

-- Redefine ensure_user_credits with 20-credit signup bonus.
-- This overrides the 50-credit version from schema_part24_complete.sql.

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
  VALUES (p_user_id, 20, 0, 0, TRUE)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, description)
  SELECT p_user_id, 'signup_bonus', 20, 20, 'Welcome bonus — 20 free credits!'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND type = 'signup_bonus'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_credits(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- SECTION 4 — REFERRAL RPCs
-- ══════════════════════════════════════════════════════════════

-- ─── get_or_create_referral_code ─────────────────────────────────────────────
-- Uses random() only — no pgcrypto extension required.

CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     TEXT;
  v_attempt  INTEGER := 0;
  v_chars    TEXT    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_char_len INTEGER;
  v_random   TEXT;
  v_idx      INTEGER;
  i          INTEGER;
BEGIN
  v_char_len := length(v_chars);

  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = p_user_id;
  IF FOUND THEN RETURN v_code; END IF;

  LOOP
    v_attempt := v_attempt + 1;
    EXIT WHEN v_attempt > 20;

    v_random := '';
    FOR i IN 1..6 LOOP
      v_idx    := floor(random() * v_char_len)::integer + 1;
      v_random := v_random || substr(v_chars, v_idx, 1);
    END LOOP;
    v_code := 'DDA' || v_random;

    BEGIN
      INSERT INTO public.referral_codes(user_id, code) VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not generate unique referral code after % attempts', v_attempt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code(UUID) TO authenticated;

-- ─── get_referral_stats ───────────────────────────────────────────────────────
-- Returns code, referral counts, and redeemed_count (INTEGER).
-- Client reads redeemedCount to show "X codes redeemed" badge.

CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code             TEXT;
  v_total_referrals  INTEGER;
  v_credits_earned   INTEGER;
  v_redeemed_count   INTEGER;
BEGIN
  SELECT code, total_referrals, total_credits_earned
  INTO   v_code, v_total_referrals, v_credits_earned
  FROM   public.referral_codes
  WHERE  user_id = p_user_id;

  IF NOT FOUND THEN
    v_code            := public.get_or_create_referral_code(p_user_id);
    v_total_referrals := 0;
    v_credits_earned  := 0;
  END IF;

  SELECT COUNT(*) INTO v_redeemed_count
  FROM   public.referral_redemptions
  WHERE  referred_id = p_user_id;

  RETURN jsonb_build_object(
    'code',            v_code,
    'total_referrals', COALESCE(v_total_referrals, 0),
    'credits_earned',  COALESCE(v_credits_earned,  0),
    'redeemed_count',  COALESCE(v_redeemed_count,  0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_stats(UUID) TO authenticated;

-- ─── redeem_referral_code ─────────────────────────────────────────────────────
-- Awards +30 credits to both parties.
-- Guards: invalid code · own code · same code twice · circular A→B→A loop.
-- Multiple DIFFERENT codes from different friends are allowed.

CREATE OR REPLACE FUNCTION public.redeem_referral_code(
  p_referred_id UUID,
  p_code        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id UUID;
  v_bonus       INTEGER := 30;
  v_ref_balance INTEGER;
  v_rr_balance  INTEGER;
  v_clean_code  TEXT;
BEGIN
  v_clean_code := upper(trim(p_code));

  -- 1. Validate code
  SELECT user_id INTO v_referrer_id
  FROM public.referral_codes WHERE code = v_clean_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Invalid referral code. Please check and try again.');
  END IF;

  -- 2. Cannot use own code
  IF v_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('success', false,
      'message', 'You cannot use your own referral code.');
  END IF;

  -- 3. Cannot redeem the same code twice
  IF EXISTS (
    SELECT 1 FROM public.referral_redemptions
    WHERE referred_id = p_referred_id AND referral_code = v_clean_code
  ) THEN
    RETURN jsonb_build_object('success', false,
      'message', 'You have already used this code before.');
  END IF;

  -- 4. Circular referral guard: block A→B→A loops in both directions
  IF EXISTS (
    SELECT 1 FROM public.referral_redemptions
    WHERE referrer_id = p_referred_id AND referred_id = v_referrer_id
  ) THEN
    RETURN jsonb_build_object('success', false,
      'message', 'You have already referred this person — circular referrals are not allowed.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referral_redemptions
    WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id
  ) THEN
    RETURN jsonb_build_object('success', false,
      'message', 'This person has already referred you — you cannot refer each other.');
  END IF;

  -- 5. Ensure credit rows exist
  PERFORM public.ensure_user_credits(v_referrer_id);
  PERFORM public.ensure_user_credits(p_referred_id);

  -- 6. Award credits to referrer
  UPDATE public.user_credits
    SET balance         = balance + v_bonus,
        total_purchased = total_purchased + v_bonus,
        updated_at      = NOW()
  WHERE user_id = v_referrer_id
  RETURNING balance INTO v_ref_balance;

  INSERT INTO public.credit_transactions(user_id, type, amount, balance_after, description)
  VALUES (v_referrer_id, 'referral_bonus', v_bonus, v_ref_balance,
          'Referral bonus — a friend used your code');

  -- 7. Award credits to redeemer
  UPDATE public.user_credits
    SET balance         = balance + v_bonus,
        total_purchased = total_purchased + v_bonus,
        updated_at      = NOW()
  WHERE user_id = p_referred_id
  RETURNING balance INTO v_rr_balance;

  INSERT INTO public.credit_transactions(user_id, type, amount, balance_after, description)
  VALUES (p_referred_id, 'referral_bonus', v_bonus, v_rr_balance,
          'Referral bonus — used a friend''s code (' || v_clean_code || ')');

  -- 8. Record redemption
  INSERT INTO public.referral_redemptions(referrer_id, referred_id, referral_code, credits_given)
  VALUES (v_referrer_id, p_referred_id, v_clean_code, v_bonus);

  -- 9. Update referrer stats
  UPDATE public.referral_codes
    SET total_referrals      = total_referrals + 1,
        total_credits_earned = total_credits_earned + v_bonus
  WHERE user_id = v_referrer_id;

  RETURN jsonb_build_object(
    'success',         true,
    'message',         '+' || v_bonus || ' credits added to your account!',
    'credits_awarded', v_bonus,
    'new_balance',     v_rr_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_referral_code(UUID, TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- SECTION 5 — ONBOARDING RPCs
-- ══════════════════════════════════════════════════════════════

-- ─── get_onboarding_status ───────────────────────────────────────────────────
-- Returns or creates the onboarding row for a user.

CREATE OR REPLACE FUNCTION public.get_onboarding_status(p_user_id UUID)
RETURNS public.user_onboarding
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_onboarding;
BEGIN
  SELECT * INTO v_row FROM public.user_onboarding WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_onboarding(user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_row FROM public.user_onboarding WHERE user_id = p_user_id;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_status(UUID) TO authenticated;

-- ─── complete_onboarding ─────────────────────────────────────────────────────
-- Marks onboarding done and optionally seeds topic affinity.

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_user_id      UUID,
  p_interests    TEXT[],
  p_monthly_goal INTEGER DEFAULT 10
)
RETURNS public.user_onboarding
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_onboarding;
BEGIN
  INSERT INTO public.user_onboarding(
    user_id, onboarding_completed, selected_interests,
    monthly_report_goal, completed_step, completed_at
  )
  VALUES (p_user_id, TRUE, p_interests, p_monthly_goal, 4, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET onboarding_completed = TRUE,
        selected_interests   = p_interests,
        monthly_report_goal  = p_monthly_goal,
        completed_step       = 4,
        completed_at         = COALESCE(user_onboarding.completed_at, NOW()),
        updated_at           = NOW()
  RETURNING * INTO v_row;

  IF array_length(p_interests, 1) > 0 THEN
    BEGIN
      PERFORM public.upsert_topic_affinity(p_user_id, p_interests, NULL);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding(UUID, TEXT[], INTEGER) TO authenticated;

-- ─── update_monthly_goal ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_monthly_goal(p_user_id UUID, p_goal INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_onboarding(user_id, monthly_report_goal)
  VALUES (p_user_id, p_goal)
  ON CONFLICT (user_id) DO UPDATE
    SET monthly_report_goal = p_goal, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_monthly_goal(UUID, INTEGER) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- SECTION 6 — ANALYTICS RPC
-- ══════════════════════════════════════════════════════════════

-- get_user_analytics_data
-- Uses safe_count/safe_sum for every optional table so missing
-- Part N tables never crash analytics. Only research_reports is
-- queried with static SQL (it exists since Part 1).

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
  v_referrals_count     BIGINT;
  v_activity_dates      JSON;
  v_daily_counts        JSON;
  v_topic_distribution  JSON;
BEGIN
  SELECT monthly_report_goal INTO v_monthly_goal
  FROM   public.user_onboarding WHERE user_id = p_user_id;
  v_monthly_goal := COALESCE(v_monthly_goal, 10);

  -- Core: research_reports always exists
  SELECT
    COUNT(*)                                                             AS total,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))    AS this_month,
    COUNT(*) FILTER (WHERE depth = 'expert')                            AS expert,
    COALESCE(SUM(sources_count), 0)                                     AS sources,
    COALESCE(SUM(
      CASE depth
        WHEN 'quick'  THEN 1800
        WHEN 'deep'   THEN 4200
        WHEN 'expert' THEN 7500
        ELSE               3000
      END
    ), 0)                                                                AS words
  INTO v_total_reports, v_reports_this_month, v_expert_reports,
       v_total_sources_all, v_total_words
  FROM public.research_reports
  WHERE user_id = p_user_id AND status = 'completed';

  -- Optional tables via safe helpers
  v_total_podcasts      := public.safe_count('podcasts',        p_user_id, 'completed');
  v_total_debates       := public.safe_count('debate_sessions', p_user_id, 'completed');
  v_total_papers        := public.safe_count('academic_papers', p_user_id);
  v_total_presentations := public.safe_count('presentations',   p_user_id);

  v_referrals_count := COALESCE((
    SELECT total_referrals FROM public.referral_codes WHERE user_id = p_user_id
  ), 0);

  -- KB queries: try kb_messages (Part 26 name) then assistant_messages (older name)
  v_kb_queries_count := public.safe_count('kb_messages',         p_user_id, NULL, 'user');
  IF v_kb_queries_count = 0 THEN
    v_kb_queries_count := public.safe_count('assistant_messages', p_user_id, NULL, 'user');
  END IF;

  -- Activity dates (last 90 days) — for streak calculation on client
  SELECT COALESCE(
    json_agg(DISTINCT act_date::TEXT ORDER BY act_date::TEXT DESC),
    '[]'::JSON
  )
  INTO v_activity_dates
  FROM (
    SELECT DATE(created_at) AS act_date
    FROM public.research_reports
    WHERE user_id = p_user_id AND status = 'completed'
      AND created_at > NOW() - INTERVAL '90 days'
  ) base_acts;

  -- Daily counts (last 7 days) — for weekly heatmap
  SELECT COALESCE(
    json_agg(json_build_object('date', d::TEXT, 'count', cnt) ORDER BY d DESC),
    '[]'::JSON
  )
  INTO v_daily_counts
  FROM (
    SELECT DATE(created_at) AS d, COUNT(*) AS cnt
    FROM public.research_reports
    WHERE user_id = p_user_id AND status = 'completed'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
  ) day_agg;

  -- Topic distribution
  SELECT COALESCE(
    json_agg(json_build_object('keyword', topic_keyword, 'score', affinity_score)
             ORDER BY affinity_score DESC),
    '[]'::JSON
  )
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
    'referrals_count',     v_referrals_count,
    'activity_dates',      v_activity_dates,
    'daily_counts',        v_daily_counts,
    'topic_distribution',  v_topic_distribution
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_analytics_data(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- SECTION 7 — SEED DATA
-- ══════════════════════════════════════════════════════════════

-- Mark every existing user as onboarding_completed = TRUE so they
-- skip the flow. New users get onboarding_completed = FALSE (default).

INSERT INTO public.user_onboarding(user_id, onboarding_completed)
SELECT u.id, TRUE
FROM   auth.users u
LEFT   JOIN public.user_onboarding uo ON uo.user_id = u.id
WHERE  uo.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SECTION 8 — VERIFY
-- ══════════════════════════════════════════════════════════════

SELECT 'user_onboarding'      AS table_name, COUNT(*) AS rows FROM public.user_onboarding
UNION ALL
SELECT 'referral_codes',                     COUNT(*) FROM public.referral_codes
UNION ALL
SELECT 'referral_redemptions',               COUNT(*) FROM public.referral_redemptions;