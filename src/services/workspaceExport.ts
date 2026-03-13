// src/services/workspaceExport.ts
// Part 11 — Export workspace reports as a combined PDF bundle.
// CHANGED: exportWorkspaceAsPDF is now callable by editors AND owners.
//          Role enforcement happens at the screen level; this service
//          is intentionally role-agnostic (it takes the data you give it).

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { WorkspaceReport, Workspace } from '../types';

// ─── HTML escape helper ───────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Build cover + report HTML ────────────────────────────────────────────────

function buildWorkspaceBundleHtml(
  workspace: Workspace,
  reports: WorkspaceReport[],
): string {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const reportHtml = reports
    .map((wr, idx) => {
      const r = wr.report;
      if (!r) return '';

      const addedBy = wr.addedByProfile?.fullName
        ?? wr.addedByProfile?.username
        ?? 'Unknown';

      const keyFindings = r.keyFindings?.length
        ? `<h2>Key Findings</h2>
           <ul>${r.keyFindings.map((f) => `<li>${escHtml(f)}</li>`).join('')}</ul>`
        : '';

      const pinnedBadge = wr.isPinned
        ? `<span class="pinned-badge">📌 Pinned</span>`
        : '';

      return `
        <div class="report" ${idx > 0 ? 'style="page-break-before: always;"' : ''}>
          <div class="report-header">
            <span class="report-num">Report ${idx + 1} of ${reports.length}</span>
            <span class="badge">${escHtml(r.depth?.toUpperCase() ?? 'DEEP')}</span>
            ${pinnedBadge}
          </div>
          <h1 class="report-title">${escHtml(r.title ?? r.query ?? 'Untitled')}</h1>
          <p class="meta">
            Added by <strong>${escHtml(addedBy)}</strong>
            &middot; ${new Date(wr.addedAt).toLocaleDateString()}
            &middot; ${r.sourcesCount ?? 0} sources
            &middot; Reliability ${r.reliabilityScore ?? 0}/10
            ${wr.commentCount ? `&middot; 💬 ${wr.commentCount} comments` : ''}
          </p>
          ${r.executiveSummary
            ? `<div class="summary"><p>${escHtml(r.executiveSummary)}</p></div>`
            : ''}
          ${keyFindings}
        </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, serif; color: #1a1a2e; background: #fff; padding: 48px; }

  .cover {
    text-align: center; padding: 80px 40px;
    page-break-after: always;
  }
  .cover .logo { font-size: 40px; margin-bottom: 16px; }
  .cover h1   { font-size: 32px; color: #6C63FF; margin-bottom: 12px; }
  .cover .subtitle { color: #666; font-size: 16px; }
  .cover .date { margin-top: 8px; color: #999; font-size: 13px; }
  .cover .stats {
    display: flex; justify-content: center; gap: 40px; margin-top: 40px;
  }
  .cover .stat-val { font-size: 28px; font-weight: bold; color: #6C63FF; }
  .cover .stat-lbl { font-size: 12px; color: #999; text-transform: uppercase; margin-top: 4px; }

  .report       { padding: 32px 0; }
  .report-header{
    display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .report-num   { color: #999; font-size: 12px; }
  .badge {
    background: #6C63FF; color: #fff;
    border-radius: 4px; padding: 2px 8px; font-size: 11px;
  }
  .pinned-badge {
    background: #FFF3CD; color: #856404;
    border-radius: 4px; padding: 2px 8px; font-size: 11px;
    border: 1px solid #FFEEBA;
  }
  .report-title { font-size: 24px; color: #1a1a2e; margin-bottom: 8px; }
  .meta         { color: #666; font-size: 13px; margin-bottom: 20px; }
  .summary {
    background: #f8f8ff; border-left: 3px solid #6C63FF;
    padding: 16px; margin-bottom: 20px; border-radius: 4px;
  }
  .summary p { color: #333; line-height: 1.7; }
  h2          { font-size: 16px; color: #6C63FF; margin: 20px 0 10px; }
  ul          { padding-left: 20px; }
  li          { color: #444; margin-bottom: 6px; line-height: 1.6; }

  .footer {
    text-align: center; color: #999; font-size: 11px;
    margin-top: 60px; border-top: 1px solid #eee; padding-top: 20px;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="logo">🔭</div>
    <h1>${escHtml(workspace.name)}</h1>
    <p class="subtitle">${escHtml(workspace.description ?? 'Research Workspace Export')}</p>
    <p class="date">Generated ${now}</p>
    <div class="stats">
      <div>
        <div class="stat-val">${reports.length}</div>
        <div class="stat-lbl">Reports</div>
      </div>
      <div>
        <div class="stat-val">${reports.reduce((a, r) => a + (r.commentCount ?? 0), 0)}</div>
        <div class="stat-lbl">Comments</div>
      </div>
      <div>
        <div class="stat-val">${reports.filter((r) => r.isPinned).length}</div>
        <div class="stat-lbl">Pinned</div>
      </div>
    </div>
  </div>
  ${reportHtml}
  <div class="footer">
    DeepDive AI &middot; Workspace Bundle &middot; ${new Date().toISOString().split('T')[0]}
  </div>
</body>
</html>`;
}

// ─── Export all workspace reports as a single PDF ─────────────────────────────
// Accessible to both owners AND editors (role check done by caller screen).

export async function exportWorkspaceAsPDF(
  workspace: Workspace,
  reports: WorkspaceReport[],
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (reports.length === 0) throw new Error('No reports to export');

    const html     = buildWorkspaceBundleHtml(workspace, reports);
    const { uri }  = await Print.printToFileAsync({ html, base64: false });

    const safeName = workspace.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeName}_workspace_${Date.now()}.pdf`;
    const destPath = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.moveAsync({ from: uri, to: destPath });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(destPath, {
        mimeType:    'application/pdf',
        dialogTitle: `Share ${workspace.name} Bundle`,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Export failed',
    };
  }
}