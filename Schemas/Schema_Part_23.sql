-- schema_part23.sql
-- Part 23 — Cache Upgrade & Full Offline Viewers
--
-- FIX: DROP existing get_cache_preferences function before recreating it
-- with the new return type (added cache_audio column).
-- Postgres does not allow changing OUT parameter types without dropping first.

-- ─── Step 1: Add cache_audio column to user_cache_preferences ────────────────

ALTER TABLE user_cache_preferences
  ADD COLUMN IF NOT EXISTS cache_audio BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Step 2: Drop existing functions that need new signatures ─────────────────

DROP FUNCTION IF EXISTS get_cache_preferences(uuid);
DROP FUNCTION IF EXISTS upsert_cache_preferences(uuid, integer, boolean, integer);

-- ─── Step 3: Recreate upsert_cache_preferences with cache_audio param ─────────

CREATE OR REPLACE FUNCTION upsert_cache_preferences(
  p_user_id      UUID,
  p_limit_mb     INTEGER,
  p_auto_cache   BOOLEAN,
  p_expiry_days  INTEGER,
  p_cache_audio  BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_cache_preferences (user_id, limit_mb, auto_cache, expiry_days, cache_audio, updated_at)
  VALUES (p_user_id, p_limit_mb, p_auto_cache, p_expiry_days, p_cache_audio, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    limit_mb    = EXCLUDED.limit_mb,
    auto_cache  = EXCLUDED.auto_cache,
    expiry_days = EXCLUDED.expiry_days,
    cache_audio = EXCLUDED.cache_audio,
    updated_at  = NOW();
END;
$$;

-- ─── Step 4: Recreate get_cache_preferences with new cache_audio OUT param ────

CREATE OR REPLACE FUNCTION get_cache_preferences(p_user_id UUID)
RETURNS TABLE(
  limit_mb    INTEGER,
  auto_cache  BOOLEAN,
  expiry_days INTEGER,
  cache_audio BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ucp.limit_mb,
    ucp.auto_cache,
    ucp.expiry_days,
    ucp.cache_audio
  FROM user_cache_preferences ucp
  WHERE ucp.user_id = p_user_id
  LIMIT 1;
END;
$$;