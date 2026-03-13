// src/services/commentSummaryService.ts
// Part 12 — AI-powered discussion summary using GPT-4o.
// Uses chatCompletionJSON from openaiClient (the correct export).

import { supabase } from '../lib/supabase';
import { chatCompletionJSON } from './openaiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommentSummaryResult {
  decisions:     string[];
  openQuestions: string[];
  actionItems:   string[];
  keyThemes:     string[];
  totalComments: number;
  totalReplies:  number;
  generatedAt:   string;
}

interface RawComment {
  id:         string;
  content:    string;
  created_at: string;
  profiles:   { full_name: string | null; username: string | null } | null;
  replies:    { content: string; profiles: { full_name: string | null; username: string | null } | null }[];
}

interface GPTSummaryResponse {
  decisions:     string[];
  openQuestions: string[];
  actionItems:   string[];
  keyThemes:     string[];
}

// ─── Fetch context ────────────────────────────────────────────────────────────

async function fetchCommentContext(
  reportId:    string,
  workspaceId: string,
): Promise<{ comments: RawComment[]; error: string | null }> {
  // Try the RPC first (Part 12 schema)
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_comment_summary_context', {
      p_report_id:    reportId,
      p_workspace_id: workspaceId,
    });

  if (!rpcError && rpcData) {
    return { comments: rpcData as RawComment[], error: null };
  }

  // Fallback: direct query
  const { data, error } = await supabase
    .from('workspace_report_comments')
    .select(`
      id, content, created_at,
      profiles ( full_name, username ),
      replies:workspace_report_comment_replies (
        content,
        profiles ( full_name, username )
      )
    `)
    .eq('report_id', reportId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    return { comments: [], error: error.message };
  }

  return { comments: (data ?? []) as unknown as RawComment[], error: null };
}

// ─── Build prompt ─────────────────────────────────────────────────────────────

function buildPrompt(comments: RawComment[]): string {
  const lines: string[] = [];

  for (const comment of comments) {
    const author = comment.profiles?.full_name
      ?? comment.profiles?.username
      ?? 'Anonymous';
    lines.push(`[Comment by ${author}]: ${comment.content}`);

    for (const reply of comment.replies ?? []) {
      const replyAuthor = reply.profiles?.full_name
        ?? reply.profiles?.username
        ?? 'Anonymous';
      lines.push(`  [Reply by ${replyAuthor}]: ${reply.content}`);
    }
  }

  return lines.join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateCommentSummary(
  reportId:    string,
  workspaceId: string,
): Promise<{ data: CommentSummaryResult | null; error: string | null }> {
  try {
    const { comments, error: fetchError } = await fetchCommentContext(reportId, workspaceId);

    if (fetchError) {
      return { data: null, error: fetchError };
    }

    if (comments.length === 0) {
      return {
        data: {
          decisions:     [],
          openQuestions: [],
          actionItems:   [],
          keyThemes:     [],
          totalComments: 0,
          totalReplies:  0,
          generatedAt:   new Date().toISOString(),
        },
        error: null,
      };
    }

    const totalReplies = comments.reduce(
      (sum, c) => sum + (c.replies?.length ?? 0),
      0,
    );

    const transcript = buildPrompt(comments);

    const systemPrompt = `You are an expert discussion analyst. Your job is to read a thread of comments from a collaborative research workspace and extract structured insights.

You MUST respond with valid JSON only — no prose, no markdown, no code fences.

Return exactly this shape:
{
  "decisions": ["..."],
  "openQuestions": ["..."],
  "actionItems": ["..."],
  "keyThemes": ["..."]
}

Guidelines:
- "decisions": Conclusions or agreements that were reached. Use past tense. Max 6 items.
- "openQuestions": Questions raised that remain unanswered. Start with a question word. Max 6 items.
- "actionItems": Specific tasks or next steps mentioned. Start with a verb. Max 6 items.
- "keyThemes": Recurring topics or concepts (2-4 words each). Max 8 items.
- Each array item should be a concise, standalone sentence or phrase (under 25 words).
- If a category has no relevant content, return an empty array [].
- Do NOT invent content not present in the discussion.`;

    const userPrompt = `Here is the discussion thread from the workspace report:\n\n${transcript}\n\nExtract and return the structured summary as JSON.`;

    const parsed = await chatCompletionJSON<GPTSummaryResponse>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 1000 },
    );

    const result: CommentSummaryResult = {
      decisions:     Array.isArray(parsed.decisions)     ? parsed.decisions     : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
      actionItems:   Array.isArray(parsed.actionItems)   ? parsed.actionItems   : [],
      keyThemes:     Array.isArray(parsed.keyThemes)     ? parsed.keyThemes     : [],
      totalComments: comments.length,
      totalReplies,
      generatedAt:   new Date().toISOString(),
    };

    return { data: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary';
    return { data: null, error: message };
  }
}