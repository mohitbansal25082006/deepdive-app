-- schema_part30.sql
-- Part 30 — Joystick positioning, template history, online image/icon
-- Safe to run on any DB that already has Parts 1–29 applied.
-- All changes use IF NOT EXISTS / OR REPLACE — fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Template History table ────────────────────────────────────────────────
-- Stores a full snapshot of the presentation BEFORE each template was applied.
-- Users can browse history and restore to any previous state from the editor.

CREATE TABLE IF NOT EXISTS template_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id       UUID        NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,

  -- Full snapshot of slides array before the template was applied
  slides_snapshot       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Full snapshot of editor_data array before the template was applied
  editor_data_snapshot  JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Font family at time of snapshot
  font_family           TEXT        NOT NULL DEFAULT 'system',

  -- Which template was applied (so we can show "Before applying Startup Pitch")
  template_id           TEXT        DEFAULT NULL,
  template_name         TEXT        DEFAULT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast per-presentation history lookup
CREATE INDEX IF NOT EXISTS idx_template_history_presentation_id
  ON template_history(presentation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_history_user_id
  ON template_history(user_id);

-- ─── RLS for template_history ─────────────────────────────────────────────────

ALTER TABLE template_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own template history" ON template_history;
CREATE POLICY "Users can insert own template history"
  ON template_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own template history" ON template_history;
CREATE POLICY "Users can view own template history"
  ON template_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own template history" ON template_history;
CREATE POLICY "Users can delete own template history"
  ON template_history FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 2. Presentations: add online image cache column ─────────────────────────
-- Stores resolved online image URLs so PPTX/PDF export can embed them.

ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS online_images_cache JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN presentations.online_images_cache IS
  'Part 30: array of {blockId, url, thumbnailUrl} for online images added to slides. '
  'Cached so PPTX/PDF export can embed images without re-fetching.';

-- ─── 3. RPC: save template history snapshot ───────────────────────────────────

CREATE OR REPLACE FUNCTION save_template_history(
  p_presentation_id     UUID,
  p_user_id             UUID,
  p_slides_snapshot     JSONB,
  p_editor_data_snapshot JSONB,
  p_font_family         TEXT,
  p_template_id         TEXT  DEFAULT NULL,
  p_template_name       TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_entry_count INTEGER;
BEGIN
  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM presentations
    WHERE id = p_presentation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  -- Insert snapshot
  INSERT INTO template_history (
    presentation_id,
    user_id,
    slides_snapshot,
    editor_data_snapshot,
    font_family,
    template_id,
    template_name
  )
  VALUES (
    p_presentation_id,
    p_user_id,
    p_slides_snapshot,
    p_editor_data_snapshot,
    p_font_family,
    p_template_id,
    p_template_name
  )
  RETURNING id INTO v_new_id;

  -- Keep only the last 20 history entries per presentation to avoid bloat
  SELECT COUNT(*) INTO v_entry_count
  FROM template_history
  WHERE presentation_id = p_presentation_id AND user_id = p_user_id;

  IF v_entry_count > 20 THEN
    DELETE FROM template_history
    WHERE id IN (
      SELECT id FROM template_history
      WHERE presentation_id = p_presentation_id AND user_id = p_user_id
      ORDER BY created_at ASC
      LIMIT (v_entry_count - 20)
    );
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_template_history(UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── 4. RPC: get template history for a presentation ─────────────────────────

CREATE OR REPLACE FUNCTION get_template_history(
  p_presentation_id UUID,
  p_user_id         UUID,
  p_limit           INT DEFAULT 20
)
RETURNS TABLE (
  id                    UUID,
  template_id           TEXT,
  template_name         TEXT,
  slide_count           INTEGER,
  font_family           TEXT,
  slides_snapshot       JSONB,
  editor_data_snapshot  JSONB,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      th.id,
      th.template_id,
      th.template_name,
      jsonb_array_length(th.slides_snapshot)::INTEGER AS slide_count,
      th.font_family,
      th.slides_snapshot,
      th.editor_data_snapshot,
      th.created_at
    FROM template_history th
    WHERE th.presentation_id = p_presentation_id
      AND th.user_id = p_user_id
    ORDER BY th.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_template_history(UUID, UUID, INT)
  TO authenticated;

-- ─── 5. RPC: delete a specific history entry ─────────────────────────────────

CREATE OR REPLACE FUNCTION delete_template_history_entry(
  p_entry_id UUID,
  p_user_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM template_history
  WHERE id = p_entry_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_template_history_entry(UUID, UUID)
  TO authenticated;

-- ─── 6. RPC: clear all history for a presentation ────────────────────────────

CREATE OR REPLACE FUNCTION clear_template_history(
  p_presentation_id UUID,
  p_user_id         UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM presentations
    WHERE id = p_presentation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  DELETE FROM template_history
  WHERE presentation_id = p_presentation_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_template_history(UUID, UUID)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Summary of changes:
--   template_history: new table with RLS + 5 RPCs
--   presentations: +online_images_cache (JSONB)
-- No changes to existing policies or columns.
-- ─────────────────────────────────────────────────────────────────────────────