-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — schema_part59.sql
-- Part 59: Secure Server-Side API Keys
--
-- WHAT THIS DOES
--   SECTION A — app_api_keys: the encrypted key vault. One row per provider.
--                The secret NEVER lives here in plaintext — only AES-256-GCM
--                ciphertext produced by the admin dashboard. RLS denies every
--                role; only the service_role (Edge Functions + admin API
--                routes) can read it, and even then it gets ciphertext.
--   SECTION B — get_ai_provider_status(): a safe, authenticated-readable RPC
--                that returns ONLY booleans ("is openai configured?"). The app
--                uses this to decide whether to show a feature or fall back.
--                It can never leak a key, a hint, or a ciphertext.
--   SECTION C — admin_log_api_key_action(): audit trail into admin_audit_log.
--                Values are never logged — only provider + action + hint.
--   SECTION D — Seed the provider rows (inactive, empty) + verify.
--
-- Run ONCE in Supabase SQL Editor. Fully idempotent — safe to re-run.
-- Prerequisite: schema_part31_complete.sql (admin_audit_log, profiles.is_admin)
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION A — THE KEY VAULT                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.app_api_keys (
  -- Stable machine id used by the Edge Functions: 'openai' | 'tavily' |
  -- 'pexels' | 'giphy'. Adding a provider = inserting a row here.
  provider         TEXT PRIMARY KEY,

  -- Human label shown in the admin dashboard.
  display_name     TEXT        NOT NULL DEFAULT '',
  docs_url         TEXT,

  -- AES-256-GCM ciphertext, format: 'v1.<base64url iv>.<base64url ciphertext>'
  -- Encrypted by the admin dashboard with API_KEY_ENCRYPTION_SECRET.
  -- A database dump WITHOUT that secret is useless.
  ciphertext       TEXT,

  -- Last 4 characters of the plaintext key, for "sk-…a91f" display only.
  key_hint         TEXT        NOT NULL DEFAULT '',

  -- Turn a provider off without deleting the key (kill switch).
  is_active        BOOLEAN     NOT NULL DEFAULT FALSE,

  -- If TRUE, features depending on this provider are broken when it's missing.
  -- Purely informational — drives the admin dashboard warning banner.
  is_required      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Bumped on every write. Edge Functions cache keys for 60s; this column
  -- exists so you can reason about propagation when auditing.
  version          INTEGER     NOT NULL DEFAULT 0,

  -- Live-test results written by /api/admin/api-keys/test
  last_tested_at   TIMESTAMPTZ,
  last_test_ok     BOOLEAN,
  last_test_error  TEXT,

  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_api_keys IS
  'Part 59 — Encrypted third-party API key vault. Ciphertext only. '
  'Readable exclusively by service_role (Edge Functions + admin API routes).';

COMMENT ON COLUMN public.app_api_keys.ciphertext IS
  'AES-256-GCM, format v1.<b64url iv>.<b64url ct>. Decryptable only with '
  'API_KEY_ENCRYPTION_SECRET, which is NEVER stored in this database.';

-- Columns added defensively so a re-run on an older table still converges.
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS display_name    TEXT        NOT NULL DEFAULT '';
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS docs_url        TEXT;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS ciphertext      TEXT;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS key_hint        TEXT        NOT NULL DEFAULT '';
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS is_active       BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS is_required     BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS version         INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS last_tested_at  TIMESTAMPTZ;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS last_test_ok    BOOLEAN;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS last_test_error TEXT;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS notes           TEXT;
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.app_api_keys ADD COLUMN IF NOT EXISTS updated_by      UUID;

-- ── LOCK IT DOWN ───────────────────────────────────────────────────────────
-- RLS ON with ZERO policies = deny-all for anon and authenticated.
-- service_role bypasses RLS, which is exactly (and only) what we want.
ALTER TABLE public.app_api_keys ENABLE ROW LEVEL SECURITY;

-- Belt and braces: explicitly revoke, in case a future migration grants
-- table-level privileges to PUBLIC by accident.
REVOKE ALL ON TABLE public.app_api_keys FROM PUBLIC;
REVOKE ALL ON TABLE public.app_api_keys FROM anon;
REVOKE ALL ON TABLE public.app_api_keys FROM authenticated;
GRANT  ALL ON TABLE public.app_api_keys TO   service_role;

-- Keep updated_at / version honest no matter who writes.
CREATE OR REPLACE FUNCTION public.touch_app_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  -- Only bump the version when the secret itself actually changed.
  IF TG_OP = 'UPDATE' AND NEW.ciphertext IS DISTINCT FROM OLD.ciphertext THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_app_api_key ON public.app_api_keys;
CREATE TRIGGER trg_touch_app_api_key
  BEFORE INSERT OR UPDATE ON public.app_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_app_api_key();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION B — SAFE PROVIDER STATUS FOR THE APP                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- The mobile app sometimes needs to know whether a provider is usable — e.g.
-- the presentation image picker shows "stock photos unavailable" instead of an
-- empty grid when Pexels has no key.
--
-- This RPC returns ONLY booleans. No key, no hint, no ciphertext, no length.
-- Even a fully compromised app token learns nothing beyond "configured: yes".

CREATE OR REPLACE FUNCTION public.get_ai_provider_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  r        RECORD;
BEGIN
  FOR r IN
    SELECT provider,
           (is_active AND ciphertext IS NOT NULL AND ciphertext <> '') AS usable
    FROM public.app_api_keys
  LOOP
    v_result := v_result || jsonb_build_object(r.provider, r.usable);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_provider_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_provider_status() TO authenticated, service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION C — AUDIT LOGGING                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Reuses admin_audit_log from Part 31. Deliberately takes only the hint, never
-- the key, so the audit table can never become a second place a secret leaks.
--
-- p_action: 'api_key_set' | 'api_key_rotated' | 'api_key_removed'
--           | 'api_key_enabled' | 'api_key_disabled' | 'api_key_tested'

CREATE OR REPLACE FUNCTION public.admin_log_api_key_action(
  p_admin_id  UUID,
  p_provider  TEXT,
  p_action    TEXT,
  p_key_hint  TEXT DEFAULT '',
  p_reason    TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hard guard: refuse anything that looks like a real key slipped through.
  IF p_key_hint IS NOT NULL AND LENGTH(p_key_hint) > 8 THEN
    p_key_hint := RIGHT(p_key_hint, 4);
  END IF;

  INSERT INTO public.admin_audit_log
    (admin_user_id, target_user_id, action, resource_type, resource_id,
     before_value, after_value, reason)
  VALUES (
    p_admin_id,
    NULL,
    p_action,
    'app_api_key',
    p_provider,
    NULL,
    jsonb_build_object('provider', p_provider, 'key_hint', COALESCE(p_key_hint, '')),
    NULLIF(p_reason, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_api_key_action(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_api_key_action(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SECTION D — SEED PROVIDER ROWS                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Rows are seeded EMPTY and INACTIVE. Paste the actual keys in the admin
-- dashboard (Dashboard → API Keys) after deploying. Until then the Edge
-- Functions fall back to Supabase secrets, so nothing breaks mid-migration.

INSERT INTO public.app_api_keys (provider, display_name, docs_url, is_required, is_active)
VALUES
  ('openai', 'OpenAI',
   'https://platform.openai.com/api-keys', TRUE,  FALSE),
  ('tavily', 'Tavily Search',
   'https://app.tavily.com/home',          TRUE,  FALSE),
  ('pexels', 'Pexels Stock Photos',
   'https://www.pexels.com/api/',          FALSE, FALSE),
  ('giphy',  'GIPHY',
   'https://developers.giphy.com/dashboard/', FALSE, FALSE)
ON CONFLICT (provider) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      docs_url     = EXCLUDED.docs_url,
      is_required  = EXCLUDED.is_required;
-- NOTE: is_active and ciphertext are intentionally NOT overwritten on conflict,
-- so re-running this file never disables a live provider or wipes a key.


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ VERIFY                                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_policies INTEGER;
  v_rows     INTEGER;
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_api_keys'
  ) = 1, 'app_api_keys table missing';

  ASSERT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.app_api_keys'::regclass
  ), 'RLS is NOT enabled on app_api_keys — keys would be readable!';

  SELECT COUNT(*) INTO v_policies
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_api_keys';

  ASSERT v_policies = 0,
    'app_api_keys has RLS policies — it must have ZERO (deny-all except service_role)';

  ASSERT (
    SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_ai_provider_status'
  ) >= 1, 'get_ai_provider_status() missing';

  ASSERT (
    SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_log_api_key_action'
  ) >= 1, 'admin_log_api_key_action() missing';

  SELECT COUNT(*) INTO v_rows FROM public.app_api_keys;

  RAISE NOTICE 'Part 59 schema applied.';
  RAISE NOTICE '  -> app_api_keys created, RLS on, 0 policies (deny-all)';
  RAISE NOTICE '  -> % provider row(s) seeded', v_rows;
  RAISE NOTICE '  -> get_ai_provider_status() granted to authenticated';
  RAISE NOTICE '  -> admin_log_api_key_action() granted to service_role only';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT: set API_KEY_ENCRYPTION_SECRET, then paste your keys in';
  RAISE NOTICE '      Admin Dashboard -> API Keys.';
END $$;

-- Should show 4 rows, all with ciphertext NULL and is_active false on first run.
SELECT provider, display_name, is_active, is_required,
       (ciphertext IS NOT NULL) AS has_key, key_hint, version, updated_at
FROM   public.app_api_keys
ORDER  BY is_required DESC, provider;