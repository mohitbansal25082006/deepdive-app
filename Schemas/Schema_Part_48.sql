-- ============================================================
-- DeepDive AI — Chat System: Complete RLS & Real-time Overhaul
-- Combines: schema_chat_fix.sql + Part 48 Chat System Fixes
--
-- ROOT CAUSE (documented):
--   Supabase Realtime evaluates the SELECT RLS policy for EACH subscriber
--   when a row is inserted. If the SELECT policy only allows the sender
--   (auth.uid() = user_id), other workspace members fail the RLS check
--   and never receive INSERT events — messages silently disappear for
--   everyone except the sender.
--
-- FIX: SELECT policies must allow ANY workspace member to read messages
--   from their workspace, so Realtime can deliver events to all subscribers.
--
-- Safe to run on top of Parts 17 / 18 / 47.
-- Run in your Supabase SQL Editor.
-- ============================================================


-- ── 1. REPLICA IDENTITY FULL on all chat tables ───────────────────────────────
-- Required so DELETE events carry the old row data (e.g. workspace_id for
-- the pins channel DELETE handler).

ALTER TABLE public.workspace_chat_messages  REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_reactions   REPLICA IDENTITY FULL;
ALTER TABLE public.chat_pinned_messages     REPLICA IDENTITY FULL;
ALTER TABLE public.chat_read_receipts       REPLICA IDENTITY FULL;


-- ── 2. Ensure all chat tables are in the Realtime publication ─────────────────

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_chat_messages;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pinned_messages;     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 3. RLS: Drop ALL existing policies on workspace_chat_messages ─────────────
-- Clears any previously applied policy names from schema_chat_fix.sql,
-- Part 48, or earlier migrations to avoid conflicts.

ALTER TABLE public.workspace_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_chat_messages_select"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "workspace_chat_messages_insert"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "workspace_chat_messages_update"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "workspace_chat_messages_delete"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Members can read workspace chat messages" ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Members can insert workspace chat messages" ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Authors can update their messages"        ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Authors and owners can delete messages"   ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "select_workspace_chat_messages"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "insert_workspace_chat_messages"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "update_workspace_chat_messages"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "delete_workspace_chat_messages"          ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_select_workspace_members"           ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_insert_editors_owners"              ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_update_own_messages"                ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_delete_author_or_owner"             ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_select_editor"                  ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_select_member_realtime"         ON public.workspace_chat_messages;


-- ── 4. RLS: Recreate policies for workspace_chat_messages ────────────────────

-- SELECT — any workspace member (owner, editor, viewer) can read messages.
-- CRITICAL for Realtime: Supabase evaluates this for every subscriber on
-- INSERT. All members must pass, not just the sender.
CREATE POLICY "chat_msg_select_editor"
    ON public.workspace_chat_messages
    FOR SELECT TO authenticated
    USING (public.is_chat_member(workspace_id));

-- INSERT — only owners and editors can send messages.
CREATE POLICY "chat_insert_editors_owners"
    ON public.workspace_chat_messages
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_chat_messages.workspace_id
              AND wm.user_id      = auth.uid()
              AND wm.role         IN ('owner', 'editor')
        )
    );

-- UPDATE — only the message author can edit their own messages.
CREATE POLICY "chat_update_own_messages"
    ON public.workspace_chat_messages
    FOR UPDATE
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE — only the message author OR a workspace owner can delete.
CREATE POLICY "chat_delete_author_or_owner"
    ON public.workspace_chat_messages
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_chat_messages.workspace_id
              AND wm.user_id      = auth.uid()
              AND wm.role         = 'owner'
        )
    );


-- ── 5. RLS: Fix SELECT policies on related chat tables ───────────────────────
-- Supabase Realtime checks SELECT RLS before emitting postgres_changes events.
-- All members must be able to SELECT rows to receive events.

-- chat_message_reactions
DROP POLICY IF EXISTS "chat_react_select_editor" ON public.chat_message_reactions;

CREATE POLICY "chat_react_select_editor"
    ON public.chat_message_reactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_chat_messages m
            WHERE m.id = message_id
              AND public.is_chat_member(m.workspace_id)
        )
    );

-- chat_pinned_messages (covers Realtime DELETE events that need workspace_id)
DROP POLICY IF EXISTS "chat_pin_select_editor" ON public.chat_pinned_messages;

CREATE POLICY "chat_pin_select_editor"
    ON public.chat_pinned_messages
    FOR SELECT TO authenticated
    USING (public.is_chat_member(workspace_id));


-- ── 6. FTS index: use 'simple' dictionary for multilingual support ────────────

DROP INDEX IF EXISTS public.idx_chat_messages_fts;

CREATE INDEX IF NOT EXISTS idx_chat_messages_fts
    ON public.workspace_chat_messages
    USING gin(to_tsvector('simple', content))
    WHERE is_deleted = FALSE;


-- ── 7. RPC: get_chat_message_by_id ───────────────────────────────────────────
-- Recreated (SECURITY DEFINER) to fix potential caching issues and ensure
-- it works correctly for all authenticated callers.

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
                    'id',          rm.id,
                    'content',
                        CASE WHEN rm.is_deleted THEN '[Message deleted]' ELSE rm.content END,
                    'userId',      rm.user_id,
                    'authorName',  COALESCE(rp.full_name, rp.username, 'Unknown'),
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


-- ── 8. RPC: get_message_reactions ────────────────────────────────────────────

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


-- ── 9. RPC: get_chat_messages ─────────────────────────────────────────────────
-- Includes attachments in replyTo preview (fixes reply preview for
-- attachment-only messages). Returns messages in ascending order.

DROP FUNCTION IF EXISTS public.get_chat_messages(UUID, INT, UUID);

CREATE OR REPLACE FUNCTION public.get_chat_messages(
    p_workspace_id UUID,
    p_limit        INT  DEFAULT 40,
    p_before_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
                    'id',          rm.id,
                    'content',
                        CASE WHEN rm.is_deleted THEN '[Message deleted]' ELSE rm.content END,
                    'userId',      rm.user_id,
                    'authorName',  COALESCE(rp.full_name, rp.username, 'Unknown'),
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
                WHERE message_id   = m.id
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


-- ── 10. RPC: send_chat_message ────────────────────────────────────────────────
-- Includes attachments in replyTo preview so attachment-only reply previews
-- render correctly on the client.

DROP FUNCTION IF EXISTS public.send_chat_message(UUID, TEXT, TEXT, UUID, JSONB, UUID[]);

CREATE OR REPLACE FUNCTION public.send_chat_message(
    p_workspace_id UUID,
    p_content      TEXT,
    p_content_type TEXT   DEFAULT 'text',
    p_reply_to_id  UUID   DEFAULT NULL,
    p_attachments  JSONB  DEFAULT '[]',
    p_mentions     UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id           UUID;
    v_msg_id            UUID;
    v_reply_content     TEXT  := NULL;
    v_reply_user_id     UUID  := NULL;
    v_reply_author      TEXT  := NULL;
    v_reply_attachments JSONB := '[]'::jsonb;
    v_author_id         UUID;
    v_author_username   TEXT;
    v_author_fullname   TEXT;
    v_author_avatar     TEXT;
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

    -- Fetch reply preview (includes attachments for attachment-only messages)
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
            'reply_to',
                CASE WHEN p_reply_to_id IS NOT NULL
                    THEN jsonb_build_object(
                        'id',          p_reply_to_id,
                        'content',     COALESCE(v_reply_content,       ''),
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


-- ── 11. RPC: search_chat_messages ────────────────────────────────────────────
-- Uses 'simple' dictionary for multilingual full-text search support.

DROP FUNCTION IF EXISTS public.search_chat_messages(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.search_chat_messages(
    p_workspace_id UUID,
    p_query        TEXT,
    p_limit        INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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


-- ── 12. Verify applied RLS policies ──────────────────────────────────────────

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'workspace_chat_messages'
ORDER BY cmd;


-- ── 13. Reload PostgREST schema cache ────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ── Done ──────────────────────────────────────────────────────────────────────