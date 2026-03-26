// src/app/api/public-chat/route.ts
// Public-Reports — Public chat API endpoint
//
// POST /api/public-chat
// Body: { shareId, question, history }

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit, recordUsage } from '@/lib/rateLimiter';
import { getPublicAnswer }    from '@/lib/ragPublic';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { PublicReport, PublicChatRequest } from '@/types/report';

export const runtime   = 'nodejs';
export const dynamic   = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };

// ── Load report ───────────────────────────────────────────────────────────────

async function loadReportForChat(shareId: string): Promise<PublicReport | null> {
  // Fresh client per request
  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_report_by_share_id', {
    p_share_id: shareId,
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0];

  return {
    reportId:          row.report_id,
    shareLinkId:       row.share_link_id,
    viewCount:         row.view_count         ?? 0,
    shareCount:        row.share_count        ?? 0,   // Part 34
    tags:              Array.isArray(row.tags) ? row.tags : [],  // Part 34
    query:             row.query,
    depth:             row.depth,
    title:             row.title              ?? row.query,
    executiveSummary:  row.executive_summary  ?? '',
    sections:          Array.isArray(row.sections)           ? row.sections           : [],
    keyFindings:       Array.isArray(row.key_findings)       ? row.key_findings       : [],
    futurePredictions: Array.isArray(row.future_predictions) ? row.future_predictions : [],
    citations:         Array.isArray(row.citations)          ? row.citations          : [],
    statistics:        Array.isArray(row.statistics)         ? row.statistics         : [],
    sourcesCount:      row.sources_count      ?? 0,
    reliabilityScore:  row.reliability_score  ?? 0,
    infographicData:   row.infographic_data   ?? undefined,
    sourceImages:      row.source_images      ?? [],
    researchMode:      row.research_mode      ?? 'standard',
    completedAt:       row.completed_at,
    createdAt:         row.created_at,
    ownerUsername:     row.owner_username     ?? undefined,
    ownerAvatarUrl:    row.owner_avatar_url   ?? undefined,
  };
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: PublicChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_CACHE });
  }

  const { shareId, question, history = [] } = body;

  if (!shareId || typeof shareId !== 'string' || shareId.length > 20) {
    return NextResponse.json({ error: 'Invalid shareId' }, { status: 400, headers: NO_CACHE });
  }

  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Question is required' }, { status: 400, headers: NO_CACHE });
  }

  const trimmedQuestion = question.trim().slice(0, 500);
  if (trimmedQuestion.length < 2) {
    return NextResponse.json({ error: 'Question too short' }, { status: 400, headers: NO_CACHE });
  }

  const cleanHistory = (Array.isArray(history) ? history : [])
    .slice(-6)
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        m && typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));

  // 2. Rate limit — fresh check every time
  const ip = getClientIp(request);
  const { allowed, questionsUsed, questionsMax, limitReached } =
    await checkRateLimit(ip, shareId);

  // Return 200 with limitReached=true so client shows SignupWall (not error state)
  if (!allowed || limitReached) {
    return NextResponse.json(
      { answer: '', limitReached: true, questionsUsed, questionsMax },
      { status: 200, headers: NO_CACHE },
    );
  }

  // 3. Load report (for RAG context)
  const report = await loadReportForChat(shareId);
  if (!report) {
    return NextResponse.json(
      { error: 'Report not found or no longer public' },
      { status: 404, headers: NO_CACHE },
    );
  }

  // 4. Generate RAG answer
  let answer: string;
  try {
    const result = await getPublicAnswer({
      shareId,
      question: trimmedQuestion,
      report,
      history: cleanHistory,
    });
    answer = result.answer;
  } catch (err) {
    console.error('[public-chat] RAG error:', err);
    return NextResponse.json(
      { error: 'Failed to generate answer. Please try again.', limitReached: false, questionsUsed, questionsMax },
      { status: 500, headers: NO_CACHE },
    );
  }

  // 5. Record usage AFTER successful answer
  const newCount = await recordUsage(ip, shareId);

  // IMPORTANT: Always return limitReached: false with the answer, even when
  // newCount === questionsMax. The SignupWall should appear only when the user
  // tries to send the NEXT question (which checkRateLimit will block).
  // Returning limitReached: true here causes the wall to appear the instant
  // the 3rd answer is rendered, before the user can even read it.

  return NextResponse.json(
    { answer, limitReached: false, questionsUsed: newCount, questionsMax },
    { status: 200, headers: NO_CACHE },
  );
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'DeepDive AI Public Chat' });
}