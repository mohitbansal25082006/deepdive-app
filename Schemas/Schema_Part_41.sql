-- ============================================================
-- DeepDive AI — Part 41 COMPLETE SCHEMA
-- Combines Part 41.1 (Podcast Video Player + Mini Player Fixes),
--            Part 41.2 (Voice Debate Cloud Audio & Cross-Device Support),
--            Part 41.3 (Stats & Public Profile Fixes),
--            Part 41.5 (Workspace Members Can Open Shared Presentations & Papers)
--
-- SECTIONS:
--   §1  Drop existing functions (allow type changes)
--   §2  Storage — ensure podcast-audio bucket exists
--   §3  Storage policies — podcast-audio (podcast segments)
--   §4  Storage policies — voice debate audio (voice_debates/* path)
--   §5  RPC: get_shared_podcast_full_for_workspace   (Part 41.1)
--   §6  RPC: get_voice_debate_full                   (Part 41.2)
--   §7  RPC: update_voice_debate_cloud_urls          (Part 41.2)
--   §8  RPC: get_user_voice_debates                  (Part 41.2)
--   §9  RPC: get_user_research_stats                 (Part 41.3)
--   §10 RPC: get_public_profile                      (Part 41.3)
--   §11 RPC: get_public_reports_for_user             (Part 41.3)
--   §12 RPC: get_shared_presentation_for_workspace   (Part 41.5)
--   §13 RPC: get_shared_academic_paper_for_workspace (Part 41.5)
--   §14 Fix shared_workspace_content content_type check (Part 41.5)
--   §15 Realtime publication (voice_debates)
--   §16 Reload PostgREST schema cache
--
-- Safe to re-run — uses DROP/CREATE for functions with type changes,
-- ON CONFLICT DO NOTHING for bucket, and DROP POLICY IF EXISTS throughout.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  DROP EXISTING FUNCTIONS (allow return-type changes)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_user_research_stats(UUID)                          CASCADE;
DROP FUNCTION IF EXISTS public.get_public_profile(TEXT)                               CASCADE;
DROP FUNCTION IF EXISTS public.get_public_reports_for_user(TEXT, INT, INT)            CASCADE;
DROP FUNCTION IF EXISTS public.get_shared_podcast_full_for_workspace(UUID, UUID)      CASCADE;
DROP FUNCTION IF EXISTS public.get_voice_debate_full(UUID)                            CASCADE;
DROP FUNCTION IF EXISTS public.update_voice_debate_cloud_urls(UUID, TEXT[], BOOLEAN)  CASCADE;
DROP FUNCTION IF EXISTS public.get_user_voice_debates(INTEGER, INTEGER)               CASCADE;
DROP FUNCTION IF EXISTS public.get_shared_presentation_for_workspace(UUID, UUID)      CASCADE;
DROP FUNCTION IF EXISTS public.get_shared_academic_paper_for_workspace(UUID, UUID)    CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  STORAGE — ensure podcast-audio bucket exists
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-audio',
  'podcast-audio',
  true,
  52428800,  -- 50 MB per file
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  STORAGE POLICIES — podcast-audio bucket (podcast segments)
--     Path pattern: podcasts/{podcastId}/segment_N.mp3
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove stale policies from previous migrations
DROP POLICY IF EXISTS "podcast_audio_select_workspace_member" ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_insert_owner"            ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_update_owner"            ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_delete_owner"            ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_select_v2"               ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_insert_v2"               ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_update_v2"               ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_delete_v2"               ON storage.objects;

-- SELECT — podcast owner OR workspace member with shared access
CREATE POLICY "podcast_audio_select_v2"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND name NOT LIKE 'voice_debates/%'   -- voice_debates handled separately (§4)
        AND (
            -- Podcast owner can always stream their own audio
            EXISTS (
                SELECT 1 FROM public.podcasts p
                WHERE p.id::text = split_part(storage.objects.name, '/', 2)
                  AND p.user_id  = auth.uid()
            )
            OR
            -- Workspace member whose workspace has this podcast shared
            EXISTS (
                SELECT 1
                FROM public.shared_podcasts sp
                JOIN public.workspace_members wm
                  ON wm.workspace_id = sp.workspace_id
                WHERE sp.podcast_id::text = split_part(storage.objects.name, '/', 2)
                  AND wm.user_id = auth.uid()
            )
        )
    );

-- INSERT — only the podcast owner may upload segments
CREATE POLICY "podcast_audio_insert_v2"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'podcast-audio'
        AND name NOT LIKE 'voice_debates/%'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );

-- UPDATE
CREATE POLICY "podcast_audio_update_v2"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND name NOT LIKE 'voice_debates/%'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );

-- DELETE
CREATE POLICY "podcast_audio_delete_v2"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND name NOT LIKE 'voice_debates/%'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  STORAGE POLICIES — voice debate audio
--     Path pattern: voice_debates/{voiceDebateId}/turn_{N}.mp3
--     These share the podcast-audio bucket but use a distinct sub-path.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Voice debate audio public read"   ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner upload"  ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner update"  ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner delete"  ON storage.objects;

-- READ — public (bucket is public; URLs are direct)
CREATE POLICY "Voice debate audio public read"
    ON storage.objects FOR SELECT
    TO public
    USING (
        bucket_id = 'podcast-audio'
        AND name LIKE 'voice_debates/%'
    );

-- INSERT — authenticated uploader
CREATE POLICY "Voice debate audio owner upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'podcast-audio'
        AND name LIKE 'voice_debates/%'
        AND (storage.foldername(name))[1] = 'voice_debates'
    );

-- UPDATE
CREATE POLICY "Voice debate audio owner update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND name LIKE 'voice_debates/%'
    );

-- DELETE — cleanup when debate is removed
CREATE POLICY "Voice debate audio owner delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND name LIKE 'voice_debates/%'
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  RPC: get_shared_podcast_full_for_workspace                  (Part 41.1)
--     Returns full podcast row for workspace members opening Video Mode.
--     Bypasses owner RLS so non-owner workspace members can load the row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_shared_podcast_full_for_workspace(
    p_workspace_id UUID,
    p_podcast_id   UUID
)
RETURNS SETOF public.podcasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Caller must be a workspace member
    IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: not a member of this workspace.';
    END IF;

    -- Podcast must be shared to this workspace
    IF NOT EXISTS (
        SELECT 1 FROM public.shared_podcasts sp
        WHERE sp.workspace_id = p_workspace_id
          AND sp.podcast_id   = p_podcast_id
    ) THEN
        RAISE EXCEPTION 'This podcast is not shared to the workspace.';
    END IF;

    RETURN QUERY
    SELECT * FROM public.podcasts
    WHERE id = p_podcast_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_podcast_full_for_workspace(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_shared_podcast_full_for_workspace(UUID, UUID) IS
    'Part 41.1 — Returns full podcast row for workspace members opening Video Mode (bypasses owner RLS).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  RPC: get_voice_debate_full                                  (Part 41.2)
--     Returns a complete voice debate row by ID for cross-device playback.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_voice_debate_full(
    p_voice_debate_id UUID
)
RETURNS SETOF public.voice_debates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM public.voice_debates
    WHERE id      = p_voice_debate_id
      AND user_id = auth.uid()
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_voice_debate_full(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_voice_debate_full(UUID) IS
    'Part 41.2 — Loads a voice debate by ID for cross-device playback.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §7  RPC: update_voice_debate_cloud_urls                         (Part 41.2)
--     Called by the background upload service after audio segments are stored.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_voice_debate_cloud_urls(
    p_voice_debate_id UUID,
    p_audio_urls      TEXT[],
    p_all_uploaded    BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows_updated INTEGER;
BEGIN
    UPDATE public.voice_debates
    SET
        audio_storage_urls = p_audio_urls,
        audio_all_uploaded = p_all_uploaded,
        audio_uploaded_at  = now()
    WHERE id      = p_voice_debate_id
      AND user_id = auth.uid();

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RETURN v_rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_voice_debate_cloud_urls(UUID, TEXT[], BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.update_voice_debate_cloud_urls(UUID, TEXT[], BOOLEAN) IS
    'Part 41.2 — Updates audio_storage_urls after background cloud upload completes.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  RPC: get_user_voice_debates                                 (Part 41.2)
--     Returns all completed voice debates for the current user.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_voice_debates(
    p_limit  INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.voice_debates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM public.voice_debates
    WHERE user_id = auth.uid()
      AND status  = 'completed'
    ORDER BY created_at DESC
    LIMIT  p_limit
    OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_voice_debates(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_user_voice_debates(INTEGER, INTEGER) IS
    'Part 41.2 — Returns paginated completed voice debates for the current user.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §9  RPC: get_user_research_stats                                (Part 41.3)
--     Complete rewrite covering Parts 1–41.
--     Returns exactly ONE row with all stat columns useStats.ts expects.
--     Uses EXCEPTION WHEN undefined_table so it works at any migration state.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_research_stats(p_user_id UUID)
RETURNS TABLE (
    total_reports              BIGINT,
    completed_reports          BIGINT,
    total_sources              BIGINT,
    avg_reliability            NUMERIC,
    favorite_topic             TEXT,
    reports_this_month         BIGINT,
    total_assistant_messages   BIGINT,
    reports_with_embeddings    BIGINT,
    academic_papers_generated  BIGINT,
    total_podcasts             BIGINT,
    total_debates              BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_podcasts          BIGINT := 0;
    v_total_debates           BIGINT := 0;
    v_academic_papers         BIGINT := 0;
    v_assistant_messages      BIGINT := 0;
    v_reports_with_embeddings BIGINT := 0;
BEGIN
    -- ── Podcasts (Part 8) ─────────────────────────────────────────────────
    BEGIN
        SELECT COUNT(*) INTO v_total_podcasts
        FROM public.podcasts
        WHERE user_id = p_user_id AND status = 'completed';
    EXCEPTION WHEN undefined_table THEN v_total_podcasts := 0;
    END;

    -- ── Debates (Part 9) ──────────────────────────────────────────────────
    BEGIN
        SELECT COUNT(*) INTO v_total_debates
        FROM public.debate_sessions
        WHERE user_id = p_user_id AND status = 'completed';
    EXCEPTION WHEN undefined_table THEN v_total_debates := 0;
    END;

    -- ── Academic papers (Part 7) ──────────────────────────────────────────
    BEGIN
        SELECT COUNT(*) INTO v_academic_papers
        FROM public.academic_papers
        WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN v_academic_papers := 0;
    END;

    -- ── Assistant messages (Part 6 Research Assistant / Part 26 KB) ──────
    -- Prefer kb_messages (Part 26); fall back to conversation_messages (Part 6)
    BEGIN
        SELECT COUNT(*) INTO v_assistant_messages
        FROM public.kb_messages
        WHERE user_id = p_user_id AND role = 'assistant';
    EXCEPTION WHEN undefined_table THEN
        BEGIN
            SELECT COUNT(*) INTO v_assistant_messages
            FROM public.conversation_messages
            WHERE user_id = p_user_id AND role = 'assistant';
        EXCEPTION WHEN undefined_table THEN
            v_assistant_messages := 0;
        END;
    END;

    -- ── Reports with embeddings (Part 6 RAG) ─────────────────────────────
    -- Try report_chunks → report_embeddings → embedding_status column fallback
    BEGIN
        SELECT COUNT(DISTINCT report_id) INTO v_reports_with_embeddings
        FROM public.report_chunks
        WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        BEGIN
            SELECT COUNT(DISTINCT report_id) INTO v_reports_with_embeddings
            FROM public.report_embeddings
            WHERE user_id = p_user_id;
        EXCEPTION WHEN undefined_table THEN
            BEGIN
                SELECT COUNT(*) INTO v_reports_with_embeddings
                FROM public.research_reports
                WHERE user_id        = p_user_id
                  AND status         = 'completed'
                  AND embedding_status IS NOT NULL
                  AND embedding_status != 'pending';
            EXCEPTION WHEN undefined_column THEN
                v_reports_with_embeddings := 0;
            END;
        END;
    END;

    -- ── Core report stats ─────────────────────────────────────────────────
    RETURN QUERY
    SELECT
        COUNT(*)                                                              AS total_reports,
        COUNT(*) FILTER (WHERE rr.status = 'completed')                       AS completed_reports,
        COALESCE(
            SUM(rr.sources_count) FILTER (WHERE rr.status = 'completed'), 0
        )::BIGINT                                                             AS total_sources,
        COALESCE(
            ROUND(
                AVG(rr.reliability_score) FILTER (
                    WHERE rr.reliability_score > 0 AND rr.status = 'completed'
                )::NUMERIC,
                1
            ),
            0
        )                                                                     AS avg_reliability,
        (
            SELECT rr2.query
            FROM   public.research_reports rr2
            WHERE  rr2.user_id = p_user_id
              AND  rr2.status  = 'completed'
              AND  rr2.query IS NOT NULL
            GROUP  BY rr2.query
            ORDER  BY COUNT(*) DESC
            LIMIT  1
        )                                                                     AS favorite_topic,
        COUNT(*) FILTER (
            WHERE rr.created_at >= date_trunc('month', NOW())
        )                                                                     AS reports_this_month,
        v_assistant_messages                                                  AS total_assistant_messages,
        v_reports_with_embeddings                                             AS reports_with_embeddings,
        v_academic_papers                                                     AS academic_papers_generated,
        v_total_podcasts                                                      AS total_podcasts,
        v_total_debates                                                       AS total_debates
    FROM public.research_reports rr
    WHERE rr.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_research_stats(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_research_stats(UUID) IS
    'Part 41.3 — Complete stats rewrite covering all Parts 1–41.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §10 RPC: get_public_profile                                     (Part 41.3)
--     Handles service-role calls (auth.uid() = NULL) from Next.js.
--     NULL uid is treated as a trusted internal call and may read any profile.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile      RECORD;
    v_uid          UUID    := auth.uid();
    v_is_following BOOLEAN := FALSE;
    v_is_own       BOOLEAN := FALSE;
    v_pub_count    INTEGER := 0;
    v_total_views  BIGINT  := 0;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE username = p_username;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Service-role (v_uid IS NULL) and the profile owner can always read.
    -- Everyone else requires is_public = true.
    IF NOT COALESCE(v_profile.is_public, FALSE)
        AND v_uid IS NOT NULL
        AND v_uid != v_profile.id
    THEN
        RETURN NULL;
    END IF;

    v_is_own := (v_uid IS NOT NULL AND v_uid = v_profile.id);

    IF v_uid IS NOT NULL AND NOT v_is_own THEN
        SELECT EXISTS (
            SELECT 1 FROM user_follows
            WHERE follower_id  = v_uid
              AND following_id = v_profile.id
        ) INTO v_is_following;
    END IF;

    BEGIN
        SELECT COUNT(*), COALESCE(SUM(sl.view_count), 0)
        INTO v_pub_count, v_total_views
        FROM share_links sl
        JOIN research_reports rr ON sl.report_id = rr.id
        WHERE rr.user_id   = v_profile.id
          AND sl.is_active = TRUE
          AND rr.status    = 'completed';
    EXCEPTION WHEN undefined_table THEN
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

GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO anon;

COMMENT ON FUNCTION public.get_public_profile(TEXT) IS
    'Part 41.3 — Returns public profile JSON; supports service-role (NULL uid) calls from Next.js.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §11 RPC: get_public_reports_for_user                            (Part 41.3)
--     Service-role calls (v_uid = NULL) can read public profiles' reports.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_reports_for_user(
    p_username TEXT,
    p_limit    INT DEFAULT 20,
    p_offset   INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_is_public BOOLEAN;
    v_uid       UUID := auth.uid();
    v_result    JSONB;
BEGIN
    SELECT id, COALESCE(is_public, FALSE)
    INTO v_user_id, v_is_public
    FROM profiles WHERE username = p_username;

    IF NOT FOUND THEN RETURN '[]'::JSONB; END IF;

    -- Service-role (v_uid = NULL) and owner may read private profiles.
    IF NOT v_is_public
        AND v_uid IS NOT NULL
        AND v_uid != v_user_id
    THEN
        RETURN '[]'::JSONB;
    END IF;

    BEGIN
        SELECT COALESCE(
            (
                SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC)
                FROM (
                    SELECT jsonb_build_object(
                        'share_id',          sl.share_id,
                        'title',             COALESCE(rr.title, ''),
                        'query',             COALESCE(rr.query, ''),
                        'depth',             COALESCE(rr.depth, 'quick'),
                        'executive_summary', SUBSTRING(COALESCE(rr.executive_summary, ''), 1, 200),
                        'tags',              CASE
                                                 WHEN sl.tags IS NULL THEN '[]'::JSONB
                                                 WHEN jsonb_typeof(to_jsonb(sl.tags)) = 'array' THEN to_jsonb(sl.tags)
                                                 ELSE '[]'::JSONB
                                             END,
                        'sources_count',     COALESCE(rr.sources_count, 0),
                        'reliability_score', COALESCE(rr.reliability_score, 0),
                        'view_count',        COALESCE(sl.view_count, 0),
                        'share_count',       COALESCE(sl.share_count, 0),
                        'created_at',        rr.created_at,
                        'completed_at',      rr.completed_at
                    ) AS row_data
                    FROM share_links      sl
                    JOIN research_reports rr ON sl.report_id = rr.id
                    WHERE rr.user_id   = v_user_id
                      AND sl.is_active = TRUE
                    ORDER BY rr.created_at DESC
                    LIMIT  p_limit
                    OFFSET p_offset
                ) t
            ),
            '[]'::JSONB
        ) INTO v_result;
    EXCEPTION WHEN OTHERS THEN
        v_result := '[]'::JSONB;
    END;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_reports_for_user(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_reports_for_user(TEXT, INT, INT) TO anon;

COMMENT ON FUNCTION public.get_public_reports_for_user(TEXT, INT, INT) IS
    'Part 41.3 — Returns paginated public reports for a user; supports service-role (NULL uid) calls.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §12 RPC: get_shared_presentation_for_workspace                 (Part 41.5)
--     Returns full presentation row for workspace members.
--     Bypasses owner RLS so non-owner workspace members can load the row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_shared_presentation_for_workspace(
  p_workspace_id    UUID,
  p_presentation_id UUID
)
RETURNS SETOF public.presentations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Verify caller is a workspace member
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0005';
  END IF;

  -- Verify the presentation is actually shared to this workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.shared_workspace_content swc
    WHERE swc.workspace_id = p_workspace_id
      AND swc.content_type = 'presentation'
      AND swc.content_id   = p_presentation_id
  ) THEN
    RAISE EXCEPTION 'not_shared' USING ERRCODE = 'P0006';
  END IF;

  -- Return the row (bypasses RLS because SECURITY DEFINER)
  RETURN QUERY
  SELECT * FROM public.presentations
  WHERE id = p_presentation_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_presentation_for_workspace(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_shared_presentation_for_workspace(UUID, UUID) IS
    'Part 41.5 — Returns full presentation row for workspace members (bypasses owner RLS).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §13 RPC: get_shared_academic_paper_for_workspace               (Part 41.5)
--     Returns full academic paper row for workspace members.
--     Bypasses owner RLS so non-owner workspace members can load the row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_shared_academic_paper_for_workspace(
  p_workspace_id UUID,
  p_paper_id     UUID
)
RETURNS SETOF public.academic_papers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Verify caller is a workspace member
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0005';
  END IF;

  -- Verify the paper is actually shared to this workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.shared_workspace_content swc
    WHERE swc.workspace_id = p_workspace_id
      AND swc.content_type = 'academic_paper'
      AND swc.content_id   = p_paper_id
  ) THEN
    RAISE EXCEPTION 'not_shared' USING ERRCODE = 'P0006';
  END IF;

  -- Return the row (bypasses RLS because SECURITY DEFINER)
  RETURN QUERY
  SELECT * FROM public.academic_papers
  WHERE id = p_paper_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_academic_paper_for_workspace(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_shared_academic_paper_for_workspace(UUID, UUID) IS
    'Part 41.5 — Returns full academic paper row for workspace members (bypasses owner RLS).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §14 Fix shared_workspace_content content_type check            (Part 41.5)
--     Ensures content_type allows 'presentation' and 'academic_paper'
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Drop old constraint if it doesn't include academic_paper
  ALTER TABLE public.shared_workspace_content
    DROP CONSTRAINT IF EXISTS shared_workspace_content_content_type_check;

  -- Re-add with all four supported types
  ALTER TABLE public.shared_workspace_content
    ADD CONSTRAINT shared_workspace_content_content_type_check
    CHECK (content_type IN ('presentation', 'academic_paper', 'podcast', 'debate'));

EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists with same name — ignore
  NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §15 REALTIME — add voice_debates to supabase_realtime publication
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_debates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §16 RELOAD POSTGREST SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PART 41 COMPLETE SCHEMA (41.1 + 41.2 + 41.3 + 41.5)
-- ═══════════════════════════════════════════════════════════════════════════