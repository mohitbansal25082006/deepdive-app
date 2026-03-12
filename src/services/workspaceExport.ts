// src/services/workspaceExport.ts
// Export workspace reports as a combined PDF bundle or shareable read-only link.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { WorkspaceReport, Workspace } from '../types';

// ─── Generate combined HTML for all reports ───────────────────────────────────

function buildWorkspaceBundleHtml(workspace: Workspace, reports: WorkspaceReport[]): string {
  const reportHtml = reports.map((wr, idx) => {
    const r = wr.report;
    if (!r) return '';
    return `
      <div class="report" ${idx > 0 ? 'style="page-break-before: always;"' : ''}>
        <div class="report-header">
          <span class="report-num">Report ${idx + 1} of ${reports.length}</span>
          <span class="badge">${r.depth?.toUpperCase() ?? 'DEEP'}</span>
        </div>
        <h1 class="report-title">${escHtml(r.title ?? r.query ?? 'Untitled')}</h1>
        <p class="meta">
          Added by <strong>${escHtml(wr.addedByProfile?.fullName ?? wr.addedByProfile?.username ?? 'Unknown')}</strong>
          · ${new Date(wr.addedAt).toLocaleDateString()}
          · ${r.sourcesCount ?? 0} sources
          · Reliability ${r.reliabilityScore ?? 0}/10
          ${wr.commentCount ? `· 💬 ${wr.commentCount} comments` : ''}
        </p>
        ${r.executiveSummary ? `<div class="summary"><p>${escHtml(r.executiveSummary)}</p></div>` : ''}
        ${(r.keyFindings?.length ?? 0) > 0 ? `
          <h2>Key Findings</h2>
          <ul>${r.keyFindings!.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
        ` : ''}
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, serif; color: #1a1a2e; background: #fff; padding: 48px; }
  .cover { text-align: center; padding: 80px 40px; page-break-after: always; }
  .cover h1 { font-size: 32px; color: #6C63FF; margin-bottom: 12px; }
  .cover .subtitle { color: #666; font-size: 16px; }
  .cover .stats { margin-top: 40px; display: flex; justify-content: center; gap: 40px; }
  .cover .stat-val { font-size: 28px; font-weight: bold; color: #6C63FF; }
  .cover .stat-lbl { font-size: 12px; color: #999; text-transform: uppercase; }
  .report { padding: 32px 0; }
  .report-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .report-num { color: #999; font-size: 12px; }
  .badge { background: #6C63FF; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 11px; }
  .report-title { font-size: 24px; color: #1a1a2e; margin-bottom: 8px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
  .summary { background: #f8f8ff; border-left: 3px solid #6C63FF; padding: 16px; margin-bottom: 20px; border-radius: 4px; }
  .summary p { color: #333; line-height: 1.7; }
  h2 { font-size: 16px; color: #6C63FF; margin: 20px 0 10px; }
  ul { padding-left: 20px; }
  li { color: #444; margin-bottom: 6px; line-height: 1.6; }
  .footer { text-align: center; color: #999; font-size: 11px; margin-top: 60px; border-top: 1px solid #eee; padding-top: 20px; }
</style>
</head>
<body>
  <div class="cover">
    <h1>🔭 ${escHtml(workspace.name)}</h1>
    <p class="subtitle">${escHtml(workspace.description ?? 'Research Workspace Export')}</p>
    <p class="subtitle" style="margin-top:8px;color:#999;font-size:13px;">
      Generated ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
    </p>
    <div class="stats">
      <div><div class="stat-val">${reports.length}</div><div class="stat-lbl">Reports</div></div>
    </div>
  </div>
  ${reportHtml}
  <div class="footer">DeepDive AI · Exported ${new Date().toISOString().split('T')[0]}</div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Export all workspace reports as a single PDF ─────────────────────────────

export async function exportWorkspaceAsPDF(
  workspace: Workspace,
  reports: WorkspaceReport[],
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (reports.length === 0) throw new Error('No reports to export');

    const html = buildWorkspaceBundleHtml(workspace, reports);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const fileName = `${workspace.name.replace(/[^a-z0-9]/gi, '_')}_workspace_${Date.now()}.pdf`;
    const destPath = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.moveAsync({ from: uri, to: destPath });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(destPath, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${workspace.name} Bundle`,
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Export failed' };
  }
}

// ─── Build a read-only shareable link ────────────────────────────────────────
// In production this would create a public share record in Supabase.
// For this app we generate a link with the invite code embedded.

export function buildReadOnlyShareLink(workspace: Workspace): string {
  return `deepdive://workspace/view/${workspace.inviteCode}`;
}