'use client';
// Public-Reports/src/components/ResearcherCard.tsx
// Part 55.9 — Fully Themed Researcher Card
// Part 37 — Researcher card for /discover Researchers tab.
// Part 37 FIX — Shows public_report_count (reports with active share_links)
//               instead of total report_count. Recent reports also public-only.

import Link from 'next/link';
import type { ResearcherRow } from '@/app/api/researchers/route';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getInitials(fullName: string | null, username: string | null): string {
  const src = fullName ?? username ?? '?';
  return src.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: '999px',
      background: 'var(--theme-background-elevated)',
      border: '1px solid var(--theme-border)',
      transition: 'all 0.3s ease',
    }}
    className="stat-pill"
    >
      {icon}
      <span style={{ color: 'var(--theme-text-primary)', fontSize: '0.75rem', fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.65rem' }}>{label}</span>
    </div>
  );
}

const PeopleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--theme-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const DocIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--theme-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

interface ResearcherCardProps {
  researcher: ResearcherRow;
  playStoreUrl?: string;
}

export default function ResearcherCard({ researcher, playStoreUrl = '#' }: ResearcherCardProps) {
  const displayName = researcher.full_name ?? (researcher.username ? `@${researcher.username}` : 'Researcher');
  const initials = getInitials(researcher.full_name, researcher.username);
  const profileUrl = researcher.username ? `/u/${researcher.username}` : '#';
  const interests = Array.isArray(researcher.interests) ? researcher.interests : [];

  const publicReportCount = (researcher as any).public_report_count ?? researcher.report_count ?? 0;
  const recentPublicReports = (researcher as any).recent_reports ?? 0;

  return (
    <article
      className="researcher-card group"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
      }}
    >
      {/* Top accent bar */}
      <div style={{
        height: '3px',
        flexShrink: 0,
        background: 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2), transparent 100%)',
        transition: 'opacity 0.3s ease',
      }}
      className="researcher-accent"
      />

      <div style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
      }}>

        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Link href={profileUrl} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div
              className="researcher-avatar"
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid var(--theme-border)',
                flexShrink: 0,
                transition: 'all 0.3s ease',
              }}
            >
              {researcher.avatar_url ? (
                <img src={researcher.avatar_url} alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em',
                }}>
                  {initials}
                </div>
              )}
            </div>
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href={profileUrl} style={{ textDecoration: 'none' }}>
              <p
                className="researcher-name"
                style={{
                  color: 'var(--theme-text-primary)',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  marginBottom: 2,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.3s ease',
                }}
              >
                {displayName}
              </p>
            </Link>
            {researcher.username && (
              <p style={{ color: 'var(--theme-primary)', fontSize: '0.75rem', marginBottom: 5 }}>
                @{researcher.username}
              </p>
            )}
            {researcher.bio && (
              <p style={{
                color: 'var(--theme-text-secondary)',
                fontSize: '0.75rem',
                lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {researcher.bio}
              </p>
            )}
          </div>
        </div>

        {/* Interest tags */}
        {interests.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {interests.slice(0, 4).map(tag => (
              <span key={tag}
                className="interest-tag"
                style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: 'var(--theme-primary)',
                  border: '1px solid var(--theme-primary)',
                  color: '#FFFFFF',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                {tag}
              </span>
            ))}
            {interests.length > 4 && (
              <span style={{
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'var(--theme-background-elevated)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-muted)',
                fontSize: '0.65rem',
                fontWeight: 600,
              }}>
                +{interests.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatPill
            icon={<PeopleIcon />}
            value={formatCount(researcher.follower_count)}
            label="followers"
          />
          <StatPill
            icon={<DocIcon />}
            value={String(publicReportCount)}
            label="public reports"
          />
          {recentPublicReports > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'var(--theme-success)',
              border: '1px solid var(--theme-success)',
              color: '#FFFFFF',
              fontSize: '0.65rem',
              fontWeight: 700,
              boxShadow: '0 2px 8px var(--theme-success)',
            }}>
              ● {recentPublicReports} this month
            </span>
          )}
        </div>

        {/* Footer: View profile + Follow CTA */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: '1px solid var(--theme-border)',
          alignItems: 'center',
        }}>
          <Link href={profileUrl} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'var(--theme-primary)',
            border: '1px solid var(--theme-primary)',
            color: '#FFFFFF',
            fontSize: '0.78rem',
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px var(--theme-primary)',
          }}
          className="view-profile-btn"
          >
            View Profile
          </Link>
          <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
            title="Follow on DeepDive" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
              color: '#FFFFFF',
              fontSize: '0.78rem',
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 12px var(--theme-primary)',
            }}
            className="follow-btn"
          >
            <ExternalIcon />Follow
          </a>
        </div>
      </div>

      {/* Hover glow effect */}
      <div
        className="researcher-glow absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 40% at 50% 100%, var(--theme-primary) 0%, transparent 70%)',
          opacity: 0,
          transition: 'opacity 0.5s ease',
        }}
      />

      <style>{`
        /* ── Card hover effects ── */
        .researcher-card:hover {
          border-color: var(--theme-primary);
          transform: translateY(-3px);
          box-shadow: 0 12px 40px var(--theme-primary);
        }

        .researcher-card:hover .researcher-accent {
          opacity: 1;
        }

        .researcher-card:hover .researcher-avatar {
          border-color: var(--theme-primary);
          transform: scale(1.05);
        }

        .researcher-card:hover .researcher-name {
          color: var(--theme-primary);
        }

        .researcher-card:hover .interest-tag {
          transform: scale(1.05);
          box-shadow: 0 2px 12px var(--theme-primary);
        }

        .researcher-card:hover .stat-pill {
          border-color: var(--theme-primary);
          background: var(--theme-primary);
        }

        .researcher-card:hover .stat-pill span {
          color: #FFFFFF;
        }

        .researcher-card:hover .stat-pill svg {
          stroke: #FFFFFF;
        }

        .researcher-card:hover .view-profile-btn {
          transform: scale(1.02);
          box-shadow: 0 4px 16px var(--theme-primary);
        }

        .researcher-card:hover .follow-btn {
          transform: scale(1.02);
          box-shadow: 0 4px 20px var(--theme-primary);
        }

        .researcher-card:hover .researcher-glow {
          opacity: 0.06;
        }

        /* ── Reduced motion support ── */
        @media (prefers-reduced-motion: reduce) {
          .researcher-card,
          .researcher-accent,
          .researcher-avatar,
          .researcher-name,
          .interest-tag,
          .stat-pill,
          .view-profile-btn,
          .follow-btn,
          .researcher-glow {
            transition-duration: 0.01ms !important;
          }
          
          .researcher-card:hover {
            transform: none !important;
          }
          
          .researcher-card:hover .researcher-avatar {
            transform: none !important;
          }
          
          .researcher-card:hover .interest-tag {
            transform: none !important;
          }
          
          .researcher-card:hover .view-profile-btn {
            transform: none !important;
          }
          
          .researcher-card:hover .follow-btn {
            transform: none !important;
          }
        }
      `}</style>
    </article>
  );
}