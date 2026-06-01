-- ============================================================
-- DeepDive AI — Part 44 FINAL SCHEMA (All patches merged)
--
-- This is the single definitive file to run for Part 44.
-- It supersedes schema_part44.sql, schema_patch_part44.sql,
-- and schema_patch_part44_2.sql. Run this file only — do NOT
-- run the earlier patch files separately.
--
-- FEATURES:
--   Voice debate cloud upload tracking + workspace sharing
--   with cross-device audio streaming.
--
-- SECTIONS:
--   §1  voice_debates — add cloud upload columns (idempotent)
--   §2  shared_voice_debates — create table with ALL columns
--   §3  shared_voice_debates — indexes
--   §4  shared_voice_debates — RLS policies
--   §5  Storage policies (podcast-audio bucket, voice_debates/*)
--   §6  Helper: _jsonb_to_text_array(JSONB) → TEXT[]
--   §7  RPC: share_voice_debate_to_workspace
--   §8  RPC: remove_shared_voice_debate
--   §9  RPC: get_workspace_shared_voice_debates
--   §10 RPC: get_workspace_voice_debate_by_id
--   §11 RPC: get_workspaces_voice_debate_is_shared_to
--   §12 RPC: increment_shared_voice_debate_views
--   §13 RPC: increment_shared_voice_debate_downloads
--   §14 RPC: update_shared_debate_voice_audio
--   §15 RPC: get_voice_debate_by_session (ensure exists)
--   §16 Realtime publication
--   §17 Verification notice
--   §18 Reload PostgREST
--
-- KEY FIXES APPLIED FROM PATCHES:
--   Patch 1 — All shared_voice_debates columns added via idempotent
--             DO blocks so re-running never errors.
--   Patch 2 — share_voice_debate_to_workspace uses _jsonb_to_text_array()
--             to cast voice_debates.audio_storage_urls (JSONB) to TEXT[]
--             avoiding "COALESCE types jsonb and text[] cannot be matched"
--             (error 42804).
--   All RPCs now use COALESCE guards on every nullable column.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Add cloud upload tracking columns to voice_debates
--     voice_debates.audio_storage_urls is JSONB (set in Part 41.2).
--     We add audio_all_uploaded and audio_uploaded_at here.
--     All idempotent — safe to run against existing table.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- audio_storage_urls: JSONB array of cloud URLs (Part 41.2 adds this;
  -- we add it here too so Part 44 is self-contained)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'voice_debates'
      AND column_name  = 'audio_storage_urls'
  ) THEN
    ALTER TABLE public.voice_debates
      ADD COLUMN audio_storage_urls JSONB DEFAULT NULL;
    RAISE NOTICE 'Added voice_debates.audio_storage_urls';
  END IF;

  -- audio_all_uploaded: TRUE once every segment is in Supabase Storage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'voice_debates'
      AND column_name  = 'audio_all_uploaded'
  ) THEN
    ALTER TABLE public.voice_debates
      ADD COLUMN audio_all_uploaded BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'Added voice_debates.audio_all_uploaded';
  END IF;

  -- audio_uploaded_at: timestamp of last successful upload
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'voice_debates'
      AND column_name  = 'audio_uploaded_at'
  ) THEN
    ALTER TABLE public.voice_debates
      ADD COLUMN audio_uploaded_at TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE 'Added voice_debates.audio_uploaded_at';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Create shared_voice_debates table (if not exists)
--
--     audio_storage_urls is TEXT[] here (not JSONB) — matches the type
--     workspace members receive and stream from. Conversion from the
--     JSONB voice_debates column happens in the share RPC (§7) via the
--     _jsonb_to_text_array() helper (§6).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shared_voice_debates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  voice_debate_id      UUID        NOT NULL,
  debate_session_id    UUID        NOT NULL,
  shared_by            UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,

  -- Denormalised metadata (snapshot at share time)
  topic                TEXT        NOT NULL DEFAULT '',
  question             TEXT        NOT NULL DEFAULT '',
  script               JSONB       NOT NULL DEFAULT '{}',
  total_turns          INTEGER     NOT NULL DEFAULT 0,
  duration_seconds     INTEGER     NOT NULL DEFAULT 0,
  word_count           INTEGER     NOT NULL DEFAULT 0,

  -- Cloud audio — TEXT[] so workspace members can stream from any device
  audio_storage_urls   TEXT[]      NOT NULL DEFAULT '{}',
  audio_all_uploaded   BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Engagement tracking
  view_count           INTEGER     NOT NULL DEFAULT 0,
  download_count       INTEGER     NOT NULL DEFAULT 0,

  -- Timestamps
  debate_created_at    TIMESTAMPTZ,
  debate_completed_at  TIMESTAMPTZ,
  shared_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shared_voice_debates_workspace_vd_unique
    UNIQUE (workspace_id, voice_debate_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2b Add any columns that may be missing if table already existed
--     (handles the case where the original CREATE TABLE ran without all columns)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='audio_storage_urls') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN audio_storage_urls TEXT[] NOT NULL DEFAULT '{}';
    RAISE NOTICE 'Added shared_voice_debates.audio_storage_urls';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='audio_all_uploaded') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN audio_all_uploaded BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'Added shared_voice_debates.audio_all_uploaded';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='script') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN script JSONB NOT NULL DEFAULT '{}';
    RAISE NOTICE 'Added shared_voice_debates.script';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='total_turns') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN total_turns INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added shared_voice_debates.total_turns';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='duration_seconds') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added shared_voice_debates.duration_seconds';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='word_count') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added shared_voice_debates.word_count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='debate_session_id') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN debate_session_id UUID NOT NULL DEFAULT gen_random_uuid();
    RAISE NOTICE 'Added shared_voice_debates.debate_session_id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='question') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN question TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added shared_voice_debates.question';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='view_count') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added shared_voice_debates.view_count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='download_count') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added shared_voice_debates.download_count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='debate_created_at') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN debate_created_at TIMESTAMPTZ;
    RAISE NOTICE 'Added shared_voice_debates.debate_created_at';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_voice_debates' AND column_name='debate_completed_at') THEN
    ALTER TABLE public.shared_voice_debates ADD COLUMN debate_completed_at TIMESTAMPTZ;
    RAISE NOTICE 'Added shared_voice_debates.debate_completed_at';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_svd_workspace_id
  ON public.shared_voice_debates (workspace_id);

CREATE INDEX IF NOT EXISTS idx_svd_shared_by
  ON public.shared_voice_debates (shared_by);

CREATE INDEX IF NOT EXISTS idx_svd_voice_debate_id
  ON public.shared_voice_debates (voice_debate_id);

CREATE INDEX IF NOT EXISTS idx_svd_debate_session_id
  ON public.shared_voice_debates (debate_session_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  RLS policies for shared_voice_debates
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shared_voice_debates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "svd_select_member"  ON public.shared_voice_debates;
DROP POLICY IF EXISTS "svd_insert_editor"  ON public.shared_voice_debates;
DROP POLICY IF EXISTS "svd_update_counter" ON public.shared_voice_debates;
DROP POLICY IF EXISTS "svd_delete_auth"    ON public.shared_voice_debates;

-- SELECT: any workspace member can read shared voice debates in their workspace
CREATE POLICY "svd_select_member"
  ON public.shared_voice_debates FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: only editors/owners can share (also validated in RPC)
CREATE POLICY "svd_insert_editor"
  ON public.shared_voice_debates FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND public.get_workspace_role(workspace_id, auth.uid()) IN ('owner', 'editor')
  );

-- UPDATE: any member can update (needed for view/download count increments)
CREATE POLICY "svd_update_counter"
  ON public.shared_voice_debates FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- DELETE: owner of the share or workspace owner can remove
CREATE POLICY "svd_delete_auth"
  ON public.shared_voice_debates FOR DELETE
  TO authenticated
  USING (
    shared_by = auth.uid()
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  Storage policies — podcast-audio bucket, voice_debates/* paths
--     The bucket is already public (set in Part 41 schema).
--     These policies are idempotent (DROP IF EXISTS before CREATE).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Voice debate audio public read"  ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner update" ON storage.objects;
DROP POLICY IF EXISTS "Voice debate audio owner delete" ON storage.objects;

-- Public read — any client can stream audio via the public bucket URL
CREATE POLICY "Voice debate audio public read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );

-- Owner upload — authenticated user can upload their own voice debate audio
CREATE POLICY "Voice debate audio owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
    AND auth.uid() IS NOT NULL
  );

-- Owner update — re-upload / replace existing segment
CREATE POLICY "Voice debate audio owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
    AND auth.uid() IS NOT NULL
  );

-- Owner delete — cleanup when debate is deleted
CREATE POLICY "Voice debate audio owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
    AND auth.uid() IS NOT NULL
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  Helper: _jsonb_to_text_array(JSONB) → TEXT[]
--
--     WHY THIS EXISTS:
--       voice_debates.audio_storage_urls is JSONB (["url1","url2",...]).
--       shared_voice_debates.audio_storage_urls is TEXT[].
--       COALESCE cannot unify JSONB and TEXT[] — PostgreSQL raises 42804.
--       This function converts safely, returning ARRAY[]::TEXT[] for NULL
--       or non-array JSONB values.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._jsonb_to_text_array(p_val JSONB)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_val IS NULL OR jsonb_typeof(p_val) <> 'array' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  RETURN ARRAY(SELECT jsonb_array_elements_text(p_val));
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §7  RPC: share_voice_debate_to_workspace
--
--     Validates the caller is editor/owner of the workspace, the voice
--     debate belongs to them, it is completed, and audio is uploaded.
--     Inserts (or upserts on conflict) into shared_voice_debates.
--     Uses _jsonb_to_text_array() to convert audio_storage_urls JSONB→TEXT[].
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.share_voice_debate_to_workspace(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.share_voice_debate_to_workspace(
  p_workspace_id    UUID,
  p_voice_debate_id UUID
)
RETURNS SETOF public.shared_voice_debates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_role       TEXT;
  v_vd         RECORD;
  v_audio_urls TEXT[];
  v_shared_row public.shared_voice_debates;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_role := public.get_workspace_role(p_workspace_id, v_user_id);
  IF v_role NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'permission_denied: only owners and editors can share voice debates';
  END IF;

  -- Load the voice debate — must belong to the caller
  SELECT * INTO v_vd
  FROM public.voice_debates
  WHERE id      = p_voice_debate_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'voice_debate_not_found: voice debate does not exist or you do not own it';
  END IF;

  IF v_vd.status <> 'completed' THEN
    RAISE EXCEPTION 'voice_debate_not_complete: only completed voice debates can be shared';
  END IF;

  IF NOT COALESCE(v_vd.audio_all_uploaded, FALSE) THEN
    RAISE EXCEPTION 'audio_not_uploaded: upload audio to cloud before sharing to workspace';
  END IF;

  -- Convert JSONB → TEXT[] (avoids COALESCE type mismatch error 42804)
  v_audio_urls := public._jsonb_to_text_array(v_vd.audio_storage_urls);

  INSERT INTO public.shared_voice_debates (
    workspace_id,
    voice_debate_id,
    debate_session_id,
    shared_by,
    topic,
    question,
    script,
    total_turns,
    duration_seconds,
    word_count,
    audio_storage_urls,
    audio_all_uploaded,
    debate_created_at,
    debate_completed_at,
    shared_at
  ) VALUES (
    p_workspace_id,
    p_voice_debate_id,
    v_vd.debate_session_id,
    v_user_id,
    v_vd.topic,
    COALESCE(v_vd.question,         ''),
    COALESCE(v_vd.script,           '{}'::jsonb),
    COALESCE(v_vd.total_turns,      0),
    COALESCE(v_vd.duration_seconds, 0),
    COALESCE(v_vd.word_count,       0),
    v_audio_urls,                          -- TEXT[], no COALESCE type clash
    COALESCE(v_vd.audio_all_uploaded, FALSE),
    v_vd.created_at,
    v_vd.completed_at,
    NOW()
  )
  ON CONFLICT (workspace_id, voice_debate_id) DO UPDATE SET
    script               = EXCLUDED.script,
    audio_storage_urls   = EXCLUDED.audio_storage_urls,
    audio_all_uploaded   = EXCLUDED.audio_all_uploaded,
    total_turns          = EXCLUDED.total_turns,
    duration_seconds     = EXCLUDED.duration_seconds,
    word_count           = EXCLUDED.word_count,
    shared_at            = NOW()
  RETURNING * INTO v_shared_row;

  -- Workspace activity log (non-fatal)
  BEGIN
    INSERT INTO public.workspace_activity
      (workspace_id, user_id, action, resource_type, resource_id, metadata)
    VALUES (
      p_workspace_id,
      v_user_id,
      'voice_debate_shared',
      'voice_debate',
      p_voice_debate_id::TEXT,
      jsonb_build_object(
        'topic',           v_vd.topic,
        'voice_debate_id', p_voice_debate_id,
        'turn_count',      COALESCE(v_vd.total_turns, 0)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'share_voice_debate_to_workspace: activity log skipped — %', SQLERRM;
  END;

  RETURN NEXT v_shared_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_voice_debate_to_workspace(UUID, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.share_voice_debate_to_workspace(UUID, UUID) IS
  'Part 44 — Share a completed, cloud-uploaded voice debate to a workspace. '
  'Uses _jsonb_to_text_array() to convert JSONB audio URLs to TEXT[].';


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  RPC: remove_shared_voice_debate
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.remove_shared_voice_debate(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.remove_shared_voice_debate(
  p_workspace_id    UUID,
  p_voice_debate_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role    TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_role := public.get_workspace_role(p_workspace_id, v_user_id);

  DELETE FROM public.shared_voice_debates
  WHERE workspace_id    = p_workspace_id
    AND voice_debate_id = p_voice_debate_id
    AND (
      shared_by = v_user_id
      OR v_role  = 'owner'
    );

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_shared_voice_debate(UUID, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.remove_shared_voice_debate(UUID, UUID) IS
  'Part 44 — Remove a shared voice debate from a workspace (sharer or workspace owner only).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §9  RPC: get_workspace_shared_voice_debates
--     Returns all shared voice debates for a workspace with sharer profile.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_workspace_shared_voice_debates(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_shared_voice_debates(
  p_workspace_id UUID
)
RETURNS TABLE (
  out_id                  UUID,
  out_workspace_id        UUID,
  out_voice_debate_id     UUID,
  out_debate_session_id   UUID,
  out_shared_by           UUID,
  out_topic               TEXT,
  out_question            TEXT,
  out_script              JSONB,
  out_total_turns         INTEGER,
  out_duration_seconds    INTEGER,
  out_word_count          INTEGER,
  out_audio_storage_urls  TEXT[],
  out_audio_all_uploaded  BOOLEAN,
  out_view_count          INTEGER,
  out_download_count      INTEGER,
  out_debate_created_at   TIMESTAMPTZ,
  out_debate_completed_at TIMESTAMPTZ,
  out_shared_at           TIMESTAMPTZ,
  out_sharer_name         TEXT,
  out_sharer_avatar       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  RETURN QUERY
  SELECT
    svd.id,
    svd.workspace_id,
    svd.voice_debate_id,
    svd.debate_session_id,
    svd.shared_by,
    svd.topic,
    COALESCE(svd.question, ''),
    COALESCE(svd.script, '{}'::jsonb),
    COALESCE(svd.total_turns, 0),
    COALESCE(svd.duration_seconds, 0),
    COALESCE(svd.word_count, 0),
    COALESCE(svd.audio_storage_urls, ARRAY[]::TEXT[]),
    COALESCE(svd.audio_all_uploaded, FALSE),
    COALESCE(svd.view_count, 0),
    COALESCE(svd.download_count, 0),
    svd.debate_created_at,
    svd.debate_completed_at,
    svd.shared_at,
    COALESCE(p.full_name, p.username, 'Unknown')::TEXT,
    p.avatar_url::TEXT
  FROM public.shared_voice_debates svd
  LEFT JOIN public.profiles p ON p.id = svd.shared_by
  WHERE svd.workspace_id = p_workspace_id
  ORDER BY svd.shared_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_shared_voice_debates(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_workspace_shared_voice_debates(UUID) IS
  'Part 44 — List all shared voice debates in a workspace, ordered newest first.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §10 RPC: get_workspace_voice_debate_by_id
--     Load a single shared voice debate row by shared_id.
--     Used by workspace-shared-voice-debate-player.tsx on mount.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_workspace_voice_debate_by_id(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_voice_debate_by_id(
  p_workspace_id UUID,
  p_shared_id    UUID
)
RETURNS TABLE (
  out_id                  UUID,
  out_workspace_id        UUID,
  out_voice_debate_id     UUID,
  out_debate_session_id   UUID,
  out_shared_by           UUID,
  out_topic               TEXT,
  out_question            TEXT,
  out_script              JSONB,
  out_total_turns         INTEGER,
  out_duration_seconds    INTEGER,
  out_word_count          INTEGER,
  out_audio_storage_urls  TEXT[],
  out_audio_all_uploaded  BOOLEAN,
  out_view_count          INTEGER,
  out_download_count      INTEGER,
  out_debate_created_at   TIMESTAMPTZ,
  out_debate_completed_at TIMESTAMPTZ,
  out_shared_at           TIMESTAMPTZ,
  out_sharer_name         TEXT,
  out_sharer_avatar       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  RETURN QUERY
  SELECT
    svd.id,
    svd.workspace_id,
    svd.voice_debate_id,
    svd.debate_session_id,
    svd.shared_by,
    svd.topic,
    COALESCE(svd.question, ''),
    COALESCE(svd.script, '{}'::jsonb),
    COALESCE(svd.total_turns, 0),
    COALESCE(svd.duration_seconds, 0),
    COALESCE(svd.word_count, 0),
    COALESCE(svd.audio_storage_urls, ARRAY[]::TEXT[]),
    COALESCE(svd.audio_all_uploaded, FALSE),
    COALESCE(svd.view_count, 0),
    COALESCE(svd.download_count, 0),
    svd.debate_created_at,
    svd.debate_completed_at,
    svd.shared_at,
    COALESCE(p.full_name, p.username, 'Unknown')::TEXT,
    p.avatar_url::TEXT
  FROM public.shared_voice_debates svd
  LEFT JOIN public.profiles p ON p.id = svd.shared_by
  WHERE svd.workspace_id = p_workspace_id
    AND svd.id           = p_shared_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_voice_debate_by_id(UUID, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_workspace_voice_debate_by_id(UUID, UUID) IS
  'Part 44 — Load a single shared voice debate by shared_id for the workspace player.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §11 RPC: get_workspaces_voice_debate_is_shared_to
--     Returns workspace IDs where the caller has already shared this debate.
--     Used by useVoiceDebateSharedWorkspaces hook for the share button badge.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_workspaces_voice_debate_is_shared_to(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspaces_voice_debate_is_shared_to(
  p_voice_debate_id UUID
)
RETURNS TABLE (out_workspace_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT svd.workspace_id
  FROM public.shared_voice_debates svd
  JOIN public.workspace_members wm
    ON  wm.workspace_id = svd.workspace_id
    AND wm.user_id      = auth.uid()
  WHERE svd.voice_debate_id = p_voice_debate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspaces_voice_debate_is_shared_to(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_workspaces_voice_debate_is_shared_to(UUID) IS
  'Part 44 — Returns workspace IDs where the given voice debate is already shared.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §12 RPC: increment_shared_voice_debate_views
--     Called on player mount (fire-and-forget). No auth guard needed — any
--     workspace member can increment the view count.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.increment_shared_voice_debate_views(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.increment_shared_voice_debate_views(
  p_shared_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_voice_debates
  SET    view_count = view_count + 1
  WHERE  id = p_shared_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_shared_voice_debate_views(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.increment_shared_voice_debate_views(UUID) IS
  'Part 44 — Increment play/view counter for a shared voice debate.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §13 RPC: increment_shared_voice_debate_downloads
--     Called when a workspace member exports the debate (PDF/MP3/copy).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.increment_shared_voice_debate_downloads(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.increment_shared_voice_debate_downloads(
  p_shared_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_voice_debates
  SET    download_count = download_count + 1
  WHERE  id = p_shared_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_shared_voice_debate_downloads(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.increment_shared_voice_debate_downloads(UUID) IS
  'Part 44 — Increment download/export counter for a shared voice debate.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §14 RPC: update_shared_debate_voice_audio
--
--     Called by useVoiceDebate.ts after cloud upload completes.
--     Updates all shared_voice_debates rows that reference the same
--     debate_session_id with the fresh cloud URLs and upload flag.
--     This handles the case where the base debate was shared BEFORE
--     the voice debate was generated or audio was uploaded.
--
--     p_audio_urls arrives as TEXT[] from the app — no cast needed.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.update_shared_debate_voice_audio(UUID, UUID, TEXT[], BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION public.update_shared_debate_voice_audio(
  p_voice_debate_id UUID,
  p_session_id      UUID,
  p_audio_urls      TEXT[],
  p_all_uploaded    BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  -- Only the owner of the voice debate can update shared copies
  IF NOT EXISTS (
    SELECT 1 FROM public.voice_debates
    WHERE id      = p_voice_debate_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission_denied: not the voice debate owner';
  END IF;

  UPDATE public.shared_voice_debates
  SET
    audio_storage_urls = p_audio_urls,   -- TEXT[] = TEXT[] ✓ no type clash
    audio_all_uploaded = p_all_uploaded,
    voice_debate_id    = p_voice_debate_id
  WHERE debate_session_id = p_session_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_debate_voice_audio(UUID, UUID, TEXT[], BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION public.update_shared_debate_voice_audio(UUID, UUID, TEXT[], BOOLEAN) IS
  'Part 44 — Sync audio URLs to all workspace shares after upload completes post-sharing.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §15 RPC: get_voice_debate_by_session
--     Ensure this Part 40 RPC exists — safe CREATE OR REPLACE.
--     Used by useVoiceDebate.ts to load existing debate on mount.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_voice_debate_by_session(
  p_session_id UUID
)
RETURNS SETOF public.voice_debates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM   public.voice_debates
  WHERE  debate_session_id = p_session_id
    AND  user_id           = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_voice_debate_by_session(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_voice_debate_by_session(UUID) IS
  'Part 40/44 — Load a voice debate row for a given debate_session_id (current user only).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §16 Realtime publication
--     Workspace members receive live updates when audio_all_uploaded flips
--     to TRUE on a shared debate they are viewing.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_voice_debates;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already in publication, skip
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §17 Verification — print final column list for shared_voice_debates
--     Check the NOTICES tab in Supabase SQL Editor to confirm all columns.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_vd_type  TEXT;
  v_svd_cols TEXT;
BEGIN
  -- Check voice_debates.audio_storage_urls type (should be jsonb or text[])
  SELECT data_type INTO v_vd_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'voice_debates'
    AND  column_name  = 'audio_storage_urls';

  RAISE NOTICE 'voice_debates.audio_storage_urls type = %',
    COALESCE(v_vd_type, 'COLUMN NOT FOUND');

  -- List all shared_voice_debates columns
  SELECT string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position)
  INTO   v_svd_cols
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'shared_voice_debates';

  RAISE NOTICE 'shared_voice_debates columns: %', v_svd_cols;

  -- Confirm helper function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_jsonb_to_text_array'
  ) THEN
    RAISE NOTICE '_jsonb_to_text_array() helper: OK';
  ELSE
    RAISE WARNING '_jsonb_to_text_array() helper: NOT FOUND — §6 may have failed';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §18 Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END OF PART 44 FINAL SCHEMA
--
-- Run this single file in Supabase SQL Editor.
-- Do NOT run schema_part44.sql, schema_patch_part44.sql, or
-- schema_patch_part44_2.sql — this file replaces all of them.
-- ============================================================