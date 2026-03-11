// src/services/academicPdfExport.ts
// Part 7 — Academic Paper PDF Export
//
// Generates a publication-quality PDF for an AcademicPaper using
// expo-print (same approach as pdfExport.ts used for standard reports).
// The layout mirrors a standard academic journal article:
//   • Title page with running head, title, keywords
//   • Each section on its own flow with proper headings
//   • Subsections indented
//   • References formatted at the end

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AcademicPaper, AcademicSection } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Convert plain paragraphs (separated by \n\n or \n) to <p> elements.
 */
function paragraphsToHtml(text: string): string {
  if (!text?.trim()) return '';
  const paras = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  return paras.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
}

// ─── Section renderer ─────────────────────────────────────────────────────────

function renderSection(section: AcademicSection): string {
  const parts: string[] = [];

  if (section.type === 'abstract') {
    // Abstract uses a special indented block
    parts.push(`
      <div class="abstract-block">
        <h2 class="section-heading">${escapeHtml(section.title)}</h2>
        ${paragraphsToHtml(section.content)}
      </div>
    `);
    return parts.join('');
  }

  if (section.type === 'references') {
    // References use a numbered list style
    const lines = (section.content ?? '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const listItems = lines
      .map(l => `<p class="reference-item">${escapeHtml(l)}</p>`)
      .join('\n');
    parts.push(`
      <div class="section">
        <h2 class="section-heading">${escapeHtml(section.title)}</h2>
        <div class="references-list">${listItems}</div>
      </div>
    `);
    return parts.join('');
  }

  // Standard section
  parts.push(`<div class="section">`);
  parts.push(`<h2 class="section-heading">${escapeHtml(section.title)}</h2>`);

  if (section.content?.trim()) {
    parts.push(paragraphsToHtml(section.content));
  }

  for (const sub of section.subsections ?? []) {
    parts.push(`<h3 class="subsection-heading">${escapeHtml(sub.title)}</h3>`);
    parts.push(paragraphsToHtml(sub.content));
  }

  parts.push(`</div>`);
  return parts.join('\n');
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildAcademicPaperHtml(paper: AcademicPaper): string {
  const formattedDate = new Date(paper.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const sectionsHtml = paper.sections.map(renderSection).join('\n');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(paper.title)}</title>
  <style>
    /* ── Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 2;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    /* ── Page layout ── */
    .page {
      max-width: 680px;
      margin: 0 auto;
      padding: 72px 72px 72px 72px;
    }

    /* ── Running head ── */
    .running-head {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #555;
      border-bottom: 1px solid #ddd;
      padding-bottom: 8px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* ── Title block ── */
    .title-block {
      text-align: center;
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 2px solid #1a1a2e;
    }

    .paper-title {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.3;
      color: #1a1a2e;
      margin-bottom: 20px;
    }

    .paper-meta {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #555;
      margin-bottom: 8px;
    }

    .keywords-block {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #333;
      margin-top: 16px;
      text-align: left;
      background: #f8f8ff;
      border-left: 3px solid #6c63ff;
      padding: 10px 16px;
      border-radius: 0 4px 4px 0;
    }

    .keywords-label {
      font-weight: 700;
      font-style: italic;
    }

    /* ── Abstract ── */
    .abstract-block {
      background: #f8f8ff;
      border: 1px solid #e0e0f0;
      border-radius: 6px;
      padding: 24px 28px;
      margin-bottom: 40px;
    }

    .abstract-block .section-heading {
      text-align: center;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13pt;
      font-weight: 700;
      margin-bottom: 16px;
      color: #1a1a2e;
      border-bottom: none;
    }

    .abstract-block p {
      font-size: 11pt;
      line-height: 1.8;
      color: #222;
      text-align: justify;
      text-indent: 0;
    }

    /* ── Sections ── */
    .section {
      margin-bottom: 32px;
    }

    .section-heading {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13pt;
      font-weight: 700;
      color: #1a1a2e;
      border-bottom: 2px solid #6c63ff;
      padding-bottom: 6px;
      margin-bottom: 16px;
      margin-top: 32px;
    }

    .subsection-heading {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      font-weight: 700;
      font-style: italic;
      color: #2d2d50;
      margin-top: 20px;
      margin-bottom: 10px;
    }

    p {
      text-align: justify;
      text-indent: 2em;
      margin-bottom: 0;
      color: #111;
      font-size: 12pt;
      line-height: 2;
    }

    /* First para after a heading has no indent */
    .section-heading + p,
    .subsection-heading + p,
    .abstract-block p:first-of-type {
      text-indent: 0;
    }

    /* ── References ── */
    .references-list {
      margin-top: 8px;
    }

    .reference-item {
      text-indent: -2em !important;
      padding-left: 2em;
      margin-bottom: 10px;
      font-size: 11pt;
      line-height: 1.6;
      color: #222;
    }

    /* ── Stats bar ── */
    .stats-bar {
      display: flex;
      gap: 24px;
      justify-content: center;
      margin-top: 16px;
      padding: 10px 0;
    }

    .stat-item {
      text-align: center;
      font-family: Arial, Helvetica, sans-serif;
    }

    .stat-value {
      font-size: 13pt;
      font-weight: 700;
      color: #6c63ff;
      display: block;
    }

    .stat-label {
      font-size: 8pt;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 48px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #aaa;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- Running head -->
    <div class="running-head">
      <span>${escapeHtml(paper.runningHead || paper.title.toUpperCase().slice(0, 50))}</span>
      <span>DeepDive AI · Academic Research</span>
    </div>

    <!-- Title block -->
    <div class="title-block">
      <div class="paper-title">${escapeHtml(paper.title)}</div>
      <div class="paper-meta">Generated: ${formattedDate} · Citation Style: ${escapeHtml(paper.citationStyle.toUpperCase())}</div>
      ${paper.institution ? `<div class="paper-meta">${escapeHtml(paper.institution)}</div>` : ''}

      <!-- Stats -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">~${paper.wordCount.toLocaleString()}</span>
          <span class="stat-label">Words</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">~${paper.pageEstimate}</span>
          <span class="stat-label">Pages</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${paper.sections.length}</span>
          <span class="stat-label">Sections</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${paper.citations.length}</span>
          <span class="stat-label">Citations</span>
        </div>
      </div>

      <!-- Keywords -->
      <div class="keywords-block">
        <span class="keywords-label">Keywords: </span>
        ${escapeHtml(paper.keywords.join(', '))}
      </div>
    </div>

    <!-- Sections -->
    ${sectionsHtml}

    <!-- Footer -->
    <div class="footer">
      Generated by DeepDive AI · Academic Paper Mode · Part 7
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ─── Public export function ───────────────────────────────────────────────────

/**
 * Generates and shares a PDF of the academic paper.
 * Uses expo-print to render the styled HTML and expo-sharing to share.
 */
export async function exportAcademicPaperAsPDF(paper: AcademicPaper): Promise<void> {
  const html = buildAcademicPaperHtml(paper);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Academic Paper — ${paper.title}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
}