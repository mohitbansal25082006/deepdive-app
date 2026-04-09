-- ============================================================
-- Part 41 Fix — Workspace Podcast Video + Mini Player Fixes
-- ============================================================
-- Fixes two bugs introduced in Parts 15/39/40:
--
-- FIX 1: Storage RLS for podcast-audio bucket
--   The existing SELECT policy used split_part(name,'/',1) to
--   extract workspace_id from the file path, but files are stored
--   as  podcasts/{podcastId}/segment_N.mp3  — no workspace_id in
--   the path. Workspace members on other devices therefore got a
--   403 when trying to stream audio.
--
--   Solution: Replace the broken workspace-path policy with one
--   that checks whether the authenticated user is a member of ANY
--   workspace that has this podcast shared to it. The lookup uses
--   the podcastId extracted from the path (segment 2).
--
-- FIX 2: RPC for workspace members to load podcast for video mode
--   podcast-video-player.tsx loads the podcast directly from the
--   podcasts table with a simple .select('*').eq('id', podcastId).
--   Workspace members don't own the podcast so RLS blocks the
--   query → "Episode not found" error on their device.
--
--   Solution: New SECURITY DEFINER RPC
--   get_shared_podcast_full_for_workspace(p_workspace_id, p_podcast_id)
--   that verifies workspace membership + that the podcast is shared
--   to that workspace, then returns the full podcast row.
-- ============================================================

-- ============================================================
-- FIX 1: STORAGE POLICIES — podcast-audio bucket
-- ============================================================

-- Drop the old broken policies
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
-- FIX 2: RPC — load full podcast row for workspace video mode
-- ============================================================

-- Used by workspace-shared-podcast-player when opening Video Mode.
-- Returns the full podcasts row so podcast-video-player can load it
-- even though the requesting user doesn't own the podcast.

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
-- Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';