// src/services/citationGenerator.ts
// Formats report citations into APA, MLA, and Chicago styles.

import { Citation, CitationFormat, FormattedCitation } from '../types';

// ─── APA 7th Edition ──────────────────────────────────────────────────────────

function formatAPA(citation: Citation): string {
  const year = citation.date
    ? new Date(citation.date).getFullYear().toString()
    : 'n.d.';
  const title = citation.title.trim();
  const source = citation.source.trim();
  const url = citation.url.trim();
  return `${source}. (${year}). ${title}. Retrieved from ${url}`;
}

// ─── MLA 9th Edition ──────────────────────────────────────────────────────────

function formatMLA(citation: Citation): string {
  const title = `"${citation.title.trim()}"`;
  const source = citation.source.trim();
  const date = citation.date
    ? new Date(citation.date).toLocaleDateString('en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'n.d.';
  const url = citation.url.trim();
  return `${source}. ${title} ${source}, ${date}, ${url}.`;
}

// ─── Chicago 17th Edition (Notes & Bibliography) ──────────────────────────────

function formatChicago(citation: Citation): string {
  const title = `"${citation.title.trim()}"`;
  const source = citation.source.trim();
  const date = citation.date
    ? new Date(citation.date).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'n.d.';
  const url = citation.url.trim();
  return `${source}. ${title}. ${source}, ${date}. ${url}.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function formatCitation(
  citation: Citation,
  format: CitationFormat
): FormattedCitation {
  let formatted: string;
  switch (format) {
    case 'apa': formatted = formatAPA(citation); break;
    case 'mla': formatted = formatMLA(citation); break;
    case 'chicago': formatted = formatChicago(citation); break;
    default: formatted = formatAPA(citation);
  }
  return { id: citation.id, format, formatted, raw: citation };
}

export function formatAllCitations(
  citations: Citation[],
  format: CitationFormat
): FormattedCitation[] {
  return citations.map((c) => formatCitation(c, format));
}

export function buildCitationBlock(
  citations: Citation[],
  format: CitationFormat
): string {
  const formatted = formatAllCitations(citations, format);
  const header: Record<CitationFormat, string> = {
    apa: 'References',
    mla: 'Works Cited',
    chicago: 'Bibliography',
  };
  const lines = formatted.map((f, i) => `${i + 1}. ${f.formatted}`);
  return `${header[format]}\n\n${lines.join('\n\n')}`;
}