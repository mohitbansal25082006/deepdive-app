'use client';
// Public-Reports/src/components/ReportSectionCard.tsx
// Part 55.9 — Fully Themed Report Section Card
// Part 34 updates:
//   1. Each article element gets an `id` anchor for TableOfContents scroll-spy
//   2. SectionReactions appended at the bottom of every expanded section
//   3. New props: shareId, initialReactions
// All Part 33 behaviour preserved exactly.

import { useState } from 'react';
import type { ReportSection, Citation, ReactionEmoji } from '@/types/report';
import { getSectionAnchorId } from '@/lib/readTime';
import SectionReactions from '@/components/SectionReactions';

interface ReportSectionCardProps {
  section: ReportSection;
  citations: Citation[];
  index: number;
  shareId?: string;
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

  const anchorId = getSectionAnchorId(section, index);
  const reactionSectionId = section.id || anchorId;

  return (
    <article
      id={anchorId}
      className="rounded-2xl overflow-hidden animate-fade-in-up transition-all duration-300 hover:shadow-xl"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderLeftWidth: '4px',
        borderLeftColor: expanded ? accentColor : 'var(--theme-border)',
        animationDelay: `${index * 60}ms`,
        transition: 'border-left-color 0.3s ease, box-shadow 0.3s ease',
        scrollMarginTop: '80px',
      }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-all duration-300 hover:bg-white/[0.02] group"
        aria-expanded={expanded}
        aria-controls={`section-body-${anchorId}`}
      >
        {/* Number bubble */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-extrabold transition-all duration-300 group-hover:scale-105"
          style={{
            background: `${accentColor}20`,
            color: accentColor,
            boxShadow: expanded ? `0 0 20px ${accentColor}30` : 'none',
          }}
        >
          {index + 1}
        </div>

        {/* Title + preview */}
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold text-base leading-snug transition-colors duration-300 group-hover:text-[var(--theme-primary)]"
            style={{ color: 'var(--theme-text-primary)' }}
          >
            {section.title}
          </h2>
          {!expanded && section.content && (
            <p
              className="text-xs mt-0.5 line-clamp-1"
              style={{ color: 'var(--theme-text-muted)' }}
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
          stroke="var(--theme-text-muted)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 transition-all duration-300 group-hover:scale-110"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── Body ── */}
      {expanded && (
        <div
          id={`section-body-${anchorId}`}
          className="px-5 pb-5"
        >
          <div className="mb-4" style={{ height: '1px', background: 'var(--theme-border)' }} />

          {/* Main content */}
          {section.content && (
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              {section.content}
            </p>
          )}

          {/* Bullets */}
          {section.bullets && section.bullets.length > 0 && (
            <ul className="space-y-2 mb-4" role="list">
              {section.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm"
                  style={{ color: 'var(--theme-text-secondary)' }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2 transition-all duration-300"
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
                style={{ color: 'var(--theme-text-muted)' }}>
                Key Statistics
              </p>
              {section.statistics.slice(0, 4).map((stat, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl transition-all duration-300 hover:shadow-md"
                  style={{
                    background: `${accentColor}10`,
                    border: `1px solid ${accentColor}30`,
                  }}
                >
                  <span className="font-extrabold text-sm flex-shrink-0"
                    style={{ color: accentColor }}>
                    {stat.value}
                  </span>
                  <span className="text-xs leading-relaxed"
                    style={{ color: 'var(--theme-text-secondary)' }}>
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
                style={{ color: 'var(--theme-text-muted)' }}>
                {sectionCitations.length} Source{sectionCitations.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {sectionCitations.slice(0, 5).map(c => {
                  let hostname = c.source;
                  try { hostname = new URL(c.url).hostname.replace('www.', ''); } catch { }
                  return (
                    <a
                      key={c.id}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105 hover:shadow-md"
                      style={{
                        background: 'var(--theme-background-elevated)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-text-muted)',
                        maxWidth: '180px',
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

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </article>
  );
}

/* ── Icon ────────────────────────────────────────────────────────────────── */

function ExternalLinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      strokeLinejoin="round" className="flex-shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}