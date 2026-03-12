-- ============================================================
-- DeepDive AI — Complete Database Schema
-- Parts 1 through 10 — Single Migration File
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

-- ── Research Reports RLS (Part 2 base + Part 10 patch combined) ──────────────
-- Drop all existing SELECT policies first
DROP POLICY IF EXISTS "Users can view own reports"                    ON public.research_reports;
DROP POLICY IF EXISTS "users_can_view_own_reports"                    ON public.research_reports;
DROP POLICY IF EXISTS "Enable read access for users"                  ON public.research_reports;
DROP POLICY IF EXISTS "Users can read own reports"                    ON public.research_reports;
DROP POLICY IF EXISTS "Anyone can view public reports"                ON public.research_reports;
DROP POLICY IF EXISTS "read_own_or_workspace_shared_reports"          ON public.research_reports;
DROP POLICY IF EXISTS "Users can insert own reports"                  ON public.research_reports;
DROP POLICY IF EXISTS "users_can_insert_own_reports"                  ON public.research_reports;
DROP POLICY IF EXISTS "Users can update own reports"                  ON public.research_reports;
DROP POLICY IF EXISTS "users_can_update_own_reports"                  ON public.research_reports;
DROP POLICY IF EXISTS "Users can delete own reports"                  ON public.research_reports;
DROP POLICY IF EXISTS "users_can_delete_own_reports"                  ON public.research_reports;

-- SELECT: own reports + workspace-shared reports + public reports (Part 10 patch)
CREATE POLICY "read_own_or_workspace_shared_or_public_reports"
  ON public.research_reports FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_public = TRUE
    OR EXISTS (
      SELECT 1
      FROM   public.workspace_reports  wr
      JOIN   public.workspace_members  wm ON wm.workspace_id = wr.workspace_id
      WHERE  wr.report_id  = research_reports.id
      AND    wm.user_id    = auth.uid()
    )
  );

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

-- ── Deferred FKs on presentations + academic_papers ──────────────────────────
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
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  avatar_url   TEXT,
  invite_code  TEXT        UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_personal  BOOLEAN     NOT NULL DEFAULT false,
  settings     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.workspace_reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_id    UUID        NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
  added_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, report_id)
);

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

CREATE TABLE IF NOT EXISTS public.comment_replies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID        NOT NULL REFERENCES public.report_comments(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  mentions    UUID[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Part 10 Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workspaces_owner             ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_invite_code       ON public.workspaces(invite_code);
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

-- ── Part 10 updated_at triggers ──────────────────────────────────────────────
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

-- ── Part 10 RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_workspace_role(p_workspace_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- workspaces
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;

CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "workspaces_insert" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "workspaces_delete" ON public.workspaces
  FOR DELETE USING (auth.uid() = owner_id);

-- workspace_members
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;

CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
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
DROP POLICY IF EXISTS "workspace_reports_select" ON public.workspace_reports;
DROP POLICY IF EXISTS "workspace_reports_insert" ON public.workspace_reports;
DROP POLICY IF EXISTS "workspace_reports_delete" ON public.workspace_reports;

CREATE POLICY "workspace_reports_select" ON public.workspace_reports
  FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
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
DROP POLICY IF EXISTS "report_comments_select" ON public.report_comments;
DROP POLICY IF EXISTS "report_comments_insert" ON public.report_comments;
DROP POLICY IF EXISTS "report_comments_update" ON public.report_comments;
DROP POLICY IF EXISTS "report_comments_delete" ON public.report_comments;

CREATE POLICY "report_comments_select" ON public.report_comments
  FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
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
DROP POLICY IF EXISTS "comment_replies_select" ON public.comment_replies;
DROP POLICY IF EXISTS "comment_replies_insert" ON public.comment_replies;
DROP POLICY IF EXISTS "comment_replies_delete" ON public.comment_replies;

CREATE POLICY "comment_replies_select" ON public.comment_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.report_comments rc
      WHERE rc.id = comment_id
        AND public.is_workspace_member(rc.workspace_id, auth.uid())
    )
  );
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
DROP POLICY IF EXISTS "workspace_activity_select" ON public.workspace_activity;
DROP POLICY IF EXISTS "workspace_activity_insert" ON public.workspace_activity;

CREATE POLICY "workspace_activity_select" ON public.workspace_activity
  FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "workspace_activity_insert" ON public.workspace_activity
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ── Part 10 Realtime ──────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.report_comments;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_replies;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_activity; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_reports;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
CREATE OR REPLACE FUNCTION public.is_report_embedded(
  p_report_id UUID,
  p_user_id   UUID
)
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
CREATE OR REPLACE FUNCTION public.delete_report_embeddings(
  p_report_id UUID,
  p_user_id   UUID
)
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
CREATE OR REPLACE FUNCTION public.get_report_embedding_stats(
  p_report_id UUID,
  p_user_id   UUID
)
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
CREATE OR REPLACE FUNCTION public.get_podcast_by_report(
  p_report_id UUID,
  p_user_id   UUID
)
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
-- CORE STATS RPC — get_user_research_stats (Parts 1-9)
-- RETURNS TABLE (snake_case) — shape the useStats hook expects.
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
-- COMPREHENSIVE STATS — get_user_complete_stats (Parts 1-9)
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
    UPDATE public.research_reports
    SET is_public = FALSE WHERE id = p_report_id;
    RETURN NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_report_public(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- PART 10 — RPC: get_workspace_report (patch)
-- Fetches a report for a workspace member, bypassing RLS.
-- workspace-report.tsx calls this when direct .select() returns null.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_report(
  p_report_id    UUID,
  p_workspace_id UUID
)
RETURNS SETOF public.research_reports
LANGUAGE sql
SECURITY DEFINER
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============================================================
-- PART 10 — RPC: join_workspace_by_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_workspace_by_code(p_invite_code TEXT)
RETURNS public.workspace_members AS $$
DECLARE
  v_workspace public.workspaces;
  v_member    public.workspace_members;
BEGIN
  SELECT * INTO v_workspace FROM public.workspaces WHERE invite_code = p_invite_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF public.is_workspace_member(v_workspace.id, auth.uid()) THEN
    RAISE EXCEPTION 'Already a member of this workspace';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace.id, auth.uid(), 'viewer')
  RETURNING * INTO v_member;

  INSERT INTO public.workspace_activity (workspace_id, user_id, action, resource_type, resource_id)
  VALUES (v_workspace.id, auth.uid(), 'member_joined', 'member', auth.uid()::text);

  RETURN v_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    'member_count', v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.preview_workspace_by_code(TEXT) TO authenticated, anon;

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
        'id',              wr.id,
        'workspace_id',    wr.workspace_id,
        'report_id',       wr.report_id,
        'added_by',        wr.added_by,
        'added_at',        wr.added_at,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_section_comment_counts(UUID, UUID) TO authenticated;

-- ============================================================
-- PART 10 — RPC: get_workspace_activity_feed
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_activity_feed(
  p_workspace_id UUID,
  p_limit        INT DEFAULT 30
)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(item ORDER BY wa.created_at DESC), '[]'::json)
    FROM public.workspace_activity wa
    LEFT JOIN public.profiles p ON p.id = wa.user_id
    CROSS JOIN LATERAL (
      SELECT json_build_object(
        'id',            wa.id,
        'workspace_id',  wa.workspace_id,
        'user_id',       wa.user_id,
        'action',        wa.action,
        'resource_type', wa.resource_type,
        'resource_id',   wa.resource_id,
        'metadata',      wa.metadata,
        'created_at',    wa.created_at,
        'actor_profile', json_build_object(
          'id', p.id, 'username', p.username,
          'full_name', p.full_name, 'avatar_url', p.avatar_url
        )
      ) AS item
    ) items
    WHERE wa.workspace_id = p_workspace_id
    ORDER BY wa.created_at DESC
    LIMIT p_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_activity_feed(UUID, INT) TO authenticated;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  v_code := substring(gen_random_uuid()::text, 1, 8);
  UPDATE public.workspaces SET invite_code = v_code WHERE id = p_workspace_id;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  UPDATE public.workspaces
    SET owner_id = p_new_owner_id
    WHERE id = p_workspace_id;
  UPDATE public.workspace_members
    SET role = 'owner'
    WHERE workspace_id = p_workspace_id AND user_id = p_new_owner_id;
  UPDATE public.workspace_members
    SET role = 'editor'
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid();

  INSERT INTO public.workspace_activity
    (workspace_id, user_id, action, resource_type, resource_id, metadata)
  VALUES
    (p_workspace_id, auth.uid(), 'ownership_transferred', 'workspace',
     p_workspace_id::text, json_build_object('new_owner_id', p_new_owner_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_workspace_stats(UUID) TO authenticated;

-- ============================================================
-- PART 10 — Auto-create personal workspace trigger (opt-in)
-- Uncomment the trigger below to auto-create a personal
-- workspace on new user signup. By default it is disabled —
-- call create_workspace() manually from the app on first login.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_workspace('My Workspace', 'Personal research space', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- To enable: uncomment these two lines:
-- DROP TRIGGER IF EXISTS on_new_profile_create_workspace ON public.profiles;
-- CREATE TRIGGER on_new_profile_create_workspace
--   AFTER INSERT ON public.profiles
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- ============================================================
-- TABLE & FUNCTION COMMENTS
-- ============================================================
COMMENT ON TABLE public.research_reports      IS 'Core research reports table (Parts 1-7)';
COMMENT ON TABLE public.presentations         IS 'AI-generated slide decks (Part 5)';
COMMENT ON TABLE public.academic_papers       IS 'AI-generated academic papers (Part 7)';
COMMENT ON TABLE public.podcasts              IS 'AI-generated podcast episodes (Part 8)';
COMMENT ON TABLE public.debate_sessions       IS 'AI Debate Agent sessions (Part 9)';
COMMENT ON TABLE public.report_embeddings     IS 'pgvector chunks for RAG pipeline (Part 6)';
COMMENT ON TABLE public.assistant_conversations IS 'RAG-powered chat messages (Part 6)';
COMMENT ON TABLE public.workspaces            IS 'Collaborative workspaces (Part 10)';
COMMENT ON TABLE public.workspace_members     IS 'Workspace membership + roles (Part 10)';
COMMENT ON TABLE public.workspace_reports     IS 'Reports shared into workspaces (Part 10)';
COMMENT ON TABLE public.report_comments       IS 'Threaded comments on reports (Part 10)';
COMMENT ON TABLE public.comment_replies       IS 'Replies to report comments (Part 10)';
COMMENT ON TABLE public.workspace_activity    IS 'Realtime activity feed (Part 10)';

COMMENT ON FUNCTION public.get_user_research_stats(UUID) IS
  'Profile stats — RETURNS TABLE (snake_case). Parts 1-9 columns. Used by useStats hook.';
COMMENT ON FUNCTION public.get_user_complete_stats(UUID) IS
  'Full analytics stats across all features Parts 1-9.';
COMMENT ON FUNCTION public.get_workspace_report(UUID, UUID) IS
  'Fetch a report by ID for a workspace member, bypassing RLS (Part 10 patch).';

-- ============================================================
-- Done ✓  All Parts 1-10 + patch installed.
--
-- Verification queries:
--   SELECT * FROM pg_extension WHERE extname = 'vector';
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT proname FROM pg_proc
--     WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
-- ============================================================