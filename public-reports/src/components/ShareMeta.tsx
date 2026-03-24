// src/components/ShareMeta.tsx
// Public-Reports — OG / Twitter / JSON-LD meta tags (used in page.tsx generateMetadata)
// This is a helper module, not a React component.
// Import and call buildMetadata() inside page.tsx's generateMetadata export.

import type { Metadata } from 'next';
import type { PublicReport } from '@/types/report';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';

const DEPTH_LABELS = {
  quick:  'Quick Scan',
  deep:   'Deep Dive',
  expert: 'Expert Analysis',
};

export function buildMetadata(report: PublicReport, shareId: string): Metadata {
  const depthLabel = DEPTH_LABELS[report.depth] ?? 'Research';
  const sourcesStr = `${report.sourcesCount} sources`;
  const sectionsStr = `${report.sections.length} sections`;

  const description =
    report.executiveSummary.length > 160
      ? report.executiveSummary.slice(0, 157) + '…'
      : report.executiveSummary;

  const pageUrl = `${APP_URL}/r/${shareId}`;

  // Build a clean title
  const title = report.title.length > 70
    ? report.title.slice(0, 67) + '…'
    : report.title;

  return {
    title,
    description,
    keywords: [
      'research',
      'AI research',
      'DeepDive AI',
      report.depth,
      ...report.sections.slice(0, 3).map(s => s.title).filter(Boolean),
    ],
    authors: report.ownerUsername
      ? [{ name: `@${report.ownerUsername}` }]
      : [{ name: 'DeepDive AI' }],

    openGraph: {
      type:        'article',
      url:         pageUrl,
      title:       `${title} | DeepDive AI`,
      description,
      siteName:    'DeepDive AI',
      locale:      'en_US',
      publishedTime: report.completedAt ?? report.createdAt,
      tags: [depthLabel, sourcesStr, sectionsStr],
    },

    twitter: {
      card:        'summary_large_image',
      title:       `${title} | DeepDive AI`,
      description,
      site:        '@deepdiveai',
      creator:     report.ownerUsername ? `@${report.ownerUsername}` : '@deepdiveai',
    },

    alternates: {
      canonical: pageUrl,
    },

    other: {
      // Article-specific meta
      'article:published_time': report.completedAt ?? report.createdAt,
      'article:section':        depthLabel,
      // Custom DeepDive meta for potential scrapers
      'deepdive:report-id':     report.reportId,
      'deepdive:depth':         report.depth,
      'deepdive:sources':       String(report.sourcesCount),
      'deepdive:reliability':   String(report.reliabilityScore),
    },
  };
}

// ── JSON-LD structured data ────────────────────────────────────────────────────
// Returns a <script> tag string for embedding in the page <head>.
// Usage: dangerouslySetInnerHTML={{ __html: buildJsonLd(report, shareId) }}

export function buildJsonLd(report: PublicReport, shareId: string): string {
  const pageUrl  = `${APP_URL}/r/${shareId}`;
  const datePublished = report.completedAt ?? report.createdAt;

  const jsonLd = {
    '@context':    'https://schema.org',
    '@type':       'Article',
    headline:      report.title,
    description:   report.executiveSummary.slice(0, 300),
    url:           pageUrl,
    datePublished,
    dateModified:  datePublished,
    author: report.ownerUsername
      ? { '@type': 'Person', name: report.ownerUsername }
      : { '@type': 'Organization', name: 'DeepDive AI' },
    publisher: {
      '@type': 'Organization',
      name:    'DeepDive AI',
      url:     APP_URL,
    },
    mainEntityOfPage: {
      '@type': '@id',
      '@id':   pageUrl,
    },
    articleSection: DEPTH_LABELS[report.depth] ?? 'Research',
    wordCount: report.sections.reduce(
      (sum, s) => sum + (s.content?.split(/\s+/).length ?? 0),
      0,
    ),
    keywords: report.sections.map(s => s.title).filter(Boolean).join(', '),
  };

  return JSON.stringify(jsonLd);
}