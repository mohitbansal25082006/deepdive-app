// src/app/api/public-chat/status/route.ts
// Public-Reports — Check current chat usage without consuming a question.
//
// POST /api/public-chat/status
// Body: { shareId }
//
// Called by ChatWidget on mount. Returns current usage so the widget can
// show SignupWall immediately if the visitor already hit the limit.
//
// IMPORTANT: This route must never return limitReached=true unless the DB
// EXPLICITLY confirms it. Any error = conservative default of 0 used / false.

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/rateLimiter';

export const runtime = 'nodejs';

// Disable all Next.js route caching for this endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let body: { shareId?: unknown };

  try {
    body = await request.json();
  } catch {
    // Bad body — return safe default (0 used, not limited)
    return NextResponse.json(
      { questionsUsed: 0, questionsMax: 3, limitReached: false },
      { status: 200, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  }

  const { shareId } = body;

  // Validate shareId
  if (!shareId || typeof shareId !== 'string' || shareId.length > 20) {
    // Invalid shareId — return safe default instead of blocking
    return NextResponse.json(
      { questionsUsed: 0, questionsMax: 3, limitReached: false },
      { status: 200, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  }

  const ip = getClientIp(request);

  let questionsUsed = 0;
  let questionsMax  = 3;
  let limitReached  = false;

  try {
    const result = await checkRateLimit(ip, shareId);
    questionsUsed = result.questionsUsed;
    questionsMax  = result.questionsMax;
    // Only set limitReached=true if EXPLICITLY true (not truthy)
    limitReached  = result.limitReached === true;
  } catch {
    // Any error → safe default, don't block the user
    questionsUsed = 0;
    limitReached  = false;
  }

  return NextResponse.json(
    { questionsUsed, questionsMax, limitReached },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma':        'no-cache',
      },
    },
  );
}