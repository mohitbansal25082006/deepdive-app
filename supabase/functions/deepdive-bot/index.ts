// supabase/functions/deepdive-bot/index.ts
// Part 50.3 — @DeepDive AI Bot
//
// ARCHITECTURE FIX — Stream webhook timeout:
//   Stream gives webhooks exactly 5 seconds to respond with 200.
//   Our previous code ran parseBody() (gzip decompress + JSON parse) BEFORE
//   returning 200. On slow cold starts this exceeded 5 seconds → Stream
//   retried 3 times → "context deadline exceeded" → no Supabase log entries.
//
// SOLUTION:
//   1. Read the raw body buffer immediately (fast — just memory copy)
//   2. Return 200 within milliseconds
//   3. Do ALL processing (decompress, parse, embed, RAG, GPT, reply) inside
//      EdgeRuntime.waitUntil() which runs AFTER the response is sent
//
// ALSO FIXED:
//   - Gzip decompression (Stream compresses by default for apps after May 2026)
//   - new StreamChat() with disableCache:true for server-side use
//   - channel.create() before sendMessage()

import { createClient } from 'npm:@supabase/supabase-js@2';
import { StreamChat }   from 'npm:stream-chat@8';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, content-encoding',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_USER_ID      = 'deepdive-bot';
const MENTION_REGEX    = /@deepdive\b/i;
const COMMAND_REGEX    = /^\/ai\b/i;
const EMBEDDING_MODEL  = 'text-embedding-3-small';
const EMBEDDING_DIM    = 1536;
const MATCH_COUNT      = 5;
const MATCH_THRESHOLD  = 0.28;
const MAX_CONTEXT_CHARS = 2500;
const OPENAI_CHAT_URL  = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const GPT_MODEL        = 'gpt-4o-mini';

interface RAGChunk {
  content: string; chunkType: string; similarity: number; reportTitle?: string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
// MUST return 200 in under 5 seconds or Stream retries and times out.
// Strategy: capture raw body bytes immediately, return 200, process async.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Step 1: Read raw bytes immediately — this is just a memory operation, ~1ms
  let rawBytes: Uint8Array;
  try {
    rawBytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return new Response('{"error":"read_failed"}', {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Step 2: Register background task BEFORE returning response.
  // EdgeRuntime.waitUntil keeps the Deno process alive after HTTP response.
  // All heavy work (decompress, parse, embed, GPT, reply) happens here.
  try {
    (EdgeRuntime as any).waitUntil(
      handleWebhook(rawBytes).catch((err) => console.error('[bot] fatal:', err)),
    );
  } catch {
    // EdgeRuntime not available — fire and forget (may get killed on free tier)
    handleWebhook(rawBytes).catch((err) => console.error('[bot] fatal:', err));
  }

  // Step 3: Return 200 immediately — well within Stream's 5 second limit
  return new Response('{"status":"ok"}', {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// ─── All processing happens here, after 200 is already sent ──────────────────

async function handleWebhook(rawBytes: Uint8Array): Promise<void> {
  // Decompress gzip if needed (Stream default for apps after May 7 2026)
  let payload: any;
  try {
    const isGzip = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
    let jsonText: string;
    if (isGzip) {
      console.log(`[bot] Decompressing gzip body (${rawBytes.length} bytes)…`);
      jsonText = await decompressGzip(rawBytes);
    } else {
      jsonText = new TextDecoder().decode(rawBytes);
    }
    payload = JSON.parse(jsonText);
  } catch (err) {
    console.error('[bot] Failed to parse body:', err);
    return;
  }

  // Only handle message.new
  if (payload?.type !== 'message.new') {
    console.log(`[bot] Ignored event type: ${payload?.type}`);
    return;
  }

  const msgText  = (payload.message?.text ?? '').trim();
  const senderId = payload.message?.user?.id ?? payload.user?.id ?? '';

  // Ignore bot's own messages
  if (senderId === BOT_USER_ID) return;

  // Triple trigger detection
  const mentioned              = (payload.message?.mentioned_users ?? []) as any[];
  const viaAutocomplete        = mentioned.some(
    (u: any) => u.id === BOT_USER_ID || (u.name ?? '').toLowerCase().includes('deepdive'),
  );
  const viaText    = MENTION_REGEX.test(msgText);
  const viaCommand = COMMAND_REGEX.test(msgText);

  if (!viaAutocomplete && !viaText && !viaCommand) return;

  console.log(`[bot] ✅ Triggered | sender=${senderId} | text="${msgText.slice(0, 80)}"`);
  console.log(`[bot] Trigger: autocomplete=${viaAutocomplete} text=${viaText} cmd=${viaCommand}`);

  await processAndReply(payload, msgText, senderId);
}

// ─── Processing ───────────────────────────────────────────────────────────────

async function processAndReply(payload: any, msgText: string, senderId: string): Promise<void> {
  const apiKey          = Deno.env.get('STREAM_API_KEY')!;
  const apiSecret       = Deno.env.get('STREAM_API_SECRET')!;
  const openaiKey       = Deno.env.get('OPENAI_API_KEY')!;
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
  const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let query = msgText.replace(/@deepdive\b/gi, '').replace(/^\/ai\b/i, '').trim();
  if (!query) query = 'Give me a summary of the most relevant research in this workspace.';
  console.log(`[bot] Query: "${query}"`);

  const streamClient = new StreamChat(apiKey, apiSecret, { disableCache: true });
  const channelId    = payload.channel?.id ?? '';
  const channelType  = payload.channel?.type ?? 'messaging';
  const channel      = streamClient.channel(channelType, channelId);

  try { await channel.create(); } catch (e) { console.warn('[bot] channel.create warn:', e); }
  try { await channel.sendEvent({ type: 'typing.start', user_id: BOT_USER_ID } as any); } catch { /**/ }

  let botReply = '';

  try {
    const supabase = createClient(supabaseUrl, supabaseService);

    // Extract workspace_id from channel ID: "workspace-{uuid}" → uuid
    let userIds = [senderId];
    const workspaceId = channelId.startsWith('workspace-') ? channelId.slice('workspace-'.length) : '';
    console.log(`[bot] channelId="${channelId}" workspaceId="${workspaceId}"`);

    if (workspaceId) {
      const { data: members, error: mErr } = await supabase
        .from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
      if (mErr) console.warn('[bot] members error:', mErr.message);
      else if (members?.length) {
        userIds = Array.from(new Set([senderId, ...members.map((m: any) => m.user_id).filter(Boolean)]));
        console.log(`[bot] Searching ${userIds.length} members' reports`);
      }
    }

    // Embed
    const embedding = await createEmbedding(query, openaiKey);

    // RAG
    const chunks: RAGChunk[] = [];
    for (const uid of userIds.slice(0, 5)) {
      try {
        const { data, error: rErr } = await supabase.rpc('match_global_knowledge', {
          query_embedding: embedding, p_user_id: uid,
          match_count: Math.ceil(MATCH_COUNT / Math.min(userIds.length, 5)) + 2,
          match_threshold: MATCH_THRESHOLD, p_report_ids: null,
        });
        if (rErr) { console.warn(`[bot] RPC err ${uid}:`, rErr.message); continue; }
        if (Array.isArray(data)) {
          for (const r of data) chunks.push({ content: r.content, chunkType: r.chunk_type, similarity: Number(r.similarity), reportTitle: r.report_title });
        }
      } catch (e) { console.warn(`[bot] RAG exception ${uid}:`, e); }
    }

    const seen = new Set<string>();
    const top  = chunks
      .sort((a, b) => b.similarity - a.similarity)
      .filter(c => { const k = c.content.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, MATCH_COUNT);

    console.log(`[bot] ${top.length} chunks found`);
    const ctx      = buildContext(top);
    const hasCtx   = top.length > 0;

    // GPT
    const sys = hasCtx
      ? `You are DeepDive AI, a research assistant in a workspace chat.\n\nRETRIEVED CONTEXT:\n${ctx}\n\nRules: Answer ONLY from context. Cite "From '[Title]': ...". Max 3-5 sentences. Bullets for lists. No invented facts.`
      : `You are DeepDive AI in a workspace chat. No matching research found. Tell user in 2 sentences: no relevant reports found, generate reports in DeepDive app first.`;

    const gpt = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: GPT_MODEL, max_tokens: 350, temperature: 0.3,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: query }] }),
    });
    const gptData: any = await gpt.json();
    if (gptData.error) throw new Error(`OpenAI: ${gptData.error.message}`);

    botReply = gptData.choices?.[0]?.message?.content?.trim() ?? "Couldn't generate a response.";
    if (hasCtx) {
      const rc = new Set(top.map(c => c.reportTitle).filter(Boolean)).size;
      botReply = `*(from ${rc} report${rc !== 1 ? 's' : ''})*\n\n${botReply}`;
    }
    console.log(`[bot] Reply ready (${botReply.length} chars)`);

  } catch (err) {
    console.error('[bot] Processing error:', err);
    botReply = `Sorry, I hit an error searching the knowledge base. Please try again.`;
  }

  try { await channel.sendEvent({ type: 'typing.stop', user_id: BOT_USER_ID } as any); } catch { /**/ }

  try {
    await channel.sendMessage({ text: botReply, user_id: BOT_USER_ID } as any);
    console.log(`[bot] ✅ Reply sent to ${channelId}`);
  } catch (e) {
    console.error('[bot] ❌ sendMessage failed:', e);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const total  = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new TextDecoder().decode(merged);
}

async function createEmbedding(text: string, key: string): Promise<number[]> {
  const res  = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.trim().slice(0, 8000), dimensions: EMBEDDING_DIM }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data?.[0]?.embedding ?? (() => { throw new Error('No embedding'); })();
}

function buildContext(chunks: RAGChunk[]): string {
  const by = new Map<string, RAGChunk[]>();
  for (const c of chunks) {
    const k = c.reportTitle ?? 'Unknown';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  const parts: string[] = [];
  let total = 0;
  for (const [t, cs] of by) {
    const s = `📄 "${t}"\n${cs.map(c => `[${c.chunkType} ${Math.round(c.similarity*100)}%] ${c.content}`).join('\n\n')}`;
    total += s.length;
    if (total > MAX_CONTEXT_CHARS) break;
    parts.push(s);
  }
  return parts.join('\n\n---\n\n');
}