// src/services/pdfExport.ts
// Part 4: Visual reports — includes infographic stats, chart data as HTML tables,
// and source image thumbnails embedded into the PDF.

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ResearchReport, InfographicStat, InfographicChart, SourceImage } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

const DEPTH_LABEL: Record<string, string> = {
  quick: 'Quick Scan', deep: 'Deep Dive', expert: 'Expert Mode',
};

// ─── Infographic HTML blocks ──────────────────────────────────────────────────

function buildStatCardsHTML(stats: InfographicStat[]): string {
  if (!stats.length) return '';
  const cards = stats.map(s => {
    const changeColor =
      s.changeType === 'positive' ? '#43E97B'
      : s.changeType === 'negative' ? '#FF4757'
      : '#A0A0C0';
    return `
      <div class="stat-card">
        <div class="stat-value" style="color:${s.color ?? '#6C63FF'}">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        ${s.change ? `<div class="stat-change" style="color:${changeColor}">${s.change}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="infographic-section">
      <h3 class="infographic-title">Key Metrics</h3>
      <div class="stat-cards-grid">${cards}</div>
    </div>`;
}

function buildChartTableHTML(chart: InfographicChart): string {
  if (!chart.labels?.length || !chart.datasets?.length) return '';
  const dataset = chart.datasets[0];
  const rows = chart.labels.map((label, i) => `
    <tr>
      <td>${label}</td>
      <td><strong>${dataset.data[i] ?? '—'}${chart.unit ? ' ' + chart.unit : ''}</strong></td>
      <td>
        <div class="bar-cell">
          <div class="bar-fill" style="width:${Math.round((dataset.data[i] / Math.max(...dataset.data)) * 100)}%"></div>
        </div>
      </td>
    </tr>`).join('');
  return `
    <div class="chart-block">
      <h4 class="chart-title">${chart.title}</h4>
      ${chart.subtitle ? `<p class="chart-subtitle">${chart.subtitle}</p>` : ''}
      <table class="chart-table">
        <thead><tr><th>Label</th><th>Value</th><th>Scale</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${chart.insight ? `<div class="chart-insight">💡 ${chart.insight}</div>` : ''}
    </div>`;
}

function buildSourceImagesHTML(images: SourceImage[]): string {
  if (!images.length) return '';
  const items = images.slice(0, 6).map(img => `
    <div class="img-thumb">
      <img src="${img.thumbnailUrl ?? img.url}" alt="${img.title ?? 'Source image'}" onerror="this.style.display='none'" />
      ${img.title ? `<p class="img-caption">${img.title.slice(0, 40)}${img.title.length > 40 ? '…' : ''}</p>` : ''}
    </div>`).join('');
  return `
    <div class="images-section">
      <h3 class="infographic-title">Source Images</h3>
      <div class="images-grid">${items}</div>
    </div>`;
}

// ─── Full HTML template ───────────────────────────────────────────────────────

function buildReportHTML(report: ResearchReport, includeVisuals: boolean): string {
  const sectionsHTML = report.sections.map(section => `
    <div class="section">
      <h2>${section.title}</h2>
      <p>${section.content}</p>
      ${section.bullets?.length ? `
        <ul>${section.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
      ${section.statistics?.length ? `
        <div class="stats-grid">
          ${section.statistics.map(s => `
            <div class="stat-box">
              <div class="stat-value">${s.value}</div>
              <div class="stat-context">${s.context}</div>
              <div class="stat-source">${s.source}</div>
            </div>`).join('')}
        </div>` : ''}
    </div>`).join('');

  const findingsHTML = report.keyFindings.map((f, i) => `
    <div class="finding">
      <span class="finding-num">${i + 1}</span>
      <span>${f}</span>
    </div>`).join('');

  const predictionsHTML = report.futurePredictions.map(p => `
    <div class="prediction">🔭 ${p}</div>`).join('');

  const citationsHTML = report.citations.map((c, i) => `
    <div class="citation">
      <strong>[${i + 1}] ${c.title}</strong><br/>
      <span class="citation-source">${c.source}${c.date ? ' · ' + c.date : ''}</span><br/>
      <span class="citation-url">${c.url}</span>
    </div>`).join('');

  // Part 4 visual blocks
  const statsCardsHTML  = includeVisuals && report.infographicData?.stats.length
    ? buildStatCardsHTML(report.infographicData.stats)
    : '';

  const chartsHTML = includeVisuals && report.infographicData?.charts.length
    ? report.infographicData.charts.map(c => buildChartTableHTML(c)).join('')
    : '';

  const imagesHTML = includeVisuals && (report.sourceImages?.length ?? 0) > 0
    ? buildSourceImagesHTML(report.sourceImages!)
    : '';

  const infographicsBlock = (statsCardsHTML || chartsHTML || imagesHTML)
    ? `<div class="infographics-wrapper">${statsCardsHTML}${chartsHTML}${imagesHTML}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${report.title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:1.6; color:#1a1a2e; background:#fff; }
  .cover { background:linear-gradient(135deg,#6C63FF 0%,#8B5CF6 100%); color:white; padding:60px 48px; }
  .cover h1 { font-size:28px; font-weight:800; margin-bottom:12px; line-height:1.3; }
  .cover .meta { font-size:13px; opacity:.85; margin-top:16px; }
  .badge { display:inline-block; background:rgba(255,255,255,.2); border-radius:999px; padding:4px 14px; font-size:12px; margin-right:8px; }
  .stats-bar { display:flex; background:#f8f7ff; padding:20px 48px; gap:48px; border-bottom:2px solid #ebe9ff; }
  .stat-item { text-align:center; }
  .stat-item .value { font-size:22px; font-weight:800; color:#6C63FF; }
  .stat-item .label { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }
  .content { padding:40px 48px; }
  .exec-summary { background:#f8f7ff; border-left:4px solid #6C63FF; border-radius:8px; padding:24px; margin-bottom:36px; }
  .exec-summary h2 { font-size:16px; color:#6C63FF; margin-bottom:12px; font-weight:700; }
  .exec-summary p { color:#444; line-height:1.8; }
  /* Infographics */
  .infographics-wrapper { margin-bottom:36px; }
  .infographic-section { margin-bottom:28px; }
  .infographic-title { font-size:17px; font-weight:800; color:#1a1a2e; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #ebe9ff; }
  .stat-cards-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .stat-card { background:#f8f7ff; border-radius:12px; padding:16px; border-left:3px solid #6C63FF; }
  .stat-card .stat-value { font-size:22px; font-weight:800; }
  .stat-card .stat-label { font-size:11px; color:#888; margin-top:4px; text-transform:uppercase; }
  .stat-card .stat-change { font-size:12px; margin-top:4px; font-weight:700; }
  .chart-block { background:#f8f7ff; border-radius:12px; padding:20px; margin-bottom:16px; }
  .chart-title { font-size:15px; font-weight:700; color:#1a1a2e; margin-bottom:4px; }
  .chart-subtitle { font-size:12px; color:#888; margin-bottom:12px; }
  .chart-table { width:100%; border-collapse:collapse; font-size:12px; }
  .chart-table th { background:#ebe9ff; padding:8px 12px; text-align:left; font-weight:600; }
  .chart-table td { padding:7px 12px; border-bottom:1px solid #ebe9ff; }
  .bar-cell { background:#ebe9ff; border-radius:4px; height:12px; overflow:hidden; }
  .bar-fill { background:#6C63FF; height:100%; border-radius:4px; }
  .chart-insight { background:#f0eeff; border-radius:8px; padding:10px 14px; margin-top:12px; font-size:12px; color:#444; }
  /* Source images */
  .images-section { margin-bottom:28px; }
  .images-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .img-thumb img { width:100%; height:100px; object-fit:cover; border-radius:8px; }
  .img-caption { font-size:10px; color:#888; margin-top:4px; }
  /* Sections */
  .section { margin-bottom:32px; border:1px solid #ebe9ff; border-radius:12px; padding:24px; }
  .section h2 { font-size:17px; font-weight:700; color:#1a1a2e; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #ebe9ff; }
  .section p { color:#444; line-height:1.8; }
  .section ul { margin:12px 0 0 20px; }
  .section ul li { color:#444; margin-bottom:6px; line-height:1.6; }
  .stats-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:16px; }
  .stat-box { background:#f0eeff; border-radius:8px; padding:12px; border-left:3px solid #6C63FF; }
  .stat-box .stat-value { font-size:18px; font-weight:800; color:#6C63FF; }
  .stat-box .stat-context { font-size:12px; color:#444; margin-top:4px; }
  .stat-box .stat-source { font-size:11px; color:#999; margin-top:2px; }
  .findings-section { margin-bottom:32px; }
  .findings-section h2 { font-size:18px; font-weight:800; color:#1a1a2e; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #ebe9ff; }
  .finding { display:flex; align-items:flex-start; gap:12px; background:#f8f7ff; border-radius:8px; padding:14px; margin-bottom:10px; border-left:3px solid #6C63FF; }
  .finding-num { background:#6C63FF; color:white; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
  .prediction { background:#fff8e7; border-radius:8px; padding:12px 14px; margin-bottom:8px; color:#664400; font-size:13px; border-left:3px solid #FFA726; }
  .citations-section { margin-top:40px; padding-top:24px; border-top:2px solid #ebe9ff; }
  .citations-section h2 { font-size:18px; font-weight:800; margin-bottom:16px; }
  .citation { margin-bottom:16px; padding:12px; background:#f8f8f8; border-radius:8px; font-size:12px; }
  .citation-source { color:#6C63FF; }
  .citation-url { color:#999; word-break:break-all; }
  .footer { background:#f8f7ff; padding:24px 48px; text-align:center; font-size:11px; color:#999; border-top:1px solid #ebe9ff; margin-top:40px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
  <div class="cover">
    <h1>${report.title}</h1>
    <div>
      <span class="badge">${DEPTH_LABEL[report.depth] ?? 'Research'}</span>
      <span class="badge">DeepDive AI</span>
    </div>
    <div class="meta">
      ${formatDate(report.createdAt)} · ${report.sourcesCount} sources · Reliability: ${report.reliabilityScore}/10
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item"><div class="value">${report.sourcesCount}</div><div class="label">Sources</div></div>
    <div class="stat-item"><div class="value">${report.citations.length}</div><div class="label">Citations</div></div>
    <div class="stat-item"><div class="value">${report.sections.length}</div><div class="label">Sections</div></div>
    <div class="stat-item"><div class="value">${report.reliabilityScore}/10</div><div class="label">Reliability</div></div>
    ${report.infographicData?.charts.length ? `<div class="stat-item"><div class="value">${report.infographicData.charts.length}</div><div class="label">Charts</div></div>` : ''}
  </div>

  <div class="content">
    ${infographicsBlock}

    <div class="exec-summary">
      <h2>Executive Summary</h2>
      <p>${report.executiveSummary}</p>
    </div>

    ${sectionsHTML}

    ${report.keyFindings.length ? `
      <div class="findings-section"><h2>Key Findings</h2>${findingsHTML}</div>` : ''}

    ${report.futurePredictions.length ? `
      <div class="findings-section"><h2>Future Predictions</h2>${predictionsHTML}</div>` : ''}

    ${report.citations.length ? `
      <div class="citations-section"><h2>References (${report.citations.length})</h2>${citationsHTML}</div>` : ''}
  </div>

  <div class="footer">Generated by DeepDive AI · ${formatDate(report.createdAt)} · deepdive.app</div>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportReportAsPDF(
  report: ResearchReport,
  includeVisuals = true
): Promise<void> {
  const html = buildReportHTML(report, includeVisuals);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `Share: ${report.title}`,
      UTI:         'com.adobe.pdf',
    });
  }
}

export async function printReport(
  report: ResearchReport,
  includeVisuals = true
): Promise<void> {
  const html = buildReportHTML(report, includeVisuals);
  await Print.printAsync({ html });
}