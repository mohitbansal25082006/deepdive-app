-- ============================================
-- DeepDive AI — Complete Database Schema
-- Parts 1, 2 & 3 combined
-- Run this entire script in Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS + DROP IF EXISTS
-- ============================================


-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================
-- PROFILES TABLE
-- Stores extra user info beyond what Supabase Auth provides
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username    TEXT    UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  bio         TEXT,
  occupation  TEXT,
  interests   TEXT[],                  -- Array of interest tags
  profile_completed BOOLEAN DEFAULT FALSE,  -- Tracks if user finished profile setup
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


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

-- Profiles updated_at trigger
DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================
-- STORAGE — avatars bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar"     ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar"     ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar"     ON storage.objects;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );


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

  -- Timestamps
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  completed_at        TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reports"   ON public.research_reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON public.research_reports;
DROP POLICY IF EXISTS "Users can update own reports" ON public.research_reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON public.research_reports;

CREATE POLICY "Users can view own reports"
  ON public.research_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON public.research_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON public.research_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON public.research_reports FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_research_reports_updated ON public.research_reports;
CREATE TRIGGER on_research_reports_updated
  BEFORE UPDATE ON public.research_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_research_reports_user_id
  ON public.research_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_research_reports_created_at
  ON public.research_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_reports_status
  ON public.research_reports(status);

CREATE INDEX IF NOT EXISTS idx_research_reports_pinned
  ON public.research_reports(user_id, is_pinned) WHERE is_pinned = TRUE;


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

DROP POLICY IF EXISTS "Users can view own conversations"   ON public.research_conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.research_conversations;

CREATE POLICY "Users can view own conversations"
  ON public.research_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON public.research_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_research_conversations_report_id
  ON public.research_conversations(report_id);


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

DROP POLICY IF EXISTS "Users can manage own saved topics" ON public.saved_topics;
CREATE POLICY "Users can manage own saved topics"
  ON public.saved_topics FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_topics_user_id
  ON public.saved_topics(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_topics_notify
  ON public.saved_topics(user_id, notify_on_update) WHERE notify_on_update = TRUE;


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

DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage own push tokens"
  ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.push_tokens(user_id);

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
  reset_date              TIMESTAMP WITH TIME ZONE
                            DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription"   ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.user_subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

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


-- ============================================
-- FUNCTION: get user research stats
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_research_stats(p_user_id UUID)
RETURNS TABLE (
  total_reports       BIGINT,
  completed_reports   BIGINT,
  total_sources       BIGINT,
  avg_reliability     NUMERIC,
  favorite_topic      TEXT,
  reports_this_month  BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT                                                         AS total_reports,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT                    AS completed_reports,
    COALESCE(SUM(sources_count), 0)::BIGINT                                 AS total_sources,
    COALESCE(
      AVG(reliability_score) FILTER (WHERE status = 'completed'), 0
    )::NUMERIC                                                               AS avg_reliability,
    (
      SELECT query
      FROM   public.research_reports
      WHERE  user_id = p_user_id AND status = 'completed'
      GROUP  BY query
      ORDER  BY COUNT(*) DESC
      LIMIT  1
    )                                                                        AS favorite_topic,
    COUNT(*) FILTER (
      WHERE created_at >= date_trunc('month', NOW())
    )::BIGINT                                                                AS reports_this_month
  FROM public.research_reports
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;