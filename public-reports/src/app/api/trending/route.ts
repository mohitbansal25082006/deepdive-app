// Public-Reports/src/app/api/trending/route.ts
// Returns the top N most-viewed public reports in the last X days.
// Used by the TrendingWidget sidebar component.
// GET ?days=7&limit=5

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import type { TrendingReport }       from '@/types/report';

export const runtime    = 'nodejs';
export const revalidate = 120; // cache for 2 minutes at CDN

function mapRow(row: Record<string, unknown>): TrendingReport {
  return {
    shareId:       String(row.share_id      ?? ''),
    viewCount:     Number(row.view_count    ?? 0),
    cachedTitle:   String(row.cached_title  ?? ''),
    tags:          Array.isArray(row.tags) ? (row.tags as string[]) : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt:     String(row.created_at ?? ''),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days  = Math.min(30, Math.max(1, parseInt(searchParams.get('days')  ?? '7', 10)));
  const limit = Math.min(10, Math.max(1, parseInt(searchParams.get('limit') ?? '5', 10)));

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_trending_reports', {
    p_days:  days,
    p_limit: limit,
  });

  if (error) {
    console.error('[trending] RPC error:', error.message);
    return NextResponse.json(
      { reports: [] },
      { status: 200 },
    );
  }

  const reports = ((data ?? []) as Record<string, unknown>[]).map(mapRow);

  return NextResponse.json(
    { reports },
    {
      status:  200,
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
      },
    },
  );
}