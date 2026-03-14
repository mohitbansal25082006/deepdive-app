// src/services/workspaceReportExportService.ts
// Part 15 — Allows any workspace member (not just the report owner) to
// download a shared research report as a PDF or Markdown file.
//
// ARCHITECTURE:
//  • Uses get_workspace_report_full() SECURITY DEFINER RPC to load the
//    full report data regardless of who owns it.
//  • After export, logs the download via log_workspace_report_download() RPC.
//  • PDF is built from the same HTML template used in standard report export
//    so workspace members get the same quality output.
//  • Markdown export produces a clean structured text file.
//  • Share sheet is opened after generation so user can save/send.

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { supabase }  from '../lib/supabase';
import { ResearchReport, ReportSection, Citation } from '../types';

// ─── Load report via SECURITY DEFINER RPC ────────────────────────────────────

export async function loadWorkspaceReportFull(
  reportId:    string,
  workspaceId: string,
): Promise<{ data: ResearchReport | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_report_full', {
      p_report_id:    reportId,
      p_workspace_id: workspaceId,
    });

    if (error) throw error;

    const rows = (data as Record<string, unknown>[]) ?? [];
    const row  = rows[0] ?? (data as Record<string, unknown>);
    if (!row) return { data: null, error: 'Report not found.' };

    const report: ResearchReport = {
      id:                row.id                 as string,
      userId:            row.user_id            as string,
      query:             row.query              as string,
      depth:             row.depth              as ResearchReport['depth'],
      focusAreas:        (row.focus_areas       as string[]) ?? [],
      title:             (row.title             as string)   ?? '',
      executiveSummary:  (row.executive_summary as string)   ?? '',
      sections:          (row.sections          as ReportSection[]) ?? [],
      keyFindings:       (row.key_findings      as string[]) ?? [],
      futurePredictions: (row.future_predictions as string[]) ?? [],
      citations:         (row.citations         as Citation[]) ?? [],
      statistics:        (row.statistics        as ResearchReport['statistics']) ?? [],
      searchQueries:     (row.search_queries    as string[]) ?? [],
      sourcesCount:      (row.sources_count     as number)   ?? 0,
      reliabilityScore:  (row.reliability_score as number)   ?? 0,
      status:            row.status             as ResearchReport['status'],
      agentLogs:         [],
      createdAt:         row.created_at         as string,
      completedAt:       (row.completed_at      as string)   ?? undefined,
    };

    return { data: report, error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load report',
    };
  }
}

// ─── Log download ─────────────────────────────────────────────────────────────

async function logDownload(
  reportId:    string,
  workspaceId: string,
  format:      'pdf' | 'markdown' | 'text',
): Promise<void> {
  try {
    await supabase.rpc('log_workspace_report_download', {
      p_workspace_id: workspaceId,
      p_report_id:    reportId,
      p_format:       format,
    });
  } catch (err) {
    // Non-fatal
    console.warn('[workspaceReportExport] log error:', err);
  }
}

// ─── Build PDF HTML ───────────────────────────────────────────────────────────

function buildReportHTML(report: ResearchReport): string {
  const date = new Date(report.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const sectionsHTML = report.sections.map(section => {
    const bulletsHTML = (section.bullets ?? []).length > 0
      ? `<ul class="bullets">${(section.bullets!).map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="section">
        <h2 class="section-title">${section.title}</h2>
        <p class="section-content">${section.content}</p>
        ${bulletsHTML}
      </div>`;
  }).join('');

  const findingsHTML = report.keyFindings.length > 0
    ? `<div class="findings">
         <h2 class="findings-title">Key Findings</h2>
         <ul>${report.keyFindings.map(f => `<li>${f}</li>`).join('')}</ul>
       </div>` : '';

  const predictionsHTML = report.futurePredictions.length > 0
    ? `<div class="predictions">
         <h2 class="predictions-title">Future Predictions</h2>
         <ul>${report.futurePredictions.map(p => `<li>${p}</li>`).join('')}</ul>
       </div>` : '';

  const citationsHTML = report.citations.length > 0
    ? `<div class="citations">
         <h2 class="citations-title">Sources & Citations</h2>
         ${report.citations.map((c, i) => `
           <div class="citation">
             <span class="citation-num">[${i + 1}]</span>
             <a href="${c.url}" class="citation-title">${c.title}</a>
             <span class="citation-source"> — ${c.source}</span>
           </div>`).join('')}
       </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${report.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px; line-height: 1.7; color: #1a1a2e; background: #fff;
  }
  .cover {
    background: linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%);
    color: white; padding: 52px 48px 40px;
  }
  .cover-badge {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; opacity: .7; margin-bottom: 14px;
    display: flex; align-items: center; gap: 6px;
  }
  .cover h1 { font-size: 30px; font-weight: 800; line-height: 1.3; margin-bottom: 12px; }
  .cover-meta {
    display: flex; flex-wrap: wrap; gap: 18px;
    font-size: 12px; opacity: .8; margin-top: 20px;
  }
  .stats-bar {
    display: flex; background: #f8f7ff;
    padding: 18px 48px; gap: 40px;
    border-bottom: 2px solid #ebe9ff;
  }
  .stat { text-align: center; }
  .stat .val { font-size: 22px; font-weight: 800; color: #6C63FF; }
  .stat .lbl { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
  .content { padding: 40px 48px; }
  .summary-block {
    background: #f8f7ff; border-left: 4px solid #6C63FF;
    border-radius: 8px; padding: 20px 24px; margin-bottom: 32px;
  }
  .summary-label {
    font-size: 10px; font-weight: 800; color: #6C63FF;
    letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px;
  }
  .summary-text { font-size: 14px; line-height: 1.8; color: #333; }
  .section {
    margin-bottom: 28px; padding-bottom: 28px;
    border-bottom: 1px solid #f0eeff;
  }
  .section-title {
    font-size: 16px; font-weight: 800; color: #1a1a2e;
    margin-bottom: 10px; padding-left: 10px;
    border-left: 3px solid #6C63FF;
  }
  .section-content { font-size: 14px; line-height: 1.8; color: #333; }
  .bullets { margin-top: 12px; padding-left: 20px; }
  .bullets li { font-size: 13px; line-height: 1.7; color: #444; margin-bottom: 6px; }
  .findings { margin-bottom: 28px; }
  .findings-title {
    font-size: 14px; font-weight: 800; color: #10B981;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
  }
  .findings ul { padding-left: 18px; }
  .findings li { font-size: 14px; line-height: 1.7; color: #333; margin-bottom: 8px; }
  .predictions { margin-bottom: 28px; }
  .predictions-title {
    font-size: 14px; font-weight: 800; color: #F59E0B;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
  }
  .predictions ul { padding-left: 18px; }
  .predictions li { font-size: 14px; line-height: 1.7; color: #333; margin-bottom: 8px; }
  .citations { margin-top: 32px; padding-top: 24px; border-top: 2px solid #f0eeff; }
  .citations-title {
    font-size: 12px; font-weight: 800; color: #6C63FF;
    letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px;
  }
  .citation { display: flex; gap: 8px; margin-bottom: 10px; font-size: 12px; }
  .citation-num { color: #6C63FF; font-weight: 700; flex-shrink: 0; }
  .citation-title { color: #333; font-weight: 600; }
  .citation-source { color: #888; }
  .footer {
    background: #f8f7ff; padding: 22px 48px;
    text-align: center; font-size: 11px; color: #bbb;
    border-top: 1px solid #ebe9ff; margin-top: 40px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">🔬 DeepDive AI Research Report</div>
    <h1>${report.title}</h1>
    <div class="cover-meta">
      <span>📅 ${date}</span>
      <span>🔍 ${report.depth?.toUpperCase() ?? 'STANDARD'} depth</span>
      ${report.sourcesCount > 0 ? `<span>📚 ${report.sourcesCount} sources</span>` : ''}
      ${report.reliabilityScore > 0 ? `<span>⭐ ${report.reliabilityScore}/10 reliability</span>` : ''}
    </div>
  </div>

  ${(report.sourcesCount > 0 || report.reliabilityScore > 0 || report.citations.length > 0) ? `
  <div class="stats-bar">
    ${report.sourcesCount > 0 ? `<div class="stat"><div class="val">${report.sourcesCount}</div><div class="lbl">Sources</div></div>` : ''}
    ${report.citations.length > 0 ? `<div class="stat"><div class="val">${report.citations.length}</div><div class="lbl">Citations</div></div>` : ''}
    ${report.keyFindings.length > 0 ? `<div class="stat"><div class="val">${report.keyFindings.length}</div><div class="lbl">Findings</div></div>` : ''}
    ${report.reliabilityScore > 0 ? `<div class="stat"><div class="val">${report.reliabilityScore}/10</div><div class="lbl">Reliability</div></div>` : ''}
  </div>` : ''}

  <div class="content">
    ${report.executiveSummary ? `
    <div class="summary-block">
      <div class="summary-label">Executive Summary</div>
      <div class="summary-text">${report.executiveSummary}</div>
    </div>` : ''}

    ${sectionsHTML}
    ${findingsHTML}
    ${predictionsHTML}
    ${citationsHTML}
  </div>

  <div class="footer">
    Generated by DeepDive AI · ${date} · deepdive.app
  </div>
</body>
</html>`;
}

// ─── Export as PDF ────────────────────────────────────────────────────────────

export async function exportWorkspaceReportAsPDF(
  reportId:    string,
  workspaceId: string,
): Promise<{ error: string | null }> {
  try {
    // Load full report via SECURITY DEFINER RPC
    const { data: report, error: loadError } = await loadWorkspaceReportFull(
      reportId,
      workspaceId,
    );
    if (loadError || !report) {
      return { error: loadError ?? 'Report could not be loaded' };
    }

    const html     = buildReportHTML(report);
    const { uri }  = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType:    'application/pdf',
        dialogTitle: `Share Report: ${report.title}`,
        UTI:         'com.adobe.pdf',
      });
    }

    // Log download
    await logDownload(reportId, workspaceId, 'pdf');

    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF export failed';
    console.error('[exportWorkspaceReportAsPDF]', err);
    return { error: msg };
  }
}

// ─── Export as Markdown ───────────────────────────────────────────────────────

export async function exportWorkspaceReportAsMarkdown(
  reportId:    string,
  workspaceId: string,
): Promise<{ error: string | null }> {
  try {
    const { data: report, error: loadError } = await loadWorkspaceReportFull(
      reportId,
      workspaceId,
    );
    if (loadError || !report) {
      return { error: loadError ?? 'Report could not be loaded' };
    }

    const date = new Date(report.createdAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    const lines: string[] = [
      `# ${report.title}`,
      '',
      `> **Query:** ${report.query}`,
      `> **Date:** ${date}  |  **Depth:** ${report.depth?.toUpperCase() ?? 'STANDARD'}`,
      report.sourcesCount > 0 ? `> **Sources:** ${report.sourcesCount}  |  **Reliability:** ${report.reliabilityScore}/10` : '',
      '',
      '---',
      '',
      '## Executive Summary',
      '',
      report.executiveSummary,
      '',
    ];

    for (const section of report.sections) {
      lines.push(`## ${section.title}`, '', section.content, '');
      if ((section.bullets ?? []).length > 0) {
        for (const b of section.bullets!) lines.push(`- ${b}`);
        lines.push('');
      }
    }

    if (report.keyFindings.length > 0) {
      lines.push('## Key Findings', '');
      for (const f of report.keyFindings) lines.push(`- ✅ ${f}`);
      lines.push('');
    }

    if (report.futurePredictions.length > 0) {
      lines.push('## Future Predictions', '');
      for (const p of report.futurePredictions) lines.push(`- 🔮 ${p}`);
      lines.push('');
    }

    if (report.citations.length > 0) {
      lines.push('## References', '');
      report.citations.forEach((c, i) => {
        lines.push(`[${i + 1}] **${c.title}** — ${c.source}  `);
        lines.push(`${c.url}`, '');
      });
    }

    lines.push('---', '*Generated by DeepDive AI*');

    const text = lines.join('\n');
    await Clipboard.setStringAsync(text);

    // Log download
    await logDownload(reportId, workspaceId, 'markdown');

    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Markdown export failed';
    return { error: msg };
  }
}

// ─── Copy plain text ──────────────────────────────────────────────────────────

export async function copyWorkspaceReportToClipboard(
  reportId:    string,
  workspaceId: string,
): Promise<{ error: string | null }> {
  try {
    const { data: report, error: loadError } = await loadWorkspaceReportFull(
      reportId,
      workspaceId,
    );
    if (loadError || !report) return { error: loadError ?? 'Report could not be loaded' };

    const parts = [
      `${report.title}\n${'─'.repeat(60)}\n`,
      report.executiveSummary,
      '',
      ...report.sections.map(s =>
        `${s.title.toUpperCase()}\n${s.content}\n` +
        (s.bullets ?? []).map(b => `  • ${b}`).join('\n')
      ),
      '',
      'KEY FINDINGS',
      ...report.keyFindings.map(f => `  ✓ ${f}`),
    ];

    await Clipboard.setStringAsync(parts.join('\n'));
    await logDownload(reportId, workspaceId, 'text');

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Copy failed' };
  }
}