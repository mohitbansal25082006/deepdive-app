// Public-Reports/src/components/ReportHeader.tsx
// Part 55.9 — Fully Themed Report Header
// Part 34 update: added clickable topic tag chips (→ /topic/[tag])
// Part 56 update: clickable researcher avatar/name (→ /u/[username])
// All Part 33 behaviour preserved exactly.

import Link from 'next/link';
import type { PublicReport } from '@/types/report';

interface ReportHeaderProps {
  report: PublicReport;
}

const DEPTH_CONFIG = {
  quick: { label: 'Quick Scan', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '⚡' },
  deep: { label: 'Deep Dive', color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)', icon: '🔬' },
  expert: { label: 'Expert Mode', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '🎯' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(iso);
}

export default function ReportHeader({ report }: ReportHeaderProps) {
  const depth = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
  const dateStr = report.completedAt ?? report.createdAt;

  const hasTags = Array.isArray(report.tags) && report.tags.length > 0;

  return (
    <header className="animate-fade-in-up" style={{ animationDelay: '0.05s' }}>

      {/* ── Top meta row ── */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        {/* Depth badge */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-200 hover:scale-105"
          style={{
            color: depth.color,
            background: depth.bg,
            borderColor: depth.border,
          }}
        >
          <span>{depth.icon}</span>
          {depth.label}
        </span>

        {/* Date */}
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--theme-text-muted)' }}
          title={formatDate(dateStr)}
        >
          <CalendarIcon />
          {formatRelative(dateStr)}
        </span>

        {/* Sources count */}
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          <GlobeIcon />
          {report.sourcesCount} sources
        </span>
      </div>

      {/* ── Title ── */}
      <h1
        className="mb-5 leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
          fontWeight: 800,
          color: 'var(--theme-text-primary)',
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 hover:shadow-md"
              style={{
                background: 'var(--theme-primary)',
                border: '1px solid var(--theme-primary)',
                color: '#FFFFFF',
                textDecoration: 'none',
                boxShadow: '0 2px 8px var(--theme-primary)',
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
        className="flex items-start gap-3 p-4 rounded-xl mb-5 transition-all duration-300 hover:shadow-md"
        style={{
          background: 'var(--theme-background-elevated)',
          border: '1px solid var(--theme-border)',
        }}
      >
        <SearchIcon className="flex-shrink-0 mt-0.5" />
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--theme-text-secondary)' }}
        >
          <span style={{ color: 'var(--theme-text-primary)', fontWeight: 700 }}>
            Query:{' '}
          </span>
          &ldquo;{report.query}&rdquo;
        </p>
      </div>

      {/* ── Executive summary ── */}
      <div
        className="p-5 rounded-2xl mb-2 transition-all duration-300 hover:shadow-xl"
        style={{
          background: 'linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card))',
          border: '2px solid var(--theme-primary)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, var(--theme-primary) 0%, transparent 70%)',
            opacity: 0.06,
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                boxShadow: '0 2px 12px var(--theme-primary)',
              }}
            >
              <NewspaperIcon />
            </div>
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Executive Summary
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            {report.executiveSummary}
          </p>
        </div>
      </div>

      {/* ── Part 56: Owner attribution with clickable link ── */}
      {report.ownerUsername && (
        <div
          className="flex items-center gap-3 mt-5 pt-4"
          style={{ borderTop: '1px solid var(--theme-border)' }}
        >
          <Link
            href={`/u/${report.ownerUsername}`}
            className="flex items-center gap-3 group"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {/* Avatar - clickable with hover effects */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                color: '#FFFFFF',
                boxShadow: '0 2px 8px var(--theme-primary)',
                cursor: 'pointer',
              }}
            >
              {(report.ownerUsername[0] ?? 'D').toUpperCase()}
            </div>

            {/* Username - clickable with hover effects */}
            <span className="text-sm transition-colors duration-200 group-hover:text-[var(--theme-primary)]" style={{ color: 'var(--theme-text-muted)' }}>
              Researched by{' '}
              <span style={{ 
                color: 'var(--theme-text-primary)', 
                fontWeight: 700,
                transition: 'color 0.2s ease',
              }}
              className="group-hover:text-[var(--theme-primary)]"
              >
                @{report.ownerUsername}
              </span>{' '}
              using{' '}
              <span className="dd-text-gradient" style={{ fontWeight: 700 }}>
                DeepDive AI
              </span>
            </span>
          </Link>
        </div>
      )}

      <style>{`
        .dd-text-gradient {
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

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
    </header>
  );
}

/* ── Micro SVG icons ─────────────────────────────────────────────────────── */

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="var(--theme-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function NewspaperIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
    </svg>
  );
}