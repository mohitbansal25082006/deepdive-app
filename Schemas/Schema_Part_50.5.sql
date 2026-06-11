-- ============================================================
-- DeepDive AI — Part 50.5: Workspace Bot RAG Fix + Auto-Indexing
-- ============================================================
-- Run this single file in your Supabase SQL Editor.
-- Fully idempotent — safe to re-run.
--
-- What this fixes / adds:
--
--   PART 1: FIX match_workspace_knowledge
--     The Part 50.4 RPC queried `report_chunks` which does NOT exist.
--     The real table is `report_embeddings` (created in Part 6).
--     This recreates the RPC pointing at the correct table.
--     It uses SECURITY DEFINER + service_role so it can read
--     embeddings across ALL users who shared reports into the workspace.
--
--   PART 2: workspace_report_index_status table
--     Tracks which (workspace_id, report_id) pairs have been indexed
--     so we never re-embed unnecessarily. One row = "already done".
--
--   PART 3: queue_workspace_report_for_indexing RPC
--     Called by the workspace-report-indexer Edge Function after
--     it finishes embedding a report. Marks it as indexed.
--
--   PART 4: get_workspace_reports_needing_indexing RPC
--     Called on workspace open to find reports that exist in
--     workspace_reports but have no embeddings yet. Returns
--     the owner's user_id so the indexer can call OpenAI
--     with the right data.
--
--   PART 5: DB trigger on workspace_reports INSERT
--     When a report is added to a workspace, fires an HTTP call
--     to the workspace-report-indexer Edge Function via pg_net.
--     This is the "auto-index on share" mechanism.
--
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Fix match_workspace_knowledge RPC
-- Uses report_embeddings (correct table) NOT report_chunks
-- SECURITY DEFINER so service role reads across all users
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.match_workspace_knowledge(UUID, vector(1536), INT, FLOAT) CASCADE;
DROP FUNCTION IF EXISTS public.match_workspace_knowledge(uuid, vector, int, float) CASCADE;

CREATE OR REPLACE FUNCTION public.match_workspace_knowledge(
  p_workspace_id   UUID,
  query_embedding  vector(1536),
  match_count      INT    DEFAULT 6,
  match_threshold  FLOAT  DEFAULT 0.28
)
RETURNS TABLE (
  content      TEXT,
  chunk_type   TEXT,
  similarity   FLOAT,
  report_title TEXT,
  report_id    UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NOTE: Uses report_embeddings (Part 6 table), NOT report_chunks.
  -- SECURITY DEFINER bypasses RLS so we can read embeddings from ANY user
  -- who shared their report into this workspace.
  -- The JOIN on workspace_reports ensures we only search reports
  -- that have been explicitly added to this workspace.
  RETURN QUERY
  SELECT
    re.content::TEXT,
    re.chunk_type::TEXT,
    (1 - (re.embedding <=> query_embedding))::FLOAT AS similarity,
    COALESCE(rr.title, rr.query, 'Workspace Report')::TEXT AS report_title,
    re.report_id
  FROM   public.report_embeddings  re
  JOIN   public.research_reports   rr
    ON   rr.id = re.report_id
  -- INNER JOIN workspace_reports: only return chunks for workspace-shared reports
  JOIN   public.workspace_reports  wr
    ON   wr.report_id    = re.report_id
    AND  wr.workspace_id = p_workspace_id
  WHERE  (1 - (re.embedding <=> query_embedding)) >= match_threshold
    AND  rr.status = 'completed'
  ORDER  BY re.embedding <=> query_embedding   -- ASC = most similar first
  LIMIT  match_count;
END;
$$;

-- Grant to both roles — Edge Function uses service_role, future client use authenticated
GRANT EXECUTE ON FUNCTION public.match_workspace_knowledge(UUID, vector(1536), INT, FLOAT)
  TO service_role, authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: workspace_report_index_status table
-- Tracks which workspace+report combos have been indexed.
-- One row = embeddings exist and are ready for this workspace.
-- A report shared into multiple workspaces gets ONE row per workspace.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.workspace_report_index_status (
  workspace_id UUID        NOT NULL,
  report_id    UUID        NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunk_count  INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, report_id),
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)   ON DELETE CASCADE,
  FOREIGN KEY (report_id)    REFERENCES public.research_reports(id) ON DELETE CASCADE
);

-- No RLS needed — only accessed via SECURITY DEFINER RPCs and service role
ALTER TABLE public.workspace_report_index_status ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by Edge Function)
DROP POLICY IF EXISTS "Service role full access" ON public.workspace_report_index_status;
CREATE POLICY "Service role full access"
  ON public.workspace_report_index_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (to check if their workspace reports are indexed)
DROP POLICY IF EXISTS "Members can read index status" ON public.workspace_report_index_status;
CREATE POLICY "Members can read index status"
  ON public.workspace_report_index_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_report_index_status.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ws_report_index_status_workspace
  ON public.workspace_report_index_status(workspace_id);

CREATE INDEX IF NOT EXISTS idx_ws_report_index_status_report
  ON public.workspace_report_index_status(report_id);


-- ════════════════════════════════════════════════════════════
-- SECTION 3: mark_workspace_report_indexed RPC
-- Called by Edge Function after successfully embedding a report.
-- Upserts into workspace_report_index_status.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.mark_workspace_report_indexed(UUID, UUID, INT) CASCADE;

CREATE OR REPLACE FUNCTION public.mark_workspace_report_indexed(
  p_workspace_id UUID,
  p_report_id    UUID,
  p_chunk_count  INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_report_index_status
    (workspace_id, report_id, indexed_at, chunk_count)
  VALUES
    (p_workspace_id, p_report_id, NOW(), p_chunk_count)
  ON CONFLICT (workspace_id, report_id)
  DO UPDATE SET
    indexed_at  = NOW(),
    chunk_count = EXCLUDED.chunk_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_workspace_report_indexed(UUID, UUID, INT)
  TO service_role, authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: get_workspace_reports_needing_indexing RPC
-- Returns reports in workspace_reports that have no embeddings yet.
-- Called by the indexer Edge Function to find work to do.
-- Returns owner's user_id so we can fetch the full report data.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_workspace_reports_needing_indexing(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_reports_needing_indexing(
  p_workspace_id UUID
)
RETURNS TABLE (
  report_id    UUID,
  user_id      UUID,
  report_title TEXT,
  added_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wr.report_id,
    rr.user_id,
    COALESCE(rr.title, rr.query, 'Untitled Report')::TEXT AS report_title,
    wr.added_at
  FROM   public.workspace_reports  wr
  JOIN   public.research_reports   rr ON rr.id = wr.report_id
  WHERE  wr.workspace_id = p_workspace_id
    AND  rr.status       = 'completed'
    -- Only reports that have NO embeddings at all (never been indexed by anyone)
    -- OR that are not yet marked as indexed for THIS workspace
    AND  NOT EXISTS (
      SELECT 1
      FROM   public.workspace_report_index_status wris
      WHERE  wris.workspace_id = p_workspace_id
        AND  wris.report_id    = wr.report_id
    )
    -- Only index reports that have content to embed
    AND  EXISTS (
      SELECT 1
      FROM   public.report_embeddings re
      WHERE  re.report_id = wr.report_id
    )
  ORDER  BY wr.added_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_reports_needing_indexing(UUID)
  TO service_role, authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: get_workspace_report_full_for_indexer RPC
-- Returns full report data (sections, findings, etc.) for embedding.
-- SECURITY DEFINER — indexer needs to read reports from any user.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_workspace_report_full_for_indexer(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_report_full_for_indexer(
  p_report_id UUID
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  title               TEXT,
  query               TEXT,
  executive_summary   TEXT,
  sections            JSONB,
  key_findings        JSONB,
  future_predictions  JSONB,
  statistics          JSONB,
  status              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rr.id,
    rr.user_id,
    rr.title,
    rr.query,
    rr.executive_summary,
    rr.sections::JSONB,
    rr.key_findings::JSONB,
    rr.future_predictions::JSONB,
    rr.statistics::JSONB,
    rr.status
  FROM public.research_reports rr
  WHERE rr.id     = p_report_id
    AND rr.status = 'completed'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_report_full_for_indexer(UUID)
  TO service_role;


-- ════════════════════════════════════════════════════════════
-- SECTION 6: check_workspace_report_needs_indexing RPC
-- Fast check: does this workspace+report combo need indexing?
-- Returns TRUE if not yet indexed, FALSE if already done.
-- Called immediately after a report is shared to decide
-- whether to kick off background indexing.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.check_workspace_report_needs_indexing(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.check_workspace_report_needs_indexing(
  p_workspace_id UUID,
  p_report_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_indexed BOOLEAN;
  v_has_embeddings  BOOLEAN;
BEGIN
  -- Check if already marked as indexed for this workspace
  SELECT EXISTS(
    SELECT 1 FROM public.workspace_report_index_status
    WHERE workspace_id = p_workspace_id
      AND report_id    = p_report_id
  ) INTO v_already_indexed;

  IF v_already_indexed THEN
    RETURN FALSE; -- already done, no work needed
  END IF;

  -- Check if the report has any embeddings at all
  SELECT EXISTS(
    SELECT 1 FROM public.report_embeddings
    WHERE report_id = p_report_id
    LIMIT 1
  ) INTO v_has_embeddings;

  -- Needs indexing only if it has embeddings (content) but not yet marked for this workspace
  RETURN v_has_embeddings;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_workspace_report_needs_indexing(UUID, UUID)
  TO service_role, authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Trigger to auto-index on workspace_reports INSERT
-- When a report is shared to a workspace, we call the
-- workspace-report-indexer Edge Function via pg_net HTTP POST.
-- This is a fire-and-forget background call.
--
-- IMPORTANT: pg_net extension must be enabled.
-- Enable it in: Supabase Dashboard → Database → Extensions → net
--
-- NOTE: Supabase hosted projects do not allow ALTER DATABASE SET
-- for custom app.* parameters (permission denied error).
-- The URL and service role key are hardcoded directly here instead.
-- ════════════════════════════════════════════════════════════

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_workspace_report_indexer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url     CONSTANT TEXT := 'https://YOUR_PROJECT_REF.supabase.co';
  v_service_role_key CONSTANT TEXT := 'YOUR_SERVICE_ROLE_KEY';
  v_payload          JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'workspace_id', NEW.workspace_id,
    'report_id',    NEW.report_id,
    'trigger',      'workspace_report_shared'
  );

  -- Fire HTTP POST to the workspace-report-indexer Edge Function
  -- pg_net is async — returns immediately, never blocks the INSERT
  -- Wrapped in exception handler so any failure is a silent no-op;
  -- the app-side useWorkspaceBotIndex hook acts as fallback.
  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/workspace-report-indexer',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body    := v_payload::text
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net not available or HTTP failed — silent no-op
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Create the trigger (DROP first to ensure idempotency)
DROP TRIGGER IF EXISTS on_workspace_report_shared ON public.workspace_reports;
CREATE TRIGGER on_workspace_report_shared
  AFTER INSERT ON public.workspace_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_workspace_report_indexer();


-- ════════════════════════════════════════════════════════════
-- SECTION 8: Indexes for performance
-- ════════════════════════════════════════════════════════════

-- Ensure workspace_reports has the indexes from Part 50.4 (idempotent)
CREATE INDEX IF NOT EXISTS idx_workspace_reports_workspace_id
  ON public.workspace_reports(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_report_id
  ON public.workspace_reports(report_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_composite
  ON public.workspace_reports(workspace_id, report_id);

-- Index for fast embedding lookup by report_id (cross-user)
CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_id
  ON public.report_embeddings(report_id);

-- Composite index for the workspace bot query
-- (workspace_id, report_id) → fast JOIN in match_workspace_knowledge
CREATE INDEX IF NOT EXISTS idx_workspace_reports_bot_join
  ON public.workspace_reports(report_id, workspace_id);


-- ════════════════════════════════════════════════════════════
-- SECTION 9: Notify PostgREST to reload schema
-- ════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- SETUP INSTRUCTIONS
-- ============================================================
--
-- 1. Enable pg_net extension (if not already enabled):
--    Supabase Dashboard → Database → Extensions → search "net" → Enable
--
-- 2. Deploy the new auto-indexer Edge Function:
--    supabase functions deploy workspace-report-indexer --no-verify-jwt
--
-- 3. Redeploy the updated bot:
--    supabase functions deploy deepdive-bot --no-verify-jwt
--
-- NOTE: No ALTER DATABASE commands needed. The trigger function has the
-- Supabase URL and service role key hardcoded directly (Section 7).
--
-- ============================================================