// Public-Reports/src/app/api/researchers/route.ts
// Part 37 — Researchers directory API for the /discover page Researchers tab.
//
// GET /api/researchers
//   ?sort=followers|active|newest   (default: followers)
//   ?search=<string>                (optional — filters by name/username/interest)
//   ?limit=<int>                    (default: 24)
//   ?offset=<int>                   (default: 0)
//
// Uses the get_explore_researchers SECURITY DEFINER RPC (created in Part 36).
// Only returns researchers with is_public = true AND profile_completed = true.
// No auth required — public endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }       from '@/lib/supabase-server';

// ─── Researcher shape returned to the client ──────────────────────────────────

export interface ResearcherRow {
  id:              string;
  username:        string | null;
  full_name:       string | null;
  avatar_url:      string | null;
  bio:             string | null;
  interests:       string[];
  follower_count:  number;
  following_count: number;
  report_count:    number;
  recent_reports:  number;
  is_following:    boolean; // always false — no auth context on public web
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const sort   = searchParams.get('sort')   ?? 'followers';
  const search = searchParams.get('search') ?? '';
  const limit  = Math.min(Math.max(parseInt(searchParams.get('limit')  ?? '24', 10), 1), 50);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

  // Validate sort param
  const validSorts = ['followers', 'active', 'newest'];
  const safeSorted = validSorts.includes(sort) ? sort : 'followers';

  try {
    const sb = createSupabaseServer();

    const { data, error } = await sb.rpc('get_explore_researchers', {
      p_sort:   safeSorted,
      p_search: search.trim() || null,
      p_limit:  limit,
      p_offset: offset,
    });

    if (error) {
      console.error('[/api/researchers] RPC error:', error.message);
      return NextResponse.json(
        { researchers: [], hasMore: false, error: error.message },
        { status: 500 },
      );
    }

    const researchers: ResearcherRow[] = Array.isArray(data)
      ? (data as ResearcherRow[])
      : [];

    return NextResponse.json(
      {
        researchers,
        hasMore: researchers.length >= limit,
        total:   researchers.length + offset, // approximate
      },
      {
        headers: {
          // Cache for 60 s on CDN — researcher profiles change slowly
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (err) {
    console.error('[/api/researchers] unexpected error:', err);
    return NextResponse.json(
      { researchers: [], hasMore: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}