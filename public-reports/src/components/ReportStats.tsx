// src/components/ReportStats.tsx
// Public-Reports — Stats strip: sources, reliability, citations, source quality

import type { PublicReport } from '@/types/report';
import { computeTrustSummary, getScoreColor, getScoreLabel } from '@/lib/sourceTrustScorer';

interface ReportStatsProps {
  report: PublicReport;
}

function getReliabilityColor(score: number): string {
  if (score >= 8) return '#10B981';
  if (score >= 6) return '#6C63FF';
  if (score >= 4) return '#F59E0B';
  return '#EF4444';
}

interface StatTileProps {
  icon:   React.ReactNode;
  value:  string;
  label:  string;
  sub?:   string;
  color?: string;
  delay?: number;
}

function StatTile({ icon, value, label, sub, color, delay = 0 }: StatTileProps) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl flex-1 min-w-0 animate-fade-in-up"
      style={{
        background:      'var(--bg-card)',
        border:          '1px solid var(--border)',
        borderTopWidth:  '2px',
        borderTopColor:  color ?? 'var(--brand, #6C63FF)',
        animationDelay:  `${delay}ms`,
      }}
    >
      <div style={{ color: color ?? 'var(--brand, #6C63FF)' }}>{icon}</div>
      <span
        className="font-extrabold text-base leading-none"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </span>
      <span
        className="text-xs text-center leading-tight"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      {sub && (
        <span className="text-xs text-center leading-none" style={{ color: color ?? 'var(--text-muted)', opacity: 0.7 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export default function ReportStats({ report }: ReportStatsProps) {
  const reliabilityColor = getReliabilityColor(report.reliabilityScore);

  // Compute avg source quality from enriched citations
  const summary       = computeTrustSummary(report.citations);
  const avgQuality    = summary.avgScore;
  const qualityColor  = avgQuality > 0 ? getScoreColor(avgQuality) : null;
  const qualityLabel  = avgQuality > 0 ? getScoreLabel(avgQuality) : null;
  const hqPct         = summary.highQualityPercent;

  return (
    <div className="flex gap-2 flex-wrap" role="region" aria-label="Report statistics">
      {/* Sources */}
      <StatTile
        icon={<GlobeIcon />}
        value={String(report.sourcesCount)}
        label="Sources"
        color="#3B82F6"
        delay={60}
      />

      {/* Citations */}
      <StatTile
        icon={<LinkIcon />}
        value={String(report.citations.length)}
        label="Citations"
        color="#6C63FF"
        delay={120}
      />

      {/* Reliability */}
      <StatTile
        icon={<ShieldIcon />}
        value={`${report.reliabilityScore}/10`}
        label="Reliability"
        color={reliabilityColor}
        delay={180}
      />

      {/* Sections */}
      <StatTile
        icon={<LayersIcon />}
        value={String(report.sections.length)}
        label="Sections"
        color="rgba(255,255,255,0.5)"
        delay={240}
      />

      {/* Source quality — only shown when citations have trust scores */}
      {qualityColor && avgQuality > 0 && (
        <StatTile
          icon={<StarIcon />}
          value={`${avgQuality}/10`}
          label={`${qualityLabel} quality`}
          sub={hqPct > 0 ? `${hqPct}% verified` : undefined}
          color={qualityColor}
          delay={300}
        />
      )}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}