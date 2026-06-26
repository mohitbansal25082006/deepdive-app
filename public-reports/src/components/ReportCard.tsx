// Public-Reports/src/components/ReportCard.tsx
// Part 55.10 — Redesigned card: full title visible, author links to /u/[username]

import Link from 'next/link';
import type { PublicFeedReport } from '@/types/report';

interface ReportCardProps {
  report: PublicFeedReport;
  activeTag?: string;
}

const DEPTH_CONFIG = {
  quick:  { label: 'Quick',       color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  accent: '#10B981' },
  deep:   { label: 'Deep Dive',   color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)',  accent: '#6C63FF' },
  expert: { label: 'Expert Mode', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)',  accent: '#F59E0B' },
} as const;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0)  return 'Today';
  if (days === 1)  return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ReportCard({ report, activeTag }: ReportCardProps) {
  const depth       = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
  const visibleTags = (report.tags ?? []).filter(t => t && t.trim().length > 0);
  const initial     = (report.ownerUsername?.[0] ?? 'D').toUpperCase();

  return (
    <>
      {/*
        ── Structure ────────────────────────────────────────────────────────────
        The outer <article> is the card. The main <Link> covers the whole card
        via absolute inset so the whole surface is clickable.
        The author row is a separate <Link> rendered ON TOP (z-index: 2) so it
        intercepts its own clicks and navigates to /u/[username] instead.
        Tags also sit at z-index: 2 and link to /topic/[tag].
        ────────────────────────────────────────────────────────────────────── */}

      <article
        className="rc"
        style={{
          position:   'relative',
          background: 'var(--theme-background-card)',
          border:     '1px solid var(--theme-border)',
          borderRadius: 18,
          overflow:   'hidden',
          display:    'flex',
          flexDirection: 'column',
          transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Depth accent bar ── */}
        <div
          className="rc-accent"
          style={{
            height:     3,
            flexShrink: 0,
            background: `linear-gradient(90deg, ${depth.accent} 0%, var(--theme-primary) 100%)`,
            opacity:    0.75,
            transition: 'opacity 0.28s ease',
          }}
        />

        {/* ── Main clickable area — covers whole card ── */}
        <Link
          href={`/r/${report.shareId}`}
          className="rc-main-link"
          aria-label={report.cachedTitle || 'View report'}
          style={{
            position:      'absolute',
            inset:         0,
            zIndex:        1,
            display:       'block',
            textDecoration:'none',
          }}
        />

        {/* ── Card body ── */}
        <div style={{ padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>

          {/* Meta row: depth badge + view count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="rc-depth"
              style={{
                display:     'inline-flex',
                alignItems:  'center',
                padding:     '3px 10px',
                borderRadius: 999,
                fontSize:    '0.68rem',
                fontWeight:  700,
                color:       depth.color,
                background:  depth.bg,
                border:      `1px solid ${depth.border}`,
                transition:  'transform 0.2s ease',
                flexShrink:  0,
              }}
            >
              {depth.label}
            </span>

            {report.viewCount > 0 && (
              <span
                style={{
                  marginLeft:  'auto',
                  display:     'flex',
                  alignItems:  'center',
                  gap:         4,
                  fontSize:    '0.7rem',
                  fontWeight:  600,
                  color:       'var(--theme-text-muted)',
                  flexShrink:  0,
                }}
              >
                <EyeIcon />
                {formatCount(report.viewCount)}
              </span>
            )}
          </div>

          {/* ── Title — FULL, no clamp ── */}
          <h2
            className="rc-title"
            style={{
              fontSize:     '0.9375rem',
              fontWeight:   800,
              lineHeight:   1.45,
              color:        'var(--theme-text-primary)',
              letterSpacing:'-0.01em',
              margin:       0,
              transition:   'color 0.2s ease',
              // No line-clamp — title is always fully visible
            }}
          >
            {report.cachedTitle || 'Untitled Report'}
          </h2>

          {/* ── Summary — 3-line clamp ── */}
          {report.cachedSummary && (
            <p
              style={{
                fontSize:          '0.76rem',
                lineHeight:        1.65,
                color:             'var(--theme-text-secondary)',
                margin:            0,
                display:           '-webkit-box',
                WebkitLineClamp:   3,
                WebkitBoxOrient:   'vertical' as const,
                overflow:          'hidden',
              }}
            >
              {report.cachedSummary}
            </p>
          )}

          {/* ── Tags — z:2 so they get their own clicks ── */}
          {visibleTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, position: 'relative', zIndex: 2 }}>
              {visibleTags.slice(0, 4).map(tag => {
                const isActive = activeTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <Link
                    key={tag}
                    href={`/topic/${encodeURIComponent(tag.toLowerCase())}`}
                    style={{
                      display:       'inline-flex',
                      alignItems:    'center',
                      padding:       '3px 10px',
                      borderRadius:  999,
                      fontSize:      '0.68rem',
                      fontWeight:    600,
                      textDecoration:'none',
                      background:    isActive ? 'var(--theme-primary)' : 'var(--theme-background-elevated)',
                      border:        `1px solid ${isActive ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
                      color:         isActive ? '#FFFFFF' : 'var(--theme-text-secondary)',
                      boxShadow:     isActive ? '0 2px 8px var(--theme-primary)' : 'none',
                      transition:    'all 0.18s ease',
                    }}
                    className="rc-tag"
                  >
                    #{tag}
                  </Link>
                );
              })}
              {visibleTags.length > 4 && (
                <span
                  style={{
                    display:    'inline-flex',
                    alignItems: 'center',
                    padding:    '3px 10px',
                    borderRadius: 999,
                    fontSize:   '0.68rem',
                    fontWeight: 600,
                    background: 'var(--theme-background-elevated)',
                    border:     '1px solid var(--theme-border)',
                    color:      'var(--theme-text-muted)',
                  }}
                >
                  +{visibleTags.length - 4}
                </span>
              )}
            </div>
          )}

          {/* ── Footer: author + date ── */}
          <div
            style={{
              display:       'flex',
              alignItems:    'center',
              justifyContent:'space-between',
              gap:           8,
              marginTop:     'auto',
              paddingTop:    10,
              borderTop:     '1px solid var(--theme-border)',
            }}
          >
            {/*
              Author — a real <Link> at z-index:2 that overrides the card's
              background link. Clicking avatar or username goes to /u/[username].
            */}
            {report.ownerUsername ? (
              <Link
                href={`/u/${report.ownerUsername}`}
                className="rc-author"
                style={{
                  position:       'relative',
                  zIndex:         2,
                  display:        'flex',
                  alignItems:     'center',
                  gap:            7,
                  minWidth:       0,
                  textDecoration: 'none',
                  flexShrink:     1,
                  overflow:       'hidden',
                }}
              >
                {/* Avatar */}
                <div
                  className="rc-avatar"
                  style={{
                    width:        26,
                    height:       26,
                    borderRadius: '50%',
                    flexShrink:   0,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent:'center',
                    fontSize:     10,
                    fontWeight:   800,
                    background:   'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                    color:        '#FFFFFF',
                    boxShadow:    '0 2px 8px var(--theme-primary)',
                    transition:   'transform 0.2s ease, box-shadow 0.2s ease',
                    userSelect:   'none',
                  }}
                  aria-hidden
                >
                  {initial}
                </div>
                {/* Username */}
                <span
                  style={{
                    fontSize:    '0.75rem',
                    fontWeight:  600,
                    color:       'var(--theme-text-secondary)',
                    overflow:    'hidden',
                    textOverflow:'ellipsis',
                    whiteSpace:  'nowrap',
                    transition:  'color 0.2s ease',
                  }}
                  className="rc-author-name"
                >
                  @{report.ownerUsername}
                </span>
              </Link>
            ) : (
              /* Anonymous — not a link */
              <div
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        7,
                  minWidth:   0,
                  flexShrink: 1,
                  overflow:   'hidden',
                }}
              >
                <div
                  style={{
                    width:         26,
                    height:        26,
                    borderRadius:  '50%',
                    flexShrink:    0,
                    display:       'flex',
                    alignItems:    'center',
                    justifyContent:'center',
                    fontSize:      10,
                    fontWeight:    800,
                    background:    'var(--theme-background-elevated)',
                    color:         'var(--theme-text-muted)',
                    border:        '1px solid var(--theme-border)',
                  }}
                >
                  ?
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                  Anonymous
                </span>
              </div>
            )}

            {/* Date */}
            <span
              style={{
                fontSize:   '0.7rem',
                fontWeight: 500,
                color:      'var(--theme-text-muted)',
                flexShrink: 0,
              }}
            >
              {formatRelative(report.createdAt)}
            </span>
          </div>
        </div>

        {/* Hover glow overlay */}
        <div
          className="rc-glow"
          style={{
            position:      'absolute',
            inset:         0,
            pointerEvents: 'none',
            borderRadius:  18,
            background:    'radial-gradient(ellipse 80% 40% at 50% 100%, var(--theme-primary) 0%, transparent 70%)',
            opacity:       0,
            transition:    'opacity 0.4s ease',
          }}
        />
      </article>

      <style>{`
        /* ── Card hover ── */
        .rc:hover {
          transform: translateY(-4px) scale(1.005);
          border-color: var(--theme-primary) !important;
          box-shadow: 0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px var(--theme-primary);
        }
        .rc:hover .rc-accent   { opacity: 1 !important; }
        .rc:hover .rc-title    { color: var(--theme-primary) !important; }
        .rc:hover .rc-glow     { opacity: 0.05 !important; }
        .rc:hover .rc-depth    { transform: scale(1.05); }

        /* ── Author hover ── */
        .rc-author:hover .rc-avatar {
          transform: scale(1.12) !important;
          box-shadow: 0 4px 14px var(--theme-primary) !important;
        }
        .rc-author:hover .rc-author-name {
          color: var(--theme-primary) !important;
        }

        /* ── Tag hover ── */
        .rc-tag:hover {
          background: var(--theme-primary) !important;
          border-color: var(--theme-primary) !important;
          color: #FFFFFF !important;
          transform: scale(1.06);
          box-shadow: 0 2px 10px var(--theme-primary);
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          .rc, .rc-accent, .rc-title, .rc-glow,
          .rc-depth, .rc-avatar, .rc-author-name, .rc-tag {
            transition-duration: 0.01ms !important;
          }
          .rc:hover { transform: none !important; }
          .rc-author:hover .rc-avatar { transform: none !important; }
          .rc-tag:hover { transform: none !important; }
        }
      `}</style>
    </>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}