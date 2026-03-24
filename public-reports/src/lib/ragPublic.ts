// src/lib/ragPublic.ts
// Public-Reports — RAG pipeline for public visitors
//
// Mirrors the logic from the React Native app's ragService.ts + vectorStore.ts
// but adapted for the server-side Next.js environment:
//   - No user auth required — uses share_id to scope embeddings
//   - Uses the server-side Supabase client (service role)
//   - Uses OpenAI node SDK (not fetch directly)
//   - Falls back to keyword context if embeddings don't exist

import OpenAI                  from 'openai';
import { supabaseServer }      from './supabase-server';
import type { PublicReport }   from '@/types/report';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM   = 1536;
const CHAT_MODEL      = 'gpt-4o-mini'; // cost-effective for public chat

// ─── Embed query ──────────────────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model:      EMBEDDING_MODEL,
      input:      text.trim().slice(0, 8000),
      dimensions: EMBEDDING_DIM,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.warn('[RAGPublic] Embedding failed:', err);
    return null;
  }
}

// ─── Retrieve relevant chunks via pgvector ────────────────────────────────────

interface RetrievedChunk {
  chunkId:    string;
  chunkType:  string;
  content:    string;
  similarity: number;
}

async function retrieveChunks(
  query:    string,
  shareId:  string,
  topK:     number = 5
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  if (!embedding) return [];

  const { data, error } = await supabaseServer.rpc(
    'match_report_chunks_public',
    {
      query_embedding: embedding,
      p_share_id:      shareId,
      match_count:     topK,
      match_threshold: 0.25,
    }
  );

  if (error || !data) {
    console.warn('[RAGPublic] match_report_chunks_public error:', error?.message);
    return [];
  }

  return (data as any[]).map(row => ({
    chunkId:   row.chunk_id   as string,
    chunkType: row.chunk_type as string,
    content:   row.content    as string,
    similarity: Number(row.similarity),
  }));
}

// ─── Keyword fallback context ────────────────────────────────────────────────

function buildFallbackContext(report: PublicReport, query: string): string {
  const q      = query.toLowerCase();
  const parts: string[] = [];

  if (report.executiveSummary?.trim()) {
    parts.push(`EXECUTIVE SUMMARY:\n${report.executiveSummary.trim().slice(0, 800)}`);
  }

  if (report.keyFindings?.length > 0) {
    parts.push(
      `KEY FINDINGS:\n${report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    );
  }

  if (report.sections?.length > 0) {
    const matched = report.sections.filter(s =>
      (s.title ?? '').toLowerCase().includes(q) ||
      (s.content ?? '').toLowerCase().includes(q.split(' ')[0])
    );
    const toInclude = matched.length > 0 ? matched.slice(0, 2) : report.sections.slice(0, 2);
    toInclude.forEach(s => {
      parts.push(`SECTION "${s.title}":\n${(s.content ?? '').slice(0, 600)}`);
    });
  }

  const wantsStats   = /statistic|data|number|percent|%|figure|market|growth/.test(q);
  if (wantsStats && report.statistics?.length > 0) {
    parts.push(
      `STATISTICS:\n${report.statistics.slice(0, 8).map(s => `• ${s.value}: ${s.context}`).join('\n')}`
    );
  }

  const wantsFuture  = /future|predict|forecast|trend|next|upcoming|2025|2026|2030/.test(q);
  if (wantsFuture && report.futurePredictions?.length > 0) {
    parts.push(
      `FUTURE PREDICTIONS:\n${report.futurePredictions.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    );
  }

  return parts.join('\n\n' + '─'.repeat(40) + '\n\n');
}

// ─── Main: getPublicAnswer ────────────────────────────────────────────────────

export interface PublicAnswerOptions {
  shareId:  string;
  question: string;
  report:   PublicReport;
  history:  { role: 'user' | 'assistant'; content: string }[];
}

export interface PublicAnswer {
  answer:     string;
  usedRAG:    boolean;
  chunkCount: number;
}

export async function getPublicAnswer(
  opts: PublicAnswerOptions
): Promise<PublicAnswer> {
  const { shareId, question, report, history } = opts;

  // Step 1: Try vector retrieval
  const chunks   = await retrieveChunks(question, shareId, 5);
  const usedRAG  = chunks.length > 0;

  // Step 2: Build context
  let contextText: string;
  if (usedRAG) {
    const sorted = [...chunks].sort((a, b) => b.similarity - a.similarity);
    contextText  = sorted
      .map((c, i) => `[SOURCE ${i + 1} — ${c.chunkType} · ${Math.round(c.similarity * 100)}% match]\n${c.content}`)
      .join('\n\n---\n\n');
  } else {
    contextText = buildFallbackContext(report, question);
  }

  // Step 3: Build messages
  const systemPrompt = `You are an expert research assistant helping visitors understand a research report.

REPORT TITLE: ${report.title}
RESEARCH QUERY: ${report.query}

RELEVANT CONTEXT FROM THE REPORT:
${contextText}

INSTRUCTIONS:
- Answer based ONLY on the information in the report context above
- Be concise and informative (2–4 paragraphs max)
- If the answer isn't in the report, say so honestly — don't make things up
- Use specific statistics and facts from the context when available
- Format your response in plain text — no markdown headers, no bullet lists
- You are representing this report to a curious visitor — be welcoming and clear`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    // Include recent history (last 4 messages)
    ...history.slice(-4).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: question },
  ];

  // Step 4: Call OpenAI
  const completion = await openai.chat.completions.create({
    model:       CHAT_MODEL,
    messages,
    max_tokens:  600,
    temperature: 0.3,
  });

  const answer = completion.choices[0]?.message?.content?.trim()
    ?? 'I couldn\'t generate an answer. Please try again.';

  return {
    answer,
    usedRAG,
    chunkCount: chunks.length,
  };
}