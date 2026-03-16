-- schema_part22.sql
-- Part 22 — Cache & Offline Mode
-- No new Supabase tables needed for client-side caching (all data stored on-device).
-- This migration only adds:
--   1. A user_cache_preferences table for syncing cache settings across devices
--      (optional — the app works entirely with local AsyncStorage/FileSystem too)
--   2. An index on research_reports for faster "recently completed" queries
--      (used by auto-cache to batch-cache on first launch)

-- ─── Optional: sync cache preferences across devices ────────────────────────

CREATE TABLE IF NOT EXISTS user_cache_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  limit_mb      INTEGER NOT NULL DEFAULT 100,
  auto_cache    BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_days   INTEGER NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_cache_prefs UNIQUE (user_id)
);

ALTER TABLE user_cache_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cache prefs"
  ON user_cache_preferences
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── RPC: upsert cache preferences ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_cache_preferences(
  p_user_id    UUID,
  p_limit_mb   INTEGER,
  p_auto_cache BOOLEAN,
  p_expiry_days INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_cache_preferences (user_id, limit_mb, auto_cache, expiry_days, updated_at)
  VALUES (p_user_id, p_limit_mb, p_auto_cache, p_expiry_days, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    limit_mb     = EXCLUDED.limit_mb,
    auto_cache   = EXCLUDED.auto_cache,
    expiry_days  = EXCLUDED.expiry_days,
    updated_at   = NOW();
END;
$$;

-- ─── RPC: get cache preferences ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_cache_preferences(p_user_id UUID)
RETURNS TABLE(limit_mb INTEGER, auto_cache BOOLEAN, expiry_days INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ucp.limit_mb, ucp.auto_cache, ucp.expiry_days
  FROM   user_cache_preferences ucp
  WHERE  ucp.user_id = p_user_id
  LIMIT  1;
END;
$$;

-- ─── Index for fast "recently completed" batch cache on first launch ─────────

CREATE INDEX IF NOT EXISTS idx_research_reports_completed_user
  ON research_reports (user_id, created_at DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_podcasts_completed_user
  ON podcasts (user_id, created_at DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_debate_sessions_completed_user
  ON debate_sessions (user_id, created_at DESC)
  WHERE status = 'completed';