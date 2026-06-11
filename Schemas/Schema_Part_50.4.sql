-- ============================================================
-- DeepDive AI — Part 50.4: Workspace-Scoped Bot RAG
-- ============================================================
-- Run this in Supabase SQL Editor.
-- Fully idempotent — safe to run multiple times.
--
-- What this does:
--   The deepdive-bot Edge Function now queries ONLY reports that
--   have been shared into a specific workspace (via workspace_reports).
--   This SQL adds a dedicated RPC that accepts a workspace_id and
--   performs the pgvector search scoped to that workspace's reports.
--
--   The bot calls match_global_knowledge with p_report_ids already,
--   but this new RPC is a cleaner, single-call alternative that
--   joins workspace_reports internally (no pre-fetch needed).
--   Both approaches work; match_workspace_knowledge is preferred
--   for new deployments.
-- ============================================================


-- ============================================================
-- SECTION 1: match_workspace_knowledge RPC
-- Performs pgvector similarity search scoped to a workspace.
-- Only searches report_chunks for reports in workspace_reports.
-- Called by the deepdive-bot Edge Function.
-- ============================================================

DROP FUNCTION IF EXISTS public.match_workspace_knowledge(
  uuid, vector(1536), int, float
) CASCADE;

CREATE OR REPLACE FUNCTION public.match_workspace_knowledge(
  p_workspace_id   UUID,
  query_embedding  vector(1536),
  match_count      INT     DEFAULT 6,
  match_threshold  FLOAT   DEFAULT 0.28
)
RETURNS TABLE (
  content      TEXT,
  chunk_type   TEXT,
  similarity   FLOAT,
  report_title TEXT,
  report_id    UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return results for reports explicitly shared in this workspace
  -- Uses SECURITY DEFINER so the bot (service role) can read across users
  RETURN QUERY
  SELECT
    rc.content::TEXT,
    rc.chunk_type::TEXT,
    (1 - (rc.embedding <=> query_embedding))::FLOAT AS similarity,
    COALESCE(rr.title, rr.query, 'Workspace Report')::TEXT AS report_title,
    rc.report_id
  FROM   public.report_chunks    rc
  JOIN   public.research_reports rr ON rr.id = rc.report_id
  -- Inner join to workspace_reports ensures ONLY workspace-shared reports
  JOIN   public.workspace_reports wr
    ON   wr.report_id    = rc.report_id
    AND  wr.workspace_id = p_workspace_id
  WHERE  (1 - (rc.embedding <=> query_embedding)) >= match_threshold
  ORDER  BY (rc.embedding <=> query_embedding)   -- ASC = most similar first
  LIMIT  match_count;
END;
$$;

-- Grant to service role (used by Edge Function with service key)
GRANT EXECUTE ON FUNCTION public.match_workspace_knowledge(
  UUID, vector(1536), INT, FLOAT
) TO service_role;

-- Also grant to authenticated for future client-side use
GRANT EXECUTE ON FUNCTION public.match_workspace_knowledge(
  UUID, vector(1536), INT, FLOAT
) TO authenticated;


-- ============================================================
-- SECTION 2: get_workspace_report_ids helper
-- Returns all report_ids shared in a workspace.
-- Used by the bot as a pre-flight check before doing RAG.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_workspace_report_ids(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_report_ids(
  p_workspace_id UUID
)
RETURNS TABLE (
  report_id    UUID,
  report_title TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wr.report_id,
    COALESCE(rr.title, rr.query, 'Untitled Report')::TEXT AS report_title
  FROM   public.workspace_reports wr
  JOIN   public.research_reports  rr ON rr.id = wr.report_id
  WHERE  wr.workspace_id = p_workspace_id
  ORDER  BY wr.added_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_report_ids(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_report_ids(UUID) TO authenticated;


-- ============================================================
-- SECTION 3: Ensure workspace_reports has needed indexes
-- for fast JOIN in match_workspace_knowledge
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workspace_reports_workspace_id
  ON public.workspace_reports (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_report_id
  ON public.workspace_reports (report_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_composite
  ON public.workspace_reports (workspace_id, report_id);


-- ============================================================
-- NOTIFY PostgREST to reload schema
-- ============================================================

NOTIFY pgrst, 'reload schema';