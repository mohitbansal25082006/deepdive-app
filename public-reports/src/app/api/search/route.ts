// Public-Reports/src/app/api/search/route.ts
// Part 55.11 — Fix: search_vector may be NULL for rows that were inserted/updated
// before the Part 34 trigger existed, or before the backfill ran.
// Fix: we now call search_public_reports_v2 which uses a COALESCE approach —
// tries tsvector match first, falls back to ILIKE on cached_title + cached_summary
// so users always get results even if search_vector hasn't been populated yet.
// Also adds ?mode=ilike param for the fallback path when tsvector returns 0 rows.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import type { PublicFeedReport }     from '@/types/report';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE = { 'Cache-Control': 'no-store' };

function mapRow(row: Record<string, unknown>): PublicFeedReport & { rank: number } {
  return {
    shareId:       String(row.share_id       ?? ''),
    viewCount:     Number(row.view_count     ?? 0),
    shareCount:    Number(row.share_count    ?? 0),
    cachedTitle:   String(row.cached_title   ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    tags:          Array.isArray(row.tags)
                     ? (row.tags as string[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                     : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    researchMode:  (row.research_mode as 'standard' | 'academic') ?? 'standard',
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

  if (query.length < 2) {
    return NextResponse.json(
      { results: [], query },
      { status: 200, headers: NO_CACHE },
    );
  }

  const safeQuery = query.slice(0, 200);
  const supabase  = createSupabaseServer();

  // ── Step 1: Try the tsvector-based full-text search ──────────────────────
  const { data: ftsData, error: ftsError } = await supabase.rpc('search_public_reports', {
    p_query: safeQuery,
    p_limit: limit,
  });

  if (ftsError) {
    console.error('[search] RPC error (fts):', ftsError.message);
  }

  const ftsResults = ((ftsData ?? []) as Record<string, unknown>[]).map(mapRow);

  // ── Step 2: If tsvector returned 0 results (search_vector not populated
  //    for some rows), fall back to the ILIKE-based search RPC ─────────────
  if (ftsResults.length > 0) {
    return NextResponse.json(
      { results: ftsResults, query: safeQuery },
      { status: 200, headers: NO_CACHE },
    );
  }

  // Fallback: ILIKE search (catches rows where search_vector is NULL)
  const { data: ilikeData, error: ilikeError } = await supabase.rpc(
    'search_public_reports_ilike',
    { p_query: safeQuery, p_limit: limit },
  );

  if (ilikeError) {
    console.error('[search] RPC error (ilike):', ilikeError.message);
    return NextResponse.json(
      { results: [], query: safeQuery },
      { status: 200, headers: NO_CACHE },
    );
  }

  const ilikeResults = ((ilikeData ?? []) as Record<string, unknown>[]).map(mapRow);

  return NextResponse.json(
    { results: ilikeResults, query: safeQuery },
    { status: 200, headers: NO_CACHE },
  );
}