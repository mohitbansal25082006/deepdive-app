-- ============================================================
-- DeepDive AI — PART 52.3 SCHEMA MIGRATION  (AUTHORITATIVE / SELF-CONTAINED)
-- Workspace Activity Feed — correct typed share entries + clickability
-- ============================================================
-- Run this WHOLE file in the Supabase SQL Editor. Idempotent — safe to run
-- multiple times. This file is AUTHORITATIVE: it re-creates every typed
-- shared-content activity trigger from scratch, so it does NOT depend on
-- Part 52.2 §9 having been applied (or applied correctly). Running it fixes
-- the three reported problems regardless of the DB's current trigger state.
--
-- PROBLEMS THIS FIXES
--   1. Sharing a PRESENTATION logged "added a report" instead of a
--      presentation entry, and wasn't clickable.
--   2. Sharing an ACADEMIC PAPER logged a research-report entry instead of a
--      paper entry.
--   3. Sharing / removing a PODCAST, DEBATE, or VOICE DEBATE logged NOTHING.
--   In every case the entry must be correctly typed AND tappable so it opens
--   the resource directly.
--
-- ROOT CAUSE (confirmed from the Part 14/15/16/44 RPC + 52.2 sources)
--   • share_content_to_workspace() (Part 14) inserts its OWN generic
--     'content_shared' activity row, and ALSO upserts shared_workspace_content.
--     The typed trigger that should turn that into 'presentation_shared' /
--     'academic_paper_shared' (52.2 §9) was either not present on this DB or
--     never fired on the ON CONFLICT DO UPDATE path (re-shares) — so the only
--     thing the feed saw was the separately-added report → "added a report".
--   • share_podcast_to_workspace() logs nothing itself; it relies entirely on
--     the typed trigger. If that trigger was missing, podcasts showed nothing.
--   • share_debate_to_workspace() / share_voice_debate_to_workspace() insert
--     their OWN '..._shared' rows whose metadata uses key 'topic' (no 'title'),
--     plus the typed trigger's row. Without the typed trigger + a dedupe that
--     keeps exactly one, results were missing or duplicated.
--
-- FIX STRATEGY
--   §1  Helper log_shared_content_activity() — every typed row is STAMPED with
--       metadata.via='trigger', metadata.title, metadata.topic, and
--       (where available) metadata.report_id, so it is always identifiable,
--       titled, and clickable. resource_type/resource_id carry the kind + the
--       SOURCE content id the client navigates with.
--   §2  Re-create the 4 typed triggers (slides/papers, podcast, debate, voice).
--       The slides/papers trigger ALSO fires on UPDATE so re-shares log too.
--   §3  BEFORE INSERT dedupe — drops the RPCs' own noise rows at the source:
--         • generic 'content_shared' (always)
--         • any '*_shared'/'*_unshared' row NOT stamped via='trigger' when a
--           stamped sibling exists (or will) for the same kind+resource (±60s)
--         • nameless 'member_blocked' / 'member_role_changed' (keep named)
--       It NEVER drops a stamped typed row.
--   §4  Shadow helpers + rebuilt feed RPC & broadcast trigger:
--         • hide 'report_added' when ANY share of the same report_id is
--           coincident (matched within ±120s)
--         • hide block-shadowed member_removed, nameless block/role rows,
--           comment_* (unchanged from 52.2)
--   §5  One-off cleanup of historical noise (content_shared, untyped/titleless
--       share rows that have a stamped sibling, nameless member rows, orphan
--       report_added coincident with a share). entity_id-safe.
--   §6  Reload PostgREST schema cache.
--
-- NOTE ON entity_id: public.workspace_activity.entity_id exists on some installs
-- (added idempotently in Part 10) and not others. Every reference to it in this
-- file is guarded so the migration runs in BOTH cases.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §0  Realtime prerequisites (idempotent; harmless if already set by 52.2).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.workspace_activity REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_activity;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Generic logger for typed shared-content activity.
--     STAMPS metadata.via='trigger' so the dedupe can always tell a typed row
--     apart from an RPC's hand-rolled one. Sets title + topic + report_id.
--     resource_type = kind, resource_id = SOURCE content id (what the client
--     navigates with).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_shared_content_activity(
  p_workspace_id uuid,
  p_actor        uuid,
  p_action       text,
  p_content_type text,
  p_content_id   text,
  p_title        text,
  p_report_id    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_workspace_id,
    p_actor,
    p_action,
    p_content_type,
    p_content_id,
    jsonb_strip_nulls(jsonb_build_object(
      'via',       'trigger',
      'title',     COALESCE(NULLIF(p_title, ''), 'an item'),
      'topic',     COALESCE(NULLIF(p_title, ''), 'an item'),
      'report_id', NULLIF(p_report_id, '')
    ))
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_shared_content_activity: %', SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_shared_content_activity(uuid,uuid,text,text,text,text,text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Typed triggers on the four shared-* tables (authoritative re-create).
-- ─────────────────────────────────────────────────────────────────────────────

-- §2a  shared_workspace_content → presentation_/academic_paper_ shared/unshared.
--      Fires on INSERT, DELETE, AND UPDATE. UPDATE covers the RPC's
--      ON CONFLICT DO UPDATE re-share path (an INSERT-only trigger would log
--      nothing on a re-share, which was part of the "added a report" bug).
CREATE OR REPLACE FUNCTION public.tg_log_shared_workspace_content()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text; suffix text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; suffix := '_unshared';
  ELSE                     r := NEW; suffix := '_shared';   -- INSERT or UPDATE
  END IF;

  IF r.content_type NOT IN ('presentation','academic_paper') THEN
    RETURN NULL;  -- podcasts in this table (if any) are handled by shared_podcasts
  END IF;

  act := r.content_type || suffix;  -- presentation_shared / academic_paper_unshared / …
  PERFORM public.log_shared_content_activity(
    r.workspace_id,
    COALESCE(r.shared_by, auth.uid()),
    act,
    r.content_type,
    r.content_id::text,
    r.title,
    r.report_id::text
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_log_shared_workspace_content: %', SQLERRM; RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_shared_workspace_content_ins ON public.shared_workspace_content;
DROP TRIGGER IF EXISTS log_shared_workspace_content_del ON public.shared_workspace_content;
DROP TRIGGER IF EXISTS log_shared_workspace_content_upd ON public.shared_workspace_content;
CREATE TRIGGER log_shared_workspace_content_ins AFTER INSERT ON public.shared_workspace_content
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_workspace_content();
CREATE TRIGGER log_shared_workspace_content_del AFTER DELETE ON public.shared_workspace_content
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_workspace_content();
-- UPDATE only logs a (re)share when the identifying columns actually change,
-- so counter/metadata-only updates don't spam the feed.
CREATE TRIGGER log_shared_workspace_content_upd AFTER UPDATE ON public.shared_workspace_content
  FOR EACH ROW
  WHEN (
    OLD.content_id IS DISTINCT FROM NEW.content_id
    OR OLD.title    IS DISTINCT FROM NEW.title
    OR OLD.shared_at IS DISTINCT FROM NEW.shared_at
  )
  EXECUTE FUNCTION public.tg_log_shared_workspace_content();


-- §2b  shared_podcasts → podcast_shared / podcast_unshared.
CREATE OR REPLACE FUNCTION public.tg_log_shared_podcast()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; act := 'podcast_unshared';
  ELSE                     r := NEW; act := 'podcast_shared';
  END IF;
  PERFORM public.log_shared_content_activity(
    r.workspace_id, COALESCE(r.shared_by, auth.uid()),
    act, 'podcast', r.podcast_id::text, r.title, r.report_id::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_log_shared_podcast: %', SQLERRM; RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_shared_podcast_ins ON public.shared_podcasts;
DROP TRIGGER IF EXISTS log_shared_podcast_del ON public.shared_podcasts;
CREATE TRIGGER log_shared_podcast_ins AFTER INSERT ON public.shared_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_podcast();
CREATE TRIGGER log_shared_podcast_del AFTER DELETE ON public.shared_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_podcast();


-- §2c  shared_debates → debate_shared / debate_unshared.
CREATE OR REPLACE FUNCTION public.tg_log_shared_debate()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; act := 'debate_unshared';
  ELSE                     r := NEW; act := 'debate_shared';
  END IF;
  PERFORM public.log_shared_content_activity(
    r.workspace_id, COALESCE(r.shared_by, auth.uid()),
    act, 'debate', r.debate_id::text, r.topic, r.report_id::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_log_shared_debate: %', SQLERRM; RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_shared_debate_ins ON public.shared_debates;
DROP TRIGGER IF EXISTS log_shared_debate_del ON public.shared_debates;
CREATE TRIGGER log_shared_debate_ins AFTER INSERT ON public.shared_debates
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_debate();
CREATE TRIGGER log_shared_debate_del AFTER DELETE ON public.shared_debates
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_debate();


-- §2d  shared_voice_debates → voice_debate_shared / voice_debate_unshared.
--      (shared_voice_debates has no report_id column → no report_id passed.)
CREATE OR REPLACE FUNCTION public.tg_log_shared_voice_debate()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; act := 'voice_debate_unshared';
  ELSE                     r := NEW; act := 'voice_debate_shared';
  END IF;
  PERFORM public.log_shared_content_activity(
    r.workspace_id, COALESCE(r.shared_by, auth.uid()),
    act, 'voice_debate', r.voice_debate_id::text, r.topic);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_log_shared_voice_debate: %', SQLERRM; RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_shared_voice_debate_ins ON public.shared_voice_debates;
DROP TRIGGER IF EXISTS log_shared_voice_debate_del ON public.shared_voice_debates;
CREATE TRIGGER log_shared_voice_debate_ins AFTER INSERT ON public.shared_voice_debates
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_voice_debate();
CREATE TRIGGER log_shared_voice_debate_del AFTER DELETE ON public.shared_voice_debates
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_voice_debate();


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  BEFORE INSERT dedupe — drop RPC noise at the source, keep the typed row.
--
--   Drops:
--     (A) generic 'content_shared' (Part 14 RPC's own row) — always.
--     (B) any '*_shared' / '*_unshared' row that is NOT stamped via='trigger'
--         (i.e. an RPC's hand-rolled debate_shared / voice_debate_shared, which
--         carries 'topic' but not via='trigger') when a stamped sibling exists
--         for the same kind+resource within ±60s. A stamped sibling arriving
--         later also cleans up an earlier RPC row.
--     (C) nameless 'member_blocked' — keep the client's NAMED row.
--     (D) nameless 'member_role_changed' — keep the NAMED row.
--   NEVER drops a row stamped via='trigger'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dedupe_workspace_activity()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target     text;
  v_is_trigger boolean := COALESCE(NEW.metadata->>'via','') = 'trigger';
BEGIN
  -- ── A) generic content_shared from the Part 14 RPC → always drop. ──────────
  IF NEW.action = 'content_shared' THEN
    RETURN NULL;
  END IF;

  -- ── B) share/unshare rows: keep the typed (stamped) one, drop RPC rows. ────
  IF NEW.action LIKE '%\_shared' ESCAPE '\'
     OR NEW.action LIKE '%\_unshared' ESCAPE '\' THEN

    IF v_is_trigger THEN
      -- A stamped typed row is arriving → remove any un-stamped RPC sibling for
      -- the same action + source resource inserted in the last 60s.
      DELETE FROM public.workspace_activity wa
      WHERE wa.workspace_id = NEW.workspace_id
        AND wa.action       = NEW.action
        AND COALESCE(wa.resource_id,'') = COALESCE(NEW.resource_id,'')
        AND COALESCE(wa.metadata->>'via','') <> 'trigger'
        AND wa.created_at > now() - interval '60 seconds';
      RETURN NEW;  -- keep the typed row
    ELSE
      -- An un-stamped RPC row is arriving → if a stamped typed sibling already
      -- exists for the same action + resource, drop this RPC row.
      IF EXISTS (
        SELECT 1 FROM public.workspace_activity wa
        WHERE wa.workspace_id = NEW.workspace_id
          AND wa.action       = NEW.action
          AND COALESCE(wa.resource_id,'') = COALESCE(NEW.resource_id,'')
          AND COALESCE(wa.metadata->>'via','') = 'trigger'
          AND wa.created_at > now() - interval '60 seconds'
      ) THEN
        RETURN NULL;
      END IF;
      -- Otherwise allow it for now; the stamped row (if any) will clean it up
      -- when it lands. (Triggers are AFTER INSERT on the shared tables and fire
      -- within the same statement, so the stamped row normally arrives first.)
      RETURN NEW;
    END IF;
  END IF;

  -- ── C) member_blocked: keep the NAMED row, drop the nameless RPC row. ──────
  IF NEW.action = 'member_blocked' THEN
    IF COALESCE(NULLIF(NEW.metadata->>'blocked_name',''), NULL) IS NULL THEN
      RETURN NULL;  -- nameless → block_workspace_member()'s own row → drop
    END IF;
    v_target := COALESCE(NEW.metadata->>'blocked_user_id',
                         NEW.metadata->>'target_user_id',
                         NEW.resource_id);
    IF v_target IS NOT NULL THEN
      -- entity_id intentionally NOT referenced (column may not exist); the
      -- nameless RPC row stores the target in resource_id / metadata.
      DELETE FROM public.workspace_activity wa
      WHERE wa.workspace_id = NEW.workspace_id
        AND wa.action       = 'member_blocked'
        AND wa.created_at > now() - interval '60 seconds'
        AND COALESCE(wa.metadata->>'blocked_name','') = ''
        AND COALESCE(wa.metadata->>'blocked_user_id',
                     wa.metadata->>'target_user_id',
                     wa.resource_id) = v_target;
    END IF;
    RETURN NEW;
  END IF;

  -- ── D) member_role_changed: keep the NAMED row, drop the nameless RPC row. ─
  IF NEW.action = 'member_role_changed' THEN
    IF COALESCE(NULLIF(NEW.metadata->>'target_name',''), NULL) IS NULL THEN
      RETURN NULL;  -- nameless RPC row → drop
    END IF;
    v_target := COALESCE(NEW.metadata->>'target_user_id', NEW.resource_id);
    IF v_target IS NOT NULL THEN
      DELETE FROM public.workspace_activity wa
      WHERE wa.workspace_id = NEW.workspace_id
        AND wa.action       = 'member_role_changed'
        AND wa.created_at > now() - interval '60 seconds'
        AND COALESCE(wa.metadata->>'target_name','') = ''
        AND COALESCE(wa.metadata->>'target_user_id', wa.resource_id) = v_target;
    END IF;
    RETURN NEW;
  END IF;

  -- ── Original 52.2 behaviour: 30s identical-row guard for member events. ────
  IF NEW.action IN ('member_joined','member_left','member_unblocked','member_removed') THEN
    IF EXISTS (
      SELECT 1 FROM public.workspace_activity wa
      WHERE wa.workspace_id = NEW.workspace_id
        AND wa.action       = NEW.action
        AND COALESCE(wa.resource_id,'') = COALESCE(NEW.resource_id,'')
        AND wa.created_at > now() - interval '30 seconds'
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_dedupe_workspace_activity ON public.workspace_activity;
CREATE TRIGGER zz_dedupe_workspace_activity
  BEFORE INSERT ON public.workspace_activity
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_workspace_activity();


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Shadow helpers + rebuilt feed RPC & broadcast trigger.
-- ─────────────────────────────────────────────────────────────────────────────

-- §4a  Block-shadow: hide member_removed that coincides with a block.
CREATE OR REPLACE FUNCTION public.activity_is_block_shadowed(
  p_workspace_id uuid, p_action text, p_metadata jsonb, p_created_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_target text;
BEGIN
  IF p_action <> 'member_removed' THEN RETURN false; END IF;
  v_target := COALESCE(p_metadata->>'removed_user_id', p_metadata->>'target_user_id');
  IF v_target IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_activity b
    WHERE b.workspace_id = p_workspace_id
      AND b.action       = 'member_blocked'
      AND COALESCE(b.metadata->>'blocked_user_id', b.metadata->>'target_user_id') = v_target
      AND b.created_at BETWEEN p_created_at - interval '15 seconds'
                           AND p_created_at + interval '15 seconds'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_block_shadowed(uuid, text, jsonb, timestamptz) TO authenticated;

-- §4b  Nameless-dup: hide nameless block/role rows (historical-row filter).
CREATE OR REPLACE FUNCTION public.activity_is_nameless_dup(p_action text, p_metadata jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (p_action = 'member_blocked'      AND COALESCE(p_metadata->>'blocked_name','') = '')
    OR
    (p_action = 'member_role_changed' AND COALESCE(p_metadata->>'target_name','')  = '');
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_nameless_dup(text, jsonb) TO authenticated;

-- §4c  Untyped-share: hide generic content_shared and any un-stamped share row
--      (defensive — these are dropped/cleaned, but old rows may remain until §5
--      cleanup runs; this keeps the live feed clean meanwhile).
CREATE OR REPLACE FUNCTION public.activity_is_untyped_share(p_action text, p_metadata jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    p_action = 'content_shared'
    OR (
      (p_action LIKE '%\_shared' ESCAPE '\' OR p_action LIKE '%\_unshared' ESCAPE '\')
      AND COALESCE(p_metadata->>'via','') <> 'trigger'
      AND p_action NOT IN ('access_request_approved')  -- safety: never match non-content actions
    );
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_untyped_share(text, jsonb) TO authenticated;

-- §4d  Report-share-shadow: hide 'report_added' when ANY share of the SAME
--      report_id is coincident (±120s). Covers every typed share kind that
--      carries report_id (presentation, academic_paper, podcast, debate).
CREATE OR REPLACE FUNCTION public.activity_is_report_share_shadowed(
  p_workspace_id uuid, p_action text, p_resource_id text, p_metadata jsonb, p_created_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_report_id text;
BEGIN
  IF p_action <> 'report_added' THEN RETURN false; END IF;
  v_report_id := COALESCE(p_metadata->>'report_id', p_resource_id);
  IF v_report_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_activity s
    WHERE s.workspace_id = p_workspace_id
      AND s.action IN ('presentation_shared','academic_paper_shared',
                       'podcast_shared','debate_shared','content_shared')
      AND COALESCE(s.metadata->>'report_id','') = v_report_id
      AND s.created_at BETWEEN p_created_at - interval '120 seconds'
                           AND p_created_at + interval '120 seconds'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_report_share_shadowed(uuid, text, text, jsonb, timestamptz) TO authenticated;


-- §4e  Rebuild the feed RPC with all filters.
DROP FUNCTION IF EXISTS public.get_workspace_activity_feed(uuid, int) CASCADE;
CREATE OR REPLACE FUNCTION public.get_workspace_activity_feed(
  p_workspace_id uuid,
  p_limit        int DEFAULT 40
)
RETURNS TABLE (
  id uuid, workspace_id uuid, user_id uuid, action text,
  resource_type text, resource_id text, metadata jsonb, created_at timestamptz,
  actor_name text, actor_username text, actor_avatar text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_user_id
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT wa.id, wa.workspace_id, wa.user_id, wa.action::text,
         wa.resource_type, wa.resource_id, COALESCE(wa.metadata,'{}'::jsonb),
         wa.created_at, p.full_name, p.username, p.avatar_url
  FROM public.workspace_activity wa
  LEFT JOIN public.profiles p ON p.id = wa.user_id
  WHERE wa.workspace_id = p_workspace_id
    AND wa.action NOT IN ('comment_added','comment_resolved','comment_reply_added')
    AND NOT public.activity_is_block_shadowed(wa.workspace_id, wa.action::text, wa.metadata, wa.created_at)
    AND NOT public.activity_is_nameless_dup(wa.action::text, wa.metadata)
    AND NOT public.activity_is_untyped_share(wa.action::text, wa.metadata)
    AND NOT public.activity_is_report_share_shadowed(wa.workspace_id, wa.action::text, wa.resource_id, wa.metadata, wa.created_at)
  ORDER BY wa.created_at DESC
  LIMIT p_limit;
EXCEPTION WHEN OTHERS THEN RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(uuid, int) TO authenticated;


-- §4f  Rebuild the broadcast trigger with the same filters.
CREATE OR REPLACE FUNCTION public.broadcast_workspace_activity_insert()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_actor_name text; v_actor_username text; v_actor_avatar text;
BEGIN
  IF NEW.action IN ('comment_added','comment_resolved','comment_reply_added') THEN
    RETURN NULL;
  END IF;
  IF public.activity_is_block_shadowed(NEW.workspace_id, NEW.action::text, NEW.metadata, NEW.created_at) THEN
    RETURN NULL;
  END IF;
  IF public.activity_is_nameless_dup(NEW.action::text, NEW.metadata) THEN
    RETURN NULL;
  END IF;
  IF public.activity_is_untyped_share(NEW.action::text, NEW.metadata) THEN
    RETURN NULL;
  END IF;
  IF public.activity_is_report_share_shadowed(NEW.workspace_id, NEW.action::text, NEW.resource_id, NEW.metadata, NEW.created_at) THEN
    RETURN NULL;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT pr.full_name, pr.username, pr.avatar_url
      INTO v_actor_name, v_actor_username, v_actor_avatar
      FROM public.profiles pr WHERE pr.id = NEW.user_id LIMIT 1;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id, 'workspace_id', NEW.workspace_id, 'user_id', NEW.user_id,
      'action', NEW.action, 'resource_type', NEW.resource_type,
      'resource_id', NEW.resource_id, 'metadata', COALESCE(NEW.metadata,'{}'::jsonb),
      'created_at', NEW.created_at, 'actor_name', v_actor_name,
      'actor_username', v_actor_username, 'actor_avatar', v_actor_avatar
    ),
    'activity_insert',
    'workspace_activity:' || NEW.workspace_id::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_activity_insert ON public.workspace_activity;
CREATE TRIGGER on_workspace_activity_insert
  AFTER INSERT ON public.workspace_activity
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_activity_insert();


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  One-off cleanup of pre-existing noise so the feed looks correct
--     immediately (not only for new actions).
--
--   5a) Delete every generic 'content_shared' row.
--   5b) Delete every un-stamped '*_shared'/'*_unshared' row that has a stamped
--       (via='trigger') sibling for the same workspace + action + resource.
--   5c) Delete nameless 'member_blocked' with a named sibling.            (entity_id-safe)
--   5d) Delete nameless 'member_role_changed' with a named/approved sibling.(entity_id-safe)
--   5e) Delete orphan 'report_added' coincident (±120s) with any share of the
--       same report_id (the share entry replaces it).
--
--   NOTE: workspace_activity.entity_id may or may not exist. §5c/§5d run inside
--   a DO block that detects the column and builds the matching expression with
--   or without it. The other deletes don't reference entity_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a)
DELETE FROM public.workspace_activity WHERE action = 'content_shared';

-- 5b) Drop un-stamped share rows that have a stamped typed sibling.
DELETE FROM public.workspace_activity bare
WHERE (bare.action LIKE '%\_shared' ESCAPE '\' OR bare.action LIKE '%\_unshared' ESCAPE '\')
  AND COALESCE(bare.metadata->>'via','') <> 'trigger'
  AND EXISTS (
    SELECT 1 FROM public.workspace_activity typed
    WHERE typed.workspace_id = bare.workspace_id
      AND typed.action       = bare.action
      AND COALESCE(typed.resource_id,'') = COALESCE(bare.resource_id,'')
      AND COALESCE(typed.metadata->>'via','') = 'trigger'
  );

-- 5c + 5d) entity_id-aware member-row cleanup.
DO $cleanup$
DECLARE
  v_has_entity_id boolean;
  v_bare_target   text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workspace_activity'
      AND column_name  = 'entity_id'
  ) INTO v_has_entity_id;

  -- 5c) nameless member_blocked with a named sibling for the same target.
  IF v_has_entity_id THEN
    v_bare_target := $$COALESCE(bare.metadata->>'blocked_user_id', bare.metadata->>'target_user_id', bare.entity_id::text, bare.resource_id)$$;
  ELSE
    v_bare_target := $$COALESCE(bare.metadata->>'blocked_user_id', bare.metadata->>'target_user_id', bare.resource_id)$$;
  END IF;

  EXECUTE format($q$
    DELETE FROM public.workspace_activity bare
    WHERE bare.action = 'member_blocked'
      AND COALESCE(bare.metadata->>'blocked_name','') = ''
      AND EXISTS (
        SELECT 1 FROM public.workspace_activity named
        WHERE named.action = 'member_blocked'
          AND named.workspace_id = bare.workspace_id
          AND COALESCE(named.metadata->>'blocked_name','') <> ''
          AND COALESCE(named.metadata->>'blocked_user_id', named.metadata->>'target_user_id') = %s
      )
  $q$, v_bare_target);

  -- 5d) nameless member_role_changed with a named role sibling OR an
  --     access_request_approved for the same target nearby.
  IF v_has_entity_id THEN
    v_bare_target := $$COALESCE(bare.metadata->>'target_user_id', bare.entity_id::text, bare.resource_id)$$;
  ELSE
    v_bare_target := $$COALESCE(bare.metadata->>'target_user_id', bare.resource_id)$$;
  END IF;

  EXECUTE format($q$
    DELETE FROM public.workspace_activity bare
    WHERE bare.action = 'member_role_changed'
      AND COALESCE(bare.metadata->>'target_name','') = ''
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_activity named
          WHERE named.action = 'member_role_changed'
            AND named.workspace_id = bare.workspace_id
            AND COALESCE(named.metadata->>'target_name','') <> ''
            AND COALESCE(named.metadata->>'target_user_id', named.resource_id) = %1$s
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_activity appr
          WHERE appr.action = 'access_request_approved'
            AND appr.workspace_id = bare.workspace_id
            AND COALESCE(appr.metadata->>'target_user_id', appr.resource_id) = %1$s
            AND appr.created_at BETWEEN bare.created_at - interval '5 minutes'
                                    AND bare.created_at + interval '5 minutes'
        )
      )
  $q$, v_bare_target);
END
$cleanup$;

-- 5e) Drop orphan report_added rows coincident with any share of the same report.
DELETE FROM public.workspace_activity ra
WHERE ra.action = 'report_added'
  AND EXISTS (
    SELECT 1 FROM public.workspace_activity s
    WHERE s.workspace_id = ra.workspace_id
      AND s.action IN ('presentation_shared','academic_paper_shared',
                       'podcast_shared','debate_shared')
      AND COALESCE(s.metadata->>'via','') = 'trigger'
      AND COALESCE(s.metadata->>'report_id','') =
          COALESCE(ra.metadata->>'report_id', ra.resource_id, '')
      AND COALESCE(s.metadata->>'report_id','') <> ''
      AND s.created_at BETWEEN ra.created_at - interval '120 seconds'
                           AND ra.created_at + interval '120 seconds'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  Reload PostgREST schema cache.
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ============================================================
-- VERIFY (optional) — confirm the typed triggers exist:
--   SELECT tgname, tgrelid::regclass
--   FROM pg_trigger
--   WHERE tgname LIKE 'log_shared%'
--   ORDER BY 2,1;
--   → expect rows on shared_workspace_content (ins/del/upd), shared_podcasts,
--     shared_debates, shared_voice_debates.
-- ============================================================
-- END OF PART 52.3 SCHEMA MIGRATION (AUTHORITATIVE)
-- ============================================================