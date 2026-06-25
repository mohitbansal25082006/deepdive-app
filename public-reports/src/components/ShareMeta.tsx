// src/components/ShareMeta.tsx
// Public-Reports — Part 55.9 Fully Themed OG / Twitter / JSON-LD Meta Tags
// Used in page.tsx generateMetadata
// This is a helper module, not a React component.
// Import and call buildMetadata() inside page.tsx's generateMetadata export.

import type { Metadata } from 'next';
import type { PublicReport } from '@/types/report';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';

const DEPTH_LABELS = {
  quick: 'Quick Scan',
  deep: 'Deep Dive',
  expert: 'Expert Analysis',
};

const DEPTH_EMOJIS = {
  quick: '⚡',
  deep: '🔬',
  expert: '🎯',
};

const DEPTH_COLORS = {
  quick: '#10B981',
  deep: '#6C63FF',
  expert: '#F59E0B',
};

/**
 * Generate a rich, SEO-optimized metadata object for a report
 */
export function buildMetadata(report: PublicReport, shareId: string): Metadata {
  const depthLabel = DEPTH_LABELS[report.depth] ?? 'Research';
  const depthEmoji = DEPTH_EMOJIS[report.depth] ?? '📄';
  const depthColor = DEPTH_COLORS[report.depth] ?? '#6C63FF';
  const sourcesStr = `${report.sourcesCount} sources`;
  const sectionsStr = `${report.sections.length} sections`;

  // Build description with depth context
  let description = report.executiveSummary;
  if (description.length > 160) {
    description = description.slice(0, 157) + '…';
  }

  // Add depth context to description for richer snippets
  const enhancedDescription = `${depthEmoji} ${depthLabel} · ${sourcesStr} · ${sectionsStr}. ${description}`;

  const pageUrl = `${APP_URL}/r/${shareId}`;

  // Build a clean title with depth context
  let title = report.title;
  if (title.length > 70) {
    title = title.slice(0, 67) + '…';
  }
  const fullTitle = `${title} | DeepDive AI`;

  // Extract top 5 tags for keywords
  const topTags = report.tags?.slice(0, 5) ?? [];
  const sectionTitles = report.sections.slice(0, 3).map(s => s.title).filter(Boolean);

  // Calculate reading time (approx 200 words per minute)
  const wordCount = report.sections.reduce(
    (sum, s) => sum + (s.content?.split(/\s+/).length ?? 0),
    0,
  );
  const readingTime = Math.max(1, Math.round(wordCount / 200));

  // Build OG image URL with theme-aware parameters
  const ogImageUrl = `${APP_URL}/api/og?title=${encodeURIComponent(title)}&depth=${report.depth}&color=${encodeURIComponent(depthColor)}`;

  return {
    title: fullTitle,
    description: enhancedDescription,
    keywords: [
      'research',
      'AI research',
      'DeepDive AI',
      report.depth,
      depthLabel,
      ...topTags,
      ...sectionTitles,
    ],
    authors: report.ownerUsername
      ? [{ name: `@${report.ownerUsername}` }]
      : [{ name: 'DeepDive AI' }],
    creator: report.ownerUsername || 'DeepDive AI',
    publisher: 'DeepDive AI',

    openGraph: {
      type: 'article',
      url: pageUrl,
      title: fullTitle,
      description: enhancedDescription,
      siteName: 'DeepDive AI',
      locale: 'en_US',
      publishedTime: report.completedAt ?? report.createdAt,
      modifiedTime: report.completedAt ?? report.createdAt,
      tags: [depthLabel, sourcesStr, sectionsStr, ...topTags],
      // OG Image with theme awareness
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${title} - ${depthLabel} Research Report by DeepDive AI`,
          type: 'image/png',
        },
      ],
      // Article-specific OG fields
      section: depthLabel,
    },

    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: enhancedDescription,
      site: '@deepdiveai',
      creator: report.ownerUsername ? `@${report.ownerUsername}` : '@deepdiveai',
      images: [ogImageUrl],
    },

    alternates: {
      canonical: pageUrl,
    },

    // Additional metadata for rich results
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },

    other: {
      // Article-specific meta
      'article:published_time': report.completedAt ?? report.createdAt,
      'article:modified_time': report.completedAt ?? report.createdAt,
      'article:section': depthLabel,
      'article:tag': topTags.join(', '),
      'article:reading_time': String(readingTime),
      'article:author': report.ownerUsername || 'DeepDive AI',

      // Custom DeepDive meta for potential scrapers
      'deepdive:report-id': report.reportId,
      'deepdive:depth': report.depth,
      'deepdive:depth-label': depthLabel,
      'deepdive:sources': String(report.sourcesCount),
      'deepdive:reliability': String(report.reliabilityScore),
      'deepdive:sections': String(report.sections.length),
      'deepdive:reading-time': String(readingTime),
      'deepdive:color': depthColor,
    },
  };
}

/**
 * Build JSON-LD structured data for rich search results
 * Returns a JSON string for embedding in the page <head>
 * Usage: dangerouslySetInnerHTML={{ __html: buildJsonLd(report, shareId) }}
 */
export function buildJsonLd(report: PublicReport, shareId: string): string {
  const pageUrl = `${APP_URL}/r/${shareId}`;
  const datePublished = report.completedAt ?? report.createdAt;
  const depthLabel = DEPTH_LABELS[report.depth] ?? 'Research';
  const topTags = report.tags?.slice(0, 5) ?? [];

  // Calculate reading time
  const wordCount = report.sections.reduce(
    (sum, s) => sum + (s.content?.split(/\s+/).length ?? 0),
    0,
  );
  const readingTime = Math.max(1, Math.round(wordCount / 200));

  // Build author object
  const author = report.ownerUsername
    ? {
        '@type': 'Person',
        name: report.ownerUsername,
        url: `${APP_URL}/u/${report.ownerUsername}`,
      }
    : {
        '@type': 'Organization',
        name: 'DeepDive AI',
        url: APP_URL,
      };

  // Build citation list
  const citations = report.citations.slice(0, 10).map(c => ({
    '@type': 'CreativeWork',
    name: c.title || 'Source',
    url: c.url,
    author: c.source || 'Unknown',
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title,
    alternativeHeadline: `${depthLabel}: ${report.query}`,
    description: report.executiveSummary.slice(0, 300),
    url: pageUrl,
    datePublished,
    dateModified: datePublished,
    author,
    publisher: {
      '@type': 'Organization',
      name: 'DeepDive AI',
      url: APP_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${APP_URL}/icon.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    articleSection: depthLabel,
    wordCount,
    timeRequired: `PT${readingTime}M`,
    keywords: topTags.join(', '),
    about: topTags.map(tag => ({
      '@type': 'Thing',
      name: tag,
    })),
    citation: citations.length > 0 ? citations : undefined,
    // Educational context
    educationalUse: 'Research Report',
    audience: {
      '@type': 'Audience',
      name: 'Researchers, analysts, and knowledge workers',
    },
    // Add Breadcrumb for navigation
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: APP_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Research',
          item: `${APP_URL}/discover`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: report.title.slice(0, 50),
          item: pageUrl,
        },
      ],
    },
  };

  return JSON.stringify(jsonLd);
}

/**
 * Generate a theme-aware OG image URL
 * Can be used for custom image generation
 */
export function buildOgImageUrl(report: PublicReport): string {
  const depthColor = DEPTH_COLORS[report.depth] ?? '#6C63FF';
  const title = encodeURIComponent(report.title.slice(0, 60));
  const depthLabel = DEPTH_LABELS[report.depth] ?? 'Research';
  
  return `${APP_URL}/api/og?title=${title}&depth=${depthLabel}&color=${encodeURIComponent(depthColor)}`;
}

/**
 * Get theme color for the report
 * Useful for theme-color meta tag
 */
export function getReportThemeColor(report: PublicReport): string {
  return DEPTH_COLORS[report.depth] ?? '#6C63FF';
}

/**
 * Get reading time in minutes
 */
export function getReadingTime(report: PublicReport): number {
  const wordCount = report.sections.reduce(
    (sum, s) => sum + (s.content?.split(/\s+/).length ?? 0),
    0,
  );
  return Math.max(1, Math.round(wordCount / 200));
}