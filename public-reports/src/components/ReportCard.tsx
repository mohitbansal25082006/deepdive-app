// Public-Reports/src/components/ReportCard.tsx
// Card used in /discover and /topic/[tag] feeds.
// Fully server-renderable (no client hooks).

import Link                from 'next/link';
import type { PublicFeedReport } from '@/types/report';

interface ReportCardProps {
  report:     PublicFeedReport;
  /** Highlight a specific tag (applies active styling to that chip) */
  activeTag?: string;
}

const DEPTH_CONFIG = {
  quick:  { label: 'Quick',       color: '#10B981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)'  },
  deep:   { label: 'Deep Dive',   color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)' },
  expert: { label: 'Expert Mode', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
} as const;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ReportCard({ report, activeTag }: ReportCardProps) {
  const depth  = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
  const isAcademic = report.researchMode === 'academic';

  return (
    <Link
      href={`/r/${report.shareId}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <article
        className="group h-full flex flex-col rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.015] hover:shadow-lg"
        style={{
          background:  'var(--bg-card)',
          border:      '1px solid var(--border)',
          cursor:      'pointer',
        }}
      >
        {/* ── Top accent bar ── */}
        <div
          style={{
            height:     '3px',
            background: `linear-gradient(90deg, ${depth.color} 0%, transparent 100%)`,
            flexShrink:  0,
          }}
        />

        <div className="flex flex-col flex-1 p-5 gap-3">
          {/* ── Meta row ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Depth badge */}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border"
              style={{
                color:       depth.color,
                background:  depth.bg,
                borderColor: depth.border,
              }}
            >
              {depth.label}
            </span>

            {/* Academic badge */}
            {isAcademic && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
                style={{
                  color:       '#6C63FF',
                  background:  'rgba(108,99,255,0.1)',
                  borderColor: 'rgba(108,99,255,0.3)',
                }}
              >
                🎓 Academic
              </span>
            )}

            {/* View count */}
            {report.viewCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <EyeIcon />
                {report.viewCount >= 1000
                  ? `${(report.viewCount / 1000).toFixed(1)}k`
                  : report.viewCount}
              </span>
            )}
          </div>

          {/* ── Title ── */}
          <h2
            className="font-bold leading-snug line-clamp-2 group-hover:text-[var(--brand)] transition-colors"
            style={{
              color:    'var(--text-primary)',
              fontSize: '0.9375rem',
            }}
          >
            {report.cachedTitle || 'Untitled Report'}
          </h2>

          {/* ── Summary ── */}
          {report.cachedSummary && (
            <p
              className="text-xs leading-relaxed line-clamp-3 flex-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {report.cachedSummary}
            </p>
          )}

          {/* ── Tags ── */}
          {report.tags && report.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {report.tags.slice(0, 4).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background:  activeTag?.toLowerCase() === tag.toLowerCase()
                      ? 'rgba(108,99,255,0.2)'
                      : 'var(--bg-elevated)',
                    border:      '1px solid ' + (
                      activeTag?.toLowerCase() === tag.toLowerCase()
                        ? 'rgba(108,99,255,0.4)'
                        : 'var(--border)'
                    ),
                    color:       activeTag?.toLowerCase() === tag.toLowerCase()
                      ? '#A78BFA'
                      : 'var(--text-muted)',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* ── Footer row ── */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2"
               style={{ borderTop: '1px solid var(--border)' }}>
            {/* Author */}
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{
                  background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
                  color:      '#fff',
                  fontSize:   '9px',
                }}
              >
                {(report.ownerUsername?.[0] ?? 'D').toUpperCase()}
              </div>
              <span
                className="text-xs truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {report.ownerUsername ? `@${report.ownerUsername}` : 'Anonymous'}
              </span>
            </div>

            {/* Date */}
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              {formatRelative(report.createdAt)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

/* ── Micro icons ──────────────────────────────────────────────────────────── */

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}