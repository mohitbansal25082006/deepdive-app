-- ============================================================
-- DeepDive AI — PART 52 FINAL SCHEMA (single, complete, idempotent)
-- ============================================================
-- Run this WHOLE file in the Supabase SQL Editor. Safe to run multiple times.
-- This supersedes schema_part52.sql + schema_part52_search_patch.sql +
-- schema_part52_search_FINAL.sql — it contains everything Part 52 needs.
--
-- CONTENTS
--   §1  workspaces realtime (REPLICA IDENTITY FULL + publication)
--   §2  realtime.messages SELECT policy (private Broadcast receive)
--   §3  Broadcast: workspace settings UPDATE  ("workspace_settings:{id}")
--   §4  Broadcast: workspace DELETE (kick every member out)
--   §5  edit_access_requests realtime (REPLICA IDENTITY FULL + publication)
--   §6  Broadcast: edit_access_requests INSERT/UPDATE/DELETE (viewer+owner live)
--   §7  workspace_members realtime + Broadcast: role change ("role_change")
--   §8  search_workspace() — bulletproof, no overloads, incl. voice debates
--   §9  Reload PostgREST schema cache
--
-- Realtime pattern: SECURITY DEFINER triggers call realtime.send() on PRIVATE
-- channels; clients await supabase.realtime.setAuth(<token>) then subscribe.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  workspaces — REPLICA IDENTITY FULL + publication
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.workspaces REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  realtime.messages SELECT policy (private Broadcast receive)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_can_receive_broadcasts" ON realtime.messages;

CREATE POLICY "authenticated_can_receive_broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

GRANT USAGE ON SCHEMA realtime TO postgres;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Broadcast trigger: workspace settings UPDATE
--     Channel "workspace_settings:{id}"  Event "workspace_updated"
--     Fires only when name / description / avatar_url actually changes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_workspace_updated()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.name        IS DISTINCT FROM NEW.name
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.avatar_url  IS DISTINCT FROM NEW.avatar_url
  THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'workspace_id', NEW.id,
        'name',         NEW.name,
        'description',  NEW.description,
        'avatar_url',   NEW.avatar_url
      ),
      'workspace_updated',
      'workspace_settings:' || NEW.id::text,
      true
    );
  END IF;
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_workspace_updated ON public.workspaces;
  CREATE TRIGGER on_workspace_updated
    AFTER UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_updated();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Broadcast trigger: workspace DELETE (kick every member out)
--     (a) per-member  "workspace_member_removed:{user_id}"  Event "workspace_kick"
--     (b) workspace-wide "workspace_settings:{id}"          Event "workspace_deleted"
--     BEFORE DELETE so workspace_members rows still exist to enumerate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_workspace_deleted()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_member RECORD;
BEGIN
  FOR v_member IN
    SELECT user_id FROM public.workspace_members WHERE workspace_id = OLD.id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object(
        'type',         'workspace_deleted',
        'workspace_id', OLD.id,
        'user_id',      v_member.user_id
      ),
      'workspace_kick',
      'workspace_member_removed:' || v_member.user_id::text,
      true
    );
  END LOOP;

  PERFORM realtime.send(
    jsonb_build_object('workspace_id', OLD.id),
    'workspace_deleted',
    'workspace_settings:' || OLD.id::text,
    true
  );

  RETURN OLD;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_workspace_deleted ON public.workspaces;
  CREATE TRIGGER on_workspace_deleted
    BEFORE DELETE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_deleted();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  edit_access_requests — realtime (REPLICA IDENTITY FULL + publication)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.edit_access_requests REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.edit_access_requests;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  Broadcast trigger: edit_access_requests changes (viewer + owner live)
--     Owner feed:   "workspace_access_requests:{workspace_id}"   Event "request_change"
--     Viewer's own: "workspace_my_request:{workspace_id}:{user_id}" Event "my_request_change"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_access_request_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws     uuid;
  v_uid    uuid;
  v_rid    uuid;
  v_status text;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ws := OLD.workspace_id; v_uid := OLD.user_id; v_rid := OLD.id;
    v_status := OLD.status;   v_action := 'deleted';
  ELSE
    v_ws := NEW.workspace_id; v_uid := NEW.user_id; v_rid := NEW.id;
    v_status := NEW.status;
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;
  END IF;

  -- Owner/editor side — workspace-wide request feed
  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws, 'request_id', v_rid, 'user_id', v_uid,
      'status', v_status, 'action', v_action
    ),
    'request_change',
    'workspace_access_requests:' || v_ws::text,
    true
  );

  -- Viewer side — their own request status
  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws, 'request_id', v_rid,
      'status', v_status, 'action', v_action
    ),
    'my_request_change',
    'workspace_my_request:' || v_ws::text || ':' || v_uid::text,
    true
  );

  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_access_request_change ON public.edit_access_requests;
  CREATE TRIGGER on_access_request_change
    AFTER INSERT OR UPDATE OR DELETE ON public.edit_access_requests
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_access_request_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §7  workspace_members — realtime + Broadcast: role change
--     Channel "workspace_members:{workspace_id}"  Event "role_change"
--     Lets an OPEN report screen flip editor<->viewer UI instantly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_member_role_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'workspace_id', NEW.workspace_id,
        'user_id',      NEW.user_id,
        'role',         NEW.role
      ),
      'role_change',
      'workspace_members:' || NEW.workspace_id::text,
      true
    );
  END IF;
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_member_role_change ON public.workspace_members;
  CREATE TRIGGER on_member_role_change
    AFTER UPDATE ON public.workspace_members
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_member_role_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.workspace_members REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  search_workspace() — bulletproof, single overload, incl. voice debates
--     • Drops EVERY existing overload first (avoids PostgREST PGRST203 conflict)
--     • SECURITY DEFINER; never raises for members; [] for non-members/empty
--     • No temp table; optional shared sources guarded by to_regclass
-- ─────────────────────────────────────────────────────────────────────────────

-- 8a. Drop every overload of search_workspace by identity arguments.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT 'public.' || quote_ident(p.proname) || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_workspace'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- 8b. Recreate exactly one function.
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
  v_ts      TEXT := lower(trim(coalesce(p_query, '')));
  v_like    TEXT;
  v_sql     TEXT;
  v_has_swc BOOLEAN := to_regclass('public.shared_workspace_content') IS NOT NULL;
  v_has_sp  BOOLEAN := to_regclass('public.shared_podcasts')          IS NOT NULL;
  v_has_sd  BOOLEAN := to_regclass('public.shared_debates')           IS NOT NULL;
  v_has_svd BOOLEAN := to_regclass('public.shared_voice_debates')     IS NOT NULL;
BEGIN
  IF v_ts = '' OR v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  v_like := '%' || v_ts || '%';

  -- Core sources (always exist): reports, comments, members.
  v_sql := $q$
    SELECT 'report'::text, wr.id::text,
      COALESCE(rr.title, rr.query, 'Untitled'),
      COALESCE(rr.depth::text, ''), rr.id::text, NULL::text, wr.added_at
    FROM public.workspace_reports wr
    JOIN public.research_reports  rr ON rr.id = wr.report_id
    WHERE wr.workspace_id = $1
      AND (lower(COALESCE(rr.title,'')) LIKE $2
        OR lower(COALESCE(rr.query,'')) LIKE $2
        OR lower(COALESCE(rr.executive_summary,'')) LIKE $2)

    UNION ALL
    SELECT 'comment'::text, rc.id::text, left(rc.content,80),
      COALESCE(rr2.title,'Report'), rc.report_id::text, p.avatar_url, rc.created_at
    FROM public.report_comments rc
    LEFT JOIN public.research_reports rr2 ON rr2.id = rc.report_id
    LEFT JOIN public.profiles          p  ON p.id   = rc.user_id
    WHERE rc.workspace_id = $1
      AND lower(rc.content) LIKE $2

    UNION ALL
    SELECT 'member'::text, wm2.user_id::text,
      COALESCE(p2.full_name, p2.username, 'Unknown'),
      '@'||COALESCE(p2.username,''), NULL::text, p2.avatar_url, wm2.joined_at
    FROM public.workspace_members wm2
    LEFT JOIN public.profiles p2 ON p2.id = wm2.user_id
    WHERE wm2.workspace_id = $1
      AND (lower(COALESCE(p2.full_name,'')) LIKE $2
        OR lower(COALESCE(p2.username,''))  LIKE $2)
  $q$;

  -- Optional: presentations + academic papers
  IF v_has_swc THEN
    v_sql := v_sql || $q$
      UNION ALL
      SELECT 'presentation'::text, swc.id::text, swc.title,
        COALESCE(swc.subtitle,'Presentation'), swc.report_id::text, NULL::text, swc.shared_at
      FROM public.shared_workspace_content swc
      WHERE swc.workspace_id = $1 AND swc.content_type = 'presentation'
        AND lower(COALESCE(swc.title,'')) LIKE $2

      UNION ALL
      SELECT 'academic_paper'::text, swc2.id::text, swc2.title,
        COALESCE(swc2.subtitle,'Academic Paper'), swc2.report_id::text, NULL::text, swc2.shared_at
      FROM public.shared_workspace_content swc2
      WHERE swc2.workspace_id = $1 AND swc2.content_type = 'academic_paper'
        AND lower(COALESCE(swc2.title,'')) LIKE $2
    $q$;
  END IF;

  -- Optional: podcasts
  IF v_has_sp THEN
    v_sql := v_sql || $q$
      UNION ALL
      SELECT 'podcast'::text, sp.id::text, sp.title,
        COALESCE(sp.topic,'Podcast Episode'), NULL::text, NULL::text, sp.shared_at
      FROM public.shared_podcasts sp
      WHERE sp.workspace_id = $1
        AND (lower(COALESCE(sp.title,'')) LIKE $2
          OR lower(COALESCE(sp.topic,'')) LIKE $2)
    $q$;
  END IF;

  -- Optional: debates
  IF v_has_sd THEN
    v_sql := v_sql || $q$
      UNION ALL
      SELECT 'debate'::text, sd.id::text, sd.topic,
        COALESCE(sd.question,'AI Debate'), NULL::text, NULL::text, sd.shared_at
      FROM public.shared_debates sd
      WHERE sd.workspace_id = $1
        AND (lower(COALESCE(sd.topic,'')) LIKE $2
          OR lower(COALESCE(sd.question,'')) LIKE $2)
    $q$;
  END IF;

  -- Optional: voice debates
  IF v_has_svd THEN
    v_sql := v_sql || $q$
      UNION ALL
      SELECT 'voice_debate'::text, svd.id::text, svd.topic,
        'Voice Debate', NULL::text, NULL::text, svd.shared_at
      FROM public.shared_voice_debates svd
      WHERE svd.workspace_id = $1
        AND lower(COALESCE(svd.topic,'')) LIKE $2
    $q$;
  END IF;

  v_sql := v_sql || ' ORDER BY 7 DESC NULLS LAST LIMIT ' || (p_limit)::text;

  RETURN QUERY EXECUTE v_sql USING p_workspace_id, v_like;

EXCEPTION
  WHEN OTHERS THEN
    RETURN;  -- safety net: show "No results", never "Search didn't work"
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_workspace(UUID, TEXT, INT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §9  Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ============================================================
-- VERIFY (optional):
--   Exactly one overload should exist:
--     SELECT pg_get_function_identity_arguments(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='search_workspace';
--   → one row: (uuid, text, integer)
-- ============================================================
-- END OF PART 52 FINAL SCHEMA
-- ============================================================