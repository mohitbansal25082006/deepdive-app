'use client';
// Public-Reports/src/components/ResearcherCard.tsx
// Part 37 — Researcher card for /discover Researchers tab.
// Part 37 FIX — Shows public_report_count (reports with active share_links)
//               instead of total report_count. Recent reports also public-only.

import Link from 'next/link';
import type { ResearcherRow } from '@/app/api/researchers/route';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
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
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      {icon}
      <span style={{ color: 'var(--text-primary, #F0F0FF)', fontSize: '0.75rem', fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'var(--text-muted, #6060A0)', fontSize: '0.65rem' }}>{label}</span>
    </div>
  );
}

const PeopleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted,#6060A0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const DocIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted,#6060A0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

interface ResearcherCardProps {
  researcher:    ResearcherRow;
  playStoreUrl?: string;
}

export default function ResearcherCard({ researcher, playStoreUrl = '#' }: ResearcherCardProps) {
  // FIX: Properly handle null/undefined values for display name
  const displayName = researcher.full_name ?? (researcher.username ? `@${researcher.username}` : 'Researcher');
  const initials    = getInitials(researcher.full_name, researcher.username);
  const profileUrl  = researcher.username ? `/u/${researcher.username}` : '#';
  const interests   = Array.isArray(researcher.interests) ? researcher.interests : [];

  // FIX: Use public_report_count (only published reports with share_links).
  // Falls back to report_count for backwards compat if the schema patch hasn't been run.
  const publicReportCount  = (researcher as any).public_report_count ?? researcher.report_count ?? 0;
  // Recent reports = public reports in last 30 days (from schema fix)
  const recentPublicReports = (researcher as any).recent_reports ?? 0;

  return (
    <article
      style={{
        background: 'var(--bg-card, #0F0F23)',
        border: '1px solid var(--border, rgba(255,255,255,0.07))',
        borderRadius: 20, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
      }}
      className="researcher-card"
    >
      {/* Top accent bar */}
      <div style={{
        height: '3px', flexShrink: 0,
        background: 'linear-gradient(90deg, #6C63FF 0%, #8B5CF6 50%, transparent 100%)',
      }} />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Link href={profileUrl} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
              border: '2px solid rgba(108,99,255,0.3)', flexShrink: 0,
            }}>
              {researcher.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={researcher.avatar_url} alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
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
              <p style={{
                color: 'var(--text-primary, #F0F0FF)', fontSize: '0.9375rem', fontWeight: 700,
                lineHeight: 1.2, marginBottom: 2, letterSpacing: '-0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {displayName}
              </p>
            </Link>
            {researcher.username && (
              <p style={{ color: 'rgba(108,99,255,0.8)', fontSize: '0.75rem', marginBottom: 5 }}>
                @{researcher.username}
              </p>
            )}
            {researcher.bio && (
              <p style={{
                color: 'var(--text-muted, #6060A0)', fontSize: '0.75rem', lineHeight: 1.55,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
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
              <span key={tag} style={{
                padding: '3px 8px', borderRadius: '999px',
                background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.22)',
                color: '#A78BFA', fontSize: '0.65rem', fontWeight: 600,
              }}>
                {tag}
              </span>
            ))}
            {interests.length > 4 && (
              <span style={{
                padding: '3px 8px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                color: 'var(--text-muted, #6060A0)', fontSize: '0.65rem', fontWeight: 600,
              }}>
                +{interests.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Stats row — FIX: use public_report_count, not total report_count */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatPill
            icon={<PeopleIcon />}
            value={formatCount(researcher.follower_count)}
            label="followers"
          />
          <StatPill
            icon={<DocIcon />}
            // FIX: publicReportCount = reports with active share_links only
            value={String(publicReportCount)}
            label="public reports"
          />
          {recentPublicReports > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: '999px',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
              color: '#10B981', fontSize: '0.65rem', fontWeight: 700,
            }}>
              ● {recentPublicReports} this month
            </span>
          )}
        </div>

        {/* Footer: View profile + Follow CTA */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10,
          borderTop: '1px solid var(--border, rgba(255,255,255,0.07))', alignItems: 'center',
        }}>
          <Link href={profileUrl} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '8px 12px', borderRadius: '10px',
            background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)',
            color: '#A78BFA', fontSize: '0.78rem', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            View Profile
          </Link>
          <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
            title="Follow on DeepDive" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '8px 12px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
              color: '#fff', fontSize: '0.78rem', fontWeight: 700,
              textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
            <ExternalIcon />Follow
          </a>
        </div>
      </div>
      <style>{`.researcher-card:hover { border-color: rgba(108,99,255,0.35) !important; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(108,99,255,0.12); }`}</style>
    </article>
  );
}