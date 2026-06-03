-- ============================================================
-- DeepDive AI — Part 46: Full Realtime Teams Tab
-- FINAL MERGED SCHEMA (all patches combined)
-- ============================================================
-- Run this SINGLE file in Supabase SQL Editor.
-- Fully idempotent — safe to run multiple times.
-- Supersedes: schema_part46.sql + schema_patch_part46_fix.sql
--             + schema_patch_part46_fix2.sql
-- ============================================================


-- ============================================================
-- SECTION 1: REPLICA IDENTITY FULL
-- Required so DELETE Realtime events carry all columns, not
-- just the primary key, when RLS is enabled.
-- ============================================================

ALTER TABLE public.workspace_members         REPLICA IDENTITY FULL;
ALTER TABLE public.workspace_blocked_members  REPLICA IDENTITY FULL;
ALTER TABLE public.report_comments            REPLICA IDENTITY FULL;
ALTER TABLE public.comment_replies            REPLICA IDENTITY FULL;
ALTER TABLE public.workspace_reports          REPLICA IDENTITY FULL;
ALTER TABLE public.shared_workspace_content   REPLICA IDENTITY FULL;
ALTER TABLE public.shared_debates             REPLICA IDENTITY FULL;
ALTER TABLE public.workspace_activity         REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER TABLE public.shared_podcasts           REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.pinned_workspace_reports   REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.shared_voice_debates       REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ============================================================
-- SECTION 2: Publication — ensure all tables are in realtime
-- ============================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_blocked_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.report_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_replies;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_reports;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_workspace_content;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_debates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_activity;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_podcasts;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_table   THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_workspace_reports;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_table   THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_voice_debates;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_table   THEN NULL; END $$;


-- ============================================================
-- SECTION 3: RLS — allow blocked users to read their own row
-- ============================================================

DROP POLICY IF EXISTS "blocked_select_self" ON public.workspace_blocked_members;

CREATE POLICY "blocked_select_self"
  ON public.workspace_blocked_members FOR SELECT TO authenticated
  USING (
    blocked_user_id = auth.uid()
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );


-- ============================================================
-- SECTION 4: RLS — allow authenticated users to receive
-- private Broadcast messages (required for private channels)
-- ============================================================

DROP POLICY IF EXISTS "authenticated_can_receive_broadcasts" ON realtime.messages;

CREATE POLICY "authenticated_can_receive_broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- SECTION 5: Grant realtime schema access
-- ============================================================

GRANT USAGE ON SCHEMA realtime TO postgres;


-- ============================================================
-- SECTION 6: block_workspace_member RPC
-- Removes member, inserts blocked row, logs activity.
-- The on_workspace_member_blocked trigger (Section 8) handles
-- the realtime Broadcast — this RPC no longer needs pg_notify.
-- ============================================================

DROP FUNCTION IF EXISTS public.block_workspace_member(uuid, uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.block_workspace_member(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_reason       text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF public.get_workspace_role(p_workspace_id, auth.uid()) != 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can block members';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot block yourself';
  END IF;

  v_target_role := public.get_workspace_role(p_workspace_id, p_user_id);
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot block a workspace owner';
  END IF;

  -- Remove from members (triggers on_workspace_member_removed → Broadcast)
  DELETE FROM public.workspace_members
   WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  -- Reset access requests
  BEGIN
    UPDATE public.edit_access_requests
       SET status = 'denied', reviewed_by = auth.uid(),
           reviewed_at = now(), updated_at = now()
     WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND status = 'pending';

    UPDATE public.edit_access_requests
       SET status = 'removed', reviewed_by = auth.uid(),
           reviewed_at = now(), updated_at = now()
     WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND status = 'approved';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'block_workspace_member: access_requests update skipped — %', SQLERRM;
  END;

  -- Insert blocked row (triggers on_workspace_member_blocked → Broadcast)
  INSERT INTO public.workspace_blocked_members
    (workspace_id, blocked_user_id, blocked_by, reason)
  VALUES (p_workspace_id, p_user_id, auth.uid(), p_reason)
  ON CONFLICT (workspace_id, blocked_user_id) DO NOTHING;

  -- Log activity
  BEGIN
    INSERT INTO public.workspace_activity
      (workspace_id, user_id, action, resource_type, resource_id, metadata)
    VALUES (
      p_workspace_id, auth.uid(), 'member_blocked',
      'user', p_user_id::text,
      jsonb_build_object('reason', p_reason)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'block_workspace_member: activity log skipped — %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_workspace_member(uuid, uuid, text) TO authenticated;


-- ============================================================
-- SECTION 7: notify_workspace_member_removed (no-op stub)
-- Kept for backward compatibility — triggers now handle Broadcast.
-- ============================================================

DROP FUNCTION IF EXISTS public.notify_workspace_member_removed(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.notify_workspace_member_removed(
  p_workspace_id uuid,
  p_user_id      uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NULL; END; $$;

GRANT EXECUTE ON FUNCTION public.notify_workspace_member_removed(uuid, uuid) TO authenticated;


-- ============================================================
-- SECTION 8: Realtime Broadcast Triggers
-- Uses realtime.send() with simple JSON payloads.
-- Clients subscribe to the exact channel names defined here.
-- All triggers are SECURITY DEFINER → bypass RLS.
-- ============================================================

-- ── 8a. Member removed ─────────────────────────────────────────────────────
-- Channel: "workspace_member_removed:{user_id}"   Event: "workspace_kick"
-- Payload: { type, workspace_id, user_id }

CREATE OR REPLACE FUNCTION public.broadcast_member_removed()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('type', 'removed', 'workspace_id', OLD.workspace_id, 'user_id', OLD.user_id),
    'workspace_kick',
    'workspace_member_removed:' || OLD.user_id::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_member_removed ON public.workspace_members;
CREATE TRIGGER on_workspace_member_removed
  AFTER DELETE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_member_removed();


-- ── 8b. Member blocked ─────────────────────────────────────────────────────
-- Channel: "workspace_member_removed:{blocked_user_id}"   Event: "workspace_kick"
-- Same channel as remove — one listener handles both on the client.

CREATE OR REPLACE FUNCTION public.broadcast_member_blocked()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('type', 'blocked', 'workspace_id', NEW.workspace_id, 'user_id', NEW.blocked_user_id),
    'workspace_kick',
    'workspace_member_removed:' || NEW.blocked_user_id::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_member_blocked ON public.workspace_blocked_members;
CREATE TRIGGER on_workspace_member_blocked
  AFTER INSERT ON public.workspace_blocked_members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_member_blocked();


-- ── 8c. Pin / Unpin ────────────────────────────────────────────────────────
-- Channel: "workspace_pins:{workspace_id}"   Event: "pin_change"
-- Payload: { workspace_id, report_id, pinned }

CREATE OR REPLACE FUNCTION public.broadcast_pin_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_workspace_id uuid;
  v_report_id    uuid;
  v_pinned       boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_workspace_id := NEW.workspace_id; v_report_id := NEW.report_id; v_pinned := true;
  ELSE
    v_workspace_id := OLD.workspace_id; v_report_id := OLD.report_id; v_pinned := false;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('workspace_id', v_workspace_id, 'report_id', v_report_id, 'pinned', v_pinned),
    'pin_change',
    'workspace_pins:' || v_workspace_id::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_pin_change ON public.pinned_workspace_reports;
CREATE TRIGGER on_pin_change
  AFTER INSERT OR DELETE ON public.pinned_workspace_reports
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_pin_change();


-- ── 8d. Role change ────────────────────────────────────────────────────────
-- Channel: "workspace_members:{workspace_id}"   Event: "role_change"
-- Payload: { user_id, workspace_id, role }
-- Fires only when role actually changes (ownership transfer, role edit).

CREATE OR REPLACE FUNCTION public.broadcast_role_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM realtime.send(
      jsonb_build_object('user_id', NEW.user_id, 'workspace_id', NEW.workspace_id, 'role', NEW.role),
      'role_change',
      'workspace_members:' || NEW.workspace_id::text,
      true
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_member_role_changed ON public.workspace_members;
CREATE TRIGGER on_workspace_member_role_changed
  AFTER UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_role_change();


-- ============================================================
-- SECTION 9: Extended search_workspace RPC
-- Searches 7 content types: reports, comments, members,
-- presentations, academic_papers, podcasts, debates.
-- ============================================================

DROP FUNCTION IF EXISTS public.search_workspace(uuid, text, int) CASCADE;

CREATE OR REPLACE FUNCTION public.search_workspace(
  p_workspace_id UUID,
  p_query        TEXT,
  p_limit        INT DEFAULT 25
)
RETURNS TABLE (
  result_type  TEXT,
  result_id    TEXT,
  title        TEXT,
  subtitle     TEXT,
  report_id    TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_ts      TEXT := lower(trim(p_query));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  RETURN QUERY

  SELECT 'report'::TEXT, wr.id::TEXT,
    COALESCE(rr.title, rr.query, 'Untitled'),
    COALESCE(rr.depth::TEXT, ''), rr.id::TEXT, NULL::TEXT, wr.added_at
  FROM public.workspace_reports wr
  JOIN public.research_reports  rr ON rr.id = wr.report_id
  WHERE wr.workspace_id = p_workspace_id
    AND (lower(COALESCE(rr.title,'')) LIKE '%'||v_ts||'%'
      OR lower(COALESCE(rr.query,'')) LIKE '%'||v_ts||'%'
      OR lower(COALESCE(rr.executive_summary,'')) LIKE '%'||v_ts||'%')

  UNION ALL

  SELECT 'comment'::TEXT, rc.id::TEXT, left(rc.content,80),
    COALESCE(rr2.title,'Report'), rc.report_id::TEXT, p.avatar_url::TEXT, rc.created_at
  FROM public.report_comments rc
  LEFT JOIN public.research_reports rr2 ON rr2.id = rc.report_id
  LEFT JOIN public.profiles          p  ON p.id   = rc.user_id
  WHERE rc.workspace_id = p_workspace_id
    AND lower(rc.content) LIKE '%'||v_ts||'%'

  UNION ALL

  SELECT 'member'::TEXT, wm2.user_id::TEXT,
    COALESCE(p2.full_name, p2.username, 'Unknown'),
    '@'||COALESCE(p2.username,''), NULL::TEXT, p2.avatar_url::TEXT, wm2.joined_at
  FROM public.workspace_members wm2
  LEFT JOIN public.profiles p2 ON p2.id = wm2.user_id
  WHERE wm2.workspace_id = p_workspace_id
    AND (lower(COALESCE(p2.full_name,''))  LIKE '%'||v_ts||'%'
      OR lower(COALESCE(p2.username,''))   LIKE '%'||v_ts||'%')

  UNION ALL

  SELECT 'presentation'::TEXT, swc.id::TEXT, swc.title,
    COALESCE(swc.subtitle,'Presentation'), swc.report_id::TEXT, NULL::TEXT, swc.shared_at
  FROM public.shared_workspace_content swc
  WHERE swc.workspace_id = p_workspace_id AND swc.content_type = 'presentation'
    AND lower(swc.title) LIKE '%'||v_ts||'%'

  UNION ALL

  SELECT 'academic_paper'::TEXT, swc2.id::TEXT, swc2.title,
    COALESCE(swc2.subtitle,'Academic Paper'), swc2.report_id::TEXT, NULL::TEXT, swc2.shared_at
  FROM public.shared_workspace_content swc2
  WHERE swc2.workspace_id = p_workspace_id AND swc2.content_type = 'academic_paper'
    AND lower(swc2.title) LIKE '%'||v_ts||'%'

  UNION ALL

  SELECT 'podcast'::TEXT, sp.id::TEXT, sp.title,
    COALESCE(sp.topic,'Podcast Episode'), NULL::TEXT, NULL::TEXT, sp.shared_at
  FROM public.shared_podcasts sp
  WHERE sp.workspace_id = p_workspace_id
    AND (lower(sp.title) LIKE '%'||v_ts||'%' OR lower(COALESCE(sp.topic,'')) LIKE '%'||v_ts||'%')

  UNION ALL

  SELECT 'debate'::TEXT, sd.id::TEXT, sd.topic,
    COALESCE(sd.question,'AI Debate'), NULL::TEXT, NULL::TEXT, sd.shared_at
  FROM public.shared_debates sd
  WHERE sd.workspace_id = p_workspace_id
    AND (lower(sd.topic) LIKE '%'||v_ts||'%' OR lower(COALESCE(sd.question,'')) LIKE '%'||v_ts||'%')

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_workspace(UUID, TEXT, INT) TO authenticated;


-- ============================================================
-- SECTION 10: log_pin_activity RPC
-- Logs pin/unpin events to workspace_activity feed.
-- Called from client after toggle_pin_workspace_report.
-- ============================================================

DROP FUNCTION IF EXISTS public.log_pin_activity(uuid, uuid, boolean, text) CASCADE;

CREATE OR REPLACE FUNCTION public.log_pin_activity(
  p_workspace_id UUID,
  p_report_id    UUID,
  p_pinned       BOOLEAN,
  p_report_title TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_workspace_id, auth.uid(),
    CASE WHEN p_pinned THEN 'report_pinned' ELSE 'report_unpinned' END,
    'report', p_report_id::TEXT,
    jsonb_build_object('report_title', p_report_title)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_pin_activity: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_pin_activity(UUID, UUID, BOOLEAN, TEXT) TO authenticated;


-- ============================================================
-- SECTION 11: get_current_user_workspace_role helper
-- ============================================================

DROP FUNCTION IF EXISTS public.get_current_user_workspace_role(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_current_user_workspace_role(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid() LIMIT 1;
  RETURN COALESCE(v_role, 'none');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_workspace_role(UUID) TO authenticated;


-- ============================================================
-- SECTION 12: Shared podcast topic column guard
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shared_podcasts' AND column_name = 'topic'
  ) THEN
    ALTER TABLE public.shared_podcasts ADD COLUMN topic TEXT;
    UPDATE public.shared_podcasts SET topic = description WHERE topic IS NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================================
-- NOTIFY PostgREST
-- ============================================================

NOTIFY pgrst, 'reload schema';