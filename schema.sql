-- ============================================================
-- DeepDive AI — Complete Database Schema
-- Parts 1 through 9 — Single Migration File
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
-- FUNCTION: auto-update "updated_at" timestamp
-- Defined early — referenced by multiple triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
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
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Auto-create profile on signup ─────────────────────────────────────────────
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
    CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload their own avatar') THEN
    CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update their own avatar') THEN
    CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete their own avatar') THEN
    CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- ============================================================
-- PART 1 — USER SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tier                    TEXT  NOT NULL DEFAULT 'free',
  reports_used_this_month INTEGER DEFAULT 0,
  reports_limit           INTEGER DEFAULT 5,
  reset_date              TIMESTAMP WITH TIME ZONE DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_subscriptions' AND policyname = 'Users can view own subscription') THEN
    CREATE POLICY "Users can view own subscription" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_subscriptions' AND policyname = 'Users can insert own subscription') THEN
    CREATE POLICY "Users can insert own subscription" ON public.user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_subscriptions' AND policyname = 'Users can update own subscription') THEN
    CREATE POLICY "Users can update own subscription" ON public.user_subscriptions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

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
  last_checked_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  notify_on_update BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.saved_topics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_topics' AND policyname = 'Users can manage own saved topics') THEN
    CREATE POLICY "Users can manage own saved topics" ON public.saved_topics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_topics_user_id ON public.saved_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_topics_notify ON public.saved_topics(user_id, notify_on_update) WHERE notify_on_update = TRUE;

-- ============================================================
-- PART 3 — PUSH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token      TEXT  NOT NULL UNIQUE,
  platform   TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can manage own push tokens') THEN
    CREATE POLICY "Users can manage own push tokens" ON public.push_tokens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

DROP TRIGGER IF EXISTS on_push_tokens_updated ON public.push_tokens;
CREATE TRIGGER on_push_tokens_updated
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- PART 5 — PRESENTATIONS
-- Must exist before research_reports (FK reference)
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
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentations' AND policyname = 'Users can view own presentations') THEN
    CREATE POLICY "Users can view own presentations" ON public.presentations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentations' AND policyname = 'Users can insert own presentations') THEN
    CREATE POLICY "Users can insert own presentations" ON public.presentations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentations' AND policyname = 'Users can update own presentations') THEN
    CREATE POLICY "Users can update own presentations" ON public.presentations FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presentations' AND policyname = 'Users can delete own presentations') THEN
    CREATE POLICY "Users can delete own presentations" ON public.presentations FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_presentations_user_id    ON public.presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_created_at ON public.presentations(created_at DESC);

DROP TRIGGER IF EXISTS on_presentations_updated ON public.presentations;
CREATE TRIGGER on_presentations_updated
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- PART 7 — ACADEMIC PAPERS
-- Must exist before research_reports (FK reference)
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_papers' AND policyname = 'Users can view own academic papers') THEN
    CREATE POLICY "Users can view own academic papers" ON public.academic_papers FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_papers' AND policyname = 'Users can insert own academic papers') THEN
    CREATE POLICY "Users can insert own academic papers" ON public.academic_papers FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_papers' AND policyname = 'Users can update own academic papers') THEN
    CREATE POLICY "Users can update own academic papers" ON public.academic_papers FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_papers' AND policyname = 'Users can delete own academic papers') THEN
    CREATE POLICY "Users can delete own academic papers" ON public.academic_papers FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

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
  id                UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Research input
  query             TEXT    NOT NULL,
  depth             TEXT    NOT NULL DEFAULT 'deep',
  focus_areas       TEXT[]  DEFAULT '{}',

  -- Report content
  title             TEXT,
  executive_summary TEXT,
  sections          JSONB   DEFAULT '[]',
  key_findings      JSONB   DEFAULT '[]',
  future_predictions JSONB  DEFAULT '[]',
  citations         JSONB   DEFAULT '[]',
  statistics        JSONB   DEFAULT '[]',

  -- Research metadata
  search_queries    JSONB   DEFAULT '[]',
  sources_count     INTEGER DEFAULT 0,
  reliability_score NUMERIC(3,1) DEFAULT 0,

  -- Status
  status            TEXT    NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  agent_logs        JSONB   DEFAULT '[]',

  -- Part 3
  is_pinned         BOOLEAN DEFAULT FALSE,
  tags              TEXT[]  DEFAULT '{}',
  export_count      INTEGER DEFAULT 0,
  view_count        INTEGER DEFAULT 0,

  -- Part 4
  knowledge_graph   JSONB   DEFAULT NULL,
  infographic_data  JSONB   DEFAULT NULL,
  source_images     JSONB   DEFAULT '[]',
  is_public         BOOLEAN DEFAULT FALSE,
  public_token      TEXT    UNIQUE,
  public_view_count INTEGER DEFAULT 0,

  -- Part 5
  presentation_id   UUID    REFERENCES public.presentations(id) ON DELETE SET NULL,
  slide_count       INTEGER NOT NULL DEFAULT 0,

  -- Part 7
  academic_paper_id UUID    REFERENCES public.academic_papers(id) ON DELETE SET NULL,
  research_mode     TEXT    NOT NULL DEFAULT 'standard',

  -- Timestamps
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  completed_at      TIMESTAMP WITH TIME ZONE,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

  CONSTRAINT research_reports_research_mode_check
    CHECK (research_mode IN ('standard', 'academic'))
);

ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_reports' AND policyname = 'Users can view own reports') THEN
    CREATE POLICY "Users can view own reports" ON public.research_reports FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_reports' AND policyname = 'Users can insert own reports') THEN
    CREATE POLICY "Users can insert own reports" ON public.research_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_reports' AND policyname = 'Users can update own reports') THEN
    CREATE POLICY "Users can update own reports" ON public.research_reports FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_reports' AND policyname = 'Users can delete own reports') THEN
    CREATE POLICY "Users can delete own reports" ON public.research_reports FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_reports' AND policyname = 'Anyone can view public reports') THEN
    CREATE POLICY "Anyone can view public reports" ON public.research_reports FOR SELECT USING (is_public = TRUE);
  END IF;
END $$;

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

-- ── Now add the deferred FKs on presentations + academic_papers ──────────────
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

CREATE INDEX IF NOT EXISTS idx_presentations_report_id     ON public.presentations(report_id);
CREATE INDEX IF NOT EXISTS academic_papers_report_fk_idx   ON public.academic_papers(report_id);

-- ============================================================
-- PART 2 — RESEARCH CONVERSATIONS (legacy follow-up chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.research_conversations (
  id         UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id  UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       TEXT  NOT NULL,
  content    TEXT  NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.research_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_conversations' AND policyname = 'Users can view own conversations') THEN
    CREATE POLICY "Users can view own conversations" ON public.research_conversations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_conversations' AND policyname = 'Users can insert own conversations') THEN
    CREATE POLICY "Users can insert own conversations" ON public.research_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_research_conversations_report_id ON public.research_conversations(report_id);

-- ============================================================
-- PART 4 — PUBLIC REPORT VIEW TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.public_report_views (
  id        UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  viewer_ip TEXT,
  user_agent TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.public_report_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'public_report_views' AND policyname = 'Anyone can log a public report view') THEN
    CREATE POLICY "Anyone can log a public report view" ON public.public_report_views FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.research_reports WHERE id = report_id AND is_public = TRUE)
    );
  END IF;
END $$;

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.report_embeddings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_embeddings' AND policyname = 'Users can view own embeddings') THEN
    CREATE POLICY "Users can view own embeddings" ON public.report_embeddings FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_embeddings' AND policyname = 'Users can insert own embeddings') THEN
    CREATE POLICY "Users can insert own embeddings" ON public.report_embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_embeddings' AND policyname = 'Users can delete own embeddings') THEN
    CREATE POLICY "Users can delete own embeddings" ON public.report_embeddings FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

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
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assistant_conversations' AND policyname = 'Users can view own assistant conversations') THEN
    CREATE POLICY "Users can view own assistant conversations" ON public.assistant_conversations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assistant_conversations' AND policyname = 'Users can insert own assistant conversations') THEN
    CREATE POLICY "Users can insert own assistant conversations" ON public.assistant_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assistant_conversations' AND policyname = 'Users can delete own assistant conversations') THEN
    CREATE POLICY "Users can delete own assistant conversations" ON public.assistant_conversations FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_report_id   ON public.assistant_conversations(report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_report ON public.assistant_conversations(user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created_at  ON public.assistant_conversations(created_at DESC);

-- ============================================================
-- PART 8 — PODCASTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.podcasts (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  report_id            UUID        REFERENCES public.research_reports(id) ON DELETE SET NULL,
  title                TEXT        NOT NULL,
  description          TEXT        NOT NULL DEFAULT '',
  topic                TEXT        NOT NULL,
  script               JSONB       NOT NULL DEFAULT '{"turns":[],"totalWords":0,"estimatedDurationMinutes":0}'::jsonb,
  audio_segment_paths  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  host_voice           TEXT        NOT NULL DEFAULT 'alloy',
  guest_voice          TEXT        NOT NULL DEFAULT 'nova',
  host_name            TEXT        NOT NULL DEFAULT 'Alex',
  guest_name           TEXT        NOT NULL DEFAULT 'Sam',
  status               TEXT        NOT NULL DEFAULT 'pending',
  segment_count        INTEGER     NOT NULL DEFAULT 0,
  completed_segments   INTEGER     NOT NULL DEFAULT 0,
  duration_seconds     INTEGER     NOT NULL DEFAULT 0,
  word_count           INTEGER     NOT NULL DEFAULT 0,
  export_count         INTEGER     NOT NULL DEFAULT 0,
  error_message        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'podcasts' AND policyname = 'Users can select own podcasts') THEN
    CREATE POLICY "Users can select own podcasts" ON public.podcasts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'podcasts' AND policyname = 'Users can insert own podcasts') THEN
    CREATE POLICY "Users can insert own podcasts" ON public.podcasts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'podcasts' AND policyname = 'Users can update own podcasts') THEN
    CREATE POLICY "Users can update own podcasts" ON public.podcasts FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'podcasts' AND policyname = 'Users can delete own podcasts') THEN
    CREATE POLICY "Users can delete own podcasts" ON public.podcasts FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

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
-- FUNCTIONS — drop before recreating to avoid 42P13
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_research_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_debate_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_complete_stats(uuid);

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
  generated_at TIMESTAMP WITH TIME ZONE
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
  created_at           TIMESTAMP WITH TIME ZONE
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
  embedded_at  TIMESTAMP WITH TIME ZONE
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
-- CORE STATS RPC — get_user_research_stats
--
-- Returns RETURNS TABLE (snake_case) — the shape the useStats
-- hook has always expected. All Parts 1-8 columns are preserved
-- exactly. Part 9 adds total_debates as the only new column.
--
-- FIX vs previous Part 9 draft:
--   • RETURNS TABLE not RETURNS JSON (hook reads data[0].column)
--   • References assistant_conversations (not assistant_messages)
--   • Every sub-query guarded by EXCEPTION WHEN UNDEFINED_TABLE
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_research_stats(p_user_id UUID)
RETURNS TABLE (
  -- Parts 1-8 columns — order and names must not change ──────────────────
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
  -- Part 9 addition ────────────────────────────────────────────────────────
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

  -- ── research_reports ──────────────────────────────────────────────────────
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

    -- Favourite topic = most-used query
    SELECT rr2.query INTO v_favorite_topic
    FROM   public.research_reports rr2
    WHERE  rr2.user_id = p_user_id AND rr2.status = 'completed'
    GROUP  BY rr2.query ORDER BY COUNT(*) DESC LIMIT 1;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  -- ── presentations ─────────────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(p.id), COALESCE(SUM(p.total_slides), 0)
    INTO   v_total_presentations, v_total_slides
    FROM   public.presentations p WHERE p.user_id = p_user_id;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  -- ── assistant_conversations (RAG chat — Part 6) ───────────────────────────
  -- Table is assistant_conversations, counting only assistant-role messages.
  BEGIN
    SELECT COUNT(ac.id) INTO v_total_assistant_messages
    FROM   public.assistant_conversations ac
    WHERE  ac.user_id = p_user_id AND ac.role = 'assistant';
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  -- ── report_embeddings (Part 6) ────────────────────────────────────────────
  BEGIN
    SELECT COUNT(DISTINCT re.report_id) INTO v_reports_with_embeddings
    FROM   public.report_embeddings re WHERE re.user_id = p_user_id;
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  -- ── debate_sessions (Part 9) ──────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_total_debates
    FROM   public.debate_sessions ds
    WHERE  ds.user_id = p_user_id AND ds.status = 'completed';
  EXCEPTION WHEN UNDEFINED_TABLE THEN NULL;
  END;

  -- ── Return single row ──────────────────────────────────────────────────────
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
-- Used for detailed analytics views. Separate from the core
-- profile stats function above.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_complete_stats(p_user_id UUID)
RETURNS TABLE (
  -- Research
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
  -- Academic (Part 7)
  academic_papers_generated   BIGINT,
  academic_word_count         BIGINT,
  academic_pages_estimate     NUMERIC,
  most_used_citation_style    TEXT,
  -- Podcast (Part 8)
  total_podcasts              BIGINT,
  completed_podcasts          BIGINT,
  total_podcast_duration_min  NUMERIC,
  total_podcast_words         BIGINT,
  reports_with_podcasts       BIGINT,
  -- Debate (Part 9)
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
    SET is_public = TRUE,
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
-- COMMENTS
-- ============================================================
COMMENT ON TABLE  public.research_reports     IS 'Core research reports table (Parts 1-7)';
COMMENT ON TABLE  public.presentations        IS 'AI-generated slide decks (Part 5)';
COMMENT ON TABLE  public.academic_papers      IS 'AI-generated academic papers (Part 7)';
COMMENT ON TABLE  public.podcasts             IS 'AI-generated podcast episodes (Part 8)';
COMMENT ON TABLE  public.debate_sessions      IS 'AI Debate Agent sessions (Part 9)';
COMMENT ON TABLE  public.report_embeddings    IS 'pgvector chunks for RAG pipeline (Part 6)';
COMMENT ON TABLE  public.assistant_conversations IS 'RAG-powered chat messages (Part 6)';

COMMENT ON FUNCTION public.get_user_research_stats(UUID) IS
  'Profile stats — RETURNS TABLE (snake_case). '
  'Parts 1-8 columns preserved; total_debates added Part 9. '
  'Used by useStats hook in profile screen.';

COMMENT ON FUNCTION public.get_user_debate_stats(UUID) IS
  'Debate-specific stats JSON. New in Part 9.';

COMMENT ON FUNCTION public.get_user_complete_stats(UUID) IS
  'Full analytics stats across all features Parts 1-9.';

-- ============================================================
-- Done ✓  All Parts 1-9 installed.
--
-- Verification queries:
--   SELECT * FROM pg_extension WHERE extname = 'vector';
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT proname FROM pg_proc
--     WHERE pronamespace = 'public'::regnamespace
--     ORDER BY proname;
-- ============================================================