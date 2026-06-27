// src/services/knowledgeBaseAgent.ts
// Part 26 — Personal AI Knowledge Base Agent (cross-report RAG).
// Part 56 — Cost routing:
//   • expandQuery       → NANO  (1 query → 2-3 sub-queries; mechanical)
//   • main chat answer  → STANDARD (synthesis with multi-report citations)
//   • generateSessionTitle → NANO (2-4 word title)

import { supabase }            from '../lib/supabase';
import { chatCompletion, chatCompletionJSON, ChatMessage } from './openaiClient';
import { createEmbedding }     from './embeddingService';
import { modelFor }            from '../constants/aiModels';
import {
  KBAgentResponse,
  KBRetrievedChunk,
  KBSourceReport,
  KBMessage,
}                              from '../types/knowledgeBase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHUNKS        = 14;
const SIMILARITY_THRESH = 0.26;
const MAX_CONTEXT_CHARS = 6000;

// ─── Step 1: Query Expansion (NANO) ───────────────────────────────────────────

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
      { temperature: 0.4, maxTokens: 200, model: modelFor('queryExpansion') }, // ← Part 56 NANO
    );
    const expanded = result?.queries ?? [];
    const allQueries = [query, ...expanded].slice(0, 4);
    return [...new Set(allQueries)];
  } catch {
    return [query];
  }
}

// ─── Step 2: Global Retrieval ─────────────────────────────────────────────────

async function retrieveGlobalChunks(
  queries:   string[],
  userId:    string,
  topK:      number = MAX_CHUNKS,
  threshold: number = SIMILARITY_THRESH,
): Promise<KBRetrievedChunk[]> {
  const chunkMap = new Map<string, KBRetrievedChunk>();

  for (const query of queries) {
    let embedding: number[];
    try {
      embedding = await createEmbedding(query);
    } catch {
      continue;
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

export async function runKnowledgeBaseAgent(
  userQuery:           string,
  userId:              string,
  totalReportCount:    number,
  conversationHistory: Pick<KBMessage, 'role' | 'content'>[],
): Promise<KBAgentResponse> {

  const expandedQueries = await expandQuery(userQuery);
  const chunks = await retrieveGlobalChunks(expandedQueries, userId);
  const sourceReports = buildSourceReports(chunks);
  const contextText = buildContext(chunks);
  const systemPrompt = buildSystemPrompt(sourceReports, contextText, totalReportCount);

  const historyMsgs: ChatMessage[] = conversationHistory
    .slice(-10)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: userQuery },
    ],
    { temperature: 0.45, maxTokens: 1200, model: modelFor('knowledgeBaseChat') }, // ← Part 56 STANDARD
  );

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

// ─── Auto Session Title Generator (NANO) ──────────────────────────────────────

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
      { temperature: 0.3, maxTokens: 30, model: modelFor('sessionTitle') }, // ← Part 56 NANO
    );
    const title = (result?.title ?? '').trim();
    if (title && title.length > 1 && title.length <= 80) return title;
    return 'New Chat';
  } catch {
    return 'New Chat';
  }
}