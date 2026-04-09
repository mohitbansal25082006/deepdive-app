-- ============================================================
-- PART 41 — COMPLETE SCHEMA FIXES (UPSIGHT + DOWNSIDE)
-- ============================================================
-- Combines Part 41.1 (Podcast Video Player + Mini Player Fixes) and
-- Part 41.2 (Voice Debate Cloud Audio & Cross-Device Support).
--
-- FIXES INCLUDED:
--   1. Storage RLS for podcast-audio bucket (podcast sharing fix)
--   2. RPC get_shared_podcast_full_for_workspace (bypasses owner RLS)
--   3. podcast-audio bucket existence + voice debate storage policies
--   4. RPCs: get_voice_debate_full, update_voice_debate_cloud_urls, get_user_voice_debates
-- ============================================================

-- ============================================================
-- PART 1: ENSURE podcast-audio STORAGE BUCKET EXISTS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-audio',
  'podcast-audio',
  true,
  52428800,  -- 50 MB per file
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PART 2: STORAGE POLICIES — podcast-audio bucket
-- ============================================================

-- Drop the old broken policies (if any)
DROP POLICY IF EXISTS "podcast_audio_select_workspace_member"  ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_insert_owner"             ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_update_owner"             ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_delete_owner"             ON storage.objects;

-- ── SELECT ─────────────────────────────────────────────────────────────────
-- Allow any authenticated workspace member to stream audio if:
--   a) They own the podcast (uploader), OR
--   b) The podcast has been shared to a workspace they belong to
--
-- File path structure: podcasts/{podcastId}/segment_N.mp3
-- podcastId is the 2nd path segment (index 2 in split_part 1-based).
CREATE POLICY "podcast_audio_select_v2"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
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

-- ── INSERT ─────────────────────────────────────────────────────────────────
-- Only the podcast owner can upload audio segments.
-- Path: podcasts/{podcastId}/segment_N.mp3
-- We verify auth.uid() owns the podcast with that ID.
CREATE POLICY "podcast_audio_insert_v2"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'podcast-audio'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
CREATE POLICY "podcast_audio_update_v2"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );

-- ── DELETE ─────────────────────────────────────────────────────────────────
CREATE POLICY "podcast_audio_delete_v2"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'podcast-audio'
        AND EXISTS (
            SELECT 1 FROM public.podcasts p
            WHERE p.id::text = split_part(storage.objects.name, '/', 2)
              AND p.user_id  = auth.uid()
        )
    );

-- ============================================================
-- PART 3: STORAGE POLICIES FOR VOICE DEBATE AUDIO
--    Path pattern: voice_debates/{voiceDebateId}/turn_{N}.mp3
-- ============================================================

-- Read: anyone can read (bucket is public, URLs are direct)
DROP POLICY IF EXISTS "Voice debate audio public read" ON storage.objects;
CREATE POLICY "Voice debate audio public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );

-- Upload: only the authenticated user who owns the debate
DROP POLICY IF EXISTS "Voice debate audio owner upload" ON storage.objects;
CREATE POLICY "Voice debate audio owner upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
    AND (storage.foldername(name))[1] = 'voice_debates'
  );

-- Update / upsert
DROP POLICY IF EXISTS "Voice debate audio owner update" ON storage.objects;
CREATE POLICY "Voice debate audio owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );

-- Delete (for cleanup when debate is deleted)
DROP POLICY IF EXISTS "Voice debate audio owner delete" ON storage.objects;
CREATE POLICY "Voice debate audio owner delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );

-- ============================================================
-- PART 4: RPC — get_shared_podcast_full_for_workspace
--    Used by workspace-shared-podcast-player when opening Video Mode.
-- ============================================================

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
    -- Must be a workspace member
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
    'Returns full podcast row for workspace members opening Video Mode (bypasses owner RLS). Part 41 fix.';

-- ============================================================
-- PART 5: RPC — get_voice_debate_full
--    Returns a complete voice debate row by ID.
-- ============================================================

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
  WHERE id = p_voice_debate_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_voice_debate_full(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_voice_debate_full IS
    'Part 41.2 — Loads a voice debate by ID for cross-device playback.';

-- ============================================================
-- PART 6: RPC — update_voice_debate_cloud_urls
--    Called by background upload service after audio is uploaded.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_voice_debate_cloud_urls(
  p_voice_debate_id   UUID,
  p_audio_urls        TEXT[],
  p_all_uploaded      BOOLEAN
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
    audio_storage_urls  = p_audio_urls,
    audio_all_uploaded  = p_all_uploaded,
    audio_uploaded_at   = now()
  WHERE id      = p_voice_debate_id
    AND user_id = auth.uid();

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_voice_debate_cloud_urls(UUID, TEXT[], BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.update_voice_debate_cloud_urls IS
    'Part 41.2 — Updates audio_storage_urls after background cloud upload completes.';

-- ============================================================
-- PART 7: RPC — get_user_voice_debates
--    Returns all completed voice debates for the current user.
-- ============================================================

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
    AND status = 'completed'
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_voice_debates(INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- PART 8: REALTIME PUBLICATION (voice_debates)
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_debates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- FINAL: RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE
-- ============================================================