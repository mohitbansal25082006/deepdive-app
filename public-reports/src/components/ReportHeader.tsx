// Public-Reports/src/components/ReportHeader.tsx
// Part 34 update: added clickable topic tag chips (→ /topic/[tag])
// All Part 33 behaviour preserved exactly.

import Link             from 'next/link';
import type { PublicReport } from '@/types/report';

interface ReportHeaderProps {
  report: PublicReport;
}

const DEPTH_CONFIG = {
  quick:  { label: 'Quick Scan',  color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  icon: '⚡' },
  deep:   { label: 'Deep Dive',   color: '#6C63FF', bg: 'rgba(108,99,255,0.1)', border: 'rgba(108,99,255,0.3)', icon: '🔬' },
  expert: { label: 'Expert Mode', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '🎯' },
};

const MODE_CONFIG = {
  academic: { label: 'Academic Paper', color: '#6C63FF', icon: '🎓' },
  standard: null,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day:   'numeric',
    year:  'numeric',
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(iso);
}

export default function ReportHeader({ report }: ReportHeaderProps) {
  const depth   = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
  const modeTag = MODE_CONFIG[report.researchMode ?? 'standard'];
  const dateStr = report.completedAt ?? report.createdAt;

  const hasTags = Array.isArray(report.tags) && report.tags.length > 0;

  return (
    <header className="animate-fade-in-up" style={{ animationDelay: '0.05s' }}>

      {/* ── Top meta row ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Depth badge */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
          style={{
            color:       depth.color,
            background:  depth.bg,
            borderColor: depth.border,
          }}
        >
          <span>{depth.icon}</span>
          {depth.label}
        </span>

        {/* Academic mode badge */}
        {modeTag && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
            style={{
              color:       modeTag.color,
              background:  'rgba(108,99,255,0.1)',
              borderColor: 'rgba(108,99,255,0.3)',
            }}
          >
            <span>{modeTag.icon}</span>
            {modeTag.label}
          </span>
        )}

        {/* Date */}
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--text-muted)' }}
          title={formatDate(dateStr)}
        >
          <CalendarIcon />
          {formatRelative(dateStr)}
        </span>

        {/* Sources count */}
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <GlobeIcon />
          {report.sourcesCount} sources
        </span>
      </div>

      {/* ── Title ── */}
      <h1
        className="mb-4 leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize:   'clamp(1.6rem, 4vw, 2.6rem)',
          fontWeight: 800,
          color:      'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        {report.title}
      </h1>

      {/* ── Part 34: Topic tag chips ── */}
      {hasTags && (
        <div
          className="flex flex-wrap gap-2 mb-5"
          aria-label="Topic tags"
        >
          {report.tags.slice(0, 5).map(tag => (
            <Link
              key={tag}
              href={`/topic/${encodeURIComponent(tag.toLowerCase())}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80"
              style={{
                background:     'rgba(108,99,255,0.1)',
                border:         '1px solid rgba(108,99,255,0.25)',
                color:          '#A78BFA',
                textDecoration: 'none',
              }}
              title={`Browse all #${tag} research`}
            >
              <TagIcon />
              {tag}
            </Link>
          ))}
        </div>
      )}

      {/* ── Query chip ── */}
      <div
        className="flex items-start gap-2 mb-5 p-3 rounded-xl"
        style={{
          background: 'var(--bg-elevated)',
          border:     '1px solid var(--border)',
        }}
      >
        <SearchIcon className="flex-shrink-0 mt-0.5" />
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
        >
          <span style={{ color: 'var(--text-secondary)', fontStyle: 'normal', fontWeight: 600 }}>
            Query:{' '}
          </span>
          &ldquo;{report.query}&rdquo;
        </p>
      </div>

      {/* ── Executive summary ── */}
      <div
        className="p-5 rounded-2xl mb-2"
        style={{
          background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)',
          border:     '1px solid rgba(108,99,255,0.2)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
            }}
          >
            <NewspaperIcon />
          </div>
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Executive Summary
          </span>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {report.executiveSummary}
        </p>
      </div>

      {/* ── Owner attribution ── */}
      {report.ownerUsername && (
        <div
          className="flex items-center gap-2 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
            style={{
              background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
              color:      '#fff',
            }}
          >
            {(report.ownerUsername[0] ?? 'D').toUpperCase()}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Researched by{' '}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              @{report.ownerUsername}
            </span>{' '}
            using DeepDive AI
          </span>
        </div>
      )}
    </header>
  );
}

/* ── Micro SVG icons ─────────────────────────────────────────────────────── */

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8"  y1="2" x2="8"  y2="6"/>
      <line x1="3"  y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function NewspaperIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>
    </svg>
  );
}