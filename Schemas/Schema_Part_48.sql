-- ============================================================
-- DeepDive AI — Part 48: Chat System Fixes & Real-time Overhaul
-- Run in Supabase SQL Editor
-- Safe on top of Parts 17/18/47
-- ============================================================

-- ── 1. Ensure REPLICA IDENTITY FULL on all chat tables ───────────────────────
-- Required for DELETE events to carry the old row data.

ALTER TABLE public.workspace_chat_messages  REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_reactions   REPLICA IDENTITY FULL;
ALTER TABLE public.chat_pinned_messages     REPLICA IDENTITY FULL;
ALTER TABLE public.chat_read_receipts       REPLICA IDENTITY FULL;

-- ── 2. Ensure all chat tables are in the Realtime publication ─────────────────

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_chat_messages;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pinned_messages;     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Fix RLS SELECT policies to allow ALL workspace members to receive
--       real-time events. Supabase Realtime checks SELECT RLS before emitting
--       postgres_changes events. If User B cannot SELECT a row, they never
--       receive the INSERT/UPDATE/DELETE event even if they are a member.
--       The existing policy only checked is_chat_member (owner/editor) which
--       is correct — but we need to ensure the policy is PERMISSIVE and covers
--       the Realtime path too. Recreate cleanly. ─────────────────────────────

-- workspace_chat_messages
DROP POLICY IF EXISTS "chat_msg_select_editor"             ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_select_member_realtime"    ON public.workspace_chat_messages;

CREATE POLICY "chat_msg_select_editor"
    ON public.workspace_chat_messages FOR SELECT TO authenticated
    USING (public.is_chat_member(workspace_id));

-- chat_message_reactions: ensure members can SELECT for realtime
DROP POLICY IF EXISTS "chat_react_select_editor"           ON public.chat_message_reactions;

CREATE POLICY "chat_react_select_editor"
    ON public.chat_message_reactions FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_chat_messages m
            WHERE m.id = message_id
              AND public.is_chat_member(m.workspace_id)
        )
    );

-- chat_pinned_messages: ensure members can SELECT for realtime (including DELETE events)
DROP POLICY IF EXISTS "chat_pin_select_editor"             ON public.chat_pinned_messages;

CREATE POLICY "chat_pin_select_editor"
    ON public.chat_pinned_messages FOR SELECT TO authenticated
    USING (public.is_chat_member(workspace_id));

-- ── 4. FIX: get_chat_message_by_id RPC — ensure it works for all callers ─────
-- Dropped and recreated to fix potential caching issues with SECURITY DEFINER.

DROP FUNCTION IF EXISTS public.get_chat_message_by_id(uuid);

CREATE OR REPLACE FUNCTION public.get_chat_message_by_id(
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws_id UUID;
BEGIN
  SELECT workspace_id INTO v_ws_id
  FROM   public.workspace_chat_messages
  WHERE  id = p_message_id;

  IF NOT FOUND                          THEN RETURN NULL; END IF;
  IF NOT public.is_chat_member(v_ws_id) THEN RETURN NULL; END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id',          m.id,
      'workspaceId', m.workspace_id,
      'userId',      m.user_id,
      'content',
        CASE WHEN m.is_deleted THEN '[Message deleted]' ELSE m.content END,
      'contentType', m.content_type,
      'replyToId',   m.reply_to_id,
      'attachments',
        CASE WHEN m.is_deleted THEN '[]'::jsonb
             ELSE COALESCE(m.attachments, '[]'::jsonb) END,
      'mentions',    m.mentions,
      'isEdited',    m.is_edited,
      'isDeleted',   m.is_deleted,
      'isPinned',    EXISTS (
                       SELECT 1 FROM public.chat_pinned_messages pm
                       WHERE  pm.message_id   = m.id
                         AND  pm.workspace_id = m.workspace_id
                     ),
      'createdAt',   m.created_at,
      'updatedAt',   m.updated_at,
      'author',
        CASE WHEN m.user_id IS NOT NULL
          THEN jsonb_build_object(
            'id',        p.id,
            'username',  p.username,
            'fullName',  p.full_name,
            'avatarUrl', p.avatar_url
          )
          ELSE NULL
        END,
      'replyTo', (
        SELECT jsonb_build_object(
          'id',         rm.id,
          'content',
            CASE WHEN rm.is_deleted THEN '[Message deleted]' ELSE rm.content END,
          'userId',     rm.user_id,
          'authorName', COALESCE(rp.full_name, rp.username, 'Unknown'),
          'attachments', COALESCE(rm.attachments, '[]'::jsonb)
        )
        FROM   public.workspace_chat_messages rm
        LEFT JOIN public.profiles rp ON rp.id = rm.user_id
        WHERE  rm.id = m.reply_to_id
      ),
      'reactions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'emoji',      r.emoji,
          'count',      r.cnt,
          'hasReacted', r.has_reacted
        )), '[]'::jsonb)
        FROM (
          SELECT
            emoji,
            COUNT(*)                      AS cnt,
            BOOL_OR(user_id = auth.uid()) AS has_reacted
          FROM   public.chat_message_reactions
          WHERE  message_id = m.id
          GROUP  BY emoji
        ) r
      )
    )
    FROM  public.workspace_chat_messages m
    LEFT  JOIN public.profiles p ON p.id = m.user_id
    WHERE m.id = p_message_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_message_by_id(uuid) TO authenticated;

-- ── 5. FIX: get_message_reactions RPC ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_message_reactions(uuid);

CREATE OR REPLACE FUNCTION public.get_message_reactions(
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'emoji',      r.emoji,
      'count',      r.cnt,
      'hasReacted', r.has_reacted
    )), '[]'::jsonb)
    FROM (
      SELECT
        emoji,
        COUNT(*)                      AS cnt,
        BOOL_OR(user_id = auth.uid()) AS has_reacted
      FROM   public.chat_message_reactions
      WHERE  message_id = p_message_id
      GROUP  BY emoji
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_message_reactions(uuid) TO authenticated;

-- ── 6. FIX: get_chat_messages — include attachments in replyTo preview ────────
-- Also fixes: reply preview showing attachment name for attachment-only messages.

DROP FUNCTION IF EXISTS public.get_chat_messages(UUID, INT, UUID);

CREATE OR REPLACE FUNCTION public.get_chat_messages(
    p_workspace_id UUID,
    p_limit        INT  DEFAULT 40,
    p_before_id    UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_before_ts TIMESTAMPTZ;
    v_rows      JSONB;
BEGIN
    IF NOT public.is_chat_member(p_workspace_id) THEN
        RAISE EXCEPTION 'not_chat_member';
    END IF;

    IF p_before_id IS NOT NULL THEN
        SELECT created_at INTO v_before_ts
        FROM public.workspace_chat_messages
        WHERE id = p_before_id;
    END IF;

    SELECT jsonb_agg(row_data ORDER BY row_data->>'createdAt' ASC)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'id',           m.id,
            'workspaceId',  m.workspace_id,
            'userId',       m.user_id,
            'content',      CASE WHEN m.is_deleted
                                 THEN '[Message deleted]'
                                 ELSE m.content
                            END,
            'contentType',  m.content_type,
            'replyToId',    m.reply_to_id,
            'attachments',  CASE WHEN m.is_deleted
                                 THEN '[]'::jsonb
                                 ELSE COALESCE(m.attachments, '[]'::jsonb)
                            END,
            'mentions',     m.mentions,
            'isEdited',     m.is_edited,
            'isDeleted',    m.is_deleted,
            'createdAt',    m.created_at,
            'updatedAt',    m.updated_at,
            'author', CASE WHEN m.user_id IS NOT NULL
                THEN jsonb_build_object(
                    'id',        p.id,
                    'username',  p.username,
                    'fullName',  p.full_name,
                    'avatarUrl', p.avatar_url
                )
                ELSE NULL
            END,
            'replyTo', (
                SELECT jsonb_build_object(
                    'id',         rm.id,
                    'content',    CASE WHEN rm.is_deleted
                                       THEN '[Message deleted]'
                                       ELSE rm.content
                                  END,
                    'userId',     rm.user_id,
                    'authorName', COALESCE(rp.full_name, rp.username, 'Unknown'),
                    'attachments', COALESCE(rm.attachments, '[]'::jsonb)
                )
                FROM public.workspace_chat_messages rm
                LEFT JOIN public.profiles rp ON rp.id = rm.user_id
                WHERE rm.id = m.reply_to_id
            ),
            'reactions', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'emoji',      r.emoji,
                    'count',      r.cnt,
                    'hasReacted', r.has_reacted
                )), '[]'::jsonb)
                FROM (
                    SELECT
                        emoji,
                        COUNT(*)                      AS cnt,
                        BOOL_OR(user_id = auth.uid()) AS has_reacted
                    FROM public.chat_message_reactions
                    WHERE message_id = m.id
                    GROUP BY emoji
                ) r
            ),
            'isPinned', EXISTS (
                SELECT 1 FROM public.chat_pinned_messages
                WHERE message_id = m.id
                  AND workspace_id = p_workspace_id
            )
        ) AS row_data
        FROM public.workspace_chat_messages m
        LEFT JOIN public.profiles p ON p.id = m.user_id
        WHERE m.workspace_id = p_workspace_id
          AND (v_before_ts IS NULL OR m.created_at < v_before_ts)
        ORDER BY m.created_at DESC
        LIMIT p_limit
    ) sub;

    RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_messages(UUID, INT, UUID) TO authenticated;

-- ── 7. FIX: send_chat_message — include attachments in replyTo preview ────────

DROP FUNCTION IF EXISTS public.send_chat_message(UUID, TEXT, TEXT, UUID, JSONB, UUID[]);

CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_workspace_id UUID,
  p_content      TEXT,
  p_content_type TEXT    DEFAULT 'text',
  p_reply_to_id  UUID    DEFAULT NULL,
  p_attachments  JSONB   DEFAULT '[]',
  p_mentions     UUID[]  DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID;
  v_msg_id           UUID;
  v_reply_content    TEXT    := NULL;
  v_reply_user_id    UUID    := NULL;
  v_reply_author     TEXT    := NULL;
  v_reply_attachments JSONB  := '[]'::jsonb;
  v_author_id        UUID;
  v_author_username  TEXT;
  v_author_fullname  TEXT;
  v_author_avatar    TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_chat_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.workspace_chat_messages (
    workspace_id,  user_id,    content,       content_type,
    reply_to_id,   attachments, mentions
  ) VALUES (
    p_workspace_id, v_user_id, p_content,     p_content_type,
    p_reply_to_id,
    COALESCE(p_attachments, '[]'::jsonb),
    COALESCE(p_mentions,    '{}'::uuid[])
  )
  RETURNING id INTO v_msg_id;

  -- Fetch reply preview including attachments for attachment-only messages
  IF p_reply_to_id IS NOT NULL THEN
    SELECT
      m.content,
      m.user_id,
      COALESCE(pr.full_name, pr.username, 'Unknown'),
      COALESCE(m.attachments, '[]'::jsonb)
    INTO
      v_reply_content,
      v_reply_user_id,
      v_reply_author,
      v_reply_attachments
    FROM public.workspace_chat_messages m
    LEFT JOIN public.profiles pr ON pr.id = m.user_id
    WHERE m.id = p_reply_to_id;
  END IF;

  -- Fetch sender profile
  SELECT id, username, full_name, avatar_url
  INTO   v_author_id, v_author_username, v_author_fullname, v_author_avatar
  FROM   public.profiles
  WHERE  id = v_user_id;

  RETURN (
    SELECT jsonb_build_object(
      'id',           m.id,
      'workspace_id', m.workspace_id,
      'user_id',      m.user_id,
      'content',      m.content,
      'content_type', m.content_type,
      'reply_to_id',  m.reply_to_id,
      'reply_to',     CASE
                        WHEN p_reply_to_id IS NOT NULL
                        THEN jsonb_build_object(
                          'id',          p_reply_to_id,
                          'content',     COALESCE(v_reply_content,      ''),
                          'user_id',     COALESCE(v_reply_user_id::text, ''),
                          'author_name', v_reply_author,
                          'attachments', v_reply_attachments
                        )
                        ELSE NULL
                      END,
      'attachments',  m.attachments,
      'mentions',     m.mentions,
      'is_edited',    FALSE,
      'is_deleted',   FALSE,
      'is_pinned',    FALSE,
      'reactions',    '[]'::JSONB,
      'author',       jsonb_build_object(
                        'id',         v_author_id,
                        'username',   v_author_username,
                        'full_name',  v_author_fullname,
                        'avatar_url', v_author_avatar
                      ),
      'created_at',   m.created_at,
      'updated_at',   m.updated_at
    )
    FROM public.workspace_chat_messages m
    WHERE m.id = v_msg_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT, TEXT, UUID, JSONB, UUID[]) TO authenticated;

-- ── 8. Improve FTS index: use 'simple' for multilingual ──────────────────────

DROP INDEX IF EXISTS public.idx_chat_messages_fts;

CREATE INDEX IF NOT EXISTS idx_chat_messages_fts
  ON public.workspace_chat_messages
  USING gin(to_tsvector('simple', content))
  WHERE is_deleted = FALSE;

-- ── 9. Recreate search_chat_messages with 'simple' dictionary ────────────────

DROP FUNCTION IF EXISTS public.search_chat_messages(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.search_chat_messages(
    p_workspace_id UUID,
    p_query        TEXT,
    p_limit        INT DEFAULT 20
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF NOT public.is_chat_member(p_workspace_id) THEN
        RAISE EXCEPTION 'not_chat_member';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',          m.id,
        'workspaceId', m.workspace_id,
        'userId',      m.user_id,
        'content',     m.content,
        'contentType', m.content_type,
        'attachments', COALESCE(m.attachments, '[]'::jsonb),
        'replyToId',   m.reply_to_id,
        'mentions',    m.mentions,
        'isEdited',    m.is_edited,
        'isDeleted',   m.is_deleted,
        'isPinned',    FALSE,
        'reactions',   '[]'::jsonb,
        'createdAt',   m.created_at,
        'updatedAt',   m.updated_at,
        'author', jsonb_build_object(
            'id',        p.id,
            'username',  p.username,
            'fullName',  p.full_name,
            'avatarUrl', p.avatar_url
        )
    ) ORDER BY m.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.workspace_chat_messages m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
      AND m.is_deleted   = FALSE
      AND to_tsvector('simple', m.content) @@ plainto_tsquery('simple', p_query)
    LIMIT p_limit;

    RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_chat_messages(UUID, TEXT, INT) TO authenticated;

-- ── Done ──────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';