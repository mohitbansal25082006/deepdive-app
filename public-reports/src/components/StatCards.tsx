// src/components/StatCards.tsx
// Public-Reports — Part 55.12 Fully Themed Infographic Stat Cards (Overlap-Proof Redesign)
// Changes from 55.11:
//   - Removed the relative/absolute hover-wash layer and flex-1 spacer div that
//     could cause text to visually collide on cards with wrapped, multi-line content
//   - Removed -webkit-line-clamp tricks entirely — every text block now just
//     wraps naturally with its own margin/line-height, so nothing is ever
//     clipped, cut off, or overlapping a neighboring row
//   - Label, value, and change rows are now three independent block-level
//     elements stacked in a plain flex column — each one's height is exactly
//     its content's height, so the card simply grows to fit
//   - Change row uses mt-auto to stay pinned to the bottom on short cards,
//     without needing an empty spacer div that could misbehave
//   - Value font-size uses fixed px steps (not clamp()) so line-height math
//     stays predictable across all card widths
//   - Bar chart row labels simplified the same way (natural wrap, fixed width)

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
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
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

  // Roughly scale font size down as value text gets longer, so very long
  // values (e.g. "$1,234,567.89" or long strings) still fit comfortably.
  // Plain px sizes (no clamp()) keep line-height math predictable so
  // nothing can collide with the row below it.
  const valueLength = String(stat.value ?? '').length;
  const valueFontSize =
    valueLength > 14 ? '18px'
      : valueLength > 9 ? '22px'
        : '28px';

  return (
    <div
      className="relative flex flex-col p-4 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderTopWidth: '3px',
        borderTopColor: color,
        animationDelay: `${index * 50}ms`,
        isolation: 'isolate',
      }}
    >
      {/* Icon + label row — own block, natural height, never clipped */}
      <div className="flex items-center gap-2 mb-2.5" style={{ minWidth: 0 }}>
        {stat.icon && (
          <span
            className="flex items-center justify-center flex-shrink-0 rounded-lg"
            style={{
              width: 22,
              height: 22,
              fontSize: '0.8rem',
              lineHeight: 1,
              background: `${color}1A`,
            }}
          >
            {stat.icon}
          </span>
        )}
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--theme-text-muted)',
            margin: 0,
            minWidth: 0,
            flex: '1 1 auto',
            lineHeight: 1.4,
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {stat.label}
        </p>
      </div>

      {/* Value — own block, wraps freely, fixed px size avoids clamp() edge cases */}
      <p
        className="font-extrabold"
        style={{
          color,
          fontSize: valueFontSize,
          lineHeight: 1.25,
          margin: '0 0 6px 0',
          minWidth: 0,
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {stat.value}
      </p>

      {/* Change row — mt-auto pins it to the bottom without needing a spacer div */}
      {stat.change && (
        <div
          className="flex items-start gap-1.5 mt-auto pt-1"
          style={{ color: changeColor, minWidth: 0 }}
        >
          {hasArrow && (
            <span style={{ flexShrink: 0, marginTop: 2 }}>
              <ArrowIcon up={isPositive} />
            </span>
          )}
          <span
            className="text-xs font-semibold"
            style={{
              lineHeight: 1.4,
              minWidth: 0,
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            {changeText}
          </span>
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
      <p
        className="text-sm font-bold mb-4 break-words"
        style={{ color: 'var(--theme-text-primary)', overflowWrap: 'anywhere' }}
      >
        {title}
      </p>
      <div className="space-y-2.5">
        {labels.map((label, i) => {
          const pct = Math.round((data[i] / max) * 100);
          return (
            <div key={i} className="flex items-center gap-3 group">
              <span
                className="text-xs flex-shrink-0 text-right font-medium"
                style={{
                  width: 96,
                  color: 'var(--theme-text-secondary)',
                  lineHeight: 1.4,
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}
              >
                {label}
              </span>
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--theme-background-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-80"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    boxShadow: `0 0 12px ${color}40`,
                  }}
                />
              </div>
              <span
                className="text-xs font-bold flex-shrink-0 text-right"
                style={{ color, minWidth: 32 }}
              >
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
          <p
            className="text-xs font-extrabold uppercase tracking-widest mb-3"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            📊 Key Statistics at a Glance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-stretch">
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
                <div className="min-w-0">
                  <p
                    className="text-xs font-semibold mb-0.5 break-words"
                    style={{ color: '#FFFFFF', overflowWrap: 'anywhere' }}
                  >
                    {chart.title}
                  </p>
                  <p
                    className="text-xs leading-relaxed break-words"
                    style={{ color: 'rgba(255,255,255,0.8)', overflowWrap: 'anywhere' }}
                  >
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