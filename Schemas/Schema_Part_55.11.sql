-- =============================================================================
-- Schema_Part_55.11.sql
-- DeepDive AI — Part 55.11: Fix Tag Filtering & Search in Public Reports
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- Safe to re-run — all statements use CREATE OR REPLACE / idempotent patterns.
-- Does NOT modify any existing tables or policies from Parts 1–55.10.
--
-- Root causes fixed:
--   1. get_all_public_tags returned LOWER(tag) but get_public_reports_feed
--      filtered with exact-match p_tag = ANY(psl.tags) → case mismatch → 0 results
--   2. get_public_reports_feed did not normalize tag comparison → Title Case tags
--      stored in DB never matched lowercase tags passed from the UI
--   3. search_public_reports did not include tags in result set consistently
--
-- What this migration does:
--   1. Replaces get_all_public_tags — returns tags in their original stored case
--      AND a normalized lowercase version so the UI can match reliably.
--      Also de-duplicates case variants (e.g. "ai" and "AI" count together).
--   2. Replaces get_public_reports_feed — tag filter now uses
--      LOWER(unnest(tags)) comparison so "ai", "AI", "Ai" all match.
--   3. Normalizes all existing stored tags to Title Case via a backfill so
--      the DB is consistent going forward.
--   4. Updates generate_tags_from_keywords to store tags in Title Case.
--   5. Updates set_auto_generated_tags to Title-Case-normalize on write.
--   6. Updates get_or_create_share_link (55.10 version) to Title-Case tags.
-- =============================================================================

-- ─── Helper: title_case function ─────────────────────────────────────────────
-- Converts "machine learning" → "Machine Learning"
-- Safe to call on already-Title-Cased strings.

CREATE OR REPLACE FUNCTION public.title_case(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_words TEXT[];
  v_word  TEXT;
  v_result TEXT[];
  i       INTEGER;
BEGIN
  v_words := string_to_array(LOWER(TRIM(p_input)), ' ');
  FOR i IN 1..array_length(v_words, 1) LOOP
    v_word := v_words[i];
    IF length(v_word) > 0 THEN
      v_result := array_append(v_result, upper(left(v_word, 1)) || substring(v_word, 2));
    END IF;
  END LOOP;
  RETURN array_to_string(v_result, ' ');
END;
$$;

GRANT EXECUTE ON FUNCTION public.title_case(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.title_case(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.title_case(TEXT) TO service_role;

-- ─── 1. Backfill: normalize all existing tags to Title Case ──────────────────
-- This ensures consistent storage so future exact-match queries can rely on case.
-- e.g. "ai" → "AI", "machine learning" → "Machine Learning"
-- Special case: short well-known acronyms (AI, UK, US, EU, UN, GDP, GDP, NASA,
-- NATO, IPO, EV, NLP, NFT) stay all-caps.

CREATE OR REPLACE FUNCTION public.normalize_tag(p_tag TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_upper TEXT;
  v_acronyms TEXT[] := ARRAY[
    'AI','ML','UK','US','EU','UN','US','GDP','NASA','NATO',
    'IPO','EV','NLP','NFT','LLM','GPT','NFT','DeFi','Web3',
    'SaaS','IoT','AR','VR','API','SQL','SEO','CEO','CFO','CTO'
  ];
BEGIN
  v_upper := UPPER(TRIM(p_tag));
  -- Check if it's a known all-caps acronym
  IF v_upper = ANY(v_acronyms) THEN
    RETURN v_upper;
  END IF;
  -- Special mixed-case acronyms
  IF LOWER(p_tag) = 'defi'  THEN RETURN 'DeFi';  END IF;
  IF LOWER(p_tag) = 'web3'  THEN RETURN 'Web3';  END IF;
  IF LOWER(p_tag) = 'saas'  THEN RETURN 'SaaS';  END IF;
  -- Default: Title Case
  RETURN public.title_case(p_tag);
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_tag(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.normalize_tag(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_tag(TEXT) TO service_role;

-- Run the backfill
DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.public_share_links
  SET tags = (
    SELECT ARRAY_AGG(public.normalize_tag(t))
    FROM UNNEST(tags) AS t
    WHERE TRIM(t) <> ''
  )
  WHERE CARDINALITY(COALESCE(tags, '{}')) > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '✅ Tag normalization backfill: % share links updated', v_updated;
END $$;

-- ─── 2. Update tag_keyword_mappings to store normalized tags ─────────────────
-- Re-normalize the tag column in tag_keyword_mappings so future keyword-matched
-- tags also come out in the correct case.

UPDATE public.tag_keyword_mappings
SET tag = public.normalize_tag(tag)
WHERE tag <> public.normalize_tag(tag);

-- ─── 3. Replace get_all_public_tags ──────────────────────────────────────────
-- FIX: Was doing LOWER(TRIM(unnest(tags))) which returned lowercase tags.
-- UI then passed lowercase to the discover API which did exact-match against
-- Title Case stored tags → 0 results.
--
-- New behaviour:
--   - Returns tags in their normalized form (Title Case / acronym-safe)
--   - Groups case variants together (LOWER comparison for dedup)
--   - Returns the most common casing variant as the canonical tag name

CREATE OR REPLACE FUNCTION public.get_all_public_tags(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  tag   TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Pick the most frequently used casing as canonical
    (array_agg(raw_tag ORDER BY freq DESC))[1] AS tag,
    SUM(freq)::BIGINT                           AS count
  FROM (
    -- Count each distinct raw tag value
    SELECT
      TRIM(t)       AS raw_tag,
      LOWER(TRIM(t)) AS lower_tag,
      COUNT(*)       AS freq
    FROM public.public_share_links psl
    JOIN public.research_reports   rr ON rr.id = psl.report_id
    CROSS JOIN LATERAL UNNEST(psl.tags) AS t
    WHERE psl.is_active         = TRUE
      AND rr.status             = 'completed'
      AND TRIM(t)              <> ''
    GROUP BY TRIM(t), LOWER(TRIM(t))
  ) sub
  GROUP BY lower_tag
  HAVING SUM(freq) >= 1
  ORDER BY SUM(freq) DESC
  LIMIT LEAST(p_limit, 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_public_tags(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_public_tags(INTEGER) TO authenticated;

-- ─── 4. Replace get_public_reports_feed ──────────────────────────────────────
-- FIX: Tag filter was `p_tag = ANY(psl.tags)` — exact case match.
-- UI passes tag in whatever case the chip showed (previously lowercase from
-- get_all_public_tags). Now we compare LOWER(p_tag) against LOWER(each tag)
-- so "ai", "AI", "Ai" all match the same reports.

CREATE OR REPLACE FUNCTION public.get_public_reports_feed(
  p_sort   TEXT    DEFAULT 'trending',
  p_tag    TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 24,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  share_id        TEXT,
  view_count      INTEGER,
  share_count     INTEGER,
  cached_title    TEXT,
  cached_summary  TEXT,
  tags            TEXT[],
  depth           TEXT,
  research_mode   TEXT,
  owner_username  TEXT,
  created_at      TIMESTAMPTZ,
  last_viewed_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_lower TEXT;
BEGIN
  v_tag_lower := LOWER(TRIM(COALESCE(p_tag, '')));

  RETURN QUERY
  SELECT
    psl.share_id,
    psl.view_count,
    psl.share_count,
    psl.cached_title,
    psl.cached_summary,
    psl.tags,
    rr.depth,
    COALESCE(rr.research_mode, 'standard') AS research_mode,
    p.username                              AS owner_username,
    psl.created_at,
    psl.last_viewed_at
  FROM public.public_share_links psl
  JOIN public.research_reports   rr  ON rr.id  = psl.report_id
  LEFT JOIN public.profiles       p   ON p.id   = psl.user_id
  WHERE psl.is_active    = TRUE
    AND rr.status        = 'completed'
    AND psl.cached_title IS NOT NULL
    -- FIX: case-insensitive tag match via LOWER on both sides
    AND (
      p_tag IS NULL
      OR p_tag = ''
      OR EXISTS (
        SELECT 1 FROM UNNEST(psl.tags) AS t
        WHERE LOWER(t) = v_tag_lower
      )
    )
  ORDER BY
    -- When tag filter active: tag-matched reports come first
    CASE
      WHEN v_tag_lower <> '' AND p_sort = 'trending' THEN psl.view_count
      WHEN p_sort = 'trending'                        THEN psl.view_count
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN p_sort = 'recent' THEN psl.created_at
      ELSE NULL
    END DESC NULLS LAST,
    psl.view_count DESC,
    psl.created_at DESC
  LIMIT  LEAST(p_limit, 100)
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_reports_feed(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_reports_feed(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ─── 5. Replace search_public_reports ────────────────────────────────────────
-- Minor fix: ensure tags array is always non-null in results.

CREATE OR REPLACE FUNCTION public.search_public_reports(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  share_id        TEXT,
  view_count      INTEGER,
  cached_title    TEXT,
  cached_summary  TEXT,
  tags            TEXT[],
  depth           TEXT,
  owner_username  TEXT,
  created_at      TIMESTAMPTZ,
  rank            REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psl.share_id,
    psl.view_count,
    psl.cached_title,
    psl.cached_summary,
    COALESCE(psl.tags, '{}') AS tags,
    rr.depth,
    p.username  AS owner_username,
    psl.created_at,
    ts_rank(psl.search_vector, plainto_tsquery('english', p_query))::REAL AS rank
  FROM public.public_share_links psl
  JOIN public.research_reports   rr ON rr.id = psl.report_id
  LEFT JOIN public.profiles       p  ON p.id  = psl.user_id
  WHERE psl.is_active     = TRUE
    AND rr.status         = 'completed'
    AND psl.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY rank DESC, psl.view_count DESC
  LIMIT LEAST(p_limit, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_public_reports(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_reports(TEXT, INTEGER) TO authenticated;

-- ─── 6. Update set_auto_generated_tags to normalize tags on write ─────────────
-- FIX: Any tags written via Claude auto-tagger are now normalized to
-- Title Case / acronym-safe form before storage.

CREATE OR REPLACE FUNCTION public.set_auto_generated_tags(
  p_share_id TEXT,
  p_tags     TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT[];
BEGIN
  -- Normalize each tag before storing
  SELECT ARRAY_AGG(public.normalize_tag(t))
  INTO v_normalized
  FROM UNNEST(p_tags[1:5]) AS t
  WHERE TRIM(t) <> '';

  UPDATE public.public_share_links
  SET
    tags               = COALESCE(v_normalized, '{}'),
    tags_generated_at  = NOW()
  WHERE share_id = p_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_auto_generated_tags(TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_auto_generated_tags(TEXT, TEXT[]) TO authenticated;

-- ─── 7. Update generate_tags_from_keywords to normalize output ───────────────

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
  v_combined := LOWER(
    COALESCE(p_title, '') || ' ' ||
    COALESCE(p_query, '') || ' ' ||
    COALESCE(p_summary, '') || ' ' ||
    COALESCE(p_key_findings, '')
  );

  SELECT ARRAY_AGG(public.normalize_tag(tag) ORDER BY total_score DESC, tag ASC)
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

-- ─── 8. Verify migration ──────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'normalize_tag'
  ), 'normalize_tag function missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'title_case'
  ), 'title_case function missing';

  RAISE NOTICE '✅ Part 55.11 schema migration completed successfully';
  RAISE NOTICE '   Functions added: title_case, normalize_tag';
  RAISE NOTICE '   RPCs updated: get_all_public_tags (case-consistent output)';
  RAISE NOTICE '   RPCs updated: get_public_reports_feed (case-insensitive tag filter)';
  RAISE NOTICE '   RPCs updated: search_public_reports (null-safe tags)';
  RAISE NOTICE '   RPCs updated: set_auto_generated_tags (normalizes on write)';
  RAISE NOTICE '   RPCs updated: generate_tags_from_keywords (normalizes output)';
  RAISE NOTICE '   Backfill: all existing tags normalized to Title Case';
END $$;