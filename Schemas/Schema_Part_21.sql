-- ============================================================
-- DeepDive AI — Part 21 Schema Migration
-- Features:
--   1. Home personalization: user_topic_affinity, trending_topics
--   2. Streaming report generation: streaming_sessions
-- ============================================================

-- ─── 1. user_topic_affinity ──────────────────────────────────────────────────
-- Tracks which topics/keywords a user has researched and how many times,
-- used to drive personalized home screen suggestions.

CREATE TABLE IF NOT EXISTS public.user_topic_affinity (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_keyword TEXT NOT NULL,           -- normalized keyword (e.g. "AI", "climate", "blockchain")
  raw_query     TEXT,                    -- one representative query that produced this keyword
  affinity_score FLOAT DEFAULT 1.0,     -- score that increases with each research session
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_keyword)
);

ALTER TABLE public.user_topic_affinity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own affinities"
  ON public.user_topic_affinity
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_affinity_user_score
  ON public.user_topic_affinity(user_id, affinity_score DESC);

CREATE INDEX IF NOT EXISTS idx_affinity_user_last_seen
  ON public.user_topic_affinity(user_id, last_seen_at DESC);

-- ─── 2. trending_topics ──────────────────────────────────────────────────────
-- Aggregated trending topics across ALL users (privacy-safe: no user linkage).
-- Refreshed by an RPC called after every completed research session.

CREATE TABLE IF NOT EXISTS public.trending_topics (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword       TEXT NOT NULL UNIQUE,
  search_count  INTEGER DEFAULT 1,
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;

-- Everyone can read trending topics (needed for home screen).
CREATE POLICY "Anyone reads trending topics"
  ON public.trending_topics
  FOR SELECT
  USING (true);

-- Only service-role / RPCs can write.
CREATE POLICY "Service role writes trending"
  ON public.trending_topics
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_trending_count
  ON public.trending_topics(search_count DESC);

-- ─── 3. streaming_sessions ───────────────────────────────────────────────────
-- Tracks in-progress and completed streaming research sessions.
-- Allows resumption if a user backgrounds the app mid-stream.

CREATE TABLE IF NOT EXISTS public.streaming_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id       UUID REFERENCES public.research_reports(id) ON DELETE CASCADE,
  query           TEXT NOT NULL,
  depth           TEXT NOT NULL DEFAULT 'deep',
  status          TEXT NOT NULL DEFAULT 'streaming'
                    CHECK (status IN ('streaming','completed','failed','cancelled')),
  current_step    TEXT,                  -- which agent step is active
  sections_done   INTEGER DEFAULT 0,     -- how many sections have been streamed so far
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.streaming_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own streaming sessions"
  ON public.streaming_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_streaming_user_status
  ON public.streaming_sessions(user_id, status, created_at DESC);

-- ─── RPCs ─────────────────────────────────────────────────────────────────────

-- RPC: upsert_topic_affinity
-- Called after every completed research to update the user's topic affinity
-- and the global trending_topics table.
-- p_keywords is a comma-separated list of extracted topic keywords.

CREATE OR REPLACE FUNCTION public.upsert_topic_affinity(
  p_user_id    UUID,
  p_keywords   TEXT[],
  p_raw_query  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  kw TEXT;
BEGIN
  FOREACH kw IN ARRAY p_keywords LOOP
    -- Update user affinity
    INSERT INTO public.user_topic_affinity(user_id, topic_keyword, raw_query, affinity_score, last_seen_at)
    VALUES (p_user_id, lower(trim(kw)), p_raw_query, 1.0, NOW())
    ON CONFLICT (user_id, topic_keyword)
    DO UPDATE SET
      affinity_score = LEAST(user_topic_affinity.affinity_score + 0.5, 10.0),
      last_seen_at   = NOW(),
      raw_query      = COALESCE(p_raw_query, user_topic_affinity.raw_query);

    -- Update global trending
    INSERT INTO public.trending_topics(keyword, search_count, last_seen_at)
    VALUES (lower(trim(kw)), 1, NOW())
    ON CONFLICT (keyword)
    DO UPDATE SET
      search_count = trending_topics.search_count + 1,
      last_seen_at = NOW();
  END LOOP;
END;
$$;

-- RPC: get_personalized_topics
-- Returns AI-curated topic suggestions for the home screen.
-- Combines: user affinity (high-weight), recent queries, global trending.
-- Returns up to 12 rows with a source label for UI differentiation.

CREATE OR REPLACE FUNCTION public.get_personalized_topics(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 12
)
RETURNS TABLE (
  keyword      TEXT,
  raw_query    TEXT,
  score        FLOAT,
  source       TEXT,   -- 'affinity' | 'recent' | 'trending' | 'followup'
  last_seen_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    -- 1. User's high-affinity topics (most researched)
    SELECT
      a.topic_keyword  AS keyword,
      a.raw_query      AS raw_query,
      a.affinity_score AS score,
      'affinity'::TEXT AS source,
      a.last_seen_at
    FROM public.user_topic_affinity a
    WHERE a.user_id = p_user_id
      AND a.affinity_score >= 1.5
    ORDER BY a.affinity_score DESC, a.last_seen_at DESC
    LIMIT 4
  ) aff

  UNION ALL

  SELECT * FROM (
    -- 2. Recent queries (last 7 days)
    SELECT
      r.query          AS keyword,
      r.query          AS raw_query,
      0.8::FLOAT       AS score,
      'recent'::TEXT   AS source,
      r.created_at     AS last_seen_at
    FROM public.research_reports r
    WHERE r.user_id = p_user_id
      AND r.status = 'completed'
      AND r.created_at > NOW() - INTERVAL '7 days'
    ORDER BY r.created_at DESC
    LIMIT 4
  ) rec

  UNION ALL

  SELECT * FROM (
    -- 3. Global trending (not yet researched by this user)
    SELECT
      t.keyword        AS keyword,
      NULL::TEXT       AS raw_query,
      (t.search_count::FLOAT / 10.0) AS score,
      'trending'::TEXT AS source,
      t.last_seen_at
    FROM public.trending_topics t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_topic_affinity ua
      WHERE ua.user_id = p_user_id
        AND ua.topic_keyword = t.keyword
    )
    ORDER BY t.search_count DESC, t.last_seen_at DESC
    LIMIT 4
  ) trd

  ORDER BY score DESC, last_seen_at DESC
  LIMIT p_limit;
END;
$$;

-- RPC: get_trending_topics
-- Public RPC for anonymous/unauthenticated trending display.
-- Returns top N trending topics from the last 30 days.

CREATE OR REPLACE FUNCTION public.get_trending_topics(
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  keyword      TEXT,
  search_count INTEGER,
  last_seen_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT keyword, search_count, last_seen_at
  FROM public.trending_topics
  WHERE last_seen_at > NOW() - INTERVAL '30 days'
  ORDER BY search_count DESC, last_seen_at DESC
  LIMIT p_limit;
$$;

-- ─── Seed a few starter trending topics so the list isn't empty ───────────────

INSERT INTO public.trending_topics (keyword, search_count, last_seen_at) VALUES
  ('artificial intelligence', 120, NOW()),
  ('climate tech', 98, NOW()),
  ('quantum computing', 87, NOW()),
  ('electric vehicles', 76, NOW()),
  ('generative ai', 74, NOW()),
  ('space economy', 65, NOW()),
  ('biotech startups', 59, NOW()),
  ('crypto regulation', 52, NOW()),
  ('renewable energy', 48, NOW()),
  ('autonomous vehicles', 43, NOW()),
  ('llm models', 41, NOW()),
  ('nuclear fusion', 39, NOW())
ON CONFLICT (keyword) DO UPDATE
  SET search_count = EXCLUDED.search_count,
      last_seen_at = EXCLUDED.last_seen_at;