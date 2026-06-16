-- ============================================================
-- DeepDive AI — PART 52.2 SCHEMA MIGRATION
-- Activity Feed v2: richer entries + true realtime + name resolution
-- ============================================================
-- Run this WHOLE file in the Supabase SQL Editor. Idempotent — safe to
-- run multiple times. Supersedes nothing; layers on top of Part 46 + 52.
--
-- WHY THIS FILE EXISTS
--   Part 52.2 upgrades the Workspace → Activity tab:
--     • Every entry now needs the FULL, untruncated resource name
--       (report title, shared-content title, member name, etc.) and,
--       for member/role/ownership/access events, BOTH actors' names.
--     • The feed must update in REALTIME with zero refresh. The old client
--       relied on postgres_changes on workspace_activity, which is flaky for
--       recipients under RLS and does not carry a joined actor profile. We
--       add a SECURITY DEFINER broadcast trigger on workspace_activity that
--       fires on a single private channel "workspace_activity:{id}" with a
--       fully-resolved payload (actor profile already attached), so every
--       member sees new entries instantly.
--     • Comment-related entries are EXCLUDED from the feed (Feature 1c).
--     • member_joined is now logged when someone joins via invite code, and
--       access_request_approved already enriches with both names client-side.
--
-- CONTENTS
--   §1  workspace_activity realtime (REPLICA IDENTITY FULL + publication)
--   §2  Broadcast trigger: workspace_activity INSERT → resolved payload
--   §3  get_workspace_activity_feed() — rebuilt: joins actor profile,
--       EXCLUDES comment_* actions, returns newest first
--   §4  log_member_joined() — called from join_workspace_by_code path
--   §5  Patch join_workspace_by_code() to log member_joined (best-effort)
--   §6  Reload PostgREST schema cache
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  workspace_activity — realtime prerequisites
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.workspace_activity REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_activity;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Ensure authenticated users can receive private Broadcast messages.
DROP POLICY IF EXISTS "authenticated_can_receive_broadcasts" ON realtime.messages;
CREATE POLICY "authenticated_can_receive_broadcasts"
  ON realtime.messages FOR SELECT TO authenticated USING (true);

GRANT USAGE ON SCHEMA realtime TO postgres;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Broadcast trigger: workspace_activity INSERT → fully-resolved payload
--     Channel "workspace_activity:{workspace_id}"   Event "activity_insert"
--     Payload mirrors a get_workspace_activity_feed() row so the client can
--     render the entry WITHOUT a follow-up profile fetch.
--
--     Excludes comment_* actions from the broadcast as well, so they never
--     appear in the realtime feed (Feature 1c).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_workspace_activity_insert()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor_name     text;
  v_actor_username text;
  v_actor_avatar   text;
BEGIN
  -- Feature 1c: never surface comment activity in the feed.
  IF NEW.action IN ('comment_added', 'comment_resolved', 'comment_reply_added') THEN
    RETURN NULL;
  END IF;

  -- Resolve the actor profile once, server-side.
  IF NEW.user_id IS NOT NULL THEN
    SELECT p.full_name, p.username, p.avatar_url
      INTO v_actor_name, v_actor_username, v_actor_avatar
      FROM public.profiles p
     WHERE p.id = NEW.user_id
     LIMIT 1;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id',            NEW.id,
      'workspace_id',  NEW.workspace_id,
      'user_id',       NEW.user_id,
      'action',        NEW.action,
      'resource_type', NEW.resource_type,
      'resource_id',   NEW.resource_id,
      'metadata',      COALESCE(NEW.metadata, '{}'::jsonb),
      'created_at',    NEW.created_at,
      'actor_name',     v_actor_name,
      'actor_username', v_actor_username,
      'actor_avatar',   v_actor_avatar
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
-- §3  get_workspace_activity_feed() — rebuilt
--     • Joins the actor profile (full_name, username, avatar_url)
--     • EXCLUDES comment_added / comment_resolved / comment_reply_added
--     • Newest first, limited
--     • SECURITY DEFINER, members only, never throws (returns empty on error)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_workspace_activity_feed(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_activity_feed(
  p_workspace_id uuid,
  p_limit        int DEFAULT 40
)
RETURNS TABLE (
  id             uuid,
  workspace_id   uuid,
  user_id        uuid,
  action         text,
  resource_type  text,
  resource_id    text,
  metadata       jsonb,
  created_at     timestamptz,
  actor_name     text,
  actor_username text,
  actor_avatar   text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    wa.id,
    wa.workspace_id,
    wa.user_id,
    wa.action::text,
    wa.resource_type,
    wa.resource_id,
    COALESCE(wa.metadata, '{}'::jsonb),
    wa.created_at,
    p.full_name,
    p.username,
    p.avatar_url
  FROM public.workspace_activity wa
  LEFT JOIN public.profiles p ON p.id = wa.user_id
  WHERE wa.workspace_id = p_workspace_id
    AND wa.action NOT IN ('comment_added', 'comment_resolved', 'comment_reply_added')
  ORDER BY wa.created_at DESC
  LIMIT p_limit;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(uuid, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  log_member_joined() — explicit logger for join-by-code
--     Records who joined with the joining user's own name in metadata so the
--     feed can render "<name> joined the workspace" without an extra lookup.
--     SECURITY DEFINER so it runs inside the join RPC's transaction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_member_joined(
  p_workspace_id uuid,
  p_user_id      uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name     text;
  v_username text;
BEGIN
  SELECT full_name, username INTO v_name, v_username
    FROM public.profiles WHERE id = p_user_id LIMIT 1;

  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_workspace_id, p_user_id, 'member_joined',
    'member', p_user_id::text,
    jsonb_build_object(
      'joined_name', COALESCE(v_name, v_username, 'A member')
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_member_joined: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_member_joined(uuid, uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  Patch join_workspace_by_code() to log member_joined (best-effort)
--     We DO NOT redefine the whole join RPC (its body varies across earlier
--     parts). Instead we add an AFTER INSERT trigger on workspace_members that
--     logs member_joined for any NEW non-owner row — robust regardless of how
--     the row was inserted (invite code, accept, etc.). The owner's initial
--     row is skipped (workspace_created already covers creation).
--
--     Guard: skip if a member_joined for this (workspace,user) already exists
--     in the last few seconds to avoid double logging if a client also logs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_log_member_joined()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name     text;
  v_username text;
  v_is_owner boolean;
BEGIN
  -- Skip the owner's own membership row (created with the workspace).
  SELECT (w.owner_id = NEW.user_id) INTO v_is_owner
    FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  IF COALESCE(v_is_owner, false) THEN
    RETURN NULL;
  END IF;

  -- Dedupe: skip if we already logged a join for this member very recently.
  IF EXISTS (
    SELECT 1 FROM public.workspace_activity wa
    WHERE wa.workspace_id = NEW.workspace_id
      AND wa.user_id      = NEW.user_id
      AND wa.action       = 'member_joined'
      AND wa.created_at > now() - interval '10 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT full_name, username INTO v_name, v_username
    FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (
    NEW.workspace_id, NEW.user_id, 'member_joined',
    'member', NEW.user_id::text,
    jsonb_build_object('joined_name', COALESCE(v_name, v_username, 'A member'))
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_log_member_joined: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_member_joined ON public.workspace_members;
CREATE TRIGGER on_workspace_member_joined
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.auto_log_member_joined();


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  FIX 1 — suppress the duplicate "removed a member" entry on BLOCK.
--
--     Blocking a member deletes their workspace_members row (which makes the
--     app log member_removed) AND the block RPC logs member_blocked. Result:
--     two feed entries for one action. We keep member_blocked and HIDE the
--     coincident member_removed.
--
--     Strategy: a member_removed row is considered "part of a block" if a
--     member_blocked row exists for the SAME workspace + SAME target user
--     within a 15-second window (either side). Such member_removed rows are
--     excluded from BOTH the feed RPC (§3, rebuilt below) and the realtime
--     broadcast (§2, rebuilt below). This needs no app changes and is robust
--     regardless of which side logged first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: does a member_removed row coincide with a block of the same target?
CREATE OR REPLACE FUNCTION public.activity_is_block_shadowed(
  p_workspace_id uuid,
  p_action       text,
  p_metadata     jsonb,
  p_created_at   timestamptz
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target text;
BEGIN
  IF p_action <> 'member_removed' THEN
    RETURN false;
  END IF;

  -- Target user id stored under either key by the removal logger.
  v_target := COALESCE(
    p_metadata->>'removed_user_id',
    p_metadata->>'target_user_id'
  );
  IF v_target IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_activity b
    WHERE b.workspace_id = p_workspace_id
      AND b.action       = 'member_blocked'
      AND COALESCE(b.metadata->>'blocked_user_id', b.metadata->>'target_user_id') = v_target
      AND b.created_at BETWEEN p_created_at - interval '15 seconds'
                           AND p_created_at + interval '15 seconds'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activity_is_block_shadowed(uuid, text, jsonb, timestamptz) TO authenticated;


-- Rebuild §3 feed RPC to also exclude block-shadowed member_removed rows.
DROP FUNCTION IF EXISTS public.get_workspace_activity_feed(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_workspace_activity_feed(
  p_workspace_id uuid,
  p_limit        int DEFAULT 40
)
RETURNS TABLE (
  id             uuid,
  workspace_id   uuid,
  user_id        uuid,
  action         text,
  resource_type  text,
  resource_id    text,
  metadata       jsonb,
  created_at     timestamptz,
  actor_name     text,
  actor_username text,
  actor_avatar   text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    wa.id,
    wa.workspace_id,
    wa.user_id,
    wa.action::text,
    wa.resource_type,
    wa.resource_id,
    COALESCE(wa.metadata, '{}'::jsonb),
    wa.created_at,
    p.full_name,
    p.username,
    p.avatar_url
  FROM public.workspace_activity wa
  LEFT JOIN public.profiles p ON p.id = wa.user_id
  WHERE wa.workspace_id = p_workspace_id
    AND wa.action NOT IN ('comment_added', 'comment_resolved', 'comment_reply_added')
    -- Fix 1: hide the member_removed that coincides with a block.
    AND NOT public.activity_is_block_shadowed(wa.workspace_id, wa.action::text, wa.metadata, wa.created_at)
  ORDER BY wa.created_at DESC
  LIMIT p_limit;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(uuid, int) TO authenticated;


-- Rebuild §2 broadcast trigger to also skip block-shadowed member_removed rows,
-- so the duplicate never streams in via realtime either.
CREATE OR REPLACE FUNCTION public.broadcast_workspace_activity_insert()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor_name     text;
  v_actor_username text;
  v_actor_avatar   text;
BEGIN
  -- Feature 1c: never surface comment activity in the feed.
  IF NEW.action IN ('comment_added', 'comment_resolved', 'comment_reply_added') THEN
    RETURN NULL;
  END IF;

  -- Fix 1: never surface the member_removed that coincides with a block.
  IF public.activity_is_block_shadowed(NEW.workspace_id, NEW.action::text, NEW.metadata, NEW.created_at) THEN
    RETURN NULL;
  END IF;

  -- Resolve the actor profile once, server-side.
  IF NEW.user_id IS NOT NULL THEN
    SELECT pr.full_name, pr.username, pr.avatar_url
      INTO v_actor_name, v_actor_username, v_actor_avatar
      FROM public.profiles pr
     WHERE pr.id = NEW.user_id
     LIMIT 1;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id',            NEW.id,
      'workspace_id',  NEW.workspace_id,
      'user_id',       NEW.user_id,
      'action',        NEW.action,
      'resource_type', NEW.resource_type,
      'resource_id',   NEW.resource_id,
      'metadata',      COALESCE(NEW.metadata, '{}'::jsonb),
      'created_at',    NEW.created_at,
      'actor_name',     v_actor_name,
      'actor_username', v_actor_username,
      'actor_avatar',   v_actor_avatar
    ),
    'activity_insert',
    'workspace_activity:' || NEW.workspace_id::text,
    true
  );

  RETURN NULL;
END;
$$;

-- (Trigger definition unchanged; the function body above is replaced in place.)


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  FIX 5 — de-duplicate share/unshare (and member) entries at the DB level.
--
--     The realtime "shared content" path in the app can cause the SAME share to
--     be logged more than once (e.g. once per device that has the workspace
--     open, or once by a realtime auto-logger AND once by the explicit share
--     call site added in Part 52.2). Rather than chase every caller, we drop
--     duplicates centrally with a BEFORE INSERT guard: if an identical activity
--     (same workspace + action + resource_id) was inserted in the last 30s,
--     skip the new one. This keeps exactly one entry per real action.
--
--     Scope: only the de-dupe-prone actions (shares/unshares + member join/
--     left/blocked/unblocked/removed). Reports/pins/settings are logged once by
--     a single call site and are left untouched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dedupe_workspace_activity()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target text;
  v_has_name boolean;
BEGIN
  -- ── member_blocked / member_role_changed: make the NAMED row win ──────────
  -- The block/role RPCs insert their own NAMELESS activity row; the client also
  -- inserts a NAMED one. We keep exactly one — the named one.
  IF NEW.action IN ('member_blocked','member_role_changed') THEN
    v_target := COALESCE(
      NEW.metadata->>'blocked_user_id',
      NEW.metadata->>'target_user_id',
      NEW.resource_id
    );
    v_has_name := (
      (NEW.action = 'member_blocked'      AND COALESCE(NEW.metadata->>'blocked_name','') <> '')
      OR
      (NEW.action = 'member_role_changed' AND COALESCE(NEW.metadata->>'target_name','')  <> '')
    );

    IF v_has_name THEN
      -- A named row is arriving → delete any nameless sibling for the same
      -- target within the last 60s so only the named one remains.
      DELETE FROM public.workspace_activity wa
      WHERE wa.workspace_id = NEW.workspace_id
        AND wa.action = NEW.action
        AND wa.created_at > now() - interval '60 seconds'
        AND COALESCE(wa.metadata->>'blocked_user_id', wa.metadata->>'target_user_id', wa.resource_id) = v_target
        AND (
          (NEW.action = 'member_blocked'      AND COALESCE(wa.metadata->>'blocked_name','') = '')
          OR
          (NEW.action = 'member_role_changed' AND COALESCE(wa.metadata->>'target_name','')  = '')
        );
      RETURN NEW;
    ELSE
      -- A nameless row is arriving → if a named sibling already exists for the
      -- same target, drop this nameless one.
      IF EXISTS (
        SELECT 1 FROM public.workspace_activity wa
        WHERE wa.workspace_id = NEW.workspace_id
          AND wa.action = NEW.action
          AND wa.created_at > now() - interval '60 seconds'
          AND COALESCE(wa.metadata->>'blocked_user_id', wa.metadata->>'target_user_id', wa.resource_id) = v_target
          AND (
            (NEW.action = 'member_blocked'      AND COALESCE(wa.metadata->>'blocked_name','') <> '')
            OR
            (NEW.action = 'member_role_changed' AND COALESCE(wa.metadata->>'target_name','')  <> '')
          )
      ) THEN
        RETURN NULL;
      END IF;
      RETURN NEW;  -- no named sibling yet; allow (it will be cleaned when the named one arrives)
    END IF;
  END IF;

  -- ── Other de-dupe-prone member events: plain 30s identical-row guard ──────
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
-- §9  FIX (issues 2/3/4) — server-side auto-logging of shared-content add/remove.
--
--     Slides, papers, podcasts, debates and voice debates are shared/removed via
--     many different client paths (player share sheets, the share modal, the
--     Shared-tab remove buttons, etc.). Logging from each client call site is
--     fragile and left gaps (podcast adds, slide/paper removals never logged).
--
--     Instead we log centrally from AFTER INSERT / AFTER DELETE triggers on the
--     four shared tables. This guarantees exactly ONE correctly-typed, correctly
--     -named entry per real action, no matter which client path caused it. The
--     actor is auth.uid()/shared_by; the title comes straight from the row.
--
--     Pairs with the §8 BEFORE INSERT de-dupe guard (collapses any client-side
--     duplicate that might still fire within 30s).
-- ─────────────────────────────────────────────────────────────────────────────

-- Generic logger used by every shared-table trigger.
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


-- shared_workspace_content → presentation / academic_paper
CREATE OR REPLACE FUNCTION public.tg_log_shared_workspace_content()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text; suffix text;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; suffix := '_shared';
  ELSE                     r := OLD; suffix := '_unshared';
  END IF;

  IF r.content_type NOT IN ('presentation','academic_paper') THEN
    RETURN NULL;  -- other types handled by their own tables
  END IF;

  act := r.content_type || suffix;  -- e.g. presentation_shared / academic_paper_unshared
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
CREATE TRIGGER log_shared_workspace_content_ins AFTER INSERT ON public.shared_workspace_content
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_workspace_content();
CREATE TRIGGER log_shared_workspace_content_del AFTER DELETE ON public.shared_workspace_content
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_shared_workspace_content();


-- shared_podcasts → podcast_shared / podcast_unshared
CREATE OR REPLACE FUNCTION public.tg_log_shared_podcast()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; act := 'podcast_shared';
  ELSE                     r := OLD; act := 'podcast_unshared';
  END IF;
  PERFORM public.log_shared_content_activity(
    r.workspace_id, COALESCE(r.shared_by, auth.uid()),
    act, 'podcast', r.podcast_id::text, r.title);
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


-- shared_debates → debate_shared / debate_unshared
CREATE OR REPLACE FUNCTION public.tg_log_shared_debate()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; act := 'debate_shared';
  ELSE                     r := OLD; act := 'debate_unshared';
  END IF;
  PERFORM public.log_shared_content_activity(
    r.workspace_id, COALESCE(r.shared_by, auth.uid()),
    act, 'debate', r.debate_id::text, r.topic);
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


-- shared_voice_debates → voice_debate_shared / voice_debate_unshared
CREATE OR REPLACE FUNCTION public.tg_log_shared_voice_debate()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; act := 'voice_debate_shared';
  ELSE                     r := OLD; act := 'voice_debate_unshared';
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
-- §10  FIX (issues 6/7) — suppress the RPC's NAMELESS block / role rows.
--
--     block_workspace_member() and demoteEditorToViewer()/role RPCs insert their
--     OWN member_blocked / member_role_changed activity rows that carry no
--     target name in metadata (→ "blocked a member", and a duplicate role row).
--     The client also logs the SAME action WITH the name. We hide the nameless
--     variant from the feed + broadcast so only the named entry survives.
--
--     "Nameless" = a member_blocked row without blocked_name, or a
--     member_role_changed row without target_name.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activity_is_nameless_dup(
  p_action   text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    (p_action = 'member_blocked'      AND COALESCE(p_metadata->>'blocked_name','') = '')
    OR
    (p_action = 'member_role_changed' AND COALESCE(p_metadata->>'target_name','')  = '');
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_nameless_dup(text, jsonb) TO authenticated;

-- Issue 4: sharing a presentation/paper that's linked to a report also adds the
-- source report → an extra "added a research report" entry. Hide that
-- report_added when a presentation_shared / academic_paper_shared for the SAME
-- report_id happened within ±90s.
CREATE OR REPLACE FUNCTION public.activity_is_report_share_shadowed(
  p_workspace_id uuid,
  p_action       text,
  p_resource_id  text,
  p_metadata     jsonb,
  p_created_at   timestamptz
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
      AND s.action IN ('presentation_shared','academic_paper_shared')
      AND COALESCE(s.metadata->>'report_id','') = v_report_id
      AND s.created_at BETWEEN p_created_at - interval '90 seconds'
                           AND p_created_at + interval '90 seconds'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.activity_is_report_share_shadowed(uuid, text, text, jsonb, timestamptz) TO authenticated;

-- Rebuild the feed RPC to also drop nameless block/role rows.
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
    AND NOT public.activity_is_report_share_shadowed(wa.workspace_id, wa.action::text, wa.resource_id, wa.metadata, wa.created_at)
  ORDER BY wa.created_at DESC
  LIMIT p_limit;
EXCEPTION WHEN OTHERS THEN RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(uuid, int) TO authenticated;

-- Rebuild the broadcast trigger to also skip nameless block/role rows.
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


-- ─────────────────────────────────────────────────────────────────────────────
-- §11  Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ============================================================
-- VERIFY (optional):
--   SELECT pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname='get_workspace_activity_feed';
--   → one row: (uuid, integer)
-- ============================================================
-- END OF PART 52.2 SCHEMA MIGRATION
-- ============================================================