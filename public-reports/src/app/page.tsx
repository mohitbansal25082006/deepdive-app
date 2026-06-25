// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Public Reports Home Page (Server Component)
// Exports metadata and fetches data, but renders a Client Component for the UI.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';
import { createSupabaseServer } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'DeepDive AI — AI-Powered Research Reports',
  description:
    'DeepDive AI runs autonomous multi-agent research on any topic and generates structured, cited reports in minutes. Download the app to get started.',
};

// ── Fetch discovery stats ────────────────────────────────────────────────────

async function fetchDiscoverStats(): Promise<{ reportCount: number; topTags: string[] }> {
  try {
    const supabase = createSupabaseServer();
    const [feedRes, tagsRes] = await Promise.allSettled([
      supabase.rpc('get_public_reports_feed', { p_sort: 'trending', p_limit: 100, p_offset: 0 }),
      supabase.rpc('get_all_public_tags', { p_limit: 6 }),
    ]);
    const count = feedRes.status === 'fulfilled' ? (feedRes.value.data?.length ?? 0) : 0;
    const tags = tagsRes.status === 'fulfilled'
      ? (tagsRes.value.data ?? []).map((t: { tag: string }) => t.tag).slice(0, 6)
      : [];
    return { reportCount: count, topTags: tags };
  } catch {
    return { reportCount: 0, topTags: [] };
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const { reportCount, topTags } = await fetchDiscoverStats();

  return <HomePageClient reportCount={reportCount} topTags={topTags} />;
}