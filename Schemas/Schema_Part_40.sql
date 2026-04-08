-- ============================================================
-- PART 40 — VOICE DEBATE ENGINE (COMPLETE)
-- Adds voice_debates table for storing generated voice debate audio
-- and script data linked to existing debate_sessions.
--
-- Includes cancel/regenerate support:
--   - Index for fast stale cleanup
--   - RPC for atomic deletion of stale (non-completed) rows
--
-- Run this AFTER schema_part9.sql (debate_sessions must exist).
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE guards everywhere).
-- Does NOT modify any existing tables or policies.
-- ============================================================

-- ============================================================
-- VOICE DEBATES TABLE
-- One voice debate can be generated per debate_session.
-- Stores the structured script, audio segment paths, and metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voice_debates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debate_session_id    UUID        NOT NULL REFERENCES public.debate_sessions(id) ON DELETE CASCADE,

  -- Script data (JSONB array of VoiceDebateTurn objects)
  script               JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Debate structure metadata
  topic                TEXT        NOT NULL DEFAULT '',
  question             TEXT        NOT NULL DEFAULT '',

  -- Audio storage
  audio_segment_paths  TEXT[]      NOT NULL DEFAULT '{}',
  audio_storage_urls   TEXT[],
  audio_all_uploaded   BOOLEAN     NOT NULL DEFAULT false,
  audio_uploaded_at    TIMESTAMPTZ,

  -- Generation state
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending',
                           'generating_script',
                           'generating_audio',
                           'completed',
                           'failed'
                         )),
  error_message        TEXT,

  -- Stats
  total_turns          INTEGER     NOT NULL DEFAULT 0,
  completed_segments   INTEGER     NOT NULL DEFAULT 0,
  duration_seconds     INTEGER     NOT NULL DEFAULT 0,
  word_count           INTEGER     NOT NULL DEFAULT 0,
  export_count         INTEGER     NOT NULL DEFAULT 0,
  play_count           INTEGER     NOT NULL DEFAULT 0,

  -- Timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,

  -- Unique: only one voice debate per debate session
  UNIQUE (debate_session_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_voice_debates_user_id
  ON public.voice_debates(user_id);

CREATE INDEX IF NOT EXISTS idx_voice_debates_debate_session_id
  ON public.voice_debates(debate_session_id);

CREATE INDEX IF NOT EXISTS idx_voice_debates_created_at
  ON public.voice_debates(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_debates_status
  ON public.voice_debates(status)
  WHERE status != 'completed';

-- Index for fast cleanup of stale (non-completed) rows by session
-- Used by the pre-generation cleanup query in voiceDebateOrchestrator.ts:
--   DELETE FROM voice_debates
--   WHERE user_id = $1 AND debate_session_id = $2 AND status != 'completed'
CREATE INDEX IF NOT EXISTS idx_voice_debates_stale_cleanup
  ON public.voice_debates (user_id, debate_session_id)
  WHERE status != 'completed';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.voice_debates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own voice debates"   ON public.voice_debates;
DROP POLICY IF EXISTS "Users can insert own voice debates" ON public.voice_debates;
DROP POLICY IF EXISTS "Users can update own voice debates" ON public.voice_debates;
DROP POLICY IF EXISTS "Users can delete own voice debates" ON public.voice_debates;

CREATE POLICY "Users can view own voice debates"
  ON public.voice_debates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice debates"
  ON public.voice_debates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice debates"
  ON public.voice_debates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice debates"
  ON public.voice_debates
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- RPC: get_voice_debate_by_session
-- Returns the voice debate for a given debate_session_id.
-- Used by the debate-detail screen to check if one already exists.
-- ============================================================

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
  FROM public.voice_debates
  WHERE debate_session_id = p_session_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_voice_debate_by_session(UUID) TO authenticated;

-- ============================================================
-- RPC: increment_voice_debate_play_count
-- Increments play_count when a user plays the voice debate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_voice_debate_play_count(
  p_voice_debate_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.voice_debates
  SET play_count = play_count + 1
  WHERE id = p_voice_debate_id
    AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.increment_voice_debate_play_count(UUID) TO authenticated;

-- ============================================================
-- RPC: increment_voice_debate_export_count
-- Increments export_count when a user exports the voice debate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_voice_debate_export_count(
  p_voice_debate_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.voice_debates
  SET export_count = export_count + 1
  WHERE id = p_voice_debate_id
    AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.increment_voice_debate_export_count(UUID) TO authenticated;

-- ============================================================
-- RPC: get_user_voice_debate_stats
-- Returns voice debate stats for the insights dashboard.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_voice_debate_stats(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     BIGINT;
  v_completed BIGINT;
  v_duration  BIGINT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COALESCE(SUM(duration_seconds), 0)
  INTO v_total, v_completed, v_duration
  FROM public.voice_debates
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'total',            COALESCE(v_total,     0),
    'completed',        COALESCE(v_completed, 0),
    'total_duration_s', COALESCE(v_duration,  0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_voice_debate_stats(UUID) TO authenticated;

-- ============================================================
-- RPC: delete_stale_voice_debate
-- Deletes any non-completed voice debate row for the given session.
-- Used as a fallback if the client-side DELETE fails (e.g. network issue).
-- Returns the number of rows deleted (0 or 1).
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_stale_voice_debate(
  p_session_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.voice_debates
  WHERE debate_session_id = p_session_id
    AND user_id = auth.uid()
    AND status != 'completed';   -- NEVER delete a completed row via this RPC

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_stale_voice_debate(UUID) TO authenticated;

-- ============================================================
-- CREDITS: Add voice_debate feature to credits system
-- This is handled in code (credits.ts) — no DB change needed
-- for adding a new feature type. The consume_credits RPC accepts
-- any TEXT string for the feature column.
-- ============================================================

-- ============================================================
-- REALTIME PUBLICATION
-- Allows the generating screen to receive live status updates.
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_debates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE COMMENT
-- Documents the cancel/regenerate flow behavior.
-- ============================================================

COMMENT ON TABLE public.voice_debates IS
  'Voice Debate Engine (Part 40) — audio debates generated from existing debate sessions.
   Cancel/regenerate flow: non-completed rows are deleted before a fresh INSERT so the
   UNIQUE constraint on debate_session_id is never violated by retry attempts.';