-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — schema_part53_complete.sql
-- COMPLETE, CONSOLIDATED Part 53 schema (53A + 53B + 53C + 53D, all patches).
--
-- Run this ONCE in the Supabase SQL Editor. It is idempotent and safe to re-run.
-- It assumes the Part 36 social schema (user_follows, follow_notifications,
-- profiles social columns, share_links, research_reports) already exists.
--
-- This single file supersedes:
--   schema_part53.sql                       (53A — app_notifications + RPCs)
--   schema_part53b_push_tokens.sql          (53B — push_tokens)
--   schema_part53c_social_realtime.sql      (53C — realtime + publish trigger)
--   schema_part53d_notifications_fix.sql    (53D — unfollow + re-notify fixes)
--   schema_part53f_mark_read_by_content.sql (53F — mark-read-on-tap RPC)
--   (Part 53G added NO new SQL — it was app-code: real cancel, feed-dup fix,
--    realtime app-icon badge. This section 13 just makes 'cancelled' a valid
--    status so cancelled generations can be marked without violating a CHECK.)
--
-- WHERE THERE WERE CONFLICTING VERSIONS, THE FINAL (53D) VERSION IS USED:
--   • follow_user / unfollow_user            → delete-then-insert (re-notify)
--   • notify_followers_of_new_report          → delete-then-insert
--   • fn_notify_followers_on_publish           → delete-then-insert
--   • follow_notifications dedup index         → NON-unique (was unique)
--   • follow_notifications type CHECK          → includes 'new_unfollower'
--
-- SECTIONS
--   1.  app_notifications table + indexes + RLS                         (53A)
--   2.  app_notifications RPCs                                          (53A)
--   3.  push_tokens table + RLS                                        (53B)
--   4.  follow_notifications: type CHECK + cache columns               (53C/53D)
--   5.  follow_notifications: non-unique dedup index                  (53D)
--   6.  Realtime publication + REPLICA IDENTITY                        (53C)
--   7.  Notification cache trigger (actor/report denorm)              (53C)
--   8.  follow_user / unfollow_user (delete-then-insert, unfollow)    (53D)
--   9.  notify_followers_of_new_report (delete-then-insert)           (53D)
--   10. Publish trigger (auto new_report on share-link)               (53C/53D)
--   11. get_follow_notifications (reads cache columns)                (53C)
--   12. mark_app_notification_read_by_content (mark-read-on-tap)      (53F)
--   13. allow 'cancelled' status on podcasts / debate_sessions         (53G)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — app_notifications table (own content-ready events)              53A
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT,
  content_id UUID,
  report_id  UUID,
  route      TEXT,
  params     JSONB       DEFAULT '{}'::JSONB,
  icon       TEXT,
  accent     TEXT,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_an_user_created
  ON public.app_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_unread
  ON public.app_notifications (user_id, read, created_at DESC);

-- Dedupe: one notification per (user, type, content). Zero-UUID stands in for
-- NULL content so content-less rows still dedupe consistently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_an_dedupe
  ON public.app_notifications (
    user_id, type, COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_notifications' AND policyname='an_select') THEN
    CREATE POLICY "an_select" ON public.app_notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_notifications' AND policyname='an_insert') THEN
    CREATE POLICY "an_insert" ON public.app_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_notifications' AND policyname='an_update') THEN
    CREATE POLICY "an_update" ON public.app_notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_notifications' AND policyname='an_delete') THEN
    CREATE POLICY "an_delete" ON public.app_notifications FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — app_notifications RPCs                                          53A
-- ═══════════════════════════════════════════════════════════════════════════

-- create_app_notification — idempotent upsert. Returns the row id.
CREATE OR REPLACE FUNCTION create_app_notification(
  p_type       TEXT,
  p_title      TEXT,
  p_body       TEXT,
  p_content_id UUID,
  p_report_id  UUID,
  p_route      TEXT,
  p_params     JSONB,
  p_icon       TEXT,
  p_accent     TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  INSERT INTO app_notifications
    (user_id, type, title, body, content_id, report_id, route, params, icon, accent)
  VALUES
    (v_uid, p_type, p_title, p_body, p_content_id, p_report_id, p_route,
     COALESCE(p_params, '{}'::JSONB), p_icon, p_accent)
  ON CONFLICT (user_id, type, COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::UUID))
  DO UPDATE SET
    title      = EXCLUDED.title,
    body       = EXCLUDED.body,
    report_id  = EXCLUDED.report_id,
    route      = EXCLUDED.route,
    params     = EXCLUDED.params,
    icon       = EXCLUDED.icon,
    accent     = EXCLUDED.accent,
    read       = FALSE,
    created_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_app_notification(TEXT,TEXT,TEXT,UUID,UUID,TEXT,JSONB,TEXT,TEXT) TO authenticated;

-- get_app_notifications — returns a JSONB array of the user's notifications.
CREATE OR REPLACE FUNCTION get_app_notifications(p_limit INT DEFAULT 40)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::JSONB; END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT * FROM app_notifications
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT p_limit
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_app_notifications(INT) TO authenticated;

-- get_unread_app_notifications_count
CREATE OR REPLACE FUNCTION get_unread_app_notifications_count()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_count FROM app_notifications WHERE user_id = v_uid AND read = FALSE;
  RETURN COALESCE(v_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION get_unread_app_notifications_count() TO authenticated;

-- mark_app_notifications_read — mark all read
CREATE OR REPLACE FUNCTION mark_app_notifications_read()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE app_notifications SET read = TRUE
  WHERE user_id = auth.uid() AND read = FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_app_notifications_read() TO authenticated;

-- mark_one_app_notification_read
CREATE OR REPLACE FUNCTION mark_one_app_notification_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE app_notifications SET read = TRUE
  WHERE id = p_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION mark_one_app_notification_read(UUID) TO authenticated;

-- delete_app_notification
CREATE OR REPLACE FUNCTION delete_app_notification(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM app_notifications WHERE id = p_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION delete_app_notification(UUID) TO authenticated;

-- clear_app_notifications
CREATE OR REPLACE FUNCTION clear_app_notifications()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM app_notifications WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION clear_app_notifications() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — push_tokens (Expo push tokens for remote push)                  53B
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  platform   TEXT        NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='pt_select') THEN
    CREATE POLICY "pt_select" ON public.push_tokens FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='pt_insert') THEN
    CREATE POLICY "pt_insert" ON public.push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='pt_update') THEN
    CREATE POLICY "pt_update" ON public.push_tokens FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_tokens' AND policyname='pt_delete') THEN
    CREATE POLICY "pt_delete" ON public.push_tokens FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — follow_notifications: type CHECK (+ unfollow) + cache columns  53C/53D
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow 'new_unfollower' alongside the existing types.
ALTER TABLE public.follow_notifications
  DROP CONSTRAINT IF EXISTS follow_notifications_type_check;
ALTER TABLE public.follow_notifications
  ADD CONSTRAINT follow_notifications_type_check
  CHECK (type IN ('new_follower', 'new_report', 'new_unfollower'));

-- Cache columns so the realtime INSERT payload carries actor + report display
-- fields (avoids a refetch before showing a banner).
ALTER TABLE public.follow_notifications
  ADD COLUMN IF NOT EXISTS actor_username   TEXT,
  ADD COLUMN IF NOT EXISTS actor_full_name  TEXT,
  ADD COLUMN IF NOT EXISTS actor_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS report_title     TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — follow_notifications: NON-unique dedup index                    53D
-- ═══════════════════════════════════════════════════════════════════════════
-- The original UNIQUE index permanently blocked re-notification (re-follow /
-- re-publish). We drop it and use a plain lookup index; duplicate-prevention is
-- now handled by delete-then-insert in the RPCs/trigger (sections 8-10).

DROP INDEX IF EXISTS idx_fn_unique;

CREATE INDEX IF NOT EXISTS idx_fn_lookup
  ON public.follow_notifications (
    recipient_id, actor_id, type,
    COALESCE(report_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — Realtime publication + REPLICA IDENTITY                         53C
-- ═══════════════════════════════════════════════════════════════════════════
-- Put the notification tables in the realtime publication IN CODE, and add
-- app_notifications + follow_notifications + user_follows so the client receives
-- INSERT events without manual Dashboard toggling.

DO $$
BEGIN
  -- app_notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='app_notifications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications';
  END IF;
  -- follow_notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='follow_notifications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_notifications';
  END IF;
  -- user_follows
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_follows') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_follows';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Publication doesn't exist (very old project) — create it with all three.
  EXECUTE 'CREATE PUBLICATION supabase_realtime FOR TABLE public.app_notifications, public.follow_notifications, public.user_follows';
END $$;

-- Full row in realtime payloads so the client can render banners with no refetch.
ALTER TABLE public.follow_notifications REPLICA IDENTITY FULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — Notification cache trigger (denormalise actor + report)         53C
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_fill_notification_cache()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  SELECT p.username, p.full_name, p.avatar_url
    INTO NEW.actor_username, NEW.actor_full_name, NEW.actor_avatar_url
  FROM profiles p WHERE p.id = NEW.actor_id;

  IF NEW.report_id IS NOT NULL THEN
    SELECT rr.title INTO NEW.report_title
    FROM research_reports rr WHERE rr.id = NEW.report_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_notification_cache ON public.follow_notifications;
CREATE TRIGGER trg_fill_notification_cache
  BEFORE INSERT ON public.follow_notifications
  FOR EACH ROW EXECUTE FUNCTION fn_fill_notification_cache();

-- Backfill existing rows (correlated subquery for report_title — the target
-- table cannot be referenced from a JOIN inside UPDATE ... FROM).
UPDATE public.follow_notifications fn
SET
  actor_username   = p.username,
  actor_full_name  = p.full_name,
  actor_avatar_url = p.avatar_url,
  report_title     = (SELECT rr.title FROM research_reports rr WHERE rr.id = fn.report_id)
FROM profiles p
WHERE fn.actor_id = p.id
  AND (fn.actor_username IS NULL OR fn.actor_full_name IS NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — follow_user / unfollow_user (delete-then-insert + unfollow)     53D
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION follow_user(p_following_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;
  IF v_uid = p_following_id THEN RETURN jsonb_build_object('error', 'cannot_follow_self'); END IF;

  INSERT INTO user_follows (follower_id, following_id)
  VALUES (v_uid, p_following_id)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  -- Replace prior follow/unfollow notification → fresh new_follower (re-notify).
  DELETE FROM follow_notifications
  WHERE recipient_id = p_following_id AND actor_id = v_uid
    AND type IN ('new_follower', 'new_unfollower');

  INSERT INTO follow_notifications (recipient_id, actor_id, type)
  VALUES (p_following_id, v_uid, 'new_follower');

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION unfollow_user(p_following_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  DELETE FROM user_follows
  WHERE follower_id = v_uid AND following_id = p_following_id;

  -- Replace prior follow/unfollow notification → fresh new_unfollower.
  DELETE FROM follow_notifications
  WHERE recipient_id = p_following_id AND actor_id = v_uid
    AND type IN ('new_follower', 'new_unfollower');

  INSERT INTO follow_notifications (recipient_id, actor_id, type)
  VALUES (p_following_id, v_uid, 'new_unfollower');

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — notify_followers_of_new_report (delete-then-insert)             53D
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_followers_of_new_report(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_author_id UUID;
BEGIN
  SELECT user_id INTO v_author_id FROM research_reports WHERE id = p_report_id;
  IF v_author_id IS NULL THEN RETURN; END IF;

  DELETE FROM follow_notifications
  WHERE type = 'new_report' AND report_id = p_report_id
    AND recipient_id IN (SELECT follower_id FROM user_follows WHERE following_id = v_author_id);

  INSERT INTO follow_notifications (recipient_id, actor_id, type, report_id)
  SELECT uf.follower_id, v_author_id, 'new_report', p_report_id
  FROM user_follows uf
  WHERE uf.following_id = v_author_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10 — Publish trigger: auto new_report on share-link publish    53C/53D
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_notify_followers_on_publish()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_author_id UUID;
  v_is_new_publish BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_is_new_publish := COALESCE(NEW.is_active, FALSE);
  ELSE
    v_is_new_publish := COALESCE(NEW.is_active, FALSE) AND NOT COALESCE(OLD.is_active, FALSE);
  END IF;

  IF NOT v_is_new_publish THEN RETURN NEW; END IF;

  SELECT user_id INTO v_author_id FROM research_reports WHERE id = NEW.report_id;
  IF v_author_id IS NULL THEN RETURN NEW; END IF;

  DELETE FROM follow_notifications
  WHERE type = 'new_report' AND report_id = NEW.report_id
    AND recipient_id IN (SELECT follower_id FROM user_follows WHERE following_id = v_author_id);

  INSERT INTO follow_notifications (recipient_id, actor_id, type, report_id)
  SELECT uf.follower_id, v_author_id, 'new_report', NEW.report_id
  FROM user_follows uf
  WHERE uf.following_id = v_author_id;

  RETURN NEW;
END;
$$;

-- Attach to the correct relation (base table even if share_links is a view).
DO $$
DECLARE
  v_relkind CHAR;
  v_base    TEXT;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='share_links';

  IF v_relkind = 'v' THEN
    SELECT cl.relname INTO v_base
    FROM pg_rewrite r
    JOIN pg_depend d   ON d.objid = r.oid
    JOIN pg_class  cl  ON cl.oid  = d.refobjid
    JOIN pg_namespace n ON n.oid  = cl.relnamespace
    WHERE r.ev_class = 'public.share_links'::regclass
      AND cl.relkind='r' AND n.nspname='public' AND cl.relname <> 'share_links'
    LIMIT 1;
    IF v_base IS NULL THEN
      RAISE NOTICE 'share_links is a view but base table not resolved — skipping publish trigger.';
      RETURN;
    END IF;
  ELSIF v_relkind = 'r' THEN
    v_base := 'share_links';
  ELSE
    RAISE NOTICE 'share_links relation not found — skipping publish trigger.';
    RETURN;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_followers_on_publish ON public.%I', v_base);
  EXECUTE format(
    'CREATE TRIGGER trg_notify_followers_on_publish
       AFTER INSERT OR UPDATE OF is_active ON public.%I
       FOR EACH ROW EXECUTE FUNCTION fn_notify_followers_on_publish()',
    v_base
  );
  RAISE NOTICE 'Attached publish trigger to public.%', v_base;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11 — get_follow_notifications (reads cache columns)                 53C
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_follow_notifications(p_limit INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::JSONB; END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',               fn.id,
          'type',             fn.type,
          'read',             fn.read,
          'created_at',       fn.created_at,
          'report_id',        fn.report_id,
          'actor_id',         fn.actor_id,
          'actor_username',   COALESCE(p.username,   fn.actor_username),
          'actor_full_name',  COALESCE(p.full_name,  fn.actor_full_name),
          'actor_avatar_url', COALESCE(p.avatar_url, fn.actor_avatar_url),
          'report_title',     COALESCE(rr.title,     fn.report_title)
        ) AS row_data
        FROM follow_notifications fn
        JOIN profiles             p  ON fn.actor_id  = p.id
        LEFT JOIN research_reports rr ON fn.report_id = rr.id
        WHERE fn.recipient_id = v_uid
        ORDER BY fn.created_at DESC
        LIMIT p_limit
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_follow_notifications(INT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 12 — mark a single app_notification read by content id            53F
-- ═══════════════════════════════════════════════════════════════════════════
-- Used when the user TAPS a push: we clear that specific notification's unread
-- state so its count drops off the bell + the OS app-icon badge.

CREATE OR REPLACE FUNCTION mark_app_notification_read_by_content(p_content_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE app_notifications
  SET read = TRUE
  WHERE user_id = auth.uid()
    AND content_id = p_content_id
    AND read = FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_app_notification_read_by_content(UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 13 — allow 'cancelled' status (Part 53G cancel support)             53G
-- ═══════════════════════════════════════════════════════════════════════════
-- Part 53G makes Cancel actually stop generation. When the user cancels, the
-- orchestrator marks the in-progress row status = 'cancelled' so it doesn't
-- linger as "generating". If your podcasts / debate_sessions tables have a
-- CHECK constraint on status, it may reject 'cancelled'. These guards relax the
-- constraint to include it. They are written defensively: if the table or
-- constraint isn't present, they no-op rather than error.
--
-- NOTE: research_reports already uses a free-text status (no CHECK) in this
-- project, so no change is needed there. If yours has a CHECK, add 'cancelled'
-- to it the same way.

DO $$
BEGIN
  -- podcasts.status — drop & recreate CHECK including 'cancelled', only if a
  -- CHECK constraint currently exists on the column.
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name   = 'podcasts'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name = 'podcasts_status_check'
  ) THEN
    ALTER TABLE public.podcasts DROP CONSTRAINT podcasts_status_check;
    ALTER TABLE public.podcasts
      ADD CONSTRAINT podcasts_status_check
      CHECK (status IN (
        'generating_script', 'generating_audio', 'completed', 'failed', 'cancelled'
      ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'podcasts status CHECK update skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- debate_sessions.status — same treatment.
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name   = 'debate_sessions'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name = 'debate_sessions_status_check'
  ) THEN
    ALTER TABLE public.debate_sessions DROP CONSTRAINT debate_sessions_status_check;
    ALTER TABLE public.debate_sessions
      ADD CONSTRAINT debate_sessions_status_check
      CHECK (status IN (
        'searching', 'debating', 'moderating', 'completed', 'failed', 'cancelled'
      ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'debate_sessions status CHECK update skipped: %', SQLERRM;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Verify realtime membership with:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname='supabase_realtime' AND schemaname='public';
-- Expect: app_notifications, follow_notifications, user_follows.
-- ═══════════════════════════════════════════════════════════════════════════