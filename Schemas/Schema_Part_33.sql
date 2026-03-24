-- =============================================================================
-- schema_part33.sql
-- DeepDive AI — Part 33: Shareable Public Report Pages
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Run)
-- Safe to re-run — all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- Does NOT modify any existing tables or policies from Parts 1–32.
-- =============================================================================

-- ─── 1. public_share_links ────────────────────────────────────────────────────
-- One row per shared report. The share_id is a short random slug (nanoid-style)
-- that appears in the public URL: /r/[share_id]
--
-- Only the report owner can create/delete their share link.
-- Anyone (including unauthenticated visitors) can READ via the service-role
-- RPC functions below — the table itself is locked behind RLS.

CREATE TABLE IF NOT EXISTS public.public_share_links (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id      TEXT        NOT NULL UNIQUE,          -- short URL slug, e.g. "abc123xy"
  report_id     UUID        NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  view_count    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ
);

ALTER TABLE public.public_share_links ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD on their own share links
DROP POLICY IF EXISTS "Owner manages own share links" ON public.public_share_links;
CREATE POLICY "Owner manages own share links"
  ON public.public_share_links
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_public_share_links_share_id
  ON public.public_share_links (share_id);

CREATE INDEX IF NOT EXISTS idx_public_share_links_report_id
  ON public.public_share_links (report_id);

CREATE INDEX IF NOT EXISTS idx_public_share_links_user_id
  ON public.public_share_links (user_id);

-- ─── 2. public_chat_usage ─────────────────────────────────────────────────────
-- Tracks how many questions each visitor (by IP) has asked on a given report.
-- Resets after 24 hours. No user account needed — keyed by (ip_hash, share_id).
--
-- ip_hash: SHA-256 of the visitor's IP address (privacy-preserving)
-- question_count: incremented on each successful chat response
-- window_start: when the 24h window began (resets when NOW() > window_start + 24h)

CREATE TABLE IF NOT EXISTS public.public_chat_usage (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash        TEXT        NOT NULL,
  share_id       TEXT        NOT NULL REFERENCES public.public_share_links(share_id) ON DELETE CASCADE,
  question_count INTEGER     NOT NULL DEFAULT 0,
  window_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ip_hash, share_id)
);

-- No RLS — this table is only accessed via SECURITY DEFINER RPCs.
-- Direct table access is blocked for all roles below.
ALTER TABLE public.public_chat_usage ENABLE ROW LEVEL SECURITY;

-- Deny all direct access — only RPCs (SECURITY DEFINER) can touch this table
DROP POLICY IF EXISTS "No direct access to chat usage" ON public.public_chat_usage;
CREATE POLICY "No direct access to chat usage"
  ON public.public_chat_usage
  FOR ALL
  USING (FALSE);

CREATE INDEX IF NOT EXISTS idx_public_chat_usage_lookup
  ON public.public_chat_usage (ip_hash, share_id);

-- ─── 3. RPC: get_or_create_share_link ────────────────────────────────────────
-- Called by the React Native app when the user taps "Share Public Link".
-- If a share link already exists for this report, returns it.
-- If not, generates a new 8-character share_id and creates the row.
-- Returns the share_id string.

CREATE OR REPLACE FUNCTION public.get_or_create_share_link(
  p_report_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_share_id TEXT;
  v_exists   BOOLEAN;
BEGIN
  -- Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the report belongs to this user
  IF NOT EXISTS (
    SELECT 1 FROM public.research_reports
    WHERE id = p_report_id AND user_id = v_user_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Report not found or not completed';
  END IF;

  -- Return existing share link if active
  SELECT share_id INTO v_share_id
  FROM public.public_share_links
  WHERE report_id = p_report_id
    AND user_id   = v_user_id
    AND is_active = TRUE
  LIMIT 1;

  IF v_share_id IS NOT NULL THEN
    RETURN v_share_id;
  END IF;

  -- Generate a new unique 8-char share_id
  -- Uses random hex chars — collision probability is negligible at scale
  LOOP
    v_share_id := LOWER(SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 8));
    SELECT NOT EXISTS (
      SELECT 1 FROM public.public_share_links WHERE share_id = v_share_id
    ) INTO v_exists;
    EXIT WHEN v_exists;
  END LOOP;

  -- Insert
  INSERT INTO public.public_share_links (share_id, report_id, user_id)
  VALUES (v_share_id, p_report_id, v_user_id);

  RETURN v_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_share_link(UUID) TO authenticated;

-- ─── 4. RPC: get_report_by_share_id ──────────────────────────────────────────
-- Called by the Next.js server component to load the full report for a visitor.
-- This is a SECURITY DEFINER function — it bypasses RLS to read the report
-- even though the visitor is not authenticated.
-- Returns NULL if the share link doesn't exist or is inactive.

CREATE OR REPLACE FUNCTION public.get_report_by_share_id(
  p_share_id TEXT
)
RETURNS TABLE (
  report_id          UUID,
  share_link_id      UUID,
  view_count         INTEGER,
  query              TEXT,
  depth              TEXT,
  title              TEXT,
  executive_summary  TEXT,
  sections           JSONB,
  key_findings       JSONB,
  future_predictions JSONB,
  citations          JSONB,
  statistics         JSONB,
  sources_count      INTEGER,
  reliability_score  NUMERIC,
  infographic_data   JSONB,
  source_images      JSONB,
  knowledge_graph    JSONB,
  research_mode      TEXT,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ,
  -- owner info for attribution
  owner_username     TEXT,
  owner_avatar_url   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rr.id               AS report_id,
    psl.id              AS share_link_id,
    psl.view_count,
    rr.query,
    rr.depth,
    rr.title,
    rr.executive_summary,
    COALESCE(rr.sections,           '[]'::jsonb) AS sections,
    COALESCE(rr.key_findings,       '[]'::jsonb) AS key_findings,
    COALESCE(rr.future_predictions, '[]'::jsonb) AS future_predictions,
    COALESCE(rr.citations,          '[]'::jsonb) AS citations,
    COALESCE(rr.statistics,         '[]'::jsonb) AS statistics,
    COALESCE(rr.sources_count,      0)           AS sources_count,
    COALESCE(rr.reliability_score,  0)           AS reliability_score,
    rr.infographic_data,
    rr.source_images,
    rr.knowledge_graph,
    COALESCE(rr.research_mode, 'standard')       AS research_mode,
    rr.completed_at,
    rr.created_at,
    p.username          AS owner_username,
    p.avatar_url        AS owner_avatar_url
  FROM public.public_share_links psl
  JOIN public.research_reports rr ON rr.id = psl.report_id
  LEFT JOIN public.profiles p     ON p.id  = psl.user_id
  WHERE psl.share_id  = p_share_id
    AND psl.is_active = TRUE
    AND rr.status     = 'completed'
  LIMIT 1;
END;
$$;

-- Grant to anon so Next.js server components using the anon key can call it.
-- (Our server code uses the service role key, but granting anon is safe here
--  because this function only exposes completed+shared reports.)
GRANT EXECUTE ON FUNCTION public.get_report_by_share_id(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_report_by_share_id(TEXT) TO authenticated;

-- ─── 5. RPC: increment_share_view ────────────────────────────────────────────
-- Called server-side each time a visitor loads a public report page.
-- Increments view_count and updates last_viewed_at.

CREATE OR REPLACE FUNCTION public.increment_share_view(
  p_share_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET
    view_count     = view_count + 1,
    last_viewed_at = NOW()
  WHERE share_id = p_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_share_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_share_view(TEXT) TO authenticated;

-- ─── 6. RPC: check_chat_limit ────────────────────────────────────────────────
-- Returns whether the visitor (by ip_hash) has reached the 3-question limit
-- for this share_id, and how many questions they have used so far.
-- Auto-resets if the window is older than 24 hours.

CREATE OR REPLACE FUNCTION public.check_chat_limit(
  p_ip_hash  TEXT,
  p_share_id TEXT,
  p_limit    INTEGER DEFAULT 3
)
RETURNS TABLE (
  questions_used  INTEGER,
  limit_reached   BOOLEAN,
  window_start    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.public_chat_usage%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.public_chat_usage
  WHERE ip_hash  = p_ip_hash
    AND share_id = p_share_id;

  -- No row yet → zero usage
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, FALSE, NOW();
    RETURN;
  END IF;

  -- Window expired (> 24 hours) → treat as fresh
  IF NOW() > v_row.window_start + INTERVAL '24 hours' THEN
    UPDATE public.public_chat_usage
    SET question_count = 0,
        window_start   = NOW(),
        updated_at     = NOW()
    WHERE ip_hash  = p_ip_hash
      AND share_id = p_share_id;

    RETURN QUERY SELECT 0::INTEGER, FALSE, NOW();
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_row.question_count,
    (v_row.question_count >= p_limit),
    v_row.window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_chat_limit(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.check_chat_limit(TEXT, TEXT, INTEGER) TO authenticated;

-- ─── 7. RPC: record_chat_usage ────────────────────────────────────────────────
-- Increments the question counter for (ip_hash, share_id).
-- Creates the row if it doesn't exist (upsert).
-- Called by the API route AFTER a successful RAG response is sent.

CREATE OR REPLACE FUNCTION public.record_chat_usage(
  p_ip_hash  TEXT,
  p_share_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  INSERT INTO public.public_chat_usage (ip_hash, share_id, question_count, window_start)
  VALUES (p_ip_hash, p_share_id, 1, NOW())
  ON CONFLICT (ip_hash, share_id) DO UPDATE
    SET question_count = public_chat_usage.question_count + 1,
        updated_at     = NOW()
  RETURNING question_count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_chat_usage(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_chat_usage(TEXT, TEXT) TO authenticated;

-- ─── 8. RPC: match_report_chunks_public ──────────────────────────────────────
-- RAG similarity search for public visitors.
-- Accepts share_id instead of user_id — resolves the report_id internally.
-- Uses SECURITY DEFINER to bypass RLS on report_embeddings.
-- Only works for active, completed, publicly-shared reports.

CREATE OR REPLACE FUNCTION public.match_report_chunks_public(
  query_embedding  vector(1536),
  p_share_id       TEXT,
  match_count      INT   DEFAULT 5,
  match_threshold  FLOAT DEFAULT 0.28
)
RETURNS TABLE (
  id          UUID,
  chunk_id    TEXT,
  chunk_type  TEXT,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id UUID;
  v_user_id   UUID;
BEGIN
  -- Resolve the report and its owner from the share link
  SELECT psl.report_id, psl.user_id
  INTO   v_report_id, v_user_id
  FROM   public.public_share_links psl
  JOIN   public.research_reports   rr ON rr.id = psl.report_id
  WHERE  psl.share_id  = p_share_id
    AND  psl.is_active = TRUE
    AND  rr.status     = 'completed'
  LIMIT 1;

  IF v_report_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    re.id,
    re.chunk_id,
    re.chunk_type,
    re.content,
    re.metadata,
    (1 - (re.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.report_embeddings re
  WHERE re.report_id = v_report_id
    AND re.user_id   = v_user_id
    AND (1 - (re.embedding <=> query_embedding)) > match_threshold
  ORDER BY re.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_report_chunks_public(vector, TEXT, INT, FLOAT) TO anon;
GRANT EXECUTE ON FUNCTION public.match_report_chunks_public(vector, TEXT, INT, FLOAT) TO authenticated;

-- ─── 9. RPC: delete_share_link ────────────────────────────────────────────────
-- Lets the report owner deactivate a share link (soft delete — sets is_active = false).
-- The public URL will then return 404.

CREATE OR REPLACE FUNCTION public.delete_share_link(
  p_share_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.public_share_links
  SET is_active = FALSE
  WHERE share_id = p_share_id
    AND user_id  = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_share_link(TEXT) TO authenticated;

-- ─── 10. View: user_share_links ───────────────────────────────────────────────
-- Convenience view for the React Native app to list all share links for the
-- current user — useful for a future "manage shared reports" screen.

CREATE OR REPLACE VIEW public.user_share_links AS
SELECT
  psl.id,
  psl.share_id,
  psl.report_id,
  psl.is_active,
  psl.view_count,
  psl.created_at,
  psl.last_viewed_at,
  rr.title        AS report_title,
  rr.query        AS report_query,
  rr.depth        AS report_depth
FROM public.public_share_links psl
JOIN public.research_reports rr ON rr.id = psl.report_id
WHERE psl.user_id = auth.uid();

-- ─── 11. Verify migration ──────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('public_share_links', 'public_chat_usage')
  ) = 2, 'Part 33 tables missing';

  RAISE NOTICE '✅ Part 33 schema migration completed successfully';
  RAISE NOTICE '   Tables: public_share_links, public_chat_usage';
  RAISE NOTICE '   RPCs: get_or_create_share_link, get_report_by_share_id,';
  RAISE NOTICE '         increment_share_view, check_chat_limit,';
  RAISE NOTICE '         record_chat_usage, match_report_chunks_public,';
  RAISE NOTICE '         delete_share_link';
END $$;