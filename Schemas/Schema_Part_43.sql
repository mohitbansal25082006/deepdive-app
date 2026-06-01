-- schema_part43_oauth_fix.sql
-- Run this in Supabase SQL Editor.
--
-- PROBLEM: New OAuth users (Google/GitHub) bypass the normal sign-up flow.
-- The handle_new_user trigger may not create user_credits and user_onboarding
-- rows for OAuth users. This causes the app to crash on first login.
--
-- FIXES:
-- 1. Recreates handle_new_user trigger to cover OAuth + credits + onboarding
-- 2. Adds initialize_user_credits RPC (safe fallback for CreditsContext)
-- 3. Backfills existing OAuth users who are missing rows

-- ─── 1. Fix handle_new_user trigger ─────────────────────────────────────────
-- profiles columns: id, username, full_name, avatar_url, bio, occupation,
--                   interests, profile_completed, created_at, updated_at

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile row (no email column in profiles table)
  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    profile_completed
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create user_credits row with 20 signup bonus
  PERFORM public.ensure_user_credits(NEW.id);

  -- Create user_onboarding row (not completed — new user sees welcome screen)
  INSERT INTO public.user_onboarding (
    user_id,
    onboarding_completed,
    selected_interests,
    monthly_report_goal,
    completed_step
  )
  VALUES (NEW.id, FALSE, '{}', 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the auth user creation
  RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─── 2. initialize_user_credits RPC ─────────────────────────────────────────
-- Called by CreditsContext when fetchUserCredits returns nothing.
-- Delegates to ensure_user_credits which handles all bonus logic.

CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
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
  FROM public.user_credits
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_balance, 20);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'initialize_user_credits error: %', SQLERRM;
  RETURN 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_user_credits(UUID) TO authenticated;


-- ─── 3. Backfill existing OAuth users missing rows ──────────────────────────

-- Backfill profiles (no email column)
INSERT INTO public.profiles (id, full_name, avatar_url, profile_completed)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data->>'avatar_url',
  FALSE
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Backfill user_credits
DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT u.id FROM auth.users u
    WHERE u.id NOT IN (SELECT user_id FROM public.user_credits)
  LOOP
    PERFORM public.ensure_user_credits(v_user.id);
  END LOOP;
END;
$$;

-- Backfill user_onboarding
-- Existing users → mark completed so they don't see welcome screen
INSERT INTO public.user_onboarding (
  user_id,
  onboarding_completed,
  selected_interests,
  monthly_report_goal,
  completed_step,
  completed_at
)
SELECT
  u.id,
  TRUE,
  '{}',
  10,
  4,
  NOW()
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM public.user_onboarding)
ON CONFLICT (user_id) DO NOTHING;


-- ─── Verify — all counts should be 0 ────────────────────────────────────────
SELECT 'user_credits missing'    AS check_name, COUNT(*) AS missing_count
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM public.user_credits)
UNION ALL
SELECT 'user_onboarding missing', COUNT(*)
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM public.user_onboarding)
UNION ALL
SELECT 'profiles missing',        COUNT(*)
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles);