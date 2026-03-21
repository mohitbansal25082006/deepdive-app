-- schema_part28.sql
-- Part 28 — Slide Canvas Editor
-- Adds editor overlay columns to the presentations table.
-- Safe to run on any DB that already has Parts 1–27 applied.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Presentations: editor columns ───────────────────────────────────────────

-- editor_data: JSON array (one entry per slide, indexed same as `slides`).
-- Each entry holds { fieldFormats, additionalBlocks, backgroundColor, spacing }.
ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS editor_data    JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS font_family    TEXT    DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS ai_edits_count INTEGER DEFAULT 0;

COMMENT ON COLUMN presentations.editor_data IS
  'Per-slide editor overlay: field formatting, extra blocks, bg color, spacing. '
  'Array indexed same as the slides column.';

COMMENT ON COLUMN presentations.font_family IS
  'Deck-wide font family: system | serif | mono | rounded | condensed';

COMMENT ON COLUMN presentations.ai_edits_count IS
  'Running count of AI-powered edits (rewrite, generate slide, speaker notes).';

-- ─── Index for editor queries ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_presentations_user_id_editor
  ON presentations(user_id)
  WHERE editor_data IS NOT NULL AND editor_data != '[]'::jsonb;

-- ─── RLS: ensure existing policies still cover new columns ───────────────────
-- The existing RLS on presentations already filters by user_id, so the new
-- columns inherit those policies automatically. No new policy needed.

-- ─── Helper RPC: save editor state atomically ────────────────────────────────

CREATE OR REPLACE FUNCTION save_presentation_editor(
  p_presentation_id UUID,
  p_user_id         UUID,
  p_slides          JSONB,
  p_editor_data     JSONB,
  p_font_family     TEXT,
  p_ai_edits_delta  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM presentations
    WHERE id = p_presentation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  UPDATE presentations
  SET
    slides          = p_slides,
    editor_data     = p_editor_data,
    font_family     = p_font_family,
    total_slides    = jsonb_array_length(p_slides),
    ai_edits_count  = COALESCE(ai_edits_count, 0) + p_ai_edits_delta,
    updated_at      = NOW()
  WHERE id = p_presentation_id
  RETURNING jsonb_build_object(
    'id',             id,
    'total_slides',   total_slides,
    'ai_edits_count', ai_edits_count,
    'updated_at',     updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION save_presentation_editor(UUID, UUID, JSONB, JSONB, TEXT, INTEGER)
  TO authenticated;

-- ─── Helper RPC: load editor state ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_presentation_editor(
  p_presentation_id UUID,
  p_user_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',             p.id,
    'report_id',      p.report_id,
    'title',          p.title,
    'subtitle',       p.subtitle,
    'theme',          p.theme,
    'slides',         p.slides,
    'editor_data',    COALESCE(p.editor_data, '[]'::jsonb),
    'font_family',    COALESCE(p.font_family, 'system'),
    'total_slides',   p.total_slides,
    'export_count',   p.export_count,
    'ai_edits_count', COALESCE(p.ai_edits_count, 0),
    'generated_at',   p.generated_at
  )
  INTO v_result
  FROM presentations p
  WHERE p.id = p_presentation_id
    AND p.user_id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_presentation_editor(UUID, UUID)
  TO authenticated;