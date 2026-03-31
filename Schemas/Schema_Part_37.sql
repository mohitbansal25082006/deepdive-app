-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — Part 37 Complete Schema
-- Community Search + Admin Social Analytics RPCs + Profile Fixes
-- Run ONCE in Supabase SQL Editor.
-- Safe to re-run — uses CREATE OR REPLACE throughout.
-- Does NOT drop or modify existing tables, policies, or triggers.
-- Requires: Part 36 schema (user_follows, share_links, follow_notifications)
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. PROFILES TABLE POLICIES
--    Add permissive public SELECT policy so new users' profiles are readable
--    by the React Native app's direct queries.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_public_select_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_public_select_all"
        ON public.profiles
        FOR SELECT
        TO authenticated, anon
        USING (true);
    $policy$;
    RAISE NOTICE 'Created permissive profiles SELECT policy.';
  ELSE
    RAISE NOTICE 'profiles_public_select_all already exists — skipping.';
  END IF;
END $$;

-- ============================================================================
-- 2. PROFILE LOOKUP FUNCTIONS
--    Robust username and ID lookups with NULL-username handling.
-- ============================================================================

-- get_public_profile — case-insensitive username lookup with UUID fallback
-- Handles new users with NULL username and navigation flows that pass userId.
CREATE OR REPLACE FUNCTION get_public_profile(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile       RECORD;
  v_uid           UUID    := auth.uid();
  v_is_following  BOOLEAN := FALSE;
  v_is_own        BOOLEAN := FALSE;
  v_pub_count     INTEGER := 0;
  v_total_views   BIGINT  := 0;
  v_input         TEXT    := TRIM(p_username);
BEGIN
  -- Strategy A: exact username match
  SELECT * INTO v_profile
  FROM profiles
  WHERE username = v_input
  LIMIT 1;

  -- Strategy B: case-insensitive match (covers username casing drift)
  IF NOT FOUND THEN
    SELECT * INTO v_profile
    FROM profiles
    WHERE LOWER(COALESCE(username, '')) = LOWER(v_input)
      AND username IS NOT NULL
    LIMIT 1;
  END IF;

  -- Strategy C: treat input as UUID → look up by id
  -- Some navigation flows pass userId rather than username.
  IF NOT FOUND THEN
    BEGIN
      DECLARE v_uuid UUID := v_input::UUID;
      BEGIN
        SELECT * INTO v_profile FROM profiles WHERE id = v_uuid LIMIT 1;
      END;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Not a valid UUID — skip silently
      NULL;
    END;
  END IF;

  -- Not found at all
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Visibility check: block private profiles from other viewers
  -- Own profile always visible. Public profile always visible.
  -- Private + other viewer → NULL.
  IF NOT COALESCE(v_profile.is_public, FALSE)
    AND (v_uid IS NULL OR v_uid != v_profile.id)
  THEN
    RETURN NULL;
  END IF;

  v_is_own := (v_uid IS NOT NULL AND v_uid = v_profile.id);

  IF v_uid IS NOT NULL AND NOT v_is_own THEN
    SELECT EXISTS (
      SELECT 1 FROM user_follows
      WHERE follower_id = v_uid AND following_id = v_profile.id
    ) INTO v_is_following;
  END IF;

  -- Public report stats
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(sl.view_count), 0)
    INTO v_pub_count, v_total_views
    FROM share_links sl
    JOIN research_reports rr ON sl.report_id = rr.id
    WHERE rr.user_id  = v_profile.id
      AND sl.is_active = TRUE
      AND rr.status    = 'completed';
  EXCEPTION WHEN OTHERS THEN
    v_pub_count   := 0;
    v_total_views := 0;
  END;

  RETURN jsonb_build_object(
    'id',              v_profile.id,
    'username',        v_profile.username,
    'full_name',       v_profile.full_name,
    'avatar_url',      v_profile.avatar_url,
    'bio',             v_profile.bio,
    'occupation',      v_profile.occupation,
    'interests',       COALESCE(to_jsonb(v_profile.interests), '[]'::JSONB),
    'is_public',       COALESCE(v_profile.is_public, FALSE),
    'follower_count',  COALESCE(v_profile.follower_count,  0),
    'following_count', COALESCE(v_profile.following_count, 0),
    'public_reports',  v_pub_count,
    'total_views',     v_total_views,
    'is_following',    v_is_following,
    'is_own_profile',  v_is_own
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_profile(TEXT) TO authenticated, anon;

-- get_public_profile_by_id — fallback lookup by UUID
CREATE OR REPLACE FUNCTION get_public_profile_by_id(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile       RECORD;
  v_uid           UUID    := auth.uid();
  v_is_following  BOOLEAN := FALSE;
  v_is_own        BOOLEAN := FALSE;
  v_pub_count     INTEGER := 0;
  v_total_views   BIGINT  := 0;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT COALESCE(v_profile.is_public, FALSE)
    AND (v_uid IS NULL OR v_uid != v_profile.id)
  THEN
    RETURN NULL;
  END IF;

  v_is_own := (v_uid IS NOT NULL AND v_uid = v_profile.id);

  IF v_uid IS NOT NULL AND NOT v_is_own THEN
    SELECT EXISTS (
      SELECT 1 FROM user_follows
      WHERE follower_id = v_uid AND following_id = v_profile.id
    ) INTO v_is_following;
  END IF;

  BEGIN
    SELECT COUNT(*), COALESCE(SUM(sl.view_count), 0)
    INTO v_pub_count, v_total_views
    FROM share_links sl
    JOIN research_reports rr ON sl.report_id = rr.id
    WHERE rr.user_id  = v_profile.id
      AND sl.is_active = TRUE
      AND rr.status    = 'completed';
  EXCEPTION WHEN OTHERS THEN
    v_pub_count   := 0;
    v_total_views := 0;
  END;

  RETURN jsonb_build_object(
    'id',              v_profile.id,
    'username',        v_profile.username,
    'full_name',       v_profile.full_name,
    'avatar_url',      v_profile.avatar_url,
    'bio',             v_profile.bio,
    'occupation',      v_profile.occupation,
    'interests',       COALESCE(to_jsonb(v_profile.interests), '[]'::JSONB),
    'is_public',       COALESCE(v_profile.is_public, FALSE),
    'follower_count',  COALESCE(v_profile.follower_count,  0),
    'following_count', COALESCE(v_profile.following_count, 0),
    'public_reports',  v_pub_count,
    'total_views',     v_total_views,
    'is_following',    v_is_following,
    'is_own_profile',  v_is_own
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_profile_by_id(UUID) TO authenticated, anon;

-- ============================================================================
-- 3. EXPLORE RESEARCHERS FUNCTION
--    Shows public_report_count (reports with active share_links) instead of
--    total report count. Removes profile_completed filter so new users
--    with is_public = TRUE appear even before completing full profile setup.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_explore_researchers(
  p_sort   TEXT    DEFAULT 'followers',
  p_search TEXT    DEFAULT NULL,
  p_limit  INT     DEFAULT 20,
  p_offset INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data)
      FROM (
        SELECT jsonb_build_object(
          'id',                   p.id,
          'username',             p.username,
          'full_name',            p.full_name,
          'avatar_url',           p.avatar_url,
          'bio',                  p.bio,
          'interests',            COALESCE(to_jsonb(p.interests), '[]'::JSONB),
          'follower_count',       COALESCE(p.follower_count,  0),
          'following_count',      COALESCE(p.following_count, 0),
          -- FIX: public_report_count = only reports with active share_links
          'report_count',         (
            SELECT COUNT(*) FROM share_links sl2
            JOIN research_reports rr2 ON sl2.report_id = rr2.id
            WHERE rr2.user_id  = p.id
              AND sl2.is_active = TRUE
              AND rr2.status    = 'completed'
          )::INT,
          'public_report_count',  (
            SELECT COUNT(*) FROM share_links sl3
            JOIN research_reports rr3 ON sl3.report_id = rr3.id
            WHERE rr3.user_id  = p.id
              AND sl3.is_active = TRUE
              AND rr3.status    = 'completed'
          )::INT,
          'recent_reports',       (
            SELECT COUNT(*) FROM share_links sl4
            JOIN research_reports rr4 ON sl4.report_id = rr4.id
            WHERE rr4.user_id   = p.id
              AND sl4.is_active  = TRUE
              AND rr4.status     = 'completed'
              AND rr4.created_at > NOW() - INTERVAL '30 days'
          )::INT,
          'is_following',         CASE WHEN v_uid IS NOT NULL THEN
            EXISTS(
              SELECT 1 FROM user_follows
              WHERE follower_id = v_uid AND following_id = p.id
            )
            ELSE FALSE END
        ) AS row_data
        FROM profiles p
        WHERE p.is_public = TRUE
          -- FIX: removed profile_completed = TRUE so new users appear
          AND (v_uid IS NULL OR p.id != v_uid)
          AND (
            p_search IS NULL
            OR p_search = ''
            OR p.full_name ILIKE '%' || p_search || '%'
            OR p.username  ILIKE '%' || p_search || '%'
            OR p.bio       ILIKE '%' || p_search || '%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.interests, ARRAY[]::TEXT[])) AS interest
              WHERE interest ILIKE '%' || p_search || '%'
            )
          )
        ORDER BY
          CASE WHEN p_sort = 'followers'
            THEN COALESCE(p.follower_count, 0) ELSE 0
          END DESC,
          CASE WHEN p_sort = 'active' THEN (
            SELECT COUNT(*) FROM share_links sl5
            JOIN research_reports rr5 ON sl5.report_id = rr5.id
            WHERE rr5.user_id   = p.id
              AND sl5.is_active  = TRUE
              AND rr5.created_at > NOW() - INTERVAL '30 days'
          )::INT ELSE 0 END DESC,
          CASE WHEN p_sort = 'newest'
            THEN p.created_at
            ELSE '1970-01-01'::TIMESTAMPTZ
          END DESC,
          COALESCE(p.follower_count, 0) DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION get_explore_researchers(TEXT, TEXT, INT, INT)
  TO authenticated, anon;

-- ============================================================================
-- 4. COMMUNITY SEARCH FUNCTIONS
--    Used by the "Community" tab in the RN Global Search screen.
--    Accessible by authenticated users AND anon (web discover).
-- ============================================================================

-- Community Keyword Search RPC
-- Searches all reports where is_active share_link exists + profile is public.
CREATE OR REPLACE FUNCTION search_public_reports(
  p_query  TEXT,
  p_limit  INT  DEFAULT 20,
  p_offset INT  DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_like   TEXT  := '%' || TRIM(p_query) || '%';
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    (
      SELECT jsonb_agg(row_data)
      FROM (
        SELECT jsonb_build_object(
          'share_id',          sl.share_id,
          'report_id',         rr.id,
          'title',             COALESCE(rr.title, ''),
          'executive_summary', SUBSTRING(COALESCE(rr.executive_summary, ''), 1, 240),
          'depth',             COALESCE(rr.depth, 'quick'),
          'tags',              CASE
                                 WHEN sl.tags IS NULL
                                   THEN '[]'::JSONB
                                 WHEN jsonb_typeof(to_jsonb(sl.tags)) = 'array'
                                   THEN to_jsonb(sl.tags)
                                 ELSE '[]'::JSONB
                               END,
          'view_count',        COALESCE(sl.view_count,  0),
          'published_at',      sl.created_at,
          'author_username',   p.username,
          'author_full_name',  p.full_name,
          'author_avatar_url', p.avatar_url,
          'research_mode',     COALESCE(rr.research_mode, 'standard')
        ) AS row_data
        FROM share_links      sl
        JOIN research_reports rr ON sl.report_id  = rr.id
        JOIN profiles         p  ON rr.user_id    = p.id
        WHERE sl.is_active         = TRUE
          AND rr.status            = 'completed'
          AND COALESCE(p.is_public, FALSE) = TRUE
          AND (
            rr.title                ILIKE v_like
            OR rr.query             ILIKE v_like
            OR rr.executive_summary ILIKE v_like
          )
        ORDER BY
          COALESCE(sl.view_count, 0) DESC,
          sl.created_at DESC
        LIMIT  p_limit
        OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  ) INTO v_result;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION search_public_reports(TEXT, INT, INT)
  TO authenticated, anon;

-- Community Semantic Search RPC (pgvector)
-- Conditionally created — only if report_chunks table + vector extension
-- both exist (Part 6 RAG schema must be applied first).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_chunks'
  )
  AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION search_public_reports_semantic(
        query_embedding  vector(1536),
        match_count      INT   DEFAULT 20,
        match_threshold  FLOAT DEFAULT 0.28
      )
      RETURNS TABLE (
        report_id         UUID,
        share_id          TEXT,
        title             TEXT,
        executive_summary TEXT,
        depth             TEXT,
        tags              JSONB,
        view_count        INTEGER,
        published_at      TIMESTAMPTZ,
        author_username   TEXT,
        author_full_name  TEXT,
        author_avatar_url TEXT,
        best_similarity   FLOAT
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
      BEGIN
        RETURN QUERY
        SELECT
          top_chunks.report_id,
          sl.share_id,
          rr.title,
          SUBSTRING(COALESCE(rr.executive_summary, ''), 1, 240),
          rr.depth,
          CASE
            WHEN sl.tags IS NULL                           THEN '[]'::JSONB
            WHEN jsonb_typeof(to_jsonb(sl.tags)) = 'array' THEN to_jsonb(sl.tags)
            ELSE '[]'::JSONB
          END,
          COALESCE(sl.view_count, 0)::INTEGER,
          sl.created_at,
          p.username,
          p.full_name,
          p.avatar_url,
          top_chunks.sim::FLOAT
        FROM (
          -- Best similarity per report (DISTINCT ON keeps highest-scored chunk)
          SELECT DISTINCT ON (rc.report_id)
            rc.report_id,
            (1 - (rc.embedding <=> query_embedding)) AS sim
          FROM report_chunks rc
          WHERE (1 - (rc.embedding <=> query_embedding)) > match_threshold
          ORDER BY rc.report_id,
                   (1 - (rc.embedding <=> query_embedding)) DESC
        ) top_chunks
        JOIN research_reports rr ON rr.id         = top_chunks.report_id
        JOIN share_links      sl ON sl.report_id  = rr.id
                                AND sl.is_active  = TRUE
        JOIN profiles         p  ON p.id          = rr.user_id
        WHERE rr.status            = 'completed'
          AND COALESCE(p.is_public, FALSE) = TRUE
        ORDER BY top_chunks.sim DESC
        LIMIT match_count;
      END;
      $inner$;
    $func$;

    EXECUTE $grant$
      GRANT EXECUTE ON FUNCTION search_public_reports_semantic(vector, INT, FLOAT)
        TO authenticated, anon;
    $grant$;

    RAISE NOTICE 'search_public_reports_semantic created successfully.';
  ELSE
    RAISE NOTICE 'Skipping search_public_reports_semantic — report_chunks or pgvector not found.';
  END IF;
END $$;

-- ============================================================================
-- 5. ADMIN SOCIAL ANALYTICS FUNCTIONS
--    Callable by service role only (admin dashboard uses service role client).
-- ============================================================================

-- Admin Social Analytics Overview
-- Returns aggregate stats for the admin /dashboard/social page.
CREATE OR REPLACE FUNCTION get_social_analytics_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follows_today   BIGINT := 0;
  v_follows_week    BIGINT := 0;
  v_follows_all     BIGINT := 0;
  v_public_profiles BIGINT := 0;
  v_public_reports  BIGINT := 0;
  v_total_views     BIGINT := 0;
BEGIN
  -- Follow counts
  SELECT COUNT(*) INTO v_follows_today
  FROM user_follows
  WHERE created_at >= CURRENT_DATE;

  SELECT COUNT(*) INTO v_follows_week
  FROM user_follows
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_follows_all
  FROM user_follows;

  -- Profile / report visibility
  SELECT COUNT(*) INTO v_public_profiles
  FROM profiles
  WHERE COALESCE(is_public, FALSE) = TRUE;

  BEGIN
    SELECT
      COUNT(DISTINCT sl.id),
      COALESCE(SUM(sl.view_count), 0)
    INTO v_public_reports, v_total_views
    FROM share_links sl
    WHERE sl.is_active = TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_public_reports := 0;
    v_total_views    := 0;
  END;

  RETURN jsonb_build_object(
    'follows_today',      v_follows_today,
    'follows_this_week',  v_follows_week,
    'follows_all_time',   v_follows_all,
    'public_profiles',    v_public_profiles,
    'public_reports',     v_public_reports,
    'total_public_views', v_total_views
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'follows_today', 0, 'follows_this_week', 0, 'follows_all_time', 0,
    'public_profiles', 0, 'public_reports', 0, 'total_public_views', 0,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_social_analytics_admin() TO service_role;

-- Top Researchers for Admin Dashboard
CREATE OR REPLACE FUNCTION get_top_researchers_admin(p_limit INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'follower_count')::INT DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',                  p.id,
          'username',            p.username,
          'full_name',           p.full_name,
          'avatar_url',          p.avatar_url,
          'follower_count',      COALESCE(p.follower_count,  0),
          'following_count',     COALESCE(p.following_count, 0),
          'report_count',        (
            SELECT COUNT(*) FROM research_reports
            WHERE user_id = p.id AND status = 'completed'
          )::INT,
          'public_report_count', (
            SELECT COUNT(*) FROM share_links sl
            JOIN research_reports rr ON sl.report_id = rr.id
            WHERE rr.user_id  = p.id
              AND sl.is_active = TRUE
              AND rr.status    = 'completed'
          )::INT,
          'total_views',         COALESCE((
            SELECT SUM(sl2.view_count) FROM share_links sl2
            JOIN research_reports rr2 ON sl2.report_id = rr2.id
            WHERE rr2.user_id  = p.id
              AND sl2.is_active = TRUE
          ), 0)::INT
        ) AS row_data
        FROM profiles p
        WHERE COALESCE(p.is_public, FALSE) = TRUE
        ORDER BY COALESCE(p.follower_count, 0) DESC
        LIMIT p_limit
      ) t
    ),
    '[]'::JSONB
  );
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION get_top_researchers_admin(INT) TO service_role;

-- Follow Growth — 7-day trend for the admin chart
CREATE OR REPLACE FUNCTION get_follow_growth_7day()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'day',         TO_CHAR(gs.day, 'Mon DD'),
          'date',        gs.day::TEXT,
          'new_follows', COALESCE(cnt.c, 0)
        )
        ORDER BY gs.day
      )
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS gs(day)
      LEFT JOIN (
        SELECT
          DATE(created_at) AS d,
          COUNT(*)         AS c
        FROM user_follows
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(created_at)
      ) cnt ON cnt.d = gs.day::DATE
    ),
    '[]'::JSONB
  );
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION get_follow_growth_7day() TO service_role;

-- ============================================================================
-- Done ✓
-- Next steps:
--   1. Enable Realtime on user_follows in Supabase Dashboard (if not done in Part 36)
--   2. Deploy updated React Native, Public-Reports, and Admin-Dashboard apps
-- ============================================================================