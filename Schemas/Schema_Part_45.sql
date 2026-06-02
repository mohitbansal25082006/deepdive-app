-- =============================================================================
-- schema_part45.sql  —  DeepDive AI · Part 45 (FINAL)
-- Selective Cache Management & Voice Debate Offline System
-- =============================================================================
--
-- WHAT THIS FILE DOES:
--   Creates two Supabase RPCs used by the Part 45 offline/cache features.
--
-- RPC 1 — get_user_voice_debates_for_cache(p_user_id)
--   Returns all completed voice debates for a user so the app can
--   auto-cache them when the "Cache Voice Debate Audio" toggle is on.
--
-- RPC 2 — get_user_content_for_selective_cache(p_user_id, p_limit)
--   Returns all cacheable content (all 6 types) with a size_hint_kb estimate.
--   Used by the "Cache Specific Items" picker screen.
--
-- HOW SIZE ESTIMATES WORK:
--   size_hint_kb is shown for UNCACHED items only.
--   For ALREADY-CACHED items the app replaces this with the real size
--   read from the on-device cache index (including audio bytes from disk).
--   So the SQL estimates only need to be in the right ballpark — they are
--   never shown for items whose actual size is known.
--
-- SIZE ESTIMATE RATIONALE (per type):
--   Reports        sources_count × 4 KB      JSON-only; scales with source count
--   Podcasts       duration_seconds × 17 KB  ≈1 MB/min; podcast duration_seconds
--                                            IS the actual audio length
--   Debates        perspectives × 60 KB      JSON-only; scales with agent count
--   Academic Papers word_count / 20 KB       JSON-only; scales with text length
--   Presentations  total_slides × 30 KB      JSON-only; scales with slide count
--   Voice Debates  total_turns × 400 KB      TTS audio; total_turns = actual
--                                            .mp3 segment count on disk.
--                                            NOT duration_seconds which reflects
--                                            the source material length, not the
--                                            generated TTS output length.
--
-- PATCH HISTORY (all applied — this is the single final file to run):
--   Initial   — both RPCs created for Part 45 feature
--   Fix 1     — debate size: replaced invalid COUNT(*) subquery with
--               jsonb_array_length() to fix Postgres syntax error
--   Fix 2     — podcast size: switched from word_count/100 to
--               duration_seconds*17 for realistic audio estimate
--   Fix 3     — voice debate size: switched from duration_seconds*17 to
--               total_turns*400 because duration_seconds can reflect the
--               source material (e.g. a 60-min podcast) not the TTS output,
--               causing wildly inflated estimates like 61.6 MB for an
--               ~18 MB debate
--
-- HOW TO RUN:
--   Paste this entire file into the Supabase SQL Editor and click Run.
--   Safe to re-run — uses DROP IF EXISTS + CREATE OR REPLACE.
-- =============================================================================


-- ─── RPC 1: get_user_voice_debates_for_cache ──────────────────────────────────
-- Returns completed voice debates for a user.
-- Used by autoCacheMiddleware when "Cache Voice Debate Audio" setting is ON
-- to know which debates to download audio for on generation.

DROP FUNCTION IF EXISTS get_user_voice_debates_for_cache(uuid);

CREATE OR REPLACE FUNCTION get_user_voice_debates_for_cache(p_user_id UUID)
RETURNS TABLE (
  id                 UUID,
  topic              TEXT,
  question           TEXT,
  total_turns        INTEGER,
  duration_seconds   INTEGER,
  word_count         INTEGER,
  audio_all_uploaded BOOLEAN,
  completed_at       TIMESTAMPTZ,
  debate_session_id  UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vd.id,
    vd.topic,
    vd.question,
    vd.total_turns,
    vd.duration_seconds,
    vd.word_count,
    COALESCE(vd.audio_all_uploaded, FALSE) AS audio_all_uploaded,
    vd.completed_at,
    vd.debate_session_id
  FROM voice_debates vd
  WHERE vd.user_id = p_user_id
    AND vd.status  = 'completed'
  ORDER BY vd.completed_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_voice_debates_for_cache(uuid) TO authenticated;


-- ─── RPC 2: get_user_content_for_selective_cache ──────────────────────────────
-- Returns all 6 content types in a unified list for the "Cache Specific Items"
-- picker. Each row includes a size_hint_kb estimate used for uncached items.
-- The app overwrites this with the real on-device size for cached items.

DROP FUNCTION IF EXISTS get_user_content_for_selective_cache(uuid, integer);

CREATE OR REPLACE FUNCTION get_user_content_for_selective_cache(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 50
)
RETURNS TABLE (
  content_type TEXT,
  id           UUID,
  title        TEXT,
  subtitle     TEXT,
  created_at   TIMESTAMPTZ,
  size_hint_kb INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- ── Research Reports ──────────────────────────────────────────────────────
  -- Estimate: sources_count × 4 KB  (JSON only, no audio)
  -- Range: 50 KB – 5 MB
  RETURN QUERY
  SELECT
    'report'::TEXT                                               AS content_type,
    r.id,
    COALESCE(r.title, r.query, 'Research Report')::TEXT         AS title,
    (r.depth || ' · ' || r.sources_count || ' sources')::TEXT  AS subtitle,
    r.created_at,
    LEAST(5120, GREATEST(50,
      r.sources_count * 4
    ))::INTEGER                                                  AS size_hint_kb
  FROM research_reports r
  WHERE r.user_id = p_user_id
    AND r.status  = 'completed'
  ORDER BY r.created_at DESC
  LIMIT p_limit;

  -- ── Podcasts ──────────────────────────────────────────────────────────────
  -- Estimate: duration_seconds × 17 KB  (≈1 MB/min of actual audio)
  -- podcast.duration_seconds = the generated episode length, so this is accurate.
  -- Fallback to word_count/10 if duration is missing.
  -- Range: 512 KB – 30 MB
  RETURN QUERY
  SELECT
    'podcast'::TEXT                                                              AS content_type,
    p.id,
    p.title::TEXT,
    (ROUND(p.duration_seconds / 60.0) || ' min · '
      || p.word_count || ' words')::TEXT                                         AS subtitle,
    p.created_at,
    LEAST(30720, GREATEST(512,
      CASE WHEN p.duration_seconds > 0
        THEN p.duration_seconds * 17
        ELSE p.word_count / 10
      END
    ))::INTEGER                                                                  AS size_hint_kb
  FROM podcasts p
  WHERE p.user_id = p_user_id
    AND p.status  = 'completed'
  ORDER BY p.created_at DESC
  LIMIT p_limit;

  -- ── AI Debates ────────────────────────────────────────────────────────────
  -- Estimate: perspective_count × 60 KB  (JSON only, no audio)
  -- jsonb_array_length avoids the COUNT(*) syntax that caused a Postgres error.
  -- Range: 100 KB – 1 MB
  RETURN QUERY
  SELECT
    'debate'::TEXT                                                               AS content_type,
    d.id,
    d.topic::TEXT                                                                AS title,
    d.question::TEXT                                                             AS subtitle,
    d.created_at,
    LEAST(1024, GREATEST(100,
      jsonb_array_length(COALESCE(d.perspectives, '[]'::jsonb)) * 60
    ))::INTEGER                                                                  AS size_hint_kb
  FROM debate_sessions d
  WHERE d.user_id = p_user_id
    AND d.status  = 'completed'
  ORDER BY d.created_at DESC
  LIMIT p_limit;

  -- ── Academic Papers ───────────────────────────────────────────────────────
  -- Estimate: word_count / 20 KB  (JSON only, scales with text length)
  -- Range: 30 KB – 1 MB
  RETURN QUERY
  SELECT
    'academic_paper'::TEXT                                                       AS content_type,
    ap.id,
    ap.title::TEXT,
    (ap.word_count || ' words · ' || ap.citation_style)::TEXT                   AS subtitle,
    ap.generated_at                                                              AS created_at,
    LEAST(1024, GREATEST(30,
      ap.word_count / 20
    ))::INTEGER                                                                  AS size_hint_kb
  FROM academic_papers ap
  WHERE ap.user_id = p_user_id
  ORDER BY ap.generated_at DESC
  LIMIT p_limit;

  -- ── Presentations ─────────────────────────────────────────────────────────
  -- Estimate: total_slides × 30 KB  (JSON only, scales with slide count)
  -- Range: 20 KB – 2 MB
  RETURN QUERY
  SELECT
    'presentation'::TEXT                                                         AS content_type,
    pr.id,
    pr.title::TEXT,
    (pr.total_slides || ' slides · ' || pr.theme)::TEXT                         AS subtitle,
    pr.generated_at                                                              AS created_at,
    LEAST(2048, GREATEST(20,
      pr.total_slides * 30
    ))::INTEGER                                                                  AS size_hint_kb
  FROM presentations pr
  WHERE pr.user_id = p_user_id
  ORDER BY pr.generated_at DESC
  LIMIT p_limit;

  -- ── Voice Debates ─────────────────────────────────────────────────────────
  -- Estimate: total_turns × 400 KB  (TTS audio segments)
  --
  -- KEY DESIGN DECISION: use total_turns not duration_seconds.
  --   duration_seconds on voice_debates can store the SOURCE MATERIAL length
  --   (e.g. the 60-min podcast the debate was generated from), not the TTS
  --   output length. Using duration_seconds * 17 would give 61.6 MB for a
  --   debate whose actual audio is ~18 MB — causing a 3× overestimate.
  --   total_turns = the exact number of .mp3 files that will be downloaded,
  --   each typically 300–500 KB. 400 KB/turn is the observed average.
  --   A 47-turn debate → 47 × 400 = 18,800 KB ≈ 18.4 MB ✓
  --
  -- Range: 1 MB – 80 MB
  RETURN QUERY
  SELECT
    'voice_debate'::TEXT                                                         AS content_type,
    vd.id,
    vd.topic::TEXT                                                               AS title,
    (vd.total_turns || ' turns · ' ||
      ROUND(vd.duration_seconds / 60.0) || ' min')::TEXT                        AS subtitle,
    vd.completed_at                                                              AS created_at,
    LEAST(81920, GREATEST(1024,
      vd.total_turns * 400
    ))::INTEGER                                                                  AS size_hint_kb
  FROM voice_debates vd
  WHERE vd.user_id = p_user_id
    AND vd.status  = 'completed'
  ORDER BY vd.completed_at DESC NULLS LAST
  LIMIT p_limit;

END;
$$;

GRANT EXECUTE ON FUNCTION get_user_content_for_selective_cache(uuid, integer) TO authenticated;