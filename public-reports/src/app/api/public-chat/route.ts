// src/app/api/public-chat/route.ts
// Public-Reports — Public chat API endpoint
//
// POST /api/public-chat
// Body: { shareId, question, history }
//
// Returns { limitReached: true } with status 200 (not 429) when limit is hit
// so the client can show SignupWall gracefully without triggering an error state.

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit, recordUsage } from '@/lib/rateLimiter';
import { getPublicAnswer }    from '@/lib/ragPublic';
import { supabaseServer }     from '@/lib/supabase-server';
import type { PublicReport, PublicChatRequest } from '@/types/report';

export const runtime = 'nodejs';

// ── Load report for RAG context ───────────────────────────────────────────────

async function loadReportForChat(shareId: string): Promise<PublicReport | null> {
  const { data, error } = await supabaseServer.rpc('get_report_by_share_id', {
    p_share_id: shareId,
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0];

  return {
    reportId:          row.report_id,
    shareLinkId:       row.share_link_id,
    viewCount:         row.view_count         ?? 0,
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shareId, question, history = [] } = body;

  if (!shareId || typeof shareId !== 'string' || shareId.length > 20) {
    return NextResponse.json({ error: 'Invalid shareId' }, { status: 400 });
  }

  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 });
  }

  const trimmedQuestion = question.trim().slice(0, 500);
  if (trimmedQuestion.length < 2) {
    return NextResponse.json({ error: 'Question too short' }, { status: 400 });
  }

  const cleanHistory = (Array.isArray(history) ? history : [])
    .slice(-6)
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));

  // 2. Rate limit check
  const ip = getClientIp(request);
  const { allowed, questionsUsed, questionsMax, limitReached } =
    await checkRateLimit(ip, shareId);

  // Return 200 with limitReached=true (not 429) so the client can
  // show SignupWall without triggering the catch/error branch in ChatWidget.
  if (!allowed || limitReached) {
    return NextResponse.json(
      {
        answer:        '',
        limitReached:  true,
        questionsUsed,
        questionsMax,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  // 3. Load report
  const report = await loadReportForChat(shareId);
  if (!report) {
    return NextResponse.json(
      { error: 'Report not found or no longer public' },
      { status: 404 }
    );
  }

  // 4. Generate answer
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
      {
        error:        'Failed to generate answer. Please try again.',
        limitReached: false,
        questionsUsed,
        questionsMax,
      },
      { status: 500 }
    );
  }

  // 5. Record usage AFTER successful answer
  const newCount        = await recordUsage(ip, shareId);
  const nowLimitReached = newCount >= questionsMax;

  return NextResponse.json(
    {
      answer,
      limitReached:  nowLimitReached,
      questionsUsed: newCount,
      questionsMax,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

// ── GET — health check ─────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'DeepDive AI Public Chat' },
    { status: 200 }
  );
}