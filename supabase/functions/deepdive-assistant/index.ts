// supabase/functions/deepdive-assistant/index.ts
//
// Part 50.6 — Personal AI Assistant endpoint for Team Chat
// Part 56  — Cost reduction: GPT_MODEL moved from 'gpt-4o-mini' to 'gpt-4.1-nano'
//            (cheaper $0.10/$0.40 and newer). Keep in sync with EDGE_CHAT_MODEL
//            in src/constants/aiModels.ts. Mirrors the deepdive-bot change so the
//            two endpoints stay identical.
//
// Part 59  — SECURE SERVER-SIDE API KEYS
//            The OpenAI key comes from getApiKey('openai') — the encrypted
//            app_api_keys vault, with the OPENAI_API_KEY env secret as a
//            fallback. Rotating in the admin dashboard now updates this
//            function too, with no redeploy.
//
// This is the SAME AI as the @deepdive team-chat bot (deepdive-bot), exposed as
// a direct request/response endpoint for the per-member "Ask DeepDive AI" screen:
//
//   • No @deepdive / /ai trigger needed — every message is a direct question.
//   • Returns the answer as JSON instead of posting it to a Stream channel.
//   • Scoped to ONE workspace's shared research reports (identical RAG).
//   • Authenticated: only members of the workspace may query it.
//
// The research RAG logic + system prompts are copied VERBATIM from deepdive-bot
// so the answers are identical to what the team-chat bot produces. The only
// difference: a "summarize/recap the chat" style question is answered from the
// caller's PERSONAL conversation history (passed in the request body) instead of
// the team chat — because this screen is a private 1:1 conversation with the AI.
//
// Deploy:
//   supabase functions deploy deepdive-assistant --no-verify-jwt
// (We verify the user's JWT + workspace membership manually inside the handler.)

import { createClient } from 'npm:@supabase/supabase-js@2';
// Part 59: resolves the OpenAI key from the encrypted vault, with an env fallback.
import { getApiKey }    from '../_shared/keyStore.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMBEDDING_MODEL   = 'text-embedding-3-small';
const EMBEDDING_DIM     = 1536;
const MATCH_COUNT       = 8;     // identical to deepdive-bot
const MATCH_THRESHOLD   = 0.22;  // identical to deepdive-bot
const MAX_CONTEXT_CHARS = 8000;  // identical to deepdive-bot
const MAX_HISTORY_TURNS = 6;     // recent personal turns sent for follow-up context
const OPENAI_CHAT_URL   = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBED_URL  = 'https://api.openai.com/v1/embeddings';
// Part 56: nano tier — cheaper ($0.10/$0.40) and newer than gpt-4o-mini.
// Keep in sync with EDGE_CHAT_MODEL in src/constants/aiModels.ts.
const GPT_MODEL         = 'gpt-4.1-nano';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RAGChunk {
  content:     string;
  chunkType:   string;
  similarity:  number;
  reportTitle: string;
  reportId:    string;
}

interface HistoryTurn {
  role:    'user' | 'assistant';
  content: string;
}

interface AssistantResult {
  answer:      string;
  sources:     { reportId: string; reportTitle: string }[];
  reportCount: number;
  mode:        'research' | 'conversation' | 'none';
  error?:      string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: AssistantResult, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const fail = (msg: string, status = 200): Response =>
    json({ answer: msg, sources: [], reportCount: 0, mode: 'none', error: msg }, status);

  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
    const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── 1. Authenticate the caller ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return json(
        { answer: 'You must be signed in to use the assistant.', sources: [], reportCount: 0, mode: 'none', error: 'no_auth' },
        401,
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return json(
        { answer: 'Your session has expired. Please sign in again.', sources: [], reportCount: 0, mode: 'none', error: 'invalid_jwt' },
        401,
      );
    }

    // ── 1b. Part 59: resolve the OpenAI key AFTER authenticating ────────────
    // Order matters. Looking up the key first would let an unauthenticated
    // request cost us a vault read and a decrypt on every probe.
    let openaiKey: string;
    try {
      openaiKey = await getApiKey('openai');
    } catch (keyErr) {
      console.error('[assistant] No OpenAI key available:', keyErr);
      return json(
        {
          answer:      'The assistant is temporarily unavailable. Please try again later.',
          sources:     [],
          reportCount: 0,
          mode:        'none',
          error:       'provider_not_configured',
        },
        503,
      );
    }

    // ── 2. Parse body ───────────────────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return fail('Invalid request body.', 400);
    }

    const workspaceId = (body?.workspaceId ?? '').toString().trim();
    let   query       = (body?.query ?? '').toString().trim();
    const history: HistoryTurn[] = Array.isArray(body?.history)
      ? body.history
          .filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string')
          .map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 2000) }))
          .slice(-MAX_HISTORY_TURNS)
      : [];

    if (!workspaceId) return fail('No workspace specified.', 400);
    if (!query)       query = 'Give me a summary of the most relevant research shared in this workspace.';

    // ── 3. Authorize: caller must be a member of the workspace ──────────────
    const service = createClient(supabaseUrl, serviceKey);

    const { data: memberRow, error: memberErr } = await service
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberErr) {
      console.error('[assistant] membership check error:', memberErr.message);
    }
    if (!memberRow) {
      return json(
        { answer: 'You are not a member of this workspace.', sources: [], reportCount: 0, mode: 'none', error: 'not_member' },
        403,
      );
    }

    // ── 4. Branch: conversation question vs research question ───────────────
    const isChatQ = detectChatQuestion(query);
    console.log(`[assistant] user=${user.id} ws=${workspaceId} isChat=${isChatQ} q="${query.slice(0, 80)}"`);

    // BRANCH A — "summarize / recap our chat" → answer from the PERSONAL history
    if (isChatQ && history.length > 0) {
      const answer = await answerFromConversation(query, history, openaiKey);
      return json({ answer, sources: [], reportCount: 0, mode: 'conversation' });
    }

    // BRANCH B — research question → RAG over this workspace's shared reports
    const workspaceReportIds = await getWorkspaceReportIds(service, workspaceId);
    console.log(`[assistant] workspaceReports=${workspaceReportIds.length}`);

    if (workspaceReportIds.length === 0) {
      return json({
        answer:
          'No research reports have been added to this workspace yet.\n\n' +
          'Owners and editors can add reports via the **Reports** tab. Once a report is added, ' +
          'I can answer questions about it here — privately, just for you.',
        sources:     [],
        reportCount: 0,
        mode:        'research',
      });
    }

    const embedding = await createEmbedding(query, openaiKey);
    const chunks    = await searchWorkspaceKnowledge(service, workspaceId, workspaceReportIds, embedding);

    // Dedupe + top results (identical to bot)
    const seen = new Set<string>();
    const top  = chunks
      .sort((a, b) => b.similarity - a.similarity)
      .filter((c) => {
        const k = c.content.slice(0, 80);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MATCH_COUNT);

    if (top.length === 0) {
      const answer = await answerWithNoContext(query, workspaceReportIds.length, openaiKey);
      return json({ answer, sources: [], reportCount: workspaceReportIds.length, mode: 'research' });
    }

    const researchCtx = buildResearchContext(top);
    let   answer      = await answerFromResearch(query, researchCtx, openaiKey, history);

    // Unique sources used
    const sourceMap = new Map<string, { reportId: string; reportTitle: string }>();
    for (const c of top) {
      const id = c.reportId || c.reportTitle;
      if (id && !sourceMap.has(id)) {
        sourceMap.set(id, { reportId: c.reportId, reportTitle: c.reportTitle || 'Workspace Report' });
      }
    }
    const sources = [...sourceMap.values()];

    answer =
      `*(from ${sources.length} workspace report${sources.length !== 1 ? 's' : ''} · ${workspaceReportIds.length} total in workspace)*\n\n` +
      answer;

    return json({ answer, sources, reportCount: workspaceReportIds.length, mode: 'research' });

  } catch (err) {
    console.error('[assistant] fatal:', err);
    return fail('Sorry, I hit an error answering that. Please try again.', 200);
  }
});

// ─── Answer functions (verbatim from deepdive-bot) ────────────────────────────

// Pure research prompt — no chat context, no confusion. `history` is added only
// as prior turns for follow-up continuity; for a standalone first question it is
// empty, making the answer identical to the team-chat bot.
async function answerFromResearch(
  query:       string,
  researchCtx: string,
  openaiKey:   string,
  history:     HistoryTurn[],
): Promise<string> {
  const sys = `You are DeepDive AI, an expert research assistant in a team workspace.

You have been given relevant excerpts from research reports shared in this workspace. Use them to answer the user's question accurately and concisely.

RESEARCH CONTEXT:
${researchCtx}

INSTRUCTIONS:
- Answer directly and specifically using the research context above.
- Cite which report each fact comes from: e.g. From "Report Title": ...
- Use bullet points for multiple facts or findings.
- Be specific — include numbers, statistics, and named entities from the research.
- Keep the answer focused: 3-6 sentences or 4-6 bullet points.
- Do NOT say the content "wasn't shared" or "not in the chat" — the research context above IS the content.
- Do NOT make up facts not present in the context.`;

  const priorTurns = history.map((h) => ({
    role:    h.role === 'assistant' ? 'assistant' : 'user',
    content: stripMeta(h.content),
  }));

  const gptRes = await fetch(OPENAI_CHAT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model:       GPT_MODEL,
      max_tokens:  600,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        ...priorTurns,
        { role: 'user',   content: query },
      ],
    }),
  });
  const data: any = await gptRes.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return data.choices?.[0]?.message?.content?.trim() ?? "Couldn't generate a response.";
}

async function answerWithNoContext(
  query:       string,
  reportCount: number,
  openaiKey:   string,
): Promise<string> {
  const sys = `You are DeepDive AI in a team workspace with ${reportCount} research report${reportCount !== 1 ? 's' : ''}.

No relevant sections from the workspace research matched the query with sufficient similarity. Respond in 2 sentences:
1. Acknowledge you couldn't find specific information on this topic in the workspace reports.
2. Suggest the user either ask a more specific question, or check if a report on this topic has been added to the workspace.

Do NOT say content "wasn't shared in the chat" — the reports exist, just no matching sections were found.`;

  const gptRes = await fetch(OPENAI_CHAT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model:       GPT_MODEL,
      max_tokens:  150,
      temperature: 0.3,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: query },
      ],
    }),
  });
  const data: any = await gptRes.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return `*(no matching sections found in ${reportCount} workspace reports)*\n\n` +
    (data.choices?.[0]?.message?.content?.trim() ?? 'No relevant research found for this query.');
}

// Personal-chat summary: answer from the caller's own conversation with the AI.
async function answerFromConversation(
  query:     string,
  history:   HistoryTurn[],
  openaiKey: string,
): Promise<string> {
  const transcript = history
    .map((h) => `${h.role === 'user' ? 'User' : 'DeepDive AI'}: ${stripMeta(h.content)}`)
    .join('\n');

  const sys = `You are DeepDive AI, a helpful assistant in a private 1:1 chat with a workspace member.

Recent conversation between you and the user:
${transcript}

Answer the user's question about this conversation. Be concise (under 180 words). Do not invent messages that aren't shown above.`;

  const gptRes = await fetch(OPENAI_CHAT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model:       GPT_MODEL,
      max_tokens:  400,
      temperature: 0.4,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: query },
      ],
    }),
  });
  const data: any = await gptRes.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return data.choices?.[0]?.message?.content?.trim() ?? "Couldn't summarize the conversation.";
}

// ─── Chat-question detection (verbatim from deepdive-bot) ─────────────────────

const CHAT_PATTERNS = [
  /\b(summarize|summary|recap|overview)\b.*\b(chat|message|conversation|discussion|talk)\b/i,
  /\b(chat|message|conversation|discussion|talk)\b.*\b(summarize|summary|recap|overview)\b/i,
  /\b(last|past|recent|yesterday|today|this week|2 days|24 hours|48 hours)\b.*\b(message|chat|said|discussed|talked|conversation)\b/i,
  /\b(what|who|when)\b.*\b(said|mentioned|wrote|discussed|talked about)\b/i,
  /\bwhat (was|were|has been) (discussed|said|talked about|mentioned)\b/i,
  /\bwho (said|mentioned|brought up|talked about)\b/i,
  /\bwhat happened (in|on|during)\b/i,
  /\bsummarize (the )?(last|recent|past|this)\b/i,
  /\brecap\b/i,
  /\bwhat did .+ say\b/i,
  /\bchat (history|log|summary)\b/i,
  /\b(our|this) conversation\b/i,
];

function detectChatQuestion(query: string): boolean {
  return CHAT_PATTERNS.some((p) => p.test(query));
}

// ─── Workspace report IDs (verbatim from deepdive-bot) ────────────────────────

async function getWorkspaceReportIds(supabase: any, workspaceId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('workspace_reports')
      .select('report_id')
      .eq('workspace_id', workspaceId);
    if (error) { console.error('[assistant] workspace_reports error:', error.message); return []; }
    return (data ?? []).map((r: any) => r.report_id as string).filter(Boolean);
  } catch (err) {
    console.warn('[assistant] getWorkspaceReportIds failed:', err);
    return [];
  }
}

// ─── RAG search (verbatim from deepdive-bot) ──────────────────────────────────

async function searchWorkspaceKnowledge(
  supabase:           any,
  workspaceId:        string,
  workspaceReportIds: string[],
  embedding:          number[],
): Promise<RAGChunk[]> {
  const chunks: RAGChunk[] = [];

  // Primary: match_workspace_knowledge RPC (schema_part50_5.sql)
  try {
    const { data, error } = await supabase.rpc('match_workspace_knowledge', {
      p_workspace_id:  workspaceId,
      query_embedding: embedding,
      match_count:     MATCH_COUNT + 4,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      console.warn('[assistant] match_workspace_knowledge error:', error.message);
    } else if (Array.isArray(data) && data.length > 0) {
      for (const r of data) {
        chunks.push({
          content:     r.content      ?? '',
          chunkType:   r.chunk_type   ?? 'text',
          similarity:  Number(r.similarity ?? 0),
          reportTitle: r.report_title ?? 'Workspace Report',
          reportId:    r.report_id    ?? '',
        });
      }
      return chunks;
    }
  } catch (e) {
    console.warn('[assistant] Primary RPC exception:', e);
  }

  // Fallback: direct report_embeddings query + client-side cosine similarity
  const BATCH = 20;
  for (let i = 0; i < workspaceReportIds.length; i += BATCH) {
    const batchIds = workspaceReportIds.slice(i, i + BATCH);
    try {
      const { data, error } = await supabase
        .from('report_embeddings')
        .select('id, report_id, chunk_type, content, embedding')
        .in('report_id', batchIds);

      if (error) { console.warn('[assistant] Fallback error:', error.message); continue; }
      if (!Array.isArray(data) || data.length === 0) continue;

      for (const row of data) {
        let embArr: number[];
        try {
          embArr = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
        } catch { continue; }

        const sim = cosineSimilarity(embedding, embArr);
        if (sim < MATCH_THRESHOLD) continue;
        chunks.push({
          content:     row.content    ?? '',
          chunkType:   row.chunk_type ?? 'text',
          similarity:  sim,
          reportTitle: 'Workspace Report',
          reportId:    row.report_id  ?? '',
        });
      }
    } catch (e) {
      console.warn('[assistant] Fallback batch exception:', e);
    }
  }

  // Enrich report titles
  if (chunks.length > 0) {
    try {
      const ids = [...new Set(chunks.map((c) => c.reportId).filter(Boolean))];
      const { data: reportRows } = await supabase
        .from('research_reports')
        .select('id, title, query')
        .in('id', ids);
      if (Array.isArray(reportRows)) {
        const titleMap: Record<string, string> = {};
        for (const r of reportRows) titleMap[r.id] = r.title || r.query || 'Workspace Report';
        for (const c of chunks) { if (c.reportId && titleMap[c.reportId]) c.reportTitle = titleMap[c.reportId]; }
      }
    } catch { /**/ }
  }

  return chunks;
}

// ─── Context builder (verbatim from deepdive-bot) ─────────────────────────────

function buildResearchContext(chunks: RAGChunk[]): string {
  if (chunks.length === 0) return '';
  const by = new Map<string, RAGChunk[]>();
  for (const c of chunks) {
    const k = c.reportTitle || 'Workspace Report';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  const parts: string[] = [];
  let total = 0;
  for (const [title, cs] of by) {
    const block = `📄 Report: "${title}"\n${cs
      .map((c) => `[${c.chunkType} — ${Math.round(c.similarity * 100)}% match]\n${c.content}`)
      .join('\n\n')}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    total += block.length;
    parts.push(block);
  }
  return parts.join('\n\n---\n\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripMeta(content: string): string {
  // remove a leading "*(from N workspace reports …)*" caption line
  return content.replace(/^\*\([^)]*\)\*\s*/, '').trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

async function createEmbedding(text: string, key: string): Promise<number[]> {
  const res = await fetch(OPENAI_EMBED_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.trim().slice(0, 8000), dimensions: EMBEDDING_DIM }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data?.[0]?.embedding ?? (() => { throw new Error('No embedding returned'); })();
}