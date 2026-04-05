-- =============================================================================
-- schema_part39_complete.sql
-- DeepDive AI — Part 39: Advanced Podcast System (Complete)
-- Includes all fixes for: Mini Player, Series Generation, Lock Screen, Delete UI
-- and the Audio & Progress Fixes (v3).
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- Safe to run multiple times (idempotent)
-- =============================================================================

-- ─── 1. Add V2 columns to podcasts table ─────────────────────────────────────
-- Adds series support, speaker config, audio quality, script version fields.
-- All new columns are nullable / have defaults so existing rows work unchanged.

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS series_id             UUID,
  ADD COLUMN IF NOT EXISTS episode_number        INTEGER,
  ADD COLUMN IF NOT EXISTS speaker_count         INTEGER   DEFAULT 2,
  ADD COLUMN IF NOT EXISTS speakers_config       JSONB     DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_quality         TEXT      DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS preset_style_v2       TEXT      DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS script_version        INTEGER   DEFAULT 1,
  ADD COLUMN IF NOT EXISTS chapters              JSONB     DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS play_progress_seconds INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_turn_idx  INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_play_count      INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS topic                 TEXT;  -- Added from fixes

-- Constraint: audio_quality values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'podcasts_audio_quality_check'
  ) THEN
    ALTER TABLE public.podcasts
      ADD CONSTRAINT podcasts_audio_quality_check
      CHECK (audio_quality IN ('standard', 'high', 'lossless'));
  END IF;
END$$;

-- ─── 2. Podcast Series table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.podcast_series (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                  TEXT        NOT NULL,
  description           TEXT        NOT NULL DEFAULT '',
  accent_color          TEXT        NOT NULL DEFAULT '#6C63FF',
  icon_name             TEXT        NOT NULL DEFAULT 'radio-outline',
  episode_count         INTEGER     NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER    NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.podcast_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own series"  ON public.podcast_series;
DROP POLICY IF EXISTS "Users can insert own series"  ON public.podcast_series;
DROP POLICY IF EXISTS "Users can update own series"  ON public.podcast_series;
DROP POLICY IF EXISTS "Users can delete own series"  ON public.podcast_series;

CREATE POLICY "Users can select own series"  ON public.podcast_series FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own series"  ON public.podcast_series FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own series"  ON public.podcast_series FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own series"  ON public.podcast_series FOR DELETE  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS podcast_series_user_id_idx ON public.podcast_series(user_id);

DROP TRIGGER IF EXISTS on_podcast_series_updated ON public.podcast_series;
CREATE TRIGGER on_podcast_series_updated
  BEFORE UPDATE ON public.podcast_series
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Foreign key from podcasts to series
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'podcasts_series_id_fkey'
  ) THEN
    ALTER TABLE public.podcasts
      ADD CONSTRAINT podcasts_series_id_fkey
      FOREIGN KEY (series_id) REFERENCES public.podcast_series(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS podcasts_series_id_idx ON public.podcasts(series_id);

-- ─── 3. Podcast playback progress table ──────────────────────────────────────
-- Tracks per-user playback position so "Continue Listening" works across devices.

CREATE TABLE IF NOT EXISTS public.podcast_playback_progress (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  podcast_id       UUID        REFERENCES public.podcasts(id) ON DELETE CASCADE NOT NULL,
  last_turn_idx    INTEGER     NOT NULL DEFAULT 0,
  last_position_ms INTEGER     NOT NULL DEFAULT 0,
  total_duration_ms INTEGER    NOT NULL DEFAULT 0,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, podcast_id)
);

ALTER TABLE public.podcast_playback_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own progress"  ON public.podcast_playback_progress;
DROP POLICY IF EXISTS "Users can insert own progress"  ON public.podcast_playback_progress;
DROP POLICY IF EXISTS "Users can update own progress"  ON public.podcast_playback_progress;
DROP POLICY IF EXISTS "Users can delete own progress"  ON public.podcast_playback_progress;

CREATE POLICY "Users can select own progress" ON public.podcast_playback_progress FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.podcast_playback_progress FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.podcast_playback_progress FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own progress" ON public.podcast_playback_progress FOR DELETE  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS podcast_progress_user_id_idx    ON public.podcast_playback_progress(user_id);
CREATE INDEX IF NOT EXISTS podcast_progress_podcast_id_idx ON public.podcast_playback_progress(podcast_id);
CREATE INDEX IF NOT EXISTS podcast_progress_updated_idx    ON public.podcast_playback_progress(updated_at DESC);

-- ─── 4. Fix any existing progress rows where value is stored as 0–1 fraction ─
-- If any rows were saved with 0–1 values (e.g. 0.45 instead of 45.0),
-- multiply them by 100 to normalize to 0–100 range.
-- This detects values < 1 (excluding 0) that are likely fractions.

UPDATE public.podcast_playback_progress
SET progress_percent = progress_percent * 100
WHERE progress_percent > 0 AND progress_percent < 1;

-- ─── 5. RPCs (with all fixes applied) ────────────────────────────────────────

-- upsert_podcast_progress: save playback position with input validation & normalization
DROP FUNCTION IF EXISTS public.upsert_podcast_progress(UUID,UUID,INTEGER,INTEGER,INTEGER,NUMERIC) CASCADE;

CREATE OR REPLACE FUNCTION public.upsert_podcast_progress(
  p_user_id         UUID,
  p_podcast_id      UUID,
  p_turn_idx        INTEGER,
  p_position_ms     INTEGER,
  p_total_duration  INTEGER,
  p_progress_pct    NUMERIC   -- Expected: 0–100 range (e.g. 45.5 = 45.5%)
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  -- Normalize: if caller accidentally sends 0–1 fraction, convert to 0–100
  IF p_progress_pct > 0 AND p_progress_pct <= 1 THEN
    v_pct := p_progress_pct * 100;
  ELSE
    v_pct := LEAST(100, GREATEST(0, p_progress_pct));
  END IF;

  INSERT INTO podcast_playback_progress
    (user_id, podcast_id, last_turn_idx, last_position_ms, total_duration_ms, progress_percent, updated_at)
  VALUES
    (p_user_id, p_podcast_id, p_turn_idx, p_position_ms, p_total_duration, v_pct, NOW())
  ON CONFLICT (user_id, podcast_id) DO UPDATE SET
    last_turn_idx     = EXCLUDED.last_turn_idx,
    last_position_ms  = EXCLUDED.last_position_ms,
    total_duration_ms = EXCLUDED.total_duration_ms,
    progress_percent  = EXCLUDED.progress_percent,
    updated_at        = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_podcast_progress(UUID,UUID,INTEGER,INTEGER,INTEGER,NUMERIC) TO authenticated;

-- get_continue_listening: returns top 5 in-progress podcasts
-- Returns progress in 0–100 range; app divides by 100 to get 0–1 fraction.
DROP FUNCTION IF EXISTS public.get_continue_listening(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_continue_listening(p_user_id UUID)
RETURNS TABLE (
  podcast_id         UUID,
  title              TEXT,
  description        TEXT,
  host_name          TEXT,
  guest_name         TEXT,
  duration_seconds   INTEGER,
  last_turn_idx      INTEGER,
  last_position_ms   INTEGER,
  progress_percent   NUMERIC,   -- 0–100 range
  series_name        TEXT,
  accent_color       TEXT,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    COALESCE(p.description, '')::TEXT,
    COALESCE(p.host_name, 'Alex')::TEXT,
    COALESCE(p.guest_name, 'Sam')::TEXT,
    COALESCE(p.duration_seconds, 0)::INTEGER,
    COALESCE(pp.last_turn_idx, 0)::INTEGER,
    COALESCE(pp.last_position_ms, 0)::INTEGER,
    COALESCE(pp.progress_percent, 0)::NUMERIC,
    COALESCE(ps.name, NULL)::TEXT,
    COALESCE(ps.accent_color, '#6C63FF')::TEXT,
    pp.updated_at
  FROM podcast_playback_progress pp
  JOIN podcasts p ON p.id = pp.podcast_id
  LEFT JOIN podcast_series ps ON ps.id = p.series_id
  WHERE pp.user_id = p_user_id
    AND p.status   = 'completed'
    -- Filter for in-progress episodes (between 2% and 95% complete)
    AND pp.progress_percent BETWEEN 2 AND 95
  ORDER BY pp.updated_at DESC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_continue_listening(UUID) TO authenticated;

-- get_series_with_episodes: load a series with its episodes (includes topic from fixes)
DROP FUNCTION IF EXISTS public.get_series_with_episodes(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_series_with_episodes(
  p_series_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  podcast_id       UUID,
  title            TEXT,
  description      TEXT,
  episode_number   INTEGER,
  duration_seconds INTEGER,
  word_count       INTEGER,
  status           TEXT,
  created_at       TIMESTAMPTZ,
  host_name        TEXT,
  guest_name       TEXT,
  topic            TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    COALESCE(p.description, '')::TEXT,
    COALESCE(p.episode_number, 1)::INTEGER,
    COALESCE(p.duration_seconds, 0)::INTEGER,
    COALESCE(p.word_count, 0)::INTEGER,
    p.status,
    p.created_at,
    COALESCE(p.host_name, 'Alex')::TEXT,
    COALESCE(p.guest_name, 'Sam')::TEXT,
    COALESCE(p.topic, p.title)::TEXT
  FROM podcasts p
  WHERE p.series_id = p_series_id
    AND p.user_id   = p_user_id
  ORDER BY COALESCE(p.episode_number, 1) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_series_with_episodes(UUID, UUID) TO authenticated;

-- get_podcast_stats_v2: enhanced stats including series and streaks
CREATE OR REPLACE FUNCTION public.get_podcast_stats_v2(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'totalEpisodes',
        COUNT(*) FILTER (WHERE status = 'completed'),
    'totalListeningMinutes',
        ROUND(COALESCE(SUM(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC / 60, 1),
    'longestEpisodeMins',
        ROUND(COALESCE(MAX(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC / 60, 1),
    'longestEpisodeTitle',
        COALESCE((
          SELECT title FROM podcasts
          WHERE user_id = p_user_id AND status = 'completed'
          ORDER BY duration_seconds DESC LIMIT 1
        ), ''),
    'seriesCount',
        (SELECT COUNT(*) FROM podcast_series WHERE user_id = p_user_id),
    'mostUsedStyle',
        COALESCE((
          SELECT COALESCE(preset_style_v2, 'casual')
          FROM podcasts
          WHERE user_id = p_user_id AND status = 'completed'
          GROUP BY COALESCE(preset_style_v2, 'casual')
          ORDER BY COUNT(*) DESC LIMIT 1
        ), 'casual')
  ) INTO result
  FROM podcasts
  WHERE user_id = p_user_id;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_podcast_stats_v2(UUID) TO authenticated;

-- ─── 6. Auto-update series episode count (enhanced from fixes) ───────────────
-- Handles series_id changes (episode moved/removed from series)

DROP FUNCTION IF EXISTS public.update_series_episode_count() CASCADE;

CREATE OR REPLACE FUNCTION public.update_series_episode_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- On INSERT or UPDATE: if NEW has a series_id, update that series
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.series_id IS NOT NULL THEN
    UPDATE podcast_series SET
      episode_count          = (
        SELECT COUNT(*) FROM podcasts
        WHERE series_id = NEW.series_id AND status = 'completed'
      ),
      total_duration_seconds = (
        SELECT COALESCE(SUM(duration_seconds), 0) FROM podcasts
        WHERE series_id = NEW.series_id AND status = 'completed'
      ),
      updated_at             = NOW()
    WHERE id = NEW.series_id;
  END IF;

  -- On UPDATE: if OLD had a different series_id (episode moved/removed from series)
  IF TG_OP = 'UPDATE'
     AND OLD.series_id IS NOT NULL
     AND OLD.series_id IS DISTINCT FROM NEW.series_id
  THEN
    UPDATE podcast_series SET
      episode_count          = (
        SELECT COUNT(*) FROM podcasts
        WHERE series_id = OLD.series_id AND status = 'completed'
      ),
      total_duration_seconds = (
        SELECT COALESCE(SUM(duration_seconds), 0) FROM podcasts
        WHERE series_id = OLD.series_id AND status = 'completed'
      ),
      updated_at             = NOW()
    WHERE id = OLD.series_id;
  END IF;

  -- On DELETE: if the deleted row had a series_id
  IF TG_OP = 'DELETE' AND OLD.series_id IS NOT NULL THEN
    UPDATE podcast_series SET
      episode_count          = (
        SELECT COUNT(*) FROM podcasts
        WHERE series_id = OLD.series_id AND status = 'completed'
      ),
      total_duration_seconds = (
        SELECT COALESCE(SUM(duration_seconds), 0) FROM podcasts
        WHERE series_id = OLD.series_id AND status = 'completed'
      ),
      updated_at             = NOW()
    WHERE id = OLD.series_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_podcast_series_count_update ON public.podcasts;
CREATE TRIGGER on_podcast_series_count_update
  AFTER INSERT OR UPDATE OR DELETE ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_series_episode_count();

-- ─── 7. Additional indexes from fixes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS podcasts_series_status_idx
  ON public.podcasts(series_id, status)
  WHERE series_id IS NOT NULL;

-- ─── 8. Verification ──────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Check podcasts V2 columns
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'podcasts'
      AND column_name IN ('series_id', 'episode_number', 'speaker_count', 'audio_quality', 'chapters', 'topic')
  ) >= 6, 'podcasts V2 columns missing';

  -- Check tables exist
  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name IN ('podcast_series', 'podcast_playback_progress')
  ) = 2, 'Part 39 tables missing';

  -- Check podcast_playback_progress has needed columns
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'podcast_playback_progress'
      AND column_name IN ('last_turn_idx', 'last_position_ms', 'total_duration_ms', 'progress_percent')
  ) = 4, 'podcast_playback_progress columns missing';

  -- Verify RPCs exist
  ASSERT (
    SELECT COUNT(*) FROM pg_proc
    WHERE proname = 'upsert_podcast_progress'
  ) >= 1, 'upsert_podcast_progress RPC missing';

  ASSERT (
    SELECT COUNT(*) FROM pg_proc
    WHERE proname = 'get_continue_listening'
  ) >= 1, 'get_continue_listening RPC missing';

  RAISE NOTICE '✅ schema_part39_complete.sql applied successfully';
  RAISE NOTICE '   progress_percent is now stored as 0–100 in DB';
  RAISE NOTICE '   getContinueListening() returns 0–100, app divides by 100 for UI';
END$$;