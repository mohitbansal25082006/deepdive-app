// Public-Reports/src/app/api/auto-tag/route.ts
// Part 55.10 — Claude-powered auto-tag generation for public reports
//
// POST /api/auto-tag
// Body: { shareId: string, title: string, query: string, summary: string, keyFindings: string[] }
//
// Flow:
//   1. Validate input & check report exists in DB
//   2. Check tags_generated_at — skip if recently generated (< 7 days ago)
//   3. Call Claude claude-haiku-4-5 to generate 3–5 concise topic tags
//   4. Write tags back via set_auto_generated_tags RPC
//   5. Return { tags, source: 'claude' | 'skipped' }
//
// This route is called server-side from the report page (not from the browser)
// so there is no CORS concern. Rate-limited to 1 call per share_id per 7 days
// by the tags_generated_at DB column.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer }      from '@/lib/supabase-server';

export const runtime = 'nodejs';

// ─── Tag prompt ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a precise research topic classifier. Given a research report's metadata, you output 3 to 5 short topic tags that describe the report's primary subjects.

Rules:
- Return ONLY a JSON array of strings, no other text, no markdown, no backticks
- 3 to 5 tags maximum
- Each tag: 1–3 words, Title Case (e.g. "Machine Learning", "Climate Change", "Real Estate")
- Be specific but broadly recognisable — tags should match what someone would search for
- Prefer established domain names: AI, Finance, Health, Climate, Politics, Science, Technology, Economy, Education, Business, Society, Geopolitics, Crypto, Biotechnology, Space, Energy, Environment, Mental Health, Cybersecurity, Real Estate, Sports, Entertainment, Food, Agriculture, Gaming, Media, Travel, Lifestyle, Research
- Do NOT include generic tags like "Research", "Report", "Study", "Analysis" unless they are the only option
- Do NOT include the report query verbatim as a tag; extract the underlying topic instead

Example output:
["Machine Learning", "Healthcare", "Clinical Research"]`;

function buildUserPrompt(
  title: string,
  query: string,
  summary: string,
  keyFindings: string[],
): string {
  const findingsText = keyFindings.slice(0, 5).join('; ');
  return `Title: ${title}
Query: ${query}
Summary: ${summary.slice(0, 400)}
Key findings: ${findingsText.slice(0, 500)}

Generate 3–5 topic tags for this report.`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      shareId:     string;
      title:       string;
      query:       string;
      summary:     string;
      keyFindings: string[];
    };

    const { shareId, title, query, summary, keyFindings } = body;

    // ── Basic validation ──
    if (!shareId || typeof shareId !== 'string' || !/^[a-z0-9]+$/.test(shareId)) {
      return NextResponse.json({ error: 'Invalid shareId' }, { status: 400 });
    }
    if (!title && !query) {
      return NextResponse.json({ error: 'title or query required' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // ── Check if tagging is needed ──
    const { data: statusData, error: statusError } = await supabase.rpc(
      'get_report_tag_status',
      { p_share_id: shareId },
    );

    if (statusError) {
      console.error('[auto-tag] status RPC error:', statusError.message);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    const status = Array.isArray(statusData) ? statusData[0] : statusData;

    // Already has tags generated within the last 7 days — skip
    if (status && !status.needs_tagging) {
      return NextResponse.json({
        tags:   status.tags ?? [],
        source: 'skipped',
      });
    }

    // ── Call Claude to generate tags ──
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      // Fall through to DB-side keyword tags (already set during migration)
      return NextResponse.json({ tags: [], source: 'no_key' }, { status: 200 });
    }

    const userPrompt = buildUserPrompt(
      title   || query,
      query   || title,
      summary || '',
      Array.isArray(keyFindings) ? keyFindings : [],
    );

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 128,
        system:     SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!claudeRes.ok) {
      console.error('[auto-tag] Claude API error:', claudeRes.status, await claudeRes.text());
      return NextResponse.json({ tags: [], source: 'claude_error' }, { status: 200 });
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const rawText = claudeData.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse the JSON array Claude returned
    let tags: string[] = [];
    try {
      const cleaned = rawText.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed  = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        tags = parsed
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map(t => t.trim())
          .slice(0, 5);
      }
    } catch {
      console.warn('[auto-tag] Failed to parse Claude response:', rawText);
      return NextResponse.json({ tags: [], source: 'parse_error' }, { status: 200 });
    }

    if (tags.length === 0) {
      return NextResponse.json({ tags: [], source: 'empty' }, { status: 200 });
    }

    // ── Write tags back to DB ──
    const { error: writeError } = await supabase.rpc('set_auto_generated_tags', {
      p_share_id: shareId,
      p_tags:     tags,
    });

    if (writeError) {
      console.error('[auto-tag] set_auto_generated_tags error:', writeError.message);
      // Tags were generated but not saved — still return them to the client
      // so the page can display them immediately; they'll be regenerated next visit
      return NextResponse.json({ tags, source: 'claude_unsaved' }, { status: 200 });
    }

    return NextResponse.json({ tags, source: 'claude' }, { status: 200 });

  } catch (err) {
    console.error('[auto-tag] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}