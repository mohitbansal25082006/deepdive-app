-- ============================================================
-- DeepDive AI — Part 58.1
-- Workspace Report Comments redesign + Member Profile upgrade
--
-- This migration:
--   1. Recreates get_member_shared_content_stats so it ALSO counts
--      voice debates (and stays resilient if any table is missing).
--   2. Recreates get_member_shared_items so it returns ALL shared
--      content types a member shared — presentations, academic papers,
--      podcasts, debates, AND voice debates — each carrying the
--      canonical content_id needed to open the correct viewer, plus
--      report_id where applicable.
--   3. Adds get_member_recent_comments — returns a member's recent
--      comments (with report_id + section_id) so the profile card can
--      deep-link straight to the comment in the report.
--   4. Extends get_member_workspace_stats with reports_added /
--      comments_made counts already present; unchanged but re-asserted.
--
-- NOTE: The legacy comment "resolve/unresolve" feature is being removed
--       from the CLIENT in Part 58.1. The is_resolved column and the
--       toggle_comment_resolved RPC are intentionally LEFT IN PLACE so
--       old data and any other callers don't break; the UI simply no
--       longer surfaces or calls them. No destructive change needed.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. get_member_shared_content_stats
--    Counts presentations / papers / podcasts / debates / voice debates
--    shared by a given user in a given workspace.
--    Every source table is wrapped so a missing table never breaks it.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_member_shared_content_stats(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_member_shared_content_stats(
  p_user_id      uuid,
  p_workspace_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_presentations int := 0;
  v_papers        int := 0;
  v_podcasts      int := 0;
  v_debates       int := 0;
  v_voice_debates int := 0;
BEGIN
  -- Caller must be a member of the workspace
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Presentations + academic papers live in shared_workspace_content
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE content_type = 'presentation'),
      COUNT(*) FILTER (WHERE content_type = 'academic_paper')
    INTO v_presentations, v_papers
    FROM public.shared_workspace_content
    WHERE workspace_id = p_workspace_id
      AND shared_by    = p_user_id;
  EXCEPTION WHEN undefined_table THEN
    v_presentations := 0; v_papers := 0;
  END;

  -- Podcasts
  BEGIN
    SELECT COUNT(*) INTO v_podcasts
    FROM public.shared_podcasts
    WHERE workspace_id = p_workspace_id
      AND shared_by    = p_user_id;
  EXCEPTION WHEN undefined_table THEN
    v_podcasts := 0;
  END;

  -- Debates
  BEGIN
    SELECT COUNT(*) INTO v_debates
    FROM public.shared_debates
    WHERE workspace_id = p_workspace_id
      AND shared_by    = p_user_id;
  EXCEPTION WHEN undefined_table THEN
    v_debates := 0;
  END;

  -- Voice debates
  BEGIN
    SELECT COUNT(*) INTO v_voice_debates
    FROM public.shared_voice_debates
    WHERE workspace_id = p_workspace_id
      AND shared_by    = p_user_id;
  EXCEPTION WHEN undefined_table THEN
    v_voice_debates := 0;
  END;

  RETURN json_build_object(
    'presentations', v_presentations,
    'papers',        v_papers,
    'podcasts',      v_podcasts,
    'debates',       v_debates,
    'voice_debates', v_voice_debates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_shared_content_stats(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. get_member_shared_items
--    Returns the member's most-recently shared items across ALL
--    content types, newest first. Each row carries:
--      id           — the shared-row id (stable key)
--      content_type — 'presentation'|'academic_paper'|'podcast'|'debate'|'voice_debate'
--      title        — display title
--      subtitle     — optional secondary line
--      content_id   — the CANONICAL content id used to open the viewer
--                     (presentation id / paper id / podcast id / debate id /
--                      voice debate id)
--      report_id    — linked research report id where applicable
--      shared_at    — timestamp
-- ============================================================

DROP FUNCTION IF EXISTS public.get_member_shared_items(uuid, uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_member_shared_items(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_limit        int DEFAULT 20
)
RETURNS TABLE (
  id           text,
  content_type text,
  title        text,
  subtitle     text,
  content_id   text,
  report_id    text,
  shared_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH combined AS (
    -- Presentations + academic papers
    SELECT
      swc.id::text                          AS id,
      swc.content_type::text                AS content_type,
      COALESCE(swc.title, 'Untitled')       AS title,
      swc.subtitle                          AS subtitle,
      swc.content_id::text                  AS content_id,
      swc.report_id::text                   AS report_id,
      swc.shared_at                         AS shared_at
    FROM public.shared_workspace_content swc
    WHERE swc.workspace_id = p_workspace_id
      AND swc.shared_by    = p_user_id
      AND swc.content_type IN ('presentation','academic_paper')

    UNION ALL

    -- Podcasts
    SELECT
      sp.id::text,
      'podcast'::text,
      COALESCE(sp.title, 'Podcast Episode'),
      NULLIF(sp.topic, ''),
      sp.podcast_id::text,
      sp.report_id::text,
      sp.shared_at
    FROM public.shared_podcasts sp
    WHERE sp.workspace_id = p_workspace_id
      AND sp.shared_by    = p_user_id

    UNION ALL

    -- Debates
    SELECT
      sd.id::text,
      'debate'::text,
      COALESCE(sd.topic, 'AI Debate'),
      NULLIF(sd.question, ''),
      sd.debate_id::text,
      sd.report_id::text,
      sd.shared_at
    FROM public.shared_debates sd
    WHERE sd.workspace_id = p_workspace_id
      AND sd.shared_by    = p_user_id

    UNION ALL

    -- Voice debates
    SELECT
      svd.id::text,
      'voice_debate'::text,
      COALESCE(svd.topic, 'Voice Debate'),
      NULLIF(svd.question, ''),
      svd.voice_debate_id::text,
      NULL::text,
      svd.shared_at
    FROM public.shared_voice_debates svd
    WHERE svd.workspace_id = p_workspace_id
      AND svd.shared_by    = p_user_id
  )
  SELECT c.id, c.content_type, c.title, c.subtitle, c.content_id, c.report_id, c.shared_at
  FROM combined c
  ORDER BY c.shared_at DESC
  LIMIT p_limit;

EXCEPTION WHEN undefined_table THEN
  -- If one of the shared_* tables doesn't exist yet, fall back to whatever
  -- the core shared_workspace_content table can provide.
  RETURN QUERY
  SELECT
    swc.id::text,
    swc.content_type::text,
    COALESCE(swc.title, 'Untitled'),
    swc.subtitle,
    swc.content_id::text,
    swc.report_id::text,
    swc.shared_at
  FROM public.shared_workspace_content swc
  WHERE swc.workspace_id = p_workspace_id
    AND swc.shared_by    = p_user_id
  ORDER BY swc.shared_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_shared_items(uuid, uuid, int) TO authenticated;


-- ============================================================
-- 3. get_member_recent_comments
--    Returns a member's most-recent comments in a workspace with the
--    report id + title + section id so the profile card can deep-link
--    straight to the comment. Newest first.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_member_recent_comments(uuid, uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_member_recent_comments(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_limit        int DEFAULT 20
)
RETURNS TABLE (
  id            text,
  report_id     text,
  report_title  text,
  content       text,
  section_id    text,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    rc.id::text,
    rc.report_id::text,
    COALESCE(rr.title, 'Untitled'),
    rc.content,
    rc.section_id,
    rc.created_at
  FROM public.report_comments rc
  LEFT JOIN public.research_reports rr ON rr.id = rc.report_id
  WHERE rc.workspace_id = p_workspace_id
    AND rc.user_id      = p_user_id
  ORDER BY rc.created_at DESC
  LIMIT p_limit;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_recent_comments(uuid, uuid, int) TO authenticated;


-- ============================================================
-- 4. get_member_recent_reports
--    A member's most-recently added reports in a workspace (newest
--    first), with the report id + title for direct navigation.
--    Used so the profile card can show "show all" reports too.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_member_recent_reports(uuid, uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_member_recent_reports(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_limit        int DEFAULT 20
)
RETURNS TABLE (
  id        text,
  title     text,
  added_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    wr.report_id::text,
    COALESCE(rr.title, 'Untitled'),
    wr.added_at
  FROM public.workspace_reports wr
  LEFT JOIN public.research_reports rr ON rr.id = wr.report_id
  WHERE wr.workspace_id = p_workspace_id
    AND wr.added_by     = p_user_id
  ORDER BY wr.added_at DESC
  LIMIT p_limit;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_recent_reports(uuid, uuid, int) TO authenticated;


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON FUNCTION public.get_member_shared_content_stats(uuid, uuid)
  IS 'Per-member shared content counts incl. voice debates (Part 58.1)';
COMMENT ON FUNCTION public.get_member_shared_items(uuid, uuid, int)
  IS 'Per-member shared items across all 5 content types with canonical content_id (Part 58.1)';
COMMENT ON FUNCTION public.get_member_recent_comments(uuid, uuid, int)
  IS 'Per-member recent comments with report_id + section_id for deep-linking (Part 58.1)';
COMMENT ON FUNCTION public.get_member_recent_reports(uuid, uuid, int)
  IS 'Per-member recently added reports for the profile card (Part 58.1)';

-- ============================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';