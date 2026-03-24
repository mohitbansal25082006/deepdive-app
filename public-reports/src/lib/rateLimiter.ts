// src/lib/rateLimiter.ts
// Public-Reports — IP-based question rate limiter
//
// Uses the public_chat_usage Supabase table (via SECURITY DEFINER RPCs).
// Rate limit: PUBLIC_CHAT_QUESTION_LIMIT questions per 24h per (ip_hash, shareId).
//
// IMPORTANT: When no DB row exists for a visitor yet (brand new visitor),
// checkRateLimit must return { questionsUsed: 0, limitReached: false }.
// A missing row is NOT the same as "limit reached".

import { createHash } from 'crypto';
import { supabaseServer } from './supabase-server';

const QUESTION_LIMIT = parseInt(
  process.env.PUBLIC_CHAT_QUESTION_LIMIT ?? '3',
  10
);

// ── Hash IP for privacy ───────────────────────────────────────────────────────

export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dd-salt'))
    .digest('hex')
    .slice(0, 32);
}

// ── Extract real client IP ────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '127.0.0.1';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:       boolean;
  questionsUsed: number;
  questionsMax:  number;
  limitReached:  boolean;
}

// ── checkRateLimit ────────────────────────────────────────────────────────────
// Returns current usage for (ip, shareId).
// A missing DB row means 0 questions used — NOT limited.

export async function checkRateLimit(
  ip:      string,
  shareId: string,
): Promise<RateLimitResult> {
  const ipHash = hashIp(ip);

  try {
    const { data, error } = await supabaseServer.rpc('check_chat_limit', {
      p_ip_hash:  ipHash,
      p_share_id: shareId,
      p_limit:    QUESTION_LIMIT,
    });

    if (error) {
      // DB error — fail open (allow question, don't block)
      console.warn('[RateLimiter] check_chat_limit RPC error:', error.message);
      return {
        allowed:       true,
        questionsUsed: 0,
        questionsMax:  QUESTION_LIMIT,
        limitReached:  false,
      };
    }

    // RPC returns a table — data is an array
    if (!data || !Array.isArray(data) || data.length === 0) {
      // No row returned = brand new visitor, 0 questions used
      return {
        allowed:       true,
        questionsUsed: 0,
        questionsMax:  QUESTION_LIMIT,
        limitReached:  false,
      };
    }

    const row = data[0];

    // Defensive: treat null/undefined fields as safe defaults
    const questionsUsed: number  = typeof row.questions_used === 'number'  ? row.questions_used  : 0;
    const limitReached:  boolean = typeof row.limit_reached  === 'boolean' ? row.limit_reached   : false;

    return {
      allowed:       !limitReached,
      questionsUsed,
      questionsMax:  QUESTION_LIMIT,
      limitReached,
    };

  } catch (err) {
    // Unexpected error — fail open
    console.warn('[RateLimiter] Unexpected error in checkRateLimit:', err);
    return {
      allowed:       true,
      questionsUsed: 0,
      questionsMax:  QUESTION_LIMIT,
      limitReached:  false,
    };
  }
}

// ── recordUsage ───────────────────────────────────────────────────────────────
// Increments counter after a successful answer. Returns new count.

export async function recordUsage(
  ip:      string,
  shareId: string,
): Promise<number> {
  const ipHash = hashIp(ip);

  try {
    const { data, error } = await supabaseServer.rpc('record_chat_usage', {
      p_ip_hash:  ipHash,
      p_share_id: shareId,
    });

    if (error) {
      console.warn('[RateLimiter] record_chat_usage error:', error.message);
      return 1;
    }

    return typeof data === 'number' ? data : 1;
  } catch (err) {
    console.warn('[RateLimiter] recordUsage error:', err);
    return 1;
  }
}