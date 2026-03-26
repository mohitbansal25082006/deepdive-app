// Public-Reports/src/app/api/discover/tags/route.ts
// Returns all distinct public report tags with usage counts.
// Used by the DiscoverClient for the tag filter chips.
// GET /api/discover/tags

import { NextResponse }       from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { TagCount }      from '@/types/report';

export const runtime    = 'nodejs';
export const revalidate = 300; // 5 minutes

export async function GET() {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_all_public_tags', { p_limit: 50 });

  if (error) {
    console.error('[discover/tags] RPC error:', error.message);
    return NextResponse.json(
      { tags: [] },
      { status: 200 },
    );
  }

  const tags: TagCount[] = ((data ?? []) as Record<string, unknown>[]).map(row => ({
    tag:   String(row.tag   ?? ''),
    count: Number(row.count ?? 0),
  })).filter(t => t.tag.length > 0);

  return NextResponse.json(
    { tags },
    {
      status:  200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}