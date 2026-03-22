-- =============================================================================
-- schema_part31.sql
-- DeepDive AI — Part 31: Admin Dashboard Schema Migration
-- Run in Supabase SQL Editor AFTER all previous schema parts (1–30).
-- SAFE: All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Does NOT modify any existing RLS policies on user-facing tables.
-- =============================================================================

-- ── 1. Add is_admin flag to profiles ─────────────────────────────────────────
-- Only admins created manually via SQL can have this set to TRUE.
-- The column defaults to FALSE so existing users are unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Set TRUE manually via SQL to grant admin dashboard access. '
  'Never exposed to regular users via RLS.';

-- ── 2. admin_audit_log ────────────────────────────────────────────────────────
-- Every admin action (credit adjustment, suspend, delete, etc.) is logged here.
-- Written by server-side API routes using the service role key.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  -- e.g. 'credit_adjustment' | 'suspend_user' | 'unsuspend_user' |
  --      'flag_user' | 'delete_user' | 'revoke_credits' | 'manual_grant'
  resource_type   TEXT,       -- 'user' | 'credit_transaction' | 'razorpay_order'
  resource_id     TEXT,       -- UUID of the affected row
  before_value    JSONB,      -- snapshot before change
  after_value     JSONB,      -- snapshot after change
  reason          TEXT,       -- admin-supplied note / reason
  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups per admin and per target user
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id
  ON public.admin_audit_log(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_target_id
  ON public.admin_audit_log(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.admin_audit_log(action, created_at DESC);

-- RLS: Only service role (admin API routes) can read/write this table.
-- Regular authenticated users have NO access at all.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated role → they get zero access (deny by default).
-- Service role bypasses RLS entirely, so admin API routes work fine.

-- ── 3. user_status column on profiles ─────────────────────────────────────────
-- Tracks account standing: active / suspended / flagged
-- Defaults to 'active'. Never changed by users themselves.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.profiles.account_status IS
  'Admin-controlled account status: active | suspended | flagged';

-- ── 4. Helper RPC: get_platform_metrics ───────────────────────────────────────
-- Returns a single row of platform-wide aggregate metrics.
-- Called by the admin dashboard overview screen.
-- SECURITY DEFINER so it can read across all users.
-- The Next.js API route additionally verifies is_admin before calling this.

CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users           BIGINT;
  v_new_users_today       BIGINT;
  v_new_users_this_month  BIGINT;
  v_total_reports         BIGINT;
  v_reports_today         BIGINT;
  v_total_credits_issued  BIGINT;
  v_total_credits_consumed BIGINT;
  v_credits_consumed_today BIGINT;
  v_credits_consumed_month BIGINT;
  v_total_revenue_paise   BIGINT;
  v_revenue_today_paise   BIGINT;
  v_revenue_month_paise   BIGINT;
  v_active_workspaces     BIGINT;
  v_total_podcasts        BIGINT;
  v_total_debates         BIGINT;
  v_total_papers          BIGINT;
BEGIN
  -- Users (from auth.users view is restricted; use profiles instead)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
    COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()))
  INTO v_total_users, v_new_users_today, v_new_users_this_month
  FROM public.profiles;

  -- Reports
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)
  INTO v_total_reports, v_reports_today
  FROM public.research_reports
  WHERE status = 'completed';

  -- Credits from user_credits aggregate
  SELECT
    COALESCE(SUM(total_purchased), 0),
    COALESCE(SUM(total_consumed), 0)
  INTO v_total_credits_issued, v_total_credits_consumed
  FROM public.user_credits;

  -- Credits consumed today and this month from transactions
  SELECT
    COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= CURRENT_DATE), 0),
    COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())), 0)
  INTO v_credits_consumed_today, v_credits_consumed_month
  FROM public.credit_transactions
  WHERE type = 'consume';

  -- Revenue from captured Razorpay orders (amount is in paise)
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= CURRENT_DATE), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= DATE_TRUNC('month', NOW())), 0)
  INTO v_total_revenue_paise, v_revenue_today_paise, v_revenue_month_paise
  FROM public.razorpay_orders;

  -- Optional tables (safe fallback)
  BEGIN
    SELECT COUNT(*) INTO v_active_workspaces FROM public.workspaces;
  EXCEPTION WHEN UNDEFINED_TABLE THEN v_active_workspaces := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_podcasts FROM public.podcasts WHERE status = 'completed';
  EXCEPTION WHEN UNDEFINED_TABLE THEN v_total_podcasts := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_debates FROM public.debate_sessions WHERE status = 'completed';
  EXCEPTION WHEN UNDEFINED_TABLE THEN v_total_debates := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_papers FROM public.academic_papers;
  EXCEPTION WHEN UNDEFINED_TABLE THEN v_total_papers := 0;
  END;

  RETURN jsonb_build_object(
    'total_users',              COALESCE(v_total_users, 0),
    'new_users_today',          COALESCE(v_new_users_today, 0),
    'new_users_this_month',     COALESCE(v_new_users_this_month, 0),
    'total_reports',            COALESCE(v_total_reports, 0),
    'reports_today',            COALESCE(v_reports_today, 0),
    'total_credits_issued',     COALESCE(v_total_credits_issued, 0),
    'total_credits_consumed',   COALESCE(v_total_credits_consumed, 0),
    'credits_consumed_today',   COALESCE(v_credits_consumed_today, 0),
    'credits_consumed_month',   COALESCE(v_credits_consumed_month, 0),
    'total_revenue_inr',        ROUND((COALESCE(v_total_revenue_paise, 0)::NUMERIC / 100), 2),
    'revenue_today_inr',        ROUND((COALESCE(v_revenue_today_paise, 0)::NUMERIC / 100), 2),
    'revenue_month_inr',        ROUND((COALESCE(v_revenue_month_paise, 0)::NUMERIC / 100), 2),
    'active_workspaces',        COALESCE(v_active_workspaces, 0),
    'total_podcasts',           COALESCE(v_total_podcasts, 0),
    'total_debates',            COALESCE(v_total_debates, 0),
    'total_academic_papers',    COALESCE(v_total_papers, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- ── 5. Helper RPC: get_7day_activity ──────────────────────────────────────────
-- Returns daily new users + daily reports for the last 7 days.
-- Used for the activity chart on the overview dashboard.

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
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
    FROM public.profiles
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY DATE(created_at)
  ),
  report_counts AS (
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
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
  LEFT JOIN user_counts  u ON u.day = d.day
  LEFT JOIN report_counts r ON r.day = d.day
  ORDER BY d.day ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_7day_activity() TO authenticated;

-- ── 6. Helper RPC: admin_adjust_credits ──────────────────────────────────────
-- Allows admins to manually add or deduct credits with a reason.
-- Logs the action to admin_audit_log.
-- Called server-side with service role — the API route verifies is_admin first.

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  p_admin_id    UUID,
  p_user_id     UUID,
  p_amount      INTEGER,   -- positive = add, negative = deduct
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_balance  INTEGER;
  v_after_balance   INTEGER;
  v_tx_type         TEXT;
BEGIN
  -- Get current balance
  SELECT balance INTO v_before_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.ensure_user_credits(p_user_id);
    SELECT balance INTO v_before_balance
    FROM public.user_credits WHERE user_id = p_user_id;
  END IF;

  -- Prevent negative balance on deduction
  IF p_amount < 0 AND (v_before_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Cannot deduct % credits, balance is only %',
      ABS(p_amount), v_before_balance;
  END IF;

  -- Apply adjustment
  UPDATE public.user_credits
  SET
    balance         = balance + p_amount,
    total_purchased = CASE WHEN p_amount > 0 THEN total_purchased + p_amount ELSE total_purchased END,
    total_consumed  = CASE WHEN p_amount < 0 THEN total_consumed + ABS(p_amount) ELSE total_consumed END,
    updated_at      = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_after_balance;

  -- Transaction type
  v_tx_type := CASE WHEN p_amount > 0 THEN 'admin_grant' ELSE 'consume' END;

  -- Log credit transaction
  INSERT INTO public.credit_transactions
    (user_id, type, amount, balance_after, description, metadata)
  VALUES
    (p_user_id, v_tx_type, p_amount, v_after_balance,
     'Admin adjustment: ' || p_reason,
     jsonb_build_object('admin_id', p_admin_id::TEXT, 'reason', p_reason));

  -- Log to admin_audit_log
  INSERT INTO public.admin_audit_log
    (admin_user_id, target_user_id, action, resource_type, before_value, after_value, reason)
  VALUES
    (p_admin_id, p_user_id, 'credit_adjustment', 'user_credits',
     jsonb_build_object('balance', v_before_balance),
     jsonb_build_object('balance', v_after_balance, 'adjustment', p_amount),
     p_reason);

  RETURN jsonb_build_object(
    'success',         true,
    'before_balance',  v_before_balance,
    'after_balance',   v_after_balance,
    'adjustment',      p_amount
  );
END;
$$;

-- Only service role should call this (no grant to authenticated)
-- API routes use service role client directly.

-- ── 7. Helper RPC: admin_set_account_status ──────────────────────────────────
-- Suspend, unsuspend, or flag a user account.

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_admin_id    UUID,
  p_user_id     UUID,
  p_new_status  TEXT,  -- 'active' | 'suspended' | 'flagged'
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  IF p_new_status NOT IN ('active', 'suspended', 'flagged') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, suspended, or flagged', p_new_status;
  END IF;

  SELECT account_status INTO v_old_status
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  UPDATE public.profiles
  SET account_status = p_new_status
  WHERE id = p_user_id;

  -- Map status → action label
  INSERT INTO public.admin_audit_log
    (admin_user_id, target_user_id, action, resource_type, before_value, after_value, reason)
  VALUES
    (p_admin_id, p_user_id,
     CASE p_new_status
       WHEN 'suspended' THEN 'suspend_user'
       WHEN 'active'    THEN 'unsuspend_user'
       WHEN 'flagged'   THEN 'flag_user'
     END,
     'profile',
     jsonb_build_object('account_status', v_old_status),
     jsonb_build_object('account_status', p_new_status),
     p_reason);

  RETURN jsonb_build_object(
    'success',      true,
    'old_status',   v_old_status,
    'new_status',   p_new_status
  );
END;
$$;

-- ── 8. Seed: ensure is_admin column is FALSE for all existing profiles ────────
-- (The column was added with DEFAULT FALSE so this is just a safety check)
UPDATE public.profiles
SET is_admin = FALSE
WHERE is_admin IS NULL;

-- ── 9. Verify ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) = 1, 'profiles.is_admin column missing';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'account_status'
  ) = 1, 'profiles.account_status column missing';

  ASSERT (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
  ) = 1, 'admin_audit_log table missing';

  RAISE NOTICE '✅ Part 31 migration completed successfully';
END $$;