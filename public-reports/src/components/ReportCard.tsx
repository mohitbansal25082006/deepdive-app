// Public-Reports/src/components/ReportCard.tsx
// Part 55.9 — Fully Themed Report Card (No Event Handlers)
// Card used in /discover and /topic/[tag] feeds.
// Fully server-renderable (no client hooks).

import Link from 'next/link';
import type { PublicFeedReport } from '@/types/report';

interface ReportCardProps {
  report: PublicFeedReport;
  /** Highlight a specific tag (applies active styling to that chip) */
  activeTag?: string;
}

const DEPTH_CONFIG = {
  quick: { label: 'Quick', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
  deep: { label: 'Deep Dive', color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)' },
  expert: { label: 'Expert Mode', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
} as const;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ReportCard({ report, activeTag }: ReportCardProps) {
  const depth = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
  const isAcademic = report.researchMode === 'academic';

  return (
    <Link
      href={`/r/${report.shareId}`}
      style={{ textDecoration: 'none', display: 'block' }}
      className="report-card-link"
    >
      <article
        className="report-card h-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'var(--theme-background-card)',
          border: '1px solid var(--theme-border)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* ── Top accent bar ── */}
        <div
          className="report-card-accent"
          style={{
            height: '3px',
            background: `linear-gradient(90deg, ${depth.color} 0%, var(--theme-primary) 100%)`,
            flexShrink: 0,
            opacity: 0.8,
            transition: 'opacity 0.3s ease',
          }}
        />

        <div className="flex flex-col flex-1 p-5 gap-3">
          {/* ── Meta row ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Depth badge */}
            <span
              className="report-card-depth-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
              style={{
                color: depth.color,
                background: depth.bg,
                borderColor: depth.border,
                transition: 'all 0.3s ease',
              }}
            >
              {depth.label}
            </span>

            {/* Academic badge */}
            {isAcademic && (
              <span
                className="report-card-academic-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border"
                style={{
                  color: '#FFFFFF',
                  background: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  boxShadow: '0 2px 8px var(--theme-primary)',
                  transition: 'all 0.3s ease',
                }}
              >
                🎓 Academic
              </span>
            )}

            {/* View count */}
            {report.viewCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--theme-text-muted)' }}
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
            className="report-card-title font-bold leading-snug line-clamp-2"
            style={{
              color: 'var(--theme-text-primary)',
              fontSize: '0.9375rem',
              transition: 'color 0.3s ease',
            }}
          >
            {report.cachedTitle || 'Untitled Report'}
          </h2>

          {/* ── Summary ── */}
          {report.cachedSummary && (
            <p
              className="text-xs leading-relaxed line-clamp-3 flex-1"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              {report.cachedSummary}
            </p>
          )}

          {/* ── Tags ── */}
          {report.tags && report.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {report.tags.slice(0, 4).map(tag => {
                const isActive = activeTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <span
                    key={tag}
                    className="report-card-tag inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: isActive
                        ? 'var(--theme-primary)'
                        : 'var(--theme-background-elevated)',
                      border: `1px solid ${isActive ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
                      color: isActive ? '#FFFFFF' : 'var(--theme-text-secondary)',
                      boxShadow: isActive ? '0 2px 8px var(--theme-primary)' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    #{tag}
                  </span>
                );
              })}
              {report.tags.length > 4 && (
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'var(--theme-background-elevated)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-muted)',
                  }}
                >
                  +{report.tags.length - 4}
                </span>
              )}
            </div>
          )}

          {/* ── Footer row ── */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-3"
            style={{ borderTop: '1px solid var(--theme-border)' }}>
            {/* Author */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="report-card-avatar w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  boxShadow: '0 2px 8px var(--theme-primary)',
                  transition: 'all 0.3s ease',
                }}
              >
                {(report.ownerUsername?.[0] ?? 'D').toUpperCase()}
              </div>
              <span
                className="text-xs truncate font-medium"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {report.ownerUsername ? `@${report.ownerUsername}` : 'Anonymous'}
              </span>
            </div>

            {/* Date */}
            <span className="text-xs flex-shrink-0 font-medium" style={{ color: 'var(--theme-text-muted)' }}>
              {formatRelative(report.createdAt)}
            </span>
          </div>
        </div>

        {/* Hover glow effect - pure CSS */}
        <div
          className="report-card-glow absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 40% at 50% 100%, var(--theme-primary) 0%, transparent 70%)',
            opacity: 0,
            transition: 'opacity 0.5s ease',
          }}
        />
      </article>

      <style>{`
        /* ── Card hover effects using pure CSS ── */
        .report-card-link {
          display: block;
          text-decoration: none;
        }

        .report-card-link:hover .report-card {
          transform: scale(1.02);
          border-color: var(--theme-primary);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }

        .report-card-link:hover .report-card-accent {
          opacity: 1;
        }

        .report-card-link:hover .report-card-depth-badge {
          transform: scale(1.05);
        }

        .report-card-link:hover .report-card-academic-badge {
          transform: scale(1.05);
        }

        .report-card-link:hover .report-card-title {
          color: var(--theme-primary);
        }

        .report-card-link:hover .report-card-tag {
          transform: scale(1.05);
        }

        .report-card-link:hover .report-card-avatar {
          transform: scale(1.1);
        }

        .report-card-link:hover .report-card-glow {
          opacity: 0.04;
        }

        /* ── Reduced motion support ── */
        @media (prefers-reduced-motion: reduce) {
          .report-card,
          .report-card-accent,
          .report-card-depth-badge,
          .report-card-academic-badge,
          .report-card-title,
          .report-card-tag,
          .report-card-avatar,
          .report-card-glow {
            transition-duration: 0.01ms !important;
          }
          
          .report-card-link:hover .report-card {
            transform: none !important;
          }
        }
      `}</style>
    </Link>
  );
}

/* ── Micro icons ──────────────────────────────────────────────────────────── */

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}