'use client';
// Public-Reports/src/components/ReportSectionCard.tsx
// Part 34 updates:
//   1. Each article element gets an `id` anchor for TableOfContents scroll-spy
//   2. SectionReactions appended at the bottom of every expanded section
//   3. New props: shareId, initialReactions
// All Part 33 behaviour preserved exactly.

import { useState }           from 'react';
import type { ReportSection, Citation, ReactionEmoji } from '@/types/report';
import { getSectionAnchorId } from '@/lib/readTime';
import SectionReactions        from '@/components/SectionReactions';

interface ReportSectionCardProps {
  section:    ReportSection;
  citations:  Citation[];
  index:      number;
  /** Part 34: share link ID — passed through to SectionReactions */
  shareId?:   string;
  /**
   * Part 34: pre-fetched reaction counts from the server.
   * Shape: { [emoji]: { count: number; hasReacted: boolean } }
   */
  initialReactions?: Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>;
}

const SECTION_ACCENT_COLORS = [
  '#6C63FF', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6',
];

export default function ReportSectionCard({
  section,
  citations,
  index,
  shareId,
  initialReactions,
}: ReportSectionCardProps) {
  const [expanded, setExpanded] = useState(index < 2);

  const accentColor = SECTION_ACCENT_COLORS[index % SECTION_ACCENT_COLORS.length];

  const sectionCitations = (section.citationIds ?? [])
    .map(id => citations.find(c => c.id === id))
    .filter(Boolean) as Citation[];

  // Part 34: derive the anchor ID for the TOC IntersectionObserver
  const anchorId = getSectionAnchorId(section, index);

  // The sectionId used for reactions — prefer section.id, fallback to anchorId
  const reactionSectionId = section.id || anchorId;

  return (
    <article
      id={anchorId}                   /* ← Part 34: scroll-spy anchor */
      className="rounded-2xl overflow-hidden animate-fade-in-up"
      style={{
        background:      'var(--bg-card)',
        border:          'var(--border)',
        borderStyle:     'solid',
        borderWidth:     '1px',
        borderLeftWidth: '3px',
        borderLeftColor: expanded ? accentColor : 'var(--border)',
        animationDelay:  `${index * 60}ms`,
        transition:      'border-left-color 0.2s ease',
        scrollMarginTop: '80px',      /* account for sticky header when scrolling to anchor */
      }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={expanded}
        aria-controls={`section-body-${anchorId}`}
      >
        {/* Number bubble */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-extrabold"
          style={{
            background: `${accentColor}20`,
            color:       accentColor,
          }}
        >
          {index + 1}
        </div>

        {/* Title + preview */}
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold text-base leading-snug"
            style={{ color: 'var(--text-primary)' }}
          >
            {section.title}
          </h2>
          {!expanded && section.content && (
            <p
              className="text-xs mt-0.5 line-clamp-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.content.slice(0, 120)}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* ── Body ── */}
      {expanded && (
        <div
          id={`section-body-${anchorId}`}
          className="px-5 pb-5"
        >
          <div className="mb-4" style={{ height: '1px', background: 'var(--border)' }} />

          {/* Main content */}
          {section.content && (
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              {section.content}
            </p>
          )}

          {/* Bullets */}
          {section.bullets && section.bullets.length > 0 && (
            <ul className="space-y-2 mb-4" role="list">
              {section.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm"
                    style={{ color: 'var(--text-secondary)' }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
                    style={{ background: accentColor }}
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Section statistics */}
          {section.statistics && section.statistics.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-2"
                 style={{ color: 'var(--text-muted)' }}>
                Key Statistics
              </p>
              {section.statistics.slice(0, 4).map((stat, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    background: `${accentColor}08`,
                    border:     `1px solid ${accentColor}20`,
                  }}
                >
                  <span className="font-extrabold text-sm flex-shrink-0"
                        style={{ color: accentColor }}>
                    {stat.value}
                  </span>
                  <span className="text-xs leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}>
                    {stat.context}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Citations */}
          {sectionCitations.length > 0 && (
            <div className="mb-1">
              <p className="text-xs font-bold uppercase tracking-widest mb-2"
                 style={{ color: 'var(--text-muted)' }}>
                {sectionCitations.length} Source{sectionCitations.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {sectionCitations.slice(0, 5).map(c => {
                  let hostname = c.source;
                  try { hostname = new URL(c.url).hostname.replace('www.', ''); } catch {}
                  return (
                    <a
                      key={c.id}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{
                        background:     'var(--bg-elevated)',
                        border:         '1px solid var(--border)',
                        color:          'var(--text-muted)',
                        maxWidth:       '180px',
                        textDecoration: 'none',
                      }}
                      title={c.title}
                    >
                      <ExternalLinkIcon />
                      <span className="truncate">{hostname}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Part 34: Section reactions ── */}
          {shareId && (
            <SectionReactions
              shareId={shareId}
              sectionId={reactionSectionId}
              initial={initialReactions}
            />
          )}
        </div>
      )}
    </article>
  );
}

/* ── Icon ────────────────────────────────────────────────────────────────── */

function ExternalLinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" className="flex-shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}