-- ============================================================
-- DeepDive AI — Part 51: Lazy Loading + Realtime Shared Content
-- + Voice Debate Cross-Device Playback + Remove Shared Reports
-- ============================================================
-- Run this SINGLE file in Supabase SQL Editor.
-- Fully idempotent — safe to run multiple times.
--
-- WHAT THIS ADDS:
--   §1  REPLICA IDENTITY FULL + realtime publication (re-assert)
--   §2  realtime.messages SELECT policy for private channels (re-assert)
--   §3  Broadcast triggers for ALL shared content + workspace reports
--        Channel: "workspace_shared:{workspace_id}"   Event: "shared_change"
--        Payload: { workspace_id, content_type, content_id, action }
--        content_type ∈ report | presentation | academic_paper
--                       | podcast | debate | voice_debate
--        action       ∈ added | removed
--   §4  Voice-debate storage public-read policy (re-assert, for fallback URLs)
--   §5  Reload PostgREST
--
-- WHY BROADCAST (not just postgres_changes):
--   postgres_changes delivery under RLS can be flaky for recipients and
--   DELETE events lose columns. SECURITY DEFINER broadcast triggers fire
--   reliably for every member instantly, bypassing RLS — same pattern used
--   for pins/kicks/roles in Part 46. The client listens on the
--   "workspace_shared:{id}" private channel (added in Part 51B).
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  REPLICA IDENTITY FULL + publication (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE public.workspace_reports        REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.shared_workspace_content REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.shared_podcasts          REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.shared_debates           REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.shared_voice_debates     REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_reports;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_workspace_content;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_podcasts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_debates;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_voice_debates;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  realtime.messages SELECT policy (private Broadcast receive) — re-assert
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_can_receive_broadcasts" ON realtime.messages;

CREATE POLICY "authenticated_can_receive_broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

GRANT USAGE ON SCHEMA realtime TO postgres;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Broadcast trigger functions + triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 3a. workspace_reports (report added / removed) ──────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_workspace_report_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_cid uuid; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ws := NEW.workspace_id; v_cid := NEW.report_id; v_action := 'added';
  ELSE
    v_ws := OLD.workspace_id; v_cid := OLD.report_id; v_action := 'removed';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws,
      'content_type', 'report',
      'content_id',   v_cid,
      'action',       v_action
    ),
    'shared_change',
    'workspace_shared:' || v_ws::text,
    true
  );
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_workspace_report_change ON public.workspace_reports;
  CREATE TRIGGER on_workspace_report_change
    AFTER INSERT OR DELETE ON public.workspace_reports
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_report_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ── 3b. shared_workspace_content (presentation / academic_paper) ────────────
CREATE OR REPLACE FUNCTION public.broadcast_shared_content_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_ct text; v_cid uuid; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ws := NEW.workspace_id; v_ct := NEW.content_type; v_cid := NEW.content_id; v_action := 'added';
  ELSE
    v_ws := OLD.workspace_id; v_ct := OLD.content_type; v_cid := OLD.content_id; v_action := 'removed';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws,
      'content_type', v_ct,
      'content_id',   v_cid,
      'action',       v_action
    ),
    'shared_change',
    'workspace_shared:' || v_ws::text,
    true
  );
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_shared_content_change ON public.shared_workspace_content;
  CREATE TRIGGER on_shared_content_change
    AFTER INSERT OR DELETE ON public.shared_workspace_content
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_shared_content_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ── 3c. shared_podcasts ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_shared_podcast_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_cid uuid; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ws := NEW.workspace_id; v_cid := NEW.podcast_id; v_action := 'added';
  ELSE
    v_ws := OLD.workspace_id; v_cid := OLD.podcast_id; v_action := 'removed';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws,
      'content_type', 'podcast',
      'content_id',   v_cid,
      'action',       v_action
    ),
    'shared_change',
    'workspace_shared:' || v_ws::text,
    true
  );
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_shared_podcast_change ON public.shared_podcasts;
  CREATE TRIGGER on_shared_podcast_change
    AFTER INSERT OR DELETE ON public.shared_podcasts
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_shared_podcast_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ── 3d. shared_debates ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_shared_debate_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_cid uuid; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ws := NEW.workspace_id; v_cid := NEW.debate_id; v_action := 'added';
  ELSE
    v_ws := OLD.workspace_id; v_cid := OLD.debate_id; v_action := 'removed';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws,
      'content_type', 'debate',
      'content_id',   v_cid,
      'action',       v_action
    ),
    'shared_change',
    'workspace_shared:' || v_ws::text,
    true
  );
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_shared_debate_change ON public.shared_debates;
  CREATE TRIGGER on_shared_debate_change
    AFTER INSERT OR DELETE ON public.shared_debates
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_shared_debate_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ── 3e. shared_voice_debates ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_shared_voice_debate_change()
RETURNS trigger SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_cid uuid; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ws := NEW.workspace_id; v_cid := NEW.voice_debate_id; v_action := 'added';
  ELSE
    v_ws := OLD.workspace_id; v_cid := OLD.voice_debate_id; v_action := 'removed';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'workspace_id', v_ws,
      'content_type', 'voice_debate',
      'content_id',   v_cid,
      'action',       v_action
    ),
    'shared_change',
    'workspace_shared:' || v_ws::text,
    true
  );
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_shared_voice_debate_change ON public.shared_voice_debates;
  CREATE TRIGGER on_shared_voice_debate_change
    AFTER INSERT OR DELETE ON public.shared_voice_debates
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_shared_voice_debate_change();
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Voice-debate storage public-read policy (re-assert)
--     Guarantees the stored public URLs remain a valid fallback even though
--     Part 51B prefers freshly-signed URLs for cross-device streaming.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Voice debate audio public read" ON storage.objects;

CREATE POLICY "Voice debate audio public read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );

-- Ensure authenticated members can sign URLs for these paths
DROP POLICY IF EXISTS "Voice debate audio authed read" ON storage.objects;

CREATE POLICY "Voice debate audio authed read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'podcast-audio'
    AND name LIKE 'voice_debates/%'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END OF PART 51 SCHEMA
-- ============================================================