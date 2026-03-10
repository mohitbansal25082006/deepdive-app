-- ============================================
-- DeepDive AI — Complete Database Schema
-- Run this entire script in Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS + DROP IF EXISTS where applicable
-- ============================================

-- Enable UUID extension (allows us to create unique IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- Stores extra user info beyond what Supabase Auth provides
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  occupation TEXT,
  interests TEXT[], -- Array of interest tags
  profile_completed BOOLEAN DEFAULT FALSE, -- Tracks if user finished profile setup
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- This is important — it means users can only see/edit THEIR OWN data
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- FUNCTION: auto-create profile when user signs up
-- This runs automatically after any new user registers
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

-- ============================================
-- TRIGGER: connects the function to auth.users
-- Fires after every new user is created
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FUNCTION: auto-update "updated_at" timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- STORAGE POLICY for avatars bucket
-- Allows authenticated users to upload their avatar
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- RESEARCH REPORTS TABLE
-- Stores every generated research report
-- ============================================
CREATE TABLE IF NOT EXISTS public.research_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Research input
  query TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'deep', -- 'quick' | 'deep' | 'expert'
  focus_areas TEXT[] DEFAULT '{}',
  -- Report content (stored as JSONB for flexibility)
  title TEXT,
  executive_summary TEXT,
  sections JSONB DEFAULT '[]', -- Array of ReportSection objects
  key_findings JSONB DEFAULT '[]', -- Array of strings
  future_predictions JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]', -- Array of Citation objects
  statistics JSONB DEFAULT '[]', -- Array of Statistic objects
  -- Research metadata
  search_queries JSONB DEFAULT '[]', -- Queries actually sent to SerpAPI
  sources_count INTEGER DEFAULT 0,
  reliability_score NUMERIC(3,1) DEFAULT 0,
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | planning | searching | analyzing | fact_checking | generating | completed | failed
  error_message TEXT,
  agent_logs JSONB DEFAULT '[]', -- Progress steps for replay
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ============================================
-- RESEARCH CONVERSATIONS TABLE
-- Follow-up Q&A threads on a report
-- ============================================
CREATE TABLE IF NOT EXISTS public.research_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_id UUID REFERENCES public.research_reports(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_conversations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RESEARCH REPORTS POLICIES
-- Drop first so re-runs never fail
-- ============================================
DROP POLICY IF EXISTS "Users can view own reports" ON public.research_reports;
CREATE POLICY "Users can view own reports"
  ON public.research_reports FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own reports" ON public.research_reports;
CREATE POLICY "Users can insert own reports"
  ON public.research_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reports" ON public.research_reports;
CREATE POLICY "Users can update own reports"
  ON public.research_reports FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reports" ON public.research_reports;
CREATE POLICY "Users can delete own reports"
  ON public.research_reports FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RESEARCH CONVERSATIONS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view own conversations" ON public.research_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.research_conversations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conversations" ON public.research_conversations;
CREATE POLICY "Users can insert own conversations"
  ON public.research_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
DROP TRIGGER IF EXISTS on_research_reports_updated ON public.research_reports;
CREATE TRIGGER on_research_reports_updated
  BEFORE UPDATE ON public.research_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_research_reports_user_id
  ON public.research_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_research_reports_created_at
  ON public.research_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_reports_status
  ON public.research_reports(status);

CREATE INDEX IF NOT EXISTS idx_research_conversations_report_id
  ON public.research_conversations(report_id);