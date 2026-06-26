// Public-Reports/src/app/api/discover/tags/route.ts
// Part 55.11 — Returns all distinct public report tags with usage counts.
// FIX: Schema 55.11 updated get_all_public_tags to return canonical casing
// (Title Case / acronym-safe) instead of forcing LOWER() on all tags.
// This means tag chips now show "AI" not "ai", and the tag passed to the
// discover API matches what's stored in the DB.

import { NextResponse }         from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { TagCount }        from '@/types/report';

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

  const tags: TagCount[] = ((data ?? []) as Record<string, unknown>[])
    .map(row => ({
      tag:   String(row.tag   ?? '').trim(),
      count: Number(row.count ?? 0),
    }))
    .filter(t => t.tag.length > 0 && t.count > 0);

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