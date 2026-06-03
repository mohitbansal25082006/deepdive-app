-- ============================================================
-- DeepDive AI — Part 47: Full Realtime Chat System
-- Run in Supabase SQL Editor — safe on top of Parts 17/18
-- ============================================================

-- ── 1. REPLICA IDENTITY FULL (required for DELETE events) ────────────────────
-- workspace_chat_messages already has this from Part 17
ALTER TABLE public.chat_message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_pinned_messages   REPLICA IDENTITY FULL;
ALTER TABLE public.chat_read_receipts     REPLICA IDENTITY FULL;

-- ── 2. Ensure all chat tables are in the Realtime publication ─────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pinned_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. RPC: Fetch ONE message with full details for realtime INSERT hydration ──
-- Called by useChatRealtime when a new message is inserted via Realtime.
-- Returns camelCase JSONB with author profile, reply preview, and reactions.

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

  IF NOT FOUND                           THEN RETURN NULL; END IF;
  IF NOT public.is_chat_member(v_ws_id)  THEN RETURN NULL; END IF;

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
          'authorName', rp.full_name
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

-- ── 4. RPC: Fresh reaction summary for one message (used by realtime listener) ─

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

-- ── 5. Improve FTS index: 'simple' dictionary for better multilingual search ──

DROP INDEX IF EXISTS public.idx_chat_messages_fts;

CREATE INDEX IF NOT EXISTS idx_chat_messages_fts
  ON public.workspace_chat_messages
  USING gin(to_tsvector('simple', content))
  WHERE is_deleted = FALSE;

-- ── Done ──────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';