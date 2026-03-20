-- ============================================================
-- DeepDive AI — Part 26 Complete Schema Migration
-- Feature: Personal AI Knowledge Base (Second Brain)
--
-- Run this single file in your Supabase SQL editor.
-- It is fully idempotent — safe to re-run at any time.
-- All previous parts (especially Part 6 report_embeddings)
-- must already be applied before running this.
--
-- ─── Tables created ───────────────────────────────────────
--   knowledge_base_sessions    — one chat thread per user
--   knowledge_base_messages    — messages with multi-report attribution
--
-- ─── RPCs created ─────────────────────────────────────────
--   match_global_knowledge      — cross-report semantic search (core KB query)
--   get_kb_stats                — indexed/total report counts + chunk totals
--   get_unembedded_report_ids   — reports pending background indexing
--   get_kb_session_messages     — load a session's message history
--   get_or_create_kb_session    — idempotent session bootstrap on screen open
--   list_kb_sessions            — all sessions with live counts + previews
--   create_kb_session           — create a new named session
--   rename_kb_session           — rename any session (also used for auto-naming)
--   delete_kb_session           — delete session + all its messages (cascades)
--   update_kb_session_count     — sync message_count + updated_at after inserts
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- SECTION 1 — TABLES
-- ════════════════════════════════════════════════════════════

-- ─── knowledge_base_sessions ─────────────────────────────────────────────────
-- One row per chat thread. Users can have unlimited named sessions.
-- message_count is a cached column kept in sync by update_kb_session_count;
-- list_kb_sessions does a live COUNT for accuracy so stale cache never matters.

CREATE TABLE IF NOT EXISTS public.knowledge_base_sessions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL DEFAULT 'Knowledge Base',
  message_count INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.knowledge_base_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own kb sessions" ON public.knowledge_base_sessions;
CREATE POLICY "Users manage own kb sessions"
  ON public.knowledge_base_sessions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_kb_sessions_user_updated
  ON public.knowledge_base_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_sessions_user_created
  ON public.knowledge_base_sessions(user_id, created_at DESC);

-- ─── knowledge_base_messages ─────────────────────────────────────────────────
-- One row per message (user or assistant).
-- source_reports JSONB holds an array of KBSourceReport objects showing
-- exactly which reports contributed context to each assistant answer.
-- query_expansion JSONB holds the AI-generated sub-queries used for retrieval.

CREATE TABLE IF NOT EXISTS public.knowledge_base_messages (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID        NOT NULL REFERENCES public.knowledge_base_sessions(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT        NOT NULL,
  source_reports  JSONB       NOT NULL DEFAULT '[]',
  total_chunks    INTEGER     NOT NULL DEFAULT 0,
  reports_count   INTEGER     NOT NULL DEFAULT 0,
  confidence      TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (confidence IN ('high', 'medium', 'low')),
  query_expansion JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.knowledge_base_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own kb messages" ON public.knowledge_base_messages;
CREATE POLICY "Users manage own kb messages"
  ON public.knowledge_base_messages
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for loading a session's messages in chronological order
CREATE INDEX IF NOT EXISTS idx_kb_messages_session_asc
  ON public.knowledge_base_messages(session_id, created_at ASC);

-- Index for user-level queries (e.g. total message count)
CREATE INDEX IF NOT EXISTS idx_kb_messages_user_created
  ON public.knowledge_base_messages(user_id, created_at DESC);

-- Index for fast last-message lookup per session
CREATE INDEX IF NOT EXISTS idx_kb_messages_session_desc
  ON public.knowledge_base_messages(session_id, created_at DESC);

-- ════════════════════════════════════════════════════════════
-- SECTION 2 — CORE SEARCH RPCs
-- ════════════════════════════════════════════════════════════

-- ─── match_global_knowledge ──────────────────────────────────────────────────
-- THE core KB query. Searches across ALL report_embeddings owned by the user
-- (not just one report like match_report_chunks from Part 6).
-- Each row returned includes the report_title so the app can attribute answers.
--
-- Parameters:
--   query_embedding  — 1536-dim vector of the user's query (or sub-query)
--   p_user_id        — scopes results to this user (RLS enforcement)
--   match_count      — max rows to return (default 12)
--   match_threshold  — minimum cosine similarity to include (default 0.28)
--   p_report_ids     — optional filter to specific reports (NULL = all)

CREATE OR REPLACE FUNCTION public.match_global_knowledge(
  query_embedding  vector(1536),
  p_user_id        UUID,
  match_count      INT    DEFAULT 12,
  match_threshold  FLOAT  DEFAULT 0.28,
  p_report_ids     UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id           UUID,
  report_id    UUID,
  report_title TEXT,
  chunk_id     TEXT,
  chunk_type   TEXT,
  content      TEXT,
  metadata     JSONB,
  similarity   FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    re.id,
    re.report_id,
    COALESCE(rr.title, rr.query, 'Untitled Report') AS report_title,
    re.chunk_id,
    re.chunk_type,
    re.content,
    re.metadata,
    (1 - (re.embedding <=> query_embedding))::FLOAT  AS similarity
  FROM public.report_embeddings re
  JOIN public.research_reports  rr ON rr.id = re.report_id
  WHERE re.user_id = p_user_id
    AND rr.user_id = p_user_id
    AND rr.status  = 'completed'
    AND (p_report_ids IS NULL OR re.report_id = ANY(p_report_ids))
    AND (1 - (re.embedding <=> query_embedding)) > match_threshold
  ORDER BY re.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_global_knowledge(vector, UUID, INT, FLOAT, UUID[])
  TO authenticated;

-- ─── get_kb_stats ────────────────────────────────────────────────────────────
-- Returns a single row with KB health metrics shown in KBIndexingBanner.
-- total_reports   — completed reports in the user's library
-- indexed_reports — reports that have at least one embedding stored
-- total_chunks    — total embedding chunks across all reports
-- last_indexed_at — timestamp of the most recently created embedding

CREATE OR REPLACE FUNCTION public.get_kb_stats(p_user_id UUID)
RETURNS TABLE (
  total_reports   BIGINT,
  indexed_reports BIGINT,
  total_chunks    BIGINT,
  last_indexed_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)
       FROM public.research_reports
      WHERE user_id = p_user_id
        AND status  = 'completed')::BIGINT             AS total_reports,

    (SELECT COUNT(DISTINCT report_id)
       FROM public.report_embeddings
      WHERE user_id = p_user_id)::BIGINT               AS indexed_reports,

    (SELECT COUNT(*)
       FROM public.report_embeddings
      WHERE user_id = p_user_id)::BIGINT               AS total_chunks,

    (SELECT MAX(created_at)
       FROM public.report_embeddings
      WHERE user_id = p_user_id)                       AS last_indexed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kb_stats(UUID) TO authenticated;

-- ─── get_unembedded_report_ids ────────────────────────────────────────────────
-- Returns completed reports that have NO embeddings yet.
-- Used by useKnowledgeBase.startIndexing() to drive background embedding.
-- Returns newest reports first so the most recent research is prioritised.

CREATE OR REPLACE FUNCTION public.get_unembedded_report_ids(
  p_user_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  report_id    UUID,
  report_title TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    rr.id                              AS report_id,
    COALESCE(rr.title, rr.query, '')   AS report_title,
    rr.created_at
  FROM public.research_reports rr
  WHERE rr.user_id = p_user_id
    AND rr.status  = 'completed'
    AND NOT EXISTS (
      SELECT 1
      FROM public.report_embeddings re
      WHERE re.report_id = rr.id
        AND re.user_id   = p_user_id
    )
  ORDER BY rr.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unembedded_report_ids(UUID, INT) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- SECTION 3 — SESSION RPCs
-- ════════════════════════════════════════════════════════════

-- ─── get_or_create_kb_session ────────────────────────────────────────────────
-- Called once on KB screen open. Returns the user's most recently updated
-- session, creating a default one if the user has never opened the KB before.
-- The returned UUID is used as the active session for the screen.

CREATE OR REPLACE FUNCTION public.get_or_create_kb_session(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id UUID;
BEGIN
  SELECT id INTO v_session_id
  FROM public.knowledge_base_sessions
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.knowledge_base_sessions(user_id, title)
    VALUES (p_user_id, 'Knowledge Base')
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_kb_session(UUID) TO authenticated;

-- ─── get_kb_session_messages ─────────────────────────────────────────────────
-- Loads message history for one session in ascending time order (oldest first)
-- so the chat renders correctly. Used when switching sessions and on first load.

CREATE OR REPLACE FUNCTION public.get_kb_session_messages(
  p_session_id UUID,
  p_user_id    UUID,
  p_limit      INT DEFAULT 80
)
RETURNS TABLE (
  id             UUID,
  role           TEXT,
  content        TEXT,
  source_reports JSONB,
  total_chunks   INTEGER,
  reports_count  INTEGER,
  confidence     TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.source_reports,
    m.total_chunks,
    m.reports_count,
    m.confidence,
    m.created_at
  FROM public.knowledge_base_messages m
  WHERE m.session_id = p_session_id
    AND m.user_id    = p_user_id
  ORDER BY m.created_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kb_session_messages(UUID, UUID, INT) TO authenticated;

-- ─── list_kb_sessions ────────────────────────────────────────────────────────
-- Returns all sessions for a user, newest-updated first.
-- message_count uses a live LATERAL COUNT so it is always accurate —
-- the cached knowledge_base_sessions.message_count column is never read here.
-- last_message_preview and last_message_role give enough context for the
-- sessions panel to show a meaningful card without an extra round-trip.

CREATE OR REPLACE FUNCTION public.list_kb_sessions(p_user_id UUID)
RETURNS TABLE (
  id                   UUID,
  title                TEXT,
  message_count        INTEGER,
  last_message_preview TEXT,
  last_message_role    TEXT,
  updated_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    COALESCE(mc.cnt, 0)::INTEGER   AS message_count,
    LEFT(lm.content, 120)          AS last_message_preview,
    lm.role                        AS last_message_role,
    s.updated_at,
    s.created_at
  FROM public.knowledge_base_sessions s
  -- Live message count — never stale
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM public.knowledge_base_messages m
    WHERE m.session_id = s.id
      AND m.user_id    = p_user_id
  ) mc ON true
  -- Most recent message for preview
  LEFT JOIN LATERAL (
    SELECT m.content, m.role
    FROM public.knowledge_base_messages m
    WHERE m.session_id = s.id
      AND m.user_id    = p_user_id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_kb_sessions(UUID) TO authenticated;

-- ─── create_kb_session ───────────────────────────────────────────────────────
-- Creates a new named session and returns its UUID.
-- Used when the user taps "New Chat" in the sessions panel.

CREATE OR REPLACE FUNCTION public.create_kb_session(
  p_user_id UUID,
  p_title   TEXT DEFAULT 'New Chat'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.knowledge_base_sessions(user_id, title)
  VALUES (p_user_id, TRIM(p_title))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_kb_session(UUID, TEXT) TO authenticated;

-- ─── rename_kb_session ───────────────────────────────────────────────────────
-- Renames a session. Also used by auto-naming after the first exchange
-- (GPT-4o generates a short title and this RPC saves it).
-- Silently no-ops if the session doesn't belong to the user.

CREATE OR REPLACE FUNCTION public.rename_kb_session(
  p_session_id UUID,
  p_user_id    UUID,
  p_new_title  TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.knowledge_base_sessions
  SET title      = TRIM(p_new_title),
      updated_at = NOW()
  WHERE id      = p_session_id
    AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_kb_session(UUID, UUID, TEXT) TO authenticated;

-- ─── delete_kb_session ───────────────────────────────────────────────────────
-- Deletes a session. All messages cascade-delete automatically via the
-- knowledge_base_messages.session_id FK ON DELETE CASCADE constraint.
-- Silently no-ops if the session doesn't belong to the user.

CREATE OR REPLACE FUNCTION public.delete_kb_session(
  p_session_id UUID,
  p_user_id    UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.knowledge_base_sessions
  WHERE id      = p_session_id
    AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_kb_session(UUID, UUID) TO authenticated;

-- ─── update_kb_session_count ─────────────────────────────────────────────────
-- Syncs the cached message_count column and bumps updated_at on the session.
-- Called by useKnowledgeBase.persistMessages() after every exchange pair.
-- Returns the accurate live count so the caller can verify.

CREATE OR REPLACE FUNCTION public.update_kb_session_count(
  p_session_id UUID,
  p_user_id    UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.knowledge_base_messages
  WHERE session_id = p_session_id
    AND user_id    = p_user_id;

  UPDATE public.knowledge_base_sessions
  SET message_count = v_count,
      updated_at    = NOW()
  WHERE id      = p_session_id
    AND user_id = p_user_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kb_session_count(UUID, UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- SECTION 4 — COMMENTS
-- ════════════════════════════════════════════════════════════

COMMENT ON TABLE public.knowledge_base_sessions
  IS 'KB chat sessions — one per conversation thread (Part 26)';

COMMENT ON TABLE public.knowledge_base_messages
  IS 'KB chat messages with full multi-report source attribution (Part 26)';

COMMENT ON FUNCTION public.match_global_knowledge(vector, UUID, INT, FLOAT, UUID[])
  IS 'Cross-report semantic search across all user embeddings — core KB query (Part 26)';

COMMENT ON FUNCTION public.get_kb_stats(UUID)
  IS 'KB health metrics: total/indexed reports, chunk count, last indexed timestamp (Part 26)';

COMMENT ON FUNCTION public.get_unembedded_report_ids(UUID, INT)
  IS 'Reports with no embeddings yet — drives background indexer (Part 26)';

COMMENT ON FUNCTION public.get_or_create_kb_session(UUID)
  IS 'Idempotent session bootstrap — returns or creates the default session (Part 26)';

COMMENT ON FUNCTION public.get_kb_session_messages(UUID, UUID, INT)
  IS 'Load session message history oldest-first for chat display (Part 26)';

COMMENT ON FUNCTION public.list_kb_sessions(UUID)
  IS 'All sessions with live message count + last message preview (Part 26)';

COMMENT ON FUNCTION public.create_kb_session(UUID, TEXT)
  IS 'Create a new named KB chat session (Part 26)';

COMMENT ON FUNCTION public.rename_kb_session(UUID, UUID, TEXT)
  IS 'Rename a session — used by user action and GPT auto-naming (Part 26)';

COMMENT ON FUNCTION public.delete_kb_session(UUID, UUID)
  IS 'Delete a session and cascade-delete all its messages (Part 26)';

COMMENT ON FUNCTION public.update_kb_session_count(UUID, UUID)
  IS 'Sync cached message_count + updated_at after inserting messages (Part 26)';