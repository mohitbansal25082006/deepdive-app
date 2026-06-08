-- ============================================================
-- DeepDive AI — Part 49: REVERT Custom Chat + Stream Chat Schema
-- Combined Migration File
--
-- SECTION A — Reverts all Supabase-based chat tables, RPCs, policies,
--             and storage created in Parts 17 / 18 / 47 / 48.
-- SECTION B — Adds Stream Chat mapping table and RPCs.
--
-- SAFE: workspace_notification_preferences table is KEPT because
--       it is still used by workspaceNotificationService.ts for @mention
--       and system notification preferences (unrelated to chat delivery).
--
-- SAFE: Storage bucket chat-attachments is KEPT because existing
--       signed URLs in old messages may still be referenced. Stream will
--       upload new attachments to its own CDN going forward.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════════╗
-- ║              SECTION A — REVERT CUSTOM CHAT                 ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ── A-1. Drop RPCs (chat delivery — no longer needed) ─────────────────────────

DROP FUNCTION IF EXISTS public.get_chat_message_by_id(uuid)                              CASCADE;
DROP FUNCTION IF EXISTS public.get_message_reactions(uuid)                                CASCADE;
DROP FUNCTION IF EXISTS public.get_chat_messages(uuid, int, uuid)                        CASCADE;
DROP FUNCTION IF EXISTS public.send_chat_message(uuid, text, text, uuid, jsonb, uuid[])  CASCADE;
DROP FUNCTION IF EXISTS public.send_chat_message(uuid, text, text, uuid, jsonb)          CASCADE;
DROP FUNCTION IF EXISTS public.edit_chat_message(uuid, text)                             CASCADE;
DROP FUNCTION IF EXISTS public.delete_chat_message(uuid)                                 CASCADE;
DROP FUNCTION IF EXISTS public.toggle_chat_reaction(uuid, text)                          CASCADE;
DROP FUNCTION IF EXISTS public.mark_messages_read(uuid, uuid)                            CASCADE;
DROP FUNCTION IF EXISTS public.get_chat_unread_count(uuid)                               CASCADE;
DROP FUNCTION IF EXISTS public.pin_chat_message(uuid)                                    CASCADE;
DROP FUNCTION IF EXISTS public.unpin_chat_message(uuid)                                  CASCADE;
DROP FUNCTION IF EXISTS public.get_pinned_chat_messages(uuid)                            CASCADE;
DROP FUNCTION IF EXISTS public.search_chat_messages(uuid, text, int)                     CASCADE;
DROP FUNCTION IF EXISTS public.get_chat_members(uuid)                                    CASCADE;
DROP FUNCTION IF EXISTS public.get_user_chat_stats(uuid)                                 CASCADE;
DROP FUNCTION IF EXISTS public.is_chat_member(uuid)                                      CASCADE;

-- Catch any overloaded variants of send_chat_message
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM   pg_proc
    WHERE  proname = 'send_chat_message'
      AND  pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END;
$$;


-- ── A-2. Remove tables from Realtime publication ──────────────────────────────

DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.workspace_chat_messages;  EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_message_reactions;   EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_read_receipts;       EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_pinned_messages;     EXCEPTION WHEN undefined_object THEN NULL; END $$;


-- ── A-3. Drop triggers ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_chat_messages_updated_at ON public.workspace_chat_messages;


-- ── A-4. Drop indexes (will be removed with tables, but explicit for safety) ──

DROP INDEX IF EXISTS public.idx_chat_messages_workspace;
DROP INDEX IF EXISTS public.idx_chat_messages_user;
DROP INDEX IF EXISTS public.idx_chat_messages_reply;
DROP INDEX IF EXISTS public.idx_chat_messages_mentions;
DROP INDEX IF EXISTS public.idx_chat_messages_fts;
DROP INDEX IF EXISTS public.idx_chat_reactions_message;
DROP INDEX IF EXISTS public.idx_read_receipts_workspace;
DROP INDEX IF EXISTS public.idx_pinned_messages_workspace;


-- ── A-5. Drop RLS policies on chat tables ─────────────────────────────────────

-- workspace_chat_messages
DROP POLICY IF EXISTS "chat_msg_select_editor"                    ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert_editor"                    ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_update_own"                       ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_msg_delete_own_or_owner"              ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_insert_editors_owners"                ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_update_own_messages"                  ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "chat_delete_author_or_owner"               ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Members can read workspace chat messages"  ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Members can insert workspace chat messages" ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Authors can update their messages"         ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Authors and owners can delete messages"    ON public.workspace_chat_messages;

-- chat_message_reactions
DROP POLICY IF EXISTS "chat_react_select_editor" ON public.chat_message_reactions;
DROP POLICY IF EXISTS "chat_react_insert_editor" ON public.chat_message_reactions;
DROP POLICY IF EXISTS "chat_react_delete_own"    ON public.chat_message_reactions;

-- chat_read_receipts
DROP POLICY IF EXISTS "chat_rr_select_editor" ON public.chat_read_receipts;
DROP POLICY IF EXISTS "chat_rr_upsert_own"    ON public.chat_read_receipts;
DROP POLICY IF EXISTS "chat_rr_update_own"    ON public.chat_read_receipts;

-- chat_pinned_messages
DROP POLICY IF EXISTS "chat_pin_select_editor" ON public.chat_pinned_messages;
DROP POLICY IF EXISTS "chat_pin_insert_editor" ON public.chat_pinned_messages;
DROP POLICY IF EXISTS "chat_pin_delete_editor" ON public.chat_pinned_messages;


-- ── A-6. Drop chat tables (CASCADE removes foreign key references) ─────────────
-- ORDER MATTERS: reactions and receipts before messages (FK dependencies)

DROP TABLE IF EXISTS public.chat_message_reactions  CASCADE;
DROP TABLE IF EXISTS public.chat_read_receipts       CASCADE;
DROP TABLE IF EXISTS public.chat_pinned_messages     CASCADE;
DROP TABLE IF EXISTS public.workspace_chat_messages  CASCADE;


-- ── A-7. Drop storage policies for chat-attachments ───────────────────────────
-- NOTE: The bucket itself is KEPT — existing attachment URLs remain valid.
-- New uploads will go to Stream CDN. Old messages with Supabase-hosted
-- attachments will still display via signed URL in VideoPlayerBubble, etc.

DROP POLICY IF EXISTS "chat_attach_select_member"       ON storage.objects;
DROP POLICY IF EXISTS "chat_attach_insert_member"       ON storage.objects;
DROP POLICY IF EXISTS "chat_attach_update_own"          ON storage.objects;
DROP POLICY IF EXISTS "chat_attach_delete_own_or_owner" ON storage.objects;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║              SECTION B — STREAM CHAT SCHEMA                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Stream Chat itself stores all messages, reactions, pins, members,
-- and read receipts — none of that lives in Supabase anymore.
-- This section adds a lightweight mapping table so the app can
-- look up which Stream channel ID corresponds to a workspace,
-- and track unread counts for the workspace header badge.


-- ── B-1. stream_channel_metadata ──────────────────────────────────────────────
-- Maps workspace_id → Stream channel ID.
-- Created on first chat screen open, never updated.
-- Used by workspace-detail.tsx to show the unread badge without
-- opening a Stream channel (avoids WebSocket connection on list screen).

CREATE TABLE IF NOT EXISTS public.stream_channel_metadata (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL
                    REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_id      TEXT        NOT NULL,   -- e.g. 'workspace-{uuid}'
    channel_type    TEXT        NOT NULL DEFAULT 'messaging',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id)
);

ALTER TABLE public.stream_channel_metadata ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stream_channel_workspace
    ON public.stream_channel_metadata(workspace_id);

-- RLS: any workspace member can read; only owners/editors can insert
DROP POLICY IF EXISTS "stream_channel_select_member" ON public.stream_channel_metadata;
DROP POLICY IF EXISTS "stream_channel_insert_editor" ON public.stream_channel_metadata;

CREATE POLICY "stream_channel_select_member"
    ON public.stream_channel_metadata
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = stream_channel_metadata.workspace_id
              AND wm.user_id      = auth.uid()
        )
    );

CREATE POLICY "stream_channel_insert_editor"
    ON public.stream_channel_metadata
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = stream_channel_metadata.workspace_id
              AND wm.user_id      = auth.uid()
              AND wm.role         IN ('owner', 'editor')
        )
    );


-- ── B-2. RPC: upsert_stream_channel_metadata ──────────────────────────────────
-- Called once from the app when a workspace channel is first created.
-- Idempotent — safe to call every time workspace-chat mounts.

CREATE OR REPLACE FUNCTION public.upsert_stream_channel_metadata(
    p_workspace_id UUID,
    p_channel_id   TEXT,
    p_channel_type TEXT DEFAULT 'messaging'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.stream_channel_metadata (workspace_id, channel_id, channel_type)
    VALUES (p_workspace_id, p_channel_id, p_channel_type)
    ON CONFLICT (workspace_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_stream_channel_metadata(UUID, TEXT, TEXT) TO authenticated;


-- ── B-3. RPC: get_stream_channel_id ───────────────────────────────────────────
-- Returns the Stream channel ID for a workspace, or NULL if not yet created.
-- Used by workspace-detail.tsx badge logic.

CREATE OR REPLACE FUNCTION public.get_stream_channel_id(
    p_workspace_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_channel_id TEXT;
BEGIN
    SELECT channel_id INTO v_channel_id
    FROM public.stream_channel_metadata
    WHERE workspace_id = p_workspace_id;

    RETURN v_channel_id; -- NULL if not found
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stream_channel_id(UUID) TO authenticated;


-- ── B-4. Table and function comments ──────────────────────────────────────────

COMMENT ON TABLE    public.stream_channel_metadata                              IS 'Maps workspace_id to Stream Chat channel_id (Part 49)';
COMMENT ON FUNCTION public.upsert_stream_channel_metadata(UUID, TEXT, TEXT)     IS 'Record workspace → Stream channel mapping on first chat open (Part 49)';
COMMENT ON FUNCTION public.get_stream_channel_id(UUID)                          IS 'Get Stream channel ID for a workspace (Part 49)';


-- ── Final: Reload PostgREST schema cache ──────────────────────────────────────

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════╗
-- ║                       SUMMARY                               ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- SECTION A — Dropped:
--   Tables:   workspace_chat_messages, chat_message_reactions,
--             chat_read_receipts, chat_pinned_messages
--   RPCs:     get_chat_message_by_id, get_message_reactions,
--             get_chat_messages, send_chat_message (all overloads),
--             edit_chat_message, delete_chat_message,
--             toggle_chat_reaction, mark_messages_read,
--             get_chat_unread_count, pin_chat_message,
--             unpin_chat_message, get_pinned_chat_messages,
--             search_chat_messages, get_chat_members,
--             get_user_chat_stats, is_chat_member
--   Policies: all chat RLS policies on the above tables
--   Storage:  all chat-attachments bucket policies (bucket kept)
--
-- SECTION B — Created:
--   Table:    stream_channel_metadata
--   RPCs:     upsert_stream_channel_metadata, get_stream_channel_id
--
-- KEPT (unchanged):
--   Table:    workspace_notification_preferences (used for @mention prefs)
--   RPCs:     get_or_create_workspace_notification_prefs,
--             update_workspace_notification_prefs
--   Storage:  chat-attachments bucket (existing signed URLs remain valid)
-- ============================================================