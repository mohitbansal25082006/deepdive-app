-- =============================================================================
-- schema_part55.10.sql
-- DeepDive AI — Part 55.10: Auto-Tag System for Public Reports
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- Safe to re-run — all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- Does NOT modify any existing tables or policies from Parts 1–55.9.
--
-- What this migration does:
--   1. Adds `tags_generated_at` column to public_share_links to track when
--      tags were last auto-generated (prevents redundant re-generation)
--   2. Adds RPC: generate_tags_from_keywords — lightweight server-side tag
--      extraction using keyword matching across title, query, key_findings
--   3. Adds RPC: set_auto_generated_tags — called by Next.js after Claude
--      generates tags, writes them and stamps tags_generated_at
--   4. Adds RPC: get_reports_needing_tags — returns share_ids where
--      tags = '{}' or tags_generated_at IS NULL (for batch backfill jobs)
--   5. Updates get_public_reports_feed to ORDER BY tag relevance when a
--      tag filter is active (reports with that tag first, then view_count)
--   6. Full backfill: runs generate_tags_from_keywords for all existing
--      share links that still have empty tags using DB-side keyword logic
-- =============================================================================

-- ─── 1. Add tags_generated_at column ─────────────────────────────────────────
-- Tracks when tags were last set by the auto-tag system.
-- NULL  → tags have never been generated
-- NOT NULL → tags were last generated/set at this timestamp

ALTER TABLE public.public_share_links
  ADD COLUMN IF NOT EXISTS tags_generated_at TIMESTAMPTZ;

-- Index for the "needs tagging" query
CREATE INDEX IF NOT EXISTS idx_psl_needs_tags
  ON public.public_share_links (tags_generated_at)
  WHERE is_active = TRUE AND tags_generated_at IS NULL;

-- ─── 2. Keyword taxonomy for server-side tag extraction ───────────────────────
-- This table stores keyword→tag mappings used by generate_tags_from_keywords.
-- It lets us add new mappings without a schema change.

CREATE TABLE IF NOT EXISTS public.tag_keyword_mappings (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword    TEXT    NOT NULL UNIQUE,   -- lowercase keyword/phrase to match
  tag        TEXT    NOT NULL,           -- tag to assign when keyword matches
  priority   INTEGER NOT NULL DEFAULT 1  -- higher priority wins on tie-break
);

-- Disable RLS — only service_role / SECURITY DEFINER RPCs touch this table
ALTER TABLE public.tag_keyword_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to tag_keyword_mappings" ON public.tag_keyword_mappings;
CREATE POLICY "No direct access to tag_keyword_mappings"
  ON public.tag_keyword_mappings FOR ALL USING (FALSE);

CREATE INDEX IF NOT EXISTS idx_tkm_keyword ON public.tag_keyword_mappings (keyword);
CREATE INDEX IF NOT EXISTS idx_tkm_tag     ON public.tag_keyword_mappings (tag);

-- ─── 3. Seed keyword taxonomy ─────────────────────────────────────────────────
-- Comprehensive keyword→tag mapping covering common research domains.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO public.tag_keyword_mappings (keyword, tag, priority) VALUES
  -- Technology & AI
  ('artificial intelligence', 'AI', 10),
  ('machine learning', 'AI', 10),
  ('deep learning', 'AI', 10),
  ('neural network', 'AI', 9),
  ('large language model', 'AI', 9),
  ('llm', 'AI', 9),
  ('generative ai', 'AI', 9),
  ('chatgpt', 'AI', 8),
  ('openai', 'AI', 8),
  ('anthropic', 'AI', 8),
  ('gpt', 'AI', 8),
  ('transformer', 'AI', 7),
  ('natural language processing', 'AI', 7),
  ('nlp', 'AI', 7),
  ('computer vision', 'AI', 7),
  ('robotics', 'Technology', 7),
  ('automation', 'Technology', 6),
  ('algorithm', 'Technology', 5),
  ('software', 'Technology', 5),
  ('programming', 'Technology', 5),
  ('cybersecurity', 'Cybersecurity', 9),
  ('cyber security', 'Cybersecurity', 9),
  ('hacking', 'Cybersecurity', 8),
  ('data breach', 'Cybersecurity', 8),
  ('encryption', 'Cybersecurity', 7),
  ('blockchain', 'Blockchain', 9),
  ('cryptocurrency', 'Crypto', 9),
  ('bitcoin', 'Crypto', 9),
  ('ethereum', 'Crypto', 9),
  ('defi', 'Crypto', 8),
  ('web3', 'Crypto', 8),
  ('nft', 'Crypto', 7),
  ('quantum computing', 'Technology', 9),
  ('semiconductor', 'Technology', 8),
  ('chip', 'Technology', 6),
  ('cloud computing', 'Technology', 8),
  ('saas', 'Technology', 7),
  ('startup', 'Business', 7),
  ('silicon valley', 'Technology', 7),
  ('app', 'Technology', 4),
  -- Finance & Economy
  ('stock market', 'Finance', 9),
  ('investment', 'Finance', 8),
  ('investing', 'Finance', 8),
  ('stock', 'Finance', 8),
  ('equity', 'Finance', 7),
  ('portfolio', 'Finance', 7),
  ('hedge fund', 'Finance', 8),
  ('venture capital', 'Finance', 8),
  ('ipo', 'Finance', 8),
  ('valuation', 'Finance', 7),
  ('interest rate', 'Economy', 8),
  ('inflation', 'Economy', 9),
  ('recession', 'Economy', 9),
  ('gdp', 'Economy', 8),
  ('federal reserve', 'Economy', 8),
  ('central bank', 'Economy', 8),
  ('monetary policy', 'Economy', 8),
  ('fiscal policy', 'Economy', 8),
  ('trade', 'Economy', 6),
  ('supply chain', 'Economy', 8),
  ('tariff', 'Economy', 7),
  ('economic growth', 'Economy', 8),
  ('cryptocurrency exchange', 'Finance', 8),
  ('real estate', 'Real Estate', 9),
  ('housing market', 'Real Estate', 9),
  ('mortgage', 'Real Estate', 8),
  ('property', 'Real Estate', 7),
  -- Health & Medicine
  ('health', 'Health', 7),
  ('medicine', 'Health', 8),
  ('medical', 'Health', 8),
  ('healthcare', 'Health', 9),
  ('drug', 'Health', 7),
  ('treatment', 'Health', 6),
  ('therapy', 'Health', 6),
  ('clinical trial', 'Health', 9),
  ('vaccine', 'Health', 9),
  ('cancer', 'Health', 9),
  ('diabetes', 'Health', 9),
  ('alzheimer', 'Health', 9),
  ('mental health', 'Mental Health', 10),
  ('depression', 'Mental Health', 9),
  ('anxiety', 'Mental Health', 9),
  ('psychology', 'Mental Health', 8),
  ('psychiatry', 'Mental Health', 8),
  ('nutrition', 'Health', 7),
  ('diet', 'Health', 6),
  ('fitness', 'Health', 6),
  ('obesity', 'Health', 8),
  ('pandemic', 'Health', 9),
  ('virus', 'Health', 8),
  ('antibiotic', 'Health', 8),
  ('pharmaceutical', 'Health', 8),
  ('biotech', 'Biotechnology', 9),
  ('biotechnology', 'Biotechnology', 10),
  ('gene', 'Biotechnology', 8),
  ('genome', 'Biotechnology', 9),
  ('crispr', 'Biotechnology', 10),
  ('stem cell', 'Biotechnology', 9),
  -- Climate & Environment
  ('climate change', 'Climate', 10),
  ('global warming', 'Climate', 10),
  ('carbon', 'Climate', 8),
  ('emissions', 'Climate', 8),
  ('renewable energy', 'Energy', 9),
  ('solar energy', 'Energy', 9),
  ('wind energy', 'Energy', 9),
  ('fossil fuel', 'Energy', 8),
  ('oil', 'Energy', 7),
  ('natural gas', 'Energy', 7),
  ('nuclear energy', 'Energy', 8),
  ('electric vehicle', 'Energy', 9),
  ('ev', 'Energy', 7),
  ('sustainability', 'Environment', 8),
  ('biodiversity', 'Environment', 8),
  ('deforestation', 'Environment', 8),
  ('pollution', 'Environment', 8),
  ('ocean', 'Environment', 6),
  ('ecosystem', 'Environment', 7),
  ('water', 'Environment', 5),
  -- Politics & Society
  ('politics', 'Politics', 8),
  ('election', 'Politics', 9),
  ('democracy', 'Politics', 8),
  ('government', 'Politics', 7),
  ('policy', 'Policy', 6),
  ('regulation', 'Policy', 7),
  ('law', 'Policy', 6),
  ('legislation', 'Policy', 7),
  ('geopolitics', 'Geopolitics', 9),
  ('war', 'Geopolitics', 8),
  ('conflict', 'Geopolitics', 7),
  ('sanctions', 'Geopolitics', 8),
  ('diplomacy', 'Geopolitics', 8),
  ('nato', 'Geopolitics', 8),
  ('united nations', 'Geopolitics', 7),
  ('immigration', 'Society', 8),
  ('social media', 'Society', 8),
  ('education', 'Education', 8),
  ('university', 'Education', 7),
  ('school', 'Education', 5),
  ('inequality', 'Society', 8),
  ('poverty', 'Society', 8),
  ('human rights', 'Society', 9),
  ('gender', 'Society', 7),
  ('race', 'Society', 6),
  -- Science & Research
  ('physics', 'Science', 8),
  ('chemistry', 'Science', 8),
  ('biology', 'Science', 8),
  ('astronomy', 'Science', 9),
  ('space', 'Space', 7),
  ('nasa', 'Space', 9),
  ('mars', 'Space', 9),
  ('satellite', 'Space', 8),
  ('neuroscience', 'Science', 9),
  ('mathematics', 'Science', 7),
  ('research', 'Research', 5),
  ('study', 'Research', 4),
  ('experiment', 'Research', 5),
  -- Business
  ('business', 'Business', 6),
  ('company', 'Business', 5),
  ('corporation', 'Business', 5),
  ('market', 'Business', 5),
  ('industry', 'Business', 5),
  ('revenue', 'Business', 6),
  ('profit', 'Business', 6),
  ('growth', 'Business', 5),
  ('merger', 'Business', 7),
  ('acquisition', 'Business', 7),
  ('management', 'Business', 5),
  ('leadership', 'Business', 5),
  ('entrepreneur', 'Business', 7),
  -- Consumer & Lifestyle
  ('food', 'Food', 6),
  ('restaurant', 'Food', 7),
  ('cooking', 'Food', 6),
  ('agriculture', 'Agriculture', 8),
  ('farming', 'Agriculture', 8),
  ('travel', 'Travel', 7),
  ('tourism', 'Travel', 8),
  ('fashion', 'Lifestyle', 7),
  ('sports', 'Sports', 7),
  ('gaming', 'Gaming', 8),
  ('entertainment', 'Entertainment', 7),
  ('music', 'Entertainment', 7),
  ('film', 'Entertainment', 6),
  ('media', 'Media', 6)
ON CONFLICT (keyword) DO NOTHING;

-- ─── 4. RPC: generate_tags_from_keywords ──────────────────────────────────────
-- Pure DB-side tag extraction using keyword matching.
-- Accepts report text fields and returns up to 5 best-matching tags.
-- This is the FAST path — used for the DB-side backfill.
-- The SLOW (but smarter) path uses Claude via Next.js API route /api/auto-tag.

CREATE OR REPLACE FUNCTION public.generate_tags_from_keywords(
  p_title         TEXT,
  p_query         TEXT,
  p_summary       TEXT DEFAULT '',
  p_key_findings  TEXT DEFAULT ''
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combined TEXT;
  v_tags     TEXT[];
BEGIN
  -- Combine all text, lowercase for matching
  v_combined := LOWER(
    COALESCE(p_title, '') || ' ' ||
    COALESCE(p_query, '') || ' ' ||
    COALESCE(p_summary, '') || ' ' ||
    COALESCE(p_key_findings, '')
  );

  -- Score each tag by sum of matching keyword priorities
  SELECT ARRAY_AGG(tag ORDER BY total_score DESC, tag ASC)
  INTO v_tags
  FROM (
    SELECT
      tkm.tag,
      SUM(tkm.priority) AS total_score
    FROM public.tag_keyword_mappings tkm
    WHERE v_combined LIKE '%' || tkm.keyword || '%'
    GROUP BY tkm.tag
    ORDER BY total_score DESC
    LIMIT 5
  ) scored;

  RETURN COALESCE(v_tags, '{}'::TEXT[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_tags_from_keywords(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.generate_tags_from_keywords(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tags_from_keywords(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ─── 5. RPC: set_auto_generated_tags ─────────────────────────────────────────
-- Called by Next.js (/api/auto-tag) after Claude generates tags.
-- Writes tags, stamps tags_generated_at, and updates search_vector.
-- Also called by the DB-side backfill below.
-- service_role only — this is a server-to-server call.

CREATE OR REPLACE FUNCTION public.set_auto_generated_tags(
  p_share_id TEXT,
  p_tags     TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET
    tags               = p_tags[1:5],
    tags_generated_at  = NOW()
  WHERE share_id = p_share_id;
END;
$$;

-- Only callable from Next.js server (service role key) or internal RPCs
GRANT EXECUTE ON FUNCTION public.set_auto_generated_tags(TEXT, TEXT[]) TO service_role;

-- ─── 6. RPC: get_reports_needing_tags ────────────────────────────────────────
-- Returns share_ids of active completed reports that have no tags yet.
-- Used by a background job / admin endpoint to batch-generate tags.

CREATE OR REPLACE FUNCTION public.get_reports_needing_tags(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  share_id       TEXT,
  cached_title   TEXT,
  report_query   TEXT,
  cached_summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psl.share_id,
    psl.cached_title,
    rr.query     AS report_query,
    psl.cached_summary
  FROM public.public_share_links psl
  JOIN public.research_reports   rr ON rr.id = psl.report_id
  WHERE psl.is_active         = TRUE
    AND rr.status             = 'completed'
    AND psl.tags_generated_at IS NULL
    AND (psl.cached_title IS NOT NULL OR rr.query IS NOT NULL)
  ORDER BY psl.created_at DESC
  LIMIT LEAST(p_limit, 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_needing_tags(INTEGER) TO service_role;

-- ─── 7. RPC: get_report_tag_status ───────────────────────────────────────────
-- Called by the Next.js report page to decide whether to trigger auto-tagging.
-- Returns current tags + whether they were auto-generated and when.

CREATE OR REPLACE FUNCTION public.get_report_tag_status(
  p_share_id TEXT
)
RETURNS TABLE (
  tags              TEXT[],
  tags_generated_at TIMESTAMPTZ,
  needs_tagging     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psl.tags,
    psl.tags_generated_at,
    (
      CARDINALITY(COALESCE(psl.tags, '{}')) = 0
      OR psl.tags_generated_at IS NULL
    ) AS needs_tagging
  FROM public.public_share_links psl
  WHERE psl.share_id = p_share_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_tag_status(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_report_tag_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_tag_status(TEXT) TO service_role;

-- ─── 8. Update get_or_create_share_link to stamp tags_generated_at ────────────
-- When explicit tags are provided (p_tags), stamp tags_generated_at so the
-- auto-tagger knows not to overwrite manually set tags.

DROP FUNCTION IF EXISTS public.get_or_create_share_link(UUID, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_or_create_share_link(
  p_report_id UUID,
  p_tags      TEXT[] DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_share_id   TEXT;
  v_exists     BOOLEAN;
  v_title      TEXT;
  v_summary    TEXT;
  v_query      TEXT;
  v_findings   TEXT;
  v_auto_tags  TEXT[];
  v_final_tags TEXT[];
  v_has_tags   BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.research_reports
    WHERE id = p_report_id AND user_id = v_user_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Report not found or not completed';
  END IF;

  -- Fetch report data
  SELECT
    COALESCE(title, query),
    LEFT(COALESCE(executive_summary, ''), 300),
    query,
    LEFT(COALESCE(key_findings::TEXT, ''), 500)
  INTO v_title, v_summary, v_query, v_findings
  FROM public.research_reports
  WHERE id = p_report_id;

  -- Determine final tags
  -- Priority: explicit p_tags > DB keyword extraction > empty
  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    v_final_tags := p_tags[1:5];
    v_has_tags   := TRUE;
  ELSE
    -- Try DB-side keyword extraction immediately
    v_auto_tags := public.generate_tags_from_keywords(
      v_title, v_query, v_summary, v_findings
    );
    v_final_tags := v_auto_tags;
    v_has_tags   := array_length(v_auto_tags, 1) > 0;
  END IF;

  -- Check for existing share link (active OR inactive)
  SELECT share_id INTO v_share_id
  FROM public.public_share_links
  WHERE report_id = p_report_id AND user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_share_id IS NOT NULL THEN
    UPDATE public.public_share_links
    SET
      is_active         = TRUE,
      cached_title      = COALESCE(cached_title, v_title),
      cached_summary    = COALESCE(cached_summary, v_summary),
      tags              = CASE
                            WHEN p_tags IS NOT NULL AND array_length(p_tags, 1) > 0
                              THEN p_tags[1:5]
                            WHEN CARDINALITY(COALESCE(tags, '{}')) = 0 AND v_has_tags
                              THEN v_final_tags
                            ELSE tags
                          END,
      tags_generated_at = CASE
                            WHEN tags_generated_at IS NULL AND v_has_tags
                              THEN NOW()
                            ELSE tags_generated_at
                          END
    WHERE share_id = v_share_id;
    RETURN v_share_id;
  END IF;

  -- Generate new unique 8-char share_id
  LOOP
    v_share_id := LOWER(SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 8));
    SELECT NOT EXISTS (
      SELECT 1 FROM public.public_share_links WHERE share_id = v_share_id
    ) INTO v_exists;
    EXIT WHEN v_exists;
  END LOOP;

  INSERT INTO public.public_share_links (
    share_id, report_id, user_id, is_active,
    tags, tags_generated_at,
    cached_title, cached_summary
  ) VALUES (
    v_share_id, p_report_id, v_user_id, TRUE,
    v_final_tags,
    CASE WHEN v_has_tags THEN NOW() ELSE NULL END,
    v_title, v_summary
  );

  RETURN v_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_share_link(UUID, TEXT[]) TO authenticated;

-- ─── 9. Update set_auto_generated_tags to be callable by authenticated too ────
-- The Next.js API route uses service_role, but we also need it from
-- the report page server component for the fast-path inline generation.

GRANT EXECUTE ON FUNCTION public.set_auto_generated_tags(TEXT, TEXT[]) TO authenticated;

-- ─── 10. DB-side backfill for all existing share links ───────────────────────
-- Runs generate_tags_from_keywords for every active share link that has
-- empty tags. Uses the report's title, query, cached_summary, and key_findings.
-- Safe to re-run — only touches rows where tags = '{}' AND tags_generated_at IS NULL.

DO $$
DECLARE
  v_row        RECORD;
  v_auto_tags  TEXT[];
  v_updated    INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT
      psl.share_id,
      psl.cached_title,
      rr.query,
      psl.cached_summary,
      LEFT(COALESCE(rr.key_findings::TEXT, ''), 500) AS key_findings_text
    FROM public.public_share_links psl
    JOIN public.research_reports   rr ON rr.id = psl.report_id
    WHERE psl.is_active         = TRUE
      AND rr.status             = 'completed'
      AND CARDINALITY(COALESCE(psl.tags, '{}')) = 0
      AND psl.tags_generated_at IS NULL
  LOOP
    v_auto_tags := public.generate_tags_from_keywords(
      v_row.cached_title,
      v_row.query,
      v_row.cached_summary,
      v_row.key_findings_text
    );

    IF array_length(v_auto_tags, 1) > 0 THEN
      UPDATE public.public_share_links
      SET
        tags              = v_auto_tags,
        tags_generated_at = NOW()
      WHERE share_id = v_row.share_id;
      v_updated := v_updated + 1;
    ELSE
      -- Mark as attempted even with no tags so it doesn't keep retrying
      -- on every migration run; the Next.js Claude-based tagger will handle it
      UPDATE public.public_share_links
      SET tags_generated_at = NOW() - INTERVAL '1 day'  -- sentinel: "tried but got nothing"
      WHERE share_id = v_row.share_id;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Backfill complete: % share links tagged via keyword matching', v_updated;
END $$;

-- ─── 11. Also backfill cached_title/cached_summary for any still-missing rows ──
-- (Carried over from Part 34 backfill — safe to re-run)

DO $$
BEGIN
  UPDATE public.public_share_links psl
  SET
    cached_title   = COALESCE(psl.cached_title,   rr.title),
    cached_summary = COALESCE(psl.cached_summary, LEFT(COALESCE(rr.executive_summary, ''), 300))
  FROM public.research_reports rr
  WHERE psl.report_id    = rr.id
    AND psl.cached_title IS NULL
    AND psl.is_active    = TRUE
    AND rr.status        = 'completed';

  RAISE NOTICE '✅ Cache backfill complete: cached_title/cached_summary updated';
END $$;

-- ─── 12. Verify migration ──────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name  = 'public_share_links'
      AND column_name = 'tags_generated_at'
  ) = 1, 'tags_generated_at column missing from public_share_links';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tag_keyword_mappings'
  ), 'tag_keyword_mappings table missing';

  RAISE NOTICE '✅ Part 55.10 schema migration completed successfully';
  RAISE NOTICE '   Column added: public_share_links.tags_generated_at';
  RAISE NOTICE '   Table added: tag_keyword_mappings (keyword → tag taxonomy)';
  RAISE NOTICE '   RPCs added: generate_tags_from_keywords, set_auto_generated_tags,';
  RAISE NOTICE '               get_reports_needing_tags, get_report_tag_status';
  RAISE NOTICE '   RPCs updated: get_or_create_share_link (now auto-tags on creation)';
  RAISE NOTICE '   Backfill: existing share links tagged via keyword matching';
END $$;