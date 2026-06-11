// supabase/functions/workspace-report-indexer/index.ts
//
// Part 50.5 — Workspace Report Auto-Indexer
//
// PURPOSE:
//   When a report is shared into a workspace (workspace_reports INSERT),
//   this function checks whether the report's embeddings need to be
//   "registered" for that workspace in workspace_report_index_status.
//
//   Reports already have their embeddings in report_embeddings (created
//   by the owner when they first opened the Knowledge Base or Research
//   Assistant). This function does NOT re-embed — it just marks them
//   as available for the workspace bot and verifies the embeddings exist.
//
//   If for some reason the report has NO embeddings yet (owner never
//   opened KB), this function creates them fresh using OpenAI.
//
// TRIGGERS:
//   1. Postgres trigger on workspace_reports INSERT (automatic)
//   2. Called manually from workspace-detail.tsx via useWorkspaceBotIndex
//      hook when opening the workspace (catches reports added before
//      this Part was deployed, or if the trigger failed)
//
// FLOW:
//   1. Read workspace_id + report_id from request body
//   2. Check workspace_report_index_status — already done? → return early
//   3. Check report_embeddings — embeddings exist? → just mark indexed
//   4. If NO embeddings: fetch full report → chunk → embed → store → mark
//   5. All steps are silent — no UI feedback, pure background
//
// ARCHITECTURE NOTE:
//   The function must return HTTP 200 quickly (< 30s for Supabase Edge).
//   For large reports, embedding ~8 chunks takes ~3-5 seconds total.
//   This is well within limits.

import { createClient } from 'npm:@supabase/supabase-js@2';

const OPENAI_EMBED_URL  = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL   = 'text-embedding-3-small';
const EMBEDDING_DIM     = 1536;
const MAX_CHARS         = 8000;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  let body: { workspace_id?: string; report_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { workspace_id, report_id } = body;
  if (!workspace_id || !report_id) {
    return new Response(JSON.stringify({ error: 'missing_params' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
  const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiKey       = Deno.env.get('OPENAI_API_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseService);

  console.log(`[indexer] workspace=${workspace_id} report=${report_id}`);

  try {
    // ── Step 1: Check if already indexed for this workspace ───────────────
    const { data: alreadyDone } = await supabase.rpc('check_workspace_report_needs_indexing', {
      p_workspace_id: workspace_id,
      p_report_id:    report_id,
    });

    if (alreadyDone === false) {
      console.log('[indexer] Already indexed, skipping');
      return new Response(JSON.stringify({ status: 'already_indexed' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 2: Check if embeddings already exist for this report ──────────
    const { data: embeddingRows, error: embErr } = await supabase
      .from('report_embeddings')
      .select('id')
      .eq('report_id', report_id)
      .limit(1);

    if (embErr) {
      console.error('[indexer] Error checking embeddings:', embErr.message);
    }

    const hasEmbeddings = (embeddingRows ?? []).length > 0;

    if (hasEmbeddings) {
      // Embeddings exist — just mark as indexed for this workspace
      console.log('[indexer] Embeddings exist, marking workspace as indexed');
      const { data: countData } = await supabase
        .from('report_embeddings')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', report_id);

      const chunkCount = (countData as any)?.length ?? 0;

      await supabase.rpc('mark_workspace_report_indexed', {
        p_workspace_id: workspace_id,
        p_report_id:    report_id,
        p_chunk_count:  chunkCount,
      });

      return new Response(JSON.stringify({ status: 'marked_indexed', chunks: chunkCount }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 3: No embeddings — fetch report and create them ───────────────
    console.log('[indexer] No embeddings found, fetching report and embedding...');

    const { data: reportRows, error: reportErr } = await supabase.rpc(
      'get_workspace_report_full_for_indexer',
      { p_report_id: report_id }
    );

    if (reportErr || !reportRows || reportRows.length === 0) {
      console.error('[indexer] Could not fetch report:', reportErr?.message ?? 'no data');
      return new Response(JSON.stringify({ error: 'report_not_found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const report = reportRows[0] as {
      id: string;
      user_id: string;
      title: string;
      query: string;
      executive_summary: string;
      sections: any[];
      key_findings: any[];
      future_predictions: any[];
      statistics: any[];
    };

    // ── Step 4: Chunk the report ───────────────────────────────────────────
    const chunks = chunkReport(report);
    if (chunks.length === 0) {
      console.warn('[indexer] No chunks generated from report');
      return new Response(JSON.stringify({ status: 'no_content' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 5: Embed all chunks ───────────────────────────────────────────
    console.log(`[indexer] Embedding ${chunks.length} chunks...`);
    const texts      = chunks.map(c => c.content);
    const embeddings = await createEmbeddingBatch(texts, openaiKey);

    // ── Step 6: Store embeddings in report_embeddings ─────────────────────
    const rows = chunks.map((chunk, idx) => ({
      report_id:  report_id,
      user_id:    report.user_id,
      chunk_id:   chunk.chunkId,
      chunk_type: chunk.chunkType,
      content:    chunk.content,
      embedding:  '[' + embeddings[idx].join(',') + ']',
      metadata:   chunk.metadata,
    }));

    // Insert in batches of 10
    let storedCount = 0;
    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      const { error: insertErr } = await supabase
        .from('report_embeddings')
        .insert(batch);

      if (insertErr) {
        // If conflict (another process beat us), just continue
        if (insertErr.code === '23505') {
          console.log(`[indexer] Batch ${i}-${i+10} already exists, skipping`);
          storedCount += batch.length;
          continue;
        }
        console.error('[indexer] Insert error:', insertErr.message);
        throw insertErr;
      }
      storedCount += batch.length;
    }

    // ── Step 7: Mark as indexed for this workspace ────────────────────────
    await supabase.rpc('mark_workspace_report_indexed', {
      p_workspace_id: workspace_id,
      p_report_id:    report_id,
      p_chunk_count:  storedCount,
    });

    console.log(`[indexer] ✅ Done — embedded ${storedCount} chunks for report ${report_id}`);

    return new Response(JSON.stringify({ status: 'embedded', chunks: storedCount }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[indexer] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Report Chunking (mirrors vectorStore.ts) ────────────────────────────────
// Must stay in sync with the mobile app's chunkReport() in vectorStore.ts

interface Chunk {
  chunkId:   string;
  chunkType: string;
  content:   string;
  metadata:  Record<string, unknown>;
}

function chunkReport(report: any): Chunk[] {
  const chunks: Chunk[] = [];
  const reportTitle = report.title || report.query || 'Untitled';

  // Executive Summary
  if (typeof report.executive_summary === 'string' && report.executive_summary.trim()) {
    chunks.push({
      chunkId:   'summary',
      chunkType: 'summary',
      content:   `EXECUTIVE SUMMARY — ${reportTitle}\n\n${report.executive_summary.trim()}`,
      metadata:  { reportTitle, query: report.query },
    });
  }

  // Sections
  const sections: any[] = Array.isArray(report.sections) ? report.sections : [];
  sections.forEach((section: any, idx: number) => {
    if (!section) return;
    const parts: string[] = [`SECTION: ${section.title ?? 'Untitled'}`];
    if (section.content?.trim()) parts.push(section.content.trim());
    if (Array.isArray(section.bullets) && section.bullets.length > 0) {
      parts.push('Key points:\n' + section.bullets.map((b: string) => `• ${b}`).join('\n'));
    }
    const content = parts.join('\n\n');
    if (content.length < 30) return;
    chunks.push({
      chunkId:   `section:${section.id ?? idx}`,
      chunkType: 'section',
      content,
      metadata: {
        sectionId:    section.id ?? String(idx),
        sectionTitle: section.title ?? 'Untitled',
        sectionIndex: idx,
      },
    });
  });

  // Key Findings
  const findings: string[] = Array.isArray(report.key_findings) ? report.key_findings : [];
  if (findings.length > 0) {
    chunks.push({
      chunkId:   'findings',
      chunkType: 'finding',
      content:   'KEY FINDINGS:\n' + findings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n'),
      metadata:  { count: findings.length },
    });
  }

  // Future Predictions
  const predictions: string[] = Array.isArray(report.future_predictions) ? report.future_predictions : [];
  if (predictions.length > 0) {
    chunks.push({
      chunkId:   'predictions',
      chunkType: 'prediction',
      content:   'FUTURE PREDICTIONS:\n' + predictions.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n'),
      metadata:  { count: predictions.length },
    });
  }

  // Statistics
  const statistics: any[] = Array.isArray(report.statistics) ? report.statistics : [];
  if (statistics.length > 0) {
    const statLines = statistics
      .slice(0, 20)
      .map((s: any) => `• ${s.value}: ${s.context} (${s.source ?? ''})`)
      .join('\n');
    chunks.push({
      chunkId:   'statistics',
      chunkType: 'statistic',
      content:   `KEY STATISTICS — ${reportTitle}:\n${statLines}`,
      metadata:  { count: statistics.length },
    });
  }

  return chunks;
}

// ─── Embedding helpers ────────────────────────────────────────────────────────

async function createEmbeddingBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const BATCH = 20;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map(t => t.trim().slice(0, MAX_CHARS));
    let attempt = 0;

    while (attempt < 3) {
      const res = await fetch(OPENAI_EMBED_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIM }),
      });
      const data: any = await res.json();

      if (!res.ok || data.error) {
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          attempt++;
          continue;
        }
        throw new Error(`OpenAI embedding error: ${data.error?.message ?? res.status}`);
      }

      const sorted = [...data.data].sort((a: any, b: any) => a.index - b.index);
      for (const item of sorted) {
        allEmbeddings.push(item.embedding);
      }
      break;
    }

    if (i + BATCH < texts.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return allEmbeddings;
}