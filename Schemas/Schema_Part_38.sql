-- ============================================================
-- DeepDive AI — schema_part38.sql
-- Academic Paper Editor: versioning + citation imports
-- ============================================================
-- Run this AFTER all previous schemas.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- ─── Paper Versions Table ────────────────────────────────────────────────────
-- Stores up to 10 snapshots per paper for version history + restore.

CREATE TABLE IF NOT EXISTS public.paper_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id       UUID        NOT NULL REFERENCES public.academic_papers(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number INTEGER     NOT NULL DEFAULT 1,
  version_label  TEXT        NOT NULL DEFAULT '',   -- e.g. "Before Expand — Introduction"
  sections       JSONB       NOT NULL DEFAULT '[]',
  abstract       TEXT        NOT NULL DEFAULT '',
  word_count     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paper_versions ENABLE ROW LEVEL SECURITY;

-- ─── Add UPDATE policy (was missing — caused renames to silently fail) ────────
-- All 4 policies now exist: SELECT, INSERT, UPDATE, DELETE

DROP POLICY IF EXISTS "Users can view own paper versions"   ON public.paper_versions;
DROP POLICY IF EXISTS "Users can insert own paper versions" ON public.paper_versions;
DROP POLICY IF EXISTS "Users can update own paper versions" ON public.paper_versions;
DROP POLICY IF EXISTS "Users can delete own paper versions" ON public.paper_versions;

CREATE POLICY "Users can view own paper versions"
  ON public.paper_versions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paper versions"
  ON public.paper_versions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper versions"
  ON public.paper_versions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own paper versions"
  ON public.paper_versions FOR DELETE USING (auth.uid() = user_id);

-- Verify all 4 policies now exist:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'paper_versions';
-- Expected rows:
--   "Users can view own paper versions"   | SELECT
--   "Users can insert own paper versions" | INSERT
--   "Users can update own paper versions" | UPDATE   ← newly added
--   "Users can delete own paper versions" | DELETE

CREATE INDEX IF NOT EXISTS paper_versions_paper_id_idx
  ON public.paper_versions(paper_id, created_at DESC);

-- ─── Imported Citations Table ─────────────────────────────────────────────────
-- Stores citations imported from URL/DOI for Citation Manager.

CREATE TABLE IF NOT EXISTS public.paper_imported_citations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id    UUID        NOT NULL REFERENCES public.academic_papers(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url  TEXT        NOT NULL DEFAULT '',
  title       TEXT        NOT NULL DEFAULT '',
  authors     TEXT        NOT NULL DEFAULT '',
  year        TEXT        NOT NULL DEFAULT '',
  publisher   TEXT        NOT NULL DEFAULT '',
  doi         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paper_imported_citations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own imported citations"   ON public.paper_imported_citations;
DROP POLICY IF EXISTS "Users can insert own imported citations" ON public.paper_imported_citations;
DROP POLICY IF EXISTS "Users can delete own imported citations" ON public.paper_imported_citations;

CREATE POLICY "Users can view own imported citations"
  ON public.paper_imported_citations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imported citations"
  ON public.paper_imported_citations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own imported citations"
  ON public.paper_imported_citations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS paper_imported_citations_paper_id_idx
  ON public.paper_imported_citations(paper_id);

-- ─── Add editor columns to academic_papers ────────────────────────────────────
-- editor_data: JSON blob for per-section formatting overrides (bold/italic/etc.)
-- export_config: JSON blob for PDF/DOCX export settings (institution, author, font size, etc.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'academic_papers' AND column_name = 'editor_data'
  ) THEN
    ALTER TABLE public.academic_papers ADD COLUMN editor_data JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'academic_papers' AND column_name = 'export_config'
  ) THEN
    ALTER TABLE public.academic_papers ADD COLUMN export_config JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'academic_papers' AND column_name = 'ai_edits_count'
  ) THEN
    ALTER TABLE public.academic_papers ADD COLUMN ai_edits_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─── RPC: Save paper edits (sections + abstract + editor_data) ───────────────

CREATE OR REPLACE FUNCTION public.save_paper_editor(
  p_paper_id    UUID,
  p_user_id     UUID,
  p_sections    JSONB,
  p_abstract    TEXT,
  p_word_count  INTEGER,
  p_editor_data JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_papers
    WHERE id = p_paper_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.academic_papers
  SET
    sections    = p_sections,
    abstract    = p_abstract,
    word_count  = p_word_count,
    editor_data = p_editor_data,
    updated_at  = NOW()
  WHERE id = p_paper_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_paper_editor(UUID, UUID, JSONB, TEXT, INTEGER, JSONB) TO authenticated;

-- ─── RPC: Save export config ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_paper_export_config(
  p_paper_id UUID,
  p_user_id  UUID,
  p_config   JSONB
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.academic_papers
  SET export_config = p_config, updated_at = NOW()
  WHERE id = p_paper_id AND user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.save_paper_export_config(UUID, UUID, JSONB) TO authenticated;

-- ─── RPC: Save paper version (snapshot) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_paper_version(
  p_paper_id      UUID,
  p_user_id       UUID,
  p_version_label TEXT,
  p_sections      JSONB,
  p_abstract      TEXT,
  p_word_count    INTEGER
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_version_number INTEGER;
  v_new_id         UUID;
  v_count          INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM public.paper_versions
  WHERE paper_id = p_paper_id;

  -- Insert new version
  INSERT INTO public.paper_versions
    (paper_id, user_id, version_number, version_label, sections, abstract, word_count)
  VALUES
    (p_paper_id, p_user_id, v_version_number, p_version_label, p_sections, p_abstract, p_word_count)
  RETURNING id INTO v_new_id;

  -- Prune older than 10 versions
  SELECT COUNT(*) INTO v_count
  FROM public.paper_versions
  WHERE paper_id = p_paper_id;

  IF v_count > 10 THEN
    DELETE FROM public.paper_versions
    WHERE paper_id = p_paper_id
      AND id NOT IN (
        SELECT id FROM public.paper_versions
        WHERE paper_id = p_paper_id
        ORDER BY created_at DESC
        LIMIT 10
      );
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_paper_version(UUID, UUID, TEXT, JSONB, TEXT, INTEGER) TO authenticated;

-- ─── RPC: Get paper versions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_paper_versions(p_paper_id UUID)
RETURNS TABLE (
  id             UUID,
  version_number INTEGER,
  version_label  TEXT,
  word_count     INTEGER,
  created_at     TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT id, version_number, version_label, word_count, created_at
  FROM public.paper_versions
  WHERE paper_id = p_paper_id
    AND user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_paper_versions(UUID) TO authenticated;

-- ─── RPC: Restore paper version ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_paper_version(
  p_version_id UUID,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_version public.paper_versions%ROWTYPE;
  v_word_count INTEGER;
BEGIN
  SELECT * INTO v_version
  FROM public.paper_versions
  WHERE id = p_version_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Compute word count from restored content
  v_word_count := v_version.word_count;

  -- Restore the paper
  UPDATE public.academic_papers
  SET
    sections   = v_version.sections,
    abstract   = v_version.abstract,
    word_count = v_word_count,
    updated_at = NOW()
  WHERE id = v_version.paper_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'paper_id',    v_version.paper_id,
    'sections',    v_version.sections,
    'abstract',    v_version.abstract,
    'word_count',  v_word_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_paper_version(UUID, UUID) TO authenticated;

-- ─── RPC: Track AI edits count ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_paper_ai_edits(p_paper_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.academic_papers
  SET ai_edits_count = COALESCE(ai_edits_count, 0) + 1, updated_at = NOW()
  WHERE id = p_paper_id AND user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_paper_ai_edits(UUID, UUID) TO authenticated;

-- ─── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.paper_versions IS 'Paper version snapshots for Part 38 Academic Paper Editor';
COMMENT ON TABLE public.paper_imported_citations IS 'Citations imported from URL/DOI for Citation Manager (Part 38)';
COMMENT ON FUNCTION public.save_paper_editor IS 'Save inline-edited sections and abstract back to academic_papers';
COMMENT ON FUNCTION public.save_paper_version IS 'Create a named version snapshot; auto-prunes to 10 per paper';
COMMENT ON FUNCTION public.get_paper_versions IS 'List version history for a paper (current user only)';
COMMENT ON FUNCTION public.restore_paper_version IS 'Restore a version snapshot to the live paper';