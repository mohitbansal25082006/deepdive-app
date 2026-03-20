-- =============================================================================
-- schema_part25.sql
-- DeepDive AI — Part 25 Schema Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- =============================================================================

-- ─── 1. Add audio_storage_urls to podcasts ────────────────────────────────────
-- Stores Supabase Storage signed URLs for each audio segment so other devices
-- can stream podcast audio without needing local files.

ALTER TABLE podcasts
  ADD COLUMN IF NOT EXISTS audio_storage_urls   JSONB    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_uploaded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audio_all_uploaded   BOOLEAN  DEFAULT FALSE;

-- Index for quickly checking which podcasts have been uploaded
CREATE INDEX IF NOT EXISTS idx_podcasts_audio_uploaded
  ON podcasts (audio_all_uploaded)
  WHERE audio_all_uploaded = TRUE;

-- ─── 2. Add source trust data to research_reports ────────────────────────────
-- Stores the per-citation trust scores and aggregate source quality metrics.

ALTER TABLE research_reports
  ADD COLUMN IF NOT EXISTS source_trust_scores  JSONB,   -- array of trust score objects
  ADD COLUMN IF NOT EXISTS avg_source_quality   NUMERIC(4,2),  -- 0.00–10.00
  ADD COLUMN IF NOT EXISTS high_quality_source_pct  INTEGER; -- 0–100 percent

-- ─── 3. RPC: get_podcast_with_audio ──────────────────────────────────────────
-- Returns podcast with both local paths and cloud URLs merged.
-- Used by usePodcastPlayer to resolve the best available audio source.

CREATE OR REPLACE FUNCTION get_podcast_with_audio(p_podcast_id UUID)
RETURNS TABLE (
  id                    UUID,
  user_id               UUID,
  title                 TEXT,
  topic                 TEXT,
  script                JSONB,
  audio_segment_paths   JSONB,
  audio_storage_urls    JSONB,
  audio_all_uploaded    BOOLEAN,
  duration_seconds      INTEGER,
  status                TEXT,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.title,
    p.topic,
    p.script,
    COALESCE(p.audio_segment_paths, '[]'::jsonb),
    COALESCE(p.audio_storage_urls,  '[]'::jsonb),
    COALESCE(p.audio_all_uploaded,  FALSE),
    COALESCE(p.duration_seconds,    0),
    p.status,
    p.created_at
  FROM podcasts p
  WHERE p.id = p_podcast_id;
END;
$$;

-- ─── 4. RPC: save_podcast_cloud_urls ─────────────────────────────────────────
-- Called by podcastOrchestrator after auto-uploading audio segments.

CREATE OR REPLACE FUNCTION save_podcast_cloud_urls(
  p_podcast_id     UUID,
  p_cloud_urls     JSONB,    -- array of strings or nulls
  p_all_uploaded   BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE podcasts
  SET
    audio_storage_urls  = p_cloud_urls,
    audio_all_uploaded  = p_all_uploaded,
    audio_uploaded_at   = NOW()
  WHERE id = p_podcast_id
    AND user_id = auth.uid();
END;
$$;

-- ─── 5. RPC: save_report_trust_scores ────────────────────────────────────────
-- Persists source trust scores after a research pipeline completes.

CREATE OR REPLACE FUNCTION save_report_trust_scores(
  p_report_id          UUID,
  p_trust_scores       JSONB,   -- array of { citation_id, trust_score } objects
  p_avg_quality        NUMERIC,
  p_hq_percent         INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE research_reports
  SET
    source_trust_scores     = p_trust_scores,
    avg_source_quality      = p_avg_quality,
    high_quality_source_pct = p_hq_percent
  WHERE id = p_report_id
    AND user_id = auth.uid();
END;
$$;

-- ─── 6. Grant permissions ─────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION get_podcast_with_audio(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION save_podcast_cloud_urls(UUID, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_report_trust_scores(UUID, JSONB, NUMERIC, INTEGER) TO authenticated;

-- ─── 7. RLS: podcasts table — ensure audio columns are accessible ─────────────
-- (Existing RLS policies already cover the podcasts table.
--  The new columns inherit those policies automatically.
--  No new policies needed for the added columns.)

-- ─── 8. Update shared_podcasts to carry cloud URLs ───────────────────────────
-- Workspace shared podcasts should also carry cloud URLs so members
-- on other devices can play the audio.

ALTER TABLE shared_podcasts
  ADD COLUMN IF NOT EXISTS audio_storage_urls JSONB DEFAULT '[]'::jsonb;

-- ─── Verify migration ─────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Check podcasts columns added
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'podcasts'
      AND column_name IN ('audio_storage_urls', 'audio_uploaded_at', 'audio_all_uploaded')
  ) = 3, 'podcasts audio columns missing';

  -- Check research_reports columns added
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'research_reports'
      AND column_name IN ('source_trust_scores', 'avg_source_quality', 'high_quality_source_pct')
  ) = 3, 'research_reports trust columns missing';

  RAISE NOTICE '✅ Part 25 migration completed successfully';
END $$;