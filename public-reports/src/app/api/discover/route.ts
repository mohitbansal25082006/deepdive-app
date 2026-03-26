// Public-Reports/src/app/api/discover/route.ts
// Public research discovery feed.
// GET ?sort=trending|recent&tag=AI&limit=24&offset=0

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import type { PublicFeedReport }     from '@/types/report';

export const runtime = 'nodejs';
// Allow caching for 60s at the CDN level (Vercel edge cache)
export const revalidate = 60;

function mapRow(row: Record<string, unknown>): PublicFeedReport {
  return {
    shareId:       String(row.share_id      ?? ''),
    viewCount:     Number(row.view_count    ?? 0),
    shareCount:    Number(row.share_count   ?? 0),
    cachedTitle:   String(row.cached_title  ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    tags:          Array.isArray(row.tags) ? (row.tags as string[]) : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    researchMode:  (row.research_mode as 'standard' | 'academic') ?? 'standard',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt:     String(row.created_at     ?? ''),
    lastViewedAt:  row.last_viewed_at ? String(row.last_viewed_at) : undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const rawSort  = searchParams.get('sort') ?? 'trending';
  const sort     = rawSort === 'recent' ? 'recent' : 'trending';
  const tag      = searchParams.get('tag')    ?? null;
  const limit    = Math.min(50, Math.max(1, parseInt(searchParams.get('limit')  ?? '24', 10)));
  const offset   = Math.max(0,             parseInt(searchParams.get('offset') ?? '0',  10));

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_public_reports_feed', {
    p_sort:   sort,
    p_tag:    tag,
    p_limit:  limit + 1,     // fetch one extra to determine hasMore
    p_offset: offset,
  });

  if (error) {
    console.error('[discover] RPC error:', error.message);
    return NextResponse.json(
      { reports: [], sort, tag, hasMore: false },
      { status: 200 },
    );
  }

  const rows    = (data ?? []) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const reports = rows.slice(0, limit).map(mapRow);

  return NextResponse.json(
    { reports, sort, tag, hasMore },
    {
      status:  200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    },
  );
}