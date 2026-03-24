// src/lib/rateLimiter.ts
// Public-Reports — IP-based question rate limiter
//
// FIXES:
//  1. Creates a FRESH Supabase client per call (no singleton state bleed)
//  2. Uses no-store cache on all fetches
//  3. When DB row doesn't exist → 0 questions, not limited
//  4. Handles every possible RPC response shape defensively

import { createHash }        from 'crypto';
import { createSupabaseServer } from './supabase-server';

const QUESTION_LIMIT = parseInt(
  process.env.PUBLIC_CHAT_QUESTION_LIMIT ?? '3',
  10,
);

// ── Hash IP for privacy ───────────────────────────────────────────────────────

export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + 'deepdive-ai-salt-2025')
    .digest('hex')
    .slice(0, 32);
}

// ── Extract real client IP ────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  // Vercel provides x-forwarded-for
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  // Fallback headers
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:       boolean;
  questionsUsed: number;
  questionsMax:  number;
  limitReached:  boolean;
}

// ── checkRateLimit ────────────────────────────────────────────────────────────

export async function checkRateLimit(
  ip:      string,
  shareId: string,
): Promise<RateLimitResult> {
  const ipHash = hashIp(ip);

  // Fresh client every time — no cached state from previous requests
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc('check_chat_limit', {
      p_ip_hash:  ipHash,
      p_share_id: shareId,
      p_limit:    QUESTION_LIMIT,
    });

    // Log for debugging (visible in Vercel function logs)
    console.log('[RateLimiter] checkRateLimit raw response:', {
      data: JSON.stringify(data),
      error: error?.message ?? null,
      ipHash: ipHash.slice(0, 8) + '…',
      shareId,
    });

    if (error) {
      // DB error → fail open (don't block new visitors)
      console.warn('[RateLimiter] RPC error, failing open:', error.message);
      return { allowed: true, questionsUsed: 0, questionsMax: QUESTION_LIMIT, limitReached: false };
    }

    // No row in DB = brand-new visitor = 0 questions used
    if (data === null || data === undefined) {
      return { allowed: true, questionsUsed: 0, questionsMax: QUESTION_LIMIT, limitReached: false };
    }

    // RPC returns a SETOF (array) — take first row
    if (Array.isArray(data)) {
      if (data.length === 0) {
        // Empty array = no row yet = 0 questions used, NOT limited
        return { allowed: true, questionsUsed: 0, questionsMax: QUESTION_LIMIT, limitReached: false };
      }
      const row          = data[0];
      const questionsUsed = typeof row?.questions_used === 'number' ? row.questions_used : 0;
      const limitReached  = row?.limit_reached === true; // strict boolean check

      return {
        allowed:       !limitReached,
        questionsUsed,
        questionsMax:  QUESTION_LIMIT,
        limitReached,
      };
    }

    // RPC returns a single RECORD (not array)
    if (typeof data === 'object') {
      const questionsUsed = typeof data.questions_used === 'number' ? data.questions_used : 0;
      const limitReached  = data.limit_reached === true;

      return {
        allowed:       !limitReached,
        questionsUsed,
        questionsMax:  QUESTION_LIMIT,
        limitReached,
      };
    }

    // Unexpected shape → fail open
    console.warn('[RateLimiter] Unexpected data shape:', typeof data, data);
    return { allowed: true, questionsUsed: 0, questionsMax: QUESTION_LIMIT, limitReached: false };

  } catch (err) {
    console.warn('[RateLimiter] Unexpected exception:', err);
    return { allowed: true, questionsUsed: 0, questionsMax: QUESTION_LIMIT, limitReached: false };
  }
}

// ── recordUsage ───────────────────────────────────────────────────────────────

export async function recordUsage(
  ip:      string,
  shareId: string,
): Promise<number> {
  const ipHash   = hashIp(ip);
  const supabase = createSupabaseServer(); // fresh client

  try {
    const { data, error } = await supabase.rpc('record_chat_usage', {
      p_ip_hash:  ipHash,
      p_share_id: shareId,
    });

    if (error) {
      console.warn('[RateLimiter] record_chat_usage error:', error.message);
      return 1;
    }

    return typeof data === 'number' ? data : 1;
  } catch (err) {
    console.warn('[RateLimiter] recordUsage exception:', err);
    return 1;
  }
}