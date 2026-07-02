-- ============================================================
-- PART 58.6 — ACADEMIC PAPER SHARING DUPLICATE ACTIVITY FIX
-- ============================================================
-- 
-- PROBLEM: When sharing an academic paper to a workspace, two
-- activity entries appear in the feed:
--   1. academic_paper_shared (correct)
--   2. report_added (duplicate - should not appear)
--
-- ROOT CAUSE: The workspace_reports insert trigger logs
-- 'report_added' activity even when the report is being added
-- as part of an academic paper share flow.
--
-- SOLUTION:
--   1. Modify share_content_to_workspace RPC to skip activity
--      logging for academic_paper content type
--   2. Modify workspace_reports trigger to skip report_added
--      logging if the report is being shared as an academic paper
--
-- FILES UPDATED:
--   - src/services/workspaceSharingService.ts
--   - src/hooks/useWorkspaceBotIndex.ts
--   - supabase/functions/workspace-report-indexer/index.ts
--   - Database: share_content_to_workspace RPC
--   - Database: log_workspace_report_activity trigger function
-- ============================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Drop existing RPC to recreate with modified logic
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.share_content_to_workspace(UUID, TEXT, UUID, TEXT, TEXT, UUID, JSONB);

-- ────────────────────────────────────────────────────────────────
-- 2. Recreate share_content_to_workspace RPC
--    Part 58.6 FIX: Skip activity logging for academic_paper
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.share_content_to_workspace(
  p_workspace_id UUID,
  p_content_type TEXT,
  p_content_id   UUID,
  p_title        TEXT,
  p_subtitle     TEXT DEFAULT NULL,
  p_report_id    UUID DEFAULT NULL,
  p_metadata     JSONB DEFAULT '{}'
)
RETURNS public.shared_workspace_content
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role    TEXT;
  v_result  public.shared_workspace_content;
BEGIN
  -- Check user is a member with editor or owner role
  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0004';
  END IF;

  -- Insert or update shared content
  INSERT INTO public.shared_workspace_content(
    workspace_id, shared_by, content_type, content_id,
    title, subtitle, report_id, metadata
  ) VALUES (
    p_workspace_id, v_user_id, p_content_type, p_content_id,
    p_title, p_subtitle, p_report_id, p_metadata
  )
  ON CONFLICT (workspace_id, content_type, content_id)
  DO UPDATE SET
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING * INTO v_result;

  -- ── Part 58.6 FIX: Only log activity for non-academic_paper ──
  -- For academic_paper, activity is logged in the calling function
  -- (shareAcademicPaperToWorkspace) which uses logSharedContentAdded
  IF p_content_type != 'academic_paper' THEN
    BEGIN
      INSERT INTO public.workspace_activity
        (workspace_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (
        p_workspace_id, v_user_id, 'content_shared',
        p_content_type, p_content_id::text,
        jsonb_build_object('title', p_title, 'content_type', p_content_type)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'share_content_to_workspace: activity log skipped — %', SQLERRM;
    END;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_content_to_workspace(UUID, TEXT, UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. Drop existing trigger and function to recreate
-- ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_workspace_reports_activity ON public.workspace_reports;
DROP FUNCTION IF EXISTS public.log_workspace_report_activity();

-- ────────────────────────────────────────────────────────────────
-- 4. Recreate log_workspace_report_activity trigger function
--    Part 58.6 FIX: Skip report_added if academic paper share
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_workspace_report_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_academic_paper BOOLEAN;
  v_report_title TEXT;
BEGIN
  -- ── Part 58.6 FIX: Check if this report is being added ──
  -- as an academic paper share. If yes, skip report_added
  -- to prevent duplicate activity entries.
  SELECT EXISTS (
    SELECT 1 FROM public.shared_workspace_content
    WHERE workspace_id = NEW.workspace_id
      AND report_id = NEW.report_id
      AND content_type = 'academic_paper'
  ) INTO v_is_academic_paper;

  IF v_is_academic_paper THEN
    RETURN NEW;
  END IF;

  -- Get the report title for metadata
  SELECT title INTO v_report_title
  FROM public.research_reports
  WHERE id = NEW.report_id;

  -- Log report_added activity
  INSERT INTO public.workspace_activity (
    workspace_id, user_id, action, resource_type, resource_id,
    metadata
  ) VALUES (
    NEW.workspace_id,
    COALESCE(NEW.added_by, auth.uid()),
    'report_added',
    'report',
    NEW.report_id::text,
    jsonb_build_object(
      'report_title', COALESCE(v_report_title, 'Untitled Report'),
      'report_id', NEW.report_id
    )
  );

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. Recreate the trigger
-- ────────────────────────────────────────────────────────────────

CREATE TRIGGER on_workspace_reports_activity
  AFTER INSERT ON public.workspace_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.log_workspace_report_activity();

-- ────────────────────────────────────────────────────────────────
-- 6. Update mark_workspace_report_indexed RPC
--    Part 58.6 FIX: Add skip_activity parameter
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.mark_workspace_report_indexed(UUID, UUID, INT);

CREATE OR REPLACE FUNCTION public.mark_workspace_report_indexed(
    p_workspace_id UUID,
    p_report_id    UUID,
    p_chunk_count  INT DEFAULT 0,
    p_skip_activity BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert or update the index status
    INSERT INTO public.workspace_report_index_status (
        workspace_id, report_id, chunk_count, indexed_at
    ) VALUES (
        p_workspace_id, p_report_id, p_chunk_count, NOW()
    )
    ON CONFLICT (workspace_id, report_id) DO UPDATE SET
        chunk_count = EXCLUDED.chunk_count,
        indexed_at = NOW();

    -- ── Part 58.6 FIX: Only log activity if skip_activity is FALSE ──
    IF p_skip_activity = FALSE THEN
        BEGIN
            INSERT INTO public.workspace_activity (
                workspace_id, user_id, action, resource_type, resource_id, metadata
            ) VALUES (
                p_workspace_id,
                (SELECT user_id FROM public.research_reports WHERE id = p_report_id),
                'report_added',
                'report',
                p_report_id::text,
                jsonb_build_object(
                    'report_id', p_report_id,
                    'indexed', TRUE,
                    'chunk_count', p_chunk_count
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'mark_workspace_report_indexed: activity log skipped — %', SQLERRM;
        END;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_workspace_report_indexed(UUID, UUID, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_workspace_report_indexed(UUID, UUID, INT, BOOLEAN) TO service_role;

-- ────────────────────────────────────────────────────────────────
-- 7. Update check_workspace_report_needs_indexing RPC
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.check_workspace_report_needs_indexing(UUID, UUID);

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
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_report_index_status
        WHERE workspace_id = p_workspace_id
          AND report_id = p_report_id
    ) INTO v_exists;
    
    -- Returns TRUE if NOT indexed yet (needs indexing)
    RETURN NOT v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_workspace_report_needs_indexing(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_workspace_report_needs_indexing(UUID, UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────
-- 8. Add missing indexes for performance
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shared_workspace_content_report_id 
  ON public.shared_workspace_content(report_id) 
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shared_workspace_content_type_report 
  ON public.shared_workspace_content(content_type, report_id) 
  WHERE report_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 9. Table comments for documentation
-- ────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.share_content_to_workspace(UUID, TEXT, UUID, TEXT, TEXT, UUID, JSONB) IS 
'Part 58.6: Shares content to a workspace. Skips activity logging for academic_paper type to prevent duplicate entries.';

COMMENT ON FUNCTION public.log_workspace_report_activity() IS 
'Part 58.6: Trigger function for workspace_reports insert. Skips report_added logging if the report is being shared as an academic paper.';

COMMENT ON FUNCTION public.mark_workspace_report_indexed(UUID, UUID, INT, BOOLEAN) IS 
'Part 58.6: Marks a report as indexed for a workspace. When skip_activity is TRUE, no activity entry is logged.';

-- ────────────────────────────────────────────────────────────────
-- 10. Verify the fix - Optional diagnostic queries
-- ────────────────────────────────────────────────────────────────

-- To verify the fix is working, you can run these queries:
-- 
-- 1. Check the RPC exists with correct signature:
--    SELECT proname, pronargs FROM pg_proc 
--    WHERE proname = 'share_content_to_workspace';
--
-- 2. Check the trigger exists:
--    SELECT tgname, tgrelid::regclass FROM pg_trigger 
--    WHERE tgname = 'on_workspace_reports_activity';
--
-- 3. Check the function exists:
--    SELECT proname FROM pg_proc 
--    WHERE proname = 'log_workspace_report_activity';

-- ============================================================
-- END OF PART 58.6 SCHEMA
-- ============================================================