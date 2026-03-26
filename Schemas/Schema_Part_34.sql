-- =============================================================================
-- schema_part34.sql
-- DeepDive AI — Part 34: Enhanced Shareable Public Report Pages
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- Safe to re-run — all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- Does NOT break any existing policies or tables from Parts 1–33.
-- =============================================================================

-- ─── 1. Extend public_share_links ────────────────────────────────────────────
-- tags:          up to 5 topic tags per report (AI, Finance, Health, etc.)
-- share_count:   how many times the native share sheet was used
-- cached_title:  denormalized for fast feed queries without joining research_reports
-- cached_summary:first 300 chars of executive_summary for preview cards

ALTER TABLE public.public_share_links
  ADD COLUMN IF NOT EXISTS tags           TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS share_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_title   TEXT,
  ADD COLUMN IF NOT EXISTS cached_summary TEXT;

-- Full-text search vector (populated by trigger below)
ALTER TABLE public.public_share_links
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- ─── 2. Trigger: auto-update search_vector ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_share_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    COALESCE(NEW.cached_title,   '') || ' ' ||
    COALESCE(NEW.cached_summary, '') || ' ' ||
    COALESCE(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_update_share_search_vector ON public.public_share_links;
CREATE TRIGGER trig_update_share_search_vector
  BEFORE INSERT OR UPDATE OF cached_title, cached_summary, tags
  ON public.public_share_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_share_search_vector();

-- ─── 3. Indexes for feed / search / trending queries ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_psl_tags
  ON public.public_share_links USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_psl_search_vector
  ON public.public_share_links USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_psl_trending
  ON public.public_share_links (view_count DESC, created_at DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_psl_recent
  ON public.public_share_links (created_at DESC)
  WHERE is_active = TRUE;

-- ─── 4. section_reactions table ───────────────────────────────────────────────
-- Anonymous IP-based emoji reactions per section.
-- One row per (share_id, section_id, ip_hash, emoji) — unique constraint acts
-- as a toggle guard.

CREATE TABLE IF NOT EXISTS public.section_reactions (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id    TEXT        NOT NULL REFERENCES public.public_share_links(share_id) ON DELETE CASCADE,
  section_id  TEXT        NOT NULL,   -- section.id or fallback "sec-{index}"
  ip_hash     TEXT        NOT NULL,   -- SHA-256 of visitor IP (same salt as chat limiter)
  emoji       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_emoji CHECK (emoji IN ('💡', '😮', '🤔', '👍')),
  UNIQUE (share_id, section_id, ip_hash, emoji)
);

ALTER TABLE public.section_reactions ENABLE ROW LEVEL SECURITY;

-- Block all direct access — only SECURITY DEFINER RPCs can read/write
DROP POLICY IF EXISTS "No direct access to section_reactions" ON public.section_reactions;
CREATE POLICY "No direct access to section_reactions"
  ON public.section_reactions FOR ALL USING (FALSE);

CREATE INDEX IF NOT EXISTS idx_sr_share_section
  ON public.section_reactions (share_id, section_id);

CREATE INDEX IF NOT EXISTS idx_sr_share_all
  ON public.section_reactions (share_id);

-- ─── 5. Replace get_or_create_share_link to support tags + cache + reactivation
-- Breaking change: old signature was (UUID). New: (UUID, TEXT[] DEFAULT NULL).
-- Calling with just (p_report_id := uuid) still works (p_tags defaults to NULL).
-- Now also reactivates inactive links (same URL preserved on re-publish).

DROP FUNCTION IF EXISTS public.get_or_create_share_link(UUID);

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
  v_focus      TEXT[];
  v_final_tags TEXT[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify report belongs to user and is completed
  IF NOT EXISTS (
    SELECT 1 FROM public.research_reports
    WHERE id = p_report_id AND user_id = v_user_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Report not found or not completed';
  END IF;

  -- Fetch report data for cache + auto-tags
  SELECT
    COALESCE(title, query),
    LEFT(COALESCE(executive_summary, ''), 300),
    COALESCE(focus_areas, '{}')
  INTO v_title, v_summary, v_focus
  FROM public.research_reports
  WHERE id = p_report_id;

  -- Tag priority: explicit > focus_areas > empty
  v_final_tags := COALESCE(
    NULLIF(p_tags,   '{}'),
    NULLIF(v_focus[1:5], '{}'),
    '{}'::TEXT[]
  );

  -- Check for existing share link (active OR inactive — reactivate if found)
  SELECT share_id INTO v_share_id
  FROM public.public_share_links
  WHERE report_id = p_report_id AND user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_share_id IS NOT NULL THEN
    -- Reactivate + update cache + merge tags
    UPDATE public.public_share_links
    SET
      is_active      = TRUE,
      cached_title   = COALESCE(cached_title,   v_title),
      cached_summary = COALESCE(cached_summary, v_summary),
      tags           = CASE
                         WHEN p_tags IS NOT NULL AND p_tags <> '{}' THEN p_tags[1:5]
                         WHEN tags = '{}' THEN v_final_tags
                         ELSE tags
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
    share_id, report_id, user_id, is_active, tags, cached_title, cached_summary
  ) VALUES (
    v_share_id, p_report_id, v_user_id, TRUE, v_final_tags, v_title, v_summary
  );

  RETURN v_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_share_link(UUID, TEXT[]) TO authenticated;

-- ─── 6. RPC: get_share_link_info ─────────────────────────────────────────────
-- Called by usePublicShare hook on mount to check existing share state.

CREATE OR REPLACE FUNCTION public.get_share_link_info(
  p_report_id UUID
)
RETURNS TABLE (
  share_id    TEXT,
  is_active   BOOLEAN,
  view_count  INTEGER,
  share_count INTEGER,
  tags        TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psl.share_id,
    psl.is_active,
    psl.view_count,
    psl.share_count,
    psl.tags
  FROM public.public_share_links psl
  WHERE psl.report_id = p_report_id
    AND psl.user_id   = auth.uid()
  ORDER BY psl.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_share_link_info(UUID) TO authenticated;

-- ─── 7. RPC: toggle_share_link ───────────────────────────────────────────────
-- Unpublish (is_active=FALSE) or re-publish (is_active=TRUE) a share link.

CREATE OR REPLACE FUNCTION public.toggle_share_link(
  p_share_id  TEXT,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET is_active = p_is_active
  WHERE share_id = p_share_id
    AND user_id  = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_share_link(TEXT, BOOLEAN) TO authenticated;

-- ─── 8. RPC: update_share_link_tags ──────────────────────────────────────────
-- Update topic tags for a share link (max 5 tags, enforced here).

CREATE OR REPLACE FUNCTION public.update_share_link_tags(
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
  SET tags = p_tags[1:5]
  WHERE share_id = p_share_id
    AND user_id  = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_share_link_tags(TEXT, TEXT[]) TO authenticated;

-- ─── 9. RPC: increment_share_count ───────────────────────────────────────────
-- Called from the client when the user copies/shares the link.

CREATE OR REPLACE FUNCTION public.increment_share_count(
  p_share_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET share_count = share_count + 1
  WHERE share_id = p_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_share_count(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_share_count(TEXT) TO authenticated;

-- ─── 10. RPC: update_share_cache ─────────────────────────────────────────────
-- Called server-side by Next.js (service role) when a report page is visited
-- and the cache fields are empty (backfill for pre-Part-34 share links).

CREATE OR REPLACE FUNCTION public.update_share_cache(
  p_share_id       TEXT,
  p_cached_title   TEXT,
  p_cached_summary TEXT,
  p_tags           TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET
    cached_title   = p_cached_title,
    cached_summary = p_cached_summary,
    tags           = CASE
                       WHEN p_tags IS NOT NULL AND p_tags <> '{}' THEN p_tags[1:5]
                       ELSE tags
                     END
  WHERE share_id = p_share_id;
END;
$$;

-- Service role only (called from Next.js server with service key)
GRANT EXECUTE ON FUNCTION public.update_share_cache(TEXT, TEXT, TEXT, TEXT[]) TO service_role;

-- ─── 11. RPC: get_public_reports_feed ────────────────────────────────────────
-- Discovery feed. sort: 'trending' | 'recent'. tag: optional filter.

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
BEGIN
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
    p.username   AS owner_username,
    psl.created_at,
    psl.last_viewed_at
  FROM public.public_share_links psl
  JOIN public.research_reports   rr  ON rr.id  = psl.report_id
  LEFT JOIN public.profiles       p   ON p.id   = psl.user_id
  WHERE psl.is_active    = TRUE
    AND rr.status        = 'completed'
    AND psl.cached_title IS NOT NULL
    AND (p_tag IS NULL OR p_tag = ANY(psl.tags))
  ORDER BY
    CASE WHEN p_sort = 'trending' THEN psl.view_count  END DESC NULLS LAST,
    CASE WHEN p_sort = 'recent'   THEN psl.created_at  END DESC NULLS LAST,
    psl.view_count DESC,
    psl.created_at DESC
  LIMIT  LEAST(p_limit, 100)
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_reports_feed(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_reports_feed(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ─── 12. RPC: search_public_reports ──────────────────────────────────────────
-- Full-text search across cached_title + cached_summary + tags.

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
    psl.tags,
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

-- ─── 13. RPC: get_trending_reports ───────────────────────────────────────────
-- Top N most viewed reports in the last X days.
-- Used by the trending sidebar widget on report pages.

CREATE OR REPLACE FUNCTION public.get_trending_reports(
  p_days  INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  share_id        TEXT,
  view_count      INTEGER,
  cached_title    TEXT,
  tags            TEXT[],
  depth           TEXT,
  owner_username  TEXT,
  created_at      TIMESTAMPTZ
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
    psl.tags,
    rr.depth,
    p.username  AS owner_username,
    psl.created_at
  FROM public.public_share_links psl
  JOIN public.research_reports   rr ON rr.id = psl.report_id
  LEFT JOIN public.profiles       p  ON p.id  = psl.user_id
  WHERE psl.is_active    = TRUE
    AND rr.status        = 'completed'
    AND psl.cached_title IS NOT NULL
    AND (
      psl.last_viewed_at >= NOW() - (p_days || ' days')::INTERVAL
      OR psl.created_at  >= NOW() - (p_days || ' days')::INTERVAL
    )
  ORDER BY psl.view_count DESC
  LIMIT LEAST(p_limit, 20);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_reports(INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_trending_reports(INTEGER, INTEGER) TO authenticated;

-- ─── 14. RPC: get_all_public_tags ────────────────────────────────────────────
-- Returns all distinct tags with their usage counts. Used for tag cloud / filter chips.

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
    LOWER(TRIM(unnest(psl.tags))) AS tag,
    COUNT(*)                       AS count
  FROM public.public_share_links psl
  JOIN public.research_reports   rr ON rr.id = psl.report_id
  WHERE psl.is_active = TRUE
    AND rr.status     = 'completed'
    AND CARDINALITY(psl.tags) > 0
  GROUP BY 1
  HAVING COUNT(*) >= 1
  ORDER BY 2 DESC
  LIMIT LEAST(p_limit, 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_public_tags(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_public_tags(INTEGER) TO authenticated;

-- ─── 15. RPC: toggle_section_reaction ────────────────────────────────────────
-- Toggle an emoji reaction for a section.
-- Returns whether the reaction was added (TRUE) or removed (FALSE),
-- plus updated per-emoji counts for that section.

CREATE OR REPLACE FUNCTION public.toggle_section_reaction(
  p_share_id   TEXT,
  p_section_id TEXT,
  p_ip_hash    TEXT,
  p_emoji      TEXT
)
RETURNS TABLE (
  added     BOOLEAN,
  reactions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
  v_added  BOOLEAN;
BEGIN
  -- Validate emoji
  IF p_emoji NOT IN ('💡', '😮', '🤔', '👍') THEN
    RAISE EXCEPTION 'Invalid emoji: %', p_emoji;
  END IF;

  -- Verify share link exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.public_share_links
    WHERE share_id = p_share_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Share link not found or inactive';
  END IF;

  -- Check if reaction already exists
  SELECT EXISTS (
    SELECT 1 FROM public.section_reactions
    WHERE share_id   = p_share_id
      AND section_id = p_section_id
      AND ip_hash    = p_ip_hash
      AND emoji      = p_emoji
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.section_reactions
    WHERE share_id   = p_share_id
      AND section_id = p_section_id
      AND ip_hash    = p_ip_hash
      AND emoji      = p_emoji;
    v_added := FALSE;
  ELSE
    INSERT INTO public.section_reactions (share_id, section_id, ip_hash, emoji)
    VALUES (p_share_id, p_section_id, p_ip_hash, p_emoji)
    ON CONFLICT DO NOTHING;
    v_added := TRUE;
  END IF;

  -- Return updated counts for this section
  RETURN QUERY
  SELECT
    v_added,
    COALESCE(
      (
        SELECT jsonb_object_agg(ec.emoji, ec.cnt)
        FROM (
          SELECT emoji, COUNT(*) AS cnt
          FROM public.section_reactions
          WHERE share_id = p_share_id AND section_id = p_section_id
          GROUP BY emoji
        ) ec
      ),
      '{}'::JSONB
    ) AS reactions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_section_reaction(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_section_reaction(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 16. RPC: get_report_reactions ───────────────────────────────────────────
-- Returns all reaction counts for a report, with per-IP "has_reacted" flag.

CREATE OR REPLACE FUNCTION public.get_report_reactions(
  p_share_id TEXT,
  p_ip_hash  TEXT DEFAULT NULL
)
RETURNS TABLE (
  section_id  TEXT,
  emoji       TEXT,
  count       BIGINT,
  has_reacted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.section_id,
    sr.emoji,
    COUNT(*)::BIGINT AS count,
    COALESCE(
      BOOL_OR(p_ip_hash IS NOT NULL AND sr.ip_hash = p_ip_hash),
      FALSE
    ) AS has_reacted
  FROM public.section_reactions sr
  WHERE sr.share_id = p_share_id
  GROUP BY sr.section_id, sr.emoji;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_reactions(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_report_reactions(TEXT, TEXT) TO authenticated;

-- ─── 17. Update get_report_by_share_id to also return new fields ──────────────
-- Must DROP first because the return type has changed (added share_count, tags,
-- cached_title columns). This is safe — the function is recreated immediately
-- below with identical logic plus the new columns, so no callers break.

DROP FUNCTION IF EXISTS public.get_report_by_share_id(TEXT);

CREATE OR REPLACE FUNCTION public.get_report_by_share_id(
  p_share_id TEXT
)
RETURNS TABLE (
  report_id          UUID,
  share_link_id      UUID,
  view_count         INTEGER,
  share_count        INTEGER,
  tags               TEXT[],
  cached_title       TEXT,
  query              TEXT,
  depth              TEXT,
  title              TEXT,
  executive_summary  TEXT,
  sections           JSONB,
  key_findings       JSONB,
  future_predictions JSONB,
  citations          JSONB,
  statistics         JSONB,
  sources_count      INTEGER,
  reliability_score  NUMERIC,
  infographic_data   JSONB,
  source_images      JSONB,
  knowledge_graph    JSONB,
  research_mode      TEXT,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ,
  owner_username     TEXT,
  owner_avatar_url   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rr.id               AS report_id,
    psl.id              AS share_link_id,
    psl.view_count,
    psl.share_count,
    psl.tags,
    psl.cached_title,
    rr.query,
    rr.depth,
    rr.title,
    rr.executive_summary,
    COALESCE(rr.sections,           '[]'::JSONB) AS sections,
    COALESCE(rr.key_findings,       '[]'::JSONB) AS key_findings,
    COALESCE(rr.future_predictions, '[]'::JSONB) AS future_predictions,
    COALESCE(rr.citations,          '[]'::JSONB) AS citations,
    COALESCE(rr.statistics,         '[]'::JSONB) AS statistics,
    COALESCE(rr.sources_count,      0)           AS sources_count,
    COALESCE(rr.reliability_score,  0)           AS reliability_score,
    rr.infographic_data,
    rr.source_images,
    rr.knowledge_graph,
    COALESCE(rr.research_mode, 'standard')       AS research_mode,
    rr.completed_at,
    rr.created_at,
    p.username          AS owner_username,
    p.avatar_url        AS owner_avatar_url
  FROM public.public_share_links psl
  JOIN public.research_reports rr ON rr.id = psl.report_id
  LEFT JOIN public.profiles    p  ON p.id  = psl.user_id
  WHERE psl.share_id  = p_share_id
    AND psl.is_active = TRUE
    AND rr.status     = 'completed'
  LIMIT 1;

  -- Backfill cache fields for pre-Part-34 share links visited for the first time
  UPDATE public.public_share_links psl2
  SET
    cached_title   = COALESCE(psl2.cached_title,   rr2.title),
    cached_summary = COALESCE(psl2.cached_summary, LEFT(rr2.executive_summary, 300)),
    tags           = CASE WHEN psl2.tags = '{}' THEN COALESCE(rr2.focus_areas[1:5], '{}') ELSE psl2.tags END
  FROM public.research_reports rr2
  WHERE psl2.share_id     = p_share_id
    AND psl2.report_id    = rr2.id
    AND psl2.cached_title IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_by_share_id(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_report_by_share_id(TEXT) TO authenticated;

-- ─── 18. One-time backfill for existing share links ───────────────────────────
-- Populate cached_title, cached_summary, tags for share links created before Part 34.
-- Safe to run multiple times (only updates rows where cached_title IS NULL).

DO $$
BEGIN
  UPDATE public.public_share_links psl
  SET
    cached_title   = rr.title,
    cached_summary = LEFT(rr.executive_summary, 300),
    tags           = CASE
                       WHEN psl.tags = '{}' THEN COALESCE(rr.focus_areas[1:5], '{}')
                       ELSE psl.tags
                     END
  FROM public.research_reports rr
  WHERE psl.report_id    = rr.id
    AND psl.cached_title IS NULL
    AND psl.is_active    = TRUE
    AND rr.status        = 'completed';

  RAISE NOTICE '✅ Backfill complete: existing share links have been cached';
END $$;

-- ─── 19. Verify migration ─────────────────────────────────────────────────────

DO $$
BEGIN
  -- Check new columns
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name   = 'public_share_links'
      AND column_name  IN ('tags', 'share_count', 'cached_title', 'cached_summary', 'search_vector')
  ) = 5, 'public_share_links columns missing';

  -- Check section_reactions table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'section_reactions'
  ), 'section_reactions table missing';

  RAISE NOTICE '✅ Part 34 schema migration completed successfully';
  RAISE NOTICE '   Tables: section_reactions';
  RAISE NOTICE '   Columns added to public_share_links: tags, share_count, cached_title, cached_summary, search_vector';
  RAISE NOTICE '   RPCs: get_share_link_info, toggle_share_link, update_share_link_tags,';
  RAISE NOTICE '         increment_share_count, update_share_cache (service_role),';
  RAISE NOTICE '         get_public_reports_feed, search_public_reports, get_trending_reports,';
  RAISE NOTICE '         get_all_public_tags, toggle_section_reaction, get_report_reactions';
  RAISE NOTICE '   Updated: get_or_create_share_link (now supports tags + reactivation)';
  RAISE NOTICE '   Updated: get_report_by_share_id (now returns tags, share_count, cached_title)';
END $$;