// Public-Reports/src/app/api/search/route.ts
// Full-text search across all public research reports.
// GET ?q=quantum+computing&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import type { PublicFeedReport }     from '@/types/report';

export const runtime   = 'nodejs';
export const dynamic   = 'force-dynamic';  // always fresh — user-supplied query
export const revalidate = 0;

const NO_CACHE = { 'Cache-Control': 'no-store' };

function mapRow(row: Record<string, unknown>): PublicFeedReport & { rank: number } {
  return {
    shareId:       String(row.share_id       ?? ''),
    viewCount:     Number(row.view_count     ?? 0),
    shareCount:    0,
    cachedTitle:   String(row.cached_title   ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    tags:          Array.isArray(row.tags) ? (row.tags as string[]) : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt:     String(row.created_at ?? ''),
    rank:          Number(row.rank ?? 0),
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(50, Math.max(1, parseInt(
    request.nextUrl.searchParams.get('limit') ?? '20', 10,
  )));

  // Require minimum 2 characters
  if (query.length < 2) {
    return NextResponse.json(
      { results: [], query },
      { status: 200, headers: NO_CACHE },
    );
  }

  // Limit query length to prevent abuse
  const safeQuery = query.slice(0, 200);

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('search_public_reports', {
    p_query: safeQuery,
    p_limit: limit,
  });

  if (error) {
    console.error('[search] RPC error:', error.message);
    return NextResponse.json(
      { results: [], query },
      { status: 200, headers: NO_CACHE },
    );
  }

  const results = ((data ?? []) as Record<string, unknown>[]).map(mapRow);

  return NextResponse.json(
    { results, query: safeQuery },
    { status: 200, headers: NO_CACHE },
  );
}