// Public-Reports/src/app/api/discover/route.ts
// Part 55.11 — Fix: tag is passed to RPC as-is (case-insensitive match is
// now handled DB-side via Schema 55.11's updated get_public_reports_feed).
// No more client-side lowercasing that broke the stored Title Case tags.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import type { PublicFeedReport }     from '@/types/report';

export const runtime   = 'nodejs';
export const revalidate = 60;

function mapRow(row: Record<string, unknown>): PublicFeedReport {
  return {
    shareId:       String(row.share_id       ?? ''),
    viewCount:     Number(row.view_count     ?? 0),
    shareCount:    Number(row.share_count    ?? 0),
    cachedTitle:   String(row.cached_title   ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    // Ensure tags is always a non-null array of non-empty strings
    tags:          Array.isArray(row.tags)
                     ? (row.tags as string[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                     : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    researchMode:  (row.research_mode as 'standard' | 'academic') ?? 'standard',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt:     String(row.created_at     ?? ''),
    lastViewedAt:  row.last_viewed_at ? String(row.last_viewed_at) : undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const rawSort = searchParams.get('sort') ?? 'trending';
  const sort    = rawSort === 'recent' ? 'recent' : 'trending';

  // FIX: pass tag to the RPC without lowercasing.
  // Schema 55.11 updated get_public_reports_feed to use LOWER() on both sides
  // so the comparison is case-insensitive at the DB level.
  const tag    = searchParams.get('tag')?.trim() || null;
  const limit  = Math.min(50, Math.max(1, parseInt(searchParams.get('limit')  ?? '24', 10)));
  const offset = Math.max(0,              parseInt(searchParams.get('offset') ?? '0',  10));

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_public_reports_feed', {
    p_sort:   sort,
    p_tag:    tag,
    p_limit:  limit + 1,   // fetch one extra to determine hasMore
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
        // Tag-filtered results are dynamic; don't cache them to avoid stale data.
        // Un-filtered trending/recent can cache for 60s.
        'Cache-Control': tag
          ? 'no-store'
          : 'public, s-maxage=60, stale-while-revalidate=120',
      },
    },
  );
}