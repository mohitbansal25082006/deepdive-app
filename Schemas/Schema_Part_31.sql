-- =============================================================================
-- schema_part31_complete.sql
-- DeepDive AI — Part 31: Admin Dashboard — COMPLETE Schema (original + patch)
--
-- This is the single authoritative migration for Part 31.
-- It replaces both schema_part31.sql AND schema_patch_part31_fix.sql.
-- Run ONLY THIS FILE — do not run the old files separately.
--
-- Prerequisites: Parts 1–30 schema already applied (especially Part 24 credits).
-- Safe to run multiple times — every statement is idempotent.
-- Does NOT modify any existing RLS policies on user-facing tables.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — PROFILES: New admin columns
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1a. is_admin flag ─────────────────────────────────────────────────────────
-- Set TRUE manually via SQL only. Never exposed to regular users via RLS.
-- DEFAULT FALSE means all existing users are unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Set TRUE manually via SQL to grant admin dashboard access. '
  'Never exposed to regular users via RLS.';

-- ── 1b. account_status ───────────────────────────────────────────────────────
-- Admin-controlled: active (default) | suspended | flagged
-- Users cannot change this themselves — only admin API routes update it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.profiles.account_status IS
  'Admin-controlled account status: active | suspended | flagged';

-- Safety: ensure no NULLs crept in before default was set
UPDATE public.profiles SET is_admin      = FALSE   WHERE is_admin      IS NULL;
UPDATE public.profiles SET account_status = 'active' WHERE account_status IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — RAZORPAY ORDERS: Add missing columns
-- Included here (originally in the patch) so one file always suffices.
-- These columns may be absent if schema_part24_complete.sql was run before
-- the patch files were available.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.razorpay_orders
  ADD COLUMN IF NOT EXISTS amount           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency         TEXT        NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS payment_id       TEXT,
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credits_to_add   INTEGER     NOT NULL DEFAULT 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — ADMIN AUDIT LOG TABLE
-- Every admin action is logged here (credit adjustments, suspensions, deletes).
-- Written only by server-side API routes using the service role key.
-- Regular authenticated users have ZERO access (RLS deny by default).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  -- action values: 'credit_adjustment' | 'suspend_user' | 'unsuspend_user' |
  --                'flag_user' | 'delete_user' | 'revoke_credits' |
  --                'manual_grant' | 'view_user'
  resource_type   TEXT,       -- 'user' | 'credit_transaction' | 'razorpay_order' | 'profile'
  resource_id     TEXT,       -- UUID of the affected row (stored as text for flexibility)
  before_value    JSONB,      -- snapshot of the value before the change
  after_value     JSONB,      -- snapshot of the value after the change
  reason          TEXT,       -- admin-supplied note / reason
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id
  ON public.admin_audit_log(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_target_id
  ON public.admin_audit_log(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.admin_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);

-- RLS: enabled but NO policies for authenticated role → deny by default.
-- Service role (used by admin API routes) bypasses RLS entirely.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — RPC: get_platform_metrics()
-- Returns a JSONB object with all platform-wide aggregate stats.
-- FULLY EXCEPTION-GUARDED: every table block has its own BEGIN/EXCEPTION
-- so a missing column or table in one block never prevents others from loading.
-- Revenue block has a credits_to_add fallback if amount column was missing.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users            BIGINT  := 0;
  v_new_users_today        BIGINT  := 0;
  v_new_users_this_month   BIGINT  := 0;
  v_total_reports          BIGINT  := 0;
  v_reports_today          BIGINT  := 0;
  v_total_credits_issued   BIGINT  := 0;
  v_total_credits_consumed BIGINT  := 0;
  v_credits_consumed_today BIGINT  := 0;
  v_credits_consumed_month BIGINT  := 0;
  v_total_revenue_paise    BIGINT  := 0;
  v_revenue_today_paise    BIGINT  := 0;
  v_revenue_month_paise    BIGINT  := 0;
  v_active_workspaces      BIGINT  := 0;
  v_total_podcasts         BIGINT  := 0;
  v_total_debates          BIGINT  := 0;
  v_total_papers           BIGINT  := 0;
BEGIN

  -- ── Profiles ─────────────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*)::BIGINT,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()))::BIGINT
    INTO v_total_users, v_new_users_today, v_new_users_this_month
    FROM public.profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Research reports ─────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*)::BIGINT,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT
    INTO v_total_reports, v_reports_today
    FROM public.research_reports
    WHERE status = 'completed';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Credit totals from user_credits ──────────────────────────────────────────
  BEGIN
    SELECT
      COALESCE(SUM(total_purchased), 0)::BIGINT,
      COALESCE(SUM(total_consumed),  0)::BIGINT
    INTO v_total_credits_issued, v_total_credits_consumed
    FROM public.user_credits;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Credits consumed today / this month from transactions ─────────────────────
  BEGIN
    SELECT
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE created_at >= CURRENT_DATE), 0)::BIGINT,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE created_at >= DATE_TRUNC('month', NOW())), 0)::BIGINT
    INTO v_credits_consumed_today, v_credits_consumed_month
    FROM public.credit_transactions
    WHERE type = 'consume';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Revenue from Razorpay (fully guarded, with credits_to_add fallback) ───────
  BEGIN
    -- Primary: use amount column (in paise)
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::BIGINT,
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'paid'
          AND COALESCE(paid_at, created_at) >= CURRENT_DATE), 0)::BIGINT,
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'paid'
          AND COALESCE(paid_at, created_at) >= DATE_TRUNC('month', NOW())), 0)::BIGINT
    INTO v_total_revenue_paise, v_revenue_today_paise, v_revenue_month_paise
    FROM public.razorpay_orders;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: derive revenue from credits_to_add pack mapping
    BEGIN
      SELECT
        COALESCE(SUM(
          CASE credits_to_add
            WHEN 50   THEN 9900
            WHEN 170  THEN 24900
            WHEN 400  THEN 49900
            WHEN 1200 THEN 99900
            ELSE           9900
          END
        ) FILTER (WHERE status = 'paid'), 0)::BIGINT,
        0::BIGINT,
        0::BIGINT
      INTO v_total_revenue_paise, v_revenue_today_paise, v_revenue_month_paise
      FROM public.razorpay_orders;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  -- ── Optional tables (each individually guarded) ───────────────────────────────
  BEGIN
    SELECT COUNT(*)::BIGINT INTO v_active_workspaces FROM public.workspaces;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::BIGINT INTO v_total_podcasts
    FROM public.podcasts WHERE status = 'completed';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::BIGINT INTO v_total_debates
    FROM public.debate_sessions WHERE status = 'completed';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::BIGINT INTO v_total_papers FROM public.academic_papers;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'total_users',            COALESCE(v_total_users,            0),
    'new_users_today',        COALESCE(v_new_users_today,        0),
    'new_users_this_month',   COALESCE(v_new_users_this_month,   0),
    'total_reports',          COALESCE(v_total_reports,          0),
    'reports_today',          COALESCE(v_reports_today,          0),
    'total_credits_issued',   COALESCE(v_total_credits_issued,   0),
    'total_credits_consumed', COALESCE(v_total_credits_consumed, 0),
    'credits_consumed_today', COALESCE(v_credits_consumed_today, 0),
    'credits_consumed_month', COALESCE(v_credits_consumed_month, 0),
    'total_revenue_inr',      ROUND((COALESCE(v_total_revenue_paise, 0)::NUMERIC / 100), 2),
    'revenue_today_inr',      ROUND((COALESCE(v_revenue_today_paise, 0)::NUMERIC / 100), 2),
    'revenue_month_inr',      ROUND((COALESCE(v_revenue_month_paise, 0)::NUMERIC / 100), 2),
    'active_workspaces',      COALESCE(v_active_workspaces,      0),
    'total_podcasts',         COALESCE(v_total_podcasts,         0),
    'total_debates',          COALESCE(v_total_debates,          0),
    'total_academic_papers',  COALESCE(v_total_papers,           0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — RPC: get_7day_activity()
-- Returns daily new users + completed reports for the last 7 days.
-- Used for the overview activity chart.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_7day_activity()
RETURNS TABLE (
  day         DATE,
  new_users   BIGINT,
  new_reports BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '6 days',
      CURRENT_DATE,
      '1 day'::interval
    )::DATE AS day
  ),
  user_counts AS (
    SELECT DATE(created_at) AS day, COUNT(*)::BIGINT AS cnt
    FROM public.profiles
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY DATE(created_at)
  ),
  report_counts AS (
    SELECT DATE(created_at) AS day, COUNT(*)::BIGINT AS cnt
    FROM public.research_reports
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
      AND status = 'completed'
    GROUP BY DATE(created_at)
  )
  SELECT
    d.day,
    COALESCE(u.cnt, 0)::BIGINT AS new_users,
    COALESCE(r.cnt, 0)::BIGINT AS new_reports
  FROM days d
  LEFT JOIN user_counts   u ON u.day = d.day
  LEFT JOIN report_counts r ON r.day = d.day
  ORDER BY d.day ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_7day_activity() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — RPC: admin_adjust_credits()
-- Manually add or deduct credits for a user.
-- Logs to both credit_transactions and admin_audit_log.
-- Called by admin API routes with service role — is_admin verified beforehand.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  p_admin_id UUID,
  p_user_id  UUID,
  p_amount   INTEGER,  -- positive = add credits, negative = deduct credits
  p_reason   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_balance INTEGER;
  v_after_balance  INTEGER;
  v_tx_type        TEXT;
BEGIN
  -- Ensure credit row exists (creates it with signup bonus if first time)
  PERFORM public.ensure_user_credits(p_user_id);

  -- Lock the row to prevent race conditions
  SELECT balance INTO v_before_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_credits row not found for user %', p_user_id;
  END IF;

  -- Block deductions that would send balance negative
  IF p_amount < 0 AND (v_before_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Cannot deduct % credits, current balance is %',
      ABS(p_amount), v_before_balance;
  END IF;

  -- Apply the adjustment
  UPDATE public.user_credits
  SET
    balance         = balance + p_amount,
    total_purchased = CASE WHEN p_amount > 0 THEN total_purchased + p_amount ELSE total_purchased END,
    total_consumed  = CASE WHEN p_amount < 0 THEN total_consumed + ABS(p_amount) ELSE total_consumed END,
    updated_at      = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_after_balance;

  -- Determine transaction type for the ledger
  v_tx_type := CASE WHEN p_amount > 0 THEN 'admin_grant' ELSE 'consume' END;

  -- Record in credit_transactions (shows in user's transaction history in app)
  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, description, metadata)
  VALUES (
    p_user_id,
    v_tx_type,
    p_amount,
    v_after_balance,
    'Admin adjustment: ' || p_reason,
    jsonb_build_object('admin_id', p_admin_id::TEXT, 'reason', p_reason)
  );

  -- Record in admin_audit_log (admin dashboard audit trail)
  INSERT INTO public.admin_audit_log
    (admin_user_id, target_user_id, action, resource_type, before_value, after_value, reason)
  VALUES (
    p_admin_id,
    p_user_id,
    'credit_adjustment',
    'user_credits',
    jsonb_build_object('balance', v_before_balance),
    jsonb_build_object('balance', v_after_balance, 'adjustment', p_amount),
    p_reason
  );

  RETURN jsonb_build_object(
    'success',        true,
    'before_balance', v_before_balance,
    'after_balance',  v_after_balance,
    'adjustment',     p_amount
  );
END;
$$;

-- No GRANT to authenticated — only service role client calls this

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — RPC: admin_set_account_status()
-- Suspend, unsuspend, or flag a user account.
-- Logs to admin_audit_log automatically.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_admin_id   UUID,
  p_user_id    UUID,
  p_new_status TEXT,  -- 'active' | 'suspended' | 'flagged'
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_action     TEXT;
BEGIN
  -- Validate status value
  IF p_new_status NOT IN ('active', 'suspended', 'flagged') THEN
    RAISE EXCEPTION 'Invalid status value: %. Must be one of: active, suspended, flagged',
      p_new_status;
  END IF;

  -- Get current status (also checks user exists)
  SELECT account_status INTO v_old_status
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- No-op if already at target status
  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object(
      'success',    true,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'no_change',  true
    );
  END IF;

  -- Apply the status change
  UPDATE public.profiles
  SET account_status = p_new_status
  WHERE id = p_user_id;

  -- Map status → human-readable action label for audit log
  v_action := CASE p_new_status
    WHEN 'suspended' THEN 'suspend_user'
    WHEN 'active'    THEN 'unsuspend_user'
    WHEN 'flagged'   THEN 'flag_user'
    ELSE                  'status_change'
  END;

  -- Log to admin audit trail
  INSERT INTO public.admin_audit_log
    (admin_user_id, target_user_id, action, resource_type, before_value, after_value, reason)
  VALUES (
    p_admin_id,
    p_user_id,
    v_action,
    'profile',
    jsonb_build_object('account_status', v_old_status),
    jsonb_build_object('account_status', p_new_status),
    p_reason
  );

  RETURN jsonb_build_object(
    'success',    true,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END;
$$;

-- No GRANT to authenticated — only service role client calls this

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — GRANT ADMIN ACCESS TO SPECIFIC ACCOUNTS
-- Run this after creating those accounts via the app signup flow.
-- Safe to run even if the emails don't exist yet (UPDATE affects 0 rows).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.profiles
SET is_admin = TRUE
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'mohitbansal25082006@gmail.com',
    'hellomohit25082006@gmail.com'
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 9 — VERIFY
-- Asserts that all critical objects were created successfully.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- profiles.is_admin
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'is_admin'
  ) = 1, '❌ profiles.is_admin column missing';

  -- profiles.account_status
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'account_status'
  ) = 1, '❌ profiles.account_status column missing';

  -- razorpay_orders.amount
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'razorpay_orders'
      AND column_name  = 'amount'
  ) = 1, '❌ razorpay_orders.amount column missing — check Section 2';

  -- admin_audit_log table
  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'admin_audit_log'
  ) = 1, '❌ admin_audit_log table missing';

  -- get_platform_metrics RPC
  ASSERT (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_platform_metrics'
  ) >= 1, '❌ get_platform_metrics() function missing';

  -- get_7day_activity RPC
  ASSERT (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_7day_activity'
  ) >= 1, '❌ get_7day_activity() function missing';

  -- admin_adjust_credits RPC
  ASSERT (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_adjust_credits'
  ) >= 1, '❌ admin_adjust_credits() function missing';

  -- admin_set_account_status RPC
  ASSERT (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_set_account_status'
  ) >= 1, '❌ admin_set_account_status() function missing';

  -- Count how many admin accounts were granted
  SELECT COUNT(*) INTO v_admin_count
  FROM public.profiles WHERE is_admin = TRUE;

  RAISE NOTICE '✅ Part 31 complete schema applied successfully';
  RAISE NOTICE '   → admin_audit_log table created';
  RAISE NOTICE '   → 4 RPCs created: get_platform_metrics, get_7day_activity, admin_adjust_credits, admin_set_account_status';
  RAISE NOTICE '   → razorpay_orders columns patched';
  RAISE NOTICE '   → % admin account(s) active', v_admin_count;
END $$;