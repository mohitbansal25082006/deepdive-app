// Public-Reports/src/app/api/reactions/route.ts
// Section-level emoji reactions — no login required.
// GET  ?shareId=xxx                   → all reactions for the report (with hasReacted per IP)
// POST { shareId, sectionId, emoji }  → toggle a reaction, returns updated section counts

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';
import { getClientIp, hashIp }       from '@/lib/rateLimiter';
import type { ReactionEmoji }        from '@/types/report';

export const runtime   = 'nodejs';
export const dynamic   = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma':        'no-cache',
};

const VALID_EMOJIS: ReactionEmoji[] = ['💡', '😮', '🤔', '👍'];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get('shareId');

  if (!shareId || shareId.length > 20 || !/^[a-z0-9]+$/.test(shareId)) {
    return NextResponse.json({ error: 'Invalid shareId' }, { status: 400, headers: NO_CACHE });
  }

  const ip     = getClientIp(request);
  const ipHash = hashIp(ip);

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_report_reactions', {
    p_share_id: shareId,
    p_ip_hash:  ipHash,
  });

  if (error) {
    console.error('[reactions GET] RPC error:', error.message);
    return NextResponse.json({ bySection: {} }, { status: 200, headers: NO_CACHE });
  }

  // Transform flat rows into nested map: { [sectionId]: { [emoji]: { count, hasReacted } } }
  const bySection: Record<string, Record<string, { count: number; hasReacted: boolean }>> = {};

  for (const row of data ?? []) {
    if (!bySection[row.section_id]) {
      bySection[row.section_id] = {};
    }
    bySection[row.section_id][row.emoji] = {
      count:      Number(row.count)     ?? 0,
      hasReacted: Boolean(row.has_reacted),
    };
  }

  return NextResponse.json({ bySection }, { status: 200, headers: NO_CACHE });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: { shareId?: string; sectionId?: string; emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_CACHE });
  }

  const { shareId, sectionId, emoji } = body;

  // Validate inputs
  if (!shareId || typeof shareId !== 'string' || shareId.length > 20 || !/^[a-z0-9]+$/.test(shareId)) {
    return NextResponse.json({ error: 'Invalid shareId' }, { status: 400, headers: NO_CACHE });
  }
  if (!sectionId || typeof sectionId !== 'string' || sectionId.length > 100) {
    return NextResponse.json({ error: 'Invalid sectionId' }, { status: 400, headers: NO_CACHE });
  }
  if (!emoji || !VALID_EMOJIS.includes(emoji as ReactionEmoji)) {
    return NextResponse.json(
      { error: `Invalid emoji. Must be one of: ${VALID_EMOJIS.join(' ')}` },
      { status: 400, headers: NO_CACHE },
    );
  }

  const ip     = getClientIp(request);
  const ipHash = hashIp(ip);

  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('toggle_section_reaction', {
    p_share_id:   shareId,
    p_section_id: sectionId,
    p_ip_hash:    ipHash,
    p_emoji:      emoji,
  });

  if (error) {
    console.error('[reactions POST] RPC error:', error.message);
    return NextResponse.json(
      { error: 'Failed to toggle reaction' },
      { status: 500, headers: NO_CACHE },
    );
  }

  // RPC returns an array (RETURNS TABLE), take first row
  const result = Array.isArray(data) ? data[0] : data;

  return NextResponse.json(
    {
      added:     result?.added     ?? false,
      reactions: result?.reactions ?? {},
    },
    { status: 200, headers: NO_CACHE },
  );
}