// supabase/functions/deepdive-bot/index.ts
// Part 50.3 — @DeepDive AI Bot (original)
// Part 50.4 — SCOPED TO WORKSPACE REPORTS ONLY
//
// CHANGE IN 50.4:
//   Previously the bot searched ALL personal reports of ALL workspace members.
//   Now it ONLY searches reports that have been explicitly shared into the workspace
//   via the workspace_reports table (added by editors/owners via "Add to Workspace").
//
//   New flow:
//     1. Extract workspaceId from channelId ("workspace-{uuid}")
//     2. Query workspace_reports to get the report_ids shared in this workspace
//     3. Query report_chunks using those specific report_ids (no user loop)
//     4. Run RAG only on those workspace-scoped chunks
//
//   This is both more accurate (only relevant workspace context) and faster
//   (single DB query instead of looping through all member IDs).
//
// ARCHITECTURE (unchanged from 50.3):
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

const BOT_USER_ID      = 'deepdive-bot';
const MENTION_REGEX    = /@deepdive\b/i;
const COMMAND_REGEX    = /^\/ai\b/i;
const EMBEDDING_MODEL  = 'text-embedding-3-small';
const EMBEDDING_DIM    = 1536;
const MATCH_COUNT      = 6;
const MATCH_THRESHOLD  = 0.28;
const MAX_CONTEXT_CHARS = 3000;
const OPENAI_CHAT_URL  = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const GPT_MODEL        = 'gpt-4o-mini';

interface RAGChunk {
  content:     string;
  chunkType:   string;
  similarity:  number;
  reportTitle: string;
  reportId:    string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
// MUST return 200 in under 5 seconds or Stream retries and times out.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Step 1: Read raw bytes immediately — memory copy only, ~1ms
  let rawBytes: Uint8Array;
  try {
    rawBytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return new Response('{"error":"read_failed"}', {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Step 2: Register background task BEFORE returning response.
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
  const mentioned       = (payload.message?.mentioned_users ?? []) as any[];
  const viaAutocomplete = mentioned.some(
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
  if (!query) query = 'Give me a summary of the most relevant research shared in this workspace.';
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

    // ── Part 50.4: Extract workspaceId and get WORKSPACE-SHARED report IDs ──
    // Only use reports that have been explicitly added to this workspace via
    // workspace_reports table — not all personal reports of all members.
    const workspaceId = channelId.startsWith('workspace-')
      ? channelId.slice('workspace-'.length)
      : '';

    console.log(`[bot] channelId="${channelId}" workspaceId="${workspaceId}"`);

    if (!workspaceId) {
      // Not a workspace channel — cannot determine scope
      await sendBotReply(channel, '*(no workspace context)* I can only answer questions about reports shared in a DeepDive workspace.');
      return;
    }

    // Step 1: Get all report_ids shared in this workspace
    const { data: workspaceReportRows, error: wrErr } = await supabase
      .from('workspace_reports')
      .select('report_id')
      .eq('workspace_id', workspaceId);

    if (wrErr) {
      console.error('[bot] workspace_reports query error:', wrErr.message);
    }

    const workspaceReportIds: string[] = (workspaceReportRows ?? [])
      .map((r: any) => r.report_id as string)
      .filter(Boolean);

    console.log(`[bot] Found ${workspaceReportIds.length} reports in workspace`);

    // Step 2: If no reports in workspace, tell the user
    if (workspaceReportIds.length === 0) {
      await sendBotReply(
        channel,
        `No research reports have been added to this workspace yet. Workspace owners and editors can add reports via the Reports tab in the workspace. Once reports are added, I can answer questions about them.`,
      );
      return;
    }

    // Step 3: Embed the query
    const embedding = await createEmbedding(query, openaiKey);

    // Step 4: RAG — search ONLY within workspace report IDs
    // Uses match_global_knowledge RPC with p_report_ids filter.
    // The RPC already supports a p_report_ids parameter (uuid[]) which was
    // added in Part 26. When provided, it restricts the search to those report chunks.
    //
    // We search as the service role (supabase client already uses service key)
    // so RLS doesn't restrict us — we already validated workspace membership
    // at the channel level (only owners/editors connect to the channel).
    const chunks: RAGChunk[] = [];

    // Search in batches of 20 report IDs to avoid URL length limits
    const BATCH = 20;
    for (let i = 0; i < workspaceReportIds.length; i += BATCH) {
      const batchIds = workspaceReportIds.slice(i, i + BATCH);
      try {
        const { data, error: rErr } = await supabase.rpc('match_global_knowledge', {
          query_embedding:  embedding,
          p_user_id:        null,          // not filtering by user — we have explicit report IDs
          match_count:      MATCH_COUNT + 2,
          match_threshold:  MATCH_THRESHOLD,
          p_report_ids:     batchIds,      // ← KEY: only search these workspace reports
        });

        if (rErr) {
          console.warn(`[bot] RPC error (batch ${i}):`, rErr.message);
          // Fallback: try without p_user_id if the RPC signature changed
          // (some older deployments may not have p_report_ids working correctly)
          continue;
        }

        if (Array.isArray(data)) {
          for (const r of data) {
            chunks.push({
              content:     r.content      ?? '',
              chunkType:   r.chunk_type   ?? 'text',
              similarity:  Number(r.similarity ?? 0),
              reportTitle: r.report_title ?? 'Workspace Report',
              reportId:    r.report_id    ?? '',
            });
          }
        }
      } catch (e) {
        console.warn(`[bot] RAG exception (batch ${i}):`, e);
      }
    }

    // Step 5: Deduplicate and take top results
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

    console.log(`[bot] ${top.length} chunks found across ${workspaceReportIds.length} workspace reports`);

    const ctx    = buildContext(top);
    const hasCtx = top.length > 0;

    // Step 6: Build system prompt scoped to workspace context
    const sys = hasCtx
      ? `You are DeepDive AI, a research assistant embedded in a team workspace chat.\n\nThe following research has been shared in this workspace:\n\n${ctx}\n\nRules:\n- Answer ONLY using the above workspace research context.\n- Cite your sources like: From '[Report Title]': ...\n- Keep answers concise: 3-5 sentences or bullet points.\n- Do NOT invent facts or reference reports not shown above.\n- If the question is not covered by the workspace research, say so clearly.`
      : `You are DeepDive AI in a workspace chat. No relevant research was found in the workspace knowledge base for this query. Politely explain in 1-2 sentences that the workspace's shared research doesn't cover this topic, and suggest adding more reports to the workspace.`;

    // Step 7: Generate response with GPT
    const gpt = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model:       GPT_MODEL,
        max_tokens:  400,
        temperature: 0.3,
        messages: [
          { role: 'system', content: sys },
          { role: 'user',   content: query },
        ],
      }),
    });
    const gptData: any = await gpt.json();
    if (gptData.error) throw new Error(`OpenAI: ${gptData.error.message}`);

    botReply = gptData.choices?.[0]?.message?.content?.trim() ?? "Couldn't generate a response.";

    if (hasCtx) {
      // Show which reports were used and total workspace report count
      const usedReports = new Set(top.map(c => c.reportTitle).filter(Boolean));
      const rc          = usedReports.size;
      botReply = `*(from ${rc} workspace report${rc !== 1 ? 's' : ''} · ${workspaceReportIds.length} total in workspace)*\n\n${botReply}`;
    }

    console.log(`[bot] Reply ready (${botReply.length} chars)`);

  } catch (err) {
    console.error('[bot] Processing error:', err);
    botReply = `Sorry, I hit an error searching the workspace knowledge base. Please try again.`;
  }

  try { await channel.sendEvent({ type: 'typing.stop', user_id: BOT_USER_ID } as any); } catch { /**/ }
  await sendBotReply(channel, botReply);
}

// ─── Send helper ──────────────────────────────────────────────────────────────

async function sendBotReply(channel: any, text: string): Promise<void> {
  try {
    await channel.sendMessage({ text, user_id: BOT_USER_ID } as any);
    console.log(`[bot] ✅ Reply sent (${text.length} chars)`);
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
  let   off    = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new TextDecoder().decode(merged);
}

async function createEmbedding(text: string, key: string): Promise<number[]> {
  const res  = await fetch(OPENAI_EMBED_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model:      EMBEDDING_MODEL,
      input:      text.trim().slice(0, 8000),
      dimensions: EMBEDDING_DIM,
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data?.[0]?.embedding ?? (() => { throw new Error('No embedding returned'); })();
}

function buildContext(chunks: RAGChunk[]): string {
  // Group by report title for readable context block
  const by = new Map<string, RAGChunk[]>();
  for (const c of chunks) {
    const k = c.reportTitle || 'Workspace Report';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  const parts: string[] = [];
  let   total            = 0;
  for (const [title, cs] of by) {
    const block = `📄 "${title}"\n${cs
      .map(c => `[${c.chunkType} · ${Math.round(c.similarity * 100)}% match]\n${c.content}`)
      .join('\n\n')}`;
    total += block.length;
    if (total > MAX_CONTEXT_CHARS) break;
    parts.push(block);
  }
  return parts.join('\n\n---\n\n');
}