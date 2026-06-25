// src/components/SourcesList.tsx
// Public-Reports — Part 55.9 Fully Themed Sources List
// Full citations list matching the mobile app's Sources tab.
// Requires citations to be pre-enriched with trustScore (done server-side in page.tsx).

import type { Citation } from '@/types/report';
import {
  computeTrustSummary,
  getScoreColor,
  getScoreLabel,
  TIER_LABELS,
  TIER_COLORS,
  BIAS_LABELS,
  BIAS_COLORS,
} from '@/lib/sourceTrustScorer';

interface SourcesListProps {
  citations: Citation[];
}

// ── Trust Distribution Bar ─────────────────────────────────────────────────────

function TrustDistributionBar({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  const summary = computeTrustSummary(citations);
  const { tier1Count: t1, tier2Count: t2, tier3Count: t3, tier4Count: t4, total } = summary;
  const tiers = [t1, t2, t3, t4];
  const colors = [TIER_COLORS[1], TIER_COLORS[2], TIER_COLORS[3], TIER_COLORS[4]];
  const labels = Object.values(TIER_LABELS);

  return (
    <div className="mb-4">
      {/* Bar */}
      <div
        className="flex h-2 rounded-full overflow-hidden mb-2"
        style={{ background: 'var(--theme-background-elevated)' }}
      >
        {tiers.map((count, i) =>
          count > 0 ? (
            <div
              key={i}
              style={{
                width: `${Math.round((count / total) * 100)}%`,
                background: colors[i],
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          ) : null
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {tiers.map((count, i) =>
          count > 0 ? (
            <span
              key={i}
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: colors[i] }}
              />
              {count} {labels[i]}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// ── Summary Banner ─────────────────────────────────────────────────────────────

function TrustSummaryBanner({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  const summary = computeTrustSummary(citations);
  const { avgScore, tier1Count, tier2Count, highQualityPercent, total } = summary;
  const color = getScoreColor(avgScore);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl mb-3 transition-all duration-300 hover:shadow-md"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}30`,
      }}
    >
      {/* Shield icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 hover:scale-105"
        style={{ background: `${color}20` }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--theme-text-primary)' }}>
          Source Quality:{' '}
          <span style={{ color }}>
            {avgScore.toFixed(1)}/10 — {getScoreLabel(avgScore)}
          </span>
        </p>
        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
          {tier1Count + tier2Count} of {total} sources are{' '}
          <span style={{ color, fontWeight: 600 }}>Authoritative or Credible</span>
          {' '}({highQualityPercent}% high quality)
        </p>
      </div>
    </div>
  );
}

// ── Trust Tier Badge ───────────────────────────────────────────────────────────

interface TrustBadgeProps {
  citation: Citation;
}

function TrustBadge({ citation }: TrustBadgeProps) {
  const ts = citation.trustScore;
  if (!ts) return null;

  const tierColor = TIER_COLORS[ts.tier];
  const biasLabel = BIAS_LABELS[ts.bias] ?? '';
  const biasColor = BIAS_COLORS[ts.bias] ?? '#6B7280';
  const scoreColor = getScoreColor(ts.credibilityScore);

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
      {/* Tier badge */}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border transition-all duration-300 hover:scale-105"
        style={{
          color: tierColor,
          background: `${tierColor}15`,
          borderColor: `${tierColor}35`,
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {ts.isVerified
            ? <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>
            : <circle cx="12" cy="12" r="10" />
          }
        </svg>
        {ts.tierLabel ?? TIER_LABELS[ts.tier]}
      </span>

      {/* Score */}
      <span
        className="text-xs font-bold"
        style={{ color: scoreColor }}
      >
        {ts.credibilityScore.toFixed(1)}/10
      </span>

      {/* Bias */}
      {biasLabel && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium transition-all duration-300 hover:scale-105"
          style={{
            background: `${biasColor}15`,
            color: biasColor,
            border: `1px solid ${biasColor}30`,
          }}
        >
          {biasLabel}
        </span>
      )}

      {/* Tags (first 2) */}
      {ts.tags?.slice(0, 2).map(tag => (
        <span
          key={tag}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs"
          style={{
            background: 'var(--theme-background-elevated)',
            color: 'var(--theme-text-muted)',
            border: '1px solid var(--theme-border)',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SourcesList({ citations }: SourcesListProps) {
  if (citations.length === 0) return null;

  // Sort by trust tier (best first), then by credibility score descending
  const sorted = [...citations].sort((a, b) => {
    const ta = a.trustScore?.tier ?? 3;
    const tb = b.trustScore?.tier ?? 3;
    if (ta !== tb) return ta - tb;
    return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
  });

  const summary = computeTrustSummary(sorted);
  const avgScore = summary.avgScore;
  const scoreColor = getScoreColor(avgScore);

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--theme-primary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <h3 className="text-xs font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--theme-text-muted)' }}>
            {citations.length} Sources · Sorted by Trust
          </h3>
        </div>

        {avgScore > 0 && (
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border transition-all duration-300 hover:scale-105"
            style={{
              color: scoreColor,
              background: `${scoreColor}10`,
              borderColor: `${scoreColor}30`,
            }}
          >
            Avg {avgScore.toFixed(1)}/10 · {getScoreLabel(avgScore)}
          </span>
        )}
      </div>

      {/* Summary banner */}
      <TrustSummaryBanner citations={sorted} />

      {/* Distribution bar */}
      <TrustDistributionBar citations={sorted} />

      {/* Citation cards */}
      <div className="space-y-2">
        {sorted.map((citation, i) => {
          const tier = citation.trustScore?.tier ?? 3;
          const tierColor = TIER_COLORS[tier];

          return (
            <a
              key={citation.id ?? i}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group"
              style={{
                background: 'var(--theme-background-card)',
                border: '1px solid var(--theme-border)',
                borderLeftWidth: '3px',
                borderLeftColor: tierColor,
                animationDelay: `${i * 25}ms`,
                textDecoration: 'none',
              }}
            >
              {/* Number + title + external icon */}
              <div className="flex items-start gap-2.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-extrabold mt-0.5 transition-all duration-300 group-hover:scale-110"
                  style={{ background: `${tierColor}20`, color: tierColor }}
                >
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold leading-snug mb-1 line-clamp-2 transition-colors duration-300 group-hover:text-[var(--theme-primary)]"
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    {citation.title}
                  </p>

                  {/* Source + date */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--theme-primary)' }}>
                      {citation.source}
                    </span>
                    {citation.date && (
                      <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        · {citation.date}
                      </span>
                    )}
                  </div>

                  {/* Trust badge row */}
                  <TrustBadge citation={citation} />

                  {/* Snippet */}
                  <p
                    className="text-xs leading-relaxed mt-2 line-clamp-2"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {citation.snippet}
                  </p>
                </div>

                {/* External link icon */}
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--theme-primary)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="flex-shrink-0 mt-1 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </section>
  );
}