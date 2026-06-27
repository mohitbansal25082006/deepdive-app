// supabase/functions/deepdive-bot/index.ts
//
// Part 50.5 — FIXED (image bug fix patch)
// Part 56  — Cost reduction: GPT_MODEL moved from 'gpt-4o-mini' to 'gpt-4.1-nano'
//            (cheaper $0.10/$0.40 and newer). Keep in sync with EDGE_CHAT_MODEL
//            in src/constants/aiModels.ts. All chat answers here are short
//            RAG/summary responses, which is exactly the nano tier's sweet spot.
//
// BUGS FIXED IN THE 50.5 PATCH (unchanged):
//
//   BUG 1: System prompt confused GPT into thinking report content needs to be
//          "in the chat". The old prompt said "answer ONLY using context above"
//          but then injected chat history right below it — GPT saw chat messages
//          with no quantum content and said "wasn't shared in chat".
//          FIX: Separate prompts. Research questions get ONLY research context.
//               Chat questions get ONLY chat context. Never mix them.
//
//   BUG 2: MAX_CONTEXT_CHARS = 3000 was too small. 2 quantum reports × 6 chunks
//          × ~400 chars = ~4800 chars, so the context was being cut off mid-way.
//          FIX: Increased to 8000 chars (fits ~12 full chunks comfortably).
//
//   BUG 3: MATCH_THRESHOLD = 0.28 was too high for some valid chunks.
//          MATCH_COUNT = 6 was too few for multi-report questions.
//          FIX: Threshold lowered to 0.22, count raised to 8.
//
//   BUG 4: Chat context was being injected into research question prompts,
//          actively confusing GPT when chat messages said nothing about the topic.
//          FIX: Chat context is ONLY added to chat-question prompts, never research.
//
// ARCHITECTURE (unchanged):
//   Stream gives webhooks exactly 5 seconds to respond with 200.
//   1. Read raw body bytes immediately (~1ms)
//   2. Return 200 immediately
//   3. Do ALL processing inside EdgeRuntime.waitUntil()

import { createClient } from 'npm:@supabase/supabase-js@2';
import { StreamChat }   from 'npm:stream-chat@8';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, content-encoding',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_USER_ID       = 'deepdive-bot';
const MENTION_REGEX     = /@deepdive\b/i;
const COMMAND_REGEX     = /^\/ai\b/i;
const EMBEDDING_MODEL   = 'text-embedding-3-small';
const EMBEDDING_DIM     = 1536;
const MATCH_COUNT       = 8;     // FIX: was 6, raised to catch more relevant chunks
const MATCH_THRESHOLD   = 0.22;  // FIX: was 0.28, lowered for better recall
const MAX_CONTEXT_CHARS = 8000;  // FIX: was 3000, raised to fit full report content
const MAX_CHAT_MESSAGES = 40;
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

interface ChatHistoryMessage {
  senderName: string;
  senderId:   string;
  text:       string;
  createdAt:  string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  let rawBytes: Uint8Array;
  try {
    rawBytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return new Response('{"error":"read_failed"}', {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    (EdgeRuntime as any).waitUntil(
      handleWebhook(rawBytes).catch((err) => console.error('[bot] fatal:', err)),
    );
  } catch {
    handleWebhook(rawBytes).catch((err) => console.error('[bot] fatal:', err));
  }

  return new Response('{"status":"ok"}', {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// ─── Webhook handler ──────────────────────────────────────────────────────────

async function handleWebhook(rawBytes: Uint8Array): Promise<void> {
  let payload: any;
  try {
    const isGzip = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
    const jsonText = isGzip ? await decompressGzip(rawBytes) : new TextDecoder().decode(rawBytes);
    payload = JSON.parse(jsonText);
  } catch (err) {
    console.error('[bot] Failed to parse body:', err);
    return;
  }

  if (payload?.type !== 'message.new') return;

  const msgText  = (payload.message?.text ?? '').trim();
  const senderId = payload.message?.user?.id ?? payload.user?.id ?? '';

  if (senderId === BOT_USER_ID) return;

  const mentioned       = (payload.message?.mentioned_users ?? []) as any[];
  const viaAutocomplete = mentioned.some(
    (u: any) => u.id === BOT_USER_ID || (u.name ?? '').toLowerCase().includes('deepdive'),
  );
  const viaText    = MENTION_REGEX.test(msgText);
  const viaCommand = COMMAND_REGEX.test(msgText);

  if (!viaAutocomplete && !viaText && !viaCommand) return;

  console.log(`[bot] Triggered | sender=${senderId} | text="${msgText.slice(0, 80)}"`);
  await processAndReply(payload, msgText, senderId);
}

// ─── Main processing ──────────────────────────────────────────────────────────

async function processAndReply(payload: any, msgText: string, senderId: string): Promise<void> {
  const apiKey          = Deno.env.get('STREAM_API_KEY')!;
  const apiSecret       = Deno.env.get('STREAM_API_SECRET')!;
  const openaiKey       = Deno.env.get('OPENAI_API_KEY')!;
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
  const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let query = msgText.replace(/@deepdive\b/gi, '').replace(/^\/ai\b/i, '').trim();
  if (!query) query = 'Give me a summary of the most relevant research shared in this workspace.';
  console.log(`[bot] Query: "${query}"`);

  const isChatQ = detectChatQuestion(query);
  console.log(`[bot] isChatQuestion=${isChatQ}`);

  const streamClient = new StreamChat(apiKey, apiSecret, { disableCache: true });
  const channelId    = payload.channel?.id ?? '';
  const channelType  = payload.channel?.type ?? 'messaging';
  const channel      = streamClient.channel(channelType, channelId);

  try { await channel.create(); } catch (e) { console.warn('[bot] channel.create warn:', e); }
  try { await channel.sendEvent({ type: 'typing.start', user_id: BOT_USER_ID } as any); } catch { /**/ }

  let botReply = '';

  try {
    const supabase = createClient(supabaseUrl, supabaseService);

    const workspaceId = channelId.startsWith('workspace-')
      ? channelId.slice('workspace-'.length)
      : '';

    if (!workspaceId) {
      await sendBotReply(channel, 'I can only answer questions in a DeepDive workspace channel.');
      return;
    }

    // ── BRANCH A: Chat question — fetch history, answer from it only ───────
    // FIX: Chat questions never touch RAG at all. Research questions never
    // see chat context. Keeping them separate prevents GPT confusion.
    if (isChatQ) {
      const chatHistory = await fetchChatHistory(channel, MAX_CHAT_MESSAGES);
      if (chatHistory.length === 0) {
        await sendBotReply(channel, "There aren't any recent messages in this chat to summarize yet.");
        return;
      }
      const answer = await answerFromChatHistory(query, chatHistory, openaiKey);
      botReply = `*(from chat history · ${chatHistory.length} messages)*\n\n${answer}`;
      try { await channel.sendEvent({ type: 'typing.stop', user_id: BOT_USER_ID } as any); } catch { /**/ }
      await sendBotReply(channel, botReply);
      return;
    }

    // ── BRANCH B: Research question — RAG only, no chat context ───────────

    // Step 1: Get workspace report IDs
    const workspaceReportIds = await getWorkspaceReportIds(supabase, workspaceId);
    console.log(`[bot] workspaceReports=${workspaceReportIds.length}`);

    if (workspaceReportIds.length === 0) {
      await sendBotReply(
        channel,
        `No research reports have been added to this workspace yet.\n\nOwners and editors can add reports via the **Reports** tab. Once added, I can answer questions about them.\n\n*(Tip: you can also ask me to summarize the team chat — try "@deepdive summarize recent chat")*`,
      );
      return;
    }

    // Step 2: Embed the query
    const embedding = await createEmbedding(query, openaiKey);

    // Step 3: Search workspace knowledge base
    const chunks = await searchWorkspaceKnowledge(supabase, workspaceId, workspaceReportIds, embedding);
    console.log(`[bot] ${chunks.length} raw chunks found`);

    // Step 4: Deduplicate + top results
    const seen = new Set<string>();
    const top  = chunks
      .sort((a, b) => b.similarity - a.similarity)
      .filter(c => {
        const k = c.content.slice(0, 80);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MATCH_COUNT);

    console.log(`[bot] ${top.length} deduped chunks after filter`);

    // Step 5: Build answer
    if (top.length === 0) {
      // No relevant chunks found even with lowered threshold
      botReply = await answerWithNoContext(query, workspaceReportIds.length, openaiKey);
    } else {
      // FIX: Research prompt — ONLY research context, zero chat injection
      const researchCtx = buildResearchContext(top);
      botReply = await answerFromResearch(query, researchCtx, openaiKey);

      const usedReports = new Set(top.map(c => c.reportTitle).filter(Boolean));
      botReply = `*(from ${usedReports.size} workspace report${usedReports.size !== 1 ? 's' : ''} · ${workspaceReportIds.length} total in workspace)*\n\n${botReply}`;
    }

    console.log(`[bot] Reply ready (${botReply.length} chars)`);

  } catch (err) {
    console.error('[bot] Processing error:', err);
    botReply = `Sorry, I hit an error searching the workspace knowledge base. Please try again.`;
  }

  try { await channel.sendEvent({ type: 'typing.stop', user_id: BOT_USER_ID } as any); } catch { /**/ }
  await sendBotReply(channel, botReply);
}

// ─── Answer functions ─────────────────────────────────────────────────────────

// FIX: Pure research prompt — no chat context, no confusion
async function answerFromResearch(
  query:      string,
  researchCtx: string,
  openaiKey:  string,
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

  const gptRes = await fetch(OPENAI_CHAT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model:       GPT_MODEL,
      max_tokens:  600,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: query },
      ],
    }),
  });
  const data: any = await gptRes.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return data.choices?.[0]?.message?.content?.trim() ?? "Couldn't generate a response.";
}

// When no RAG chunks match — tell user clearly without confusing language
async function answerWithNoContext(
  query:        string,
  reportCount:  number,
  openaiKey:    string,
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
    (data.choices?.[0]?.message?.content?.trim() ?? "No relevant research found for this query.");
}

// Pure chat history answer
async function answerFromChatHistory(
  query:     string,
  history:   ChatHistoryMessage[],
  openaiKey: string,
): Promise<string> {
  const chatCtx = buildChatContext(history);
  const sys = `You are DeepDive AI, a helpful assistant in a team workspace chat.

Recent chat history:
${chatCtx}

Answer the user's question about this conversation. Reference people by name when relevant. Be concise (under 200 words). Do not make up messages that aren't shown above.`;

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
  return data.choices?.[0]?.message?.content?.trim() ?? "Couldn't summarize the chat.";
}

// ─── Chat question detection ──────────────────────────────────────────────────

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
];

function detectChatQuestion(query: string): boolean {
  return CHAT_PATTERNS.some(p => p.test(query));
}

// ─── Fetch chat history from Stream ──────────────────────────────────────────

async function fetchChatHistory(channel: any, limit: number): Promise<ChatHistoryMessage[]> {
  try {
    const response = await channel.query({ messages: { limit } });
    const messages: any[] = response?.messages ?? [];
    return messages
      .filter((m: any) =>
        !m.deleted_at &&
        m.type !== 'deleted' &&
        m.user?.id !== BOT_USER_ID &&
        ((m.text ?? '').trim().length > 0 || (m.attachments ?? []).length > 0)
      )
      .map((m: any) => ({
        senderName: (m.user?.name as string) ?? 'Unknown',
        senderId:   (m.user?.id  as string) ?? '',
        text:       buildMessageText(m),
        createdAt:  (m.created_at as string) ?? '',
      }));
  } catch (err) {
    console.warn('[bot] fetchChatHistory failed:', err);
    return [];
  }
}

function buildMessageText(m: any): string {
  const parts: string[] = [];
  if ((m.text ?? '').trim()) parts.push(m.text.trim());
  const attachments: any[] = m.attachments ?? [];
  for (const att of attachments) {
    if (att.type === 'sticker') continue;
    const name = att.title ?? att.name ?? att.fallback ?? '';
    if (att.mime_type === 'image/gif' || att.type === 'image') parts.push(`[image${name ? `: ${name}` : ''}]`);
    else if (att.type === 'file') parts.push(`[file: ${name}]`);
    else if (att.type === 'audio') parts.push(`[audio]`);
    else if (att.type === 'video') parts.push(`[video]`);
  }
  return parts.join(' ') || '[message]';
}

// ─── Workspace report IDs ─────────────────────────────────────────────────────

async function getWorkspaceReportIds(supabase: any, workspaceId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('workspace_reports')
      .select('report_id')
      .eq('workspace_id', workspaceId);
    if (error) { console.error('[bot] workspace_reports error:', error.message); return []; }
    return (data ?? []).map((r: any) => r.report_id as string).filter(Boolean);
  } catch (err) {
    console.warn('[bot] getWorkspaceReportIds failed:', err);
    return [];
  }
}

// ─── RAG search ───────────────────────────────────────────────────────────────

async function searchWorkspaceKnowledge(
  supabase:           any,
  workspaceId:        string,
  workspaceReportIds: string[],
  embedding:          number[],
): Promise<RAGChunk[]> {
  const chunks: RAGChunk[] = [];

  // Primary: match_workspace_knowledge RPC (fixed in schema_part50_5.sql)
  try {
    const { data, error } = await supabase.rpc('match_workspace_knowledge', {
      p_workspace_id:  workspaceId,
      query_embedding: embedding,
      match_count:     MATCH_COUNT + 4,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      console.warn('[bot] match_workspace_knowledge error:', error.message);
    } else if (Array.isArray(data) && data.length > 0) {
      console.log(`[bot] Primary RPC returned ${data.length} chunks`);
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
    } else {
      console.log('[bot] Primary RPC returned 0 chunks — trying fallback');
    }
  } catch (e) {
    console.warn('[bot] Primary RPC exception:', e);
  }

  // Fallback: direct report_embeddings query with client-side cosine similarity
  console.log('[bot] Using fallback: direct report_embeddings query');
  const BATCH = 20;
  for (let i = 0; i < workspaceReportIds.length; i += BATCH) {
    const batchIds = workspaceReportIds.slice(i, i + BATCH);
    try {
      const { data, error } = await supabase
        .from('report_embeddings')
        .select('id, report_id, chunk_type, content, embedding')
        .in('report_id', batchIds);

      if (error) { console.warn('[bot] Fallback error:', error.message); continue; }
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
      console.warn('[bot] Fallback batch exception:', e);
    }
  }

  // Enrich report titles
  if (chunks.length > 0) {
    try {
      const ids = [...new Set(chunks.map(c => c.reportId).filter(Boolean))];
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

// ─── Context builders ─────────────────────────────────────────────────────────

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
      .map(c => `[${c.chunkType} — ${Math.round(c.similarity * 100)}% match]\n${c.content}`)
      .join('\n\n')}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    total += block.length;
    parts.push(block);
  }
  return parts.join('\n\n---\n\n');
}

function buildChatContext(history: ChatHistoryMessage[]): string {
  if (history.length === 0) return '(no recent messages)';
  const lines: string[] = [];
  let lastDay = '';
  for (const msg of history) {
    const d = msg.createdAt ? new Date(msg.createdAt) : null;
    if (d && !isNaN(d.getTime())) {
      const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (day !== lastDay) { lastDay = day; lines.push(`\n── ${day} ──`); }
      lines.push(`[${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}] ${msg.senderName}: ${msg.text}`);
    } else {
      lines.push(`${msg.senderName}: ${msg.text}`);
    }
  }
  return lines.join('\n').trim();
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendBotReply(channel: any, text: string): Promise<void> {
  try {
    await channel.sendMessage({ text, user_id: BOT_USER_ID } as any);
    console.log(`[bot] Reply sent (${text.length} chars)`);
  } catch (e) {
    console.error('[bot] sendMessage failed:', e);
  }
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; normA += a[i]*a[i]; normB += b[i]*b[i]; }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

// ─── Embedding ────────────────────────────────────────────────────────────────

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

// ─── Gzip ─────────────────────────────────────────────────────────────────────

async function decompressGzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const w  = ds.writable.getWriter();
  const r  = ds.readable.getReader();
  await w.write(bytes);
  await w.close();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new TextDecoder().decode(merged);
}