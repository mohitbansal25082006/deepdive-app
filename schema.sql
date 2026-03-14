-- ============================================================
-- DeepDive AI — Complete Database Schema
-- Parts 1 through 13 — Single Migration File
--
-- Includes:
--   Part 1  — Profiles, Auth, Storage, Subscriptions
--   Part 2  — Research Reports, Conversations
--   Part 3  — Saved Topics, Push Tokens, Stats
--   Part 4  — Knowledge Graph, Infographics, Public Reports
--   Part 5  — AI Slide Generator (Presentations)
--   Part 6  — RAG Pipeline (Embeddings, Assistant Conversations)
--   Part 7  — Academic Paper Mode
--   Part 8  — AI Podcast Generator
--   Part 9  — AI Debate Agent
--   Part 10 — Collaborative Workspaces + Patch (workspace report access)
--   Part 11 — Workspace Feature Upgrades (11C patches applied inline):
--             • workspace_activity persistence fix (ON DELETE SET NULL)
--             • comment_reactions table (exclusive: one per user per comment)
--             • pinned_workspace_reports table
--             • workspace_search_index view (enhanced with ILIKE + subtitle)
--             • workspaces.logo_url column
--             • RPCs: toggle_comment_reaction, get_comment_reactions,
--                     toggle_pin_workspace_report, get_pinned_report_ids,
--                     search_workspace (full-text + ILIKE fallback),
--                     get_workspace_activity_feed (returns TABLE with actor snapshot)
--   Part 12 — Enhanced Workspace Features + RLS Recursion Fix
--             • edit_access_requests table (viewer → editor upgrade requests)
--             • get_auth_user_workspace_ids() SECURITY DEFINER helper
--             • Recursion-safe RLS policies for all workspace tables
--             • Member workspace stats and comment summary RPCs
--   Part 13 — Workspace Member Blocking, Logo Upload, Demotion
--             • workspace-logos storage bucket + RLS policies
--             • update_workspace_logo RPC
--             • workspace_blocked_members table
--             • is_blocked_from_workspace helper
--             • block_workspace_member RPC (with non-fatal activity log fallback)
--             • unblock_workspace_member RPC
--             • get_workspace_blocked_members RPC
--             • demote_editor_to_viewer RPC
--             • join_workspace_by_code replacement (returns JSON, blocks check)
--             • count_member_replies_in_workspace helper
--             • edit_access_requests status extended to include 'removed'
--
-- Root causes fixed in Part 13 vs all previous attempts:
--   [A] avatar_url + invite_code added to workspaces (already present; guaranteed)
--   [B] workspace_activity INSERTs wrapped in nested BEGIN/EXCEPTION blocks
--       so unknown column names degrade to WARNING, never abort the parent op
--   [C] is_personal removed from join_workspace_by_code (not in schema)
--   [D] blocked_by NOT NULL + ON DELETE SET NULL contradiction resolved
--   [E] SET search_path = public on every SECURITY DEFINER function
--
-- Prerequisites:
--   pgvector must be available (pre-installed on all Supabase projects).
--
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- Run the entire script in one shot in the Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- SHARED UTILITY FUNCTIONS
-- Defined early — referenced by multiple triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- PART 1 — PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID    REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username          TEXT    UNIQUE,
  full_name         TEXT,
  avatar_url        TEXT,
  bio               TEXT,
  occupation        TEXT,
  interests         TEXT[],
  profile_completed BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at        TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, profile_completed)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- PART 1 — STORAGE (avatars bucket)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Avatar images are publicly accessible') THEN
    CREATE POLICY "Avatar images are publicly accessible"
      ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload their own avatar') THEN
    CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update their own avatar') THEN
    CREATE POLICY "Users can update their own avatar"
      ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete their own avatar') THEN
    CREATE POLICY "Users can delete their own avatar"
      ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;


-- ============================================================
-- PART 13 — STORAGE (workspace-logos bucket)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-logos',
  'workspace-logos',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "wl_select_public" ON storage.objects;
DROP POLICY IF EXISTS "wl_insert_auth"   ON storage.objects;
DROP POLICY IF EXISTS "wl_update_auth"   ON storage.objects;
DROP POLICY IF EXISTS "wl_delete_auth"   ON storage.objects;

CREATE POLICY "wl_select_public"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'workspace-logos');

CREATE POLICY "wl_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'workspace-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "wl_update_auth"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'workspace-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "wl_delete_auth"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'workspace-logos' AND auth.uid() IS NOT NULL);


-- ============================================================
-- PART 1 — USER SUBSCRIPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tier                    TEXT    NOT NULL DEFAULT 'free',
  reports_used_this_month INTEGER DEFAULT 0,
  reports_limit           INTEGER DEFAULT 5,
  reset_date              TIMESTAMPTZ DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at              TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription"   ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.user_subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription"
  ON public.user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription"
  ON public.user_subscriptions FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_user_subscriptions_updated ON public.user_subscriptions;
CREATE TRIGGER on_user_subscriptions_updated
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, tier, reports_limit)
  VALUES (NEW.id, 'free', 5)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();


-- ============================================================
-- PART 3 — SAVED TOPICS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_topics (
  id               UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  topic            TEXT    NOT NULL,
  last_checked_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  notify_on_update BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.saved_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own saved topics" ON public.saved_topics;
CREATE POLICY "Users can manage own saved topics"
  ON public.saved_topics FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_topics_user_id ON public.saved_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_topics_notify  ON public.saved_topics(user_id, notify_on_update) WHERE notify_on_update = TRUE;


-- ============================================================
-- PART 3 — PUSH TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token      TEXT  NOT NULL UNIQUE,
  platform   TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage own push tokens"
  ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

DROP TRIGGER IF EXISTS on_push_tokens_updated ON public.push_tokens;
CREATE TRIGGER on_push_tokens_updated
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- PART 5 — PRESENTATIONS
-- Created before research_reports (FK reference from research_reports)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.presentations (
  id           UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id    UUID    NOT NULL,  -- FK added after research_reports created
  user_id      UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT    NOT NULL,
  subtitle     TEXT,
  theme        TEXT    NOT NULL DEFAULT 'dark',
  slides       JSONB   NOT NULL DEFAULT '[]',
  total_slides INTEGER NOT NULL DEFAULT 0,
  export_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  created_at   TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at   TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own presentations"   ON public.presentations;
DROP POLICY IF EXISTS "Users can insert own presentations" ON public.presentations;
DROP POLICY IF EXISTS "Users can update own presentations" ON public.presentations;
DROP POLICY IF EXISTS "Users can delete own presentations" ON public.presentations;

CREATE POLICY "Users can view own presentations"
  ON public.presentations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own presentations"
  ON public.presentations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presentations"
  ON public.presentations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presentations"
  ON public.presentations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_presentations_user_id    ON public.presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_created_at ON public.presentations(created_at DESC);

DROP TRIGGER IF EXISTS on_presentations_updated ON public.presentations;
CREATE TRIGGER on_presentations_updated
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- PART 7 — ACADEMIC PAPERS
-- Created before research_reports (FK reference from research_reports)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.academic_papers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID        NOT NULL,  -- FK added after research_reports created
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL DEFAULT '',
  running_head   TEXT        NOT NULL DEFAULT '',
  abstract       TEXT        NOT NULL DEFAULT '',
  keywords       TEXT[]      NOT NULL DEFAULT '{}',
  institution    TEXT,
  sections       JSONB       NOT NULL DEFAULT '[]',
  citations      JSONB       NOT NULL DEFAULT '[]',
  citation_style TEXT        NOT NULL DEFAULT 'apa',
  word_count     INTEGER     NOT NULL DEFAULT 0,
  page_estimate  INTEGER     NOT NULL DEFAULT 0,
  export_count   INTEGER     NOT NULL DEFAULT 0,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT academic_papers_citation_style_check
    CHECK (citation_style IN ('apa', 'mla', 'chicago', 'ieee'))
);

ALTER TABLE public.academic_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own academic papers"   ON public.academic_papers;
DROP POLICY IF EXISTS "Users can insert own academic papers" ON public.academic_papers;
DROP POLICY IF EXISTS "Users can update own academic papers" ON public.academic_papers;
DROP POLICY IF EXISTS "Users can delete own academic papers" ON public.academic_papers;

CREATE POLICY "Users can view own academic papers"
  ON public.academic_papers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own academic papers"
  ON public.academic_papers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own academic papers"
  ON public.academic_papers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own academic papers"
  ON public.academic_papers FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS academic_papers_report_id_idx    ON public.academic_papers(report_id);
CREATE INDEX IF NOT EXISTS academic_papers_user_id_idx      ON public.academic_papers(user_id);
CREATE INDEX IF NOT EXISTS academic_papers_generated_at_idx ON public.academic_papers(generated_at DESC);

DROP TRIGGER IF EXISTS on_academic_papers_updated ON public.academic_papers;
CREATE TRIGGER on_academic_papers_updated
  BEFORE UPDATE ON public.academic_papers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- ============================================================
-- PART 2 — RESEARCH REPORTS
-- Central table — depends on presentations + academic_papers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.research_reports (
  id                  UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Research input
  query               TEXT    NOT NULL,
  depth               TEXT    NOT NULL DEFAULT 'deep',
  focus_areas         TEXT[]  DEFAULT '{}',

  -- Report content
  title               TEXT,
  executive_summary   TEXT,
  sections            JSONB   DEFAULT '[]',
  key_findings        JSONB   DEFAULT '[]',
  future_predictions  JSONB   DEFAULT '[]',
  citations           JSONB   DEFAULT '[]',
  statistics          JSONB   DEFAULT '[]',

  -- Research metadata
  search_queries      JSONB   DEFAULT '[]',
  sources_count       INTEGER DEFAULT 0,
  reliability_score   NUMERIC(3,1) DEFAULT 0,

  -- Status
  status              TEXT    NOT NULL DEFAULT 'pending',
  error_message       TEXT,
  agent_logs          JSONB   DEFAULT '[]',

  -- Part 3
  is_pinned           BOOLEAN DEFAULT FALSE,
  tags                TEXT[]  DEFAULT '{}',
  export_count        INTEGER DEFAULT 0,
  view_count          INTEGER DEFAULT 0,

  -- Part 4
  knowledge_graph     JSONB   DEFAULT NULL,
  infographic_data    JSONB   DEFAULT NULL,
  source_images       JSONB   DEFAULT '[]',
  is_public           BOOLEAN DEFAULT FALSE,
  public_token        TEXT    UNIQUE,
  public_view_count   INTEGER DEFAULT 0,

  -- Part 5
  presentation_id     UUID    REFERENCES public.presentations(id) ON DELETE SET NULL,
  slide_count         INTEGER NOT NULL DEFAULT 0,

  -- Part 7
  academic_paper_id   UUID    REFERENCES public.academic_papers(id) ON DELETE SET NULL,
  research_mode       TEXT    NOT NULL DEFAULT 'standard',

  -- Timestamps
  created_at          TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),

  CONSTRAINT research_reports_research_mode_check
    CHECK (research_mode IN ('standard', 'academic'))
);

ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;

-- Temporary policy replaced after workspace tables are created (Part 12)
CREATE POLICY "read_own_or_public_reports_temp"
  ON public.research_reports FOR SELECT
  USING (user_id = auth.uid() OR is_public = TRUE);

CREATE POLICY "users_can_insert_own_reports"
  ON public.research_reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_update_own_reports"
  ON public.research_reports FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_delete_own_reports"
  ON public.research_reports FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS on_research_reports_updated ON public.research_reports;
CREATE TRIGGER on_research_reports_updated
  BEFORE UPDATE ON public.research_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_research_reports_user_id         ON public.research_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_created_at      ON public.research_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_reports_status          ON public.research_reports(status);
CREATE INDEX IF NOT EXISTS idx_research_reports_pinned          ON public.research_reports(user_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_research_reports_public_token    ON public.research_reports(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_reports_is_public       ON public.research_reports(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_research_reports_presentation_id ON public.research_reports(presentation_id) WHERE presentation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_reports_academic_paper  ON public.research_reports(academic_paper_id) WHERE academic_paper_id IS NOT NULL;

-- Deferred FKs on presentations + academic_papers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'presentations_report_id_fkey'
  ) THEN
    ALTER TABLE public.presentations
      ADD CONSTRAINT presentations_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES public.research_reports(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'academic_papers_report_id_fkey'
  ) THEN
    ALTER TABLE public.academic_papers
      ADD CONSTRAINT academic_papers_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES public.research_reports(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_presentations_report_id   ON public.presentations(report_id);
CREATE INDEX IF NOT EXISTS academic_papers_report_fk_idx ON public.academic_papers(report_id);


-- ============================================================
-- PART 2 — RESEARCH CONVERSATIONS (legacy follow-up chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.research_conversations (
  id         UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id  UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       TEXT  NOT NULL,
  content    TEXT  NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.research_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations"   ON public.research_conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.research_conversations;

CREATE POLICY "Users can view own conversations"
  ON public.research_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations"
  ON public.research_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_research_conversations_report_id ON public.research_conversations(report_id);


-- ============================================================
-- PART 4 — PUBLIC REPORT VIEW TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.public_report_views (
  id         UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id  UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  viewer_ip  TEXT,
  user_agent TEXT,
  viewed_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.public_report_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log a public report view" ON public.public_report_views;
CREATE POLICY "Anyone can log a public report view"
  ON public.public_report_views FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.research_reports
      WHERE id = report_id AND is_public = TRUE
    )
  );

CREATE INDEX IF NOT EXISTS idx_public_report_views_report_id ON public.public_report_views(report_id);


-- ============================================================
-- PART 6 — REPORT EMBEDDINGS (RAG pipeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_embeddings (
  id         UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id  UUID    REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chunk_id   TEXT    NOT NULL,
  chunk_type TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  embedding  vector(1536),
  metadata   JSONB   DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.report_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own embeddings"   ON public.report_embeddings;
DROP POLICY IF EXISTS "Users can insert own embeddings" ON public.report_embeddings;
DROP POLICY IF EXISTS "Users can delete own embeddings" ON public.report_embeddings;

CREATE POLICY "Users can view own embeddings"
  ON public.report_embeddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own embeddings"
  ON public.report_embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own embeddings"
  ON public.report_embeddings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_id    ON public.report_embeddings(report_id);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_user_id      ON public.report_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_vector       ON public.report_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_chunk ON public.report_embeddings(report_id, chunk_id);


-- ============================================================
-- PART 6 — ASSISTANT CONVERSATIONS (RAG chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id                   UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id            UUID    REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id              UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role                 TEXT    NOT NULL,
  content              TEXT    NOT NULL,
  mode                 TEXT    NOT NULL DEFAULT 'general',
  retrieved_chunks     JSONB   DEFAULT '[]',
  suggested_follow_ups JSONB   DEFAULT '[]',
  is_rag_powered       BOOLEAN DEFAULT FALSE,
  confidence           TEXT    DEFAULT 'medium',
  created_at           TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own assistant conversations"   ON public.assistant_conversations;
DROP POLICY IF EXISTS "Users can insert own assistant conversations" ON public.assistant_conversations;
DROP POLICY IF EXISTS "Users can delete own assistant conversations" ON public.assistant_conversations;

CREATE POLICY "Users can view own assistant conversations"
  ON public.assistant_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assistant conversations"
  ON public.assistant_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own assistant conversations"
  ON public.assistant_conversations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_report_id   ON public.assistant_conversations(report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_report ON public.assistant_conversations(user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created_at  ON public.assistant_conversations(created_at DESC);


-- ============================================================
-- PART 8 — PODCASTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.podcasts (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  report_id           UUID        REFERENCES public.research_reports(id) ON DELETE SET NULL,
  title               TEXT        NOT NULL,
  description         TEXT        NOT NULL DEFAULT '',
  topic               TEXT        NOT NULL,
  script              JSONB       NOT NULL DEFAULT '{"turns":[],"totalWords":0,"estimatedDurationMinutes":0}'::jsonb,
  audio_segment_paths JSONB       NOT NULL DEFAULT '[]'::jsonb,
  host_voice          TEXT        NOT NULL DEFAULT 'alloy',
  guest_voice         TEXT        NOT NULL DEFAULT 'nova',
  host_name           TEXT        NOT NULL DEFAULT 'Alex',
  guest_name          TEXT        NOT NULL DEFAULT 'Sam',
  status              TEXT        NOT NULL DEFAULT 'pending',
  segment_count       INTEGER     NOT NULL DEFAULT 0,
  completed_segments  INTEGER     NOT NULL DEFAULT 0,
  duration_seconds    INTEGER     NOT NULL DEFAULT 0,
  word_count          INTEGER     NOT NULL DEFAULT 0,
  export_count        INTEGER     NOT NULL DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT podcasts_status_check CHECK (
    status IN ('pending','generating_script','generating_audio','completed','failed')
  ),
  CONSTRAINT podcasts_host_voice_check CHECK (
    host_voice IN ('alloy','echo','fable','onyx','nova','shimmer')
  ),
  CONSTRAINT podcasts_guest_voice_check CHECK (
    guest_voice IN ('alloy','echo','fable','onyx','nova','shimmer')
  )
);

ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Users can insert own podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Users can update own podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Users can delete own podcasts" ON public.podcasts;

CREATE POLICY "Users can select own podcasts"
  ON public.podcasts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own podcasts"
  ON public.podcasts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own podcasts"
  ON public.podcasts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own podcasts"
  ON public.podcasts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS podcasts_user_id_idx    ON public.podcasts(user_id);
CREATE INDEX IF NOT EXISTS podcasts_report_id_idx  ON public.podcasts(report_id);
CREATE INDEX IF NOT EXISTS podcasts_status_idx     ON public.podcasts(status);
CREATE INDEX IF NOT EXISTS podcasts_created_at_idx ON public.podcasts(created_at DESC);

DROP TRIGGER IF EXISTS on_podcasts_updated ON public.podcasts;
CREATE TRIGGER on_podcasts_updated
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- PART 9 — DEBATE SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.debate_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic                TEXT        NOT NULL,
  question             TEXT        NOT NULL,
  perspectives         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  moderator            JSONB,
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending','searching','debating',
                           'moderating','completed','failed'
                         )),
  agent_roles          TEXT[]      NOT NULL DEFAULT '{}'::text[],
  search_results_count INTEGER     NOT NULL DEFAULT 0,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);

ALTER TABLE public.debate_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own debate sessions"   ON public.debate_sessions;
DROP POLICY IF EXISTS "Users can insert own debate sessions" ON public.debate_sessions;
DROP POLICY IF EXISTS "Users can update own debate sessions" ON public.debate_sessions;
DROP POLICY IF EXISTS "Users can delete own debate sessions" ON public.debate_sessions;

CREATE POLICY "Users can view own debate sessions"
  ON public.debate_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own debate sessions"
  ON public.debate_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own debate sessions"
  ON public.debate_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own debate sessions"
  ON public.debate_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS debate_sessions_user_id_idx    ON public.debate_sessions(user_id);
CREATE INDEX IF NOT EXISTS debate_sessions_created_at_idx ON public.debate_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS debate_sessions_status_idx     ON public.debate_sessions(status);


-- ============================================================
-- PART 10 — COLLABORATIVE WORKSPACES
-- (Part 11C: logo_url added directly to workspaces table)
-- (Part 13:  avatar_url + invite_code guaranteed present)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  avatar_url   TEXT,
  logo_url     TEXT        DEFAULT NULL,
  invite_code  TEXT        UNIQUE NOT NULL DEFAULT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_personal  BOOLEAN     NOT NULL DEFAULT false,
  settings     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent column additions for existing databases
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS avatar_url  text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS logo_url    text DEFAULT NULL;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS invite_code text;

-- Unique index on invite_code (safe if already exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_invite_code
  ON public.workspaces(invite_code)
  WHERE invite_code IS NOT NULL;

-- Back-fill rows with no invite code
UPDATE public.workspaces
SET invite_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10))
WHERE invite_code IS NULL;


-- ── workspace_members ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'viewer'
                           CHECK (role IN ('owner','editor','viewer')),
  invited_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);


-- ── workspace_reports ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_id    UUID        NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
  added_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, report_id)
);


-- ── report_comments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_id    UUID        NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
  section_id   TEXT,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  is_resolved  BOOLEAN     NOT NULL DEFAULT false,
  resolved_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  mentions     UUID[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── comment_replies ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comment_replies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID        NOT NULL REFERENCES public.report_comments(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  mentions    UUID[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── workspace_activity ────────────────────────────────────────
-- Part 11: ON DELETE SET NULL so activities survive after an actor
-- is deleted or leaves the workspace.
-- Part 13 functions write both entity_type/entity_id (preferred) and
-- resource_type/resource_id (legacy fallback) — both columns kept.

CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  entity_type   TEXT,
  entity_id     UUID,
  resource_type TEXT,
  resource_id   TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent: ensure both column sets exist for forward and backward compat
DO $$
BEGIN
  -- entity_type / entity_id (Part 13 preferred naming)
  BEGIN ALTER TABLE public.workspace_activity ADD COLUMN entity_type text;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.workspace_activity ADD COLUMN entity_id uuid;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  -- resource_type / resource_id (Part 10 legacy naming)
  BEGIN ALTER TABLE public.workspace_activity ADD COLUMN resource_type text;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.workspace_activity ADD COLUMN resource_id text;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Part 11: Fix actor persistence — drop NOT NULL and ensure ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workspace_activity'
      AND column_name  = 'actor_id'
  ) THEN
    ALTER TABLE public.workspace_activity ALTER COLUMN actor_id DROP NOT NULL;
    ALTER TABLE public.workspace_activity DROP CONSTRAINT IF EXISTS workspace_activity_actor_id_fkey;
    ALTER TABLE public.workspace_activity
      ADD CONSTRAINT workspace_activity_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workspace_activity'
      AND column_name  = 'user_id'
  ) THEN
    ALTER TABLE public.workspace_activity ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.workspace_activity DROP CONSTRAINT IF EXISTS workspace_activity_user_id_fkey;
    ALTER TABLE public.workspace_activity
      ADD CONSTRAINT workspace_activity_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ── Part 13 — workspace_blocked_members ───────────────────────
-- FIX [D]: blocked_by must allow NULL (ON DELETE SET NULL cannot
-- coexist with NOT NULL — the deleted-user cascade would violate it).

CREATE TABLE IF NOT EXISTS public.workspace_blocked_members (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  blocked_user_id UUID        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  blocked_by      UUID        REFERENCES auth.users(id)                   ON DELETE SET NULL,
  reason          TEXT,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, blocked_user_id)
);

-- Idempotent: drop NOT NULL from blocked_by if table already existed with it
DO $$
BEGIN
  ALTER TABLE public.workspace_blocked_members ALTER COLUMN blocked_by DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.workspace_blocked_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_blocked_ws   ON public.workspace_blocked_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_blocked_user ON public.workspace_blocked_members(blocked_user_id);

DROP POLICY IF EXISTS "blocked_select_owner" ON public.workspace_blocked_members;
DROP POLICY IF EXISTS "blocked_insert_owner" ON public.workspace_blocked_members;
DROP POLICY IF EXISTS "blocked_delete_owner" ON public.workspace_blocked_members;

CREATE POLICY "blocked_select_owner"
  ON public.workspace_blocked_members FOR SELECT TO authenticated
  USING (public.get_workspace_role(workspace_id, auth.uid()) = 'owner');

CREATE POLICY "blocked_insert_owner"
  ON public.workspace_blocked_members FOR INSERT TO authenticated
  WITH CHECK (
    public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
    AND blocked_by = auth.uid()
  );

CREATE POLICY "blocked_delete_owner"
  ON public.workspace_blocked_members FOR DELETE TO authenticated
  USING (public.get_workspace_role(workspace_id, auth.uid()) = 'owner');


-- ── Part 10 Indexes ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workspaces_owner             ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_invite_code_plain ON public.workspaces(invite_code);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user       ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace  ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_reports_workspace  ON public.workspace_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_reports_report     ON public.workspace_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_workspace_reports_added_at   ON public.workspace_reports(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_comments_report       ON public.report_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_workspace    ON public.report_comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_section      ON public.report_comments(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_comments_created      ON public.report_comments(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comment_replies_comment      ON public.comment_replies(comment_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_workspace ON public.workspace_activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_created   ON public.workspace_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_user      ON public.workspace_activity(user_id);


-- ── Part 10 updated_at triggers ──────────────────────────────

DROP TRIGGER IF EXISTS workspaces_updated_at      ON public.workspaces;
DROP TRIGGER IF EXISTS report_comments_updated_at ON public.report_comments;
DROP TRIGGER IF EXISTS comment_replies_updated_at ON public.comment_replies;

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER report_comments_updated_at
  BEFORE UPDATE ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER comment_replies_updated_at
  BEFORE UPDATE ON public.comment_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── Part 10 RLS enablement ────────────────────────────────────

ALTER TABLE public.workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 12 — RLS RECURSION FIX — SECURITY DEFINER HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_auth_user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id
  FROM   public.workspace_members
  WHERE  user_id = auth.uid();
$$;

REVOKE ALL    ON FUNCTION public.get_auth_user_workspace_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_auth_user_workspace_ids() TO authenticated;


-- ============================================================
-- PART 12 — RECURSION-SAFE RLS POLICIES
-- ============================================================

-- ── PROFILES ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_co_members"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_co_members"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.workspace_members wm_other
      WHERE  wm_other.user_id       = profiles.id
        AND  wm_other.workspace_id IN (SELECT public.get_auth_user_workspace_ids())
    )
  );


-- ── WORKSPACE_MEMBERS ─────────────────────────────────────────

DROP POLICY IF EXISTS "workspace_members_select_own_workspace" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_select"               ON public.workspace_members;

CREATE POLICY "workspace_members_select"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_auth_user_workspace_ids()));


-- ── WORKSPACE_REPORTS ─────────────────────────────────────────

DROP POLICY IF EXISTS "workspace_reports_select" ON public.workspace_reports;

CREATE POLICY "workspace_reports_select"
  ON public.workspace_reports FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_auth_user_workspace_ids()));


-- ── REPORT_COMMENTS ───────────────────────────────────────────

DROP POLICY IF EXISTS "report_comments_select" ON public.report_comments;

CREATE POLICY "report_comments_select"
  ON public.report_comments FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_auth_user_workspace_ids()));


-- ── RESEARCH_REPORTS ──────────────────────────────────────────

DROP POLICY IF EXISTS "read_own_or_public_reports_temp"                ON public.research_reports;
DROP POLICY IF EXISTS "read_own_or_workspace_shared_or_public_reports" ON public.research_reports;

CREATE POLICY "research_reports_select_shared_workspace"
  ON public.research_reports FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_public = TRUE
    OR id IN (
      SELECT wr.report_id
      FROM   public.workspace_reports wr
      WHERE  wr.workspace_id IN (SELECT public.get_auth_user_workspace_ids())
    )
  );


-- ── workspace INSERT / UPDATE / DELETE ────────────────────────

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;

CREATE POLICY "workspaces_insert" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "workspaces_delete" ON public.workspaces
  FOR DELETE USING (auth.uid() = owner_id);

-- workspace_members
DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;

CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.get_workspace_role(workspace_id, auth.uid()) IN ('owner','editor')
  );
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE USING (public.get_workspace_role(workspace_id, auth.uid()) = 'owner');
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

-- workspace_reports
DROP POLICY IF EXISTS "workspace_reports_insert" ON public.workspace_reports;
DROP POLICY IF EXISTS "workspace_reports_delete"  ON public.workspace_reports;

CREATE POLICY "workspace_reports_insert" ON public.workspace_reports
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id, auth.uid()) IN ('owner','editor')
  );
CREATE POLICY "workspace_reports_delete" ON public.workspace_reports
  FOR DELETE USING (
    added_by = auth.uid()
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

-- report_comments
DROP POLICY IF EXISTS "report_comments_insert" ON public.report_comments;
DROP POLICY IF EXISTS "report_comments_update" ON public.report_comments;
DROP POLICY IF EXISTS "report_comments_delete" ON public.report_comments;

CREATE POLICY "report_comments_insert" ON public.report_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.get_workspace_role(workspace_id, auth.uid()) IN ('owner','editor')
  );
CREATE POLICY "report_comments_update" ON public.report_comments
  FOR UPDATE USING (
    auth.uid() = user_id
    OR public.get_workspace_role(workspace_id, auth.uid()) IN ('owner','editor')
  );
CREATE POLICY "report_comments_delete" ON public.report_comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

-- comment_replies
DROP POLICY IF EXISTS "comment_replies_insert" ON public.comment_replies;
DROP POLICY IF EXISTS "comment_replies_delete"  ON public.comment_replies;

CREATE POLICY "comment_replies_insert" ON public.comment_replies
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.report_comments rc
      WHERE rc.id = comment_id
        AND public.get_workspace_role(rc.workspace_id, auth.uid()) IN ('owner','editor')
    )
  );
CREATE POLICY "comment_replies_delete" ON public.comment_replies
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.report_comments rc
      WHERE rc.id = comment_id
        AND public.get_workspace_role(rc.workspace_id, auth.uid()) = 'owner'
    )
  );

-- workspace_activity
DROP POLICY IF EXISTS "workspace_activity_insert" ON public.workspace_activity;
CREATE POLICY "workspace_activity_insert" ON public.workspace_activity
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


-- ============================================================
-- PART 10 — HELPER FUNCTIONS
-- ============================================================

-- Two-arg version: explicit user_id
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Single-arg version: uses auth.uid()
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Role helper
CREATE OR REPLACE FUNCTION public.get_workspace_role(p_workspace_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Editor/owner check using auth.uid()
CREATE OR REPLACE FUNCTION public.is_workspace_editor_or_owner(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
      AND role         IN ('owner', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;


-- ============================================================
-- PART 10 — REALTIME PUBLICATION
-- ============================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.report_comments;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_replies;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_activity; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_reports;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_blocked_members; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- PART 11 — COMMENT REACTIONS TABLE
-- One reaction per (comment_id, user_id) — exclusive model.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID        NOT NULL REFERENCES public.report_comments(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT        NOT NULL CHECK (emoji IN ('👍', '✅', '❓', '🔥')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON public.comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id    ON public.comment_reactions(user_id);


-- ============================================================
-- PART 11 — PINNED WORKSPACE REPORTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pinned_workspace_reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id)        ON DELETE CASCADE,
  report_id    UUID        NOT NULL REFERENCES public.research_reports(id)   ON DELETE CASCADE,
  pinned_by    UUID        NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  pinned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_workspace_reports_workspace ON public.pinned_workspace_reports(workspace_id);


-- ── Part 11 RLS ───────────────────────────────────────────────

ALTER TABLE public.comment_reactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_workspace_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_reactions_select_member"
  ON public.comment_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.report_comments rc
      JOIN   public.workspace_members wm ON wm.workspace_id = rc.workspace_id
      WHERE  rc.id      = comment_id
        AND  wm.user_id = auth.uid()
    )
  );

CREATE POLICY "comment_reactions_insert_editor"
  ON public.comment_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.report_comments rc
      WHERE rc.id = comment_id
        AND public.is_workspace_editor_or_owner(rc.workspace_id)
    )
  );

CREATE POLICY "comment_reactions_delete_own"
  ON public.comment_reactions FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "pinned_reports_select_member"
  ON public.pinned_workspace_reports FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "pinned_reports_insert_editor"
  ON public.pinned_workspace_reports FOR INSERT
  WITH CHECK (
    public.is_workspace_editor_or_owner(workspace_id)
    AND pinned_by = auth.uid()
  );

CREATE POLICY "pinned_reports_delete_editor"
  ON public.pinned_workspace_reports FOR DELETE
  USING (public.is_workspace_editor_or_owner(workspace_id));


-- ── Part 11 Realtime ──────────────────────────────────────────

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_reactions;        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_workspace_reports; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- PART 11 — workspace_search_index VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.workspace_search_index AS
  SELECT
    wr.workspace_id,
    'report'                                                AS result_type,
    wr.report_id::TEXT                                      AS result_id,
    COALESCE(rr.title, rr.query, 'Untitled Report')        AS title,
    COALESCE(LEFT(rr.executive_summary, 120), '')           AS subtitle,
    wr.report_id::TEXT                                      AS report_id,
    NULL::TEXT                                              AS avatar_url,
    wr.added_at                                             AS created_at,
    to_tsvector('english',
      COALESCE(rr.title, '')        || ' ' ||
      COALESCE(rr.query, '')        || ' ' ||
      COALESCE(rr.executive_summary, '')
    )                                                       AS search_vec
  FROM public.workspace_reports wr
  JOIN public.research_reports  rr ON rr.id = wr.report_id

  UNION ALL

  SELECT
    rc.workspace_id,
    'comment'                                               AS result_type,
    rc.id::TEXT                                             AS result_id,
    LEFT(rc.content, 80)                                    AS title,
    ''                                                      AS subtitle,
    rc.report_id::TEXT                                      AS report_id,
    NULL::TEXT                                              AS avatar_url,
    rc.created_at,
    to_tsvector('english', rc.content)                      AS search_vec
  FROM public.report_comments rc

  UNION ALL

  SELECT
    wm.workspace_id,
    'member'                                                AS result_type,
    wm.user_id::TEXT                                        AS result_id,
    COALESCE(p.full_name, p.username, 'Unknown Member')     AS title,
    COALESCE(p.username, '') || ' · ' || wm.role            AS subtitle,
    NULL::TEXT                                              AS report_id,
    p.avatar_url                                            AS avatar_url,
    wm.joined_at                                            AS created_at,
    to_tsvector('english',
      COALESCE(p.full_name, '') || ' ' ||
      COALESCE(p.username,  '') || ' ' ||
      wm.role
    )                                                       AS search_vec
  FROM public.workspace_members wm
  JOIN public.profiles           p ON p.id = wm.user_id;

GRANT SELECT ON public.workspace_search_index TO authenticated;


-- ============================================================
-- PART 12 — EDIT ACCESS REQUESTS TABLE
-- Part 13: status check extended to include 'removed'
-- ============================================================

CREATE TABLE IF NOT EXISTS public.edit_access_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message      TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'denied', 'removed')),
  reviewed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- Idempotent: if table already existed without 'removed', update the constraint
DO $$
DECLARE
  v_con text;
BEGIN
  FOR v_con IN
    SELECT con.conname
    FROM   pg_constraint con
    JOIN   pg_class      cls ON cls.oid = con.conrelid
    JOIN   pg_namespace  ns  ON ns.oid  = cls.relnamespace
    WHERE  ns.nspname  = 'public'
      AND  cls.relname = 'edit_access_requests'
      AND  con.contype = 'c'
      AND  con.conname LIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.edit_access_requests DROP CONSTRAINT IF EXISTS %I',
      v_con
    );
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.edit_access_requests
    ADD CONSTRAINT edit_access_requests_status_check
    CHECK (status IN ('pending','approved','denied','removed'));
EXCEPTION
  WHEN undefined_table  THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_edit_access_requests_workspace ON public.edit_access_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_edit_access_requests_user      ON public.edit_access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_edit_access_requests_status    ON public.edit_access_requests(status);

DROP TRIGGER IF EXISTS edit_access_requests_updated_at ON public.edit_access_requests;
CREATE TRIGGER edit_access_requests_updated_at
  BEFORE UPDATE ON public.edit_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.edit_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edit_access_requests_select"
  ON public.edit_access_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_workspace_editor_or_owner(workspace_id)
  );

CREATE POLICY "edit_access_requests_insert"
  ON public.edit_access_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "edit_access_requests_update"
  ON public.edit_access_requests FOR UPDATE
  USING (public.is_workspace_editor_or_owner(workspace_id));

CREATE POLICY "edit_access_requests_delete"
  ON public.edit_access_requests FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.get_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.edit_access_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- ADDITIONAL INDEXES (Parts 12-13 performance)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id      ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_reports_workspace_id ON public.workspace_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_reports_added_by     ON public.workspace_reports(added_by);
CREATE INDEX IF NOT EXISTS idx_report_comments_workspace_user ON public.report_comments(workspace_id, user_id);


-- ============================================================
-- DROP ALL FUNCTIONS BEFORE RECREATING (avoids 42P13 errors)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_user_research_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_debate_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_complete_stats(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_report(uuid, uuid);
DROP FUNCTION IF EXISTS public.create_workspace(text, text, boolean);
DROP FUNCTION IF EXISTS public.join_workspace_by_code(text);
DROP FUNCTION IF EXISTS public.preview_workspace_by_code(text);
DROP FUNCTION IF EXISTS public.get_workspace_feed(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_report_comments_with_profiles(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_section_comment_counts(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_workspace_activity_feed(uuid, int);
DROP FUNCTION IF EXISTS public.get_workspace_members_with_profiles(uuid);
DROP FUNCTION IF EXISTS public.toggle_comment_resolved(uuid);
DROP FUNCTION IF EXISTS public.regenerate_invite_code(uuid);
DROP FUNCTION IF EXISTS public.transfer_workspace_ownership(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_user_workspace_stats(uuid);
DROP FUNCTION IF EXISTS public.handle_new_user_workspace();
DROP FUNCTION IF EXISTS public.toggle_comment_reaction(uuid, text);
DROP FUNCTION IF EXISTS public.get_comment_reactions(uuid[]);
DROP FUNCTION IF EXISTS public.toggle_pin_workspace_report(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_pinned_report_ids(uuid);
DROP FUNCTION IF EXISTS public.search_workspace(uuid, text, int);
DROP FUNCTION IF EXISTS public.request_editor_access(uuid, text);
DROP FUNCTION IF EXISTS public.approve_editor_request(uuid);
DROP FUNCTION IF EXISTS public.deny_editor_request(uuid);
DROP FUNCTION IF EXISTS public.retract_editor_request(uuid);
DROP FUNCTION IF EXISTS public.get_pending_access_requests(uuid);
DROP FUNCTION IF EXISTS public.get_member_workspace_stats(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_comment_summary_context(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_auth_user_workspace_ids();
-- Part 13 additions
DROP FUNCTION IF EXISTS public.update_workspace_logo(uuid, text);
DROP FUNCTION IF EXISTS public.is_blocked_from_workspace(uuid, uuid);
DROP FUNCTION IF EXISTS public.block_workspace_member(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.unblock_workspace_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_workspace_blocked_members(uuid);
DROP FUNCTION IF EXISTS public.demote_editor_to_viewer(uuid, uuid);
DROP FUNCTION IF EXISTS public.count_member_replies_in_workspace(uuid, uuid);


-- ============================================================
-- PART 5 — RPC: get_presentations_for_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_presentations_for_report(
  p_report_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  id           UUID,
  title        TEXT,
  subtitle     TEXT,
  theme        TEXT,
  total_slides INTEGER,
  export_count INTEGER,
  generated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.title, p.subtitle, p.theme,
         p.total_slides, p.export_count, p.generated_at
  FROM public.presentations p
  WHERE p.report_id = p_report_id AND p.user_id = p_user_id
  ORDER BY p.generated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presentations_for_report(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 5 — RPC: increment_presentation_export
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_presentation_export(
  p_presentation_id UUID,
  p_user_id         UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.presentations
  SET export_count = COALESCE(export_count, 0) + 1
  WHERE id = p_presentation_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_presentation_export(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 6 — RPC: match_report_chunks
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_report_chunks(
  query_embedding vector(1536),
  p_report_id     UUID,
  p_user_id       UUID,
  match_count     INT   DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.30
)
RETURNS TABLE (
  id         UUID,
  chunk_id   TEXT,
  chunk_type TEXT,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    re.id, re.chunk_id, re.chunk_type, re.content, re.metadata,
    (1 - (re.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.report_embeddings re
  WHERE re.report_id = p_report_id
    AND re.user_id   = p_user_id
    AND (1 - (re.embedding <=> query_embedding)) > match_threshold
  ORDER BY re.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_report_chunks(vector, UUID, UUID, INT, FLOAT) TO authenticated;


-- ============================================================
-- PART 6 — RPC: is_report_embedded
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_report_embedded(p_report_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.report_embeddings
    WHERE report_id = p_report_id AND user_id = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_report_embedded(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 6 — RPC: get_assistant_conversation
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_assistant_conversation(
  p_report_id UUID,
  p_user_id   UUID,
  p_limit     INT DEFAULT 100
)
RETURNS TABLE (
  id                   UUID,
  role                 TEXT,
  content              TEXT,
  mode                 TEXT,
  retrieved_chunks     JSONB,
  suggested_follow_ups JSONB,
  is_rag_powered       BOOLEAN,
  confidence           TEXT,
  created_at           TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT ac.id, ac.role, ac.content, ac.mode,
         ac.retrieved_chunks, ac.suggested_follow_ups,
         ac.is_rag_powered, ac.confidence, ac.created_at
  FROM public.assistant_conversations ac
  WHERE ac.report_id = p_report_id AND ac.user_id = p_user_id
  ORDER BY ac.created_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_conversation(UUID, UUID, INT) TO authenticated;


-- ============================================================
-- PART 6 — RPC: delete_report_embeddings
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_report_embeddings(p_report_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.report_embeddings
  WHERE report_id = p_report_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_report_embeddings(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 6 — RPC: get_report_embedding_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_embedding_stats(p_report_id UUID, p_user_id UUID)
RETURNS TABLE (
  total_chunks BIGINT,
  chunk_types  JSONB,
  embedded_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_chunks,
    jsonb_object_agg(chunk_type, cnt) AS chunk_types,
    MIN(created_at) AS embedded_at
  FROM (
    SELECT chunk_type, COUNT(*) AS cnt, MIN(created_at) AS created_at
    FROM public.report_embeddings
    WHERE report_id = p_report_id AND user_id = p_user_id
    GROUP BY chunk_type
  ) sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_embedding_stats(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 7 — RPC: get_academic_paper_by_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_academic_paper_by_report(p_report_id UUID)
RETURNS SETOF public.academic_papers
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT * FROM public.academic_papers
  WHERE report_id = p_report_id AND user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_academic_paper_by_report(UUID) TO authenticated;


-- ============================================================
-- PART 7 — RPC: increment_academic_export_count
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_academic_export_count(p_paper_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.academic_papers
  SET export_count = export_count + 1, updated_at = NOW()
  WHERE id = p_paper_id AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.increment_academic_export_count(UUID) TO authenticated;


-- ============================================================
-- PART 7 — RPC: get_user_academic_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_academic_stats(p_user_id UUID)
RETURNS TABLE (
  total_papers       BIGINT,
  total_word_count   BIGINT,
  avg_page_estimate  NUMERIC,
  most_used_style    TEXT,
  papers_this_month  BIGINT
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(word_count), 0)::BIGINT,
    COALESCE(ROUND(AVG(page_estimate)::NUMERIC, 1), 0)::NUMERIC,
    (
      SELECT citation_style FROM public.academic_papers
      WHERE user_id = p_user_id
      GROUP BY citation_style ORDER BY COUNT(*) DESC LIMIT 1
    )::TEXT,
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', generated_at) = DATE_TRUNC('month', NOW()))::BIGINT
  FROM public.academic_papers
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_academic_stats(UUID) TO authenticated;


-- ============================================================
-- PART 8 — RPC: get_podcast_by_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_podcast_by_report(p_report_id UUID, p_user_id UUID)
RETURNS SETOF public.podcasts
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT * FROM public.podcasts
  WHERE report_id = p_report_id
    AND user_id   = p_user_id
    AND status    = 'completed'
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_podcast_by_report(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 8 — RPC: get_user_podcast_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_podcast_stats(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'totalPodcasts',
        COUNT(*),
    'completedPodcasts',
        COUNT(*) FILTER (WHERE status = 'completed'),
    'totalDurationMinutes',
        ROUND(COALESCE(SUM(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC / 60, 1),
    'totalWords',
        COALESCE(SUM(word_count) FILTER (WHERE status = 'completed'), 0),
    'reportsWithPodcasts',
        COUNT(DISTINCT report_id) FILTER (WHERE report_id IS NOT NULL)
  ) INTO result
  FROM public.podcasts
  WHERE user_id = p_user_id;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_podcast_stats(UUID) TO authenticated;


-- ============================================================
-- PART 8 — RPC: increment_podcast_export_count
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_podcast_export_count(p_podcast_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.podcasts SET export_count = export_count + 1 WHERE id = p_podcast_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_podcast_export_count(UUID) TO authenticated;


-- ============================================================
-- PART 9 — RPC: get_user_debate_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_debate_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     BIGINT;
  v_completed BIGINT;
  v_topics    TEXT[];
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    ARRAY_AGG(topic ORDER BY created_at DESC)
  INTO v_total, v_completed, v_topics
  FROM public.debate_sessions
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'total',     COALESCE(v_total,     0),
    'completed', COALESCE(v_completed, 0),
    'topics',    COALESCE(v_topics,    ARRAY[]::TEXT[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_debate_stats(UUID) TO authenticated;


-- ============================================================
-- PART 3/STATS — RPC: get_user_research_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_research_stats(p_user_id UUID)
RETURNS TABLE (
  total_reports             BIGINT,
  completed_reports         BIGINT,
  total_sources             BIGINT,
  avg_reliability           NUMERIC,
  favorite_topic            TEXT,
  reports_this_month        BIGINT,
  public_reports            BIGINT,
  total_presentations       BIGINT,
  total_slides              BIGINT,
  total_assistant_messages  BIGINT,
  reports_with_embeddings   BIGINT,
  total_debates             BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_reports            BIGINT  := 0;
  v_completed_reports        BIGINT  := 0;
  v_total_sources            BIGINT  := 0;
  v_avg_reliability          NUMERIC := 0;
  v_favorite_topic           TEXT    := NULL;
  v_reports_this_month       BIGINT  := 0;
  v_public_reports           BIGINT  := 0;
  v_total_presentations      BIGINT  := 0;
  v_total_slides             BIGINT  := 0;
  v_total_assistant_messages BIGINT  := 0;
  v_reports_with_embeddings  BIGINT  := 0;
  v_total_debates            BIGINT  := 0;
BEGIN
  BEGIN
    SELECT
      COUNT(rr.id),
      COUNT(rr.id)  FILTER (WHERE rr.status = 'completed'),
      COALESCE(SUM(rr.sources_count), 0),
      COALESCE(AVG(rr.reliability_score) FILTER (WHERE rr.status = 'completed'), 0),
      COUNT(rr.id)  FILTER (WHERE rr.created_at >= DATE_TRUNC('month', NOW())),
      COUNT(rr.id)  FILTER (WHERE rr.is_public = TRUE)
    INTO
      v_total_reports, v_completed_reports, v_total_sources,
      v_avg_reliability, v_reports_this_month, v_public_reports
    FROM public.research_reports rr
    WHERE rr.user_id = p_user_id;

    SELECT rr2.query INTO v_favorite_topic
    FROM   public.research_reports rr2
    WHERE  rr2.user_id = p_user_id AND rr2.status = 'completed'
    GROUP  BY rr2.query ORDER BY COUNT(*) DESC LIMIT 1;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  BEGIN
    SELECT COUNT(p.id), COALESCE(SUM(p.total_slides), 0)
    INTO   v_total_presentations, v_total_slides
    FROM   public.presentations p WHERE p.user_id = p_user_id;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  BEGIN
    SELECT COUNT(ac.id) INTO v_total_assistant_messages
    FROM   public.assistant_conversations ac
    WHERE  ac.user_id = p_user_id AND ac.role = 'assistant';
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  BEGIN
    SELECT COUNT(DISTINCT re.report_id) INTO v_reports_with_embeddings
    FROM   public.report_embeddings re WHERE re.user_id = p_user_id;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_debates
    FROM   public.debate_sessions ds
    WHERE  ds.user_id = p_user_id AND ds.status = 'completed';
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  RETURN QUERY SELECT
    COALESCE(v_total_reports,            0)::BIGINT,
    COALESCE(v_completed_reports,        0)::BIGINT,
    COALESCE(v_total_sources,            0)::BIGINT,
    COALESCE(v_avg_reliability,          0)::NUMERIC,
    v_favorite_topic::TEXT,
    COALESCE(v_reports_this_month,       0)::BIGINT,
    COALESCE(v_public_reports,           0)::BIGINT,
    COALESCE(v_total_presentations,      0)::BIGINT,
    COALESCE(v_total_slides,             0)::BIGINT,
    COALESCE(v_total_assistant_messages, 0)::BIGINT,
    COALESCE(v_reports_with_embeddings,  0)::BIGINT,
    COALESCE(v_total_debates,            0)::BIGINT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_research_stats(UUID) TO authenticated;


-- ============================================================
-- COMPREHENSIVE STATS — RPC: get_user_complete_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_complete_stats(p_user_id UUID)
RETURNS TABLE (
  total_reports               BIGINT,
  completed_reports           BIGINT,
  total_sources               BIGINT,
  avg_reliability             NUMERIC,
  favorite_topic              TEXT,
  reports_this_month          BIGINT,
  total_assistant_messages    BIGINT,
  reports_with_embeddings     BIGINT,
  total_presentations         BIGINT,
  total_slides                BIGINT,
  academic_papers_generated   BIGINT,
  academic_word_count         BIGINT,
  academic_pages_estimate     NUMERIC,
  most_used_citation_style    TEXT,
  total_podcasts              BIGINT,
  completed_podcasts          BIGINT,
  total_podcast_duration_min  NUMERIC,
  total_podcast_words         BIGINT,
  reports_with_podcasts       BIGINT,
  total_debates               BIGINT,
  completed_debates           BIGINT
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH
  report_stats AS (
    SELECT
      COUNT(rr.id)::BIGINT AS total_reports,
      COUNT(rr.id) FILTER (WHERE rr.status = 'completed')::BIGINT AS completed_reports,
      COALESCE(SUM(rr.sources_count), 0)::BIGINT AS total_sources,
      COALESCE(ROUND(AVG(rr.reliability_score) FILTER (
        WHERE rr.reliability_score IS NOT NULL)::NUMERIC, 1), 0)::NUMERIC AS avg_reliability,
      COUNT(rr.id) FILTER (
        WHERE DATE_TRUNC('month', rr.created_at) = DATE_TRUNC('month', NOW())
      )::BIGINT AS reports_this_month
    FROM public.research_reports rr WHERE rr.user_id = p_user_id
  ),
  favorite_topic_result AS (
    SELECT rr.query AS fav_topic
    FROM public.research_reports rr
    WHERE rr.user_id = p_user_id AND rr.status = 'completed'
    GROUP BY rr.query ORDER BY COUNT(*) DESC LIMIT 1
  ),
  assistant_stats AS (
    SELECT COUNT(*)::BIGINT AS total_msgs
    FROM public.assistant_conversations ac
    WHERE ac.user_id = p_user_id AND ac.role = 'assistant'
  ),
  embedding_stats AS (
    SELECT COUNT(DISTINCT re.report_id)::BIGINT AS reports_with_embeds
    FROM public.report_embeddings re WHERE re.user_id = p_user_id
  ),
  presentation_stats AS (
    SELECT
      COUNT(p.id)::BIGINT AS total_presentations,
      COALESCE(SUM(p.total_slides), 0)::BIGINT AS total_slides
    FROM public.presentations p WHERE p.user_id = p_user_id
  ),
  academic_stats AS (
    SELECT
      COUNT(*)::BIGINT AS total_papers,
      COALESCE(SUM(word_count), 0)::BIGINT AS total_words,
      COALESCE(ROUND(AVG(page_estimate)::NUMERIC, 1), 0)::NUMERIC AS avg_pages,
      (
        SELECT citation_style FROM public.academic_papers
        WHERE user_id = p_user_id
        GROUP BY citation_style ORDER BY COUNT(*) DESC LIMIT 1
      )::TEXT AS most_used_style
    FROM public.academic_papers ap WHERE ap.user_id = p_user_id
  ),
  podcast_stats AS (
    SELECT
      COUNT(*)::BIGINT AS total_podcasts,
      COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_podcasts,
      COALESCE(ROUND(SUM(duration_seconds) FILTER (
        WHERE status = 'completed')::NUMERIC / 60, 1), 0)::NUMERIC AS total_duration_min,
      COALESCE(SUM(word_count) FILTER (WHERE status = 'completed'), 0)::BIGINT AS total_words,
      COUNT(DISTINCT report_id) FILTER (WHERE report_id IS NOT NULL)::BIGINT AS reports_with_podcasts
    FROM public.podcasts p WHERE p.user_id = p_user_id
  ),
  debate_stats AS (
    SELECT
      COUNT(*)::BIGINT AS total_debates,
      COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_debates
    FROM public.debate_sessions ds WHERE ds.user_id = p_user_id
  )
  SELECT
    rs.total_reports,
    rs.completed_reports,
    rs.total_sources,
    rs.avg_reliability,
    COALESCE((SELECT fav_topic FROM favorite_topic_result), NULL)::TEXT,
    rs.reports_this_month,
    COALESCE((SELECT total_msgs          FROM assistant_stats),    0)::BIGINT,
    COALESCE((SELECT reports_with_embeds FROM embedding_stats),    0)::BIGINT,
    COALESCE((SELECT total_presentations FROM presentation_stats), 0)::BIGINT,
    COALESCE((SELECT total_slides        FROM presentation_stats), 0)::BIGINT,
    COALESCE((SELECT total_papers        FROM academic_stats),     0)::BIGINT,
    COALESCE((SELECT total_words         FROM academic_stats),     0)::BIGINT,
    COALESCE((SELECT avg_pages           FROM academic_stats),     0)::NUMERIC,
    (SELECT most_used_style              FROM academic_stats)::TEXT,
    COALESCE((SELECT total_podcasts      FROM podcast_stats),      0)::BIGINT,
    COALESCE((SELECT completed_podcasts  FROM podcast_stats),      0)::BIGINT,
    COALESCE((SELECT total_duration_min  FROM podcast_stats),      0)::NUMERIC,
    COALESCE((SELECT total_words         FROM podcast_stats),      0)::BIGINT,
    COALESCE((SELECT reports_with_podcasts FROM podcast_stats),    0)::BIGINT,
    COALESCE((SELECT total_debates       FROM debate_stats),       0)::BIGINT,
    COALESCE((SELECT completed_debates   FROM debate_stats),       0)::BIGINT
  FROM report_stats rs;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_complete_stats(UUID) TO authenticated;


-- ============================================================
-- PART 4 — RPC: get_public_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_report(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_report JSONB;
BEGIN
  SELECT to_jsonb(r) INTO v_report
  FROM public.research_reports r
  WHERE r.public_token = p_token AND r.is_public = TRUE AND r.status = 'completed';

  IF v_report IS NULL THEN
    RETURN jsonb_build_object('error', 'Report not found or not public');
  END IF;

  UPDATE public.research_reports
  SET public_view_count = COALESCE(public_view_count, 0) + 1
  WHERE public_token = p_token;

  RETURN v_report;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_report(TEXT) TO anon, authenticated;


-- ============================================================
-- PART 4 — RPC: set_report_public
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_report_public(
  p_report_id UUID,
  p_user_id   UUID,
  p_is_public BOOLEAN
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_token TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.research_reports
    WHERE id = p_report_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Report not found or access denied';
  END IF;

  IF p_is_public THEN
    UPDATE public.research_reports
    SET is_public    = TRUE,
        public_token = COALESCE(public_token, encode(gen_random_bytes(16), 'hex'))
    WHERE id = p_report_id
    RETURNING public_token INTO v_token;
    RETURN v_token;
  ELSE
    UPDATE public.research_reports SET is_public = FALSE WHERE id = p_report_id;
    RETURN NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_report_public(UUID, UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_workspace_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_report(p_report_id UUID, p_workspace_id UUID)
RETURNS SETOF public.research_reports
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM   public.research_reports r
  WHERE  r.id = p_report_id
  AND EXISTS (
    SELECT 1
    FROM   public.workspace_reports  wr
    JOIN   public.workspace_members  wm ON wm.workspace_id = wr.workspace_id
    WHERE  wr.report_id    = r.id
    AND    wr.workspace_id = p_workspace_id
    AND    wm.user_id      = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_report(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: create_workspace
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name        TEXT,
  p_description TEXT    DEFAULT NULL,
  p_is_personal BOOLEAN DEFAULT false
)
RETURNS public.workspaces AS $$
DECLARE
  v_workspace public.workspaces;
BEGIN
  INSERT INTO public.workspaces (name, description, owner_id, is_personal)
  VALUES (p_name, p_description, auth.uid(), p_is_personal)
  RETURNING * INTO v_workspace;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace.id, auth.uid(), 'owner');

  INSERT INTO public.workspace_activity (workspace_id, user_id, action, resource_type, resource_id)
  VALUES (v_workspace.id, auth.uid(), 'workspace_created', 'workspace', v_workspace.id::text);

  RETURN v_workspace;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, BOOLEAN) TO authenticated;


-- ============================================================
-- PART 13 — RPC: join_workspace_by_code (DEFINITIVE VERSION)
-- Returns JSON. Checks blocked list. No is_personal reference.
-- Activity log is non-fatal with entity_type/resource_type fallback.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_workspace_by_code(p_invite_code TEXT)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws record;
BEGIN
  SELECT id, name INTO v_ws
  FROM   public.workspaces
  WHERE  invite_code = p_invite_code::text
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code — no workspace found';
  END IF;

  IF public.is_blocked_from_workspace(v_ws.id, auth.uid()) THEN
    RAISE EXCEPTION 'You have been blocked from joining this workspace';
  END IF;

  IF public.is_workspace_member(v_ws.id, auth.uid()) THEN
    RAISE EXCEPTION 'You are already a member of this workspace';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws.id, auth.uid(), 'viewer');

  -- Activity log — non-fatal, with column-name fallback
  BEGIN
    INSERT INTO public.workspace_activity
      (workspace_id, user_id, action, entity_type, entity_id)
    VALUES (v_ws.id, auth.uid(), 'member_joined', 'user', auth.uid());
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workspace_activity
        (workspace_id, user_id, action, resource_type, resource_id)
      VALUES (v_ws.id, auth.uid(), 'member_joined', 'user', auth.uid()::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'join_workspace_by_code: activity log skipped — %', SQLERRM;
    END;
  END;

  RETURN json_build_object(
    'id',           gen_random_uuid(),
    'workspace_id', v_ws.id,
    'user_id',      auth.uid(),
    'role',         'viewer',
    'joined_at',    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_workspace_by_code(TEXT) TO authenticated;


-- ============================================================
-- PART 10 — RPC: preview_workspace_by_code
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_workspace_by_code(p_invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_workspace public.workspaces;
  v_count     INT;
BEGIN
  SELECT * INTO v_workspace FROM public.workspaces WHERE invite_code = p_invite_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.workspace_members WHERE workspace_id = v_workspace.id;

  RETURN json_build_object(
    'id',           v_workspace.id,
    'name',         v_workspace.name,
    'description',  v_workspace.description,
    'avatar_url',   v_workspace.avatar_url,
    'logo_url',     v_workspace.logo_url,
    'member_count', v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.preview_workspace_by_code(TEXT) TO authenticated, anon;


-- ============================================================
-- PART 13 — RPC: update_workspace_logo
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_workspace_logo(
  p_workspace_id uuid,
  p_avatar_url   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_editor_or_owner(p_workspace_id) THEN
    RAISE EXCEPTION 'Only owners and editors can update the workspace logo';
  END IF;

  UPDATE public.workspaces
     SET avatar_url = p_avatar_url,
         updated_at = now()
   WHERE id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_workspace_logo(uuid, text) TO authenticated;


-- ============================================================
-- PART 13 — HELPER: is_blocked_from_workspace
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_blocked_from_workspace(
  p_workspace_id uuid,
  p_user_id      uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   public.workspace_blocked_members
    WHERE  workspace_id    = p_workspace_id
      AND  blocked_user_id = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_from_workspace(uuid, uuid) TO authenticated;


-- ============================================================
-- PART 13 — RPC: block_workspace_member
-- FIX [B]: workspace_activity INSERT is non-fatal with column-name fallback.
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_workspace_member(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_reason       text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF public.get_workspace_role(p_workspace_id, auth.uid()) != 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can block members';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot block yourself';
  END IF;

  v_target_role := public.get_workspace_role(p_workspace_id, p_user_id);
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot block a workspace owner';
  END IF;

  -- Remove from workspace
  DELETE FROM public.workspace_members
   WHERE workspace_id = p_workspace_id
     AND user_id      = p_user_id;

  -- Update access requests (non-fatal)
  BEGIN
    UPDATE public.edit_access_requests
       SET status      = 'denied',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at  = now()
     WHERE workspace_id = p_workspace_id
       AND user_id      = p_user_id
       AND status       = 'pending';

    UPDATE public.edit_access_requests
       SET status      = 'removed',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at  = now()
     WHERE workspace_id = p_workspace_id
       AND user_id      = p_user_id
       AND status       = 'approved';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'block_workspace_member: edit_access_requests update skipped — %', SQLERRM;
  END;

  -- Insert into blocked list
  INSERT INTO public.workspace_blocked_members
    (workspace_id, blocked_user_id, blocked_by, reason)
  VALUES (p_workspace_id, p_user_id, auth.uid(), p_reason)
  ON CONFLICT (workspace_id, blocked_user_id) DO NOTHING;

  -- Activity log — non-fatal with column-name fallback
  BEGIN
    INSERT INTO public.workspace_activity
      (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      p_workspace_id, auth.uid(), 'member_blocked',
      'user', p_user_id,
      jsonb_build_object('reason', p_reason)
    );
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workspace_activity
        (workspace_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (
        p_workspace_id, auth.uid(), 'member_blocked',
        'user', p_user_id::text,
        jsonb_build_object('reason', p_reason)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'block_workspace_member: activity log skipped — %', SQLERRM;
    END;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_workspace_member(uuid, uuid, text) TO authenticated;


-- ============================================================
-- PART 13 — RPC: unblock_workspace_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.unblock_workspace_member(
  p_workspace_id uuid,
  p_user_id      uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_workspace_role(p_workspace_id, auth.uid()) != 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can unblock members';
  END IF;

  DELETE FROM public.workspace_blocked_members
   WHERE workspace_id    = p_workspace_id
     AND blocked_user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_workspace_member(uuid, uuid) TO authenticated;


-- ============================================================
-- PART 13 — RPC: get_workspace_blocked_members
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_blocked_members(p_workspace_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_workspace_role(p_workspace_id, auth.uid()) != 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can view blocked members';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_data ORDER BY (row_data->>'blocked_at') DESC)
    FROM (
      SELECT json_build_object(
        'id',               b.id,
        'workspace_id',     b.workspace_id,
        'blocked_user_id',  b.blocked_user_id,
        'blocked_by',       b.blocked_by,
        'reason',           b.reason,
        'blocked_at',       b.blocked_at,
        'profile', json_build_object(
          'id',         p.id,
          'username',   p.username,
          'full_name',  p.full_name,
          'avatar_url', p.avatar_url
        )
      ) AS row_data
      FROM public.workspace_blocked_members b
      LEFT JOIN public.profiles p ON p.id = b.blocked_user_id
      WHERE b.workspace_id = p_workspace_id
    ) sub
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_blocked_members(uuid) TO authenticated;


-- ============================================================
-- PART 13 — RPC: demote_editor_to_viewer
-- Activity log is non-fatal with column-name fallback.
-- ============================================================

CREATE OR REPLACE FUNCTION public.demote_editor_to_viewer(
  p_workspace_id uuid,
  p_user_id      uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_workspace_role(p_workspace_id, auth.uid()) != 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can demote members';
  END IF;

  UPDATE public.workspace_members
     SET role = 'viewer'
   WHERE workspace_id = p_workspace_id
     AND user_id      = p_user_id;

  -- Update access request (non-fatal)
  BEGIN
    UPDATE public.edit_access_requests ear
       SET status      = 'removed',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at  = now()
     WHERE ear.id = (
         SELECT id FROM public.edit_access_requests
          WHERE workspace_id = p_workspace_id
            AND user_id      = p_user_id
            AND status       = 'approved'
          ORDER BY created_at DESC
          LIMIT 1
     );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'demote_editor_to_viewer: edit_access_requests update skipped — %', SQLERRM;
  END;

  -- Activity log — non-fatal with column-name fallback
  BEGIN
    INSERT INTO public.workspace_activity
      (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      p_workspace_id, auth.uid(), 'member_role_changed',
      'user', p_user_id,
      jsonb_build_object('new_role','viewer','previous_role','editor')
    );
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workspace_activity
        (workspace_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (
        p_workspace_id, auth.uid(), 'member_role_changed',
        'user', p_user_id::text,
        jsonb_build_object('new_role','viewer','previous_role','editor')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'demote_editor_to_viewer: activity log skipped — %', SQLERRM;
    END;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demote_editor_to_viewer(uuid, uuid) TO authenticated;


-- ============================================================
-- PART 13 — HELPER: count_member_replies_in_workspace
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_member_replies_in_workspace(
  p_workspace_id uuid,
  p_user_id      uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(cr.id)
      FROM public.comment_replies cr
      JOIN public.report_comments rc ON rc.id = cr.comment_id
     WHERE rc.workspace_id = p_workspace_id
       AND cr.user_id      = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_member_replies_in_workspace(uuid, uuid) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_workspace_feed
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_feed(
  p_workspace_id UUID,
  p_limit        INT DEFAULT 20,
  p_offset       INT DEFAULT 0
)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(item), '[]'::json)
    FROM (
      SELECT json_build_object(
        'id',           wr.id,
        'workspace_id', wr.workspace_id,
        'report_id',    wr.report_id,
        'added_by',     wr.added_by,
        'added_at',     wr.added_at,
        'is_pinned',    EXISTS (
          SELECT 1 FROM public.pinned_workspace_reports pwr
          WHERE pwr.workspace_id = wr.workspace_id AND pwr.report_id = wr.report_id
        ),
        'report', json_build_object(
          'id',                rr.id,
          'title',             rr.title,
          'query',             rr.query,
          'depth',             rr.depth,
          'status',            rr.status,
          'executive_summary', rr.executive_summary,
          'reliability_score', rr.reliability_score,
          'sources_count',     rr.sources_count,
          'created_at',        rr.created_at,
          'completed_at',      rr.completed_at
        ),
        'added_by_profile', json_build_object(
          'id',         p.id,
          'username',   p.username,
          'full_name',  p.full_name,
          'avatar_url', p.avatar_url
        ),
        'comment_count', (
          SELECT COUNT(*) FROM public.report_comments rc
          WHERE rc.report_id = rr.id AND rc.workspace_id = p_workspace_id
        )
      ) AS item
      FROM public.workspace_reports wr
      JOIN public.research_reports  rr ON rr.id = wr.report_id
      LEFT JOIN public.profiles      p  ON p.id  = wr.added_by
      WHERE wr.workspace_id = p_workspace_id
      ORDER BY wr.added_at DESC
      LIMIT p_limit OFFSET p_offset
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_workspace_feed(UUID, INT, INT) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_report_comments_with_profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_comments_with_profiles(
  p_report_id    UUID,
  p_workspace_id UUID
)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(thread ORDER BY rc.created_at ASC), '[]'::json)
    FROM public.report_comments rc
    LEFT JOIN public.profiles p ON p.id = rc.user_id
    CROSS JOIN LATERAL (
      SELECT json_build_object(
        'id',          rc.id,
        'workspace_id',rc.workspace_id,
        'report_id',   rc.report_id,
        'section_id',  rc.section_id,
        'user_id',     rc.user_id,
        'content',     rc.content,
        'is_resolved', rc.is_resolved,
        'resolved_by', rc.resolved_by,
        'resolved_at', rc.resolved_at,
        'mentions',    rc.mentions,
        'created_at',  rc.created_at,
        'updated_at',  rc.updated_at,
        'author', json_build_object(
          'id', p.id, 'username', p.username,
          'full_name', p.full_name, 'avatar_url', p.avatar_url
        ),
        'replies', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id',         cr.id,
              'comment_id', cr.comment_id,
              'user_id',    cr.user_id,
              'content',    cr.content,
              'mentions',   cr.mentions,
              'created_at', cr.created_at,
              'updated_at', cr.updated_at,
              'author', json_build_object(
                'id', rp.id, 'username', rp.username,
                'full_name', rp.full_name, 'avatar_url', rp.avatar_url
              )
            ) ORDER BY cr.created_at ASC
          ), '[]'::json)
          FROM public.comment_replies cr
          LEFT JOIN public.profiles rp ON rp.id = cr.user_id
          WHERE cr.comment_id = rc.id
        )
      ) AS thread
    ) threads
    WHERE rc.report_id = p_report_id AND rc.workspace_id = p_workspace_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_report_comments_with_profiles(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_section_comment_counts
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_section_comment_counts(
  p_report_id    UUID,
  p_workspace_id UUID
)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_object_agg(section_id, cnt), '{}'::json)
    FROM (
      SELECT section_id, COUNT(*) AS cnt
      FROM public.report_comments
      WHERE report_id    = p_report_id
        AND workspace_id = p_workspace_id
        AND section_id   IS NOT NULL
      GROUP BY section_id
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_section_comment_counts(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_workspace_members_with_profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_members_with_profiles(p_workspace_id UUID)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id',          wm.id,
        'workspace_id',wm.workspace_id,
        'user_id',     wm.user_id,
        'role',        wm.role,
        'invited_by',  wm.invited_by,
        'joined_at',   wm.joined_at,
        'profile', json_build_object(
          'id', p.id, 'username', p.username,
          'full_name', p.full_name, 'avatar_url', p.avatar_url
        )
      ) ORDER BY
        CASE wm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
        wm.joined_at ASC
    ), '[]'::json)
    FROM public.workspace_members wm
    LEFT JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_workspace_members_with_profiles(UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: toggle_comment_resolved
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_comment_resolved(p_comment_id UUID)
RETURNS public.report_comments AS $$
DECLARE
  v_comment public.report_comments;
BEGIN
  SELECT * INTO v_comment FROM public.report_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found'; END IF;

  IF NOT (v_comment.user_id = auth.uid()
    OR public.get_workspace_role(v_comment.workspace_id, auth.uid()) IN ('owner','editor'))
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.report_comments
  SET
    is_resolved = NOT is_resolved,
    resolved_by = CASE WHEN NOT is_resolved THEN auth.uid() ELSE NULL END,
    resolved_at = CASE WHEN NOT is_resolved THEN now()       ELSE NULL END
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.toggle_comment_resolved(UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: regenerate_invite_code
-- ============================================================

CREATE OR REPLACE FUNCTION public.regenerate_invite_code(p_workspace_id UUID)
RETURNS TEXT AS $$
DECLARE v_code TEXT;
BEGIN
  IF (SELECT owner_id FROM public.workspaces WHERE id = p_workspace_id) != auth.uid() THEN
    RAISE EXCEPTION 'Owner only';
  END IF;
  v_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  UPDATE public.workspaces SET invite_code = v_code WHERE id = p_workspace_id;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: transfer_workspace_ownership
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(
  p_workspace_id UUID,
  p_new_owner_id UUID
)
RETURNS VOID AS $$
BEGIN
  IF (SELECT owner_id FROM public.workspaces WHERE id = p_workspace_id) != auth.uid() THEN
    RAISE EXCEPTION 'Only current owner can transfer';
  END IF;
  IF NOT public.is_workspace_member(p_workspace_id, p_new_owner_id) THEN
    RAISE EXCEPTION 'New owner must be a member';
  END IF;

  UPDATE public.workspaces SET owner_id = p_new_owner_id WHERE id = p_workspace_id;
  UPDATE public.workspace_members SET role = 'owner'  WHERE workspace_id = p_workspace_id AND user_id = p_new_owner_id;
  UPDATE public.workspace_members SET role = 'editor' WHERE workspace_id = p_workspace_id AND user_id = auth.uid();

  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES
    (p_workspace_id, auth.uid(), 'ownership_transferred', 'workspace',
     p_workspace_id::text, json_build_object('new_owner_id', p_new_owner_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 10 — RPC: get_user_workspace_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_workspace_stats(p_user_id UUID DEFAULT auth.uid())
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'total_workspaces',     (SELECT COUNT(*) FROM public.workspace_members WHERE user_id = p_user_id),
    'owned_workspaces',     (SELECT COUNT(*) FROM public.workspaces       WHERE owner_id = p_user_id),
    'total_comments',       (SELECT COUNT(*) FROM public.report_comments  WHERE user_id = p_user_id),
    'total_reports_shared', (SELECT COUNT(*) FROM public.workspace_reports WHERE added_by = p_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_workspace_stats(UUID) TO authenticated;


-- ============================================================
-- PART 10 — Auto-create personal workspace trigger (opt-in)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_workspace('My Workspace', 'Personal research space', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- To enable: uncomment the two lines below:
-- DROP TRIGGER IF EXISTS on_new_profile_create_workspace ON public.profiles;
-- CREATE TRIGGER on_new_profile_create_workspace
--   AFTER INSERT ON public.profiles
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();


-- ============================================================
-- PART 11 — RPC: toggle_comment_reaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_comment_reaction(p_comment_id UUID, p_emoji TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing_emoji TEXT;
  v_added          BOOLEAN;
BEGIN
  IF p_emoji NOT IN ('👍', '✅', '❓', '🔥') THEN
    RAISE EXCEPTION 'Invalid emoji. Must be one of: 👍 ✅ ❓ 🔥';
  END IF;

  SELECT emoji INTO v_existing_emoji
  FROM   public.comment_reactions
  WHERE  comment_id = p_comment_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_existing_emoji IS NOT NULL THEN
    DELETE FROM public.comment_reactions
    WHERE comment_id = p_comment_id AND user_id = auth.uid();

    IF v_existing_emoji = p_emoji THEN
      RETURN jsonb_build_object('added', false, 'emoji', p_emoji, 'removed_emoji', v_existing_emoji);
    ELSE
      INSERT INTO public.comment_reactions (comment_id, user_id, emoji)
      VALUES (p_comment_id, auth.uid(), p_emoji);
      v_added := true;
    END IF;
  ELSE
    INSERT INTO public.comment_reactions (comment_id, user_id, emoji)
    VALUES (p_comment_id, auth.uid(), p_emoji);
    v_added := true;
  END IF;

  RETURN jsonb_build_object('added', v_added, 'emoji', p_emoji);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_comment_reaction(UUID, TEXT) TO authenticated;


-- ============================================================
-- PART 11 — RPC: get_comment_reactions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_comment_reactions(p_comment_ids UUID[])
RETURNS TABLE (
  comment_id  UUID,
  emoji       TEXT,
  count       BIGINT,
  has_reacted BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cr.comment_id,
    cr.emoji,
    COUNT(*)::BIGINT                 AS count,
    BOOL_OR(cr.user_id = auth.uid()) AS has_reacted
  FROM public.comment_reactions cr
  WHERE cr.comment_id = ANY(p_comment_ids)
  GROUP BY cr.comment_id, cr.emoji
  ORDER BY cr.comment_id, cr.emoji;
$$;

GRANT EXECUTE ON FUNCTION public.get_comment_reactions(UUID[]) TO authenticated;


-- ============================================================
-- PART 11 — RPC: toggle_pin_workspace_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_pin_workspace_report(
  p_workspace_id UUID,
  p_report_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing_id UUID;
  v_pinned      BOOLEAN;
BEGIN
  IF NOT public.is_workspace_editor_or_owner(p_workspace_id) THEN
    RAISE EXCEPTION 'Only editors and owners can pin reports';
  END IF;

  SELECT id INTO v_existing_id
  FROM   public.pinned_workspace_reports
  WHERE  workspace_id = p_workspace_id AND report_id = p_report_id;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.pinned_workspace_reports WHERE id = v_existing_id;
    v_pinned := false;
  ELSE
    INSERT INTO public.pinned_workspace_reports (workspace_id, report_id, pinned_by)
    VALUES (p_workspace_id, p_report_id, auth.uid());
    v_pinned := true;
  END IF;

  RETURN jsonb_build_object('pinned', v_pinned);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_pin_workspace_report(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 11 — RPC: get_pinned_report_ids
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pinned_report_ids(p_workspace_id UUID)
RETURNS TABLE (report_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT report_id
  FROM   public.pinned_workspace_reports
  WHERE  workspace_id = p_workspace_id
    AND  public.is_workspace_member(p_workspace_id)
  ORDER  BY pinned_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pinned_report_ids(UUID) TO authenticated;


-- ============================================================
-- PART 11 — RPC: search_workspace
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_workspace(
  p_workspace_id UUID,
  p_query        TEXT,
  p_limit        INT DEFAULT 25
)
RETURNS TABLE (
  result_type TEXT,
  result_id   TEXT,
  title       TEXT,
  subtitle    TEXT,
  report_id   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ,
  rank        REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (
    SELECT
      CASE WHEN length(trim(p_query)) > 0
           THEN websearch_to_tsquery('english', p_query)
           ELSE to_tsquery('english', 'a | b')
      END AS tsq,
      '%' || lower(trim(p_query)) || '%' AS ilike_pat,
      trim(p_query)                       AS raw
  )
  SELECT
    s.result_type,
    s.result_id,
    s.title,
    s.subtitle,
    s.report_id,
    s.avatar_url,
    s.created_at,
    CASE
      WHEN s.search_vec @@ (SELECT tsq FROM q)
        THEN ts_rank(s.search_vec, (SELECT tsq FROM q)) + 0.5
      ELSE 0.1
    END::REAL AS rank
  FROM public.workspace_search_index s, q
  WHERE s.workspace_id = p_workspace_id
    AND public.is_workspace_member(p_workspace_id)
    AND length(q.raw) > 0
    AND (
      s.search_vec @@ q.tsq
      OR lower(s.title)    LIKE q.ilike_pat
      OR lower(s.subtitle) LIKE q.ilike_pat
    )
  ORDER BY rank DESC, s.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_workspace(UUID, TEXT, INT) TO authenticated;


-- ============================================================
-- PART 11 — RPC: get_workspace_activity_feed
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_activity_feed(
  p_workspace_id UUID,
  p_limit        INT DEFAULT 30
)
RETURNS TABLE (
  id             UUID,
  workspace_id   UUID,
  user_id        UUID,
  action         TEXT,
  resource_type  TEXT,
  resource_id    UUID,
  metadata       JSONB,
  created_at     TIMESTAMPTZ,
  actor_name     TEXT,
  actor_username TEXT,
  actor_avatar   TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    wa.id,
    wa.workspace_id,
    wa.user_id,
    wa.action,
    COALESCE(wa.resource_type, wa.entity_type::text),
    COALESCE(wa.resource_id::uuid, wa.entity_id),
    COALESCE(wa.metadata, '{}'),
    wa.created_at,
    COALESCE(p.full_name, p.username, 'Deleted User') AS actor_name,
    p.username                                          AS actor_username,
    p.avatar_url                                        AS actor_avatar
  FROM public.workspace_activity wa
  LEFT JOIN public.profiles p ON p.id = wa.user_id
  WHERE wa.workspace_id = p_workspace_id
    AND public.is_workspace_member(p_workspace_id)
  ORDER BY wa.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(UUID, INT) TO authenticated;


-- ============================================================
-- PART 12 — RPC: request_editor_access
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_editor_access(
  p_workspace_id UUID,
  p_message      TEXT DEFAULT NULL
)
RETURNS public.edit_access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role    TEXT;
  v_request public.edit_access_requests;
BEGIN
  v_role := public.get_workspace_role(p_workspace_id, auth.uid());

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF v_role IN ('editor', 'owner') THEN
    RAISE EXCEPTION 'You already have editor or higher access';
  END IF;

  INSERT INTO public.edit_access_requests (workspace_id, user_id, message, status)
  VALUES (p_workspace_id, auth.uid(), p_message, 'pending')
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET message     = EXCLUDED.message,
        status      = 'pending',
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at  = now()
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_editor_access(UUID, TEXT) TO authenticated;


-- ============================================================
-- PART 12 — RPC: approve_editor_request
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_editor_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.edit_access_requests;
BEGIN
  SELECT * INTO v_request FROM public.edit_access_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF NOT public.is_workspace_editor_or_owner(v_request.workspace_id) THEN
    RAISE EXCEPTION 'Only editors and owners can approve requests';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is already %', v_request.status;
  END IF;

  UPDATE public.workspace_members
    SET role = 'editor'
    WHERE workspace_id = v_request.workspace_id AND user_id = v_request.user_id;

  UPDATE public.edit_access_requests
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (
    v_request.workspace_id, auth.uid(), 'member_role_changed', 'member',
    v_request.user_id::text,
    jsonb_build_object('new_role','editor','reason','access_request_approved','request_id',p_request_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_editor_request(UUID) TO authenticated;


-- ============================================================
-- PART 12 — RPC: deny_editor_request
-- ============================================================

CREATE OR REPLACE FUNCTION public.deny_editor_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.edit_access_requests;
BEGIN
  SELECT * INTO v_request FROM public.edit_access_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF NOT public.is_workspace_editor_or_owner(v_request.workspace_id) THEN
    RAISE EXCEPTION 'Only editors and owners can deny requests';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is already %', v_request.status;
  END IF;

  UPDATE public.edit_access_requests
    SET status = 'denied', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deny_editor_request(UUID) TO authenticated;


-- ============================================================
-- PART 12 — RPC: retract_editor_request
-- ============================================================

CREATE OR REPLACE FUNCTION public.retract_editor_request(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.edit_access_requests
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.retract_editor_request(UUID) TO authenticated;


-- ============================================================
-- PART 12 — RPC: get_pending_access_requests
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_access_requests(p_workspace_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_editor_or_owner(p_workspace_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id',           r.id,
        'workspace_id', r.workspace_id,
        'user_id',      r.user_id,
        'message',      r.message,
        'status',       r.status,
        'reviewed_by',  r.reviewed_by,
        'reviewed_at',  r.reviewed_at,
        'created_at',   r.created_at,
        'updated_at',   r.updated_at,
        'profile', json_build_object(
          'id',         p.id,
          'username',   p.username,
          'full_name',  p.full_name,
          'avatar_url', p.avatar_url
        )
      ) ORDER BY r.created_at DESC
    ), '[]'::json)
    FROM public.edit_access_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.workspace_id = p_workspace_id AND r.status = 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_access_requests(UUID) TO authenticated;


-- ============================================================
-- PART 12 — RPC: get_member_workspace_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_workspace_stats(
  p_workspace_id UUID,
  p_user_id      UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role      TEXT;
  v_joined_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT role, joined_at
    INTO v_role, v_joined_at
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  RETURN json_build_object(
    'role',      COALESCE(v_role, 'viewer'),
    'joined_at', v_joined_at,
    'reports_added', (
      SELECT COUNT(*) FROM public.workspace_reports
      WHERE workspace_id = p_workspace_id AND added_by = p_user_id
    ),
    'comments_made', (
      SELECT COUNT(*) FROM public.report_comments
      WHERE workspace_id = p_workspace_id AND user_id = p_user_id
    ),
    'replies_made',
      public.count_member_replies_in_workspace(p_workspace_id, p_user_id),
    'reports_pinned', (
      SELECT COUNT(*) FROM public.pinned_workspace_reports
      WHERE workspace_id = p_workspace_id AND pinned_by = p_user_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_workspace_stats(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 12 — RPC: get_comment_summary_context
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_comment_summary_context(
  p_report_id    UUID,
  p_workspace_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'comment_id',   rc.id,
        'section_id',   rc.section_id,
        'author',       COALESCE(p.full_name, p.username, 'Unknown'),
        'content',      rc.content,
        'is_resolved',  rc.is_resolved,
        'created_at',   rc.created_at,
        'replies', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'author',     COALESCE(rp.full_name, rp.username, 'Unknown'),
              'content',    cr.content,
              'created_at', cr.created_at
            ) ORDER BY cr.created_at ASC
          ), '[]'::json)
          FROM public.comment_replies cr
          LEFT JOIN public.profiles rp ON rp.id = cr.user_id
          WHERE cr.comment_id = rc.id
        )
      ) ORDER BY rc.created_at ASC
    ), '[]'::json)
    FROM public.report_comments rc
    LEFT JOIN public.profiles p ON p.id = rc.user_id
    WHERE rc.report_id    = p_report_id
      AND rc.workspace_id = p_workspace_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_comment_summary_context(UUID, UUID) TO authenticated;


-- ============================================================
-- TABLE & FUNCTION COMMENTS
-- ============================================================

COMMENT ON TABLE public.research_reports         IS 'Core research reports table (Parts 1-7)';
COMMENT ON TABLE public.presentations            IS 'AI-generated slide decks (Part 5)';
COMMENT ON TABLE public.academic_papers          IS 'AI-generated academic papers (Part 7)';
COMMENT ON TABLE public.podcasts                 IS 'AI-generated podcast episodes (Part 8)';
COMMENT ON TABLE public.debate_sessions          IS 'AI Debate Agent sessions (Part 9)';
COMMENT ON TABLE public.report_embeddings        IS 'pgvector chunks for RAG pipeline (Part 6)';
COMMENT ON TABLE public.assistant_conversations  IS 'RAG-powered chat messages (Part 6)';
COMMENT ON TABLE public.workspaces               IS 'Collaborative workspaces (Parts 10-13)';
COMMENT ON TABLE public.workspace_members        IS 'Workspace membership + roles (Part 10)';
COMMENT ON TABLE public.workspace_reports        IS 'Reports shared into workspaces (Part 10)';
COMMENT ON TABLE public.report_comments          IS 'Threaded comments on reports (Part 10)';
COMMENT ON TABLE public.comment_replies          IS 'Replies to report comments (Part 10)';
COMMENT ON TABLE public.workspace_activity       IS 'Realtime activity feed (Parts 10-13; dual entity_type/resource_type columns)';
COMMENT ON TABLE public.comment_reactions        IS 'Emoji reactions on comments — exclusive one-per-user model (Part 11)';
COMMENT ON TABLE public.pinned_workspace_reports IS 'Pinned reports in workspace feed (Part 11)';
COMMENT ON TABLE public.edit_access_requests     IS 'Viewer-to-editor access upgrade requests; status includes removed (Parts 12-13)';
COMMENT ON TABLE public.workspace_blocked_members IS 'Blocked member list per workspace; blocked_by nullable (Part 13)';

COMMENT ON VIEW  public.workspace_search_index   IS 'Unified search index: reports + comments + members (Parts 11, 11C)';

COMMENT ON FUNCTION public.get_user_research_stats(UUID)            IS 'Profile stats — RETURNS TABLE (snake_case). Parts 1-9.';
COMMENT ON FUNCTION public.get_user_complete_stats(UUID)            IS 'Full analytics stats across all features Parts 1-9.';
COMMENT ON FUNCTION public.get_workspace_report(UUID, UUID)         IS 'Fetch a report for a workspace member, bypassing RLS (Part 10 patch).';
COMMENT ON FUNCTION public.toggle_comment_reaction(UUID, TEXT)      IS 'Exclusive emoji reaction toggle: one per user per comment (Part 11, 11C).';
COMMENT ON FUNCTION public.search_workspace(UUID, TEXT, INT)        IS 'Full-text + ILIKE workspace search across reports, comments, members (Part 11, 11C).';
COMMENT ON FUNCTION public.get_workspace_activity_feed(UUID, INT)   IS 'Activity feed with actor snapshot; null-safe for deleted users (Parts 11-13).';
COMMENT ON FUNCTION public.is_workspace_editor_or_owner(UUID)       IS 'Returns true if auth.uid() is editor or owner of the workspace (Part 11).';
COMMENT ON FUNCTION public.get_auth_user_workspace_ids()            IS 'SECURITY DEFINER helper: workspace IDs the current user belongs to (Part 12).';
COMMENT ON FUNCTION public.request_editor_access(UUID, TEXT)        IS 'Viewer submits request for editor access (Part 12).';
COMMENT ON FUNCTION public.approve_editor_request(UUID)             IS 'Approve a pending editor access request, upgrading the member role (Part 12).';
COMMENT ON FUNCTION public.deny_editor_request(UUID)                IS 'Deny a pending editor access request (Part 12).';
COMMENT ON FUNCTION public.retract_editor_request(UUID)             IS 'Requester cancels their own pending access request (Part 12).';
COMMENT ON FUNCTION public.get_pending_access_requests(UUID)        IS 'Returns all pending editor access requests with requester profile data (Part 12).';
COMMENT ON FUNCTION public.get_member_workspace_stats(UUID, UUID)   IS 'Per-member activity stats within a workspace for MemberProfileCard (Parts 12-13).';
COMMENT ON FUNCTION public.get_comment_summary_context(UUID, UUID)  IS 'Structured comment + reply text for GPT-4o AI summary (Part 12).';
COMMENT ON FUNCTION public.update_workspace_logo(UUID, TEXT)        IS 'Editor/owner updates workspace avatar_url (Part 13).';
COMMENT ON FUNCTION public.is_blocked_from_workspace(UUID, UUID)    IS 'Returns true if the given user is blocked from the workspace (Part 13).';
COMMENT ON FUNCTION public.block_workspace_member(UUID, UUID, TEXT) IS 'Owner blocks a member: removes them, records block, updates requests (Part 13).';
COMMENT ON FUNCTION public.unblock_workspace_member(UUID, UUID)     IS 'Owner removes a block entry, allowing the user to rejoin (Part 13).';
COMMENT ON FUNCTION public.get_workspace_blocked_members(UUID)      IS 'Owner fetches list of blocked members with profiles (Part 13).';
COMMENT ON FUNCTION public.demote_editor_to_viewer(UUID, UUID)      IS 'Owner demotes an editor to viewer, marking their approved request removed (Part 13).';
COMMENT ON FUNCTION public.count_member_replies_in_workspace(UUID, UUID) IS 'Helper: count replies by a user across all workspace comments (Part 13).';
COMMENT ON FUNCTION public.join_workspace_by_code(TEXT)             IS 'Join via invite code; checks block list; returns JSON; no is_personal ref (Part 13).';


-- ============================================================
-- POSTGREST SCHEMA CACHE RELOAD
-- Forces PostgREST to pick up all new/replaced functions
-- immediately without waiting for the automatic reload interval.
-- ============================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Done ✓  All Parts 1-13 installed.
--
-- Verification queries:
--   SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp','vector');
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT proname FROM pg_proc
--     WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
--   SELECT viewname FROM pg_views
--     WHERE schemaname = 'public' ORDER BY viewname;
-- ============================================================