// src/components/SourcesList.tsx
// Public-Reports — Citations list with trust tier badges

import type { Citation, SourceTrustScore } from '@/types/report';

interface SourcesListProps {
  citations: Citation[];
}

const TIER_CONFIG: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Authoritative', color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)'  },
  2: { label: 'Credible',      color: '#6C63FF', bg: 'rgba(108,99,255,0.1)', border: 'rgba(108,99,255,0.3)' },
  3: { label: 'General',       color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  4: { label: 'Unverified',    color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
};

const BIAS_LABELS: Record<string, string> = {
  academic:    '📚 Academic',
  government:  '🏛 Gov',
  financial:   '💰 Finance',
  technical:   '⚙️ Technical',
  center:      '⚖️ Center',
  left:        '◀ Left',
  right:       '▶ Right',
  unknown:     '',
};

function TrustBadge({ score }: { score: SourceTrustScore }) {
  const tier   = TIER_CONFIG[score.tier] ?? TIER_CONFIG[4];
  const biasLabel = BIAS_LABELS[score.bias] ?? '';

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
      {/* Tier badge */}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
        style={{
          color:       tier.color,
          background:  tier.bg,
          borderColor: tier.border,
        }}
      >
        <span>{score.isVerified ? '✓' : '○'}</span>
        {tier.label}
      </span>

      {/* Score */}
      <span
        className="text-xs font-semibold"
        style={{ color: tier.color }}
      >
        {score.credibilityScore.toFixed(1)}/10
      </span>

      {/* Bias */}
      {biasLabel && (
        <span
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {biasLabel}
        </span>
      )}

      {/* Tags */}
      {score.tags.slice(0, 2).map(tag => (
        <span
          key={tag}
          className="text-xs px-1.5 py-0.5 rounded-md"
          style={{
            background: 'var(--bg-elevated)',
            color:      'var(--text-muted)',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// Trust distribution mini-bar
function TrustBar({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  const tiers = [1, 2, 3, 4];
  const counts = tiers.map(t =>
    citations.filter(c => (c.trustScore?.tier ?? 4) === t).length
  );
  const total   = citations.length;
  const pcts    = counts.map(c => Math.round((c / total) * 100));
  const colors  = ['#10B981', '#6C63FF', '#F59E0B', 'rgba(255,255,255,0.2)'];
  const labels  = ['Authoritative', 'Credible', 'General', 'Unverified'];

  return (
    <div className="mb-4">
      {/* Bar */}
      <div
        className="flex h-2 rounded-full overflow-hidden mb-2"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {tiers.map((_, i) =>
          pcts[i] > 0 ? (
            <div
              key={i}
              style={{ width: `${pcts[i]}%`, background: colors[i], transition: 'width 0.5s ease' }}
            />
          ) : null
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {tiers.map((_, i) =>
          counts[i] > 0 ? (
            <span key={i} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: colors[i], display: 'inline-block' }} />
              {counts[i]} {labels[i]}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

export default function SourcesList({ citations }: SourcesListProps) {
  if (citations.length === 0) return null;

  // Sort by trust tier (best first)
  const sorted = [...citations].sort((a, b) => {
    const ta = a.trustScore?.tier ?? 4;
    const tb = b.trustScore?.tier ?? 4;
    if (ta !== tb) return ta - tb;
    return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
  });

  const avgScore =
    sorted.length > 0
      ? Math.round(
          sorted.reduce((s, c) => s + (c.trustScore?.credibilityScore ?? 5), 0)
          / sorted.length * 10,
        ) / 10
      : null;

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(108,99,255,0.15)' }}
          >
            <LinkIcon />
          </div>
          <h3
            className="text-xs font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {citations.length} Sources · Sorted by Trust
          </h3>
        </div>

        {avgScore !== null && (
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border"
            style={{
              color:       avgScore >= 7 ? '#10B981' : avgScore >= 5 ? '#6C63FF' : '#F59E0B',
              background:  avgScore >= 7 ? 'rgba(16,185,129,0.1)' : avgScore >= 5 ? 'rgba(108,99,255,0.1)' : 'rgba(245,158,11,0.1)',
              borderColor: avgScore >= 7 ? 'rgba(16,185,129,0.3)' : avgScore >= 5 ? 'rgba(108,99,255,0.3)' : 'rgba(245,158,11,0.3)',
            }}
          >
            Avg {avgScore}/10
          </span>
        )}
      </div>

      {/* Distribution bar */}
      <TrustBar citations={sorted} />

      {/* Citation cards */}
      <div className="space-y-2">
        {sorted.map((citation, i) => {
          const tier = TIER_CONFIG[citation.trustScore?.tier ?? 4];

          return (
            <a
              key={citation.id ?? i}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl transition-all hover:scale-[1.005] animate-fade-in-up"
              style={{
                background:     'var(--bg-card)',
                border:         `1px solid var(--border)`,
                borderLeftWidth: '3px',
                borderLeftColor: tier.color,
                animationDelay:  `${i * 30}ms`,
                textDecoration:  'none',
              }}
            >
              {/* Top row: number + title + external link icon */}
              <div className="flex items-start gap-2.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-extrabold mt-0.5"
                  style={{ background: tier.bg, color: tier.color }}
                >
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold leading-snug mb-1 line-clamp-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {citation.title}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--brand)' }}
                    >
                      {citation.source}
                    </span>
                    {citation.date && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        · {citation.date}
                      </span>
                    )}
                  </div>

                  {/* Trust badge */}
                  {citation.trustScore && <TrustBadge score={citation.trustScore} />}

                  {/* Snippet */}
                  <p
                    className="text-xs leading-relaxed mt-2 line-clamp-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {citation.snippet}
                  </p>
                </div>

                <ExternalLinkIcon className="flex-shrink-0 mt-1" />
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}