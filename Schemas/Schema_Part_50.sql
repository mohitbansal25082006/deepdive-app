-- ============================================================
-- DeepDive AI — Part 50: Workspace-Scoped Bot RAG
-- (Combines 50.4 + 50.5 — final, authoritative migration)
-- ============================================================
-- Run this in Supabase SQL Editor.
-- Fully idempotent — safe to run multiple times.
--
-- What this does:
--
--   SECTION 1: match_workspace_knowledge RPC
--     Performs pgvector similarity search scoped to a workspace.
--     Queries report_embeddings (correct table, per Part 6 schema)
--     joined to workspace_reports — single call, no pre-fetch.
--     SECURITY DEFINER so the bot (service role) can read
--     embeddings across ALL users who shared reports into a workspace.
--     Preferred over match_global_knowledge for new deployments.
--
--   SECTION 2: get_workspace_report_ids RPC
--     Returns all report_ids shared into a workspace.
--     Used as a pre-flight check before doing RAG.
--
--   SECTION 3: workspace_report_index_status table
--     Tracks which (workspace_id, report_id) pairs have been indexed
--     so we never re-embed unnecessarily. One row = "already done".
--     A report shared into multiple workspaces gets one row per workspace.
--
--   SECTION 4: mark_workspace_report_indexed RPC
--     Called by the Edge Function after embedding a report.
--     Upserts into workspace_report_index_status.
--
--   SECTION 5: get_workspace_reports_needing_indexing RPC
--     Called on workspace open to find reports that exist in
--     workspace_reports but have no index entry yet.
--     Returns owner's user_id so the indexer can call OpenAI
--     with the right data.
--
--   SECTION 6: get_workspace_report_full_for_indexer RPC
--     Returns full report data (sections, findings, etc.) for
--     embedding. SECURITY DEFINER — indexer needs cross-user read.
--
--   SECTION 7: check_workspace_report_needs_indexing RPC
--     Fast boolean check: does this workspace+report combo need
--     indexing? Called immediately after a report is shared to
--     decide whether to kick off background indexing.
--
--   SECTION 8: Auto-index trigger on workspace_reports INSERT
--     When a report is shared to a workspace, fires an HTTP POST
--     to the workspace-report-indexer Edge Function via pg_net.
--     Fire-and-forget — never blocks the INSERT.
--     App-side useWorkspaceBotIndex hook acts as fallback.
--
--   SECTION 9: Indexes
--     All indexes needed for fast JOINs across workspace_reports,
--     report_embeddings, and workspace_report_index_status.
--
-- Prerequisites:
--   - pg_net extension enabled (Dashboard → Database → Extensions)
--   - report_embeddings table exists (created in Part 6)
--   - workspace_reports table exists (created in Part 13/16)
--   - workspaces table exists
-- ============================================================


-- ============================================================
-- SECTION 1: match_workspace_knowledge RPC
-- Performs pgvector similarity search scoped to a workspace.
-- Uses report_embeddings (Part 6 table), NOT report_chunks.
-- SECURITY DEFINER bypasses RLS so we can read embeddings from
-- ANY user who shared their report into this workspace.
-- The INNER JOIN on workspace_reports ensures we only search
-- reports that have been explicitly added to this workspace.
-- ============================================================

DROP FUNCTION IF EXISTS public.match_workspace_knowledge(uuid, vector(1536), int, float) CASCADE;
DROP FUNCTION IF EXISTS public.match_workspace_knowledge(uuid, vector, int, float)        CASCADE;

CREATE OR REPLACE FUNCTION public.match_workspace_knowledge(
  p_workspace_id   UUID,
  query_embedding  vector(1536),
  match_count      INT   DEFAULT 6,
  match_threshold  FLOAT DEFAULT 0.28
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
  JOIN   public.workspace_reports  wr
    ON   wr.report_id    = re.report_id
    AND  wr.workspace_id = p_workspace_id
  WHERE  (1 - (re.embedding <=> query_embedding)) >= match_threshold
    AND  rr.status = 'completed'
  ORDER  BY re.embedding <=> query_embedding   -- ASC = most similar first
  LIMIT  match_count;
END;
$$;

-- Edge Function uses service_role; authenticated kept for future client-side use
GRANT EXECUTE ON FUNCTION public.match_workspace_knowledge(UUID, vector(1536), INT, FLOAT)
  TO service_role, authenticated;


-- ============================================================
-- SECTION 2: get_workspace_report_ids RPC
-- Returns all report_ids (+ titles) shared in a workspace.
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
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_workspace_report_ids(UUID)
  TO service_role, authenticated;


-- ============================================================
-- SECTION 3: workspace_report_index_status table
-- Tracks which (workspace_id, report_id) pairs have been indexed.
-- One row = embeddings are ready for that workspace+report combo.
-- A report shared into multiple workspaces gets one row per workspace.
-- No RLS on the table itself — access is via SECURITY DEFINER RPCs
-- and service_role; a read policy is provided for workspace members.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspace_report_index_status (
  workspace_id UUID        NOT NULL,
  report_id    UUID        NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunk_count  INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, report_id),
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)          ON DELETE CASCADE,
  FOREIGN KEY (report_id)    REFERENCES public.research_reports(id)     ON DELETE CASCADE
);

ALTER TABLE public.workspace_report_index_status ENABLE ROW LEVEL SECURITY;

-- Service role: full access (used by Edge Functions)
DROP POLICY IF EXISTS "Service role full access" ON public.workspace_report_index_status;
CREATE POLICY "Service role full access"
  ON public.workspace_report_index_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Workspace members: read-only (check if their workspace reports are indexed)
DROP POLICY IF EXISTS "Members can read index status" ON public.workspace_report_index_status;
CREATE POLICY "Members can read index status"
  ON public.workspace_report_index_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_report_index_status.workspace_id
        AND wm.user_id      = auth.uid()
    )
  );


-- ============================================================
-- SECTION 4: mark_workspace_report_indexed RPC
-- Called by the Edge Function after successfully embedding a report.
-- Upserts into workspace_report_index_status.
-- ============================================================

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


-- ============================================================
-- SECTION 5: get_workspace_reports_needing_indexing RPC
-- Returns reports in workspace_reports that have no index entry yet
-- for this workspace, but DO have existing embeddings (content ready).
-- Called by the indexer Edge Function to discover work to do.
-- Returns the owner's user_id so OpenAI calls use the right data.
-- ============================================================

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
  FROM   public.workspace_reports wr
  JOIN   public.research_reports  rr ON rr.id = wr.report_id
  WHERE  wr.workspace_id = p_workspace_id
    AND  rr.status       = 'completed'
    -- Not yet indexed for THIS workspace
    AND  NOT EXISTS (
      SELECT 1
      FROM   public.workspace_report_index_status wris
      WHERE  wris.workspace_id = p_workspace_id
        AND  wris.report_id    = wr.report_id
    )
    -- Only index reports that already have embeddings (content to search)
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


-- ============================================================
-- SECTION 6: get_workspace_report_full_for_indexer RPC
-- Returns the full report payload (sections, findings, etc.)
-- needed to build embeddings for a report.
-- SECURITY DEFINER — indexer needs to read reports from any user.
-- Only accessible by service_role (not exposed to clients).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_workspace_report_full_for_indexer(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_report_full_for_indexer(
  p_report_id UUID
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  title              TEXT,
  query              TEXT,
  executive_summary  TEXT,
  sections           JSONB,
  key_findings       JSONB,
  future_predictions JSONB,
  statistics         JSONB,
  status             TEXT
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
  FROM   public.research_reports rr
  WHERE  rr.id     = p_report_id
    AND  rr.status = 'completed'
  LIMIT  1;
END;
$$;

-- service_role only — full report data should not be client-accessible here
GRANT EXECUTE ON FUNCTION public.get_workspace_report_full_for_indexer(UUID)
  TO service_role;


-- ============================================================
-- SECTION 7: check_workspace_report_needs_indexing RPC
-- Fast boolean check: TRUE = indexing needed, FALSE = already done.
-- A report needs indexing when:
--   (a) it is NOT yet in workspace_report_index_status for this workspace, AND
--   (b) it has embeddings in report_embeddings (i.e. there is content to search).
-- Called immediately after a report is shared to decide whether to
-- kick off the workspace-report-indexer Edge Function.
-- ============================================================

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

  -- Needs indexing only if it has content but is not yet marked for this workspace
  RETURN v_has_embeddings;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_workspace_report_needs_indexing(UUID, UUID)
  TO service_role, authenticated;


-- ============================================================
-- SECTION 8: Auto-index trigger on workspace_reports INSERT
-- When a report is shared to a workspace, fires an HTTP POST
-- to the workspace-report-indexer Edge Function via pg_net.
-- Fire-and-forget (pg_net is async) — never blocks the INSERT.
-- Failures are silently swallowed; the app-side
-- useWorkspaceBotIndex hook acts as a fallback.
--
-- IMPORTANT: pg_net extension must be enabled.
--   Supabase Dashboard → Database → Extensions → search "net" → Enable
--
-- SETUP REQUIRED: Replace the two placeholder values below with
-- your real Supabase project URL and service role key before running.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_workspace_report_indexer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ⚠️  Replace these two values with your actual project credentials.
  --     Do NOT commit the real service role key to version control.
  v_supabase_url     CONSTANT TEXT := 'https://YOUR_PROJECT_REF.supabase.co';
  v_service_role_key CONSTANT TEXT := 'YOUR_SERVICE_ROLE_KEY';
  v_payload          JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'workspace_id', NEW.workspace_id,
    'report_id',    NEW.report_id,
    'trigger',      'workspace_report_shared'
  );

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
    -- pg_net not available or HTTP failed — silent no-op;
    -- useWorkspaceBotIndex hook will retry on next workspace open.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_report_shared ON public.workspace_reports;
CREATE TRIGGER on_workspace_report_shared
  AFTER INSERT ON public.workspace_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_workspace_report_indexer();


-- ============================================================
-- SECTION 9: Indexes
-- ============================================================

-- workspace_reports: fast lookup by workspace and report
CREATE INDEX IF NOT EXISTS idx_workspace_reports_workspace_id
  ON public.workspace_reports(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_report_id
  ON public.workspace_reports(report_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_composite
  ON public.workspace_reports(workspace_id, report_id);

-- Used by match_workspace_knowledge JOIN direction report_id → workspace_id
CREATE INDEX IF NOT EXISTS idx_workspace_reports_bot_join
  ON public.workspace_reports(report_id, workspace_id);

-- report_embeddings: fast embedding lookup by report_id (cross-user)
CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_id
  ON public.report_embeddings(report_id);

-- workspace_report_index_status: fast lookup
CREATE INDEX IF NOT EXISTS idx_ws_report_index_status_workspace
  ON public.workspace_report_index_status(workspace_id);

CREATE INDEX IF NOT EXISTS idx_ws_report_index_status_report
  ON public.workspace_report_index_status(report_id);


-- ============================================================
-- Notify PostgREST to reload schema
-- ============================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- DEPLOYMENT CHECKLIST
-- ============================================================
--
-- Before running this file:
--   [ ] Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY in Section 8.
--   [ ] Enable pg_net: Dashboard → Database → Extensions → "net"
--
-- After running this file:
--   [ ] Deploy the auto-indexer Edge Function:
--         supabase functions deploy workspace-report-indexer --no-verify-jwt
--   [ ] Redeploy the bot with the updated RPC call:
--         supabase functions deploy deepdive-bot --no-verify-jwt
--
-- Notes:
--   - match_workspace_knowledge queries report_embeddings (Part 6),
--     NOT report_chunks. Do not revert this.
--   - SECURITY DEFINER on all RPCs is intentional — the bot and indexer
--     must read across user ownership boundaries.
--   - If pg_net is unavailable, the trigger fails silently and the
--     app-side hook handles indexing on next workspace open.
-- ============================================================