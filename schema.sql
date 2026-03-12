-- ============================================================
-- DeepDive AI — Complete Database Schema
-- Parts 1, 2, 3, 4, 5, 6, 7 & 8 combined
-- AI Research Assistant Chat with RAG Pipeline + Academic Papers + AI Podcast Generator
--
-- Prerequisites:
--   pgvector must be available in your Supabase project
--   (it is pre-installed on all Supabase projects).
--
-- Run this entire script in Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE
-- ============================================================

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- FUNCTION: auto-update "updated_at" timestamp
-- (defined early — referenced by multiple triggers)
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PROFILES TABLE
-- Stores extra user info beyond what Supabase Auth provides
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID    REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username            TEXT    UNIQUE,
  full_name           TEXT,
  avatar_url          TEXT,
  bio                 TEXT,
  occupation          TEXT,
  interests           TEXT[],                  -- Array of interest tags
  profile_completed   BOOLEAN DEFAULT FALSE,  -- Tracks if user finished profile setup
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

-- Profiles updated_at trigger
DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- FUNCTION: auto-create profile on signup
-- ============================================
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

-- ============================================
-- STORAGE — avatars bucket
-- ============================================
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

-- ============================================
-- RESEARCH REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.research_reports (
  id                  UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Research input
  query               TEXT    NOT NULL,
  depth               TEXT    NOT NULL DEFAULT 'deep',   -- 'quick' | 'deep' | 'expert'
  focus_areas         TEXT[]  DEFAULT '{}',

  -- Report content (JSONB for flexibility)
  title               TEXT,
  executive_summary   TEXT,
  sections            JSONB   DEFAULT '[]',   -- Array of ReportSection objects
  key_findings        JSONB   DEFAULT '[]',
  future_predictions  JSONB   DEFAULT '[]',
  citations           JSONB   DEFAULT '[]',   -- Array of Citation objects
  statistics          JSONB   DEFAULT '[]',   -- Array of Statistic objects

  -- Research metadata
  search_queries      JSONB   DEFAULT '[]',   -- Queries sent to SerpAPI
  sources_count       INTEGER DEFAULT 0,
  reliability_score   NUMERIC(3,1) DEFAULT 0,

  -- Status tracking
  -- pending | planning | searching | analyzing | fact_checking | generating | completed | failed
  status              TEXT    NOT NULL DEFAULT 'pending',
  error_message       TEXT,
  agent_logs          JSONB   DEFAULT '[]',   -- Progress steps for replay

  -- Part 3 additions
  is_pinned           BOOLEAN DEFAULT FALSE,
  tags                TEXT[]  DEFAULT '{}',
  export_count        INTEGER DEFAULT 0,
  view_count          INTEGER DEFAULT 0,

  -- Part 4 additions
  knowledge_graph     JSONB    DEFAULT NULL,
  infographic_data    JSONB    DEFAULT NULL,
  source_images       JSONB    DEFAULT '[]',
  is_public           BOOLEAN  DEFAULT FALSE,
  public_token        TEXT     UNIQUE,
  public_view_count   INTEGER  DEFAULT 0,

  -- Part 5 additions
  presentation_id     UUID     REFERENCES public.presentations(id) ON DELETE SET NULL,
  slide_count         INTEGER  NOT NULL DEFAULT 0,

  -- Part 7 additions
  academic_paper_id   UUID     REFERENCES public.academic_papers(id) ON DELETE SET NULL,
  research_mode       TEXT     NOT NULL DEFAULT 'standard',

  -- Timestamps
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  completed_at        TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  
  -- Constraints
  CONSTRAINT research_reports_research_mode_check CHECK (research_mode IN ('standard', 'academic'))
);

ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;

-- User access policies
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

-- Triggers and indexes
DROP TRIGGER IF EXISTS on_research_reports_updated ON public.research_reports;
CREATE TRIGGER on_research_reports_updated
  BEFORE UPDATE ON public.research_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_research_reports_user_id ON public.research_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_created_at ON public.research_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_reports_status ON public.research_reports(status);
CREATE INDEX IF NOT EXISTS idx_research_reports_pinned ON public.research_reports(user_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_research_reports_public_token ON public.research_reports(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_reports_is_public ON public.research_reports(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_research_reports_presentation_id ON public.research_reports(presentation_id) WHERE presentation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_reports_academic_paper_id ON public.research_reports(academic_paper_id) WHERE academic_paper_id IS NOT NULL;

-- ============================================
-- RESEARCH CONVERSATIONS TABLE
-- Follow-up Q&A threads on a report
-- ============================================
CREATE TABLE IF NOT EXISTS public.research_conversations (
  id          UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id   UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        TEXT  NOT NULL,   -- 'user' | 'assistant'
  content     TEXT  NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

-- ============================================
-- PUBLIC REPORT VIEWS TRACKING TABLE (Part 4)
-- ============================================
CREATE TABLE IF NOT EXISTS public.public_report_views (
  id          UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id   UUID  REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  viewer_ip   TEXT,
  user_agent  TEXT,
  viewed_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

-- ============================================
-- SAVED TOPICS TABLE
-- Users can pin topics to watch for new research
-- ============================================
CREATE TABLE IF NOT EXISTS public.saved_topics (
  id                UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  topic             TEXT    NOT NULL,
  last_checked_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  notify_on_update  BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.saved_topics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_topics' AND policyname = 'Users can manage own saved topics') THEN
    CREATE POLICY "Users can manage own saved topics" ON public.saved_topics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_topics_user_id ON public.saved_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_topics_notify ON public.saved_topics(user_id, notify_on_update) WHERE notify_on_update = TRUE;

-- ============================================
-- PUSH TOKENS TABLE
-- Stores Expo push tokens for notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token       TEXT  NOT NULL UNIQUE,
  platform    TEXT,   -- 'ios' | 'android'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

-- ============================================
-- USER SUBSCRIPTIONS TABLE
-- Free vs Pro tier tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tier                    TEXT  NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
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

-- ============================================
-- FUNCTION: auto-create subscription on signup
-- ============================================
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
-- PART 5: PRESENTATIONS TABLE
-- Stores AI-generated slide decks linked to research reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.presentations (
  id            UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id     UUID    REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title         TEXT    NOT NULL,
  subtitle      TEXT,
  theme         TEXT    NOT NULL DEFAULT 'dark', -- 'dark' | 'light' | 'corporate' | 'vibrant'
  slides        JSONB   NOT NULL DEFAULT '[]',
  total_slides  INTEGER NOT NULL DEFAULT 0,
  export_count  INTEGER NOT NULL DEFAULT 0,
  generated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

CREATE INDEX IF NOT EXISTS idx_presentations_report_id ON public.presentations(report_id);
CREATE INDEX IF NOT EXISTS idx_presentations_user_id ON public.presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_created_at ON public.presentations(created_at DESC);

DROP TRIGGER IF EXISTS on_presentations_updated ON public.presentations;
CREATE TRIGGER on_presentations_updated
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- PART 5 RPC: get_presentations_for_report
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_presentations_for_report(
  p_report_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  subtitle      TEXT,
  theme         TEXT,
  total_slides  INTEGER,
  export_count  INTEGER,
  generated_at  TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.subtitle,
    p.theme,
    p.total_slides,
    p.export_count,
    p.generated_at
  FROM public.presentations p
  WHERE p.report_id = p_report_id
    AND p.user_id   = p_user_id
  ORDER BY p.generated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presentations_for_report(UUID, UUID) TO authenticated;

-- ============================================================
-- PART 5 RPC: increment_presentation_export
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_presentation_export(
  p_presentation_id UUID,
  p_user_id         UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.presentations
  SET export_count = COALESCE(export_count, 0) + 1
  WHERE id = p_presentation_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_presentation_export(UUID, UUID) TO authenticated;

-- ============================================================
-- PART 6: REPORT EMBEDDINGS TABLE
-- Stores chunked report text + OpenAI embeddings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.report_embeddings (
  id          UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id   UUID    REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chunk_id    TEXT    NOT NULL,
  chunk_type  TEXT    NOT NULL, -- 'summary' | 'section' | 'finding' | 'prediction' | 'statistic' | 'citation'
  content     TEXT    NOT NULL,
  embedding   vector(1536),
  metadata    JSONB   DEFAULT '{}',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_id ON public.report_embeddings(report_id);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_user_id ON public.report_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_vector ON public.report_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_report_embeddings_report_chunk ON public.report_embeddings(report_id, chunk_id);

-- ============================================
-- PART 6: ASSISTANT CONVERSATIONS TABLE
-- Enhanced follow-up chat with mode + RAG metadata
-- ============================================
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id               UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id        UUID    REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role             TEXT    NOT NULL,   -- 'user' | 'assistant'
  content          TEXT    NOT NULL,
  mode             TEXT    NOT NULL DEFAULT 'general', -- 'general' | 'beginner' | 'compare' | 'contradictions' | 'questions' | 'summarize' | 'factcheck'
  retrieved_chunks JSONB   DEFAULT '[]',
  suggested_follow_ups JSONB DEFAULT '[]',
  is_rag_powered   BOOLEAN DEFAULT FALSE,
  confidence       TEXT    DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
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

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_report_id ON public.assistant_conversations(report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_report ON public.assistant_conversations(user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created_at ON public.assistant_conversations(created_at DESC);

-- ============================================
-- PART 6 RPCs
-- ============================================

-- match_report_chunks
CREATE OR REPLACE FUNCTION public.match_report_chunks(
  query_embedding   vector(1536),
  p_report_id       UUID,
  p_user_id         UUID,
  match_count       INT     DEFAULT 5,
  match_threshold   FLOAT   DEFAULT 0.30
)
RETURNS TABLE (
  id          UUID,
  chunk_id    TEXT,
  chunk_type  TEXT,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    re.id,
    re.chunk_id,
    re.chunk_type,
    re.content,
    re.metadata,
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

-- is_report_embedded
CREATE OR REPLACE FUNCTION public.is_report_embedded(
  p_report_id UUID,
  p_user_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.report_embeddings
    WHERE report_id = p_report_id AND user_id = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_report_embedded(UUID, UUID) TO authenticated;

-- get_assistant_conversation
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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.role,
    ac.content,
    ac.mode,
    ac.retrieved_chunks,
    ac.suggested_follow_ups,
    ac.is_rag_powered,
    ac.confidence,
    ac.created_at
  FROM public.assistant_conversations ac
  WHERE ac.report_id = p_report_id AND ac.user_id = p_user_id
  ORDER BY ac.created_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_conversation(UUID, UUID, INT) TO authenticated;

-- delete_report_embeddings
CREATE OR REPLACE FUNCTION public.delete_report_embeddings(
  p_report_id UUID,
  p_user_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.report_embeddings
  WHERE report_id = p_report_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_report_embeddings(UUID, UUID) TO authenticated;

-- get_report_embedding_stats
CREATE OR REPLACE FUNCTION public.get_report_embedding_stats(
  p_report_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  total_chunks   BIGINT,
  chunk_types    JSONB,
  embedded_at    TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

-- ============================================
-- PART 7: ACADEMIC PAPERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.academic_papers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL DEFAULT '',
  running_head        TEXT NOT NULL DEFAULT '',
  abstract            TEXT NOT NULL DEFAULT '',
  keywords            TEXT[] NOT NULL DEFAULT '{}',
  institution         TEXT,
  sections            JSONB NOT NULL DEFAULT '[]',
  citations           JSONB NOT NULL DEFAULT '[]',
  citation_style      TEXT NOT NULL DEFAULT 'apa',
  word_count          INTEGER NOT NULL DEFAULT 0,
  page_estimate       INTEGER NOT NULL DEFAULT 0,
  export_count        INTEGER NOT NULL DEFAULT 0,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT academic_papers_citation_style_check CHECK (citation_style IN ('apa', 'mla', 'chicago', 'ieee'))
);

-- Indexes for academic_papers
CREATE INDEX IF NOT EXISTS academic_papers_report_id_idx ON public.academic_papers(report_id);
CREATE INDEX IF NOT EXISTS academic_papers_user_id_idx ON public.academic_papers(user_id);
CREATE INDEX IF NOT EXISTS academic_papers_generated_at_idx ON public.academic_papers(generated_at DESC);

-- RLS for academic_papers
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

-- Trigger for academic_papers
DROP TRIGGER IF EXISTS on_academic_papers_updated ON public.academic_papers;
CREATE TRIGGER on_academic_papers_updated
  BEFORE UPDATE ON public.academic_papers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ============================================
-- PART 7 RPCs
-- ============================================

-- get_academic_paper_by_report
CREATE OR REPLACE FUNCTION public.get_academic_paper_by_report(p_report_id UUID)
RETURNS SETOF public.academic_papers
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.academic_papers
  WHERE report_id = p_report_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_academic_paper_by_report(UUID) TO authenticated;

-- increment_academic_export_count
CREATE OR REPLACE FUNCTION public.increment_academic_export_count(p_paper_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.academic_papers
  SET export_count = export_count + 1, updated_at = NOW()
  WHERE id = p_paper_id AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.increment_academic_export_count(UUID) TO authenticated;

-- get_user_academic_stats
CREATE OR REPLACE FUNCTION public.get_user_academic_stats(p_user_id UUID)
RETURNS TABLE (
  total_papers        BIGINT,
  total_word_count    BIGINT,
  avg_page_estimate   NUMERIC,
  most_used_style     TEXT,
  papers_this_month   BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT AS total_papers,
    COALESCE(SUM(word_count), 0)::BIGINT AS total_word_count,
    COALESCE(ROUND(AVG(page_estimate)::NUMERIC, 1), 0)::NUMERIC AS avg_page_estimate,
    (
      SELECT citation_style
      FROM public.academic_papers
      WHERE user_id = p_user_id
      GROUP BY citation_style
      ORDER BY COUNT(*) DESC
      LIMIT 1
    )::TEXT AS most_used_style,
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', generated_at) = DATE_TRUNC('month', NOW()))::BIGINT AS papers_this_month
  FROM public.academic_papers
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_academic_stats(UUID) TO authenticated;

-- ============================================================
-- PART 8: PODCASTS TABLE
-- Stores AI-generated podcast episodes linked to research reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.podcasts (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID          REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  report_id             UUID          REFERENCES public.research_reports(id) ON DELETE SET NULL,

  -- Identity
  title                 TEXT          NOT NULL,
  description           TEXT          NOT NULL DEFAULT '',
  topic                 TEXT          NOT NULL,

  -- Script (full structured dialogue — stored as JSONB)
  script                JSONB         NOT NULL
                          DEFAULT '{"turns":[],"totalWords":0,"estimatedDurationMinutes":0}'::jsonb,

  -- Audio (local device file paths for each segment)
  audio_segment_paths   JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- Voice configuration
  host_voice            TEXT          NOT NULL DEFAULT 'alloy',
  guest_voice           TEXT          NOT NULL DEFAULT 'nova',
  host_name             TEXT          NOT NULL DEFAULT 'Alex',
  guest_name            TEXT          NOT NULL DEFAULT 'Sam',

  -- Progress tracking
  status                TEXT          NOT NULL DEFAULT 'pending',
  segment_count         INTEGER       NOT NULL DEFAULT 0,
  completed_segments    INTEGER       NOT NULL DEFAULT 0,

  -- Stats
  duration_seconds      INTEGER       NOT NULL DEFAULT 0,
  word_count            INTEGER       NOT NULL DEFAULT 0,
  export_count          INTEGER       NOT NULL DEFAULT 0,

  -- Error info
  error_message         TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL,

  CONSTRAINT podcasts_status_check CHECK (
    status IN (
      'pending',
      'generating_script',
      'generating_audio',
      'completed',
      'failed'
    )
  ),
  CONSTRAINT podcasts_host_voice_check CHECK (
    host_voice IN ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')
  ),
  CONSTRAINT podcasts_guest_voice_check CHECK (
    guest_voice IN ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')
  )
);

-- Indexes for podcasts
CREATE INDEX IF NOT EXISTS podcasts_user_id_idx ON public.podcasts(user_id);
CREATE INDEX IF NOT EXISTS podcasts_report_id_idx ON public.podcasts(report_id);
CREATE INDEX IF NOT EXISTS podcasts_status_idx ON public.podcasts(status);
CREATE INDEX IF NOT EXISTS podcasts_created_at_idx ON public.podcasts(created_at DESC);

-- RLS for podcasts
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

-- Trigger for podcasts
DROP TRIGGER IF EXISTS on_podcasts_updated ON public.podcasts;
CREATE TRIGGER on_podcasts_updated
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- PART 8 RPCs
-- ============================================================

-- get_podcast_by_report
CREATE OR REPLACE FUNCTION public.get_podcast_by_report(
  p_report_id  UUID,
  p_user_id    UUID
)
RETURNS SETOF public.podcasts
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM   public.podcasts
  WHERE  report_id = p_report_id
    AND  user_id   = p_user_id
    AND  status    = 'completed'
  ORDER  BY created_at DESC
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.get_podcast_by_report(UUID, UUID) TO authenticated;

-- get_user_podcast_stats
CREATE OR REPLACE FUNCTION public.get_user_podcast_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalPodcasts',
        COUNT(*),
    'completedPodcasts',
        COUNT(*) FILTER (WHERE status = 'completed'),
    'totalDurationMinutes',
        ROUND(
          COALESCE(SUM(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC
          / 60,
          1
        ),
    'totalWords',
        COALESCE(SUM(word_count) FILTER (WHERE status = 'completed'), 0),
    'reportsWithPodcasts',
        COUNT(DISTINCT report_id) FILTER (WHERE report_id IS NOT NULL)
  )
  INTO result
  FROM public.podcasts
  WHERE user_id = p_user_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_podcast_stats(UUID) TO authenticated;

-- increment_podcast_export_count
CREATE OR REPLACE FUNCTION public.increment_podcast_export_count(p_podcast_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.podcasts
  SET    export_count = export_count + 1
  WHERE  id = p_podcast_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_podcast_export_count(UUID) TO authenticated;

-- ============================================
-- COMPREHENSIVE STATS FUNCTION (Updated for Part 8)
-- Includes all stats from previous parts + academic data + podcast data
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_complete_stats(p_user_id UUID)
RETURNS TABLE (
  -- Original stats
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
  -- Academic stats
  academic_papers_generated   BIGINT,
  academic_word_count         BIGINT,
  academic_pages_estimate     NUMERIC,
  most_used_citation_style    TEXT,
  -- Podcast stats (new)
  total_podcasts              BIGINT,
  completed_podcasts          BIGINT,
  total_podcast_duration_min  NUMERIC,
  total_podcast_words         BIGINT,
  reports_with_podcasts       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH 
  report_stats AS (
    SELECT
      COUNT(rr.id)::BIGINT AS total_reports,
      COUNT(rr.id) FILTER (WHERE rr.status = 'completed')::BIGINT AS completed_reports,
      COALESCE(SUM(rr.sources_count), 0)::BIGINT AS total_sources,
      COALESCE(ROUND(AVG(rr.reliability_score) FILTER (WHERE rr.reliability_score IS NOT NULL)::NUMERIC, 1), 0)::NUMERIC AS avg_reliability,
      COUNT(rr.id) FILTER (WHERE DATE_TRUNC('month', rr.created_at) = DATE_TRUNC('month', NOW()))::BIGINT AS reports_this_month
    FROM public.research_reports rr
    WHERE rr.user_id = p_user_id
  ),
  favorite_topic_result AS (
    SELECT rr.query AS fav_topic
    FROM public.research_reports rr
    WHERE rr.user_id = p_user_id AND rr.status = 'completed'
    GROUP BY rr.query
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ),
  assistant_stats AS (
    SELECT COUNT(*)::BIGINT AS total_msgs
    FROM public.assistant_conversations ac
    WHERE ac.user_id = p_user_id AND ac.role = 'assistant'
  ),
  embedding_stats AS (
    SELECT COUNT(DISTINCT re.report_id)::BIGINT AS reports_with_embeds
    FROM public.report_embeddings re
    WHERE re.user_id = p_user_id
  ),
  presentation_stats AS (
    SELECT
      COUNT(p.id)::BIGINT AS total_presentations,
      COALESCE(SUM(p.total_slides), 0)::BIGINT AS total_slides
    FROM public.presentations p
    WHERE p.user_id = p_user_id
  ),
  academic_stats AS (
    SELECT
      COUNT(*)::BIGINT AS total_papers,
      COALESCE(SUM(word_count), 0)::BIGINT AS total_words,
      COALESCE(ROUND(AVG(page_estimate)::NUMERIC, 1), 0)::NUMERIC AS avg_pages,
      (
        SELECT citation_style
        FROM public.academic_papers
        WHERE user_id = p_user_id
        GROUP BY citation_style
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )::TEXT AS most_used_style
    FROM public.academic_papers ap
    WHERE ap.user_id = p_user_id
  ),
  podcast_stats AS (
    SELECT
      COUNT(*)::BIGINT AS total_podcasts,
      COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_podcasts,
      COALESCE(ROUND(SUM(duration_seconds) FILTER (WHERE status = 'completed')::NUMERIC / 60, 1), 0)::NUMERIC AS total_duration_min,
      COALESCE(SUM(word_count) FILTER (WHERE status = 'completed'), 0)::BIGINT AS total_words,
      COUNT(DISTINCT report_id) FILTER (WHERE report_id IS NOT NULL)::BIGINT AS reports_with_podcasts
    FROM public.podcasts p
    WHERE p.user_id = p_user_id
  )
  SELECT
    rs.total_reports,
    rs.completed_reports,
    rs.total_sources,
    rs.avg_reliability,
    COALESCE((SELECT fav_topic FROM favorite_topic_result), NULL)::TEXT AS favorite_topic,
    rs.reports_this_month,
    COALESCE((SELECT total_msgs FROM assistant_stats), 0)::BIGINT AS total_assistant_messages,
    COALESCE((SELECT reports_with_embeds FROM embedding_stats), 0)::BIGINT AS reports_with_embeddings,
    COALESCE((SELECT total_presentations FROM presentation_stats), 0)::BIGINT AS total_presentations,
    COALESCE((SELECT total_slides FROM presentation_stats), 0)::BIGINT AS total_slides,
    COALESCE((SELECT total_papers FROM academic_stats), 0)::BIGINT AS academic_papers_generated,
    COALESCE((SELECT total_words FROM academic_stats), 0)::BIGINT AS academic_word_count,
    COALESCE((SELECT avg_pages FROM academic_stats), 0)::NUMERIC AS academic_pages_estimate,
    (SELECT most_used_style FROM academic_stats)::TEXT AS most_used_citation_style,
    COALESCE((SELECT total_podcasts FROM podcast_stats), 0)::BIGINT AS total_podcasts,
    COALESCE((SELECT completed_podcasts FROM podcast_stats), 0)::BIGINT AS completed_podcasts,
    COALESCE((SELECT total_duration_min FROM podcast_stats), 0)::NUMERIC AS total_podcast_duration_min,
    COALESCE((SELECT total_words FROM podcast_stats), 0)::BIGINT AS total_podcast_words,
    COALESCE((SELECT reports_with_podcasts FROM podcast_stats), 0)::BIGINT AS reports_with_podcasts
  FROM report_stats rs;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_complete_stats(UUID) TO authenticated;

-- ============================================
-- ORIGINAL STATS FUNCTION (Part 1-6, preserved)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_research_stats(p_user_id UUID)
RETURNS TABLE (
  total_reports           BIGINT,
  completed_reports       BIGINT,
  total_sources           BIGINT,
  avg_reliability         NUMERIC,
  favorite_topic          TEXT,
  reports_this_month      BIGINT,
  public_reports          BIGINT,
  total_presentations     BIGINT,
  total_slides            BIGINT,
  total_assistant_messages BIGINT,
  reports_with_embeddings  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(rr.id)::BIGINT AS total_reports,
    COUNT(rr.id) FILTER (WHERE rr.status = 'completed')::BIGINT AS completed_reports,
    COALESCE(SUM(rr.sources_count), 0)::BIGINT AS total_sources,
    COALESCE(AVG(rr.reliability_score) FILTER (WHERE rr.status = 'completed'), 0)::NUMERIC AS avg_reliability,
    (
      SELECT rr2.query
      FROM public.research_reports rr2
      WHERE rr2.user_id = p_user_id AND rr2.status = 'completed'
      GROUP BY rr2.query
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS favorite_topic,
    COUNT(rr.id) FILTER (WHERE rr.created_at >= DATE_TRUNC('month', NOW()))::BIGINT AS reports_this_month,
    COUNT(rr.id) FILTER (WHERE rr.is_public = TRUE)::BIGINT AS public_reports,
    (
      SELECT COUNT(p.id) FROM public.presentations p WHERE p.user_id = p_user_id
    )::BIGINT AS total_presentations,
    (
      SELECT COALESCE(SUM(p.total_slides), 0) FROM public.presentations p WHERE p.user_id = p_user_id
    )::BIGINT AS total_slides,
    (
      SELECT COUNT(ac.id) FROM public.assistant_conversations ac WHERE ac.user_id = p_user_id AND ac.role = 'assistant'
    )::BIGINT AS total_assistant_messages,
    (
      SELECT COUNT(DISTINCT re.report_id) FROM public.report_embeddings re WHERE re.user_id = p_user_id
    )::BIGINT AS reports_with_embeddings
  FROM public.research_reports rr
  WHERE rr.user_id = p_user_id
  GROUP BY rr.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_research_stats(UUID) TO authenticated;

-- ============================================
-- PUBLIC REPORT FUNCTIONS (Part 4)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_public_report(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report JSONB;
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

-- ============================================
-- SET REPORT PUBLIC FUNCTION (Part 4)
-- ============================================
CREATE OR REPLACE FUNCTION public.set_report_public(
  p_report_id UUID,
  p_user_id   UUID,
  p_is_public BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.research_reports WHERE id = p_report_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Report not found or access denied';
  END IF;

  IF p_is_public THEN
    UPDATE public.research_reports
    SET is_public = TRUE, public_token = COALESCE(public_token, encode(gen_random_bytes(16), 'hex'))
    WHERE id = p_report_id
    RETURNING public_token INTO v_token;
    RETURN v_token;
  ELSE
    UPDATE public.research_reports
    SET is_public = FALSE
    WHERE id = p_report_id;
    RETURN NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_report_public(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================
-- Add comments for documentation
-- ============================================
COMMENT ON TABLE public.academic_papers IS 'Stores AI-generated academic papers derived from research reports (Part 7)';
COMMENT ON COLUMN public.research_reports.research_mode IS 'Indicates whether the report was generated in standard or academic mode (Part 7)';
COMMENT ON COLUMN public.research_reports.academic_paper_id IS 'References the academic paper generated from this report (if any) (Part 7)';
COMMENT ON TABLE public.podcasts IS 'Stores AI-generated podcast episodes derived from research reports (Part 8)';
COMMENT ON COLUMN public.podcasts.script IS 'JSON structure containing dialogue turns, total words, and estimated duration';
COMMENT ON COLUMN public.podcasts.audio_segment_paths IS 'Array of file paths for each audio segment';
COMMENT ON COLUMN public.podcasts.status IS 'pending, generating_script, generating_audio, completed, failed';
COMMENT ON FUNCTION public.get_user_complete_stats IS 'Complete user stats including academic papers (Part 7) and podcasts (Part 8) - does not modify original get_user_research_stats';

-- ============================================================
-- Done ✓
-- Complete schema with all parts 1-8 installed.
-- After running this migration:
--   1. Verify pgvector is enabled: SELECT * FROM pg_extension WHERE extname = 'vector';
--   2. All tables, indexes, RLS policies, and functions are created
--   3. Original functions preserved, comprehensive stats function includes podcast data
-- ============================================================