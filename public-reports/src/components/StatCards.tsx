// src/components/StatCards.tsx
// Public-Reports — Part 55.9 Fully Themed Infographic Stat Cards
// Redesigned to match the "trending-up" style:
//   - Colored top border per card
//   - Icon + label row
//   - Large bold value
//   - Arrow indicator + change text

import type { InfographicData, InfographicStat } from '@/types/report';

interface StatCardsProps {
  data: InfographicData;
}

const DEFAULT_COLORS = [
  '#6C63FF', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6',
];

const CHANGE_COLORS = {
  positive: 'var(--theme-success)',
  negative: 'var(--theme-error)',
  neutral: 'var(--theme-text-muted)',
};

// ── Arrow icon ────────────────────────────────────────────────────────────────

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {up
        ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
        : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>
      }
    </svg>
  );
}

// ── Single stat card ──────────────────────────────────────────────────────────

function StatCard({ stat, index }: { stat: InfographicStat; index: number }) {
  const color = stat.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  const changeColor =
    stat.changeType === 'positive' ? CHANGE_COLORS.positive
      : stat.changeType === 'negative' ? CHANGE_COLORS.negative
        : CHANGE_COLORS.neutral;

  const isPositive = stat.changeType === 'positive';
  const isNegative = stat.changeType === 'negative';
  const hasArrow = isPositive || isNegative;

  // Clean up change text — remove leading arrow characters if present
  const changeText = stat.change
    ? stat.change.replace(/^[↑↓→]\s*/, '').trim()
    : '';

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-xl"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderTopWidth: '3px',
        borderTopColor: color,
        animationDelay: `${index * 50}ms`,
      }}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-2">
        {stat.icon && <span className="text-lg leading-none">{stat.icon}</span>}
        <p
          className="text-xs font-semibold uppercase tracking-wider leading-tight flex-1 min-w-0 truncate"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          {stat.label}
        </p>
      </div>

      {/* Value */}
      <p
        className="font-extrabold leading-none"
        style={{ color, fontSize: 'clamp(1.4rem, 3.5vw, 2rem)' }}
      >
        {stat.value}
      </p>

      {/* Change row */}
      {stat.change && (
        <div className="flex items-center gap-1.5" style={{ color: changeColor }}>
          {hasArrow && <ArrowIcon up={isPositive} />}
          <span className="text-xs font-semibold leading-none">{changeText}</span>
        </div>
      )}
    </div>
  );
}

// ── Inline bar chart ──────────────────────────────────────────────────────────

function InlineBarChart({
  title,
  labels,
  data,
  color = '#6C63FF',
}: {
  title: string;
  labels: string[];
  data: number[];
  color?: string;
}) {
  const max = Math.max(...data, 1);

  return (
    <div
      className="p-4 rounded-2xl transition-all duration-300 hover:shadow-md"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
      }}
    >
      <p className="text-sm font-bold mb-4" style={{ color: 'var(--theme-text-primary)' }}>{title}</p>
      <div className="space-y-2.5">
        {labels.map((label, i) => {
          const pct = Math.round((data[i] / max) * 100);
          return (
            <div key={i} className="flex items-center gap-3 group">
              <span className="text-xs w-28 flex-shrink-0 truncate text-right font-medium"
                style={{ color: 'var(--theme-text-secondary)' }}>
                {label}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--theme-background-elevated)' }}>
                <div className="h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-80"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    boxShadow: `0 0 12px ${color}40`,
                  }} />
              </div>
              <span className="text-xs font-bold w-8 text-right flex-shrink-0" style={{ color }}>
                {data[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function StatCards({ data }: StatCardsProps) {
  const hasStats = data.stats.length > 0;
  const hasCharts = data.charts.length > 0;

  if (!hasStats && !hasCharts) return null;

  return (
    <div className="space-y-5">

      {/* Stat grid */}
      {hasStats && (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest mb-3"
            style={{ color: 'var(--theme-text-muted)' }}>
            📊 Key Statistics at a Glance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.stats.slice(0, 6).map((stat, i) => (
              <StatCard key={stat.id ?? i} stat={stat} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Bar charts */}
      {hasCharts && (
        <div className="space-y-3">
          {data.charts
            .filter(c => c.type === 'bar' && c.labels && c.datasets?.[0]?.data)
            .slice(0, 3)
            .map((chart, i) => (
              <InlineBarChart
                key={chart.id ?? i}
                title={chart.title}
                labels={chart.labels!}
                data={chart.datasets![0].data}
                color={chart.datasets![0].color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              />
            ))}

          {/* Insight callouts */}
          {data.charts
            .filter(c => c.insight)
            .slice(0, 2)
            .map((chart, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl transition-all duration-300 hover:shadow-md"
                style={{
                  background: 'var(--theme-primary)',
                  border: '1px solid var(--theme-primary)',
                }}
              >
                <span className="text-base flex-shrink-0">💡</span>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: '#FFFFFF' }}>
                    {chart.title}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    {chart.insight}
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}

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
    </div>
  );
}