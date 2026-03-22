-- schema_part29.sql
-- Part 29 — Slide Template Library & Editor Fixes
-- Safe to run on any DB that already has Parts 1–28 applied.
-- ─────────────────────────────────────────────────────────────────────────────
-- Changes:
--   1. Add `template_id` column to presentations for tracking which template
--      was used to create or seed the deck.
--   2. Create `template_usage` table for analytics (which templates are popular)
--   3. Add RPC `track_template_usage` for incrementing usage counts
--   4. All changes use IF NOT EXISTS / OR REPLACE — fully idempotent
--   5. NO changes to existing RLS policies or columns
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Presentations: track which template seeded the deck ──────────────────

ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS template_id    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_slots JSONB   DEFAULT NULL;

-- template_id:    e.g. 'startup-pitch', 'market-analysis' — null if AI-generated
-- template_slots: reserved for future per-slot customization tracking

COMMENT ON COLUMN presentations.template_id IS
  'ID of the SlideTemplate used to seed this deck. NULL = fully AI-generated.';

COMMENT ON COLUMN presentations.template_slots IS
  'Reserved for future per-slot template customization data.';

-- ─── 2. Template usage analytics table ───────────────────────────────────────
-- Lightweight anonymous usage counter — no PII stored.

CREATE TABLE IF NOT EXISTS template_usage (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   TEXT        NOT NULL,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  presentation_id UUID      REFERENCES presentations(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  theme         TEXT        DEFAULT NULL
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_template_usage_template_id
  ON template_usage(template_id);

CREATE INDEX IF NOT EXISTS idx_template_usage_user_id
  ON template_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_template_usage_used_at
  ON template_usage(used_at DESC);

-- ─── RLS for template_usage ───────────────────────────────────────────────────

ALTER TABLE template_usage ENABLE ROW LEVEL SECURITY;

-- Users can insert their own usage records
DROP POLICY IF EXISTS "Users can insert own template usage" ON template_usage;
CREATE POLICY "Users can insert own template usage"
  ON template_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own usage history
DROP POLICY IF EXISTS "Users can view own template usage" ON template_usage;
CREATE POLICY "Users can view own template usage"
  ON template_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 3. Aggregate view: template popularity (read-only, no PII) ──────────────

CREATE OR REPLACE VIEW public.template_popularity AS
  SELECT
    template_id,
    COUNT(*)           AS total_uses,
    COUNT(DISTINCT user_id) AS unique_users,
    MAX(used_at)       AS last_used_at
  FROM template_usage
  GROUP BY template_id
  ORDER BY total_uses DESC;

-- Note: This view intentionally exposes aggregate counts only — no user_id.

-- ─── 4. RPC: track template usage ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION track_template_usage(
  p_template_id      TEXT,
  p_presentation_id  UUID  DEFAULT NULL,
  p_theme            TEXT  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO template_usage (template_id, user_id, presentation_id, theme)
  VALUES (p_template_id, auth.uid(), p_presentation_id, p_theme);

  -- Also update presentation's template_id if provided
  IF p_presentation_id IS NOT NULL THEN
    UPDATE presentations
    SET template_id = p_template_id
    WHERE id = p_presentation_id
      AND user_id = auth.uid();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION track_template_usage(TEXT, UUID, TEXT)
  TO authenticated;

-- ─── 5. RPC: get user's template usage history ───────────────────────────────

CREATE OR REPLACE FUNCTION get_user_template_history(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  template_id       TEXT,
  presentation_id   UUID,
  theme             TEXT,
  used_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      tu.template_id,
      tu.presentation_id,
      tu.theme,
      tu.used_at
    FROM template_usage tu
    WHERE tu.user_id = auth.uid()
    ORDER BY tu.used_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_template_history(INT)
  TO authenticated;

-- ─── 6. Backfill: mark existing AI-generated presentations with null template_id
-- (already null by default — this is just documentation)
-- UPDATE presentations SET template_id = NULL WHERE template_id IS NULL;
-- Nothing to do — column defaults to NULL.

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Summary of changes:
--   presentations:  +template_id (TEXT), +template_slots (JSONB)
--   template_usage: new table with RLS
--   template_popularity: new aggregate view
--   track_template_usage(): new RPC
--   get_user_template_history(): new RPC
-- ─────────────────────────────────────────────────────────────────────────────