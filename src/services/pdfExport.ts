// src/services/pdfExport.ts
// Generates a styled PDF from a ResearchReport and shares it
// using Expo's sharing/print APIs.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ResearchReport, Citation } from '../types';

// ─── HTML template ────────────────────────────────────────────────────────────

function buildReportHTML(report: ResearchReport): string {
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

  const depthLabel: Record<string, string> = {
    quick: 'Quick Scan',
    deep: 'Deep Dive',
    expert: 'Expert Mode',
  };

  const sectionsHTML = report.sections.map((section) => `
    <div class="section">
      <h2>${section.title}</h2>
      <p>${section.content}</p>
      ${section.bullets && section.bullets.length > 0 ? `
        <ul>
          ${section.bullets.map((b) => `<li>${b}</li>`).join('')}
        </ul>
      ` : ''}
      ${section.statistics && section.statistics.length > 0 ? `
        <div class="stats-grid">
          ${section.statistics.map((s) => `
            <div class="stat-box">
              <div class="stat-value">${s.value}</div>
              <div class="stat-context">${s.context}</div>
              <div class="stat-source">${s.source}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  const findingsHTML = report.keyFindings.map((f, i) => `
    <div class="finding">
      <span class="finding-num">${i + 1}</span>
      <span>${f}</span>
    </div>
  `).join('');

  const predictionsHTML = report.futurePredictions.map((p) => `
    <div class="prediction">🔭 ${p}</div>
  `).join('');

  const citationsHTML = report.citations.map((c, i) => `
    <div class="citation">
      <strong>[${i + 1}] ${c.title}</strong><br/>
      <span class="citation-source">${c.source}${c.date ? ` · ${c.date}` : ''}</span><br/>
      <span class="citation-url">${c.url}</span>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${report.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: #1a1a2e; background: #fff; }
  .cover { background: linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%);
    color: white; padding: 60px 48px; margin-bottom: 0; }
  .cover h1 { font-size: 28px; font-weight: 800; margin-bottom: 12px; line-height: 1.3; }
  .cover .meta { font-size: 13px; opacity: 0.85; margin-top: 16px; }
  .cover .badge { display: inline-block; background: rgba(255,255,255,0.2);
    border-radius: 999px; padding: 4px 14px; font-size: 12px; margin-right: 8px; }
  .stats-bar { display: flex; background: #f8f7ff; padding: 20px 48px; gap: 48px;
    border-bottom: 2px solid #ebe9ff; }
  .stat-item { text-align: center; }
  .stat-item .value { font-size: 22px; font-weight: 800; color: #6C63FF; }
  .stat-item .label { font-size: 11px; color: #888; text-transform: uppercase;
    letter-spacing: 0.5px; margin-top: 2px; }
  .content { padding: 40px 48px; }
  .exec-summary { background: #f8f7ff; border-left: 4px solid #6C63FF;
    border-radius: 8px; padding: 24px; margin-bottom: 36px; }
  .exec-summary h2 { font-size: 16px; color: #6C63FF; margin-bottom: 12px; font-weight: 700; }
  .exec-summary p { color: #444; line-height: 1.8; }
  .section { margin-bottom: 32px; border: 1px solid #ebe9ff;
    border-radius: 12px; padding: 24px; }
  .section h2 { font-size: 17px; font-weight: 700; color: #1a1a2e;
    margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ebe9ff; }
  .section p { color: #444; line-height: 1.8; }
  .section ul { margin: 12px 0 0 20px; }
  .section ul li { color: #444; margin-bottom: 6px; line-height: 1.6; }
  .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr);
    gap: 12px; margin-top: 16px; }
  .stat-box { background: #f0eeff; border-radius: 8px; padding: 12px;
    border-left: 3px solid #6C63FF; }
  .stat-value { font-size: 18px; font-weight: 800; color: #6C63FF; }
  .stat-context { font-size: 12px; color: #444; margin-top: 4px; }
  .stat-source { font-size: 11px; color: #999; margin-top: 2px; }
  .findings-section { margin-bottom: 32px; }
  .findings-section h2 { font-size: 18px; font-weight: 800; color: #1a1a2e;
    margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #ebe9ff; }
  .finding { display: flex; align-items: flex-start; gap: 12px;
    background: #f8f7ff; border-radius: 8px; padding: 14px;
    margin-bottom: 10px; border-left: 3px solid #6C63FF; }
  .finding-num { background: #6C63FF; color: white; border-radius: 50%;
    width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .prediction { background: #fff8e7; border-radius: 8px; padding: 12px 14px;
    margin-bottom: 8px; color: #664400; font-size: 13px; border-left: 3px solid #FFA726; }
  .citations-section { margin-top: 40px; padding-top: 24px;
    border-top: 2px solid #ebe9ff; }
  .citations-section h2 { font-size: 18px; font-weight: 800; margin-bottom: 16px; }
  .citation { margin-bottom: 16px; padding: 12px; background: #f8f8f8;
    border-radius: 8px; font-size: 12px; }
  .citation-source { color: #6C63FF; }
  .citation-url { color: #999; word-break: break-all; }
  .footer { background: #f8f7ff; padding: 24px 48px; text-align: center;
    font-size: 11px; color: #999; border-top: 1px solid #ebe9ff; margin-top: 40px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="cover">
    <h1>${report.title}</h1>
    <div>
      <span class="badge">${depthLabel[report.depth] || 'Research'}</span>
      <span class="badge">Generated by DeepDive AI</span>
    </div>
    <div class="meta">
      Generated on ${formatDate(report.createdAt)} ·
      ${report.sourcesCount} sources analysed ·
      Reliability score: ${report.reliabilityScore}/10
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item">
      <div class="value">${report.sourcesCount}</div>
      <div class="label">Sources</div>
    </div>
    <div class="stat-item">
      <div class="value">${report.citations.length}</div>
      <div class="label">Citations</div>
    </div>
    <div class="stat-item">
      <div class="value">${report.sections.length}</div>
      <div class="label">Sections</div>
    </div>
    <div class="stat-item">
      <div class="value">${report.reliabilityScore}/10</div>
      <div class="label">Reliability</div>
    </div>
  </div>

  <div class="content">
    <div class="exec-summary">
      <h2>Executive Summary</h2>
      <p>${report.executiveSummary}</p>
    </div>

    ${sectionsHTML}

    ${report.keyFindings.length > 0 ? `
      <div class="findings-section">
        <h2>Key Findings</h2>
        ${findingsHTML}
      </div>
    ` : ''}

    ${report.futurePredictions.length > 0 ? `
      <div class="findings-section">
        <h2>Future Predictions</h2>
        ${predictionsHTML}
      </div>
    ` : ''}

    ${report.citations.length > 0 ? `
      <div class="citations-section">
        <h2>References (${report.citations.length})</h2>
        ${citationsHTML}
      </div>
    ` : ''}
  </div>

  <div class="footer">
    Generated by DeepDive AI · ${formatDate(report.createdAt)} · deepdive.ai
  </div>
</body>
</html>`;
}

// ─── Public export functions ──────────────────────────────────────────────────

export async function exportReportAsPDF(report: ResearchReport): Promise<void> {
  const html = buildReportHTML(report);

  // printToFileAsync writes to a temp uri — share it directly
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share: ${report.title}`,
      UTI: 'com.adobe.pdf',
    });
  }
}

export async function printReport(report: ResearchReport): Promise<void> {
  const html = buildReportHTML(report);
  await Print.printAsync({ html });
}