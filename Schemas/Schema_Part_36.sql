-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — Social & Discovery Schema (Complete)
-- Includes Patches for Published Reports RPCs (Part 36)
-- Run this ONCE in Supabase SQL Editor.
-- Safe to re-run — uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- Does NOT modify or drop any existing tables, policies, or triggers.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add social columns to profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_public       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS follower_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_follows — follow relationships
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON user_follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON user_follows (following_id, created_at DESC);

-- RLS
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'uf_select'
  ) THEN
    CREATE POLICY "uf_select" ON user_follows FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'uf_insert'
  ) THEN
    CREATE POLICY "uf_insert" ON user_follows FOR INSERT
      WITH CHECK (auth.uid() = follower_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'uf_delete'
  ) THEN
    CREATE POLICY "uf_delete" ON user_follows FOR DELETE
      USING (auth.uid() = follower_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger — keep follower_count / following_count accurate
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
      SET follower_count  = GREATEST(0, COALESCE(follower_count,  0) + 1)
      WHERE id = NEW.following_id;
    UPDATE profiles
      SET following_count = GREATEST(0, COALESCE(following_count, 0) + 1)
      WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
      SET follower_count  = GREATEST(0, COALESCE(follower_count,  0) - 1)
      WHERE id = OLD.following_id;
    UPDATE profiles
      SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1)
      WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON user_follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON user_follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Seed existing counts (safe if already set — just re-derives correct values)
UPDATE profiles p
SET
  follower_count  = (SELECT COUNT(*) FROM user_follows WHERE following_id = p.id),
  following_count = (SELECT COUNT(*) FROM user_follows WHERE follower_id  = p.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. follow_notifications — social notification inbox
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follow_notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('new_follower', 'new_report')),
  report_id    UUID        REFERENCES research_reports(id) ON DELETE CASCADE,
  read         BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup index — one new_follower notif per (recipient, actor),
-- one new_report notif per (recipient, actor, report).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fn_unique
  ON follow_notifications (
    recipient_id,
    actor_id,
    type,
    COALESCE(report_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

CREATE INDEX IF NOT EXISTS idx_fn_recipient
  ON follow_notifications (recipient_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fn_actor
  ON follow_notifications (actor_id, created_at DESC);

-- RLS
ALTER TABLE follow_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follow_notifications' AND policyname = 'fn_select'
  ) THEN
    CREATE POLICY "fn_select" ON follow_notifications FOR SELECT
      USING (auth.uid() = recipient_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follow_notifications' AND policyname = 'fn_insert'
  ) THEN
    CREATE POLICY "fn_insert" ON follow_notifications FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follow_notifications' AND policyname = 'fn_update'
  ) THEN
    CREATE POLICY "fn_update" ON follow_notifications FOR UPDATE
      USING (auth.uid() = recipient_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follow_notifications' AND policyname = 'fn_delete'
  ) THEN
    CREATE POLICY "fn_delete" ON follow_notifications FOR DELETE
      USING (auth.uid() = recipient_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Create or link share_links table/view
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tbl TEXT := NULL;
BEGIN
  -- Skip if share_links already exists as a table or view
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'share_links'
  ) THEN
    RAISE NOTICE 'share_links already exists — skipping view creation.';
    RETURN;
  END IF;

  -- Find the real table by looking for one with share_id + report_id columns
  SELECT t.table_name INTO v_tbl
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type IN ('BASE TABLE', 'VIEW')
    AND t.table_name != 'share_links'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'share_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'report_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'is_active'
    )
  ORDER BY
    CASE t.table_name
      WHEN 'report_share_links' THEN 1
      WHEN 'public_share_links' THEN 2
      WHEN 'report_shares'      THEN 3
      WHEN 'public_shares'      THEN 4
      ELSE 5
    END
  LIMIT 1;

  IF v_tbl IS NOT NULL THEN
    RAISE NOTICE 'Found real share-links table: %. Creating share_links view.', v_tbl;
    EXECUTE 'CREATE VIEW public.share_links AS SELECT * FROM public.' || quote_ident(v_tbl);
  ELSE
    -- Fallback: create a minimal share_links table from scratch
    RAISE NOTICE 'No share-links table found. Creating share_links table.';
    CREATE TABLE public.share_links (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      share_id    TEXT        UNIQUE NOT NULL,
      report_id   UUID        NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
      is_active   BOOLEAN     DEFAULT TRUE,
      view_count  INTEGER     DEFAULT 0,
      share_count INTEGER     DEFAULT 0,
      tags        JSONB       DEFAULT '[]'::JSONB,
      cached_title   TEXT,
      cached_summary TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS idx_sl_report  ON public.share_links (report_id);
    CREATE INDEX IF NOT EXISTS idx_sl_share   ON public.share_links (share_id);
    CREATE INDEX IF NOT EXISTS idx_sl_active  ON public.share_links (is_active, created_at DESC);
    -- Allow reads for everyone, writes only through SECURITY DEFINER RPCs
    CREATE POLICY "sl_select" ON public.share_links FOR SELECT USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Published Report RPCs (Patches from Part 36)
-- ─────────────────────────────────────────────────────────────────────────────

-- get_published_report_by_id: Returns a single published report if it has an active share link
-- SECURITY DEFINER bypasses RLS on research_reports and share_links
CREATE OR REPLACE FUNCTION get_published_report_by_id(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report JSONB;
BEGIN
  -- Only return if there is an active share_link for this report
  SELECT to_jsonb(rr.*)
  INTO v_report
  FROM research_reports rr
  INNER JOIN share_links sl
    ON sl.report_id = rr.id
   AND sl.is_active = TRUE
  WHERE rr.id = p_report_id
  LIMIT 1;

  RETURN v_report;  -- returns NULL if not found / not published
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_published_report_by_id(UUID) TO authenticated;

-- get_published_reports_for_user: Returns published reports for a user's public profile
-- SECURITY DEFINER bypasses RLS on both research_reports AND share_links,
-- so any authenticated user can fetch the published reports of any public profile.
CREATE OR REPLACE FUNCTION get_published_reports_for_user(
  p_user_id   UUID,
  p_limit     INT  DEFAULT 12,
  p_offset    INT  DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id',                rr.id,
      'title',             rr.title,
      'depth',             rr.depth,
      'sources_count',     rr.sources_count,
      'reliability_score', rr.reliability_score,
      'created_at',        rr.created_at,
      'executive_summary', rr.executive_summary,
      'share_id',          sl.share_id
    ) AS row_data
    FROM research_reports rr
    INNER JOIN share_links sl
      ON sl.report_id = rr.id
     AND sl.is_active  = TRUE
    WHERE rr.user_id = p_user_id
    ORDER BY rr.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_published_reports_for_user(UUID, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Core Social RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- follow_user: insert follow row + create new_follower notification
CREATE OR REPLACE FUNCTION follow_user(p_following_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  IF v_uid = p_following_id THEN
    RETURN jsonb_build_object('error', 'cannot_follow_self');
  END IF;

  INSERT INTO user_follows (follower_id, following_id)
  VALUES (v_uid, p_following_id)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  INSERT INTO follow_notifications (recipient_id, actor_id, type)
  VALUES (p_following_id, v_uid, 'new_follower')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- unfollow_user
CREATE OR REPLACE FUNCTION unfollow_user(p_following_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  DELETE FROM user_follows
  WHERE follower_id = auth.uid() AND following_id = p_following_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- get_public_profile
CREATE OR REPLACE FUNCTION get_public_profile(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile       RECORD;
  v_uid           UUID    := auth.uid();
  v_is_following  BOOLEAN := FALSE;
  v_is_own        BOOLEAN := FALSE;
  v_pub_count     INTEGER := 0;
  v_total_views   BIGINT  := 0;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE username = p_username;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT COALESCE(v_profile.is_public, FALSE)
    AND (v_uid IS NULL OR v_uid != v_profile.id)
  THEN
    RETURN NULL;
  END IF;

  v_is_own := (v_uid IS NOT NULL AND v_uid = v_profile.id);

  IF v_uid IS NOT NULL AND NOT v_is_own THEN
    SELECT EXISTS (
      SELECT 1 FROM user_follows
      WHERE follower_id = v_uid AND following_id = v_profile.id
    ) INTO v_is_following;
  END IF;

  BEGIN
    SELECT COUNT(*), COALESCE(SUM(sl.view_count), 0)
    INTO v_pub_count, v_total_views
    FROM share_links sl
    JOIN research_reports rr ON sl.report_id = rr.id
    WHERE rr.user_id = v_profile.id 
      AND sl.is_active = TRUE 
      AND rr.status = 'completed';
  EXCEPTION WHEN undefined_table THEN
    v_pub_count  := 0;
    v_total_views := 0;
  END;

  RETURN jsonb_build_object(
    'id',              v_profile.id,
    'username',        v_profile.username,
    'full_name',       v_profile.full_name,
    'avatar_url',      v_profile.avatar_url,
    'bio',             v_profile.bio,
    'occupation',      v_profile.occupation,
    'interests',       COALESCE(to_jsonb(v_profile.interests), '[]'::JSONB),
    'is_public',       COALESCE(v_profile.is_public, FALSE),
    'follower_count',  COALESCE(v_profile.follower_count,  0),
    'following_count', COALESCE(v_profile.following_count, 0),
    'public_reports',  v_pub_count,
    'total_views',     v_total_views,
    'is_following',    v_is_following,
    'is_own_profile',  v_is_own
  );
END;
$$;

-- get_public_reports_for_user
CREATE OR REPLACE FUNCTION get_public_reports_for_user(
  p_username TEXT,
  p_limit    INT DEFAULT 20,
  p_offset   INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id   UUID;
  v_is_public BOOLEAN;
  v_uid       UUID := auth.uid();
  v_result    JSONB;
BEGIN
  SELECT id, COALESCE(is_public, FALSE)
  INTO v_user_id, v_is_public
  FROM profiles WHERE username = p_username;

  IF NOT FOUND THEN RETURN '[]'::JSONB; END IF;
  IF NOT v_is_public AND (v_uid IS NULL OR v_uid != v_user_id) THEN
    RETURN '[]'::JSONB;
  END IF;

  BEGIN
    SELECT COALESCE(
      (
        SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC)
        FROM (
          SELECT jsonb_build_object(
            'share_id',          sl.share_id,
            'title',             COALESCE(rr.title, ''),
            'query',             COALESCE(rr.query, ''),
            'depth',             COALESCE(rr.depth, 'quick'),
            'executive_summary', SUBSTRING(COALESCE(rr.executive_summary, ''), 1, 200),
            'tags',              CASE
                                   WHEN sl.tags IS NULL THEN '[]'::JSONB
                                   WHEN jsonb_typeof(to_jsonb(sl.tags)) = 'array' THEN to_jsonb(sl.tags)
                                   ELSE '[]'::JSONB
                                 END,
            'sources_count',     COALESCE(rr.sources_count, 0),
            'reliability_score', COALESCE(rr.reliability_score, 0),
            'view_count',        COALESCE(sl.view_count, 0),
            'share_count',       COALESCE(sl.share_count, 0),
            'created_at',        rr.created_at,
            'completed_at',      rr.completed_at
          ) AS row_data
          FROM share_links      sl
          JOIN research_reports rr ON sl.report_id = rr.id
          WHERE rr.user_id   = v_user_id
            AND sl.is_active = TRUE
          ORDER BY rr.created_at DESC
          LIMIT p_limit OFFSET p_offset
        ) t
      ),
      '[]'::JSONB
    ) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result := '[]'::JSONB;
  END;

  RETURN v_result;
END;
$$;

-- get_following_feed
CREATE OR REPLACE FUNCTION get_following_feed(
  p_limit  INT         DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::JSONB; END IF;

  BEGIN
    SELECT COALESCE(
      (
        SELECT jsonb_agg(row_data ORDER BY (row_data->>'published_at') DESC)
        FROM (
          SELECT jsonb_build_object(
            'share_id',          sl.share_id,
            'report_id',         rr.id,
            'title',             COALESCE(rr.title, ''),
            'query',             COALESCE(rr.query, ''),
            'depth',             COALESCE(rr.depth, 'quick'),
            'executive_summary', SUBSTRING(COALESCE(rr.executive_summary, ''), 1, 200),
            'tags',              CASE
                                   WHEN sl.tags IS NULL THEN '[]'::JSONB
                                   WHEN jsonb_typeof(to_jsonb(sl.tags)) = 'array' THEN to_jsonb(sl.tags)
                                   ELSE '[]'::JSONB
                                 END,
            'sources_count',     COALESCE(rr.sources_count, 0),
            'reliability_score', COALESCE(rr.reliability_score, 0),
            'view_count',        COALESCE(sl.view_count, 0),
            'published_at',      sl.created_at,
            'author_id',         p.id,
            'author_username',   p.username,
            'author_full_name',  p.full_name,
            'author_avatar_url', p.avatar_url
          ) AS row_data
          FROM user_follows uf
          JOIN profiles         p  ON uf.following_id = p.id
          JOIN research_reports rr ON rr.user_id      = p.id
          JOIN share_links      sl ON sl.report_id    = rr.id
          WHERE uf.follower_id = v_uid
            AND sl.is_active   = TRUE
            AND sl.created_at  < p_cursor
          ORDER BY sl.created_at DESC
          LIMIT p_limit
        ) t
      ),
      '[]'::JSONB
    ) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result := '[]'::JSONB;
  END;

  RETURN v_result;
END;
$$;

-- get_user_followers
CREATE OR REPLACE FUNCTION get_user_followers(
  p_user_id UUID,
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'joined_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',           p.id,
          'username',     p.username,
          'full_name',    p.full_name,
          'avatar_url',   p.avatar_url,
          'bio',          p.bio,
          'joined_at',    uf.created_at,
          'is_following', CASE WHEN v_uid IS NOT NULL THEN
            EXISTS(SELECT 1 FROM user_follows
                   WHERE follower_id = v_uid AND following_id = p.id)
            ELSE FALSE END
        ) AS row_data
        FROM user_follows uf
        JOIN profiles p ON uf.follower_id = p.id
        WHERE uf.following_id = p_user_id
        ORDER BY uf.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;

-- get_user_following
CREATE OR REPLACE FUNCTION get_user_following(
  p_user_id UUID,
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'joined_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',           p.id,
          'username',     p.username,
          'full_name',    p.full_name,
          'avatar_url',   p.avatar_url,
          'bio',          p.bio,
          'joined_at',    uf.created_at,
          'is_following', CASE WHEN v_uid IS NOT NULL THEN
            EXISTS(SELECT 1 FROM user_follows
                   WHERE follower_id = v_uid AND following_id = p.id)
            ELSE FALSE END
        ) AS row_data
        FROM user_follows uf
        JOIN profiles p ON uf.following_id = p.id
        WHERE uf.follower_id = p_user_id
        ORDER BY uf.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;

-- get_follow_notifications
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
          'actor_username',   p.username,
          'actor_full_name',  p.full_name,
          'actor_avatar_url', p.avatar_url,
          'report_title',     rr.title
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

-- mark_follow_notifications_read
CREATE OR REPLACE FUNCTION mark_follow_notifications_read()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE follow_notifications
  SET read = TRUE
  WHERE recipient_id = auth.uid() AND read = FALSE;
END;
$$;

-- get_unread_follow_notifications_count
CREATE OR REPLACE FUNCTION get_unread_follow_notifications_count()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM follow_notifications
  WHERE recipient_id = auth.uid() AND read = FALSE;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- notify_followers_of_new_report
CREATE OR REPLACE FUNCTION notify_followers_of_new_report(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_author_id UUID;
  v_follower  RECORD;
BEGIN
  SELECT user_id INTO v_author_id
  FROM research_reports WHERE id = p_report_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_follower IN
    SELECT follower_id FROM user_follows WHERE following_id = v_author_id
  LOOP
    INSERT INTO follow_notifications (recipient_id, actor_id, type, report_id)
    VALUES (v_follower.follower_id, v_author_id, 'new_report', p_report_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- get_social_stats
CREATE OR REPLACE FUNCTION get_social_stats(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid   UUID := COALESCE(p_user_id, auth.uid());
  v_fc    INTEGER := 0;
  v_fgc   INTEGER := 0;
  v_prc   INTEGER := 0;
  v_views BIGINT  := 0;
BEGIN
  SELECT
    COALESCE(follower_count,  0),
    COALESCE(following_count, 0)
  INTO v_fc, v_fgc
  FROM profiles WHERE id = v_uid;

  BEGIN
    SELECT COUNT(*), COALESCE(SUM(sl.view_count), 0)
    INTO v_prc, v_views
    FROM share_links      sl
    JOIN research_reports rr ON sl.report_id = rr.id
    WHERE rr.user_id   = v_uid
      AND sl.is_active = TRUE
      AND rr.status    = 'completed';
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'follower_count',       COALESCE(v_fc,    0),
    'following_count',      COALESCE(v_fgc,   0),
    'public_reports_count', COALESCE(v_prc,   0),
    'total_views',          COALESCE(v_views, 0)
  );
END;
$$;

-- get_explore_researchers
CREATE OR REPLACE FUNCTION get_explore_researchers(
  p_sort   TEXT    DEFAULT 'followers',
  p_search TEXT    DEFAULT NULL,
  p_limit  INT     DEFAULT 20,
  p_offset INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data)
      FROM (
        SELECT jsonb_build_object(
          'id',              p.id,
          'username',        p.username,
          'full_name',       p.full_name,
          'avatar_url',      p.avatar_url,
          'bio',             p.bio,
          'interests',       COALESCE(to_jsonb(p.interests), '[]'::JSONB),
          'follower_count',  COALESCE(p.follower_count,  0),
          'following_count', COALESCE(p.following_count, 0),
          'report_count',    (
            SELECT COUNT(*) FROM research_reports
            WHERE user_id = p.id AND status = 'completed'
          )::INT,
          'recent_reports',  (
            SELECT COUNT(*) FROM research_reports
            WHERE user_id   = p.id
              AND status    = 'completed'
              AND created_at > NOW() - INTERVAL '30 days'
          )::INT,
          'is_following',    CASE WHEN v_uid IS NOT NULL THEN
            EXISTS(
              SELECT 1 FROM user_follows
              WHERE follower_id = v_uid AND following_id = p.id
            )
            ELSE FALSE END
        ) AS row_data
        FROM profiles p
        WHERE p.is_public         = TRUE
          AND p.profile_completed = TRUE
          AND (v_uid IS NULL OR p.id != v_uid)
          AND (
            p_search IS NULL
            OR p_search = ''
            OR p.full_name ILIKE '%' || p_search || '%'
            OR p.username  ILIKE '%' || p_search || '%'
            OR p.bio       ILIKE '%' || p_search || '%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.interests, ARRAY[]::TEXT[])) AS interest
              WHERE interest ILIKE '%' || p_search || '%'
            )
          )
        ORDER BY
          CASE WHEN p_sort = 'followers'
            THEN COALESCE(p.follower_count, 0) ELSE 0
          END DESC,
          CASE WHEN p_sort = 'active' THEN (
            SELECT COUNT(*) FROM research_reports
            WHERE user_id   = p.id
              AND status    = 'completed'
              AND created_at > NOW() - INTERVAL '30 days'
          )::INT ELSE 0 END DESC,
          CASE WHEN p_sort = 'newest'
            THEN p.created_at
            ELSE '1970-01-01'::TIMESTAMPTZ
          END DESC,
          COALESCE(p.follower_count, 0) DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;

-- get_suggested_researchers
CREATE OR REPLACE FUNCTION get_suggested_researchers(p_limit INT DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       UUID   := auth.uid();
  v_interests TEXT[];
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::JSONB; END IF;

  SELECT COALESCE(interests, ARRAY[]::TEXT[]) INTO v_interests
  FROM profiles WHERE id = v_uid;

  IF array_length(v_interests, 1) IS NULL THEN
    RETURN get_explore_researchers('followers', NULL, p_limit, 0);
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        row_data
        ORDER BY
          (row_data->>'overlap_count')::INT  DESC,
          (row_data->>'follower_count')::INT DESC
      )
      FROM (
        SELECT jsonb_build_object(
          'id',             p.id,
          'username',       p.username,
          'full_name',      p.full_name,
          'avatar_url',     p.avatar_url,
          'bio',            p.bio,
          'interests',      COALESCE(to_jsonb(p.interests), '[]'::JSONB),
          'follower_count', COALESCE(p.follower_count, 0),
          'report_count',   (
            SELECT COUNT(*) FROM research_reports
            WHERE user_id = p.id AND status = 'completed'
          )::INT,
          'is_following',   FALSE,
          'overlap_count',  (
            SELECT COUNT(*)
            FROM unnest(COALESCE(p.interests, ARRAY[]::TEXT[])) AS i
            WHERE i = ANY(v_interests)
          )::INT
        ) AS row_data
        FROM profiles p
        WHERE p.is_public         = TRUE
          AND p.profile_completed = TRUE
          AND p.id                != v_uid
          AND NOT EXISTS (
            SELECT 1 FROM user_follows
            WHERE follower_id = v_uid AND following_id = p.id
          )
          AND COALESCE(p.interests, ARRAY[]::TEXT[]) && v_interests
        ORDER BY (
          SELECT COUNT(*)
          FROM unnest(COALESCE(p.interests, ARRAY[]::TEXT[])) AS i
          WHERE i = ANY(v_interests)
        ) DESC,
        COALESCE(p.follower_count, 0) DESC
        LIMIT p_limit
      ) t
    ),
    get_explore_researchers('followers', NULL, p_limit, 0)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Enable Realtime on user_follows + follow_notifications in the Dashboard.
-- ─────────────────────────────────────────────────────────────────────────────