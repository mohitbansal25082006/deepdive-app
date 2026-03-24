// src/app/api/public-chat/status/route.ts
// Public-Reports — Check current chat usage without consuming a question.
//
// POST /api/public-chat/status
// Body: { shareId }
//
// Called by ChatWidget on mount so that if a visitor refreshes the page
// after using all 3 questions, the SignupWall shows immediately instead
// of returning a confusing 429 error on the next question attempt.

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/rateLimiter';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { shareId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { shareId } = body;

  if (!shareId || typeof shareId !== 'string' || shareId.length > 20) {
    return NextResponse.json({ error: 'Invalid shareId' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { questionsUsed, questionsMax, limitReached } = await checkRateLimit(ip, shareId);

  return NextResponse.json(
    { questionsUsed, questionsMax, limitReached },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}