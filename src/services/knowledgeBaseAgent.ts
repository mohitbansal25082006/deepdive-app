// src/services/knowledgeBaseAgent.ts
// Part 26 — Personal AI Knowledge Base Agent
//
// This agent differs from researchAssistantAgent (Part 6) in one key way:
//   • Part 6 = RAG within a SINGLE report
//   • Part 26 = RAG across ALL of the user's reports simultaneously
//
// Architecture:
//   1. Query expansion  — GPT-4o generates 2–3 sub-queries for better recall
//   2. Global retrieval — match_global_knowledge RPC searches all embeddings
//   3. Dedup & rank     — remove duplicate chunks, sort by similarity
//   4. Build context    — group chunks by report for clear attribution
//   5. Synthesize       — GPT-4o answer with multi-report citations
//
// The agent is stateless — call runKnowledgeBaseAgent() per turn.

import { supabase }            from '../lib/supabase';
import { chatCompletion, chatCompletionJSON, ChatMessage } from './openaiClient';
import { createEmbedding }     from './embeddingService';
import {
  KBAgentResponse,
  KBRetrievedChunk,
  KBSourceReport,
  KBMessage,
}                              from '../types/knowledgeBase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHUNKS        = 14;   // max chunks across all reports
const SIMILARITY_THRESH = 0.26; // slightly lower than single-report (more recall)
const MAX_CONTEXT_CHARS = 6000; // max characters of context passed to GPT

// ─── Step 1: Query Expansion ──────────────────────────────────────────────────

/**
 * Generate 2–3 semantically distinct sub-queries to improve recall.
 * Example: "AI startup funding" → ["AI startup funding rounds 2024",
 *   "venture capital investment artificial intelligence",
 *   "AI company valuations technology sector"]
 */
async function expandQuery(query: string): Promise<string[]> {
  try {
    const result = await chatCompletionJSON<{ queries: string[] }>(
      [
        {
          role: 'system',
          content:
            'You are a search query expansion system. Given a user question, ' +
            'return 2–3 semantically distinct search queries that together cover ' +
            'the topic comprehensively. Each query should be 5–15 words. ' +
            'Return JSON only: { "queries": ["...", "..."] }',
        },
        {
          role: 'user',
          content: `Original question: "${query}"\n\nReturn 2–3 expanded search queries.`,
        },
      ],
      { temperature: 0.4, maxTokens: 200 },
    );
    const expanded = result?.queries ?? [];
    // Always include the original query
    const allQueries = [query, ...expanded].slice(0, 4);
    return [...new Set(allQueries)]; // deduplicate
  } catch {
    return [query]; // fallback: just use original
  }
}

// ─── Step 2: Global Retrieval ─────────────────────────────────────────────────

/**
 * Run match_global_knowledge for each expanded query and merge results.
 * Deduplicates by chunk ID, keeps highest similarity per chunk.
 */
async function retrieveGlobalChunks(
  queries:   string[],
  userId:    string,
  topK:      number = MAX_CHUNKS,
  threshold: number = SIMILARITY_THRESH,
): Promise<KBRetrievedChunk[]> {
  const chunkMap = new Map<string, KBRetrievedChunk>(); // chunkId → best result

  for (const query of queries) {
    let embedding: number[];
    try {
      embedding = await createEmbedding(query);
    } catch {
      continue; // skip this sub-query if embedding fails
    }

    const { data, error } = await supabase.rpc('match_global_knowledge', {
      query_embedding:  embedding,
      p_user_id:        userId,
      match_count:      Math.ceil(topK / queries.length) + 4,
      match_threshold:  threshold,
      p_report_ids:     null,
    });

    if (error || !data) continue;

    for (const row of data as any[]) {
      const key = `${row.report_id}:${row.chunk_id}`;
      const existing = chunkMap.get(key);
      const sim = Number(row.similarity);
      if (!existing || sim > existing.similarity) {
        chunkMap.set(key, {
          id:          row.id          as string,
          reportId:    row.report_id   as string,
          reportTitle: row.report_title as string,
          chunkId:     row.chunk_id    as string,
          chunkType:   row.chunk_type  as string,
          content:     row.content     as string,
          metadata:    (row.metadata   as Record<string, unknown>) ?? {},
          similarity:  sim,
        });
      }
    }
  }

  // Sort by similarity desc, return top K
  return Array.from(chunkMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ─── Step 3: Build Source Report Attribution ──────────────────────────────────

function buildSourceReports(chunks: KBRetrievedChunk[]): KBSourceReport[] {
  const reportMap = new Map<string, {
    reportId:    string;
    reportTitle: string;
    topSim:      number;
    chunkCount:  number;
    chunkTypes:  Set<string>;
  }>();

  for (const chunk of chunks) {
    const existing = reportMap.get(chunk.reportId);
    if (existing) {
      existing.chunkCount++;
      if (chunk.similarity > existing.topSim) existing.topSim = chunk.similarity;
      existing.chunkTypes.add(chunk.chunkType);
    } else {
      reportMap.set(chunk.reportId, {
        reportId:    chunk.reportId,
        reportTitle: chunk.reportTitle,
        topSim:      chunk.similarity,
        chunkCount:  1,
        chunkTypes:  new Set([chunk.chunkType]),
      });
    }
  }

  return Array.from(reportMap.values())
    .sort((a, b) => b.topSim - a.topSim)
    .map(r => ({
      reportId:      r.reportId,
      reportTitle:   r.reportTitle,
      topSimilarity: r.topSim,
      chunkCount:    r.chunkCount,
      chunkTypes:    Array.from(r.chunkTypes),
    }));
}

// ─── Step 4: Build LLM Context ────────────────────────────────────────────────

function buildContext(chunks: KBRetrievedChunk[]): string {
  if (chunks.length === 0) return '';

  // Group chunks by report
  const byReport = new Map<string, { title: string; chunks: KBRetrievedChunk[] }>();
  for (const chunk of chunks) {
    const existing = byReport.get(chunk.reportId);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      byReport.set(chunk.reportId, { title: chunk.reportTitle, chunks: [chunk] });
    }
  }

  const sections: string[] = [];
  let totalChars = 0;

  for (const [, { title, chunks: rChunks }] of byReport) {
    const header = `📄 FROM REPORT: "${title}"`;
    const body = rChunks
      .map(c => {
        const label = c.chunkType.charAt(0).toUpperCase() + c.chunkType.slice(1);
        const pct   = Math.round(c.similarity * 100);
        return `[${label} · ${pct}% match]\n${c.content}`;
      })
      .join('\n\n');

    const section = `${header}\n${'─'.repeat(50)}\n${body}`;
    totalChars += section.length;
    if (totalChars > MAX_CONTEXT_CHARS) break;
    sections.push(section);
  }

  return sections.join('\n\n' + '═'.repeat(60) + '\n\n');
}

// ─── Step 5: Build System Prompt ──────────────────────────────────────────────

function buildSystemPrompt(
  sourceReports: KBSourceReport[],
  contextText:   string,
  reportCount:   number,
): string {
  const reportList = sourceReports
    .map((r, i) => `  ${i + 1}. "${r.reportTitle}" (${r.chunkCount} relevant section${r.chunkCount !== 1 ? 's' : ''})`)
    .join('\n');

  return `You are DeepDive AI's Personal Knowledge Base assistant — a "second brain" that has read and synthesized ALL of the user's research reports.

KNOWLEDGE BASE CONTEXT:
You have access to content from ${sourceReports.length} of the user's research report${sourceReports.length !== 1 ? 's' : ''} (out of ${reportCount} total in their library).

CONTRIBUTING REPORTS:
${reportList || '  (no specific reports matched — answering from general knowledge)'}

RETRIEVED CONTENT:
${contextText || '(No relevant content retrieved — please note that to the user.)'}

YOUR ROLE:
- You are answering questions about the USER'S OWN research history, not general knowledge
- Always cite WHICH report a piece of information comes from: "According to your research on [Report Title], ..."
- If multiple reports say similar things, note the pattern: "Across several reports, you've found that..."
- If reports contradict each other, highlight the tension: "Your research on X suggests Y, but your later research on Z found..."
- Be honest about gaps: "Your knowledge base doesn't have research on X, but based on related reports..."

ANSWER STYLE:
- Conversational but precise — this is a personal AI assistant
- Always attribute findings to specific reports
- Use "your research", "you found", "you noted" — make it personal
- End with 1–2 actionable follow-up research suggestions when relevant
- Do NOT make up statistics or claims not in the retrieved content`;
}

// ─── Main Agent Function ──────────────────────────────────────────────────────

/**
 * Run the Knowledge Base agent for one conversational turn.
 *
 * @param userQuery         The user's natural language question
 * @param userId            For RLS and retrieval scoping
 * @param totalReportCount  Total reports in the user's library (for context)
 * @param conversationHistory Previous messages in this session (last 10)
 */
export async function runKnowledgeBaseAgent(
  userQuery:           string,
  userId:              string,
  totalReportCount:    number,
  conversationHistory: Pick<KBMessage, 'role' | 'content'>[],
): Promise<KBAgentResponse> {

  // ── 1. Query expansion ─────────────────────────────────────────────────────
  const expandedQueries = await expandQuery(userQuery);

  // ── 2. Global retrieval ────────────────────────────────────────────────────
  const chunks = await retrieveGlobalChunks(expandedQueries, userId);

  // ── 3. Attribution ─────────────────────────────────────────────────────────
  const sourceReports = buildSourceReports(chunks);

  // ── 4. Context ─────────────────────────────────────────────────────────────
  const contextText = buildContext(chunks);

  // ── 5. System prompt ───────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(sourceReports, contextText, totalReportCount);

  // ── 6. Conversation history ────────────────────────────────────────────────
  const historyMsgs: ChatMessage[] = conversationHistory
    .slice(-10)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── 7. LLM call ────────────────────────────────────────────────────────────
  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: userQuery },
    ],
    { temperature: 0.45, maxTokens: 1200 },
  );

  // ── 8. Confidence ──────────────────────────────────────────────────────────
  const avgSim = chunks.length > 0
    ? chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length
    : 0;
  const confidence: 'high' | 'medium' | 'low' =
    chunks.length >= 5 && avgSim >= 0.45 ? 'high'
    : chunks.length >= 2                  ? 'medium'
    : 'low';

  return {
    content,
    sourceReports,
    retrievedChunks: chunks,
    totalChunks:     chunks.length,
    reportsCount:    sourceReports.length,
    confidence,
    queryExpansion:  expandedQueries,
  };
}

// ─── Auto Session Title Generator ────────────────────────────────────────────

/**
 * Generate a concise 3–5 word session title from the user's first message.
 * Used to auto-name sessions after the first exchange.
 * Falls back to 'New Chat' on any error.
 *
 * Examples:
 *   "What have I researched about AI startups?" → "AI Startup Research"
 *   "Compare my findings on climate tech"       → "Climate Tech Comparison"
 */
export async function generateSessionTitle(firstMessage: string): Promise<string> {
  try {
    const result = await chatCompletionJSON<{ title: string }>(
      [
        {
          role:    'system',
          content: 'You generate ultra-short chat session titles. ' +
                   'Given a user message, return a 2–4 word title that captures the topic. ' +
                   'Title case. No punctuation. No quotes. ' +
                   'Return JSON only: { "title": "..." }',
        },
        {
          role:    'user',
          content: `Message: "${firstMessage.slice(0, 200)}"`,
        },
      ],
      { temperature: 0.3, maxTokens: 30 },
    );
    const title = (result?.title ?? '').trim();
    // Validate: must be non-empty and under 80 chars
    if (title && title.length > 1 && title.length <= 80) return title;
    return 'New Chat';
  } catch {
    return 'New Chat';
  }
}